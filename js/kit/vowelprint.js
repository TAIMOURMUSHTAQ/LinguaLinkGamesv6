// Vowel fingerprints: recognise a vowel from the whole shape of its sound, learnt from each child.
// Pure functions, no browser needed (unit tested). Nothing leaves the device.
//
// Why: picking the two lowest resonances (vowel.js formants) fails when they merge into one peak, as
// in a man's "aaa" or "ooo", or behind a cheap microphone: a measured "aaa" of 525/2800 Hz (really
// about 730/1090 Hz) was then taken for another vowel. A fingerprint does not pick peaks: it keeps the
// energy in 24 bands from 120 to 4500 Hz on a hearing-like (mel) scale, and turns their shape into 12
// numbers (a cepstrum without its first term, so loudness does not count). The child's own A, E and O
// are learnt the first time each is held; a sound then counts as a vowel when it is close to that
// vowel's fingerprint and clearly further from the others.

export const N_BANDS = 24, N_CEP = 12;
const LO = 120, HI = 4500;
const mel = (f) => 2595 * Math.log10(1 + f / 700);
const imel = (m) => 700 * (Math.pow(10, m / 2595) - 1);

// Band edges in Hz, cached per bin width.
const edgesCache = new Map();
function bandBins(binHz, nBins) {
  const key = binHz + ":" + nBins;
  if (edgesCache.has(key)) return edgesCache.get(key);
  const m0 = mel(LO), m1 = mel(HI), pts = [];
  for (let i = 0; i < N_BANDS + 2; i++) pts.push(imel(m0 + ((m1 - m0) * i) / (N_BANDS + 1)) / binHz);
  const bands = [];
  for (let b = 0; b < N_BANDS; b++) {
    const lo = pts[b], mid = pts[b + 1], hi = pts[b + 2], w = [];
    for (let k = Math.max(1, Math.floor(lo)); k <= Math.min(nBins - 1, Math.ceil(hi)); k++) {
      const v = k < mid ? (k - lo) / Math.max(1e-9, mid - lo) : (hi - k) / Math.max(1e-9, hi - mid);
      if (v > 0) w.push([k, v]);
    }
    bands.push(w);
  }
  edgesCache.set(key, bands);
  return bands;
}

// The fingerprint of one frame of a (room-cleaned) power spectrum: 12 numbers, or null for silence.
export function fingerprint(power, binHz) {
  const bands = bandBins(binHz, power.length);
  const logb = new Float64Array(N_BANDS);
  let total = 0;
  for (let b = 0; b < N_BANDS; b++) {
    let e = 0;
    for (const [k, w] of bands[b]) e += power[k] * w;
    total += e;
    logb[b] = Math.log(e + 1e-14);
  }
  if (!(total > 1e-12)) return null;
  const out = new Float64Array(N_CEP);
  for (let j = 1; j <= N_CEP; j++) {
    let s = 0;
    for (let i = 0; i < N_BANDS; i++) s += logb[i] * Math.cos((Math.PI * j * (i + 0.5)) / N_BANDS);
    out[j - 1] = (s * 2) / N_BANDS;
  }
  return out;
}

// A vowel's template from the frames heard while the child held it: the middle of each number, and
// how much it varies (kept between limits so one very steady or very wobbly hold cannot spoil it).
const SD_MIN = 0.22, SD_MAX = 0.9;
export function makeTemplate(frames, minFrames = 8) {
  const list = frames.filter(Boolean);
  if (list.length < minFrames) return null;
  const mu = new Array(N_CEP).fill(0), sd = new Array(N_CEP).fill(0);
  for (let j = 0; j < N_CEP; j++) {
    const v = list.map((f) => f[j]).sort((a, b) => a - b);
    mu[j] = v[v.length >> 1];                                            // median: robust to odd frames
    const q1 = v[Math.floor(v.length * 0.25)], q3 = v[Math.floor(v.length * 0.75)];
    sd[j] = Math.min(SD_MAX, Math.max(SD_MIN, (q3 - q1) / 1.35));
  }
  return { mu, sd, n: list.length };
}

// Distance of a frame (or the average of a few frames) to a template, in units of its spread.
export function templateDistance(print, tpl) {
  if (!print || !tpl) return Infinity;
  let s = 0;
  for (let j = 0; j < N_CEP; j++) { const z = (print[j] - tpl.mu[j]) / tpl.sd[j]; s += z * z; }
  return Math.sqrt(s / N_CEP);
}

// Two learnt templates are one sound said twice when they are this close (each in the other's units).
export const MIN_TEMPLATE_GAP = 1.2;
export function templateGap(a, b) {
  return (templateDistance(a.mu, b) + templateDistance(b.mu, a)) / 2;
}

// Does this sound count as the target vowel? templates: {vowel: template} learnt from the child.
// lenience 1 (first levels): further from the template is fine, a smaller gap to the others is enough;
// 0 (last levels): close, and clearly closer than to any other learnt vowel.
// Returns null when the target has no template yet (the caller then uses the resonance test).
export function matchTemplate(print, target, templates, lenience = 0.5) {
  const tpl = templates && templates[target];
  if (!tpl || !print) return null;
  const d = templateDistance(print, tpl);
  const reach = 1.6 + 2.2 * lenience;   // 3.8 on the first levels, about 2.1 on the last (U is close to O)
  if (d > reach) return false;
  const gap = 0.35 + 0.5 * (1 - lenience);
  for (const [v, other] of Object.entries(templates)) if (v !== target && other && templateDistance(print, other) - d < gap) return false;
  return true;
}

// The closest learnt vowel, if one is clearly closest (for "I hear ..." and Sky Glide).
export function nearestTemplate(print, templates, lenience = 0.5) {
  let best = null, bd = Infinity;
  for (const [v, t] of Object.entries(templates || {})) { const d = templateDistance(print, t); if (d < bd) { bd = d; best = v; } }
  return best && matchTemplate(print, best, templates, lenience) ? best : null;
}

// Average a few recent fingerprints (a steadier reading than one frame).
export function meanPrint(list) {
  const ok = list.filter(Boolean);
  if (!ok.length) return null;
  const out = new Float64Array(N_CEP);
  for (const p of ok) for (let j = 0; j < N_CEP; j++) out[j] += p[j] / ok.length;
  return out;
}
