// Version 6: holds of 5, 10, 15, 20 and 25 seconds, all vowels in the voice games, Fish Feast's new
// moves and puff detection, Balance Tray refills, Air Letters' alphabet levels, and whole seconds.
import { test } from "node:test";
import assert from "node:assert/strict";

const breeze = (await import("../js/games/breeze.js")).default;
const mouth = await import("../js/games/mouth.js");
const balance = await import("../js/games/balance.js");
const { faceShape, blendshapeMap } = await import("../js/kit/vision.js");
const { migrate, levelCount } = await import("../js/kit/progress.js");
const { describe, therapyChange } = await import("../js/kit/report.js");
const { VOWELS } = await import("../js/kit/vowel.js");

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

test("Hold games go 5, 10, 15, 20, 25 seconds, and Balloon Breeze uses all five vowels on every level", () => {
  assert.deepEqual(breeze.levels.map((l) => l.target), [5, 10, 15, 20, 25]);
  assert.deepEqual(mouth.LEVELS.map((l) => l.hold), [5, 10, 15, 20, 25]);
  for (const l of breeze.levels) assert.deepEqual([...l.sounds].sort(), [...VOWELS].sort(), l.name);
  for (const l of mouth.LEVELS) for (let r = 0; r < l.reps; r++) assert.equal(mouth.holdFor(l, r), l.hold, "every move in a level is held the same time");
});

test("Fish Feast: many moves, shuffled, never the same twice in a row, all of them played", () => {
  const playable = Object.keys(mouth.MOVES).filter((m) => !mouth.MOVES[m].hidden);
  assert.ok(playable.length >= 20, `${playable.length} moves`);
  for (const m of ["tongueOut", "tongueLeft", "tongueRight", "tongueInOut", "tongueSides", "headLeft", "headRight", "nodYes", "shakeNo", "sad", "surprised", "cross", "puff", "wide"]) assert.ok(mouth.MOVES[m], m);
  const used = new Set();
  for (const v of ["mix", "small", "big"]) {
    mouth.LEVELS.forEach((lv, i) => {
      const s = mouth.levelMoves(i, v);
      assert.equal(s.length, lv.reps);
      for (let k = 1; k < s.length; k++) assert.notEqual(s[k], s[k - 1], `${v} level ${i + 1}: no repeat in a row`);
      const pool = v === "mix" ? [...mouth.POOLS.small[i], ...mouth.POOLS.big[i]] : mouth.POOLS[v][i];
      assert.ok(new Set(s).size >= Math.min(pool.length, lv.reps) - 1, `${v} level ${i + 1} uses many different moves: ${s}`);
      if (v === "small") assert.ok(s.every((m) => mouth.MOVES[m].group === "small"));
      if (v === "big") assert.ok(s.every((m) => mouth.MOVES[m].group === "big"));
      s.forEach((m) => used.add(m));
    });
    // the first level already mixes at least 5 different moves
    assert.ok(new Set(mouth.levelMoves(0, v)).size >= 5, v);
  }
  for (const m of playable) assert.ok(used.has(m), `${m} is played in some level`);
  assert.deepEqual(mouth.levelMoves(2, "mix"), mouth.levelMoves(2, "mix"), "the same order every time");
  assert.deepEqual(mouth.LEVELS.map(mouth.cyclesFor), [3, 4, 6, 8, 10]);
  assert.deepEqual(mouth.default.variants.map((v) => v.id), ["mix", "small", "big"]);
});

test("Fish Feast: head turns, nods, eyebrows, moods and the tongue are measured against the relaxed face", () => {
  const base = { jawOpen: 0.02, openR: 0.02, mouthW: 0.4, smile: 0.05, yaw: 0, nod: 0.5, browH: 0.3, browUp: 0.1, browDown: 0.05, frown: 0.02, cornerDrop: 0, blink: 0.1, tongueDown: 0, tongueL: 0, tongueR: 0 };
  const on = (m, f) => mouth.moveActive(m, { ...base, ...f }, base);
  assert.ok(on("headRight", { yaw: 0.12 }) && !on("headLeft", { yaw: 0.12 }), "head to the right");
  assert.ok(on("headLeft", { yaw: -0.12 }) && !on("headRight", { yaw: -0.12 }));
  assert.ok(on("headDown", { nod: 0.58 }));
  assert.ok(on("browsUp", { browUp: 0.6 }) && on("browsUp", { browH: 0.36 }));
  assert.ok(on("surprised", { browUp: 0.6, jawOpen: 0.3 }) && !on("surprised", { browUp: 0.6 }), "surprised needs the mouth open too");
  assert.ok(on("sad", { cornerDrop: 0.05 }) && !on("sad", { cornerDrop: 0.05, smile: 0.5 }));
  assert.ok(on("cross", { browDown: 0.4 }));
  assert.ok(on("eyesShut", { blink: 0.8 }) && !on("eyesShut", { blink: 0.3 }));
  assert.ok(on("tongueOut", { tongueDown: 0.06, openR: 0.06 }), "tongue out");
  assert.ok(!on("tongueOut", { tongueDown: 0.06 }), "with the lips closed it is not a tongue");
  assert.ok(on("tongueLeft", { tongueL: 0.05 }) && !on("tongueRight", { tongueL: 0.05 }));
});

test("Fish Feast: back-and-forth moves count each time, and a grown-up can confirm a tongue move", () => {
  const base = { jawOpen: 0.02, openR: 0.02, mouthW: 0.4, yaw: 0, tongueDown: 0, tongueL: 0, tongueR: 0 };
  const tracker = { face: { present: true, ...base } };
  let controls = [];
  const level = { ...mouth.LEVELS[0], seq: ["shakeNo", "tongueOut"], reps: 2 };
  const ctx = makeCtx(mouth.default, { mode: "sensors", tracker, faceBase: base, level, setControls: (l) => (controls = l) });
  const g = mouth.default.create(ctx);
  g.start();
  const run = (sec) => { for (let i = 0; i < sec * 20; i++) g.update(0.05); };
  assert.ok(!controls.some((c) => c.id === "done"), "no Done button for head moves in camera mode");
  for (let k = 0; k < 3; k++) {
    tracker.face = { present: true, ...base, yaw: -0.15 }; run(0.4);
    tracker.face = { present: true, ...base, yaw: 0.15 }; run(0.4);
  }
  assert.equal(g.results.length, 1, "3 shakes finish the move");
  assert.ok(g.results[0].done); assert.equal(g.results[0].times, 3);
  tracker.face = { present: true, ...base }; run(2);
  assert.ok(controls.some((c) => c.id === "done"), "a Done button for tongue moves");
  controls.find((c) => c.id === "done").onTap(); run(0.1);
  assert.equal(g.results.length, 2); assert.equal(g.results[1].reason, "adult_confirmed");
});

test("Fish Feast: puffed cheeks are seen from the shape of the face, with the lips closed", () => {
  const base = { jawOpen: 0.02, openR: 0.02, mouthW: 0.4, cheekW: 1.0, cheekZ: 0, puff: 0.01, smile: 0.05 };
  const puffed = { ...base, cheekW: 1.05, cheekZ: 0.04, puff: 0.03 };
  assert.ok(mouth.moveActive("puff", puffed, base), "wider cheeks with the lips closed");
  assert.ok(mouth.moveActive("puff", { ...base, puff: 0.3 }, base), "or the face model's own puff score");
  assert.ok(!mouth.moveActive("puff", base, base), "a relaxed face is not a puff");
  assert.ok(!mouth.moveActive("puff", { ...puffed, openR: 0.3 }, base), "an open mouth holds no air");
  assert.ok(!mouth.moveActive("puff", { ...puffed, mouthW: 0.46 }, base), "a smile widens the cheeks too, but is not a puff");
});

test("Fish Feast: the other new moves, and a move keeps counting through a wobble", () => {
  const base = { jawOpen: 0.02, openR: 0.02, mouthW: 0.4, sideShift: 0.01, jawShift: 0.01, lipThick: 0.3, funnel: 0.02 };
  assert.ok(mouth.moveActive("wide", { ...base, jawOpen: 0.7 }, base));
  assert.ok(!mouth.moveActive("wide", { ...base, jawOpen: 0.4 }, base), "open is not yet very wide");
  assert.ok(mouth.moveActive("side", { ...base, sideShift: 0.1 }, base));
  assert.ok(mouth.moveActive("jaw", { ...base, jawShift: 0.08 }, base));
  assert.ok(mouth.moveActive("lipsIn", { ...base, lipThick: 0.1 }, base));
  assert.ok(mouth.moveActive("oh", { ...base, openR: 0.15, mouthW: 0.32 }, base));
  // hysteresis: 80% of the target is not enough to start, but enough to keep going
  const f = { ...base, jawOpen: 0.02 + 0.3 * 0.8 };
  assert.ok(!mouth.moveActive("open", f, base, 1, false));
  assert.ok(mouth.moveActive("open", f, base, 1, true));
  // a whole move in camera mode: 5 seconds, with a camera glitch in the middle
  const tracker = { face: { present: true, ...base } };
  const ctx = makeCtx(mouth.default, { mode: "sensors", tracker, faceBase: base, level: { ...mouth.LEVELS[0], seq: ["open", "smile"] } });
  const g = mouth.default.create(ctx);
  g.start();
  const run = (sec) => { for (let i = 0; i < sec * 20; i++) g.update(0.05); };
  tracker.face = { present: true, ...base, jawOpen: 0.6 }; run(3);
  tracker.face = { present: true, ...base }; run(0.3);   // a blink of the camera
  const kept = g.hold;
  assert.ok(kept >= 2.9, `the hold is kept through a short drop (${kept})`);
  tracker.face = { present: false }; run(10);              // face out of view: the clock stops
  assert.equal(g.results.length, 0);
  tracker.face = { present: true, ...base, jawOpen: 0.6 }; run(2.5);
  assert.equal(g.results.length, 1); assert.ok(g.results[0].done);
  assert.ok(Number.isInteger(g.results[0].hold_sec), "seconds are whole");
});

test("Face shape measures: lips apart, cheeks wider", () => {
  const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  Object.assign(lm, { 33: { x: 0.4, y: 0.4, z: 0 }, 263: { x: 0.6, y: 0.4, z: 0 }, 13: { x: 0.5, y: 0.6, z: 0 }, 14: { x: 0.5, y: 0.65, z: 0 },
    205: { x: 0.4, y: 0.55, z: -0.01 }, 425: { x: 0.6, y: 0.55, z: -0.01 }, 187: { x: 0.39, y: 0.58, z: 0 }, 411: { x: 0.61, y: 0.58, z: 0 } });
  const f = faceShape(lm, 1);
  assert.ok(Math.abs(f.openR - 0.25) < 1e-9);
  assert.ok(f.cheekW > 1 && f.cheekZ > 0);
  assert.equal(faceShape(null), null);
  assert.equal(blendshapeMap([{ categoryName: "mouthLeft", score: 0.4 }]).mouthSide, 0.4);
});

test("Balance Tray: a fruit that falls off is replaced quickly, and one lost hand does not stop the game", () => {
  const L = balance.LEVELS[1];
  const tracker = { hands: [{ palm: { x: 0.3, y: 0.3 } }, { palm: { x: 0.7, y: 0.75 } }] }; // a steep tilt
  const g = balance.default.create(makeCtx(balance.default, { mode: "sensors", tracker, level: L }));
  g.start();
  let lostAt = null, refillAt = null, t = 0;
  for (let i = 0; i < 20 * 10 && refillAt == null; i++) {
    const lost = g.lost, total = g.total;
    g.update(0.05); t += 0.05;
    if (lostAt == null && g.lost > lost) lostAt = t;
    if (lostAt != null && g.total > total && t > lostAt) refillAt = t;
  }
  assert.ok(lostAt != null, "the steep tray loses a fruit");
  assert.ok(refillAt != null && refillAt - lostAt <= 1.0, `a new fruit comes within a second (${lostAt} -> ${refillAt})`);
  // one hand drops out of the picture for a moment: the game carries on
  tracker.hands = [{ palm: { x: 0.3, y: 0.5 } }];
  for (let i = 0; i < 10; i++) g.update(0.05);
  assert.equal(g.handsMissing, 0, "the other hand's last place is used");
});

test("Air Letters' old progress moves to its new level numbers once", () => {
  const p = { games: { letters: { best: [3, 2, 0, 0, 0], done: [true, true, false, false, false], passed: [true, true, false, false, false], plays: 4 }, breeze: { best: [1, 0, 0, 0, 0] } }, stickers: ["letters:1", "breeze:1"] };
  migrate(p);
  assert.deepEqual(p.games.letters.best, [0, 0, 0, 0, 0, 3, 2, 0, 0, 0]);
  assert.deepEqual(p.games.letters.passed.slice(5, 7), [true, true]);
  assert.deepEqual(p.stickers, ["letters:6", "breeze:1"]);
  assert.deepEqual(p.games.breeze.best, [1, 0, 0, 0, 0]);
  migrate(p);
  assert.equal(p.games.letters.best.length, 10, "only once");
  assert.equal(levelCount("letters"), 10); assert.equal(levelCount("breeze"), 5);
});

test("Time is shown in whole seconds", () => {
  const lines = describe({ game: "breeze", input_mode: "sensors", completed: true, metrics: { rounds_completed: 2, rounds_total: 5, longest_hold_sec: 7.6, target_hold_sec: 10 } });
  assert.ok(lines.some((l) => l.includes("8")) && !lines.some((l) => /\d\.\d/.test(l)), lines.join(" | "));
  const ch = therapyChange({ game: "mouth", level: 1, input_mode: "sensors", metrics: { longest_hold_sec: 4.5 } }, [{ game: "mouth", level: 1, input_mode: "sensors", metrics: { longest_hold_sec: 2.5 } }]);
  assert.ok(!/\./.test(ch.now) && !/\./.test(ch.before));
});

test("Voice check: a wrong or repeated sound cannot spoil recognition", async () => {
  const V = await import("../js/kit/vowel.js");
  const mk = (f1, f2) => Array.from({ length: 12 }, (_, i) => [f1 * (1 + ((i % 5) - 2) * 0.02), f2 * (1 + ((i % 3) - 1) * 0.02)]);
  const child = { aah: [1030, 1370], eee: [370, 3200], ehh: [690, 2400], ooo: [620, 1100], uuu: [430, 1170] };
  const all = (f) => Object.fromEntries(Object.keys(child).map((v) => [v, mk(...f)]));
  assert.equal(V.makeVowelAnchors(all(child.eee)), null, "one sound for every prompt: the built-in sounds are used");
  assert.equal(V.makeVowelAnchors(all(child.aah)), null);
  const swapped = V.makeVowelAnchors({ ...Object.fromEntries(Object.entries(child).map(([v, f]) => [v, mk(...f)])), aah: mk(...child.eee) });
  assert.ok(swapped && !swapped.aah && swapped.eee, "an eee said for A is not learned as A");
  const good = V.makeVowelAnchors(Object.fromEntries(Object.entries(child).map(([v, f]) => [v, mk(...f)])));
  assert.deepEqual(Object.keys(good).sort(), ["aah", "eee", "ehh", "ooo", "uuu"], "a normal check keeps all five");
});
