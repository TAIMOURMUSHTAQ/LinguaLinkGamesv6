// FISH FEAST: face, mouth and tongue moves with the camera.
// Pip the fish copies the child's face. Each card asks for a move, held until the ring fills, or
// done a few times over (tongue out and in, head yes and no). Pip eats a treat for every move.
// Three ways to play (chosen on the level card):
//   Mixed moves: big and small moves take turns.
//   Mouth and tongue: lips, cheeks and tongue (small, careful moves).
//   Big face moves: jaw, head turns and nods, eyebrows and funny faces (happy, sad, surprised, cross).
// Every level shuffles its moves, so the same move never comes twice in a row and each move in the
// level comes once before any repeats. Later levels add new moves.
// Every move in a level is held for the same time: 5, 10, 15, 20 and 25 seconds, level by level, and
// a little reward comes every 5 seconds of a hold. Detection is forgiving: a move counts once it
// reaches the target and keeps counting until the face clearly relaxes, a camera glitch of a moment
// does not reset the hold, and a bar shows how big the move is so the child can see what to do.
// The tongue is not in the face model; it is found from the colour of the picture around the mouth
// (vision.js tongueShape), so a grown-up can also tap Done for tongue moves.
// Sensor mode: camera face tracking (on the device). Touch mode: a grown-up taps "Done" when the child
// makes the move, or "Not yet". There is no time limit in touch mode.
import { W, H, sky, label, ring, clamp, lerp, glow, rr, vignette } from "../kit/draw.js";
import { lightShafts, bubbles, fishSchool, jelly, coral, motes, sparkle } from "../kit/scene.js";
import { clampScore } from "../kit/results.js";

// thr: how big the move must be (see moveAmount), before the level's reach.
// group: "small" (lips, cheeks, tongue) or "big" (jaw, head, eyebrows, whole face).
// cycle: [A, B] a move done over and over: A, then B (null: back to rest), counted each time.
// hidden: a part of a cycle only, never asked for on its own.
export const MOVES = {
  open: { key: "openWide", thr: 0.3, color: "#ff8fab", group: "small" },
  wide: { key: "openWider", thr: 0.5, color: "#ff5d8f", group: "big" },
  smile: { key: "smile", thr: 0.32, color: "#ffd166", group: "small" },
  kiss: { key: "kiss", thr: 0.22, color: "#c77dff", group: "small" },
  oh: { key: "ohShape", thr: 0.24, color: "#9b5de5", group: "small" },
  puff: { key: "puff", thr: 0.2, color: "#4cc9f0", group: "small" },
  side: { key: "lipsSide", thr: 0.24, color: "#06d6a0", group: "small" },
  jaw: { key: "jawSide", thr: 0.22, color: "#f4a261", group: "big" },
  lipsIn: { key: "lipsIn", thr: 0.3, color: "#ef476f", group: "small" },
  tongueOut: { key: "tongueOut", thr: 0.035, color: "#ff6b9a", group: "small", tongue: true },
  tongueLeft: { key: "tongueLeft", thr: 0.035, color: "#ff85a1", group: "small", tongue: true },
  tongueRight: { key: "tongueRight", thr: 0.035, color: "#ff85a1", group: "small", tongue: true },
  tongueInOut: { key: "tongueInOut", cycle: ["tongueOut", null], color: "#ff4d8d", group: "small", tongue: true },
  tongueSides: { key: "tongueSides", cycle: ["tongueLeft", "tongueRight"], color: "#f72585", group: "small", tongue: true },
  chew: { key: "chew", cycle: ["open", null], color: "#fb8500", group: "big" },
  headLeft: { key: "headLeft", thr: 0.08, color: "#48cae4", group: "big" },
  headRight: { key: "headRight", thr: 0.08, color: "#48cae4", group: "big" },
  headDown: { key: "nodYes", thr: 0.06, color: "#0096c7", group: "big", hidden: true },
  nodYes: { key: "nodYes", cycle: ["headDown", null], color: "#0096c7", group: "big" },
  shakeNo: { key: "shakeNo", cycle: ["headLeft", "headRight"], color: "#0077b6", group: "big" },
  browsUp: { key: "browsUp", thr: 0.2, color: "#90be6d", group: "big" },
  surprised: { key: "surprisedFace", thr: 0.2, color: "#f9c74f", group: "big" },
  sad: { key: "sadFace", thr: 0.18, color: "#577590", group: "big" },
  cross: { key: "crossFace", thr: 0.2, color: "#f94144", group: "big" },
  eyesShut: { key: "eyesShut", thr: 0.45, color: "#43aa8b", group: "big" },
};

// The moves of each level, by way of playing. Each level keeps the last one's moves and adds new ones.
const grow = (steps) => steps.reduce((acc, add) => [...acc, [...(acc[acc.length - 1] || []), ...add]], []);
export const POOLS = {
  small: grow([["open", "smile", "kiss", "tongueOut", "puff"], ["oh", "tongueInOut", "side"], ["tongueLeft", "tongueRight", "lipsIn"], ["tongueSides"], []]),
  big: grow([["wide", "headLeft", "headRight", "surprised", "browsUp"], ["nodYes", "sad", "chew"], ["shakeNo", "cross", "eyesShut"], ["jaw"], []]),
};

// hold: seconds for every move in the level. reach: how big the movement must be (1 = each move's thr).
export const LEVELS = [
  { name: "Big Bites", goal: "Copy the faces: open wide, smile, tongue out and more. Hold each one for 5 seconds. 6 moves.", reps: 6, hold: 5, holdEnd: 5, reach: 0.85, treat: "🍎", settings: { reps: 6, hold_sec: 5 } },
  { name: "Happy Fish", goal: "New moves: tongue out and in, nod yes, a sad face. 10 seconds each. 7 moves.", reps: 7, hold: 10, holdEnd: 10, reach: 0.95, treat: "🍓", settings: { reps: 7, hold_sec: 10 } },
  { name: "Bubble Faces", goal: "Tongue to the sides, shake no, a cross face and more. 15 seconds each. 8 moves.", reps: 8, hold: 15, holdEnd: 15, reach: 1, treat: "🫧", settings: { reps: 8, hold_sec: 15 } },
  { name: "Silly Faces", goal: "Tongue side to side, jaw to the side and all the faces. 20 seconds each. 9 moves.", reps: 9, hold: 20, holdEnd: 20, reach: 1.05, treat: "🍉", settings: { reps: 9, hold_sec: 20 } },
  { name: "Pufferfish Party", goal: "Every move in a mixed party. 25 seconds each. 10 moves.", reps: 10, hold: 25, holdEnd: 25, reach: 1.1, treat: "🍕", settings: { reps: 10, hold_sec: 25 } },
];

// How many times a back-and-forth move is done: more on later levels (3, 4, 6, 8, 10).
export function cyclesFor(level) {
  return Math.max(3, Math.round(level.hold / 2.5));
}

// The moves of a level, in order. Deterministic, so sessions can be compared. Every move of the pool
// comes once before any comes again, never the same twice in a row; mixed play takes turns between
// a big and a small move.
export function levelMoves(li, variant = "mix", reps = null) {
  const i = clamp(li, 0, LEVELS.length - 1);
  const n = reps || LEVELS[i].reps;
  let seed = 17 + i * 31 + (variant === "small" ? 5 : variant === "big" ? 11 : 0);
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const shuffle = (l) => { const a = [...l]; for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };
  const bagOf = () => {
    if (variant === "small" || variant === "big") return shuffle(POOLS[variant][i]);
    const sm = shuffle(POOLS.small[i]), bg = shuffle(POOLS.big[i]), out = [];
    for (let k = 0; k < Math.max(sm.length, bg.length); k++) { if (bg[k]) out.push(bg[k]); if (sm[k]) out.push(sm[k]); }
    return out;
  };
  const out = [];
  let bag = [];
  while (out.length < n) {
    if (!bag.length) bag = bagOf();
    let m = bag.shift();
    if (m === out[out.length - 1] && bag.length) { bag.push(m); m = bag.shift(); }
    out.push(m);
  }
  return out;
}

const GRACE = 0.4;   // seconds a move may drop out (a blink of the camera) without losing any hold

// The hold for each move in a level: the same for every move.
export function holdFor(level, rep) {
  return level.hold;
}

// seq: a list of moves, or one of the old names.
export function moveSequence(seq, reps) {
  const named = { open: ["open"], "open-smile": ["open", "smile"], "smile-kiss": ["kiss", "smile"], all: ["open", "smile", "kiss", "puff"] };
  const l = Array.isArray(seq) ? seq : named[seq] || ["open"];
  return Array.from({ length: reps }, (_, i) => l[i % l.length]);
}

const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);
const gain = (f, b, k) => num(f[k]) - num(b[k]);

// A pout shows in two ways: the pucker and funnel shapes, and the mouth getting narrower than the
// child's relaxed mouth. Faces differ in which one shows most, so the stronger signal counts.
export function poutAmount(face, base = {}) {
  const shape = (face.pucker || 0) - (base.pucker || 0);
  const narrow = face.mouthW && base.mouthW ? ((base.mouthW - face.mouthW) / base.mouthW) * 2.2 : 0;
  return Math.max(shape, narrow);
}

// How far a move is being made, compared with the child's relaxed face (base). Each move is read
// from the face model's scores and from the shape of the face itself, and the stronger one counts.
export function moveAmount(move, f, b = {}) {
  const open = Math.max(gain(f, b, "jawOpen"), gain(f, b, "openR") * 0.9);
  const ratio = (k) => (num(b[k]) > 0 && num(f[k]) > 0 ? f[k] / b[k] - 1 : 0);
  switch (move) {
    case "open":
    case "wide":
      return open;
    case "smile":
      return Math.max(gain(f, b, "smile"), ratio("mouthW") * 2.5);
    case "kiss":
      if (gain(f, b, "jawOpen") > 0.35) return 0; // an open mouth is not a pout
      return poutAmount(f, b);
    case "oh": { // round lips with the mouth a little open
      const narrow = num(b.mouthW) ? (b.mouthW - num(f.mouthW)) / b.mouthW : 0;
      return Math.max(gain(f, b, "funnel"), open > 0.06 ? narrow * 2.2 : 0);
    }
    case "puff": {
      // lips closed, and not a smile (a smile widens the cheeks too)
      if (open > 0.15 || ratio("mouthW") > 0.08) return 0;
      return Math.max(gain(f, b, "puff") * 1.5, ratio("cheekW") * 8 + Math.max(0, gain(f, b, "cheekZ")) * 2.5);
    }
    case "side":
      return Math.max(gain(f, b, "mouthSide"), gain(f, b, "sideShift") * 4);
    case "jaw":
      return Math.max(gain(f, b, "jawSide"), gain(f, b, "jawShift") * 4.5);
    case "lipsIn":
      if (open > 0.2) return 0;
      return Math.max(gain(f, b, "lipsIn"), num(b.lipThick) ? (1 - num(f.lipThick) / b.lipThick) * 1.4 : 0);
    case "tongueOut": // the lips must be a little apart for a tongue to come out
      if (Math.max(gain(f, b, "jawOpen"), gain(f, b, "openR")) < 0.02) return 0;
      return gain(f, b, "tongueDown");
    case "tongueLeft":
      return gain(f, b, "tongueL");
    case "tongueRight":
      return gain(f, b, "tongueR");
    case "headLeft":
      return Math.max(0, -gain(f, b, "yaw"));
    case "headRight":
      return Math.max(0, gain(f, b, "yaw"));
    case "headDown":
      return Math.max(0, gain(f, b, "nod"));
    case "browsUp":
      return Math.max(gain(f, b, "browUp"), ratio("browH") * 1.2);
    case "surprised": // eyebrows up and the mouth open
      return Math.min(Math.max(gain(f, b, "browUp"), ratio("browH") * 1.2), open * 1.2);
    case "sad":
      if (gain(f, b, "smile") > 0.2) return 0;
      return Math.max(gain(f, b, "frown") * 1.5, gain(f, b, "cornerDrop") * 5);
    case "cross":
      return Math.max(gain(f, b, "browDown"), -ratio("browH") * 1.5);
    case "eyesShut":
      return gain(f, b, "blink");
    default:
      return 0; // a back-and-forth move is judged by its two parts
  }
}

// Is the move being made? held: it was being made a moment ago, so a little less is enough to keep it.
export function moveActive(move, face, base, scale = 1, held = false) {
  if (!MOVES[move].thr) return false;
  const need = MOVES[move].thr * scale * (held ? 0.7 : 1);
  return moveAmount(move, face, base) > need;
}

export function scoreMouth({ done, total }) {
  return clampScore((done / total) * 100);
}

function drawSea(c, t, li) {
  sky(c, ["#4cc9f0", "#48bfe3", "#4ea8de", "#5390d9", "#5e60ce"][li], "#073b4c");
  lightShafts(c, t, { n: 7, alpha: 0.17 });
  // the shimmering surface
  c.strokeStyle = "rgba(255,255,255,0.3)"; c.lineWidth = 4;
  for (let k = 0; k < 3; k++) { c.beginPath(); for (let x = 0; x <= W; x += 40) c.lineTo(x, 12 + k * 15 + Math.sin(x * 0.012 + t * 1.3 + k * 2) * 7); c.stroke(); }
  fishSchool(c, t, { y: 150, n: 8, speed: 44, color: "#ffffff", seed: 2 + li, s: 0.8, alpha: 0.45 });
  fishSchool(c, t, { y: 500, n: 6, speed: 62, color: "#ffd166", dir: -1, seed: 5 + li, s: 1, alpha: 0.6 });
  jelly(c, 150, 250, t, "#ff99c8", 1.05);
  jelly(c, 1190, 420, t, "#caffbf", 0.85);
  // sand and weeds
  c.fillStyle = "#f2cc8f"; c.beginPath(); c.moveTo(0, 650); c.quadraticCurveTo(640, 600, W, 650); c.lineTo(W, H); c.lineTo(0, H); c.fill();
  for (let i = 0; i < 9; i++) {
    const x = 60 + i * 145; c.strokeStyle = i % 2 ? "#2a9d8f" : "#52b788"; c.lineWidth = 10; c.lineCap = "round";
    c.beginPath(); c.moveTo(x, 660); c.quadraticCurveTo(x + Math.sin(t * 1.5 + i) * 30, 580, x + Math.sin(t + i) * 18, 520 + (i % 3) * 20); c.stroke();
  }
  coral(c, 110, 670, 1.25, t, "#ff6b6b");
  coral(c, 1200, 672, 1.4, t, "#c77dff");
  coral(c, 1030, 680, 0.85, t, "#ff9f1c");
  c.font = '44px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#000";
  c.fillText("⭐", 300, 684); c.fillText("🐚", 850, 690);
  c.save(); c.translate(((t * 22) % (W + 200)) - 100, 672 + Math.abs(Math.sin(t * 5)) * -6); c.fillText("🦀", 0, 0); c.restore();
  bubbles(c, t, { n: 16, seed: 3 + li });
  motes(c, t, { n: 16, seed: 15 + li, rise: 3, bottom: 640, size: 2.4 });
}

// Pip the fish. mouth = {open, smile, kiss, puff, oh, side, inn, tongue, shut, sad} each 0..1,
// and tongueX, turn, nod, brow each -1..1
function drawFish(c, x, y, t, mouth) {
  const m = (k) => mouth[k] || 0;
  c.save();
  c.translate(x, y + Math.sin(t * 2) * 8 + m("nod") * 26);
  c.rotate(Math.sin(t * 1.4) * 0.018 - m("nod") * 0.22);
  c.scale(1 - Math.abs(m("turn")) * 0.12, 1);
  // tail, swishing
  c.save(); c.translate(150, 0); c.rotate(Math.sin(t * 5) * 0.2);
  const tailG = c.createLinearGradient(0, 0, 110, 0);
  tailG.addColorStop(0, "#ff9f1c"); tailG.addColorStop(1, "#ff5d3a");
  c.fillStyle = tailG;
  c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(60, -40, 104, -86); c.quadraticCurveTo(84, 0, 104, 86); c.quadraticCurveTo(60, 40, 0, 0); c.closePath(); c.fill();
  c.restore();
  // body
  const g = c.createLinearGradient(0, -140, 0, 140);
  g.addColorStop(0, "#ffbf69"); g.addColorStop(1, "#ff9f1c");
  c.fillStyle = g;
  c.beginPath(); c.ellipse(0, 0, 190, 140, 0, 0, Math.PI * 2); c.fill();
  // a shine on the back, and scales
  c.fillStyle = "rgba(255,255,255,0.22)"; c.beginPath(); c.ellipse(-20, -82, 110, 34, -0.08, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "rgba(255,120,0,0.35)"; c.lineWidth = 3;
  for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(-10 + i * 42 + (k % 2) * 21, -48 + k * 44, 14, -Math.PI / 2, Math.PI / 2, true); c.stroke(); }
  // stripes
  c.fillStyle = "rgba(255,255,255,0.35)";
  c.beginPath(); c.ellipse(40, 0, 18, 120, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(100, 0, 14, 100, 0, 0, Math.PI * 2); c.fill();
  // fin
  c.fillStyle = "#ff7b00";
  c.beginPath(); c.moveTo(-10, -130); c.quadraticCurveTo(40 + Math.sin(t * 3) * 8, -205, 90, -125); c.fill();
  // side fin, paddling
  c.save(); c.translate(30, 48); c.rotate(0.5 + Math.sin(t * 6) * 0.35); c.fillStyle = "#ff7b00"; c.beginPath(); c.ellipse(26, 14, 40, 20, 0.3, 0, Math.PI * 2); c.fill(); c.restore();
  // cheeks (puff)
  const cheek = 22 + mouth.puff * 30;
  c.fillStyle = `rgba(239,71,111,${0.35 + mouth.puff * 0.2})`;
  c.beginPath(); c.arc(-95, 45, cheek, 0, Math.PI * 2); c.fill();
  // eye (it closes when the child squeezes the eyes shut, and looks where the head turns)
  const blink = Math.max(0.08, (t > 0 && Math.sin(t * 1.2) > 0.985 ? 0.1 : 1) * (1 - m("shut") * 0.92));
  const look = m("turn") * 9;
  c.fillStyle = "#fff"; c.beginPath(); c.ellipse(-80, -40, 34, 34 * blink, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#1d3557"; c.beginPath(); c.ellipse(-88 + Math.sin(t * 0.8) * 3 + look, -38, 17, 17 * blink, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#fff"; c.beginPath(); c.ellipse(-93 + Math.sin(t * 0.8) * 3 + look, -44, 6, 6 * blink, 0, 0, Math.PI * 2); c.fill();
  // eyebrow: up when surprised, down and slanted when cross
  const bw = m("brow");
  c.save(); c.strokeStyle = "#7a3e00"; c.lineWidth = 9; c.lineCap = "round";
  c.beginPath(); c.moveTo(-108, -84 - bw * 18 + (bw < 0 ? -10 * bw : 0)); c.lineTo(-54, -84 - bw * 18 + (bw < 0 ? 12 * bw : 0)); c.stroke(); c.restore();
  // mouth: it can also slide up or down the face (lips or jaw to the side)
  const mx = -160, my = 40 - (mouth.side || 0) * 22;
  c.fillStyle = "#7b2d26"; c.strokeStyle = "#c1121f"; c.lineWidth = 8; c.lineJoin = "round"; c.lineCap = "round";
  if ((mouth.inn || 0) > 0.5 || (mouth.puff > 0.5 && mouth.open < 0.2)) {
    // lips pressed together (hidden, or holding the air in)
    c.beginPath(); c.moveTo(mx - 20, my); c.lineTo(mx + 14, my); c.stroke();
  } else if ((mouth.oh || 0) > 0.5) {
    c.fillStyle = "#e5383b"; c.beginPath(); c.ellipse(mx - 4, my + 4, 20, 26, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#7b2d26"; c.beginPath(); c.ellipse(mx - 4, my + 4, 11, 16, 0, 0, Math.PI * 2); c.fill();
  } else if (mouth.kiss > 0.5) {
    c.fillStyle = "#e5383b"; c.beginPath(); c.ellipse(mx - 6, my, 16, 20, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#7b2d26"; c.beginPath(); c.ellipse(mx - 6, my, 6, 8, 0, 0, Math.PI * 2); c.fill();
  } else {
    const open = 6 + Math.max(mouth.open, m("tongue") * 0.3) * 70;
    const wide = 38 + mouth.smile * 26;
    const curve = (mouth.smile - m("sad")) * 14;   // corners up for a smile, down for a sad face
    c.beginPath();
    c.moveTo(mx - wide / 2, my - curve);
    c.quadraticCurveTo(mx, my - 8, mx + wide / 2, my - curve);
    c.quadraticCurveTo(mx, my + open, mx - wide / 2, my - curve);
    c.closePath(); c.fill(); c.stroke();
    if (mouth.open > 0.4) { c.fillStyle = "#ff8fab"; c.beginPath(); c.ellipse(mx, my + open * 0.55, wide * 0.25, open * 0.18, 0, 0, Math.PI * 2); c.fill(); }
  }
  // tongue: out of the mouth, and up or down the face for left and right
  if (m("tongue") > 0.05) {
    const tl = m("tongue"), tx = mx - 16 - tl * 34, ty = my + 10 + m("tongueX") * 26;
    c.fillStyle = "#ff6b9a"; c.strokeStyle = "#d63a6a"; c.lineWidth = 4;
    c.beginPath(); c.ellipse(tx, ty, 14 + tl * 16, 12, m("tongueX") * 0.5, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = "rgba(214,58,106,0.6)"; c.beginPath(); c.moveTo(tx + 10, ty); c.lineTo(tx - 6 - tl * 8, ty); c.stroke();
  }
  c.restore();
}

function arrow(c, x, y, dir) {
  c.save(); c.translate(x, y); c.scale(dir, 1); c.strokeStyle = "#2b2d42"; c.lineWidth = 5; c.lineCap = "round";
  c.beginPath(); c.moveTo(-10, 0); c.lineTo(10, 0); c.moveTo(3, -7); c.lineTo(10, 0); c.lineTo(3, 7); c.stroke(); c.restore();
}

// Little face icon on the cue card showing the move to copy.
function drawCueIcon(c, x, y, move, t = 0) {
  c.save(); c.translate(x, y);
  const puffed = move === "puff";
  c.fillStyle = "#ffe0b5"; c.beginPath(); c.ellipse(0, 0, puffed ? 50 : 44, 44, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#2b2d42"; c.beginPath(); c.arc(-15, -10, 5, 0, Math.PI * 2); c.arc(15, -10, 5, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "#9d0208"; c.fillStyle = "#9d0208"; c.lineWidth = 5; c.lineCap = "round";
  const wob = Math.sin(t * 3) * 3;
  if (move === "open") { c.beginPath(); c.ellipse(0, 18, 12, 16, 0, 0, Math.PI * 2); c.fill(); }
  else if (move === "wide") { c.beginPath(); c.ellipse(0, 20, 15, 22, 0, 0, Math.PI * 2); c.fill(); }
  else if (move === "smile") { c.beginPath(); c.arc(0, 8, 18, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke(); }
  else if (move === "kiss") { c.beginPath(); c.arc(0, 18, 7, 0, Math.PI * 2); c.stroke(); }
  else if (move === "oh") { c.lineWidth = 6; c.beginPath(); c.ellipse(0, 20, 9, 13, 0, 0, Math.PI * 2); c.stroke(); }
  else if (move === "side") { c.beginPath(); c.moveTo(4 + wob, 20); c.lineTo(22 + wob, 16); c.stroke(); c.beginPath(); c.moveTo(-30, 18); c.lineTo(-20, 18); c.moveTo(-26, 14); c.lineTo(-30, 18); c.lineTo(-26, 22); c.stroke(); }
  else if (move === "jaw") { c.fillStyle = "#ffd29d"; c.beginPath(); c.ellipse(10 + wob, 30, 22, 12, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(-6 + wob, 18); c.lineTo(14 + wob, 18); c.stroke(); }
  else if (move === "lipsIn") { c.lineWidth = 3; c.beginPath(); c.moveTo(-12, 18); c.lineTo(12, 18); c.stroke(); }
  else if (MOVES[move] && MOVES[move].tongue) {
    // open mouth with the tongue: down, to one side, in and out, or side to side
    c.beginPath(); c.ellipse(0, 18, 12, 9, 0, 0, Math.PI * 2); c.fill();
    const k = (Math.sin(t * 4) + 1) / 2;
    let tx = 0, ty = 30;
    if (move === "tongueLeft") { tx = -18; ty = 20; } else if (move === "tongueRight") { tx = 18; ty = 20; }
    else if (move === "tongueSides") { tx = (k - 0.5) * 40; ty = 20; } else if (move === "tongueInOut") ty = 18 + k * 14;
    c.fillStyle = "#ff6b9a"; c.beginPath(); c.ellipse(tx, ty, 9, 10, 0, 0, Math.PI * 2); c.fill();
    if (move === "tongueLeft" || move === "tongueRight") arrow(c, tx * 2.2, ty, Math.sign(tx));
  }
  else if (move === "headLeft" || move === "headRight" || move === "shakeNo" || move === "nodYes") {
    c.beginPath(); c.arc(0, 12, 14, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke();
    if (move === "headLeft") arrow(c, -58, 0, -1); else if (move === "headRight") arrow(c, 58, 0, 1);
    else if (move === "shakeNo") { arrow(c, -58, 0, -1); arrow(c, 58, 0, 1); }
    else { c.save(); c.translate(0, -58); c.rotate(Math.PI / 2); arrow(c, 0, 0, 1); c.restore(); c.save(); c.translate(0, 58); c.rotate(Math.PI / 2); arrow(c, 0, 0, -1); c.restore(); }
  }
  else if (move === "browsUp" || move === "surprised" || move === "cross") {
    const up = move === "cross" ? -1 : 1;
    c.lineWidth = 5; c.beginPath();
    c.moveTo(-24, -24 - up * 6 + (up < 0 ? -4 : 0)); c.lineTo(-8, -24 - up * 6 + (up < 0 ? 4 : 0));
    c.moveTo(8, -24 - up * 6 + (up < 0 ? 4 : 0)); c.lineTo(24, -24 - up * 6 + (up < 0 ? -4 : 0)); c.stroke();
    if (move === "surprised") { c.beginPath(); c.ellipse(0, 20, 9, 13, 0, 0, Math.PI * 2); c.fill(); }
    else if (move === "cross") { c.beginPath(); c.arc(0, 30, 14, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke(); }
    else { c.beginPath(); c.moveTo(-10, 20); c.lineTo(10, 20); c.stroke(); }
  }
  else if (move === "sad") { c.beginPath(); c.arc(0, 32, 16, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke(); c.fillStyle = "#4cc9f0"; c.beginPath(); c.ellipse(-16, 4 + (t * 20) % 14, 3, 5, 0, 0, Math.PI * 2); c.fill(); }
  else if (move === "eyesShut") { c.fillStyle = "#ffe0b5"; c.fillRect(-24, -18, 48, 16); c.lineWidth = 4; c.beginPath(); c.arc(-15, -12, 6, 0, Math.PI); c.moveTo(21, -12); c.arc(15, -12, 6, 0, Math.PI); c.stroke(); c.beginPath(); c.moveTo(-8, 20); c.lineTo(8, 20); c.stroke(); }
  else if (move === "chew") { const k = (Math.sin(t * 6) + 1) / 2; c.beginPath(); c.ellipse(0, 18, 12, 3 + k * 13, 0, 0, Math.PI * 2); c.fill(); }
  else { c.fillStyle = "rgba(239,71,111,0.6)"; c.beginPath(); c.arc(-28, 12, 15, 0, Math.PI * 2); c.arc(28, 12, 15, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(-8, 20); c.lineTo(8, 20); c.stroke(); }
  c.restore();
}

const def = {
  id: "mouth",
  version: "6.0.0",
  title: "Fish Feast",
  color: "#4cc9f0",
  focus: "Copy the faces and feed Pip the fish: mouth, tongue, head and funny faces",
  input: "face",
  inputLabel: "Camera (face, stays on this device)",
  touchLabel: "A grown-up taps Done when the child makes the move",
  skills: ["Open wide", "Smile and pout", "Tongue moves", "Head turns and nods", "Funny faces"],
  howTo: [
    ["🙂", "Look at the screen with your face relaxed for a moment."],
    ["🃏", "The card shows a face. Make the same face."],
    ["⏳", "Hold it until the ring is full. Some moves you do again and again, like tongue out and in."],
    ["🐟", "Every move feeds Pip a treat and Pip grows."],
  ],
  levels: LEVELS,
  variants: [
    { id: "mix", icon: "🎭", label: "Mixed moves", note: "Face, mouth and tongue moves take turns." },
    { id: "small", icon: "👅", label: "Mouth and tongue", note: "Small moves of the lips, cheeks and tongue." },
    { id: "big", icon: "🙆", label: "Big face moves", note: "Jaw, head, eyebrows and funny faces." },
  ],

  drawPreview(c, li, t = 0) { drawSea(c, t, li); drawFish(c, 700, 360, t, { open: 0.6, smile: 0.3, kiss: 0, puff: li >= 2 ? 0.5 : 0 }); vignette(c, 0.2); },

  create(ctx) {
    const L = ctx.level;
    const seq = L.seq ? moveSequence(L.seq, L.reps) : levelMoves(ctx.levelIndex || 0, ctx.variant || "mix", L.reps);
    const needCycles = cyclesFor(L);
    const g = {
      done: false,
      i: 0,
      state: "cue",       // cue | eat | missed
      stateT: 0,
      hold: 0,
      results: [],        // {move, done, response_ms, hold_sec}
      firstActive: null,
      maxes: {},          // biggest amount reached for each move
      mouth: { open: 0, smile: 0, kiss: 0, puff: 0, oh: 0, side: 0, inn: 0, tongue: 0, tongueX: 0, turn: 0, nod: 0, brow: 0, shut: 0, sad: 0 },
      cyc: { stage: 0, count: 0 },  // a back-and-forth move: waiting for part A (0) or part B (1)
      bites: 0, biteAt: 0,          // little rewards, one every 5 seconds of a hold
      therapistTap: false,
      holdT: holdFor(L, 0), // the level's hold time
      thr: L.reach,        // movement size multiplier (adaptive)
      limitT: L.hold * 2 + 10, // time allowed for one move (adaptive)
      active: false, offT: 0, amount: 0,
      bestHold: 0,         // longest hold reached in this session
      bestByMove: {},      // longest hold per move
      growth: 0,           // Pip grows with every treat
      pop: 0,
      treatX: 0,
    };

    // Buttons. In camera mode a grown-up can also tap Done for tongue moves, because the tongue is
    // found from the colours of the picture and a dim room can hide it.
    const setButtons = () => {
      const controls = [];
      const move = seq[Math.min(g.i, seq.length - 1)];
      if (ctx.mode === "touch" || MOVES[move].tongue) controls.push({ id: "done", kind: "tap", tone: "go", label: "✓ " + ctx.t("done"), onTap: () => (g.therapistTap = true) });
      if (ctx.mode === "touch") controls.push({ id: "notyet", kind: "tap", label: ctx.t("notYet"), onTap: () => { if (g.state === "cue") finishRep(false, "adult_not_yet"); } });
      controls.push({ id: "skip", kind: "tap", label: ctx.t("skip"), onTap: () => { if (g.state === "cue") finishRep(false, "skipped"); } });
      ctx.setControls(controls);
    };
    setButtons();

    // Camera mode only (in touch mode a grown-up confirms, so there is nothing to tune).
    // The hold time is the level's and never changes. Easier after 2 missed moves: the movement needed
    // is 15% smaller and there is 25% more time. Harder after 3 moves in a row: 10% bigger movement.
    g.adaptive = ctx.makeAdaptive({ enabled: ctx.mode === "sensors", upAfter: 3, downAfter: 2 });
    const retune = () => {
      g.holdT = holdFor(L, g.i);
      g.thr = g.adaptive.scale(L.reach, -0.15, -0.1);
      g.limitT = g.adaptive.scale(L.hold * 2 + 10, 0.25, 0);
    };

    const finishRep = (ok, why) => {
      const move = seq[g.i];
      g.results.push({ move, done: ok, response_ms: ok && g.firstActive != null ? Math.round(g.firstActive * 1000) : null, hold_sec: MOVES[move].cycle ? null : Math.floor(g.hold), times: MOVES[move].cycle ? g.cyc.count : null, reason: why || null });
      ctx.event(ok ? "move_done" : "move_missed", { rep: g.i + 1, move, reason: why || null, hold_target_sec: g.holdT });
      if (ok) g.adaptive.success(ctx.time); else g.adaptive.miss(ctx.time);
      if (ok && ctx.mode !== "touch" && why !== "adult_confirmed" && !MOVES[move].cycle) {
        g.bestHold = Math.max(g.bestHold, g.holdT);
        g.bestByMove[move] = Math.max(g.bestByMove[move] || 0, g.holdT);
      }
      if (ok) { g.growth = Math.min(1, g.growth + 1 / seq.length); g.pop = 1; }
      if (ok) { ctx.sfx.success(); ctx.fx.burst(470, 400, { n: 24, colors: [MOVES[move].color, "#fff", "#ffd166"] }); if (g.results.filter((r) => r.done).length % 3 === 0) ctx.praise(640, 600); }
      else ctx.sfx.soft();
      g.state = ok ? "eat" : "missed";
      g.stateT = 0;
    };

    g.start = () => ctx.say(MOVES[seq[0]].key);

    // Pip copies the child's face: each move's amount against its target, 0..1
    const mirror = (f, b) => {
      const k = (m) => clamp(moveAmount(m, f, b) / MOVES[m].thr, 0, 1);
      const to = {
        open: Math.max(k("open") * 0.7, k("wide")), smile: k("smile"), kiss: k("kiss"), puff: k("puff"), oh: k("oh"), side: Math.max(k("side"), k("jaw")), inn: k("lipsIn"),
        tongue: Math.max(k("tongueOut"), k("tongueLeft"), k("tongueRight")), tongueX: k("tongueRight") - k("tongueLeft"),
        turn: k("headRight") - k("headLeft"), nod: k("headDown"), brow: Math.max(k("browsUp"), k("surprised")) - k("cross"), shut: k("eyesShut"), sad: k("sad"),
      };
      for (const key of Object.keys(g.mouth)) g.mouth[key] = lerp(g.mouth[key], to[key], 0.4);
    };

    // A demo of the move on Pip, so the child can copy it (touch mode, and before the camera sees a face)
    const demo = (move, tm) => {
      const p = (Math.sin(tm * 3) + 1) / 2, on = p > 0.5 ? 1 : 0;
      const z = { open: 0, smile: 0, kiss: 0, puff: 0, oh: 0, side: 0, inn: 0, tongue: 0, tongueX: 0, turn: 0, nod: 0, brow: 0, shut: 0, sad: 0 };
      const set = {
        open: { open: p }, wide: { open: p }, chew: { open: p }, smile: { smile: p }, kiss: { kiss: on }, puff: { puff: p }, oh: { oh: on }, side: { side: p }, jaw: { side: p }, lipsIn: { inn: on },
        tongueOut: { tongue: p }, tongueInOut: { tongue: p }, tongueLeft: { tongue: 1, tongueX: -p }, tongueRight: { tongue: 1, tongueX: p }, tongueSides: { tongue: 1, tongueX: p * 2 - 1 },
        headLeft: { turn: -p }, headRight: { turn: p }, shakeNo: { turn: p * 2 - 1 }, nodYes: { nod: p },
        browsUp: { brow: p }, surprised: { brow: p, open: p * 0.6 }, cross: { brow: -p }, sad: { sad: p }, eyesShut: { shut: on },
      }[move] || {};
      return { ...z, ...set };
    };

    // A back-and-forth move: part A, then part B (or back to rest), counts once.
    const cycleStep = (move, f, b) => {
      const [A, B] = MOVES[move].cycle;
      const inA = moveActive(A, f, b, g.thr, g.cyc.stage === 0 && g.active);
      const inB = B ? moveActive(B, f, b, g.thr, false) : moveAmount(A, f, b) < MOVES[A].thr * g.thr * 0.35;
      if (g.cyc.stage === 0) {
        g.amount = moveAmount(A, f, b) / (MOVES[A].thr * g.thr);
        if (inA) { g.cyc.stage = 1; if (g.firstActive == null) g.firstActive = g.stateT; }
      } else {
        g.amount = B ? moveAmount(B, f, b) / (MOVES[B].thr * g.thr) : 1 - moveAmount(A, f, b) / (MOVES[A].thr * g.thr);
        if (inB) { g.cyc.stage = 0; g.cyc.count++; ctx.sfx.chime(g.cyc.count); ctx.fx.burst(470, 400, { n: 8, speed: 120, colors: [MOVES[move].color, "#fff"] }); }
      }
      g.active = g.cyc.stage === 1;
      g.hold = (g.cyc.count / needCycles) * g.holdT;   // the ring shows the count
    };

    g.update = (dt) => {
      g.stateT += dt;
      g.pop = Math.max(0, g.pop - dt * 2);
      const move = seq[g.i];
      let seen = true;
      if (ctx.mode === "sensors" && ctx.tracker) {
        const f = ctx.tracker.face, b = ctx.faceBase;
        seen = f.present;
        if (f.present) {
          for (const m of Object.keys(MOVES)) if (MOVES[m].thr && !MOVES[m].hidden) g.maxes[m] = Math.max(g.maxes[m] || 0, moveAmount(m, f, b));
          mirror(f, b);
          if (g.state === "cue") {
            if (MOVES[move].cycle) cycleStep(move, f, b);
            else {
              g.amount = moveAmount(move, f, b) / (MOVES[move].thr * g.thr);
              g.active = moveActive(move, f, b, g.thr, g.active);
            }
          }
        }
      } else if (g.state === "cue") {
        g.mouth = demo(move, g.stateT);
      }

      if (g.state === "cue") {
        if (g.therapistTap) {
          // a grown-up saw the move (touch mode, or a tongue move in camera mode)
          g.therapistTap = false; if (g.firstActive == null) g.firstActive = g.stateT; g.hold = g.holdT; finishRep(true, "adult_confirmed");
        } else if (ctx.mode === "touch") {
          // waits for the grown-up, with no time limit
        } else if (!seen) {
          // face out of view: the clock stops, so the camera can never fail a child
          g.stateT -= dt;
        } else if (MOVES[move].cycle) {
          if (g.cyc.count >= needCycles) finishRep(true);
        } else {
          if (g.active) { g.offT = 0; if (g.firstActive == null) g.firstActive = g.stateT; g.hold += dt; }
          else { g.offT += dt; if (g.offT > GRACE) g.hold = Math.max(0, g.hold - dt * 0.6); }
          // a little reward every 5 seconds of a long hold, so the wait never feels empty
          const bite = Math.floor(g.hold / 5);
          if (g.holdT > 5 && bite > g.biteAt && g.hold < g.holdT) { g.biteAt = bite; g.bites++; ctx.sfx.chime(bite + 1); ctx.fx.burst(300, 410, { n: 10, speed: 140, colors: ["#fff", "#ffd166", MOVES[move].color] }); ctx.fx.text(`${bite * 5}s ⭐`, 300, 330, "#fff"); }
          if (g.hold >= g.holdT) finishRep(true);
        }
        if (g.state === "cue" && ctx.mode !== "touch" && g.stateT > g.limitT) finishRep(false, "time");
      } else if (g.stateT > (g.state === "eat" ? 1.7 : 1.3)) {
        g.i++;
        if (g.i >= seq.length) { g.done = true; return; }
        g.state = "cue"; g.stateT = 0; g.hold = 0; g.firstActive = null; g.therapistTap = false; g.active = false; g.offT = 0; g.amount = 0;
        g.cyc = { stage: 0, count: 0 }; g.biteAt = 0;
        retune();
        setButtons();
        ctx.say(MOVES[seq[g.i]].key);
      }
    };

    g.draw = (c) => {
      const tm = ctx.anim;
      drawSea(c, tm, ctx.levelIndex);
      const move = seq[Math.min(g.i, seq.length - 1)];
      // treat drifting toward Pip's mouth
      const tx = g.state === "eat" ? lerp(250, 470, Math.min(1, g.stateT * 2)) : 250 + Math.sin(ctx.time * 2) * 10;
      if (g.state !== "eat" || g.stateT < 0.5) {
        // the treat swells while the child holds the move
        const k = g.state === "cue" ? clamp(g.hold / g.holdT, 0, 1) : 1;
        glow(c, tx, 410, 40 + k * 40, "rgba(255,240,150,0.7)");
        for (let q = 0; q < 5; q++) { const a = ctx.anim * 2.2 + (q * Math.PI * 2) / 5; sparkle(c, tx + Math.cos(a) * (46 + k * 26), 410 + Math.sin(a) * (46 + k * 26), 8 + k * 5, "#fff", a); }
        c.save(); c.font = `${Math.round(44 + k * 46)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(L.treat, tx, 412); c.restore();
      }
      c.save(); c.translate(640, 360); { const sc = 0.82 + 0.2 * g.growth + (g.pop > 0 ? Math.sin(g.pop * Math.PI) * 0.05 : 0); c.scale(sc, sc); } c.translate(-640, -360);
      drawFish(c, 640, 360, ctx.time, g.mouth);
      c.restore();
      vignette(c, 0.18);
      // cue card
      c.save(); c.shadowColor = "rgba(0,0,0,0.2)"; c.shadowBlur = 16; c.fillStyle = "rgba(255,255,255,0.92)"; rr(c, 860, 60, 380, 150, 26); c.fill(); c.restore();
      drawCueIcon(c, 935, 135, move, ctx.anim);
      label(c, ctx.t(MOVES[move].key), 1100, 116, { size: 26, color: "#2b2d42", shadow: false });
      const cyc = !!MOVES[move].cycle;
      label(c, cyc ? ctx.t("timesN", { n: needCycles }) : `${ctx.t("hold")} ${g.holdT}s`, 1100, 160, { size: 22, color: "#5c5f7a", shadow: false, weight: 500 });
      if (ctx.mode !== "touch") {
        // the big ring: whole seconds held of seconds asked for, or times done of times asked for
        ring(c, 1120, 300, 62, g.hold / g.holdT, { color: MOVES[move].color, width: 14, track: "rgba(255,255,255,0.4)" });
        label(c, cyc ? `${g.cyc.count}/${needCycles}` : `${Math.floor(Math.min(g.hold, g.holdT))}s`, 1120, 300, { size: 32, weight: 800 });
        // how big the move is right now, against the target line
        if (g.state === "cue") {
          const bx = 1040, by = 390, bw = 160, k = clamp(g.amount / 1.25, 0, 1);
          c.save(); c.fillStyle = "rgba(255,255,255,0.45)"; rr(c, bx, by, bw, 18, 9); c.fill();
          c.fillStyle = g.active ? "#06d6a0" : "#ffd166"; rr(c, bx, by, Math.max(18, bw * k), 18, 9); c.fill();
          c.fillStyle = "#2b2d42"; c.fillRect(bx + bw / 1.25 - 2, by - 5, 4, 28); c.restore();
        }
      }
      // rep dots
      for (let k = 0; k < seq.length; k++) {
        const r = g.results[k];
        c.fillStyle = r ? (r.done ? "#06d6a0" : "rgba(255,255,255,0.35)") : k === g.i ? "#ffd166" : "rgba(255,255,255,0.6)";
        c.beginPath(); c.arc(640 - (seq.length - 1) * 16 + k * 32, 680, 10, 0, Math.PI * 2); c.fill();
      }
      if (ctx.mode === "sensors" && ctx.tracker && !ctx.tracker.face.present) label(c, ctx.t("moveCloser"), W / 2, 60, { size: 30 });
    };

    g.hud = () => ({ progress: `${ctx.t("reps")} ${g.results.filter((r) => r.done).length}/${seq.length}` });

    g.result = () => {
      const done = g.results.filter((r) => r.done).length;
      const byMove = {};
      for (const r of g.results) {
        const m = (byMove[r.move] ||= { done: 0, total: 0, response_ms: [] });
        m.total++; if (r.done) { m.done++; if (r.response_ms != null) m.response_ms.push(r.response_ms); }
      }
      for (const m of Object.values(byMove)) { m.avg_response_ms = m.response_ms.length ? Math.round(m.response_ms.reduce((a, b) => a + b, 0) / m.response_ms.length) : null; delete m.response_ms; }
      const sensors = ctx.mode === "sensors";
      const r2 = (v) => Math.round((v || 0) * 100) / 100;
      return {
        completed: g.i >= seq.length,
        score: scoreMouth({ done, total: seq.length }),
        metrics: {
          moves_done: done,
          moves_total: seq.length,
          hold_target_sec: L.hold,
          hold_final_target_sec: L.hold,
          longest_hold_sec: sensors ? g.bestHold : null,
          longest_hold_by_move: sensors ? g.bestByMove : null,
          by_move: byMove,
          skipped: g.results.filter((r) => r.reason === "skipped").length,
          confirmed_by: sensors ? "camera" : "adult",
          max_jaw_open: sensors ? r2(g.maxes.open) : null,
          max_smile: sensors ? r2(g.maxes.smile) : null,
          max_lip_round: sensors ? r2(g.maxes.kiss) : null,
          max_cheek_puff: sensors ? r2(g.maxes.puff) : null,
          max_by_move: sensors ? Object.fromEntries(Object.entries(g.maxes).map(([k, v]) => [k, r2(v)])) : null,
          variant: ctx.variant || "mix",
          small_moves_done: g.results.filter((r) => r.done && MOVES[r.move].group === "small").length,
          big_moves_done: g.results.filter((r) => r.done && MOVES[r.move].group === "big").length,
          tongue_moves_by_adult: g.results.filter((r) => r.done && MOVES[r.move].tongue && r.reason === "adult_confirmed").length,
          times_per_back_and_forth_move: needCycles,
        },
        settings: { variant: ctx.variant || "mix", moves: seq },
        // shown to the child: counts and whole seconds only
        summary: [
          { label: ctx.t("reps"), value: `${done}/${seq.length}` },
          ...(sensors ? [{ label: ctx.t("longestHold"), value: `${Math.floor(g.bestHold)} s` }] : []),
          ...Object.entries(byMove).slice(0, 2).map(([k, v]) => ({ label: ctx.t(MOVES[k].key), value: `${v.done}/${v.total}` })),
        ],
      };
    };

    return g;
  },
};

export default def;
