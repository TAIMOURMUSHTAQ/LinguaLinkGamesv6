// Regression tests for the issues found in the v1 QA report (IDs refer to that report).
import test from "node:test";
import assert from "node:assert/strict";

// A small in-memory localStorage, so progress and history can be tested in Node.
const mem = new Map();
globalThis.window = { localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) } };

const { detectPitch } = await import("../js/kit/mic.js");
const { scoreGarden, splitFocus, wordList, WORD_BANK, plainWord } = await import("../js/games/garden.js");
const { LEVELS: BREEZE, soundForRound } = await import("../js/games/breeze.js");
const { recordResult, isUnlocked, getProgress, clearProgress, currentLevel, totalStars } = await import("../js/kit/progress.js");
const { describe, perRound } = await import("../js/kit/report.js");
const { buildResult, adjustSuggestion } = await import("../js/kit/results.js");
const { normalise } = await import("../js/kit/config.js");
const { STRING_TABLES, setLang, t, gameText, levelText } = await import("../js/kit/i18n.js");
const { GAMES } = await import("../js/games/index.js");

test("C3: Word Garden scores against every item in the level", () => {
  const two = [{ result: "clear" }, { result: "clear" }];
  assert.equal(scoreGarden(two, 5), 40, "2 of 5 is 40, not 100");
  assert.equal(scoreGarden([], 5), 0);
  assert.equal(scoreGarden(two, 2), 100);
});

test("C4: pitch detection is accurate and fast", () => {
  for (const sr of [44100, 48000]) for (const f of [90, 180, 260, 440, 800]) {
    const b = new Float32Array(2048);
    for (let i = 0; i < b.length; i++) b[i] = 0.4 * Math.sin((2 * Math.PI * f * i) / sr) + 0.1 * Math.sin((4 * Math.PI * f * i) / sr);
    const hz = detectPitch(b, sr);
    assert.ok(Math.abs(hz - f) / f < 0.02, `${sr} ${f} -> ${hz}`);
  }
  const noise = new Float32Array(2048).map(() => Math.random() - 0.5);
  assert.equal(detectPitch(noise, 48000), null, "noise has no pitch");
  const b = new Float32Array(2048);
  for (let i = 0; i < b.length; i++) b[i] = 0.4 * Math.sin((2 * Math.PI * 220 * i) / 48000);
  const t0 = performance.now();
  for (let k = 0; k < 200; k++) detectPitch(b, 48000);
  const ms = (performance.now() - t0) / 200;
  assert.ok(ms < 3, `one pitch reading took ${ms.toFixed(2)} ms (frame budget is 16.7 ms)`);
});

test("M3: target letters are marked exactly, no /sh/ or /z/", () => {
  const focus = (w) => splitFocus(w, "s").filter((p) => p.focus).map((p) => p.text);
  assert.deepEqual(focus("Wash with [s]oap."), ["s"]);
  assert.deepEqual(focus("The [s]un is hot."), ["s"], "the s in 'is' is a /z/");
  assert.deepEqual(focus("gla[ss]es"), ["ss"]);
  assert.deepEqual(focus("wash"), [], "fallback skips 'sh'");
  for (const sound of Object.keys(WORD_BANK)) for (const list of Object.values(WORD_BANK[sound])) for (const it of list) {
    assert.ok(/\[[^\]]+\]/.test(it.word), `${sound}: ${it.word} has a marked target`);
    assert.ok(!/[[\]]/.test(plainWord(it.word)));
  }
});

test("M4: custom words per level and per position", () => {
  const perLevel = [[{ word: "a" }], [{ word: "b" }], [{ word: "c" }], [{ word: "d" }], [{ word: "e" }]];
  assert.equal(wordList("s", "final", perLevel, 1)[0].word, "b");
  assert.equal(wordList("s", "medial", { medial: [{ word: "x" }] }, 2)[0].word, "x");
  assert.equal(wordList("s", "initial", { medial: [{ word: "x" }] }, 0)[0].word, "[s]un", "missing group falls back to the word bank");
});

test("Balloon Breeze uses varied sounds round by round", () => {
  for (const lv of BREEZE) {
    const used = Array.from({ length: lv.rounds }, (_, r) => soundForRound(lv, r));
    assert.ok(new Set(used).size >= 2, `${lv.name} uses more than one sound`);
  }
  const all = new Set(BREEZE.flatMap((l) => l.sounds));
  assert.ok(all.size >= 4);
});

test("Progress: levels unlock in order and stickers are awarded once", () => {
  mem.clear();
  clearProgress();
  assert.ok(isUnlocked("breeze", 0));
  assert.ok(!isUnlocked("breeze", 1));
  assert.ok(isUnlocked("breeze", 3, { unlockAll: true }));
  const res = (stars, completed = true, level = 1) => ({ game: "breeze", level, stars, completed, ended_at: new Date().toISOString() });
  let g = recordResult(res(0));
  assert.equal(g.unlockedLevel, null, "0 stars does not open the next level");
  g = recordResult(res(1, false));
  assert.equal(g.unlockedLevel, null, "an unfinished level does not open the next one");
  g = recordResult(res(2));
  assert.equal(g.unlockedLevel, 2);
  assert.ok(g.newSticker);
  g = recordResult(res(3));
  assert.equal(g.newSticker, null, "sticker only once");
  assert.equal(totalStars(), 3);
  assert.equal(currentLevel("breeze"), 1);
  assert.ok(getProgress().stickers.includes("breeze:1"));
});

test("Reports: plain sentences for every game, no JSON needed", () => {
  setLang("en");
  const base = { input_mode: "sensors", completed: true, events: [] };
  const cases = [
    { game: "breeze", metrics: { rounds_completed: 2, rounds_total: 3, longest_hold_sec: 2.4, target_hold_sec: 2, voice_breaks: 1, steady_voice_pct: null } },
    { game: "glide", metrics: { rings_hit: 6, rings_total: 8, accuracy_pct: 75, up_rings_hit: 3, up_rings_total: 4, down_rings_hit: 3, down_rings_total: 4, right_sound_pct: 70, avg_response_ms: 1500, personal_voice_check: false } },
    { game: "mouth", metrics: { moves_done: 4, moves_total: 5, by_move: { open: { done: 4, total: 5 } }, confirmed_by: "camera" } },
    { game: "firefly", metrics: { caught: 9, total: 10, avg_reaction_ms: 2100, wrong_touches: 1, left_hand_catches: 5, right_hand_catches: 4, cross_midline_catches: 2 } },
    { game: "garden", metrics: { clear: 3, items_total: 5, clear_first_try: 2, items: [{ item: "sun", result: "needs_practice" }] } },
  ];
  for (const c of cases) {
    const lines = describe({ ...base, ...c });
    assert.ok(lines.length >= 2, c.game);
    assert.ok(lines.every((l) => typeof l === "string" && !l.includes("{")), `${c.game}: no unfilled placeholders`);
  }
  assert.match(describe({ ...base, ...cases[1] }).join(" "), /voice check did not finish/);
  assert.match(describe({ ...base, ...cases[4] }).join(" "), /sun/);
  const pr = perRound({ game: "breeze", metrics: {}, events: [{ type: "round_complete", round: 1, longest_hold_sec: 2.1, target_sec: 2 }, { type: "round_timeout", round: 2, longest_hold_sec: 0.8, target_sec: 2 }] });
  assert.deepEqual(pr.map((p) => p.ok), [true, false]);
});

test("Results carry a unique id for delivery confirmation", () => {
  const mk = () => buildResult({ game: "breeze", gameVersion: "2.0.0", level: 1, levelName: "x", mode: "touch", startedAt: 0, endedAt: 1000, completed: true, score: 50, metrics: {}, events: [], settings: {}, config: {} });
  const a = mk(), b = mk();
  assert.ok(a.result_id && b.result_id && a.result_id !== b.result_id);
  assert.equal(adjustSuggestion("next", 0, false), "unfinished");
});

test("L7: unknown settings fall back to safe values", () => {
  const c = normalise({ mode: "x", lang: "fr", gardenSound: "z", game: "nope", level: "19" });
  assert.deepEqual([c.mode, c.lang, c.gardenSound, c.game, c.level], ["auto", "en", "all", null, 10]);
});

test("H5: every English string and every game text has an Urdu version", () => {
  const en = Object.keys(STRING_TABLES.en);
  const missing = en.filter((k) => !(k in STRING_TABLES.ur));
  assert.deepEqual(missing, [], "missing Urdu strings");
  setLang("ur");
  for (const g of GAMES) {
    for (const f of ["title", "focus", "input", "touch"]) assert.notEqual(gameText(g, f), { title: g.title, focus: g.focus, input: g.inputLabel, touch: g.touchLabel }[f], `${g.id}.${f}`);
    for (let i = 0; i < 5; i++) for (const f of ["name", "goal"]) assert.notEqual(levelText(g, i, f), g.levels[i][f], `${g.id}.${i + 1}.${f}`);
  }
  assert.equal(t("tryOf", { n: 2, m: 3 }), "کوشش 2 از 3");
  setLang("en");
});

test("Word Garden automatic check: right words pass, wrong words and sound swaps do not", async () => {
  const { judgeTranscript, judgeAlternatives, wordsOf } = await import("../js/kit/speech.js");
  const { focusWords } = await import("../js/games/garden.js");
  assert.deepEqual(focusWords("[c]oo[k]ie jar", "k"), ["cookie"]);
  assert.deepEqual(focusWords("I [s]ee a [s]eal.", "s"), ["see", "seal"]);
  assert.ok(judgeTranscript("Sun", "sun", ["sun"]).ok);
  assert.ok(judgeTranscript("son", "sun", ["sun"]).ok, "same sound, other spelling");
  assert.ok(judgeTranscript("cats", "cat", ["cat"]).ok, "plural is fine");
  assert.ok(!judgeTranscript("fun", "sun", ["sun"]).ok, "a sound swap is not the word");
  assert.ok(!judgeTranscript("tat", "cat", ["cat"]).ok);
  assert.ok(!judgeTranscript("", "sun", ["sun"]).ok);
  assert.ok(judgeTranscript("I see a seal", "I see a seal.", ["see", "seal"]).ok);
  assert.ok(judgeTranscript("I see seal", "I see a seal.", ["see", "seal"]).ok, "a small word may be missed");
  assert.ok(!judgeTranscript("I see a meal", "I see a seal.", ["see", "seal"]).ok, "the target word must be there");
  assert.ok(!judgeTranscript("pink", "pink pig", ["pink", "pig"]).ok, "two words: both needed");
  assert.ok(judgeAlternatives(["fun", "sun"], "sun", ["sun"]).ok, "any alternative can match");
  assert.deepEqual(wordsOf("The cat's hat!"), ["the", "cat", "hat"]);
});

test("Word Garden moves on by itself: auto check, retries, and voice-only fallback", async () => {
  const garden = (await import("../js/games/garden.js")).default;
  const results = [];
  const makeCtx = (mic) => ({
    W: 1280, H: 720, level: garden.levels[0], levelIndex: 0, mode: "sensors", mic, time: 0, anim: 0,
    config: { gardenSound: "s" }, t: (k) => k, sfx: new Proxy({}, { get: () => () => {} }),
    fx: { burst() {}, text() {} }, praise() {}, event: (type, d) => results.push({ type, ...d }), setControls() {},
    makeAdaptive: () => ({ step: 0, success() {}, miss() {}, enabled: false, summary: () => ({}) }),
  });
  // No speech recogniser in Node: the game falls back to voice checking.
  const mic = { voiced: false, periodic: false, selfSound: false, level01: 0 };
  const g = garden.create(makeCtx(mic));
  g.start();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(g.checkBy, "voice");
  const run = (sec, voiced) => { mic.voiced = voiced; mic.periodic = voiced; for (let i = 0; i < sec * 20; i++) g.update(0.05); };
  run(0.6, true);   // the child says the word
  run(1, false);    // stops: the game waits for an adult
  assert.equal(g.state, "check");
  run(4, false);    // nobody tapped: it moves on by itself
  assert.equal(g.results.length, 1);
  assert.equal(g.results[0].result, "said");
  assert.equal(g.results[0].judged_by, "voice");
  assert.equal(g.state, "listen");
  run(10.5, false); // silence: the game models the word once
  assert.ok(results.some((e) => e.type === "model_played" && e.auto));
  g.destroy();
});
