// FINGER NUMBERS: writing numbers with one chosen finger (finger isolation, fine motor control and
// counting). Each level trains a different finger; only that finger's tip draws. When a number is
// finished it pops up with that many pictures and is spoken: "3. Three ducks." The last level uses
// no drawing at all: the child shows the number by holding up that many fingers, up to ten with
// two hands.
// Sensor mode: camera hand tracking (on the device). Touch mode: drag a finger on the screen, and
// the adult confirms the finger counting.
import { W, H, sky, clamp, glow, rr, label, ease } from "../kit/draw.js";
import { createTraceGame, airToScreen, closestHand } from "../kit/tracegame.js";
import { handPoint } from "../kit/vision.js";

// The level's finger draws when it is up. When it is not (not every child can hold up each finger),
// the whole hand draws at once: the middle of the hand is followed.
export const FALLBACK_AFTER = 0;
import { nebula, twinkles, shootingStar, planet } from "../kit/scene.js";

export const FINGERS = ["thumb", "index", "middle", "ring", "little"];
const NUMBER_WORDS = ["zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const THINGS = [null, ["sun", "☀️"], ["shoes", "👟"], ["ducks", "🦆"], ["cars", "🚗"], ["stars", "⭐"], ["fish", "🐟"], ["balloons", "🎈"], ["apples", "🍎"], ["flowers", "🌸"], ["birds", "🐦"]];

const numberItem = (n, count = false) => {
  const [thing, pic] = THINGS[n];
  const words = `${NUMBER_WORDS[n]} ${thing}`;
  return { ch: n, label: String(n), big: String(n), pics: Array(n).fill(pic), text: words, say: `${n}. ${words}.`, count: count ? n : 0 };
};

// finger: which finger draws. gain: lower means bigger finger and hand movements. The middle finger
// is left out on purpose: asking a child to hold it up alone is a rude gesture in many places.
export const LEVELS = [
  { name: "Pointer Finger", goal: "Use your pointer finger to write 1, 2 and 3.", items: [1, 2, 3].map((n) => numberItem(n)), finger: 1, tolerance: 78, gain: 1.6, settings: { numbers: [1, 2, 3], finger: "index" } },
  { name: "Ring Finger", goal: "Use your ring finger to write 4, 5 and 6.", items: [4, 5, 6].map((n) => numberItem(n)), finger: 3, tolerance: 72, gain: 1.45, settings: { numbers: [4, 5, 6], finger: "ring" } },
  { name: "Thumb Trail", goal: "Use your thumb to write 7, 8 and 9.", items: [7, 8, 9].map((n) => numberItem(n)), finger: 0, tolerance: 68, gain: 1.3, settings: { numbers: [7, 8, 9], finger: "thumb" } },
  { name: "Little Finger", goal: "The little finger is the hardest. Write 10, then 1, 4, 7.", items: [10, 1, 4, 7].map((n) => numberItem(n)), finger: 4, tolerance: 64, gain: 1.2, settings: { numbers: [10, 1, 4, 7], finger: "little" } },
  { name: "Show and Count", goal: "Hold up the right number of fingers, from 1 to 10. Use both hands for the big numbers!", items: [1, 3, 5, 2, 4, 6, 8, 10].map((n) => numberItem(n, true)), finger: null, tolerance: 60, gain: 1, settings: { numbers: [1, 3, 5, 2, 4, 6, 8, 10], mode: "show_fingers" } },
];

// Fingers up on all hands together.
export function fingersUp(hands) {
  return hands.reduce((a, h) => a + (h.count || 0), 0);
}

// A little hand with one finger lit, so the child knows which finger to use.
export function drawHandCue(c, x, y, finger, s = 1, color = "#ffd166", t = 0) {
  c.save(); c.translate(x, y + Math.sin(t * 2) * 3); c.scale(s, s); c.rotate(Math.sin(t * 1.5) * 0.04);
  c.fillStyle = "#ffe0b5"; c.strokeStyle = "#c98b4a"; c.lineWidth = 3;
  rr(c, -36, -6, 72, 66, 20); c.fill(); c.stroke();
  const pos = [[-52, 8, -0.9, 34], [-27, -6, -0.12, 44], [-3, -8, 0, 50], [21, -6, 0.1, 44], [42, 0, 0.3, 34]];
  pos.forEach(([fx, fy, ang, len], i) => {
    c.save(); c.translate(fx, fy); c.rotate(ang + (i === finger ? Math.sin(t * 5) * 0.09 : 0));
    if (i === finger) glow(c, 0, -len * 0.8, 36 + Math.sin(t * 5) * 6, "rgba(255,214,102,0.85)");
    c.fillStyle = i === finger ? color : "#ffe0b5";
    rr(c, -9, -len, 18, len + 8, 9); c.fill(); c.stroke();
    c.restore();
  });
  c.restore();
}

function drawStage(c, t, li) {
  sky(c, ["#240a6b", "#1f2a8a", "#23409e", "#1b5e9e", "#3a0a7a"][li], "#6a1b8f");
  nebula(c, t);
  twinkles(c, t, { n: 70, seed: 40 + li, bottom: H, size: 6 });
  shootingStar(c, t, { every: 5, seed: 12 + li });
  // planets on slow orbits, and a little rocket going round
  const a = t * 0.12;
  planet(c, 160 + Math.cos(a) * 30, 170 + Math.sin(a) * 22, 58, t, { a: "#ffd166", b: "#f3722c", ring: true });
  planet(c, 1120 + Math.cos(a * 1.4 + 2) * 26, 560 + Math.sin(a * 1.4 + 2) * 26, 44, t, { a: "#7bdff2", b: "#3a86ff" });
  planet(c, 240 + Math.sin(a * 2) * 20, 580, 28, t, { a: "#ff8fab", b: "#c9184a" });
  const ra = t * 0.35, rx = W / 2 + Math.cos(ra) * 560, ry = 350 + Math.sin(ra) * 300;
  c.save(); c.translate(rx, ry); c.rotate(ra + Math.PI); c.font = '46px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; c.textAlign = "center"; c.textBaseline = "middle"; c.rotate(-Math.PI / 4); c.fillStyle = "#000"; c.fillText("🚀", 0, 0); c.restore();
}

const def = {
  id: "numbers",
  version: "6.0.0",
  title: "Finger Numbers",
  color: "#7209b7",
  focus: "Write numbers with one finger and count on your fingers",
  input: "hands",
  maxHands: (level) => (level.finger == null ? 2 : 1),
  inputLabel: "Camera (your finger, stays on this device)",
  touchLabel: "Drag a finger along the number; the adult confirms finger counting",
  skills: ["One finger at a time", "Number shapes", "Counting"],
  howTo: [
    ["☝️", "Hold up the finger the card shows. Only that finger writes."],
    ["🟡", "Move the finger to the yellow dot to start."],
    ["✏️", "Follow the line of the number with your finger."],
    ["🖐️", "On the last level, hold up the right number of fingers."],
  ],
  levels: LEVELS,

  drawPreview(c, li, t = 0) {
    drawStage(c, t, li);
    drawHandCue(c, W - 230, 370, LEVELS[li].finger ?? -1, 2.6, "#ffd166", t);
    c.save(); c.font = '800 300px "Baloo 2", sans-serif'; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#fff"; c.fillText(["1", "4", "7", "10", "5"][li], W / 2 - 180, H / 2); c.restore();
  },

  create(ctx) {
    const L = ctx.level;
    return createTraceGame(ctx, {
      background: drawStage,
      colors: { ink: "#7209b7" },
      unitKey: "numbersUnit",
      showKey: "showFinger",
      fingerName: (i) => FINGERS[i],
      count: (cx) => fingersUp(cx.tracker.hands),
      readCursor: (cx, g) => {
        const hands = cx.tracker.hands;
        if (!hands.length) return null;
        if (L.finger == null) return null;
        const v = cx.tracker.video, aspect = v && v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 4 / 3;
        // The chosen finger draws when it is up. When it is not, the whole hand draws at once (the
        // middle of the hand). Switching waits a moment each way, so a finger that flickers up and
        // down does not make the line jump between the fingertip and the hand.
        const ready = hands.filter((x) => x.fingers[L.finger]);
        const now = cx.time;
        if (g.usePalm == null) g.usePalm = false;
        if (ready.length) { g.fingerUpT = (g.fingerUpT || 0) + (now - (g.lastNow ?? now)); g.fingerDownT = 0; }
        else { g.fingerDownT = (g.fingerDownT || 0) + (now - (g.lastNow ?? now)); g.fingerUpT = 0; }
        g.lastNow = now;
        if (cx.config.wholeHand) g.usePalm = true;
        else if (!g.usePalm && !ready.length && g.fingerDownT > 0.25) g.usePalm = true;
        else if (g.usePalm && ready.length && g.fingerUpT > 0.4) g.usePalm = false;
        if (g.usePalm) {
          const h = closestHand(hands, g.cursor, (x) => x.palm);
          const p = handPoint(h, L.finger, true);   // the middle of the hand
          return { ...airToScreen(p, g.gain, aspect), hand: h.hand, ok: true, isolated: false, other: true, note: cx.config.wholeHand ? null : cx.t("anyFingerOk") };
        }
        // the finger just went down: a moment of no point (the pen does not lift that quickly)
        if (!ready.length) return { ok: false };
        const h = closestHand(ready, g.cursor, (x) => x.tips[L.finger]);
        return { ...airToScreen(h.tips[L.finger], g.gain, aspect), hand: h.hand, ok: true, isolated: h.count === 1 };
      },
      drawExtra: (c, cx, g, it) => {
        if (g.state === "pop" || L.finger == null) return;
        // which finger, top corner
        c.save(); c.fillStyle = "rgba(255,255,255,0.14)"; rr(c, 1030, 110, 220, 220, 28); c.fill(); c.restore();
        drawHandCue(c, 1140, 205, L.finger, 1.15, "#ffd166", cx.anim);
        label(c, cx.t("finger_" + FINGERS[L.finger]), 1140, 302, { size: 22, weight: 700 });
      },
      drawCount: (c, cx, g, it) => {
        // the number to show, and how many fingers the camera sees
        glow(c, W / 2, 300, 250 + Math.sin(cx.anim * 3) * 20, "rgba(255,255,255,0.2)");
        const pop = cx.reduced ? 1 : 0.85 + 0.15 * ease.back(clamp(g.stateT / 0.4, 0, 1)) + Math.sin(cx.anim * 3) * 0.02;
        c.save(); c.translate(W / 2, 280); c.scale(pop, pop);
        label(c, String(it.count), 0, 0, { size: 260, weight: 800 });
        c.restore();
        const sens = cx.mode === "sensors";
        label(c, cx.t((sens ? "showFingers" : "showFingersTouch") + (it.count === 1 ? "1" : ""), { n: it.count }), W / 2, 80, { size: 34 });
        if (sens) {
          const k = clamp(g.holdCount / 1.2, 0, 1);
          c.fillStyle = "rgba(255,255,255,0.25)"; rr(c, W / 2 - 170, 480, 340, 24, 12); c.fill();
          c.fillStyle = "#06d6a0"; rr(c, W / 2 - 170, 480, 340 * k, 24, 12); c.fill();
          label(c, cx.t(g.fingersUp === 1 ? "fingersSeen1" : "fingersSeen", { n: g.fingersUp || 0 }), W / 2, 540, { size: 32, weight: 600, color: g.fingersUp === it.count ? "#b7ffe3" : "#fff" });
        }
      },
    });
  },
};

export default def;
