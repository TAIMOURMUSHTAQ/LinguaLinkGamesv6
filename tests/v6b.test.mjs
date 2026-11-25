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
  Object.assign(mic, { voiced: true, periodic: true, steadyVoice: true, pitchHz: 220 });
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
    Object.assign(mic, { voiced: true, periodic: true, steadyVoice: true, pitchHz: 220 * Math.pow(2, ((h - 0.5) * 2 * level.range) / 12) });
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
  Object.assign(mic, { voiced: true, periodic: true, steadyVoice: true, pitchHz: 200 }); run(3);
  Object.assign(mic, { voiced: false, periodic: false, pitchHz: null }); run(1.7);
  run(1); assert.ok(g.p > 0.15, "the brush moves without a voice");
  Object.assign(mic, { voiced: true, periodic: true, steadyVoice: true, pitchHz: 200 }); run(5);
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

test("Finger Numbers: the whole hand draws at once when the level's finger is not up; one hand is tracked", async () => {
  const numbers = await import("../js/games/numbers.js");
  const letters = await import("../js/games/letters.js");
  assert.equal(numbers.FALLBACK_AFTER, 0);
  assert.equal(numbers.default.maxHands(numbers.LEVELS[0]), 1, "drawing levels look for one hand: quicker tracking");
  assert.equal(numbers.default.maxHands(numbers.LEVELS[4]), 2, "counting to ten needs two hands");
  assert.equal(letters.default.maxHands, 1);
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

test("Fish Feast puff check: the child's own puff is learnt, and then 60% of it counts", async () => {
  const mouth = await import("../js/games/mouth.js");
  mouth.forgetPuff();
  const base = { jawOpen: 0.02, openR: 0.02, mouthW: 0.4, smile: 0.05, puff: 0.01, cheekW: 1.0, cheekW2: 1.2, cheekW3: 0.9, cheekZ: 0 };
  // this face: the model's puff score hardly moves, the lower cheeks widen by 2%
  const puffed = { ...base, puff: 0.02, cheekW2: 1.2 * 1.02 };
  assert.ok(!mouth.moveActive("puff", puffed, base), "the textbook mix misses this small puff");
  const frames = Array.from({ length: 30 }, (_, i) => {
    const f = { ...puffed, cheekW2: 1.2 * (1 + 0.02 * (0.9 + (i % 5) * 0.05)) };
    return Object.fromEntries(mouth.PUFF_SIGNALS.map(([n, k]) => [n, mouth.puffSignal(f, base, n, k)]));
  });
  const learnt = mouth.learnPuff(frames);
  assert.ok(learnt && learnt.cheekW2 > 0.015 && !learnt.puff, JSON.stringify(learnt));
  mouth.rememberPuff(learnt);
  assert.ok(mouth.moveActive("puff", puffed, base), "after the check the same puff counts");
  assert.ok(mouth.moveActive("puff", { ...base, cheekW2: 1.2 * 1.015 }, base), "two thirds of the child's puff counts");
  assert.ok(!mouth.moveActive("puff", { ...base, cheekW2: 1.2 * 1.005 }, base), "a quarter of it does not");
  assert.ok(!mouth.moveActive("puff", { ...puffed, openR: 0.3 }, base), "an open mouth holds no air");
  assert.ok(!mouth.moveActive("puff", { ...puffed, smile: 0.5, mouthW: 0.46 }, base), "a smile is not a puff");
  assert.equal(mouth.learnPuff(frames.map(() => ({ puff: 0, cheekW: 0, cheekW2: 0.001, cheekW3: 0, cheekZ: 0 }))), null, "nothing moved: nothing learnt");
  mouth.forgetPuff();
});

test("Fish Feast: a puff move starts with the puff check in camera mode, once per visit", async () => {
  const mouth = await import("../js/games/mouth.js");
  mouth.forgetPuff();
  const base = { jawOpen: 0.02, openR: 0.02, mouthW: 0.4, smile: 0.05, puff: 0.01, cheekW: 1.0, cheekW2: 1.2, cheekW3: 0.9, cheekZ: 0 };
  const tracker = { face: { present: true, ...base } };
  const ctx = makeCtx(mouth.default, { mode: "sensors", tracker, faceBase: base, level: { ...mouth.LEVELS[0], seq: ["puff", "open"], reps: 2 } });
  const g = mouth.default.create(ctx);
  g.start();
  assert.equal(g.state, "puffcheck");
  const run = (sec) => { for (let i = 0; i < sec * 20; i++) g.update(0.05); };
  tracker.face = { present: true, ...base, cheekW: 1.03, cheekZ: 0.02 }; run(4);
  assert.equal(g.state, "cue", "then the puff move itself");
  assert.ok(mouth.learntPuff() && mouth.learntPuff().cheekW > 0.02, JSON.stringify(mouth.learntPuff()));
  run(6);
  assert.ok(g.results.length >= 1 && g.results[0].done, "the learnt puff is held for the level's time");
  mouth.forgetPuff();
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

test("Voice Painter: a slipped pitch reading does not make the brush jump, a real jump is followed", () => {
  const tr = new pitch.PitchTrack();
  assert.equal(tr.push(0), null, "a sound starts once two readings agree");
  assert.ok(Math.abs(tr.push(0.3) - 0.15) < 0.2);
  const steady = tr.est;
  assert.ok(Math.abs(tr.push(12) - steady) < 0.5, "an octave slip is folded back");
  assert.ok(Math.abs(tr.push(-9) - steady) < 0.5, "one far reading is dropped");
  for (const st of [0.5, 1, 1.5, 2, 2.5]) tr.push(st);
  assert.ok(tr.est > 1.8, `a voice sliding up is followed (${tr.est})`);
  for (const st of [7, 7.2, 7.1]) tr.push(st);
  assert.ok(Math.abs(tr.est - 7.1) < 0.3, `a real step up is followed after three readings (${tr.est})`);
});

test("Balance Tray: one hand holds the tray, and fallen fruit is replaced while the game waits for hands", async () => {
  const bal = await import("../js/games/balance.js");
  const flat = { knuckles: [{ x: 0.4, y: 0.5 }, { x: 0.5, y: 0.5 }] };
  const tipped = { knuckles: [{ x: 0.5, y: 0.55 }, { x: 0.4, y: 0.5 }] };
  assert.equal(bal.tiltFromOneHand(flat), 0);
  assert.ok(bal.tiltFromOneHand(tipped) > 20, "right side lower: tilt to the right");
  const hand = (x, y, k = flat.knuckles) => ({ palm: { x, y }, knuckles: k, hand: "right" });
  const tracker = { hands: [hand(0.4, 0.5), hand(0.6, 0.5)] };
  const ctx = makeCtx(bal.default, { mode: "sensors", tracker, level: bal.LEVELS[0] });
  const g = bal.default.create(ctx);
  g.start();
  const run = (sec) => { for (let i = 0; i < sec * 20; i++) g.update(0.05); };
  run(3);
  assert.equal(g.state, "carry");
  tracker.hands = [hand(0.5, 0.5)]; run(2);
  assert.equal(g.handsMissing, 0, "one hand is enough to keep playing");
  assert.ok(g.single, "the one hand holds the tray");
  // a fruit falls off, then the hands leave the picture: a new fruit still comes at once
  g.items.forEach((it) => { it.fall = 0; it.pos = 1.5; });
  run(0.1);
  tracker.hands = []; run(1.5);
  assert.ok(g.items.some((it) => !it.off), "a new fruit is on the tray while the game waits for the hands");
});

test("Balloon Breeze (v6.3): no voice check screen; each round prompts its sound and learns the child's vowel", async () => {
  const breeze = (await import("../js/games/breeze.js")).default;
  const { forgetVowels } = await import("../js/kit/vowelcheck.js");
  forgetVowels();
  const mic = { voiced: false, speech: false, periodic: false, hiss: false, selfSound: false, level01: 0, rise: 0, vowel: null, formants: null, personal: null, _want: null,
    isVowel(v) { return this._want === v; }, isClearVowel(v) { return this._want === v; }, setAnchors(a) { this.personal = a; } };
  const ctx = makeCtx(breeze, { mode: "sensors", mic, level: breeze.levels[0] });
  const g = breeze.create(ctx);
  assert.equal(g.phase, "play", "straight into play, no check screen");
  g.start();
  assert.equal(g.sound, "aah"); assert.ok(g.learn, "A is learnt during its first round");
  const run = (sec) => { for (let i = 0; i < sec * 20; i++) g.update(0.05); };
  run(2.4);   // the prompt
  Object.assign(mic, { voiced: true, periodic: true, _want: "aah", vowel: "aah", formants: { f1: 1000, f2: 1400 } });
  run(2);
  assert.ok(mic.personal && mic.personal.aah, "the child's own A is learnt");
  assert.ok(g.progress > 0.2, `and the balloon fills meanwhile: ${g.progress}`);
  forgetVowels();
});

test("Fish Feast (v6.3): a tongue move is learnt first, then 60% of the child's own move counts", async () => {
  const mouth = await import("../js/games/mouth.js");
  mouth.forgetTongue();
  const base = { jawOpen: 0.02, openR: 0.02, mouthW: 0.4, tongueDown: 0 };
  const tracker = { face: { present: true, ...base } };
  const ctx = makeCtx(mouth.default, { mode: "sensors", tracker, faceBase: base, level: { ...mouth.LEVELS[0], seq: ["tongueOut"], reps: 1 } });
  const g = mouth.default.create(ctx);
  g.start();
  assert.equal(g.state, "tonguecheck");
  const run = (sec) => { for (let i = 0; i < sec * 20; i++) g.update(0.05); };
  tracker.face = { present: true, ...base, openR: 0.06, tongueDown: 0.02 }; run(4);
  assert.equal(g.state, "cue");
  assert.ok(Math.abs(mouth.learntTongue("tongueOut").gain - 0.02) < 0.002);
  assert.ok(mouth.moveActive("tongueOut", { ...base, openR: 0.06, tongueDown: 0.014 }, base), "70% of the child's own move counts");
  assert.ok(!mouth.moveActive("tongueOut", { ...base, openR: 0.06, tongueDown: 0.006 }, base), "30% does not");
  mouth.forgetTongue();
});

test("Word Garden (v6.3): the word list's own order, and Urdu letters with their sound", async () => {
  const { gardenItems, urduLetterSound } = await import("../js/kit/wordgarden.js");
  const { WORDS_EN, SOUNDS_EN } = await import("../js/kit/wordlist.js");
  const mix = gardenItems({ levelIndex: 0 });
  assert.deepEqual(mix.slice(0, 4).map((i) => i.sound), SOUNDS_EN.slice(0, 4).map((s) => s.id), "sounds in the list's order");
  assert.deepEqual(mix.slice(0, 2).map((i) => i.plain), [WORDS_EN.p.initial[0], WORDS_EN.b.initial[0]]);
  const s = gardenItems({ sound: "s", levelIndex: 0 });
  assert.deepEqual(s.map((i) => i.plain), WORDS_EN.s.initial.slice(0, 8), "a chosen sound's words in the list's order");
  const next = gardenItems({ sound: "s", levelIndex: 0, play: 1 });
  assert.equal(next[0].plain, WORDS_EN.s.initial[8], "the next play continues where the last stopped");
  assert.equal(urduLetterSound("م"), "ما");
  assert.equal(urduLetterSound("س"), "سا");
});

// Vowel fingerprints (vowelprint.js): a power spectrum built from harmonics of the voice, shaped by
// the vowel's resonances (fast: no FFT needed).
const VP = await import("../js/kit/vowelprint.js");
const { learnPrint } = await import("../js/kit/vowelcheck.js");
function vowelSpectrum(f0, formants, { gain = 1, tilt = 0, seed = 1 } = {}) {
  const binHz = 48000 / 2048, out = new Float64Array(384);
  let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const bws = [80, 100, 140, 200];
  for (let h = f0; h < 9000; h += f0) {
    let a = 1 / (1 + h / 500);                       // the voice's natural roll-off
    formants.forEach((F, j) => { const bw = bws[j]; a *= (F / bw) / Math.sqrt(((h * h - F * F) / (F * bw)) ** 2 + 1); });   // each resonance: gain 1 far below it, F/bw at its peak
    a *= Math.pow(h / 1000, tilt);                   // a microphone that favours lows or highs
    const k = Math.round(h / binHz); if (k > 0 && k < out.length) out[k] += a * a * gain * (0.8 + 0.4 * rnd());
  }
  for (let k = 0; k < out.length; k++) out[k] += 1e-12;
  return { power: out, binHz };
}
const MAN = { aah: [650, 980, 2500, 3400], ehh: [520, 1800, 2500, 3400], ooo: [480, 800, 2500, 3400], eee: [280, 2250, 3000, 3600] };
const framesFor = (f0, F, opt = {}) => Array.from({ length: 12 }, (_, i) => { const { power, binHz } = vowelSpectrum(f0 * (1 + 0.01 * Math.sin(i)), F, { ...opt, seed: i + 1 + (opt.seed || 0) }); return VP.fingerprint(power, binHz); });

test("Vowel fingerprints: a man's A, E and O (close resonances) are told apart; loudness and pitch do not matter", () => {
  const tpl = {};
  for (const v of ["aah", "ehh", "ooo"]) tpl[v] = learnPrint(v, framesFor(112, MAN[v]), tpl);
  for (const v of ["aah", "ehh", "ooo"]) assert.ok(tpl[v], `${v} learnt`);
  for (const v of ["aah", "ehh", "ooo"]) {
    // a second take: another pitch, much softer, through a microphone with less treble
    const take = VP.meanPrint(framesFor(120, MAN[v], { gain: 0.05, tilt: -0.3, seed: 50 }).slice(0, 3));
    for (const t of ["aah", "ehh", "ooo"]) assert.equal(VP.matchTemplate(take, t, tpl, 0.25), t === v, `said ${v}, asked ${t}`);
    assert.equal(VP.nearestTemplate(take, tpl, 0.5), v);
  }
  // "eee" is none of them
  const eee = VP.meanPrint(framesFor(112, MAN.eee).slice(0, 3));
  for (const t of ["aah", "ehh", "ooo"]) assert.equal(VP.matchTemplate(eee, t, tpl, 1), false, `eee is not ${t}`);
  // no template yet: the caller falls back to the resonance test
  assert.equal(VP.matchTemplate(eee, "uuu", tpl, 1), null);
  assert.equal(VP.fingerprint(new Float64Array(384), 48000 / 2048), null, "silence has no fingerprint");
});

test("Vowel fingerprints: the same sound said for two vowels is refused, so they stay apart", () => {
  const a = learnPrint("aah", framesFor(112, MAN.aah), {});
  assert.ok(a);
  assert.equal(learnPrint("ehh", framesFor(118, MAN.aah, { seed: 9 }), { aah: a }), null, "an A held when E was asked is not learnt as E");
  assert.equal(learnPrint("ehh", framesFor(112, MAN.ehh).slice(0, 4), { aah: a }), null, "too short a hold is not learnt");
});

test("Mic: a learnt fingerprint decides; without one the resonance test still does", async () => {
  const { Mic } = await import("../js/kit/mic.js");
  const m = new Mic({ vowels: true });
  m.vowelDist = { aah: 9, ehh: 0.2, ooo: 9, eee: 9, uuu: 9 };       // the resonances say E...
  const tpl = { aah: learnPrint("aah", framesFor(112, MAN.aah), {}) };
  m.print = VP.meanPrint(framesFor(112, MAN.aah, { seed: 3 }).slice(0, 3));   // ...but the sound is the child's A
  assert.equal(m.isClearVowel("aah", 0.25), false, "no fingerprint yet: resonances decide");
  m.setTemplates(tpl);
  assert.equal(m.isClearVowel("aah", 0.25), true, "the child's own A is heard as A");
  assert.equal(m.isClearVowel("ehh", 0.25), true, "E has no fingerprint yet, so the resonance test still decides");
  m.print = null;
  assert.equal(m.isClearVowel("aah", 1), false, "no sound, no A");
});

test("Mic: a sound the resonances clearly call another vowel is not learnt (O and U excepted)", async () => {
  const { Mic } = await import("../js/kit/mic.js");
  const m = new Mic({ vowels: true });
  m.vowelDist = { aah: 0.2, ehh: 9, ooo: 9, eee: 9, uuu: 9 };       // a clear "aaa"
  assert.equal(m.clearlyOtherThan("ooo"), true, "a clear aaa is not learnt as O");
  assert.equal(m.clearlyOtherThan("aah"), false, "...but is learnt as A");
  m.vowelDist = { aah: 9, ehh: 9, ooo: 9, eee: 0.2, uuu: 9 };       // a clear "eee"
  assert.equal(m.clearlyOtherThan("ehh"), true, "eee is not learnt as E");
  m.vowelDist = { aah: 9, ehh: 9, ooo: 9, eee: 9, uuu: 0.2 };       // an O read as U on a real device
  assert.equal(m.clearlyOtherThan("ooo"), false, "an O that reads as U can still be learnt as O");
  m.vowelDist = null;
  assert.equal(m.clearlyOtherThan("ooo"), false, "no reading: no objection");
});

test("Voice detector: on at once, rides over short dips, off after a quarter second of quiet", async () => {
  const { vadStep, VAD_ON, VAD_OFF, VAD_HANG } = await import("../js/kit/vad.js");
  let s = null;
  s = vadStep(s, 0.1, 0.032); assert.equal(s.speaking, false, "quiet stays off");
  s = vadStep(s, VAD_ON + 0.01, 0.032); assert.equal(s.speaking, true, "speech turns it on in one chunk");
  s = vadStep(s, (VAD_ON + VAD_OFF) / 2, 0.032); assert.equal(s.speaking, true, "between the thresholds it stays on");
  let t = 0;
  while (t < VAD_HANG - 0.05) { s = vadStep(s, 0.05, 0.032); t += 0.032; }
  assert.equal(s.speaking, true, "a dip shorter than the hangover does not switch it off");
  s = vadStep(s, 0.6, 0.032);
  for (let i = 0; i < Math.ceil(VAD_HANG / 0.032) + 1; i++) s = vadStep(s, 0.05, 0.032);
  assert.equal(s.speaking, false, "sustained quiet switches it off");
});
