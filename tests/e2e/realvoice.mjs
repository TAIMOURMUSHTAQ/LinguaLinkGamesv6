// Browser stress test of vowel recognition with a lifelike voice, through Chrome's fake microphone
// and the real Mic class. Harder than voice.mjs: a natural voice source (glottal pulses with jitter,
// shimmer, vibrato and breath), room echo, mains hum, fan noise and a cheap microphone. Each vowel is
// learnt from its first hold, as Balloon Breeze and Sky Glide do, then a second hold of every vowel
// (another pitch and loudness) is judged.
// Usage: start the server (npm start), then: node tests/e2e/realvoice.mjs [baseUrl]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sleep } from "./cdp.mjs";

const BASE = (process.argv[2] || process.env.BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const OUT = fileURLToPath(new URL("./out/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const SR = 48000;
let seed = 11;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
const gauss = () => rnd() + rnd() + rnd();

// Formants (F1..F4) per voice. "man" has the close A/O of a real male "aaa".
export const VOICES = {
  man: { f0: 108, F: { aah: [680, 1060, 2450, 3400], ehh: [530, 1780, 2480, 3400], eee: [290, 2250, 2950, 3550], ooo: [470, 820, 2450, 3350], uuu: [320, 860, 2250, 3300], mmm: [250, 1100, 2200, 3300] } },
  child: { f0: 285, F: { aah: [1000, 1350, 3150, 4300], ehh: [680, 2380, 3250, 4300], eee: [380, 3150, 3700, 4600], ooo: [620, 1080, 3150, 4300], uuu: [440, 1150, 3250, 4400], mmm: [300, 1300, 2600, 3800] } },
};

// A natural voice: Rosenberg glottal pulses (the voice's own treble roll-off), jitter, shimmer,
// a slow pitch drift and vibrato, breathiness, a soft onset and offset, then the vocal tract.
function voice(f0, F, sec, amp, { hum = false } = {}) {
  const n = Math.floor(sec * SR);
  let x = new Float64Array(n);
  let i = 0, period = SR / f0, gain = 1, drift = 0;
  while (i < n) {
    drift += gauss() * 0.004; drift *= 0.97;
    const hz = f0 * (1 + drift + 0.012 * Math.sin((2 * Math.PI * 5.2 * i) / SR));
    period = (SR / hz) * (1 + gauss() * 0.006);                 // jitter
    gain = 1 + gauss() * 0.04;                                   // shimmer
    const T = Math.floor(period), open = Math.floor(T * 0.6), close = Math.floor(T * 0.15);
    for (let k = 0; k < T && i + k < n; k++) {
      let g = 0;
      if (k < open) g = 0.5 * (1 - Math.cos((Math.PI * k) / open));
      else if (k < open + close) g = Math.cos((Math.PI * (k - open)) / (2 * close));
      x[i + k] = g * gain;
    }
    i += T;
  }
  // derivative (lip radiation) + breath noise
  let prev = 0;
  for (let k = 0; k < n; k++) { const d = x[k] - prev; prev = x[k]; x[k] = d + rnd() * 0.004; }
  const bws = hum ? [60, 200, 250, 300] : [70, 95, 140, 200];
  F.forEach((Fq, j) => {
    const r = Math.exp((-Math.PI * bws[j]) / SR), c = 2 * r * Math.cos((2 * Math.PI * Fq) / SR), d = -r * r, g = 1 - c - d;
    let y1 = 0, y2 = 0; const y = new Float64Array(n);
    for (let k = 0; k < n; k++) { y[k] = g * x[k] + c * y1 + d * y2; y2 = y1; y1 = y[k]; }
    x = y;
  });
  if (hum) { let lp = 0; x = x.map((v) => (lp = lp * 0.93 + v * 0.07)); }  // closed lips: little above 600 Hz
  let m = 0; for (const v of x) m = Math.max(m, Math.abs(v));
  const fade = Math.floor(0.12 * SR);
  return x.map((v, k) => (v / m) * amp * Math.min(1, k / fade, (n - k) / fade));
}
// The room: pink-ish noise, 50 Hz mains hum with harmonics, a fan.
function room(sec, amp) {
  const n = Math.floor(sec * SR), x = new Float64Array(n);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let k = 0; k < n; k++) {
    const w = rnd();
    b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527;
    const t = k / SR;
    x[k] = amp * ((b0 + b1 + b2 + w * 0.18) * 0.5 + 0.4 * Math.sin(2 * Math.PI * 50 * t) + 0.2 * Math.sin(2 * Math.PI * 150 * t) + 0.15 * Math.sin(2 * Math.PI * 233 * t + Math.sin(t)));
  }
  return x;
}
// Room echo (a small Schroeder reverb) and a cheap microphone (no deep bass, little treble).
function roomAndMic(x) {
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ d, buf: new Float64Array(d), i: 0 }));
  const aps = [225, 556].map((d) => ({ d, buf: new Float64Array(d), i: 0 }));
  const y = new Float64Array(x.length);
  for (let k = 0; k < x.length; k++) {
    let s = 0;
    for (const c of combs) { const o = c.buf[c.i]; c.buf[c.i] = x[k] + o * 0.72; c.i = (c.i + 1) % c.d; s += o; }
    for (const a of aps) { const o = a.buf[a.i]; const v = s + o * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.d; s = o - v * 0.5; }
    y[k] = x[k] + s * 0.12;
  }
  let lp = 0, hpPrev = 0, hp = 0;
  return y.map((v) => { lp = lp * 0.55 + v * 0.45; hp = 0.985 * (hp + lp - hpPrev); hpPrev = lp; return hp; });
}

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

// The timeline for one voice: room, the first hold of A, E and O (learnt), then a second hold of every
// sound at another pitch and loudness.
function timeline(who) {
  const v = VOICES[who], parts = [];
  const add = (name, x) => parts.push({ name, x });
  const NOISE = 0.0025;
  const gap = (s = 1.6) => add("gap", room(s, NOISE));
  add("room", room(4, NOISE));
  for (const s of ["aah", "ehh", "ooo"]) { add("learn-" + s, voice(v.f0, v.F[s], 3, 0.22)); gap(); }
  const tests = [["aah", 1.07, 0.1], ["ehh", 0.94, 0.35], ["ooo", 1.1, 0.12], ["eee", 1, 0.2], ["uuu", 1, 0.2], ["mmm", 1, 0.15], ["aah", 0.9, 0.05], ["ooo", 0.95, 0.3], ["ehh", 1.08, 0.08]];
  for (const [s, p, a] of tests) { add("test-" + s, voice(v.f0 * p, v.F[s], 4, a, { hum: s === "mmm" })); gap(); }
  let t = 0;
  const mixed = parts.map((p) => { const out = { name: p.name, from: t, to: t + p.x.length / SR }; t = out.to; return out; });
  const all = new Float64Array(parts.reduce((a, p) => a + p.x.length, 0));
  let o = 0; for (const p of parts) { all.set(p.x, o); o += p.x.length; }
  // the room keeps going under the voice
  const bed = room(all.length / SR, NOISE);
  for (let k = 0; k < all.length; k++) all[k] += bed[k];
  return { file: writeWav(`realvoice-${who}.wav`, [roomAndMic(all)]), parts: mixed, total: t };
}

const results = { checks: [], detail: {} };
const check = (name, pass, detail = "") => { results.checks.push({ name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };

async function runVoice(who) {
  const { file, parts, total } = timeline(who);
  const pg = await launch({ profile: join(OUT, "profile-real-" + who), extraArgs: [`--use-file-for-fake-audio-capture=${file}`] });
  try {
    await pg.init();
    await pg.goto(`${BASE}/index.html?mode=sensors&unlock=1&splash=0&music=0`);
    await pg.waitFor("window.LinguaLinkPlay", 15000);
    const ev = await pg.send("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression: `(async () => {
      const { Mic } = await import('./js/kit/mic.js');
      const { learnPrint } = await import('./js/kit/vowelcheck.js');
      const parts = ${JSON.stringify(parts)};
      const mic = new Mic({ vowels: true, onDb: 9, offDb: 5, softDb: 7 });   // Balloon Breeze's settings
      await mic.start();
      const t0 = performance.now();
      await mic.calibrateFloor(1.5);
      const rows = []; let last = performance.now(); const learn = {}; let lastPrint = null;
      const partAt = (t) => parts.find((p) => t >= p.from && t < p.to);
      await new Promise((res) => {
        const iv = setInterval(() => {
          const now = performance.now(); mic.update((now - last) / 1000); last = now;
          const t = (now - t0) / 1000, p = partAt(t);
          const heard = (mic.voiced || mic.speech) && mic.periodic && !mic.hiss;
          // learning, as the games do: the first 1.6 s of voice in a learn hold
          if (p && p.name.startsWith('learn-') && heard && mic.lastPrint && mic.lastPrint !== lastPrint) {
            const v = p.name.slice(6); (learn[v] ||= []).push(mic.lastPrint); lastPrint = mic.lastPrint;
          }
          if (p && p.name.startsWith('gap')) for (const [v, fr] of Object.entries(learn)) if (!mic.templates[v] && fr.length) {
            const tpl = learnPrint(v, fr.slice(0, 32), mic.templates);
            if (tpl) mic.setTemplates({ ...mic.templates, [v]: tpl });
            window.__learnt = { ...(window.__learnt || {}), [v]: { ok: !!tpl, frames: fr.length } };
          }
          const td = mic.templateDistances();
          rows.push({ t, part: p && p.name, heard, voiced: mic.voiced, speech: mic.speech, periodic: mic.periodic, hiss: mic.hiss, hum: mic.isHum(),
            f: mic.formants && [Math.round(mic.formants.f1), Math.round(mic.formants.f2)],
            d: Object.fromEntries(Object.entries(td).map(([k, v]) => [k, v == null ? null : Math.round(v * 10) / 10])),
            easy: Object.fromEntries(['aah', 'ehh', 'ooo'].map((v) => [v, mic.isClearVowel(v, 1)])),
            hard: Object.fromEntries(['aah', 'ehh', 'ooo'].map((v) => [v, mic.isClearVowel(v, 0.25)])) });
          if (t > ${total.toFixed(1)}) { clearInterval(iv); res(); }
        }, 33);
      });
      mic.stop();
      return { rows, learnt: window.__learnt || {}, floor: mic.floorDb };
    })()` }, 240000);
    const log = ev.result && ev.result.exceptionDetails ? { error: ev.result.exceptionDetails.exception?.description || ev.result.exceptionDetails.text } : ev.result?.result?.value;
    return { log, parts };
  } finally { pg.close(); await sleep(800); }
}

try {
  for (const who of ["man", "child"]) {
    const { log, parts } = await runVoice(who);
    if (!log || !log.rows) { console.log("NO LOG:", JSON.stringify(log).slice(0, 800)); throw new Error("no log"); }
    const rows = log.rows;
    results.detail[who] = { learnt: log.learnt, floor: log.floor, parts, rows };
    for (const v of ["aah", "ehh", "ooo"]) check(`${who}: ${v} learnt from its first hold`, log.learnt[v] && log.learnt[v].ok, JSON.stringify(log.learnt[v] || null));
    const inPart = (name) => {
      const out = [];
      for (const p of parts.filter((x) => x.name === name)) out.push(...rows.filter((r) => r.t > p.from + 0.8 && r.t < p.to - 0.4));
      return out;
    };
    const pct = (list, f) => (list.length ? Math.round((list.filter(f).length / list.length) * 100) : 0);
    for (const v of ["aah", "ehh", "ooo"]) {
      const l = inPart("test-" + v);
      check(`${who}: ${v} heard as a real voice`, pct(l, (r) => r.heard) >= 85, `${pct(l, (r) => r.heard)}% of ${l.length}`);
      check(`${who}: ${v} recognised (first levels)`, pct(l, (r) => r.heard && r.easy[v]) >= 75, `${pct(l, (r) => r.heard && r.easy[v])}%`);
      check(`${who}: ${v} recognised (last levels)`, pct(l, (r) => r.heard && r.hard[v]) >= 60, `${pct(l, (r) => r.heard && r.hard[v])}%`);
      for (const o of ["aah", "ehh", "ooo"]) if (o !== v) check(`${who}: ${v} never counts as ${o}`, pct(l, (r) => r.heard && r.easy[o]) <= 5, `${pct(l, (r) => r.heard && r.easy[o])}%`);
    }
    for (const s of ["eee", "mmm"]) {
      const l = inPart("test-" + s);
      check(`${who}: ${s} counts as none of A, E, O (first levels)`, pct(l, (r) => r.heard && (r.easy.aah || r.easy.ehh || r.easy.ooo)) <= 10, `${pct(l, (r) => r.heard && (r.easy.aah || r.easy.ehh || r.easy.ooo))}%`);
    }
    const u = inPart("test-uuu");
    check(`${who}: uuu not taken for O on the last levels (known close pair)`, pct(u, (r) => r.heard && r.hard.ooo) <= 50, `${pct(u, (r) => r.heard && r.hard.ooo)}%`);
    const roomRows = inPart("gap");
    check(`${who}: room noise is never a vowel`, pct(roomRows, (r) => r.heard && (r.easy.aah || r.easy.ehh || r.easy.ooo)) <= 2, `${pct(roomRows, (r) => r.heard && (r.easy.aah || r.easy.ehh || r.easy.ooo))}%`);
  }
} catch (e) {
  check("Test run finished without crashing", false, (e && e.stack) || e);
} finally {
  const passed = results.checks.filter((c) => c.pass).length;
  writeFileSync(join(OUT, "realvoice-results.json"), JSON.stringify(results, null, 1));
  console.log(`\n${passed}/${results.checks.length} real-voice checks passed.`);
  process.exit(passed === results.checks.length ? 0 : 1);
}
