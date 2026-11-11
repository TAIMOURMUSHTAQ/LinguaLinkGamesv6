// Tests for v4: vowel recognition, tracing, the new games, and therapy progress.
import test from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.window = { localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) } };

const V = await import("../js/kit/vowel.js");
const { detectPitch, fixOctave } = await import("../js/kit/mic.js");
const { GLYPHS, Tracer, resample, scoreTrace } = await import("../js/kit/trace.js");
const { applyGain, boxFor } = await import("../js/kit/tracegame.js");
const { measureBody, baseFrom, moveAmount, scoreBody } = await import("../js/kit/body.js");
const { fingerStates, mouthWidth, blendshapeMap } = await import("../js/kit/vision.js");
const { GAMES } = await import("../js/games/index.js");
const breeze = (await import("../js/games/breeze.js")).default;
const glide = (await import("../js/games/glide.js"));
const mouth = await import("../js/games/mouth.js");
const garden = await import("../js/games/garden.js");
const letters = await import("../js/games/letters.js");
const numbers = await import("../js/games/numbers.js");
const balance = await import("../js/games/balance.js");
const body = await import("../js/games/body.js");
const { therapyChange, progressByLevel, describe } = await import("../js/kit/report.js");
const { t, setLang, STRING_TABLES, gameText, levelText } = await import("../js/kit/i18n.js");
const { STICKERS, STICKER_TOTAL } = await import("../js/kit/progress.js");
const { GAME_IDS, GARDEN_SOUNDS, normalise } = await import("../js/kit/config.js");

// ---------- a synthetic voice: a pulse train (or noise, for a whisper) through the mouth's resonances ----------
const SR = 48000, N = 2048;
function synth(f0, formants, { whisper = false, seconds = 0.5 } = {}) {
  const n = Math.floor(seconds * SR);
  let x = new Float64Array(n), phase = 0, seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
  for (let i = 0; i < n; i++) {
    if (whisper) x[i] = rnd();
    else { phase += f0 / SR; if (phase >= 1) { phase -= 1; x[i] = 1; } }
  }
  [80, 100, 140, 200].forEach((bw, j) => {
    const F = formants[j], r = Math.exp((-Math.PI * bw) / SR), c = 2 * r * Math.cos((2 * Math.PI * F) / SR), d = -r * r, g = 1 - c - d;
    let y1 = 0, y2 = 0; const y = new Float64Array(n);
    for (let i = 0; i < n; i++) { y[i] = g * x[i] + c * y1 + d * y2; y2 = y1; y1 = y[i]; }
    x = y;
  });
  let m = 0; for (const v of x) m = Math.max(m, Math.abs(v));
  return x.map((v) => (v / m) * 0.4);
}
const hann = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
function powerOf(frame) {
  const bins = Math.floor(9000 / (SR / N)), out = new Float64Array(bins);
  for (let k = 1; k < bins; k++) {
    let re = 0, im = 0; const w = (2 * Math.PI * k) / N;
    for (let n = 0; n < N; n++) { const x = frame[n] * hann[n]; re += x * Math.cos(w * n); im -= x * Math.sin(w * n); }
    out[k] = (re * re + im * im) / N;
  }
  return out;
}
const VOICES = {
  man: { f0: 120, f: { aah: [730, 1090, 2440, 3400], eee: [270, 2290, 3010, 3600], iii: [390, 1990, 2550, 3400], ooo: [500, 850, 2500, 3400], uuu: [300, 870, 2240, 3300] } },
  woman: { f0: 210, f: { aah: [850, 1220, 2810, 3900], eee: [310, 2790, 3310, 4200], iii: [430, 2480, 3070, 4000], ooo: [540, 950, 2750, 3900], uuu: [370, 950, 2670, 3800] } },
  child: { f0: 290, f: { aah: [1030, 1370, 3170, 4300], eee: [370, 3200, 3730, 4600], iii: [530, 2730, 3600, 4500], ooo: [620, 1100, 3180, 4300], uuu: [430, 1170, 3260, 4400] } },
};
// One clip analysed the way the game does: the median of a few frames.
function hear(who, vowel, opts = {}) {
  const r = VOICES[who], wave = synth(r.f0, r.f[vowel], opts), f1 = [], f2 = [];
  for (let s = 4000; s + N < wave.length; s += 3000) {
    const fm = V.formantsFrom(powerOf(wave.subarray(s, s + N)), SR / N);
    if (fm) { f1.push(fm.f1); f2.push(fm.f2); }
  }
  const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
  const known = !opts.whisper;
  return { f1: med(f1), f2: med(f2), d: V.vowelDistances(med(f1), med(f2), known ? V.voiceType(r.f0) : 1, known), type: known ? V.voiceType(r.f0) : 1 };
}

test("Vowels: each sound is recognised for men, women and children", () => {
  for (const who of Object.keys(VOICES)) for (const v of V.VOWELS) {
    const h = hear(who, v);
    assert.ok(V.matchesVowel(h.d, v, 0.5), `${who} ${v} accepted (F1 ${h.f1}, F2 ${h.f2})`);
  }
});

test("Vowels: the wrong sound does not fill the balloon", () => {
  // far-apart sounds are never accepted, even on the most forgiving setting
  const FAR = { aah: ["eee", "iii", "uuu"], eee: ["aah", "ooo", "uuu"], iii: ["aah", "ooo", "uuu"], ooo: ["eee", "iii"], uuu: ["aah", "eee", "iii"] };
  for (const who of Object.keys(VOICES)) for (const [spoken, targets] of Object.entries(FAR)) {
    const h = hear(who, spoken);
    for (const target of targets) assert.ok(!V.matchesVowel(h.d, target, 1), `${who} saying ${spoken} must not count as ${target}`);
  }
});

test("Vowels: the bird goes up for eee and down for aaa, loud or whispered", () => {
  for (const who of Object.keys(VOICES)) for (const whisper of [false, true]) {
    const e = hear(who, "eee", { whisper }), a = hear(who, "aah", { whisper });
    assert.equal(V.directionFrom(e.f1, e.f2, { type: e.type }), 1, `${who} eee whisper=${whisper}`);
    assert.equal(V.directionFrom(a.f1, a.f2, { type: a.type }), -1, `${who} aaa whisper=${whisper}`);
  }
});

test("Vowels: personal anchors, and hiss and silence are not vowels", () => {
  assert.equal(V.makeAnchors([], []), null);
  const aah = Array(6).fill([800, 1200]), eee = Array(6).fill([320, 2700]);
  const anchors = V.makeAnchors(aah, eee);
  assert.deepEqual(anchors, { aah: [800, 1200], eee: [320, 2700] });
  assert.equal(V.directionFrom(330, 2600, { anchors }), 1);
  assert.equal(V.directionFrom(780, 1250, { anchors }), -1);
  assert.equal(V.makeAnchors(aah, aah), null, "the same sound twice cannot steer");
  const hiss = new Float64Array(390); for (let i = 170; i < 390; i++) hiss[i] = 1; // energy above 4 kHz
  assert.ok(V.isHiss(hiss, SR / N));
  assert.equal(V.formantsFrom(new Float64Array(390), SR / N), null);
  // the room's noise is removed before listening
  const room = new Float64Array(10).fill(1), loud = new Float64Array(10).fill(1.2);
  assert.ok(V.cleanSpectrum(loud, room).every((v) => v === 0));
});

test("Quiet voices still give a pitch, and octave slips are folded back", () => {
  const wave = synth(220, VOICES.woman.f.aah).map((v) => v * 0.02);
  const hz = detectPitch(Float32Array.from(wave.subarray(4000, 4000 + N)), SR);
  assert.ok(hz && Math.abs(hz - 220) < 12, `pitch of a quiet voice: ${hz}`);
  assert.equal(fixOctave(400, 200), 200);
  assert.equal(fixOctave(100, 200), 200);
  assert.equal(fixOctave(260, 200), 260);
});

test("Balloon Breeze: all five sounds, longer holds and a stricter match, level by level", () => {
  const L = breeze.levels;
  assert.deepEqual(new Set(L.flatMap((l) => l.sounds)), new Set(V.VOWELS));
  for (let i = 1; i < L.length; i++) {
    assert.ok(L[i].target >= L[i - 1].target, "holds never get shorter");
    assert.ok(L[i].lenience < L[i - 1].lenience, "the match gets stricter");
  }
  assert.ok(breeze.mic.vowels);
});

// A small stand-in for the engine.
function makeCtx(def, over = {}) {
  const events = [];
  return {
    W: 1280, H: 720, level: def.levels[0], levelIndex: 0, mode: "touch", mic: null, tracker: null, time: 0, anim: 0, reduced: true,
    config: {}, keys: new Set(), pointer: { x: 0, y: 0, down: false }, variant: def.variants ? def.variants[0].id : null,
    t: (k) => k, say() {}, sfx: new Proxy({}, { get: () => () => {} }), fx: { burst() {}, text() {} }, praise() {}, event: (type, d) => events.push({ type, ...d }), events, setControls() {},
    makeAdaptive: () => ({ step: 0, enabled: false, success() {}, miss() {}, scale: (v) => v, summary: () => ({}), changes: [] }),
    ...over,
  };
}
const mockMic = (over = {}) => ({ voiced: false, speech: false, periodic: false, get steadyVoice() { return this.periodic; }, hiss: false, selfSound: false, level01: 0, rise: 0, vowel: null, formants: null, _want: null, personal: null, isVowel(v) { return this._want === v; }, direction() { return this._dir || 0; }, setAnchors(a) { this.personal = a; }, ...over });
const { rememberVowels, forgetVowels, createVowelCheck, CHECK_ORDER } = await import("../js/kit/vowelcheck.js");

test("Balloon Breeze: only the sound asked for moves the balloon", () => {
  const mic = mockMic();
  rememberVowels({ aah: { f1: 800, f2: 1200, s1: 0.2, s2: 0.2 } }); // the voice check was done earlier this visit
  const ctx = makeCtx(breeze, { mode: "sensors", mic });
  const g = breeze.create(ctx);
  assert.equal(g.phase, "play", "the earlier voice check is reused");
  assert.ok(mic.personal, "and given to the microphone");
  g.start();
  const run = (sec) => { for (let i = 0; i < sec * 20; i++) g.update(0.05); };
  run(2); // past "get ready"
  assert.equal(g.progress, 0);
  // silence
  run(1); assert.equal(g.progress, 0);
  // loud noise with no pitch: a clap, a fan, a hiss
  Object.assign(mic, { voiced: true, periodic: false, _want: null }); run(1); assert.equal(g.progress, 0, "noise does nothing");
  Object.assign(mic, { voiced: true, periodic: true, hiss: true, _want: "aah" }); run(1); assert.equal(g.progress, 0, "a hiss does nothing");
  // a real voice, wrong vowel
  Object.assign(mic, { hiss: false, _want: "uuu", vowel: "uuu" }); run(1); assert.equal(g.progress, 0, "the wrong vowel does nothing");
  // the right vowel
  Object.assign(mic, { _want: g.sound, vowel: g.sound }); run(3);
  assert.ok(g.progress > 0.5, `the right vowel fills it: ${g.progress}`);
  // a breath: the balloon waits, it does not shrink
  const kept = g.progress; Object.assign(mic, { voiced: false, periodic: false, _want: null }); run(2);
  assert.equal(g.progress, kept, "a breath keeps the balloon");
  Object.assign(mic, { voiced: true, periodic: true, _want: g.sound });
  // the game's own voice does not count
  const p = g.progress; Object.assign(mic, { selfSound: true }); run(1); assert.equal(g.progress, p);
});

test("Sky Glide: each vowel flies to its own height, silence glides straight; Stop and say waits", () => {
  glide.resetCalibration();
  const say = (m, v) => Object.assign(m, { speech: !!v, vowel: v, _want: v });
  const mic = mockMic();
  const level = { ...glide.LEVELS[0] };
  const ctx = makeCtx(glide.default, { mode: "sensors", mic, variant: "fly", level });
  const g = glide.default.create(ctx);
  assert.equal(g.phase, "check", "the voice check comes first");
  g.phase = "play";
  const run = (sec) => { for (let i = 0; i < sec * 20; i++) g.update(0.05); };
  run(0.5);
  const h0 = g.birdH;
  run(1); assert.ok(Math.abs(g.birdH - h0) < 0.001, "silence: straight");
  say(mic, "eee"); run(2); assert.ok(Math.abs(g.birdH - V.VOWEL_HEIGHT.eee) < 0.05, `E flies to the top: ${g.birdH}`);
  say(mic, "uuu"); run(2.5); assert.ok(Math.abs(g.birdH - V.VOWEL_HEIGHT.uuu) < 0.05, "U flies to the bottom (a quiet voice is enough)");
  say(mic, "iii"); run(2); assert.ok(Math.abs(g.birdH - V.VOWEL_HEIGHT.iii) < 0.05, "I");
  say(mic, null); const h1 = g.birdH; run(1); assert.ok(Math.abs(g.birdH - h1) < 0.02, "silence holds the height");
  const order = ["uuu", "ooo", "aah", "iii", "eee"].map((v) => V.VOWEL_HEIGHT[v]);
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], "U, O, A, I, E from bottom to top");

  const mic2 = mockMic();
  const s = glide.default.create(makeCtx(glide.default, { mode: "sensors", mic: mic2, variant: "stop", level }));
  s.phase = "play";
  const run2 = (sec) => { for (let i = 0; i < sec * 20; i++) s.update(0.05); };
  run2(9); // the first ring has arrived
  assert.ok(s.waiting, "the bird stops at the ring");
  const want = glide.ringVowels(level.order, level.count)[0];
  run2(3); assert.ok(s.waiting, "it keeps waiting without the sound");
  say(mic2, want === "eee" ? "uuu" : "eee"); run2(3); assert.ok(s.waiting, "another sound does not move it on");
  say(mic2, want); run2(3); assert.ok(!s.waiting, "the right sound moves it on");
  say(mic2, null);
  assert.equal(s.responses.length, 1, "the response time is recorded");
  assert.deepEqual(glide.default.variants.map((v) => v.id), ["fly", "stop"]);
});

test("Personal vowels: the child's own A, E, I, O, U are told apart", () => {
  // a child whose vowels sit away from the textbook values: E and I close together, A low
  const own = { aah: [700, 1500], eee: [400, 2350], iii: [470, 2100], ooo: [560, 1000], uuu: [380, 900] };
  const samples = {};
  for (const [v, [f1, f2]] of Object.entries(own)) samples[v] = Array.from({ length: 12 }, (_, i) => [f1 * (1 + ((i % 5) - 2) * 0.02), f2 * (1 + ((i % 3) - 1) * 0.02)]);
  const anchors = V.makeVowelAnchors(samples);
  assert.ok(anchors && Object.keys(anchors).length === 5);
  for (const [v, [f1, f2]] of Object.entries(own)) {
    const d = V.vowelDistances(f1, f2, 2, true, anchors);
    assert.equal(V.nearestVowel(d).vowel, v, `${v} is recognised with the child's own vowels`);
  }
  // with only the textbook values, some of them are confused
  const wrong = Object.entries(own).filter(([v, [f1, f2]]) => V.nearestVowel(V.vowelDistances(f1, f2, 2, true)).vowel !== v);
  assert.ok(wrong.length >= 1, "the textbook values alone confuse this child");
  assert.equal(V.makeVowelAnchors({ aah: samples.aah }), null, "one vowel is not a voice check");
  assert.equal(V.makeVowelAnchors({ aah: samples.aah, eee: samples.eee.slice(0, 2) }), null, "too few samples");
});

test("Voice check: asks for A, E, I, O, U in turn and hands the child's vowels to the microphone", () => {
  forgetVowels();
  const mic = mockMic();
  let done = null;
  const ctx = makeCtx(breeze, { mode: "sensors", mic });
  const k = createVowelCheck(ctx, { onDone: (a) => (done = a) });
  k.begin();
  const F = { aah: [800, 1300], eee: [350, 2700], iii: [450, 2300], ooo: [550, 950], uuu: [380, 900] };
  for (const v of CHECK_ORDER) {
    Object.assign(mic, { voiced: true, formants: { f1: F[v][0], f2: F[v][1] } });
    for (let i = 0; i < 60 && CHECK_ORDER[k.i] === v && !k.done; i++) k.update(0.05);
  }
  assert.ok(k.done, "the check finishes");
  assert.ok(done && done.aah && done.uuu, "all five vowels learnt");
  assert.equal(mic.personal, done);
  const g = breeze.create(makeCtx(breeze, { mode: "sensors", mic: mockMic() }));
  assert.equal(g.phase, "play", "the next game reuses it");
  forgetVowels();
});

test("Fish Feast: each level holds longer and asks for more, and every move grows step by step", () => {
  const L = mouth.LEVELS;
  for (let i = 1; i < L.length; i++) assert.ok(L[i].holdEnd >= L[i - 1].holdEnd, `level ${i + 1} ends with a hold at least as long`);
  assert.ok(L[4].reach > L[0].reach, "the last level asks for a bigger movement");
  for (const lv of L) {
    assert.equal(mouth.holdFor(lv, 0), lv.hold);
    assert.equal(mouth.holdFor(lv, lv.reps - 1), lv.holdEnd);
    for (let r = 1; r < lv.reps; r++) assert.ok(mouth.holdFor(lv, r) >= mouth.holdFor(lv, r - 1));
  }
  // a pout shows as a pucker shape, or as a narrower mouth, or both
  const base = { jawOpen: 0.05, pucker: 0.05, mouthW: 0.5 };
  assert.ok(mouth.moveActive("kiss", { jawOpen: 0.05, pucker: 0.5, mouthW: 0.5 }, base), "pucker shape");
  assert.ok(mouth.moveActive("kiss", { jawOpen: 0.05, pucker: 0.08, mouthW: 0.42 }, base), "narrower mouth");
  assert.ok(!mouth.moveActive("kiss", { jawOpen: 0.05, pucker: 0.06, mouthW: 0.5 }, base), "a relaxed mouth is not a pout");
  assert.equal(blendshapeMap([{ categoryName: "mouthPucker", score: 0.4 }]).pucker, 0.4);
  const lm = []; lm[61] = { x: 0.4, y: 0.5 }; lm[291] = { x: 0.6, y: 0.5 }; lm[234] = { x: 0.2, y: 0.4 }; lm[454] = { x: 0.8, y: 0.4 };
  assert.ok(Math.abs(mouthWidth(lm) - 1 / 3) < 1e-9);
  assert.equal(mouthWidth([]), 0);
});

test("Word Garden: all sounds by default, and short words count but a hiss does not", () => {
  assert.equal(normalise({}).gardenSound, "all");
  const list = garden.wordList("all", "initial");
  assert.equal(new Set(list.map((it) => it.sound)).size, Object.keys(garden.WORD_BANK).length, "every sound is practised");
  assert.ok(list.every((it) => /\[[^\]]+\]/.test(it.word)));
  assert.ok(garden.wordList("k", "initial").every((it) => it.sound === "k"));
  for (const s of GARDEN_SOUNDS) if (s !== "all") assert.ok(garden.WORD_BANK[s], `${s} has words`);
  // every marked word gives the recogniser something to look for
  for (const sound of Object.keys(garden.WORD_BANK)) for (const items of Object.values(garden.WORD_BANK[sound])) for (const it of items) {
    assert.ok(garden.focusWords(it.word, sound).length >= 1, it.word);
  }

  const makeGame = () => {
    const mic = mockMic();
    const g = garden.default.create(makeCtx(garden.default, { mode: "sensors", mic, config: { gardenSound: "all" } }));
    g.checkBy = "voice"; g.state = "listen";
    return { g, mic, run: (sec) => { for (let i = 0; i < sec * 20; i++) g.update(0.05); } };
  };
  // "pig": voiced for only 0.2 s
  { const { g, mic, run } = makeGame(); Object.assign(mic, { voiced: true, periodic: true }); run(0.2); Object.assign(mic, { voiced: false, periodic: false }); run(1); assert.equal(g.state, "check", "a short word is heard"); g.destroy(); }
  // "sssss": loud, long, no pitch
  { const { g, mic, run } = makeGame(); Object.assign(mic, { voiced: true, periodic: false }); run(1); mic.voiced = false; run(1); assert.equal(g.state, "listen", "a hiss alone is not a word"); g.destroy(); }
});

test("Word Garden: two ways to play, right and wrong words, and a check that is not ready", async () => {
  assert.deepEqual(garden.default.variants.map((v) => v.id), ["auto", "adult"]);
  class FakeSR {
    start(track) { FakeSR.last = this; FakeSR.started++; FakeSR.track = track; }
    abort() { this.onend && this.onend(); }
    say(...alts) { this.onresult({ results: [alts.map((transcript) => ({ transcript }))] }); this.onend && this.onend(); }
  }
  FakeSR.available = async () => FakeSR.status;
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const build = async ({ status = "available", variant = "auto", config = {} } = {}) => {
    Object.assign(FakeSR, { status, started: 0, last: null, track: null });
    const copy = { stop() {} };
    const mic = mockMic({ stream: { getAudioTracks: () => [{ clone: () => copy }] } });
    let controls = [];
    const ctx = makeCtx(garden.default, { mode: "sensors", mic, variant, config: { gardenSound: "s", ...config }, setControls: (l) => { controls = l; } });
    const g = garden.default.create(ctx);
    await g.start();
    await tick();
    const run = (sec) => { for (let i = 0; i < sec * 20; i++) g.update(0.05); };
    return { g, ctx, mic, copy, run, ids: () => controls.map((c) => c.id), tap: (id) => controls.find((c) => c.id === id).onTap(),
      say: async (...alts) => { run(0.4); FakeSR.last.say(...alts); await tick(); },
      speak: (sec) => { Object.assign(mic, { voiced: true, periodic: true }); run(sec); Object.assign(mic, { voiced: false, periodic: false }); } };
  };
  globalThis.window = { SpeechRecognition: FakeSR };
  try {
    // Game listens, on-device check ready: right word blooms, then the next word comes by itself
    {
      const t = await build();
      assert.equal(t.g.checkBy, "auto"); assert.equal(t.g.checker, "local");
      await t.say("sun");
      assert.equal(FakeSR.track, t.copy, "the recogniser hears the game's microphone");
      assert.equal(t.g.state, "bloom"); assert.equal(t.g.grown.length, 1); assert.deepEqual(t.ids(), []);
      assert.deepEqual([t.g.results[0].result, t.g.results[0].judged_by, t.g.results[0].attempts], ["clear", "auto", 1]);
      t.run(1.5);
      assert.equal(t.g.state, "listen"); assert.equal(t.g.i, 1);
      t.g.destroy();
    }
    // wrong word: no flower, asked to try again or go on; left alone it listens again
    {
      const t = await build();
      await t.say("fun");
      assert.equal(t.g.state, "retry"); assert.equal(t.g.lastHeard, "fun"); assert.equal(t.g.grown.length, 0);
      assert.ok(t.ids().includes("again") && t.ids().includes("next") && t.ids().includes("hear"));
      t.tap("again"); assert.equal(t.g.state, "listen");
      await t.say("run"); t.run(3.1); assert.equal(t.g.state, "listen", "listens again by itself");
      await t.say("bun");
      assert.equal(t.g.i, 1, "3 tries, then the next word");
      assert.deepEqual([t.g.results[0].result, t.g.results[0].judged_by, t.g.results[0].attempts], ["needs_practice", "auto", 3]);
      assert.ok(t.g.noteT > 0, "and says so");
      await t.say("fog");
      t.tap("next");
      assert.equal(t.g.i, 2);
      assert.deepEqual([t.g.results[1].result, t.g.results[1].attempts], ["needs_practice", 1]);
      t.g.destroy();
    }
    // Grown-up checks: nothing listens, and nothing moves on until the adult taps
    {
      const t = await build({ variant: "adult" });
      assert.equal(t.g.checkBy, "adult"); assert.equal(FakeSR.started, 0);
      assert.ok(t.ids().includes("said"));
      t.speak(0.5); t.run(6);
      assert.equal(t.g.state, "listen", "speaking alone does not move on"); assert.equal(FakeSR.started, 0);
      t.tap("said"); await tick();
      t.tap("clear");
      assert.deepEqual([t.g.results[0].result, t.g.results[0].judged_by, t.g.state], ["clear", "adult", "listen"]);
      assert.equal(t.g.result().metrics.variant, "adult");
      t.g.destroy();
    }
    // not ready, nothing allowed yet: a grown-up chooses, and nothing listens until then
    {
      const t = await build({ status: "downloadable" });
      assert.equal(t.g.state, "setup"); assert.deepEqual(t.ids(), ["online", "byadult"]);
      t.run(5); assert.equal(FakeSR.started, 0, "no audio is sent before a grown-up allows it");
      t.tap("byadult");
      assert.equal(t.g.checkBy, "adult"); assert.equal(t.g.state, "listen"); assert.ok(t.ids().includes("said"));
      t.g.destroy();
    }
    {
      const t = await build({ status: "unavailable" });
      t.tap("online");
      assert.equal(t.ctx.config.onlineSpeech, true); assert.equal(t.g.checker, "online"); assert.equal(t.g.state, "listen");
      t.run(0.4); assert.equal(FakeSR.started, 1);
      t.g.destroy();
    }
    // online allowed earlier: used without asking again. Forbidden by the clinic: never offered.
    {
      const t = await build({ status: "unavailable", config: { onlineSpeech: true } });
      assert.deepEqual([t.g.state, t.g.checker], ["listen", "online"]);
      t.g.destroy();
      const u = await build({ status: "downloadable", config: { onlineLocked: true, onlineSpeech: true } });
      assert.equal(u.g.checkBy, "voice", "never online when forbidden");
      u.g.destroy();
      const v = await build({ status: "unavailable", config: { onlineLocked: true } });
      assert.equal(v.g.checkBy, "voice");
      v.g.destroy();
    }
    // A recogniser that returns nothing must not mark the child down
    {
      const t = await build();
      t.run(0.4); t.speak(0.5); t.run(3.2);
      assert.deepEqual([t.g.state, t.g.attempts], ["retry", 0], "not counted against the child");
      t.run(3.1); t.speak(0.5); t.run(3.2);
      assert.equal(t.g.state, "setup", "twice: a grown-up is asked"); assert.equal(t.g.setup.failed, true);
      t.g.destroy();
    }
    // Once it has returned words, silence from it counts as a try
    {
      const t = await build();
      await t.say("sun"); t.run(1.5);
      t.run(0.4); t.speak(0.5); t.run(3.2);
      assert.deepEqual([t.g.state, t.g.attempts], ["retry", 1]);
      t.g.destroy();
    }
    // A recogniser that hangs is replaced, then given up on
    {
      const { WordListener } = await import("../js/kit/speech.js");
      Object.assign(FakeSR, { started: 0 });
      const l = new WordListener({});
      l.start(); assert.equal(FakeSR.started, 1);
      l.watch(l.startedAt + 1000); assert.ok(l.running, "still fine");
      l.watch(l.startedAt + 16000); assert.ok(!l.running && !l.broken, "replaced");
      l.start(); l.watch(l.startedAt + 16000);
      assert.ok(l.broken, "second hang: given up");
    }
  } finally { delete globalThis.window; }
  // Touch mode is always the grown-up's check
  const g = garden.default.create(makeCtx(garden.default, { config: { gardenSound: "s" } }));
  await g.start();
  assert.equal(g.checkBy, "adult");
  assert.equal(g.result().metrics.variant, "adult");
  g.destroy();
});

test("Writing: steady, fast and forgiving", async () => {
  const { Tracer, OneEuro } = await import("../js/kit/trace.js");
  const { airToScreen, closestHand } = await import("../js/kit/tracegame.js");
  const { fingerStates } = await import("../js/kit/vision.js");
  // shake is smoothed out while the hand rests, and a quick move is followed closely
  const f = new OneEuro();
  let shake = 0;
  for (let i = 0; i < 120; i++) { const v = f.next(500 + (i % 2 ? 12 : -12), 1 / 60); if (i > 60) shake = Math.max(shake, Math.abs(v - 500)); }
  assert.ok(shake < 7, `a resting hand stays still: ${shake}`);
  const m = new OneEuro();
  let last = 0;
  for (let i = 0; i < 12; i++) last = m.next(i * 40, 1 / 60);
  assert.ok(11 * 40 - last < 70, `a quick hand does not lag: ${11 * 40 - last}`);
  // a quick stroke with big jumps between camera frames still counts, but only along the line
  const box = { x: 400, y: 100, w: 400, h: 500 };
  const t = new Tracer("I", box, { tolerance: 60 });
  const s = t.strokes[0], a = s[0], b = s[s.length - 1];
  t.follow(a.x, a.y);
  t.follow(a.x, a.y + 150); t.follow(a.x, a.y + 300);
  assert.ok(t.point > 8, `jumps are walked: ${t.point}`);
  assert.equal(t.follow(b.x, b.y), "done");
  const u = new Tracer("I", box, { tolerance: 60 });
  u.follow(a.x, a.y);
  u.follow(a.x + 300, a.y + 200);
  assert.ok(u.point < 8, `a jump off the line gives little: ${u.point} of ${s.length}`);
  // the same movement goes the same distance across as up and down (4:3 camera)
  const across = airToScreen({ x: 0.6, y: 0.5 }, 1).x - 640, up = airToScreen({ x: 0.5, y: 0.6 }, 1).y - 360;
  assert.ok(Math.abs(across / (0.1 * 4 / 3) - up / 0.1) < 1, `${across} ${up}`);
  // the hand doing the drawing stays the one followed
  const hands = [{ x: 0.2, y: 0.5, id: 1 }, { x: 0.8, y: 0.5, id: 2 }];
  assert.equal(closestHand(hands, { x: 0.75 * 1280, y: 360 }).id, 2);
  // a finger pointing towards the camera still reads as straight
  const lm = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  lm[0] = { x: 0.5, y: 0.8, z: 0 }; lm[9] = { x: 0.5, y: 0.6, z: 0 }; lm[6] = { x: 0.5, y: 0.6, z: -0.03 }; lm[8] = { x: 0.5, y: 0.58, z: -0.14 };
  assert.equal(fingerStates(lm)[1], true);
});

test("Buddy: follows the body, and is whole even when the feet are out of view", async () => {
  const { jointsFromPose, poseJoints, smoothJoints, COSTUMES } = await import("../js/kit/buddy.js");
  const pts = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, v: 0 }));
  const set = (i, x, y) => { pts[i] = { x, y, v: 1 }; };
  set(0, 0.5, 0.2); set(11, 0.45, 0.32); set(12, 0.55, 0.32); set(23, 0.47, 0.55); set(24, 0.53, 0.55); set(15, 0.4, 0.1); set(16, 0.6, 0.1);
  const j = jointsFromPose({ present: true, points: pts }, 640, 360, 680);
  for (const k of ["head", "ls", "rs", "le", "re", "lw", "rw", "lh", "rh", "lk", "rk", "la", "ra"]) assert.ok(Number.isFinite(j[k].x) && Number.isFinite(j[k].y), k);
  assert.ok(j.lw.y < j.ls.y, "raised hands stay raised");
  assert.ok(j.la.y > j.lk.y && j.lk.y > j.lh.y, "feet filled in below the knees");
  assert.equal(jointsFromPose({ present: false, points: [] }, 640, 360, 680), null);
  // the pose on the card: arms really go up, and the frog really bends
  assert.ok(poseJoints("reach", 0, 0, 1).lw.y < poseJoints("reach", 0, 0, 1, 0).lw.y);
  assert.ok(poseJoints("squat", 0, 0, 1).lh.y > poseJoints("squat", 0, 0, 1, 0).lh.y);
  const half = smoothJoints(poseJoints("reach", 0, 0, 1, 0), poseJoints("reach", 0, 0, 1, 1), 0.5);
  assert.ok(Number.isFinite(half.lw.y));
  for (const m of Object.keys(body.MOVES)) assert.ok(COSTUMES[m], `${m} has a costume`);
});

test("Tracing: every letter and number has a shape, and the tracer needs the whole path", () => {
  const all = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", ..."0123456789", 10];
  for (const ch of all) {
    const g = GLYPHS[ch];
    assert.ok(g && g.length, `shape for ${ch}`);
    for (const s of g) for (const [x, y] of s) assert.ok(x >= -0.01 && x <= 1.01 && y >= -0.01 && y <= 1.01, `${ch} stays in its box: ${x},${y}`);
  }
  const box = { x: 100, y: 100, w: 400, h: 500 };
  for (const ch of all) {
    const tr = new Tracer(ch, box, { tolerance: 50 });
    let guard = 0;
    while (!tr.done && guard++ < 5000) { const p = tr.next; tr.update(p.x, p.y); }
    assert.ok(tr.done, `${ch} can be finished by following it`);
    assert.equal(tr.progress, 1);
    assert.ok(tr.accuracy() >= 90, `${ch} on the path scores high: ${tr.accuracy()}`);
  }
  // waving somewhere else never finishes it
  const tr = new Tracer("A", box, { tolerance: 50 });
  for (let i = 0; i < 500; i++) tr.update(900 + (i % 7), 650);
  assert.ok(!tr.done); assert.equal(tr.point, 0);
  // it cannot be finished by touching only the start
  const p0 = tr.next; for (let i = 0; i < 50; i++) tr.update(p0.x, p0.y);
  assert.ok(!tr.done); assert.ok(tr.progress < 0.2);
  const pts = resample([[0, 0], [100, 0]], 25);
  assert.equal(pts.length, 5);
  assert.equal(scoreTrace([{ done: true, accuracy: 100 }, { done: false }], 2), 50);
  assert.equal(scoreTrace([], 5), 0);
  assert.deepEqual(applyGain(0.5, 0.5, 2), { x: 0.5, y: 0.5 });
  assert.equal(applyGain(0.9, 0.1, 2).x, 1);
  const b = boxFor({}); assert.ok(b.x > 0 && b.y > 0 && b.x + b.w < 1280 && b.y + b.h < 720);
});

test("Air Letters: pops up B for Ball; levels ask for bigger and more exact movements", () => {
  const L = letters.LEVELS;
  assert.equal(Object.keys(letters.LETTER_WORDS).length, 26);
  for (const [ch, [word]] of Object.entries(letters.LETTER_WORDS)) assert.equal(word[0], ch, `${ch} for ${word}`);
  assert.equal(L.length, 10, "five alphabet levels, then the five shape levels");
  assert.deepEqual(L.slice(0, 5).flatMap((l) => l.items.map((x) => x.ch)).join(""), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "the alphabet in order");
  for (const part of [L.slice(0, 5), L.slice(5)]) for (let i = 1; i < part.length; i++) { assert.ok(part[i].tolerance < part[i - 1].tolerance); assert.ok(part[i].gain < part[i - 1].gain); }
  assert.ok(L[0].items[0].ch === "A" && L[0].items[1].text === "B for Ball");
  const b = L[8].items.find((x) => x.ch === "B");
  assert.equal(b.text, "B for Ball"); assert.match(b.say, /B for Ball/);
  assert.ok(L.flatMap((l) => l.items.map((x) => x.ch)).every((ch) => GLYPHS[ch]));
  const taught = new Set(L.flatMap((l) => l.items.map((x) => x.ch)));
  assert.equal(taught.size, 26, "every letter is taught");
  // play a real level through with a fake camera hand
  const hand = { hand: "right", palm: { x: 0.5, y: 0.5 } };
  const ctx = makeCtx(letters.default, { mode: "sensors", tracker: { hands: [hand] }, level: { ...L[0], gain: 1, items: L[0].items.slice(0, 1) } });
  const g = letters.default.create(ctx);
  g.start();
  for (let i = 0; i < 4000 && !g.done; i++) {
    if (g.tracer && g.tracer.next) { hand.palm = { x: g.tracer.next.x / 1280, y: g.tracer.next.y / 720 }; }
    g.update(0.05);
  }
  assert.ok(g.done);
  const res = g.result();
  assert.equal(res.score >= 60, true); assert.equal(res.metrics.items_done, 1); assert.ok(res.metrics.tracing_accuracy_pct > 50);
  assert.ok(describe({ game: "letters", input_mode: "sensors", completed: true, events: [], metrics: res.metrics }).every((l) => !l.includes("{")));
});

test("Finger Numbers: a different finger each level, only that finger draws, then count with fingers", () => {
  const L = numbers.LEVELS;
  const used = L.filter((l) => l.finger != null).map((l) => l.finger);
  assert.equal(new Set(used).size, used.length, "a different finger each level");
  assert.ok(!used.includes(2), "never the middle finger alone");
  assert.ok(!Object.values(STICKERS).flat().includes("🖕"));
  assert.ok(L.flatMap((l) => l.items.map((x) => x.ch)).includes(10));
  for (let n = 1; n <= 10; n++) { const it = L.flatMap((l) => l.items).find((x) => x.ch === n); assert.ok(it, `number ${n}`); assert.equal(it.pics.length, n); }
  assert.equal(numbers.fingersUp([{ count: 3 }, { count: 5 }]), 8);
  // finger states from landmarks: an open hand, and a pointing hand
  const hand = (up) => {
    const lm = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
    lm[0] = { x: 0.5, y: 0.9 }; lm[9] = { x: 0.5, y: 0.6 }; lm[5] = { x: 0.42, y: 0.6 }; lm[17] = { x: 0.6, y: 0.62 };
    lm[3] = { x: 0.36, y: 0.72 }; lm[4] = up[0] ? { x: 0.26, y: 0.68 } : { x: 0.46, y: 0.68 };
    [[8, 6, 0.42], [12, 10, 0.5], [16, 14, 0.56], [20, 18, 0.62]].forEach(([tip, pip, x], i) => {
      lm[pip] = { x, y: 0.5 };
      lm[tip] = up[i + 1] ? { x, y: 0.3 } : { x, y: 0.65 };
    });
    return lm;
  };
  assert.deepEqual(fingerStates(hand([1, 1, 1, 1, 1])), [true, true, true, true, true]);
  assert.deepEqual(fingerStates(hand([0, 1, 0, 0, 0])), [false, true, false, false, false]);
  assert.deepEqual(fingerStates(hand([0, 0, 0, 0, 0])), [false, false, false, false, false]);
  assert.deepEqual(fingerStates(hand([0, 0, 0, 0, 1])), [false, false, false, false, true]);
  // playing: a curled finger pauses, the right finger draws
  const tip = { x: 0.5, y: 0.5 };
  const h = { hand: "left", fingers: [false, false, false, false, false], count: 0, tips: [tip, tip, tip, tip, tip] };
  const ctx = makeCtx(numbers.default, { mode: "sensors", tracker: { hands: [h] }, level: { ...L[0], gain: 1, items: L[0].items.slice(0, 1) } });
  const g = numbers.default.create(ctx);
  g.start();
  for (let i = 0; i < 40; i++) { if (g.tracer.next) { tip.x = g.tracer.next.x / 1280; tip.y = g.tracer.next.y / 720; } g.update(0.05); }
  assert.equal(g.tracer.reached, 0, "a curled finger draws nothing");
  assert.equal(g.hint, "useFinger");
  h.fingers = [false, true, false, false, false]; h.count = 1;
  for (let i = 0; i < 2000 && !g.done; i++) { if (g.tracer && g.tracer.next) { tip.x = g.tracer.next.x / 1280; tip.y = g.tracer.next.y / 720; } g.update(0.05); }
  assert.ok(g.done);
  const res = g.result();
  assert.equal(res.metrics.finger, "index"); assert.ok(g.isolatedT > 0, "time with only that finger up is measured");
  // counting with fingers needs the right number, held
  const hands = [{ count: 0, fingers: [] }];
  const c = numbers.default.create(makeCtx(numbers.default, { mode: "sensors", tracker: { hands }, level: { ...L[4], items: L[4].items.slice(0, 2) } }));
  c.start();
  const want = L[4].items[0].count;
  hands[0].count = want + 1;
  for (let i = 0; i < 60; i++) c.update(0.05);
  assert.equal(c.results.length, 0, "the wrong number does not count");
  hands[0].count = want;
  for (let i = 0; i < 30; i++) c.update(0.05);
  assert.equal(c.results[0].done, true);
});

test("Balance Tray: tilt from the hands, load pulls the tray, level by level harder", () => {
  assert.equal(Math.round(balance.tiltFromHands({ x: 0, y: 0 }, { x: 1, y: 0 })), 0);
  assert.ok(balance.tiltFromHands({ x: 0, y: 0 }, { x: 1, y: 0.2 }) > 5, "right hand lower: positive");
  assert.equal(balance.loadPull([{ weight: 3, pos: 0.5 }, { weight: 3, pos: -0.5 }], 1), 0, "an even load is level");
  assert.ok(balance.loadPull([{ weight: 3, pos: 0.5 }], 1) > 0, "a heavy load on the right pulls right");
  assert.equal(balance.loadPull([], 1), 0);
  assert.equal(balance.scoreBalance({ steadyPct: 100, kept: 4, total: 4 }), 100);
  assert.equal(balance.scoreBalance({ steadyPct: 0, kept: 0, total: 0 }), 0);
  const L = balance.LEVELS;
  for (let i = 1; i < L.length; i++) { assert.ok(L[i].tol < L[i - 1].tol); assert.ok(L[i].load >= L[i - 1].load); }

  // steady hands keep everything; a steep tilt spills it
  const play = (leftY, rightY) => {
    const hands = [{ palm: { x: 0.3, y: leftY } }, { palm: { x: 0.7, y: rightY } }];
    const g = balance.default.create(makeCtx(balance.default, { mode: "sensors", tracker: { hands }, level: { ...L[1], rounds: 1 } }));
    g.start();
    for (let i = 0; i < 1000 && !g.done; i++) g.update(0.05);
    return g.result();
  };
  const steady = play(0.55, 0.55);
  assert.equal(steady.metrics.items_lost, 0); assert.ok(steady.metrics.steady_pct > 90); assert.ok(steady.score > 90);
  const tilted = play(0.3, 0.8);
  assert.ok(tilted.metrics.items_lost > 0, "fruit slides off"); assert.ok(tilted.score < steady.score);
  assert.equal(tilted.metrics.side_bias, "right");
  // no hands in view: the game waits instead of failing the child
  const none = balance.default.create(makeCtx(balance.default, { mode: "sensors", tracker: { hands: [] }, level: L[0] }));
  none.start();
  for (let i = 0; i < 200; i++) none.update(0.05);
  assert.equal(none.playT, 0);
});

const stick = (over = {}) => {
  // a child standing, shoulders 0.2 wide
  const pts = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, v: 1 }));
  const set = (i, x, y) => { pts[i] = { x, y, v: 1 }; };
  set(0, 0.5, 0.2); set(11, 0.4, 0.3); set(12, 0.6, 0.3); set(13, 0.38, 0.42); set(14, 0.62, 0.42); set(15, 0.37, 0.52); set(16, 0.63, 0.52);
  set(23, 0.44, 0.58); set(24, 0.56, 0.58); set(25, 0.44, 0.74); set(26, 0.56, 0.74); set(27, 0.44, 0.9); set(28, 0.56, 0.9);
  for (const [i, x, y] of Object.values(over)) set(i, x, y);
  return { present: true, points: pts };
};

test("Animal Moves: poses are read from the body, whatever its size", () => {
  const base = baseFrom([measureBody(stick())]);
  const amt = (move, over) => moveAmount(move, measureBody(stick(over)), base);
  assert.equal(measureBody({ present: false, points: [] }), null);
  for (const m of ["reach", "wings", "leanLeft", "leanRight", "squat", "standLeft", "standRight"]) assert.ok(moveAmount(m, measureBody(stick()), base) < 1, `standing still is not ${m}`);
  assert.ok(amt("reach", { a: [15, 0.38, 0.05], b: [16, 0.62, 0.05] }) >= 1);
  assert.ok(amt("reach", { a: [15, 0.38, 0.05] }) < 1, "one hand is not enough");
  assert.ok(amt("wings", { a: [15, 0.1, 0.3], b: [16, 0.9, 0.3] }) >= 1);
  assert.ok(amt("wings", { a: [15, 0.1, 0.05], b: [16, 0.9, 0.05] }) < 1, "arms up is not arms out");
  const lean = (dx) => ({ a: [11, 0.4 + dx, 0.3], b: [12, 0.6 + dx, 0.3] });
  assert.ok(amt("leanRight", lean(0.08)) >= 1); assert.ok(amt("leanLeft", lean(-0.08)) >= 1);
  assert.ok(amt("leanLeft", lean(0.08)) < 0, "right is not left");
  assert.ok(amt("squat", { a: [23, 0.44, 0.72], b: [24, 0.56, 0.72] }) >= 1);
  assert.ok(amt("standLeft", { a: [25, 0.44, 0.62] }) >= 1); assert.ok(amt("standRight", { a: [26, 0.56, 0.62] }) >= 1);
  assert.ok(amt("standRight", { a: [25, 0.44, 0.62] }) < 1, "the left knee is not the right knee");
  assert.equal(moveAmount("squat", measureBody(stick()), null), 0);
  assert.equal(scoreBody(4, 8), 50);
  const L = body.LEVELS;
  assert.deepEqual(L.map((lv) => lv.hold), [5, 10, 15, 20, 25], "holds of 5, 10, 15, 20 and 25 seconds");
  for (const lv of L) { assert.equal(body.poseSequence(lv).length, lv.reps); for (let r = 0; r < lv.reps; r++) assert.equal(body.holdForPose(lv, r), lv.hold); for (const m of lv.seq) assert.ok(body.MOVES[m], m); }
  // out of view: the clock stops
  const tracker = { pose: { present: false, points: [] } };
  const g = body.default.create(makeCtx(body.default, { mode: "sensors", tracker, poseBase: base }));
  g.start();
  for (let i = 0; i < 1000; i++) g.update(0.05);
  assert.equal(g.results.length, 0);
  // making the pose fills the hold and moves on
  tracker.pose = stick({ a: [15, 0.38, 0.05], b: [16, 0.62, 0.05] });
  for (let i = 0; i < 60; i++) g.update(0.05);   // 3 s of the 5 s hold
  // a wobble: the arms dip for a moment, and the hold is kept
  const before = g.hold;
  tracker.pose = stick({ a: [15, 0.38, 0.2], b: [16, 0.62, 0.2] });
  for (let i = 0; i < 6; i++) g.update(0.05);
  assert.ok(g.hold >= before, `a short wobble does not lose the hold (${before} -> ${g.hold})`);
  tracker.pose = stick({ a: [15, 0.38, 0.05], b: [16, 0.62, 0.05] });
  for (let i = 0; i < 50; i++) g.update(0.05);
  assert.equal(g.results[0].done, true);
  assert.equal(g.result().metrics.confirmed_by, "camera");
});

test("Therapy progress: today against last time, and first against latest for each level", () => {
  const r = (level, hold, input = "sensors") => ({ game: "breeze", level, input_mode: input, score: 50, metrics: { longest_hold_sec: hold } });
  const ch = therapyChange(r(1, 3), [r(2, 9), r(1, 2), r(1, 1)]);
  assert.deepEqual([ch.now, ch.before, ch.direction], ["3 s", "2 s", 1]);
  assert.equal(therapyChange(r(1, 3), []).before, null, "the first session has nothing to compare");
  assert.equal(therapyChange(r(1, 3), [r(1, 9, "touch")]).before, null, "touch and microphone are not compared");
  assert.equal(therapyChange({ game: "breeze", level: 1, input_mode: "touch", metrics: {} }, []), null);
  const lines = progressByLevel([r(1, 4), r(1, 3), r(1, 2), r(2, 5)]);
  assert.deepEqual(lines.map((l) => [l.level, l.first, l.latest, l.change, l.sessions]), [[1, "2 s", "4 s", 1, 3], [2, "5 s", "5 s", 0, 1]]);
  for (const g of GAMES) assert.ok(g.id, g.id);
  const gardenR = { game: "garden", level: 1, input_mode: "sensors", metrics: { clear: 3, said_not_checked: 1, items_total: 8 } };
  assert.equal(therapyChange(gardenR, []).now, "50%");
});

test("All the games are complete in English and Urdu", () => {
  assert.deepEqual(GAMES.map((g) => g.id), GAME_IDS);
  assert.equal(STICKER_TOTAL, GAMES.reduce((a, g) => a + g.levels.length, 0));
  for (const g of GAMES) {
    assert.equal(g.levels.length, g.id === "letters" ? 10 : 5, g.id); assert.equal(STICKERS[g.id].length, g.levels.length, g.id);
    assert.equal(g.version, "6.0.0", g.id);
    assert.ok(g.howTo && g.howTo.length >= 3, `${g.id} has how-to-play steps`);
    assert.ok(!/therap|oral-motor|articulation|phonation|motor/i.test(g.focus + g.touchLabel + g.skills.join(" ")), `${g.id}: no therapy words`);
  }
  // every key a game asks for exists
  setLang("ur");
  for (const g of GAMES) for (const f of ["title", "focus", "input", "touch"]) assert.match(gameText(g, f), /[؀-ۿ]/, `${g.id}.${f}`);
  for (const g of GAMES) for (let i = 0; i < g.levels.length; i++) for (const f of ["name", "goal"]) assert.match(levelText(g, i, f), /[؀-ۿ]/, `${g.id}.${i + 1}.${f}`);
  for (const g of GAMES) g.howTo.forEach((_, i) => assert.match(t(`${g.id}.howto.${i + 1}`), /[؀-ۿ]/, `${g.id}.howto.${i + 1}`));
  setLang("en");
  for (const k of ["snd_aah", "snd_eee", "snd_iii", "snd_ooo", "snd_uuu"]) assert.ok(STRING_TABLES.en[k] && STRING_TABLES.ur[k], k);
  assert.ok(t("cueUp").includes("eee")); assert.ok(t("cueDown").includes("aaa"));
});
