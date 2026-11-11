// VOICE PAINTER: paint a picture with the pitch of your voice. A picture is shown as a dotted line
// (a slide, a hill, waves, a roof, a castle...). The brush moves from left to right, and its height
// follows the voice: a higher voice paints higher, a lower voice paints lower, and the same note
// paints a straight line. Loudness does not matter, only how high or low the voice is.
// First a short voice check: the child says "aaah" in their own voice, and that note becomes the
// middle of the picture, so every voice (a small child, a grown-up) fits.
// Each picture takes 5, 10, 15, 20 or 25 seconds of voice, level by level.
// Two ways to play (chosen on the level card):
//   Brush waits: the brush only moves while the child makes a sound, so there is time to breathe.
//   Brush keeps going: the brush moves on by itself, like music.
// Sensor mode: microphone pitch (on the device, nothing is recorded). Touch mode: drag up and down,
// the brush moves while the finger is down. Arrow keys work too.
import { W, H, sky, label, clamp, lerp, glow, star, vignette, rr, emoji } from "../kit/draw.js";
import { motes, twinkles } from "../kit/scene.js";
import { clampScore } from "../kit/results.js";

// Each picture: a line from left to right, as a height 0 (low voice) .. 1 (high voice) for x 0..1.
const tri = (x, n) => { const k = (x * n) % 1; return k < 0.5 ? k * 2 : 2 - k * 2; };
export const PICTURES = {
  flat: { emoji: "🛣️", f: () => 0.5 },
  up: { emoji: "🛝", f: (x) => 0.2 + 0.6 * x },
  down: { emoji: "⛷️", f: (x) => 0.8 - 0.6 * x },
  rainbow: { emoji: "🌈", f: (x) => 0.22 + 0.58 * Math.sin(Math.PI * x) },
  smile: { emoji: "🙂", f: (x) => 0.78 - 0.56 * Math.sin(Math.PI * x) },
  stepsUp: { emoji: "🪜", f: (x) => [0.2, 0.5, 0.8][Math.min(2, Math.floor(x * 3))] },
  waves: { emoji: "🌊", f: (x) => 0.5 + 0.27 * Math.sin(Math.PI * 2 * 2 * x) },
  roof: { emoji: "🏠", f: (x) => 0.2 + 0.6 * tri(x, 1) },
  stepsDown: { emoji: "🏔️", f: (x) => [0.8, 0.5, 0.2][Math.min(2, Math.floor(x * 3))] },
  mountains: { emoji: "⛰️", f: (x) => (x < 0.5 ? 0.2 + 0.65 * tri(x * 2, 1) : 0.2 + 0.4 * tri((x - 0.5) * 2, 1)) },
  zigzag: { emoji: "⚡", f: (x) => 0.2 + 0.6 * tri(x, 3) },
  castle: { emoji: "🏰", f: (x) => (Math.floor(x * 5) % 2 ? 0.75 : 0.3) },
  coaster: { emoji: "🎢", f: (x) => (x < 0.25 ? 0.3 : x < 0.5 ? 0.3 + 2 * (x - 0.25) : x < 0.65 ? 0.8 - 3.6 * (x - 0.5) : 0.4 + 0.2 * Math.sin(Math.PI * 2 * 2 * (x - 0.65) / 0.35)) },
  bigWaves: { emoji: "🐬", f: (x) => 0.5 + 0.34 * Math.sin(Math.PI * 2 * 3 * x) },
};

// sec: seconds of voice for each picture. range: semitones from the middle to the top (and to the
// bottom) of the picture: a small range needs only small changes of the voice. tol: how close to the
// line counts, as a part of the picture's height.
export const LEVELS = [
  { name: "First Lines", goal: "A straight road, a slide up and a slide down. 5 seconds each.", pictures: ["flat", "up", "down"], sec: 5, range: 4, tol: 0.18, settings: { pictures: ["flat", "up", "down"], sec: 5, range_semitones: 4 } },
  { name: "Hills and Smiles", goal: "A rainbow, a smile and steps going up. 10 seconds each.", pictures: ["rainbow", "smile", "stepsUp"], sec: 10, range: 4.5, tol: 0.16, settings: { pictures: ["rainbow", "smile", "stepsUp"], sec: 10, range_semitones: 4.5 } },
  { name: "Waves and Roofs", goal: "Waves, a roof and steps going down. 15 seconds each.", pictures: ["waves", "roof", "stepsDown"], sec: 15, range: 5, tol: 0.14, settings: { pictures: ["waves", "roof", "stepsDown"], sec: 15, range_semitones: 5 } },
  { name: "Mountain Path", goal: "Mountains, a zigzag and a castle. 20 seconds each.", pictures: ["mountains", "zigzag", "castle"], sec: 20, range: 6, tol: 0.12, settings: { pictures: ["mountains", "zigzag", "castle"], sec: 20, range_semitones: 6 } },
  { name: "Big Picture", goal: "A roller coaster, big waves and a zigzag. 25 seconds each.", pictures: ["coaster", "bigWaves", "zigzag"], sec: 25, range: 6, tol: 0.1, settings: { pictures: ["coaster", "bigWaves", "zigzag"], sec: 25, range_semitones: 6 } },
];

const BINS = 60;                  // the line is judged at 60 points
const CHECK_SEC = 5, CHECK_MIN = 10;
const REUSE_MS = 30 * 60 * 1000;
const DEFAULT_HZ = 250;           // the middle note if the voice check heard nothing
let lastCenter = null;            // {hz, at}: the voice check runs once per visit
export function resetVoiceCheck() { lastCenter = null; }

// Where the brush goes for a pitch: the middle note is half way up; range semitones higher is the top.
export function heightForPitch(hz, centerHz, range) {
  if (!hz || !centerHz) return null;
  return clamp(0.5 + (12 * Math.log2(hz / centerHz)) / (2 * range), 0, 1);
}

// How well a picture was painted: the share of the line's points where the paint was close enough.
// bins: the error at each point (null: not painted).
export function pictureMatch(bins, tol) {
  if (!bins.length) return 0;
  return bins.filter((e) => e != null && e <= tol).length / bins.length;
}

// A steady reading of the voice, in semitones from the middle note. A pitch detector slips now and
// then: a single reading an octave (or just far) away from the voice. Those are ignored: a reading
// an octave off is folded back, a single far reading is dropped, and a real jump of the voice (steps,
// a castle) is followed once a few readings in a row agree on it. A new sound after a pause starts
// once two readings agree. Feed it each new reading; it returns the steady value, or null.
export class PitchTrack {
  constructor({ jump = 3, agree = 3, spread = 2 } = {}) { Object.assign(this, { jump, agree, spread }); this.reset(); }
  reset() { this.est = null; this.cand = []; }
  push(st) {
    if (this.est != null) {
      for (const k of [-12, 12]) if (Math.abs(st + k - this.est) <= 1.5) st += k;   // an octave slip
      if (Math.abs(st - this.est) <= this.jump) { this.est += (st - this.est) * 0.6; this.cand = []; return this.est; }
    }
    this.cand.push(st);
    if (this.cand.length > this.agree) this.cand.shift();
    const need = this.est == null ? 2 : this.agree;
    if (this.cand.length >= need) {
      const c = this.cand.slice(-need);
      if (Math.max(...c) - Math.min(...c) <= this.spread) { this.est = [...c].sort((a, b) => a - b)[c.length >> 1]; this.cand = []; }
    }
    return this.est;
  }
}

export function scorePitch(matches, total) {
  return clampScore((matches.reduce((a, b) => a + b, 0) / Math.max(1, total)) * 100);
}

// The picture area on screen
const X0 = 170, X1 = 1170, Y0 = 150, Y1 = 590;
const xOf = (p) => lerp(X0, X1, p), yOf = (h) => lerp(Y1, Y0, h);
const HUES = ["#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", "#4dabf7", "#9775fa", "#f783ac"];

function drawStudio(c, t, li) {
  sky(c, ["#2b2d6e", "#3a2c6e", "#24406e", "#3b2a5a", "#1f3a5a"][li] || "#2b2d6e", "#141432");
  twinkles(c, t, { n: 30, bottom: H, size: 4, seed: 9 + li });
  glow(c, W / 2, H / 2, 520, "rgba(160,140,255,0.18)");
  motes(c, t, { n: 14, seed: 3 + li, rise: 4, sway: 20 });
  // the paper
  c.save(); c.shadowColor = "rgba(0,0,0,0.35)"; c.shadowBlur = 30;
  c.fillStyle = "rgba(255,252,245,0.97)"; rr(c, X0 - 50, Y0 - 50, X1 - X0 + 100, Y1 - Y0 + 100, 30); c.fill(); c.restore();
}

function drawLine(c, f, tol, alpha = 1) {
  // the band that counts, then the dotted line itself
  c.save(); c.globalAlpha = alpha;
  c.fillStyle = "rgba(124,92,255,0.10)"; c.beginPath();
  for (let i = 0; i <= 100; i++) c.lineTo(xOf(i / 100), yOf(Math.min(1, f(i / 100) + tol)));
  for (let i = 100; i >= 0; i--) c.lineTo(xOf(i / 100), yOf(Math.max(0, f(i / 100) - tol)));
  c.closePath(); c.fill();
  c.strokeStyle = "rgba(90,70,200,0.55)"; c.lineWidth = 6; c.setLineDash([2, 16]); c.lineCap = "round";
  c.beginPath(); for (let i = 0; i <= 200; i++) c.lineTo(xOf(i / 200), yOf(f(i / 200))); c.stroke();
  c.restore();
}

function drawBrush(c, x, y, t, on, good) {
  if (on) glow(c, x, y, 60, good ? "rgba(105,219,124,0.6)" : "rgba(255,212,59,0.55)");
  c.save(); c.translate(x, y); c.rotate(-0.6 + Math.sin(t * 3) * 0.05);
  c.fillStyle = "#8d5524"; rr(c, 6, -6, 70, 12, 6); c.fill();            // handle
  c.fillStyle = "#c0c0c0"; rr(c, -4, -9, 14, 18, 4); c.fill();            // metal
  c.fillStyle = on ? (good ? "#2f9e44" : "#f08c00") : "#5c5f7a";            // bristles
  c.beginPath(); c.moveTo(-4, -9); c.quadraticCurveTo(-30, 0, -4, 9); c.closePath(); c.fill();
  c.restore();
}

const def = {
  id: "pitch",
  version: "6.0.0",
  title: "Voice Painter",
  color: "#7c5cff",
  focus: "Paint pictures with a high or low voice",
  input: "mic",
  mic: { pitch: true, onDb: 8, offDb: 5, pitchSmooth: 4 },
  inputLabel: "Microphone (a higher voice paints higher)",
  touchLabel: "Drag up and down on the screen, or use the arrow keys",
  skills: ["High and low voice", "Sliding the voice up and down", "Keeping the same note"],
  howTo: [
    ["🎤", "First say “aaah” in your own voice. That note is the middle of the picture."],
    ["🐭", "Make your voice higher, like a little mouse, to paint up."],
    ["🐻", "Make your voice lower, like a big bear, to paint down."],
    ["➡️", "Keep the same note to paint a straight line. Follow the dotted line!"],
  ],
  levels: LEVELS,
  variants: [
    { id: "pace", icon: "⏸️", label: "Brush waits", note: "The brush only moves while you make a sound." },
    { id: "flow", icon: "▶️", label: "Brush keeps going", note: "The brush moves on by itself, like music." },
  ],

  drawPreview(c, li, t = 0) {
    drawStudio(c, t, li);
    const L = LEVELS[li], f = PICTURES[L.pictures[0]].f;
    drawLine(c, f, L.tol);
    c.save(); c.lineWidth = 12; c.lineCap = "round"; c.strokeStyle = "#7c5cff";
    c.beginPath(); for (let i = 0; i <= 60; i++) c.lineTo(xOf(i / 100), yOf(f(i / 100) + Math.sin(i * 0.4) * 0.02)); c.stroke(); c.restore();
    drawBrush(c, xOf(0.6), yOf(f(0.6)), t, true, true);
  },

  create(ctx) {
    const L = ctx.level;
    const sensors = ctx.mode === "sensors" && ctx.mic;
    const flow = ctx.variant === "flow";
    const reuse = sensors && lastCenter && Date.now() - lastCenter.at < REUSE_MS && !ctx.config.recalibrate;
    const g = {
      done: false,
      phase: sensors && !reuse ? "check" : "ready",
      phaseT: 0,
      center: reuse ? lastCenter.hz : DEFAULT_HZ,
      checkHz: [], checkTries: 0,
      pic: 0,
      p: 0,                 // how far along the picture the brush is, 0..1
      brushH: 0.5,
      on: false,            // painting right now
      good: false,          // on the line right now
      strokes: [],          // [{p, h, good}] for this picture
      bins: new Array(BINS).fill(null),
      matches: [],          // per picture 0..1
      byPicture: {},
      voiceT: 0, playT: 0, silentT: 0, whisperT: 0,
      lowHz: null, highHz: null,
      revealT: 0,
      range: L.range, tol: L.tol,
      track: new PitchTrack(), pushT: 0, quietRun: 0,
    };
    if (reuse) ctx.event("voice_check_reused", { center_hz: Math.round(g.center) });
    // Easier after 2 pictures painted poorly: a wider band and a smaller range of notes needed.
    // Harder after 2 good pictures: a narrower band.
    g.adaptive = ctx.makeAdaptive({ upAfter: 2, downAfter: 2 });
    const retune = () => {
      g.tol = g.adaptive.scale(L.tol, 0.2, -0.12);
      g.range = g.adaptive.scale(L.range, -0.12, 0);
    };
    const picture = () => PICTURES[L.pictures[g.pic]];
    const name = (id) => ctx.t("pic_" + id);

    g.onPointer = (type, x, y) => { if (ctx.mode === "touch" && (type === "down" || ctx.pointer.down)) g.touchH = clamp((Y1 - y) / (Y1 - Y0), 0, 1); };
    g.start = () => { if (g.phase === "check") ctx.say("pitchCheck"); else ctx.say("pitchReady", { p: name(L.pictures[0]) }); };

    const startPicture = () => {
      g.phase = "ready"; g.phaseT = 0; g.p = 0; g.strokes = []; g.bins = new Array(BINS).fill(null); g.brushH = 0.5;
      ctx.say("pitchReady", { p: name(L.pictures[g.pic]) });
    };

    const finishPicture = () => {
      const id = L.pictures[g.pic];
      const m = pictureMatch(g.bins, g.tol);
      g.matches.push(m);
      g.byPicture[id] = Math.round(m * 100);
      ctx.event("picture_done", { picture: id, match_pct: Math.round(m * 100), tol: Math.round(g.tol * 100) / 100, range: Math.round(g.range * 10) / 10 });
      if (m >= 0.6) { g.adaptive.success(ctx.time); ctx.sfx.success(); ctx.praise(W / 2, 200); } else { g.adaptive.miss(ctx.time); ctx.sfx.soft(); }
      ctx.fx.burst(W / 2, H / 2, { n: 30, colors: HUES });
      retune();
      g.phase = "reveal"; g.phaseT = 0;
    };

    g.update = (dt) => {
      g.phaseT += dt;
      const mic = ctx.mic;
      if (g.phase === "check") {
        // the clock waits while the game itself speaks
        if (mic && mic.selfSound) { g.phaseT -= dt; return; }
        if (mic && mic.periodic && mic.steadyVoice && mic.pitchHz) g.checkHz.push(mic.pitchHz);
        if (g.phaseT > CHECK_SEC || g.checkHz.length >= CHECK_MIN * 3) {
          if (g.checkHz.length >= CHECK_MIN) {
            const s = [...g.checkHz].sort((a, b) => a - b);
            g.center = s[Math.floor(s.length / 2)];
            lastCenter = { hz: g.center, at: Date.now() };
            ctx.event("voice_check", { center_hz: Math.round(g.center), samples: g.checkHz.length });
            ctx.sfx.success();
            startPicture();
          } else if (g.checkTries === 0) {
            g.checkTries = 1; g.checkHz = []; g.phaseT = 0; ctx.sfx.soft(); ctx.say("calAgain");
            ctx.event("voice_check_retry", {});
          } else {
            ctx.event("voice_check", { center_hz: DEFAULT_HZ, samples: g.checkHz.length, standard: true });
            startPicture();
          }
        }
        return;
      }
      if (g.phase === "ready") { if (g.phaseT > 1.6) { g.phase = "paint"; g.phaseT = 0; } return; }
      if (g.phase === "reveal") {
        if (g.phaseT > 2.2) {
          g.pic++;
          if (g.pic >= L.pictures.length) { g.done = true; return; }
          startPicture();
        }
        return;
      }

      // ---- painting ----
      g.playT += dt;
      let want = null, on = false;
      if (sensors) {
        const voice = (mic.voiced || mic.speech) && !mic.selfSound;
        if (voice && mic.periodic && mic.pitchHz) {
          g.quietRun = 0;
          // one reading every 50 ms, as often as the microphone measures the pitch
          g.pushT += dt;
          if (g.pushT >= 0.045 || g.track.est == null) { g.pushT = 0; g.track.push(12 * Math.log2(mic.pitchHz / g.center)); }
          const st = g.track.est;
          if (st != null) {
            on = true; want = clamp(0.5 + st / (2 * g.range), 0, 1);
            const hz = g.center * Math.pow(2, st / 12);   // the steady pitch, not a slipped reading
            g.lowHz = g.lowHz == null ? hz : Math.min(g.lowHz, hz);
            g.highHz = g.highHz == null ? hz : Math.max(g.highHz, hz);
          }
        } else {
          if (voice && !mic.selfSound) g.whisperT += dt;
          // a pause: the next sound may start anywhere
          g.quietRun += dt; if (g.quietRun > 0.35) g.track.reset();
        }
      } else {
        if (ctx.keys.has("ArrowUp")) g.touchH = clamp((g.touchH ?? g.brushH) + dt * 0.8, 0, 1);
        if (ctx.keys.has("ArrowDown")) g.touchH = clamp((g.touchH ?? g.brushH) - dt * 0.8, 0, 1);
        on = ctx.pointer.down || ctx.keys.has("ArrowUp") || ctx.keys.has("ArrowDown") || ctx.keys.has(" ") || ctx.keys.has("ArrowRight");
        want = g.touchH ?? g.brushH;
      }
      if (want != null) g.brushH = lerp(g.brushH, want, Math.min(1, dt * 9));
      g.on = on;
      if (on) { g.voiceT += dt; g.silentT = 0; } else g.silentT += dt;
      if (on || flow) g.p = Math.min(1, g.p + dt / L.sec);
      const target = picture().f(g.p);
      const err = Math.abs(g.brushH - target);
      g.good = on && err <= g.tol;
      if (on) {
        const b = Math.min(BINS - 1, Math.floor(g.p * BINS));
        g.bins[b] = g.bins[b] == null ? err : Math.min(g.bins[b], err);
        const last = g.strokes[g.strokes.length - 1];
        if (!last || g.p - last.p > 0.002 || Math.abs(g.brushH - last.h) > 0.01) g.strokes.push({ p: g.p, h: g.brushH, good: g.good, gap: !last || g.p - last.p > 0.03 });
      }
      if (g.p >= 1) finishPicture();
    };

    g.draw = (c) => {
      const tm = ctx.anim;
      drawStudio(c, tm, ctx.levelIndex);
      const pic = picture();
      if (!pic) return;
      drawLine(c, pic.f, g.tol, g.phase === "reveal" ? 0.4 : 1);
      // the paint: rainbow colours, and a glow where it was on the line
      c.save(); c.lineCap = "round"; c.lineJoin = "round";
      for (let i = 1; i < g.strokes.length; i++) {
        const a = g.strokes[i - 1], b = g.strokes[i];
        if (b.gap) continue;
        c.strokeStyle = HUES[Math.floor(b.p * HUES.length * 2) % HUES.length]; c.lineWidth = b.good ? 16 : 10; c.globalAlpha = b.good ? 1 : 0.55;
        c.beginPath(); c.moveTo(xOf(a.p), yOf(a.h)); c.lineTo(xOf(b.p), yOf(b.h)); c.stroke();
      }
      c.restore();
      // the voice meter on the left: mouse at the top, bear at the bottom
      const mx = 80;
      c.save(); c.fillStyle = "rgba(255,255,255,0.18)"; rr(c, mx - 14, Y0, 28, Y1 - Y0, 14); c.fill(); c.restore();
      label(c, "🐭", mx, Y0 - 34, { size: 40, shadow: false });
      label(c, "🐻", mx, Y1 + 36, { size: 40, shadow: false });
      if (g.phase === "paint" || g.phase === "ready") {
        const ty = yOf(pic.f(g.p));
        c.save(); c.strokeStyle = "rgba(255,255,255,0.8)"; c.lineWidth = 4; c.beginPath(); c.moveTo(mx - 22, ty); c.lineTo(mx + 22, ty); c.stroke(); c.restore();
        c.save(); c.fillStyle = g.good ? "#69db7c" : g.on ? "#ffd43b" : "rgba(255,255,255,0.5)"; c.beginPath(); c.arc(mx, yOf(g.brushH), 16, 0, Math.PI * 2); c.fill(); c.restore();
        drawBrush(c, xOf(g.p), yOf(g.brushH), ctx.time, g.on, g.good);
        // where to go next: higher, lower or the same
        if (g.phase === "paint") {
          const ahead = pic.f(Math.min(1, g.p + 0.06)) - g.brushH;
          const key = ahead > g.tol * 0.8 ? "pitchHigher" : ahead < -g.tol * 0.8 ? "pitchLower" : "pitchSame";
          const hint = sensors && g.silentT > 2.5 && !flow ? ctx.t("pitchMakeSound") : sensors && g.whisperT > 2 && !g.on ? ctx.t("pitchNoWhisper") : ctx.t(key);
          c.save(); c.fillStyle = "rgba(255,255,255,0.93)"; rr(c, W / 2 - 260, 24, 520, 64, 32); c.fill(); c.restore();
          label(c, hint, W / 2, 56, { size: 30, color: "#2b2d42", shadow: false, weight: 800 });
        }
      }
      // the picture's name, and a star for every picture finished
      label(c, `${pic.emoji} ${ctx.t("pic_" + L.pictures[g.pic])}`, X0 + 10, Y0 - 22, { size: 28, color: "#2b2d42", shadow: false, align: "left", weight: 800 });
      for (let k = 0; k < L.pictures.length; k++) {
        const x = X1 - 20 - (L.pictures.length - 1 - k) * 44;
        if (k < g.matches.length) star(c, x, Y0 - 24, 16, g.matches[k] >= 0.6 ? "#ffd43b" : "#ced4da", 0);
        else { c.save(); c.fillStyle = k === g.pic ? "#7c5cff" : "rgba(43,45,66,0.25)"; c.beginPath(); c.arc(x, Y0 - 24, 9, 0, Math.PI * 2); c.fill(); c.restore(); }
      }
      if (g.phase === "ready") {
        label(c, ctx.t("pitchGetReady"), W / 2, H / 2, { size: 54, color: "#5a46c8", shadow: false, weight: 800 });
      } else if (g.phase === "reveal") {
        const k = clamp(g.phaseT / 0.5, 0, 1);
        // the picture pops up on a white circle
        const sz = Math.round(48 + k * 72);
        c.save(); c.fillStyle = "rgba(255,255,255,0.92)"; c.shadowColor = "rgba(0,0,0,0.2)"; c.shadowBlur = 24;
        c.beginPath(); c.arc(W / 2, H / 2, sz * 0.85, 0, Math.PI * 2); c.fill(); c.restore();
        emoji(c, pic.emoji, W / 2, H / 2, sz);
      } else if (g.phase === "check") {
        c.save(); c.fillStyle = "rgba(20,20,50,0.55)"; c.fillRect(0, 0, W, H); c.restore();
        label(c, ctx.t("pitchCheck"), W / 2, H / 2 - 60, { size: 44, weight: 800 });
        const k = clamp(g.checkHz.length / CHECK_MIN, 0, 1);
        c.save(); c.fillStyle = "rgba(255,255,255,0.3)"; rr(c, W / 2 - 200, H / 2 + 10, 400, 26, 13); c.fill();
        c.fillStyle = "#69db7c"; rr(c, W / 2 - 200, H / 2 + 10, 400 * k, 26, 13); c.fill(); c.restore();
        label(c, "🎤", W / 2, H / 2 + 110, { size: 70, shadow: false });
      }
      vignette(c, 0.15);
    };

    g.hud = () => ({ progress: `${ctx.t("pictures")} ${g.matches.length}/${L.pictures.length}` });

    g.result = () => {
      const sens = ctx.mode === "sensors";
      const st = g.lowHz && g.highHz ? Math.round(12 * Math.log2(g.highHz / g.lowHz) * 10) / 10 : null;
      const avg = g.matches.length ? g.matches.reduce((a, b) => a + b, 0) / g.matches.length : 0;
      const good = g.matches.filter((m) => m >= 0.6).length;
      return {
        completed: g.matches.length >= L.pictures.length,
        score: scorePitch(g.matches, L.pictures.length),
        settings: { variant: ctx.variant || "pace" },
        metrics: {
          variant: ctx.variant || "pace",
          pictures_done: g.matches.length,
          pictures_total: L.pictures.length,
          pictures_good: good,
          accuracy_pct: Math.round(avg * 100),
          by_picture: g.byPicture,
          middle_note_hz: sens ? Math.round(g.center) : null,
          lowest_hz: sens && g.lowHz ? Math.round(g.lowHz) : null,
          highest_hz: sens && g.highHz ? Math.round(g.highHz) : null,
          pitch_range_semitones: sens ? st : null,
          voiced_time_pct: g.playT ? Math.round((g.voiceT / g.playT) * 100) : 0,
          final_band: Math.round(g.tol * 100) / 100,
          final_range_semitones: Math.round(g.range * 10) / 10,
        },
        // shown to the child: counts only
        summary: [
          { label: ctx.t("pictures"), value: `${g.matches.length}/${L.pictures.length}` },
          { label: ctx.t("pitchGood"), value: L.pictures.filter((id, i) => g.matches[i] >= 0.6).map((id) => PICTURES[id].emoji).join(" ") || "–" },
        ],
      };
    };

    return g;
  },
};

export default def;
