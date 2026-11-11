// Version 6, second round: Voice Painter (paint with the pitch of the voice), the hand pointer that
// falls back from the pointer finger to another finger or the whole hand, and the tongue measure.
import { test } from "node:test";
import assert from "node:assert/strict";

const pitch = await import("../js/games/pitch.js");
const { handPoint, StablePoint, tongueShape } = await import("../js/kit/vision.js");

function makeCtx(def, over = {}) {
  const events = [];
  return {
    W: 1280, H: 720, level: def.levels[0], levelIndex: 0, mode: "touch", mic: null, tracker: null, time: 0, anim: 0, reduced: true,
    config: {}, keys: new Set(), pointer: { x: 0, y: 0, down: false }, variant: null, faceBase: {},
    t: (k) => k, say() {}, sfx: new Proxy({}, { get: () => () => {} }), fx: { burst() {}, text() {} }, praise() {}, event: (type, d) => events.push({ type, ...d }), events, setControls() {},
    makeAdaptive: () => ({ step: 0, enabled: false, success() {}, miss() {}, scale: (v) => v, summary: () => ({}), changes: [] }),
    ...over,
  };
}

test("Voice Painter: a higher voice paints higher, the middle note paints the middle", () => {
  assert.equal(pitch.heightForPitch(250, 250, 4), 0.5);
  assert.ok(pitch.heightForPitch(300, 250, 4) > 0.5);
  assert.ok(pitch.heightForPitch(200, 250, 4) < 0.5);
  // range semitones above the middle is the top
  assert.ok(Math.abs(pitch.heightForPitch(250 * Math.pow(2, 4 / 12), 250, 4) - 1) < 1e-9);
  assert.equal(pitch.heightForPitch(1000, 250, 4), 1, "kept inside the picture");
  assert.equal(pitch.heightForPitch(null, 250, 4), null);
});

test("Voice Painter: 5, 10, 15, 20, 25 seconds, and every picture is a line inside the paper", () => {
  assert.deepEqual(pitch.LEVELS.map((l) => l.sec), [5, 10, 15, 20, 25]);
  for (const l of pitch.LEVELS) for (const id of l.pictures) {
    const f = pitch.PICTURES[id].f;
    for (let i = 0; i <= 100; i++) { const h = f(i / 100); assert.ok(h >= 0 && h <= 1, `${id} at ${i}: ${h}`); }
  }
  assert.ok(pitch.PICTURES.up.f(1) > pitch.PICTURES.up.f(0), "a slide up goes up");
  assert.ok(pitch.PICTURES.down.f(1) < pitch.PICTURES.down.f(0));
  assert.equal(pitch.PICTURES.flat.f(0.2), pitch.PICTURES.flat.f(0.8), "a straight road is one note");
  assert.equal(pitch.pictureMatch([0.01, 0.05, null, 0.3], 0.1), 0.5);
  assert.equal(pitch.scorePitch([1, 0.5], 2), 75);
  assert.deepEqual(pitch.default.variants.map((v) => v.id), ["pace", "flow"]);
});

function mockMic() {
  return { voiced: false, speech: false, periodic: false, pitchHz: null, selfSound: false, level01: 0 };
}

test("Voice Painter: the voice check finds the middle note, then the voice paints the picture", () => {
  pitch.resetVoiceCheck();
  const mic = mockMic();
  const level = { ...pitch.LEVELS[0], pictures: ["up"] };
  const g = pitch.default.create(makeCtx(pitch.default, { mode: "sensors", mic, level }));
  const run = (sec) => { for (let i = 0; i < sec * 20; i++) g.update(0.05); };
  assert.equal(g.phase, "check");
  Object.assign(mic, { voiced: true, periodic: true, pitchHz: 220 });
  run(3);
  assert.notEqual(g.phase, "check", "the check is over");
  assert.ok(Math.abs(g.center - 220) < 1, `middle note ${g.center}`);
  Object.assign(mic, { voiced: false, periodic: false, pitchHz: null });
  run(2); // get ready
  assert.equal(g.phase, "paint");
  // waits for the voice ("Brush waits")
  run(2); assert.equal(g.p, 0, "no sound, the brush waits");
  // slide the voice up, 4 semitones below to 4 above the middle, over 5 seconds: follows the slide
  for (let i = 0; i < 5 * 20 && g.phase === "paint"; i++) {
    const h = pitch.PICTURES.up.f(g.p);
    Object.assign(mic, { voiced: true, periodic: true, pitchHz: 220 * Math.pow(2, ((h - 0.5) * 2 * level.range) / 12) });
    g.update(0.05);
  }
  run(0.5);
  assert.equal(g.matches.length, 1);
  assert.ok(g.matches[0] > 0.8, `a voice sliding up paints the slide (${g.matches[0]})`);
  run(3);
  assert.ok(g.done);
  const r = g.result();
  assert.ok(r.completed && r.score > 80 && r.metrics.pitch_range_semitones > 4, JSON.stringify(r.metrics));
});

test("Voice Painter: a flat voice does not paint a slide, and the flowing brush moves on by itself", () => {
  pitch.resetVoiceCheck();
  const mic = mockMic();
  const level = { ...pitch.LEVELS[0], pictures: ["up"] };
  const g = pitch.default.create(makeCtx(pitch.default, { mode: "sensors", mic, level, variant: "flow" }));
  const run = (sec) => { for (let i = 0; i < sec * 20; i++) g.update(0.05); };
  Object.assign(mic, { voiced: true, periodic: true, pitchHz: 200 }); run(3);
  Object.assign(mic, { voiced: false, periodic: false, pitchHz: null }); run(1.7);
  run(1); assert.ok(g.p > 0.15, "the brush moves without a voice");
  Object.assign(mic, { voiced: true, periodic: true, pitchHz: 200 }); run(5);
  assert.equal(g.matches.length, 1);
  assert.ok(g.matches[0] < 0.5, `one note is not a slide (${g.matches[0]})`);
});

test("Pointing: pointer finger, else another finger, else the whole hand; no jumping on a flicker", () => {
  const tips = [0, 1, 2, 3, 4].map((i) => ({ x: i / 10, y: 0.1 }));
  const h = (fingers) => ({ fingers, tips, palm: { x: 0.5, y: 0.5 } });
  assert.deepEqual(handPoint(h([false, true, false, false, false])), { x: 0.1, y: 0.1, by: "finger", finger: 1 });
  assert.equal(handPoint(h([false, false, true, false, false])).finger, 2, "middle finger when the pointer finger is down");
  assert.equal(handPoint(h([true, false, false, false, false])).finger, 0, "the thumb works too");
  assert.equal(handPoint(h([false, false, false, false, false])).by, "hand", "a closed hand points with the whole hand");
  assert.equal(handPoint(h([false, true, false, false, false]), 1, true).by, "hand", "the grown-up setting: always the whole hand");
  const sp = new StablePoint(0.25);
  assert.equal(sp.pick({ by: "finger", finger: 1 }, 0).finger, 1);
  assert.equal(sp.pick({ by: "hand", finger: null }, 100), null, "a flicker keeps the old point");
  assert.equal(sp.pick({ by: "finger", finger: 1 }, 150).finger, 1);
  sp.pick({ by: "hand", finger: null }, 200);
  assert.equal(sp.pick({ by: "hand", finger: null }, 500).by, "hand", "a lasting change is followed");
});

test("Finger Numbers: when the level's finger is not seen, another finger or the whole hand draws", async () => {
  const numbers = await import("../js/games/numbers.js");
  assert.equal(numbers.FALLBACK_AFTER, 2);
});

test("Tongue measure: a red area below the lower lip or beside a corner, compared with the cheeks", () => {
  const lm = [];
  const P = (i, x, y) => (lm[i] = { x, y, z: 0 });
  P(13, 0.5, 0.6); P(14, 0.5, 0.62); P(17, 0.5, 0.66); P(61, 0.42, 0.61); P(291, 0.58, 0.61); P(205, 0.38, 0.5); P(425, 0.62, 0.5);
  const skin = [200, 150, 130], tongue = [210, 80, 100];
  const relaxed = tongueShape(lm, () => skin);
  assert.ok(Math.abs(relaxed.tongueDown) < 1e-9);
  const out = tongueShape(lm, (x, y) => (y > 0.67 && y < 0.72 && Math.abs(x - 0.5) < 0.05 ? tongue : skin));
  assert.ok(out.tongueDown > 0.05, `below the lip: ${out.tongueDown}`);
  // the child's right corner is on the left of the camera image
  const right = tongueShape(lm, (x, y) => (x < 0.41 && x > 0.34 && Math.abs(y - 0.61) < 0.04 ? tongue : skin));
  assert.ok(right.tongueR > 0.05 && right.tongueL < 0.01, JSON.stringify(right));
});

test("Room check: a voice during the check is not taken for the room", async () => {
  const { roomLevel } = await import("../js/kit/mic.js");
  const quietRoom = Array.from({ length: 60 }, (_, i) => -62 + (i % 5) * 0.5);
  assert.ok(Math.abs(roomLevel(quietRoom).floor - -60.5) < 1.1, "a quiet room: as before");
  assert.equal(roomLevel(quietRoom).quietMax, Infinity);
  // half the check was a child already saying "aaah", 30 dB louder
  const talking = quietRoom.map((d, i) => (i % 2 ? d + 30 : d));
  const r = roomLevel(talking);
  assert.ok(r.floor < -55, `the floor stays at the room (${r.floor})`);
  assert.ok(r.quietMax < -50, "only the quiet frames make the room's spectrum");
  assert.equal(roomLevel([]).floor, -60);
});
