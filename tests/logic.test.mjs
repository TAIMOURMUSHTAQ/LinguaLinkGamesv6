// Run with: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";

import breeze, { scoreBreeze } from "../js/games/breeze.js";
import glide, { ringVowels, scoreGlide, LANES } from "../js/games/glide.js";
import mouth, { moveSequence, moveActive, scoreMouth, LEVELS as MOUTH_LEVELS } from "../js/games/mouth.js";
import firefly, { spawnZone, scoreFirefly } from "../js/games/firefly.js";
import garden, { WORD_BANK, LEVELS as GARDEN_LEVELS, splitFocus, scoreGarden, wordList } from "../js/games/garden.js";
import { detectPitch, toDb, rmsOf, semitones } from "../js/kit/mic.js";
import { realHand, blendshapeMap } from "../js/kit/vision.js";
import { starsFor, suggestionFor, buildResult, SCHEMA } from "../js/kit/results.js";

const GAMES = [breeze, glide, mouth, firefly, garden];

test("every game has 5 levels with a name, goal and settings", () => {
  for (const g of GAMES) {
    assert.equal(g.levels.length, 5, g.id);
    for (const lv of g.levels) {
      assert.ok(lv.name && lv.goal, `${g.id} level text`);
      assert.equal(typeof lv.settings, "object", `${g.id} settings`);
    }
    assert.ok(g.title && g.focus && g.input && g.version, g.id);
    assert.equal(typeof g.create, "function");
  }
});

test("stars and suggestions follow the score bands", () => {
  assert.deepEqual([0, 39, 40, 69, 70, 89, 90, 100].map(starsFor), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.equal(suggestionFor(85), "next");
  assert.equal(suggestionFor(60), "stay");
  assert.equal(suggestionFor(30), "easier");
});

test("result object uses the shared schema", () => {
  const r = buildResult({ game: "breeze", gameVersion: "1.0.0", level: 2, levelName: "Higher Hills", mode: "touch",
    startedAt: 0, endedAt: 61000, completed: true, score: 104, metrics: { a: 1 }, events: [], settings: {}, config: { assignmentId: 7 } });
  assert.equal(r.schema, SCHEMA);
  assert.equal(r.score, 100);
  assert.equal(r.stars, 3);
  assert.equal(r.duration_sec, 61);
  assert.equal(r.assignment_id, 7);
});

test("pitch detector finds a 220 Hz tone", () => {
  const sr = 48000, n = 2048, buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / sr);
  const hz = detectPitch(buf, sr);
  assert.ok(Math.abs(hz - 220) < 3, `got ${hz}`);
  assert.equal(detectPitch(new Float32Array(n), sr), null, "silence has no pitch");
});

test("loudness helpers", () => {
  assert.ok(Math.abs(toDb(1) - 0) < 1e-9);
  assert.ok(Math.abs(toDb(0.1) + 20) < 1e-9);
  assert.ok(Math.abs(rmsOf(new Float32Array([1, -1, 1, -1])) - 1) < 1e-9);
  assert.ok(Math.abs(semitones(440, 220) - 12) < 1e-9);
});

test("Balloon Breeze scoring", () => {
  assert.equal(scoreBreeze({ roundsDone: 3, rounds: 3 }), 100);
  assert.equal(scoreBreeze({ roundsDone: 2, rounds: 4 }), 50);
  assert.equal(scoreBreeze({ roundsDone: 5, rounds: 5, steadyPct: 60 }), 94);
});

test("Sky Glide ring patterns: all five vowels on every level", () => {
  glide.levels.forEach((lv) => {
    const v = ringVowels(lv.order, lv.count);
    assert.equal(v.length, lv.count);
    assert.equal(new Set(v).size, 5, `${lv.name} uses all five vowels`);
  });
  assert.deepEqual(ringVowels("pairs", 4), ["aah", "aah", "ehh", "ehh"]);
  assert.deepEqual(LANES, ["uuu", "ooo", "aah", "ehh", "eee"]);
  assert.equal(scoreGlide({ hits: 6, total: 8 }), 75);
});

test("Fish Feast move sequences and detection", () => {
  assert.deepEqual(moveSequence(["open", "smile"], 4), ["open", "smile", "open", "smile"]);
  MOUTH_LEVELS.forEach((lv) => assert.equal(lv.reps >= 6, true, lv.name));
  const base = { jawOpen: 0.05, smile: 0.1, pucker: 0.05, puff: 0.02 };
  assert.ok(moveActive("open", { jawOpen: 0.6, smile: 0.1, pucker: 0, puff: 0 }, base));
  assert.ok(!moveActive("open", { jawOpen: 0.2, smile: 0.1, pucker: 0, puff: 0 }, base));
  assert.ok(moveActive("kiss", { jawOpen: 0.1, smile: 0, pucker: 0.6, puff: 0 }, base));
  assert.ok(!moveActive("kiss", { jawOpen: 0.7, smile: 0, pucker: 0.6, puff: 0 }, base), "open mouth is not a kiss");
  assert.equal(scoreMouth({ done: 4, total: 5 }), 80);
});

test("Firefly Night zones and scoring", () => {
  const z = spawnZone("cross", "left");
  assert.ok(z.x0 > 640, "left-hand fireflies appear on the right side");
  assert.ok(spawnZone("cross", "right").x1 < 640);
  assert.equal(scoreFirefly({ caught: 10, total: 10, wrong: 2 }), 94);
});

test("Word Garden word bank, highlighting and scoring", () => {
  for (const sound of ["s", "k", "p"]) {
    GARDEN_LEVELS.forEach((lv, i) => assert.equal(WORD_BANK[sound][lv.group].length, i === 0 ? 5 : 6, `${sound} ${lv.group}`));
  }
  const parts = splitFocus("bicycle", "s").filter((p) => p.focus).map((p) => p.text);
  assert.deepEqual(parts, ["c"]);
  assert.deepEqual(splitFocus("chicken", "k").filter((p) => p.focus).map((p) => p.text), ["ck"]);
  assert.deepEqual(splitFocus("puppy", "p").filter((p) => p.focus).map((p) => p.text), ["p", "pp"]);
  assert.equal(scoreGarden([{ result: "clear" }, { result: "needs_practice" }]), 50);
  assert.equal(wordList("s", "initial", [{ word: "sip" }])[0].word, "sip");
});

test("hand labels and blendshapes", () => {
  assert.equal(realHand("Left"), "right");
  assert.equal(realHand("Right"), "left");
  const m = blendshapeMap([{ categoryName: "jawOpen", score: 0.5 }, { categoryName: "mouthSmileLeft", score: 0.4 }, { categoryName: "mouthSmileRight", score: 0.6 }]);
  assert.equal(m.jawOpen, 0.5);
  assert.ok(Math.abs(m.smile - 0.5) < 1e-9);
});
