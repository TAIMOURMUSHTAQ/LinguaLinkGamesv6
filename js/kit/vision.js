// Camera tracking with Google MediaPipe, running fully in the browser.
// The video never leaves the device: frames are analysed and only numbers are kept.
//
// Files: vendor/mediapipe (library + WebAssembly) and models/*.task, all served with the app.
// The library and each model are loaded once per visit and then reused by every level, and the
// hub starts loading them in the background (preload), so a camera game usually starts at once.
// Only if a local file is missing do we fall back to the public CDN / Google URL.

const LIB_LOCAL = new URL("../../vendor/mediapipe/vision_bundle.js", import.meta.url).href;
const LIB_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs";
const WASM_LOCAL = new URL("../../vendor/mediapipe/wasm", import.meta.url).href;
const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

const MODELS = {
  face: { file: "face_landmarker.task", url: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", size: 3758596 },
  hands: { file: "hand_landmarker.task", url: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task", size: 7819105 },
  pose: { file: "pose_landmarker_lite.task", url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task", size: 5777746 },
};
const WASM_SIZE = 11153617;

// ---------- pure helpers (unit tested) ----------
// MediaPipe labels handedness as if the image were mirrored. We feed the raw (unmirrored) camera,
// so the label is flipped compared with the child's real hand.
export function realHand(label) {
  return label === "Left" ? "right" : "left";
}

export function blendshapeMap(categories) {
  const m = {};
  for (const c of categories || []) m[c.categoryName] = c.score;
  return {
    jawOpen: m.jawOpen || 0,
    pucker: Math.max(m.mouthPucker || 0, (m.mouthFunnel || 0) * 0.8),
    smile: ((m.mouthSmileLeft || 0) + (m.mouthSmileRight || 0)) / 2,
    puff: m.cheekPuff || 0,
    funnel: m.mouthFunnel || 0,
    mouthSide: Math.max(m.mouthLeft || 0, m.mouthRight || 0),
    jawSide: Math.max(m.jawLeft || 0, m.jawRight || 0),
    lipsIn: ((m.mouthRollLower || 0) + (m.mouthRollUpper || 0)) / 2,
    browUp: Math.max(m.browInnerUp || 0, ((m.browOuterUpLeft || 0) + (m.browOuterUpRight || 0)) / 2),
    browDown: ((m.browDownLeft || 0) + (m.browDownRight || 0)) / 2,
    frown: ((m.mouthFrownLeft || 0) + (m.mouthFrownRight || 0)) / 2,
    blink: ((m.eyeBlinkLeft || 0) + (m.eyeBlinkRight || 0)) / 2,
  };
}

// How wide the mouth is compared with the face: it gets narrower in a pout.
export function mouthWidth(lm) {
  if (!lm || !lm[61] || !lm[291] || !lm[234] || !lm[454]) return 0;
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const face = d(lm[234], lm[454]);
  return face > 0 ? d(lm[61], lm[291]) / face : 0;
}

// Shape measures from the 478 face points, in units of the distance between the outer eye corners,
// which does not move with the mouth. The face model's own "cheek puff" score hardly moves on real
// faces, so the cheeks are also measured directly: they get wider and come towards the camera.
// aspect: the camera's width over its height, because x and y are each 0..1.
export function faceShape(lm, aspect = 4 / 3) {
  const need = [0, 1, 13, 14, 17, 33, 61, 152, 187, 205, 263, 291, 411, 425];
  if (!lm || need.some((i) => !lm[i])) return null;
  const p = (i) => ({ x: lm[i].x * aspect, y: lm[i].y, z: (lm[i].z || 0) * aspect });
  const d = (a, b) => Math.hypot(p(a).x - p(b).x, p(a).y - p(b).y);
  const eye = d(33, 263);
  if (!(eye > 0.01)) return null;
  const zOf = (list) => list.reduce((s, i) => s + p(i).z, 0) / list.length;
  const midMouthX = (p(61).x + p(291).x) / 2;
  return {
    openR: d(13, 14) / eye,                                       // gap between the lips
    cheekW: (d(205, 425) + d(187, 411)) / 2 / eye,               // width of the lower cheeks
    cheekZ: (zOf([33, 263]) - zOf([205, 425, 187, 411])) / eye,  // how far the cheeks come forward
    sideShift: Math.abs(midMouthX - p(1).x) / eye,               // lips moved to one side
    jawShift: Math.abs(p(152).x - p(1).x) / eye,                 // chin moved to one side
    lipThick: (d(0, 13) + d(14, 17)) / eye,                      // how much lip shows (less when pressed in)
    ...headShape(lm, p, d, eye),
  };
}

// Head turn and nod, eyebrow height and the mouth corners, from the same points. Each is compared
// with the child's relaxed face by the game, so only changes matter.
//   yaw: + when the head turns to the child's own right (the camera image is not mirrored here, so
//        the child's right is the left of the image); nod: + when the head tips down;
//   browH: eyebrows above the eyes; cornerDrop: + when the mouth corners go down (a sad face).
function headShape(lm, p, d, eye) {
  const out = {};
  if (lm[234] && lm[454]) {
    const fw = Math.abs(p(454).x - p(234).x);
    if (fw > 0.01) out.yaw = -(p(1).x - (p(234).x + p(454).x) / 2) / fw;
  }
  const eyeY = (p(33).y + p(263).y) / 2, chinH = p(152).y - eyeY;
  if (chinH > 0.01) out.nod = (p(1).y - eyeY) / chinH;
  if (lm[105] && lm[334] && lm[159] && lm[386]) out.browH = (d(105, 159) + d(334, 386)) / 2 / eye;
  out.cornerDrop = ((p(61).y + p(291).y) / 2 - (p(13).y + p(14).y) / 2) / eye;
  return out;
}

// The tongue is not in the face model, so it is found from the colour of the picture around the
// mouth: a tongue is redder than skin. Redness (r - g) / (r + g + b) is measured in small areas below
// the lower lip and beside each mouth corner, and compared with the cheeks of the same frame, so
// the light in the room and the child's skin colour do not matter. The game then compares these
// with the child's relaxed face. px(x, y) gives [r, g, b] at a point of the image (0..1).
//   tongueDown: below the lower lip (tongue out); tongueR / tongueL: beside the child's own right
//   or left mouth corner.
export function tongueShape(lm, px) {
  const need = [13, 14, 17, 61, 291, 205, 425];
  if (!lm || need.some((i) => !lm[i])) return null;
  const red = (x0, y0, x1, y1) => {
    let s = 0, n = 0;
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) {
      const c = px(x0 + ((x1 - x0) * (i + 0.5)) / 4, y0 + ((y1 - y0) * (k + 0.5)) / 4);
      if (!c) continue;
      s += (c[0] - c[1]) / (c[0] + c[1] + c[2] + 1); n++;
    }
    return n ? s / n : 0;
  };
  const a = lm[61], b = lm[291];
  const L = a.x < b.x ? a : b, R = a.x < b.x ? b : a;   // image left and right corner
  const mw = Math.hypot(R.x - L.x, R.y - L.y);
  if (!(mw > 0.005)) return null;
  const midX = (L.x + R.x) / 2, lipY = (lm[13].y + lm[14].y) / 2, low = lm[17].y;
  const cheeks = (red(lm[205].x - mw * 0.12, lm[205].y - mw * 0.12, lm[205].x + mw * 0.12, lm[205].y + mw * 0.12)
    + red(lm[425].x - mw * 0.12, lm[425].y - mw * 0.12, lm[425].x + mw * 0.12, lm[425].y + mw * 0.12)) / 2;
  const below = red(midX - mw * 0.3, low + mw * 0.04, midX + mw * 0.3, low + mw * 0.42);
  const imgL = red(L.x - mw * 0.5, lipY - mw * 0.15, L.x - mw * 0.08, lipY + mw * 0.25);
  const imgR = red(R.x + mw * 0.08, lipY - mw * 0.15, R.x + mw * 0.5, lipY + mw * 0.25);
  // the child's right corner is on the left of the (unmirrored) camera image
  return { tongueDown: below - cheeks, tongueR: imgL - cheeks, tongueL: imgR - cheeks };
}

// Which fingers are straight, from the 21 hand landmarks: [thumb, index, middle, ring, little].
// A finger is straight when its tip is further from the wrist than its middle joint, by a margin
// that scales with the size of the hand, so it works near or far from the camera. Depth counts too,
// so a finger pointing partly towards the camera, as it does when writing in the air, still reads
// as straight. aspect: the camera's width over its height, because x and y are each 0..1.
export function fingerStates(lm, aspect = 1) {
  const d = (a, b) => Math.hypot((a.x - b.x) * aspect, a.y - b.y, ((a.z || 0) - (b.z || 0)) * aspect);
  const wrist = lm[0], palm = d(wrist, lm[9]) || 1e-6;
  const straight = [[8, 6], [12, 10], [16, 14], [20, 18]].map(([tip, pip]) => d(lm[tip], wrist) > d(lm[pip], wrist) + palm * 0.12);
  // the thumb points sideways: its tip must be well away from the side of the palm
  const thumb = d(lm[4], lm[5]) > palm * 0.55 && d(lm[4], lm[17]) > d(lm[3], lm[17]);
  return [thumb, ...straight];
}

// Where a hand points. Not every child can hold up the pointer finger, so the point falls back:
// the wanted finger if it is straight, else any straight finger (pointer, middle, ring, little,
// thumb), else the middle of the hand. by: "finger" or "hand"; finger: which one (0 thumb .. 4).
// wholeHand: always the middle of the hand.
export function handPoint(h, want = 1, wholeHand = false) {
  if (!h) return null;
  if (!wholeHand && h.fingers) {
    if (h.fingers[want]) return { x: h.tips[want].x, y: h.tips[want].y, by: "finger", finger: want };
    for (const f of [1, 2, 3, 4, 0]) if (h.fingers[f]) return { x: h.tips[f].x, y: h.tips[f].y, by: "finger", finger: f };
  }
  return { x: h.palm.x, y: h.palm.y, by: "hand", finger: null };
}

// A pointer that does not jump between a fingertip and the hand on every flicker of a finger: the
// new point is used once it has been the choice for a short moment (hold, in seconds).
export class StablePoint {
  constructor(hold = 0.25) { this.hold = hold; this.key = null; this.cand = null; this.since = 0; }
  pick(p, now) {
    if (!p) return null;
    const key = p.by + (p.finger ?? "");
    if (this.key == null) this.key = key;
    if (key === this.key) { this.cand = null; return p; }
    if (this.cand !== key) { this.cand = key; this.since = now; }
    if (now - this.since >= this.hold * 1000) { this.key = key; this.cand = null; return p; }
    return null; // keep the previous point a moment longer
  }
}

// ---------- shared loader (one per visit) ----------
const shared = { lib: null, wasmBase: WASM_LOCAL, fileset: null, tasks: {}, loading: {}, progress: {} };
const listeners = new Set();
export function onLoadProgress(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function report(kind, p) {
  shared.progress[kind] = p;
  for (const fn of listeners) { try { fn(kind, p); } catch {} }
}

async function loadLib() {
  if (shared.lib) return shared.lib;
  try { shared.lib = await import(LIB_LOCAL); shared.wasmBase = WASM_LOCAL; }
  catch { shared.lib = await import(LIB_CDN); shared.wasmBase = WASM_CDN; }
  return shared.lib;
}

// Download a file with progress. Returns a Uint8Array.
async function fetchBytes(url, expected, onBytes) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  // A compressed download reports its compressed length, but the bytes counted here are the
  // unpacked ones, so then the known unpacked size measures the progress.
  const total = r.headers.get("content-encoding") ? expected : +r.headers.get("content-length") || expected;
  if (!r.body || !r.body.getReader) { const b = new Uint8Array(await r.arrayBuffer()); onBytes(b.length, total); return b; }
  const reader = r.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onBytes(got, total);
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function modelBytes(kind, modelBase, onBytes) {
  const base = modelBase || new URL("../../models/", import.meta.url).href;
  const local = base.replace(/\/?$/, "/") + MODELS[kind].file;
  try { return await fetchBytes(local, MODELS[kind].size, onBytes); }
  catch { return fetchBytes(MODELS[kind].url, MODELS[kind].size, onBytes); }
}

// Fetch the camera engine (shared by every camera game) into the browser's cache ahead of time, so
// the first camera game only has to load its own model. Quietly does nothing if it fails.
export function warmEngine() {
  if (shared.engineWarm || shared.fileset) return shared.engineWarm;
  shared.engineWarm = Promise.all([fetch(`${WASM_LOCAL}/vision_wasm_internal.wasm`).then((r) => r.arrayBuffer()), loadLib()]).catch(() => { shared.engineWarm = null; });
  return shared.engineWarm;
}

// Load (once) the tracking model for "face", "hands" or "pose". Safe to call many times.
export function preload(kind, { modelBase = null } = {}) {
  if (shared.tasks[kind]) return Promise.resolve(shared.tasks[kind]);
  if (shared.loading[kind]) return shared.loading[kind];
  report(kind, 0.02);
  shared.loading[kind] = (async () => {
    // The WebAssembly engine is the biggest file; warm the browser cache with progress first.
    const wasmUrl = `${WASM_LOCAL}/vision_wasm_internal.wasm`;
    let wasmP = 0, modelP = 0;
    const mix = () => report(kind, Math.min(0.95, 0.05 + wasmP * 0.45 + modelP * 0.45));
    const warm = shared.fileset ? Promise.resolve() : fetchBytes(wasmUrl, WASM_SIZE, (g, t) => { wasmP = g / t; mix(); }).catch(() => {});
    const [bytes] = await Promise.all([modelBytes(kind, modelBase, (g, t) => { modelP = g / t; mix(); }), warm]);
    const { FilesetResolver, FaceLandmarker, HandLandmarker, PoseLandmarker } = await loadLib();
    if (!shared.fileset) shared.fileset = await FilesetResolver.forVisionTasks(shared.wasmBase);
    // Confidence 0.4 instead of the default 0.5: a child's hand, face or body moving quickly, or seen
    // by a phone camera in poor light, is then lost far less often. Wrong detections stay rare.
    const conf = 0.4;
    const make = (delegate) => {
      const baseOptions = { modelAssetBuffer: bytes, delegate };
      if (kind === "face") return FaceLandmarker.createFromOptions(shared.fileset, { baseOptions, runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true, minFaceDetectionConfidence: conf, minFacePresenceConfidence: conf, minTrackingConfidence: conf });
      if (kind === "pose") return PoseLandmarker.createFromOptions(shared.fileset, { baseOptions, runningMode: "VIDEO", numPoses: 1, minPoseDetectionConfidence: conf, minPosePresenceConfidence: conf, minTrackingConfidence: conf });
      shared.numHands = 2;
      return HandLandmarker.createFromOptions(shared.fileset, { baseOptions, runningMode: "VIDEO", numHands: 2, minHandDetectionConfidence: conf, minHandPresenceConfidence: conf, minTrackingConfidence: conf });
    };
    let task;
    try { task = await make("GPU"); } catch { task = await make("CPU"); }
    shared.tasks[kind] = task;
    report(kind, 1);
    return task;
  })();
  shared.loading[kind].catch(() => { delete shared.loading[kind]; report(kind, 0); });
  return shared.loading[kind];
}

export function isLoaded(kind) { return !!shared.tasks[kind]; }
export function loadProgress(kind) { return shared.progress[kind] || 0; }

// ---------- live tracker ----------
export class Tracker {
  // maxHands: how many hands to look for. The hand model searches the whole picture again on every
  // frame until it has found that many hands, so a game that needs one hand asks for one: the
  // tracking is then about twice as quick, above all on a laptop without graphics acceleration.
  constructor(kind, { modelBase = null, onProgress = () => {}, maxHands = 2 } = {}) {
    this.kind = kind;            // "face" | "hands" | "pose"
    this.maxHands = maxHands;
    this.modelBase = modelBase;
    this.onProgress = onProgress;
    this.ready = false;
    this.face = { present: false, jawOpen: 0, pucker: 0, smile: 0, puff: 0, mouthW: 0 };
    this._cost = 0;      // average ms one detection takes on this device
    this._lastRun = 0;
    // [{x, y (the point: index fingertip, else another straight finger, else the hand; see handPoint),
    //   by: "finger"|"hand", hand: "left"|"right", palm: {x, y}, tips: [5 {x, y}], fingers: [5 bool], count}]
    // in mirrored screen space 0..1
    this.wholeHand = false;   // a grown-up setting: the middle of the hand always points
    this._points = {};
    this.hands = [];
    this.pose = { present: false, points: [] }; // 33 {x, y, v} in mirrored screen space 0..1
    this._lastVideoTime = -1;
    this._lastTs = 0;
  }

  // isCancelled: lets the engine stop the start-up when the player leaves (camera is released).
  async start(isCancelled = () => false) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("no-media");
    // Ask for the camera and load the model at the same time.
    const off = onLoadProgress((k, p) => { if (k === this.kind) this.onProgress(p); });
    const modelP = preload(this.kind, { modelBase: this.modelBase });
    modelP.catch(() => {});
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } }, audio: false,
      });
      if (isCancelled()) { this.stop(); throw new Error("cancelled"); }
      this.video = document.createElement("video");
      this.video.playsInline = true;
      this.video.muted = true;
      this.video.srcObject = this.stream;
      await this.video.play();
      this.onProgress(loadProgress(this.kind));
      this.task = await modelP;
      // the model is shared by every hand game, so each game sets its own number of hands
      if (this.kind === "hands" && shared.numHands !== this.maxHands && this.task.setOptions) {
        try { await this.task.setOptions({ numHands: this.maxHands }); shared.numHands = this.maxHands; } catch {}
      }
      if (isCancelled()) { this.stop(); throw new Error("cancelled"); }
      this.ready = true;
    } finally { off(); }
  }

  update() {
    if (!this.ready || this.video.readyState < 2) return;
    if (this.video.currentTime === this._lastVideoTime) return;
    // On a slow device (a phone, a laptop without graphics acceleration) detection can take longer
    // than a screen frame. Then it runs on every second or third frame, so the game, the buttons and
    // the pause menu stay responsive instead of the page freezing.
    const now = performance.now();
    if (this._cost > 20 && now - this._lastRun < Math.min(90, this._cost * 1.6)) return;
    this._lastVideoTime = this.video.currentTime;
    // The shared model needs strictly increasing timestamps across every tracker that uses it.
    const ts = Math.max(now, this._lastTs + 1);
    this._lastTs = ts;
    const res = this.task.detectForVideo(this.video, ts);
    const took = performance.now() - now;
    this._cost = this._cost ? this._cost * 0.9 + took * 0.1 : took;
    this._lastRun = now;
    this.seenAt = now;
    if (this.kind === "face") {
      const shapes = res.faceBlendshapes && res.faceBlendshapes[0];
      const lm = res.faceLandmarks && res.faceLandmarks[0];
      const aspect = this.video.videoWidth && this.video.videoHeight ? this.video.videoWidth / this.video.videoHeight : 4 / 3;
      if (shapes) this.face = { present: true, ...blendshapeMap(shapes.categories), mouthW: mouthWidth(lm), ...(faceShape(lm, aspect) || {}), ...(this._tongue(lm) || {}) };
      else this.face = { ...this.face, present: false };
    } else if (this.kind === "pose") {
      const lm = res.landmarks && res.landmarks[0];
      // A body lost for one or two frames (a quick movement, motion blur) keeps its last position
      // for a moment, so a pose being held is not broken by the camera.
      if (lm) { this.pose = { present: true, points: lm.map((p) => ({ x: 1 - p.x, y: p.y, v: p.visibility ?? 1 })) }; this._poseAt = now; }
      else if (!(this.pose.present && now - (this._poseAt || 0) < 300)) this.pose = { present: false, points: [] };
    } else {
      const found = res.landmarks || [];
      // the same for hands: a hand missing for a moment stays where it was
      if (found.length < this.hands.length && now - (this._handsAt || 0) < 250) return;
      this._handsAt = now;
      this.hands = found.map((lm, i) => {
        const label = res.handedness && res.handedness[i] && res.handedness[i][0] ? res.handedness[i][0].categoryName : "Right";
        const fingers = fingerStates(lm, this.video.videoWidth && this.video.videoHeight ? this.video.videoWidth / this.video.videoHeight : 4 / 3);
        const h = {
          hand: realHand(label),
          palm: { x: 1 - lm[9].x, y: lm[9].y },
          knuckles: [{ x: 1 - lm[5].x, y: lm[5].y }, { x: 1 - lm[17].x, y: lm[17].y }],   // its tilt, for one-hand play
          tips: [4, 8, 12, 16, 20].map((k) => ({ x: 1 - lm[k].x, y: lm[k].y })),
          fingers, count: fingers.filter(Boolean).length,
        };
        // the point: the pointer finger, or another finger, or the whole hand (handPoint)
        const sp = (this._points[h.hand] ||= new StablePoint());
        const prev = this.hands.find((o) => o.hand === h.hand);
        const raw = handPoint(h, 1, this.wholeHand);
        const p = sp.pick(raw, now) || (prev && prev.by === "finger" && prev.finger != null && h.fingers[prev.finger] ? { ...h.tips[prev.finger], by: "finger", finger: prev.finger } : prev && prev.by === "hand" ? { ...h.palm, by: "hand", finger: null } : raw);
        return { ...h, x: p.x, y: p.y, by: p.by, finger: p.finger };
      });
    }
  }

  // Reads the picture around the mouth for tongueShape: the area is copied into a small canvas.
  _tongue(lm) {
    const v = this.video, vw = v && v.videoWidth, vh = v && v.videoHeight;
    if (!vw || !vh || !lm || !lm[61] || !lm[291] || !lm[152]) return null;
    try {
      const xs = [lm[61].x, lm[291].x, lm[205].x, lm[425].x], mw = Math.abs(lm[291].x - lm[61].x);
      const x0 = Math.max(0, Math.min(...xs) - mw * 0.6), x1 = Math.min(1, Math.max(...xs) + mw * 0.6);
      const y0 = Math.max(0, Math.min(lm[205].y, lm[425].y, lm[13].y) - mw * 0.25), y1 = Math.min(1, lm[17].y + mw * 0.5);
      if (!(x1 > x0 && y1 > y0)) return null;
      const CW = 64, CH = 48;
      if (!this._tc) { this._tc = document.createElement("canvas"); this._tc.width = CW; this._tc.height = CH; this._tcx = this._tc.getContext("2d", { willReadFrequently: true }); }
      this._tcx.drawImage(v, x0 * vw, y0 * vh, (x1 - x0) * vw, (y1 - y0) * vh, 0, 0, CW, CH);
      const data = this._tcx.getImageData(0, 0, CW, CH).data;
      const px = (x, y) => {
        const i = Math.floor(((x - x0) / (x1 - x0)) * CW), k = Math.floor(((y - y0) / (y1 - y0)) * CH);
        if (i < 0 || k < 0 || i >= CW || k >= CH) return null;
        const o = (k * CW + i) * 4;
        return [data[o], data[o + 1], data[o + 2]];
      };
      return tongueShape(lm, px);
    } catch { return null; }
  }

  // Draw a small mirrored preview so the child can see themselves.
  drawPreview(canvas) {
    if (!this.video || this.video.readyState < 2 || !canvas) return;
    const c = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    c.save();
    c.translate(w, 0);
    c.scale(-1, 1);
    c.drawImage(this.video, 0, 0, w, h);
    c.restore();
    if (this.kind === "hands") {
      for (const p of this.hands) {
        c.fillStyle = p.hand === "left" ? "#4aa3ff" : "#ff9f43";
        c.beginPath(); c.arc(p.x * w, p.y * h, 5, 0, Math.PI * 2); c.fill();
      }
    }
  }

  // Releases the camera. The model stays loaded for the next level.
  stop() {
    try { this.stream && this.stream.getTracks().forEach((t) => t.stop()); } catch {}
    try { if (this.video) this.video.srcObject = null; } catch {}
    this.ready = false;
  }
}
