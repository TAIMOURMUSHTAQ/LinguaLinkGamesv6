// Browser test of the real microphone path: Chrome plays a generated recording into its fake
// microphone, and the real Mic class has to tell the sounds apart. Then Balloon Breeze and Sky Glide
// are played start to finish by other recordings: noise only, only "aaa", only "eee".
// Usage: start the server (npm start), then: node tests/e2e/voice.mjs [baseUrl]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sleep } from "./cdp.mjs";

const BASE = (process.argv[2] || process.env.BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const OUT = fileURLToPath(new URL("./out/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const checks = [];
const check = (name, pass, detail = "") => { checks.push({ name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };

const SR = 48000;
const VOICE = { // a child's voice
  aah: [290, [1030, 1370, 3170, 4300]], eee: [290, [370, 3200, 3730, 4600]], ooo: [290, [620, 1100, 3180, 4300]],
};
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
function vowel(f0, formants, sec, amp, whisper = false) {
  const n = Math.floor(sec * SR);
  let x = new Float64Array(n), ph = 0;
  for (let i = 0; i < n; i++) {
    if (whisper) x[i] = rnd();
    else { const hz = typeof f0 === "function" ? f0(i / n) : f0; ph += (hz * (1 + 0.015 * Math.sin(i / 2400))) / SR; if (ph >= 1) { ph -= 1; x[i] = 1; } }
  }
  [80, 100, 140, 200].forEach((bw, j) => {
    const F = formants[j], r = Math.exp((-Math.PI * bw) / SR), c = 2 * r * Math.cos((2 * Math.PI * F) / SR), d = -r * r, g = 1 - c - d;
    let y1 = 0, y2 = 0; const y = new Float64Array(n);
    for (let i = 0; i < n; i++) { y[i] = g * x[i] + c * y1 + d * y2; y2 = y1; y1 = y[i]; }
    x = y;
  });
  let m = 0; for (const v of x) m = Math.max(m, Math.abs(v));
  return x.map((v) => (v / m) * amp);
}
const noise = (sec, amp) => Float64Array.from({ length: Math.floor(sec * SR) }, () => rnd() * amp);
// a hiss: white noise with its low frequencies removed
function hiss(sec, amp) {
  const x = noise(sec, 1); let p = 0;
  return x.map((v) => { const y = v - p; p = v; return y * amp; });
}
function claps(sec, amp) {
  const n = Math.floor(sec * SR), x = new Float64Array(n);
  for (let k = 0; k < sec * 3; k++) { const at = Math.floor((k / 3) * SR); for (let i = 0; i < 1800 && at + i < n; i++) x[at + i] = rnd() * amp * Math.exp(-i / 500); }
  return x;
}

// The timeline, in seconds.
const TIMELINE = [
  { name: "room", from: 0, part: () => noise(4, 0.0006) },
  { name: "aah", part: () => vowel(...VOICE.aah, 4, 0.25) },
  { name: "gap", part: () => noise(2, 0.0006) },
  { name: "eee", part: () => vowel(...VOICE.eee, 4, 0.25) },
  { name: "gap", part: () => noise(2, 0.0006) },
  { name: "ooo", part: () => vowel(...VOICE.ooo, 4, 0.25) },
  { name: "gap", part: () => noise(2, 0.0006) },
  { name: "quiet-eee", part: () => vowel(...VOICE.eee, 4, 0.012) },
  { name: "gap", part: () => noise(2, 0.0006) },
  { name: "whisper-aah", part: () => vowel(290, VOICE.aah[1], 4, 0.02, true) },
  { name: "gap", part: () => noise(2, 0.0006) },
  { name: "hiss", part: () => hiss(4, 0.15) },
  { name: "gap", part: () => noise(2, 0.0006) },
  { name: "claps", part: () => claps(4, 0.5) },
  { name: "gap", part: () => noise(2, 0.0006) },
];
let t = 0;
const parts = TIMELINE.map((p) => { const a = p.part(); p.from = t; t += a.length / SR; p.to = t; return a; });
const total = parts.reduce((a, p) => a + p.length, 0);
function writeWav(name, list) {
  const count = list.reduce((a, p) => a + p.length, 0);
  const wav = Buffer.alloc(44 + count * 2);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + count * 2, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(count * 2, 40);
  let o = 44; for (const p of list) for (let i = 0; i < p.length; i++) { wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, p[i])) * 32767), o); o += 2; }
  const file = join(OUT, name);
  writeFileSync(file, wav);
  return file;
}
const wavPath = writeWav("voice-test.wav", parts);

// Play one level through the real game, with a recording as the only input. Quiet room comes first
// so the game can measure the room's noise.
async function playWith(name, sound, game, level, seconds, sample) {
  const file = writeWav(name, [noise(6, 0.0006), ...Array.from({ length: 6 }, () => sound())]);
  const pg = await launch({ profile: join(OUT, "profile-" + name), extraArgs: [`--use-file-for-fake-audio-capture=${file}`] });
  await pg.init();
  await pg.goto(`${BASE}/index.html?mode=sensors&unlock=1&splash=0&music=0`);
  await pg.waitFor("window.LinguaLinkPlay && window.LinguaLinkPlay.games().length>0 && !document.querySelector('#home').hidden", 15000);
  await pg.eval(`window.LinguaLinkPlay.launch('${game}', ${level})`);
  await pg.waitFor("!!document.querySelector('.ov-intro [data-act=start]')", 5000);
  await pg.click(".ov-intro [data-act=start]");
  await pg.waitFor("window.LinguaLinkPlay.runner().state==='play'", 15000);
  const before = pg.logs.length;
  const out = [];
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < seconds) {
    const st = await pg.eval(`(()=>{const r=window.LinguaLinkPlay.runner(); return r && r.state==='play' ? ${sample} : null})()`);
    if (!st) break;
    out.push({ t: (Date.now() - t0) / 1000, ...st });
    await sleep(150);
  }
  const errors = pg.errors(before);
  pg.close();
  await sleep(800);
  return { out, errors };
}

let page;
try {
  page = await launch({ profile: join(OUT, "profile-voice"), extraArgs: [`--use-file-for-fake-audio-capture=${wavPath}`] });
  await page.init();
  await page.goto(`${BASE}/index.html?mode=sensors&unlock=1&splash=0&music=0`);
  await page.waitFor("window.LinguaLinkPlay", 15000);
  // Run the real Mic for one whole pass of the recording, and log what it hears.
  const log = await page.eval(`(async () => {
    const { Mic } = await import('./js/kit/mic.js');
    const mic = new Mic({ vowels: true, onDb: 8, offDb: 5, softDb: 5 });
    await mic.start();
    const t0 = performance.now();
    await mic.calibrateFloor(1.5);
    const out = []; let last = performance.now();
    await new Promise((res) => {
      const iv = setInterval(() => {
        const now = performance.now(); mic.update((now - last) / 1000); last = now;
        out.push({ t: (now - t0) / 1000, speech: mic.speech, voiced: mic.voiced, periodic: mic.steadyVoice, hiss: mic.hiss, vowel: mic.vowel, dir: mic.direction(null), f1: mic.formants && mic.formants.f1, f2: mic.formants && mic.formants.f2, match: { aah: mic.isVowel('aah', 0.8), eee: mic.isVowel('eee', 0.8), ooo: mic.isVowel('ooo', 0.8) } });
        if ((now - t0) / 1000 > ${t.toFixed(1)}) { clearInterval(iv); res(); }
      }, 33);
    });
    mic.stop();
    return { out, floor: mic.floorDb };
  })()`, { awaitPromise: true, timeoutMs: 90000 });
  const rows = log.out;
  const inPart = (name) => {
    const p = TIMELINE.find((x) => x.name === name);
    // leave margin at both ends: the fake microphone starts a little late, and the sound fades in
    return rows.filter((r) => r.t > p.from + 1.2 && r.t < p.to - 0.3);
  };
  const share = (list, f) => (list.length ? Math.round((list.filter(f).length / list.length) * 100) : 0);
  const say = (name, f) => `${share(inPart(name), f)}% of ${inPart(name).length} frames`;
  check("room noise is not speech", share(inPart("room").filter((r) => r.t > 2), (r) => !r.speech) >= 90, say("room", (r) => !r.speech));
  check("aaa is recognised as aaa", share(inPart("aah"), (r) => r.match.aah) >= 80, say("aah", (r) => r.match.aah));
  check("aaa never counts as eee", share(inPart("aah"), (r) => !r.match.eee) >= 95, say("aah", (r) => !r.match.eee));
  check("eee is recognised as eee", share(inPart("eee"), (r) => r.match.eee) >= 80, say("eee", (r) => r.match.eee));
  check("eee never counts as aaa", share(inPart("eee"), (r) => !r.match.aah) >= 95, say("eee", (r) => !r.match.aah));
  check("ooo is recognised as ooo", share(inPart("ooo"), (r) => r.match.ooo) >= 80, say("ooo", (r) => r.match.ooo));
  // v6: the games use the vowel itself (each vowel has its own height), not an up or down reading
  check("a quiet eee is still recognised as eee", share(inPart("quiet-eee"), (r) => r.match.eee) >= 70, say("quiet-eee", (r) => r.match.eee));
  check("a quiet eee never counts as aaa", share(inPart("quiet-eee"), (r) => !r.match.aah) >= 95, say("quiet-eee", (r) => !r.match.aah));
  check("a whispered aaa never counts as eee", share(inPart("whisper-aah"), (r) => !r.match.eee) >= 90, say("whisper-aah", (r) => !r.match.eee));
  check("a whisper is not a real voice for Balloon Breeze", share(inPart("whisper-aah"), (r) => !r.periodic) >= 95, say("whisper-aah", (r) => !r.periodic));
  check("a hiss is not a vowel", share(inPart("hiss"), (r) => r.hiss || !r.vowel) >= 90, say("hiss", (r) => r.hiss || !r.vowel));
  check("a hiss does not fill the balloon", share(inPart("hiss"), (r) => !(r.periodic && (r.match.aah || r.match.eee || r.match.ooo))) >= 95, say("hiss", (r) => !(r.periodic && (r.match.aah || r.match.eee || r.match.ooo))));
  check("claps do not fill the balloon", share(inPart("claps"), (r) => !(r.periodic && (r.match.aah || r.match.eee || r.match.ooo))) >= 95, say("claps", (r) => !(r.periodic && (r.match.aah || r.match.eee || r.match.ooo))));
  writeFileSync(join(OUT, "voice-log.json"), JSON.stringify({ timeline: TIMELINE.map(({ name, from, to }) => ({ name, from, to })), floor: log.floor, rows }, null, 1));
  page.close(); await sleep(800);

  // ---------- Balloon Breeze, level 1 (rounds ask for aaa, eee, aaa, eee) ----------
  const BZ = "{ p: r.game.progress, sound: r.game.sound, round: r.game.round, done: r.game.roundsDone, ready: r.game.ready }";
  const mix = () => { const x = new Float64Array(6 * SR); x.set(claps(2, 0.5), 0); x.set(hiss(2, 0.15), 2 * SR); x.set(noise(2, 0.06), 4 * SR); return x; };
  const noisy = await playWith("noise.wav", mix, "breeze", 0, 40, BZ);
  check("Balloon Breeze: claps, hiss and noise never fill the balloon", noisy.out.length > 50 && noisy.out.every((s) => s.p === 0), `highest ${Math.max(...noisy.out.map((s) => s.p))} over ${noisy.out.length} samples`);
  // the five-vowel voice check comes first (about 15 s), then the rounds: A, then E
  const onlyA = await playWith("only-aah.wav", () => vowel(...VOICE.aah, 8, 0.25), "breeze", 0, 45, BZ);
  const playRows = onlyA.out.filter((s) => s.ready !== false && s.sound);
  const eeeRows = onlyA.out.filter((s) => s.sound === "eee");
  check("Balloon Breeze: a held aaa finishes the aaa round", onlyA.out.some((s) => s.done >= 1), `rounds done ${Math.max(...onlyA.out.map((s) => s.done))}, samples ${playRows.length}`);
  check("Balloon Breeze: a held aaa does nothing in the eee round", eeeRows.length > 10 && eeeRows.every((s) => s.p === 0), `eee samples ${eeeRows.length}, highest ${Math.max(0, ...eeeRows.map((s) => s.p))}`);
  check("Balloon Breeze: no script errors while playing", noisy.errors.length + onlyA.errors.length === 0, JSON.stringify([...noisy.errors, ...onlyA.errors].slice(0, 2)));

  // ---------- Sky Glide, level 1, played by one sound only ----------
  // Each vowel has its own height: U 0.1, O 0.3, A 0.5, I 0.7, E 0.9. The voice check comes first, and
  // with one sound only it does not learn that sound as all five (the built-in sounds are used).
  const GL = "{ h: r.game.birdH, phase: r.game.phase, heard: r.game.heard, hits: r.game.hits }";
  const playOf = (run) => run.out.filter((s) => s.phase === "play");
  const lastH = (run) => { const p = playOf(run); return p.length ? p[p.length - 1].h : null; };
  const band = (run) => { const p = playOf(run).map((s) => s.h); return p.length ? `${Math.min(...p).toFixed(2)}..${Math.max(...p).toFixed(2)}` : "none"; };
  const flyE = await playWith("fly-eee.wav", () => vowel(...VOICE.eee, 8, 0.25), "glide", 0, 45, GL);
  check("Sky Glide: eee flies the bird to the top", lastH(flyE) > 0.8, `height ${lastH(flyE)}`);
  const flyO = await playWith("fly-ooo.wav", () => vowel(...VOICE.ooo, 8, 0.25), "glide", 0, 45, GL);
  check("Sky Glide: ooo flies the bird to the O height", Math.abs(lastH(flyO) - 0.3) < 0.12, `height ${lastH(flyO)}`);
  const flyA = await playWith("fly-aah.wav", () => vowel(...VOICE.aah, 8, 0.25), "glide", 0, 45, GL);
  check("Sky Glide: aaa keeps the bird at the middle (A) height", playOf(flyA).length > 5 && Math.abs(lastH(flyA) - 0.5) < 0.12, `heights ${band(flyA)}`);
  const quietE = await playWith("fly-quiet.wav", () => vowel(...VOICE.eee, 8, 0.012), "glide", 0, 45, GL);
  check("Sky Glide: a quiet eee still flies up", lastH(quietE) > 0.8, `height ${lastH(quietE)}`);
  const whisperA = await playWith("fly-whisper.wav", () => vowel(290, VOICE.aah[1], 8, 0.02, true), "glide", 0, 45, GL);
  check("Sky Glide: a whispered aaa never sends the bird to the top or bottom", playOf(whisperA).length > 5 && playOf(whisperA).every((s) => s.h > 0.2 && s.h < 0.8), `heights ${band(whisperA)}`);
  // silence: the check asks twice, then play starts with the built-in sounds
  const silent = await playWith("fly-silent.wav", () => noise(8, 0.0006), "glide", 0, 60, GL);
  const silentPlay = playOf(silent);
  check("Sky Glide: silence flies straight", silentPlay.length > 5 && silentPlay.every((s) => Math.abs(s.h - 0.5) < 0.02), `samples ${silentPlay.length}, last height ${silentPlay.length ? silentPlay[silentPlay.length - 1].h : "none"}`);

  // ---------- Voice Painter: a low note and a high note in turn move the brush down and up ----------
  // 2 s at 220 Hz, then 2 s at 330 Hz (7 semitones higher), over and over
  const lowHigh = () => { const a = vowel(220, VOICE.aah[1], 2, 0.25), b = vowel(330, VOICE.aah[1], 2, 0.25), x = new Float64Array(a.length + b.length); x.set(a, 0); x.set(b, a.length); return x; };
  const PT = "{ phase: r.game.phase, h: r.game.brushH, on: r.game.on, hz: r.mic && r.mic.pitchHz }";
  const painter = await playWith("pitch-lowhigh.wav", lowHigh, "pitch", 0, 30, PT);
  const painting = painter.out.filter((s) => s.phase === "paint" && s.on && s.hz);
  const lows = painting.filter((s) => s.hz < 260).map((s) => s.h), highs = painting.filter((s) => s.hz > 300).map((s) => s.h);
  const mean = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : NaN);
  check("Voice Painter: the microphone hears the pitch while painting", painting.length > 20, `samples ${painting.length}`);
  check("Voice Painter: a higher note paints higher than a lower note", lows.length > 3 && highs.length > 3 && mean(highs) - mean(lows) > 0.3, `low note height ${mean(lows).toFixed(2)}, high note height ${mean(highs).toFixed(2)}`);
  check("Voice Painter: no script errors while playing", painter.errors.length === 0, JSON.stringify(painter.errors.slice(0, 2)));
} catch (e) {
  check("Test run finished without crashing", false, (e && e.stack) || e);
} finally {
  page && page.close();
  const passed = checks.filter((c) => c.pass).length;
  writeFileSync(join(OUT, "voice-results.json"), JSON.stringify({ passed, total: checks.length, checks }, null, 2));
  console.log(`\n${passed}/${checks.length} voice checks passed.`);
  process.exit(passed === checks.length ? 0 : 1);
}
