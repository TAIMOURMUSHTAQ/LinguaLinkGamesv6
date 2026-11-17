// Vowel recognition for the voice games: which sound is the child making?
// The five held vowels, one per letter, chosen so no two sound alike when held:
//   A "aaa" (father), E "ehh" (egg), I "eee" (see), O "ooo" (go), U "uuu" (moon).
// (Before 6.0.1, E was "eee" and I was "iii"; held out, those are the same sound.)
// Pure functions, no browser needed (unit tested), and nothing leaves the device.
//
// A vowel is identified by its first two formants (F1, F2), the resonances of the mouth:
//   eee: low F1, very high F2     aaa: high F1, F2 close to F1     ooo/uuu: low F1, low F2
// Steps: subtract the room's noise from the spectrum, fit an all-pole (LPC) model to get a smooth
// spectral envelope, read F1 and F2 from its peaks, then compare with reference values. Men, women
// and children have different vocal tract lengths, so references are chosen by voice pitch.
export const VOWELS = ["aah", "ehh", "eee", "ooo", "uuu"];

// [F1, F2] in Hz for [man, woman, child]. Based on Peterson & Barney (1952) and Hillenbrand (1995).
const REF = {
  aah: [[730, 1090], [850, 1220], [1030, 1370]],
  eee: [[270, 2290], [310, 2790], [370, 3200]],
  ehh: [[530, 1850], [620, 2200], [690, 2400]],
  ooo: [[500, 850], [540, 950], [620, 1100]],
  uuu: [[300, 870], [370, 950], [430, 1170]],
};
const SIGMA = 0.22; // spread of one vowel in log-frequency units

// Voice type from pitch: 0 man, 1 woman, 2 child (in between is allowed).
export function voiceType(f0) {
  if (!f0) return 1;
  if (f0 <= 130) return 0;
  if (f0 <= 210) return (f0 - 130) / 80;
  if (f0 <= 280) return 1 + (f0 - 210) / 70;
  return 2;
}

export function reference(vowel, type = 1) {
  const r = REF[vowel];
  const i = Math.min(1, Math.floor(type)), k = type - i;
  return [Math.exp(Math.log(r[i][0]) * (1 - k) + Math.log(r[i + 1][0]) * k), Math.exp(Math.log(r[i][1]) * (1 - k) + Math.log(r[i + 1][1]) * k)];
}

// Distance between two (F1, F2) points in units of one vowel's spread. F2 counts a little less: it
// varies more between speakers.
export function formantDistance(a, b) {
  const d1 = Math.log(a[0] / b[0]) / SIGMA, d2 = Math.log(a[1] / b[1]) / (SIGMA * 1.25);
  return Math.sqrt(d1 * d1 + d2 * d2);
}

// Distance to every vowel. The closest voice type near the estimate is used, since pitch only
// roughly tells the size of the vocal tract.
// personal: the child's own vowels from the voice check (see makeVowelAnchors). A vowel the child
// made in the check is measured against the child's own sound, in units of the child's own spread,
// so a child whose "a" and "e" differ from the textbook values is still told apart reliably.
export function vowelDistances(f1, f2, type = 1, known = true, personal = null) {
  const out = {};
  // no pitch reading (a whisper, a creaky voice): any voice type may be the right one
  const spread = known ? [-0.4, 0, 0.4] : [-1, -0.5, 0, 0.5, 1];
  for (const v of VOWELS) {
    let best = Infinity;
    for (const dt of spread) {
      const ty = Math.max(0, Math.min(2, type + dt));
      best = Math.min(best, formantDistance([f1, f2], reference(v, ty)) + (known ? Math.abs(dt) * 0.5 : 0));
    }
    const own = personal && personal[v];
    // A vowel learnt from the child can only help: the closer of the child's own sound and the
    // textbook sound counts. (Measured: a man's "ooo" at 475/1000 Hz was 0.6 from the textbook O but
    // 3.3 from a badly learnt one, so it was taken for U.)
    if (own) { out[v] = Math.min(personalDistance([f1, f2], own), best + 0.3); continue; }
    // with a personal check, a vowel the child did not make in it is a little less likely
    out[v] = personal ? best + 0.5 : best;
  }
  return out;
}

// Distance to one of the child's own vowels: {f1, f2, s1, s2} are the centre and spread in log units.
export function personalDistance(f, own) {
  const d1 = Math.log(f[0] / own.f1) / own.s1, d2 = Math.log(f[1] / own.f2) / own.s2;
  return Math.sqrt(d1 * d1 + d2 * d2);
}

// The child's own vowels from the voice check. samples: {aah: [[f1, f2], ...], eee: [...], ...}.
// A vowel with too few samples is left out (the textbook values are used for it). The spread is kept
// between narrow and wide limits, so one very steady or very wobbly check cannot break recognition.
// Returns null when fewer than two vowels were heard.
export function makeVowelAnchors(samples, minSamples = 5) {
  const out = {};
  let n = 0;
  for (const v of VOWELS) {
    const list = (samples && samples[v]) || [];
    if (list.length < minSamples) continue;
    const l1 = list.map((x) => Math.log(x[0])).sort((a, b) => a - b);
    const l2 = list.map((x) => Math.log(x[1])).sort((a, b) => a - b);
    // median and inter-quartile spread: robust to the odd bad frame
    const med = (a) => a[a.length >> 1];
    const iqr = (a) => (a[Math.floor(a.length * 0.75)] - a[Math.floor(a.length * 0.25)]) / 1.35;
    out[v] = {
      f1: Math.exp(med(l1)), f2: Math.exp(med(l2)),
      s1: Math.min(0.3, Math.max(0.13, iqr(l1) * 1.6)),
      s2: Math.min(0.34, Math.max(0.15, iqr(l2) * 1.6)),
      n: list.length,
    };
    n++;
  }
  // Sanity checks, so a wrong sound in the check cannot spoil recognition for the whole visit.
  // 1. A sound far from its vowel in every voice (an "eee" said when "aaa" was asked) is left out.
  //    Loose on purpose: a child's own vowels may sit well away from the textbook values.
  const off = {};
  for (const v of Object.keys(out)) {
    const d = vowelDistances(out[v].f1, out[v].f2, 1, false);
    off[v] = d[v];
    if (d[v] > ANCHOR_REACH || d[v] > nearestVowel(d).distance + ANCHOR_MARGIN) { delete out[v]; n--; }
  }
  // 2. Two vowels learned as nearly the same sound (one sound said for every prompt): keep only the
  //    one that sits closer to its own vowel.
  const kept = Object.keys(out).sort((a, b) => off[a] - off[b]);
  for (let i = 0; i < kept.length; i++) {
    const a = kept[i];
    if (!out[a]) continue;
    for (let j = i + 1; j < kept.length; j++) {
      const b = kept[j];
      if (!out[b]) continue;
      const gap = (personalDistance([out[b].f1, out[b].f2], out[a]) + personalDistance([out[a].f1, out[a].f2], out[b])) / 2;
      if (gap < ANCHOR_MIN_GAP) { delete out[b]; n--; }
    }
  }
  return n >= 2 ? out : null;
}
const ANCHOR_REACH = 4.5;    // textbook distance beyond which a learned vowel is not believed
const ANCHOR_MARGIN = 2.5;   // ... or when another vowel is this much closer
const ANCHOR_MIN_GAP = 1.0;  // two learned vowels closer than this are one sound said twice

// Learn one vowel during play (Balloon Breeze learns each vowel the first time the child holds it,
// instead of a voice check at the start). samples: [[f1, f2], ...] while the child held the sound.
// others: vowels already learnt ({vowel: anchor}). Returns the anchor, or null when the sound is not
// believable as that vowel (far from it, or the same as another learnt vowel): then the textbook
// values stay in use.
export function learnVowel(v, samples, others = {}) {
  if (!samples || samples.length < 8) return null;
  const made = makeVowelAnchors({ [v]: samples, ...Object.fromEntries(Object.entries(others || {}).filter(([k]) => k !== v).map(([k, a]) => [k, Array.from({ length: 8 }, () => [a.f1, a.f2])])) });
  return made && made[v] ? made[v] : (() => {
    // makeVowelAnchors needs two vowels; alone, check this one against the textbook values directly
    const one = makeVowelAnchors({ [v]: samples, _: [] }, 5);
    if (one && one[v]) return one[v];
    const l1 = samples.map((x) => Math.log(x[0])).sort((a, b) => a - b), l2 = samples.map((x) => Math.log(x[1])).sort((a, b) => a - b);
    const med = (a) => a[a.length >> 1], iqr = (a) => (a[Math.floor(a.length * 0.75)] - a[Math.floor(a.length * 0.25)]) / 1.35;
    const a = { f1: Math.exp(med(l1)), f2: Math.exp(med(l2)), s1: Math.min(0.3, Math.max(0.13, iqr(l1) * 1.6)), s2: Math.min(0.34, Math.max(0.15, iqr(l2) * 1.6)), n: samples.length };
    const d = vowelDistances(a.f1, a.f2, 1, false);
    if (d[v] > ANCHOR_REACH || d[v] > nearestVowel(d).distance + ANCHOR_MARGIN) return null;
    for (const o of Object.values(others || {})) if (o && (personalDistance([o.f1, o.f2], a) + personalDistance([a.f1, a.f2], o)) / 2 < ANCHOR_MIN_GAP) return null;
    return a;
  })();
}

// Sky Glide: each vowel has its own height, from the back of the mouth to the front (the order of
// the second formant): U "uuu" lowest, then O "ooo", A "aaa", E "ehh", and I "eee" at the top.
export const VOWEL_HEIGHT = { mmm: 0.1, ooo: 0.3, aah: 0.5, ehh: 0.7, sss: 0.9 };

// A hum "mmm": the voice comes out through the nose with the lips closed, so nearly all its energy
// stays below about 600 Hz. Vowels, even "ooo" and "uuu", have a clear second resonance above it.
// humRatio: energy 600-3000 Hz over energy 80-600 Hz of the room-cleaned spectrum (small for a hum).
export function humRatio(clean, binHz) {
  const low = bandEnergy(clean, binHz, 80, 600);
  if (!(low > 0)) return null;
  return bandEnergy(clean, binHz, 600, 3000) / low;
}
export const HUM_RATIO = 0.12;   // below this a voiced sound is a hum, unless the voice check learnt better
// The hum limit learnt from one child's "mmm" and vowels: half way (on a log scale) between the two,
// or null when the hum was not clearly different from the vowels.
export function learnHumLimit(humRatios, vowelRatios) {
  const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
  if (humRatios.length < 5 || vowelRatios.length < 5) return null;
  const h = med(humRatios), v = Math.min(...[...vowelRatios].sort((x, y) => x - y).slice(0, Math.max(1, vowelRatios.length >> 2)));
  if (!(h > 0 && v > h * 1.8)) return null;
  return Math.sqrt(h * v);
}

export function nearestVowel(dist) {
  let best = null, d = Infinity;
  for (const v of VOWELS) if (dist[v] < d) { d = dist[v]; best = v; }
  return { vowel: best, distance: d };
}

// Does this sound count as the target? lenience 1 (first levels): near enough, and close neighbours
// such as ooo for uuu are accepted. lenience 0 (last levels): it must be the closest vowel, and clear.
export function matchesVowel(dist, target, lenience = 0.5) {
  if (!dist || dist[target] == null) return false;
  const { distance: best } = nearestVowel(dist);
  const reach = 1.5 + 1.3 * lenience;
  const margin = 1.1 * lenience;
  return dist[target] <= reach && dist[target] <= best + margin;
}

// The strict test used by the games (v6.2): the sound must be the target and nothing else. The target
// has to be the closest of ALL the reference vowels (A, E, I, O, U), not only of the ones the game
// practises, and the next closest must be clearly further away. So "eee" never counts as E "ehh",
// "uuu" never as O, and a sound half way between A and E counts as neither.
// lenience 1 (first levels): a little further from the reference is fine, a smaller gap is enough.
// lenience 0 (last levels): close to the reference, with a wide gap.
// The gap asked for is scaled to how far apart two vowels naturally are: O and U sit close together
// even in textbook speech, so their gap is smaller than the one between A and E.
export function clearVowel(dist, target, lenience = 0.5) {
  if (!dist || dist[target] == null) return false;
  const reach = 1.8 + 1.0 * lenience;
  if (dist[target] > reach) return false;
  const gap = 0.5 + 0.7 * (1 - lenience);
  for (const v of VOWELS) {
    if (v === target || dist[v] == null) continue;
    const need = Math.min(gap, PAIR_GAP * vowelSeparation(target, v));
    if (dist[v] - dist[target] < need) return false;
  }
  return true;
}
const PAIR_GAP = 0.35;  // at most this share of two vowels' natural distance is asked for as the gap
const SEPARATION = {};
// How far apart two vowels are in textbook speech (a woman's voice), in the same units as the distances.
export function vowelSeparation(a, b) {
  const key = a < b ? a + b : b + a;
  if (SEPARATION[key] == null) SEPARATION[key] = formantDistance(reference(a, 1), reference(b, 1));
  return SEPARATION[key];
}

// ---------- spectrum to formants ----------
const PRE = 0.75;   // pre-emphasis, flattens the natural downward slope of the voice

function levinson(r, order) {
  const a = new Float64Array(order + 1);
  a[0] = 1;
  let err = r[0];
  if (err <= 0) return null;
  for (let i = 1; i <= order; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / err;
    const prev = a.slice();
    a[i] = k;
    for (let j = 1; j < i; j++) a[j] = prev[j] + k * prev[i - j];
    err *= 1 - k * k;
    if (err <= 0) return null;
  }
  return a;
}

// Peaks of the smooth (LPC) envelope of a power spectrum. power[i] is the power at i * binHz.
export function envelopePeaks(power, binHz, { maxHz = 5000, order = 10 } = {}) {
  const n = Math.min(power.length - 1, Math.floor(maxHz / binHz));
  const r = new Float64Array(order + 1);
  for (let i = 1; i <= n; i++) {
    const w = (Math.PI * i) / n;
    const p = power[i] * (1 + PRE * PRE - 2 * PRE * Math.cos(w));
    for (let k = 0; k <= order; k++) r[k] += p * Math.cos(k * w);
  }
  if (!(r[0] > 0)) return [];
  r[0] *= 1.0005;
  const a = levinson(r, order);
  if (!a) return [];
  const top = n * binHz;
  const env = [];
  for (let f = 125; f <= top - 150; f += 25) {
    const w = (Math.PI * f) / top;
    let re = 0, im = 0;
    for (let k = 0; k <= order; k++) { re += a[k] * Math.cos(k * w); im -= a[k] * Math.sin(k * w); }
    env.push({ f, db: -10 * Math.log10(re * re + im * im + 1e-12) });
  }
  const peaks = [];
  for (let i = 1; i < env.length - 1; i++) if (env[i].db > env[i - 1].db && env[i].db >= env[i + 1].db) peaks.push(env[i]);
  return peaks;
}

// F1 and F2 from a power spectrum, or null when the spectrum has no vowel shape.
export function formantsFrom(power, binHz) {
  const peaks = envelopePeaks(power, binHz);
  if (!peaks.length) return null;
  const strongest = Math.max(...peaks.map((p) => p.db));
  const usable = peaks.filter((p) => p.db > strongest - 30);
  const first = usable.find((p) => p.f >= 180 && p.f <= 1400);
  if (!first) return null;
  const second = usable.find((p) => p.f > first.f + 180 && p.f <= 3900);
  if (!second) return null;
  return { f1: first.f, f2: second.f };
}

// Band energies of a spectrum after removing the room's noise.
export function cleanSpectrum(power, noise, out = new Float64Array(power.length)) {
  for (let i = 0; i < power.length; i++) out[i] = Math.max(0, power[i] - (noise ? noise[i] * 1.6 : 0));
  return out;
}

export function bandEnergy(power, binHz, lo, hi) {
  let s = 0;
  const a = Math.max(1, Math.floor(lo / binHz)), b = Math.min(power.length - 1, Math.floor(hi / binHz));
  for (let i = a; i <= b; i++) s += power[i];
  return s;
}

// Is this a hiss ("sss", "shh", air)? Most of its energy is above the vowel range.
export function isHiss(clean, binHz) {
  return bandEnergy(clean, binHz, 4000, 9000) > 1.5 * bandEnergy(clean, binHz, 200, 4000);
}

// ---------- Sky Glide: up or down from the child's own "aaa" and "eee" ----------

// Personal anchors from the short voice check. Null when the two sounds were not clearly different.
export function makeAnchors(aahSamples, eeeSamples, minSamples = 5) {
  if (aahSamples.length < minSamples || eeeSamples.length < minSamples) return null;
  const med = (list, k) => [...list].map((x) => x[k]).sort((p, q) => p - q)[Math.floor(list.length / 2)];
  const aah = [med(aahSamples, 0), med(aahSamples, 1)];
  const eee = [med(eeeSamples, 0), med(eeeSamples, 1)];
  return eee[1] / eee[0] > (aah[1] / aah[0]) * 1.6 ? { aah, eee } : null;
}

// +1 eee (go up), -1 aaa (go down), 0 neither.
export function directionFrom(f1, f2, { anchors = null, type = 1, reach = 2.4 } = {}) {
  const a = anchors ? anchors.aah : reference("aah", type);
  const e = anchors ? anchors.eee : reference("eee", type);
  const da = formantDistance([f1, f2], a), de = formantDistance([f1, f2], e);
  if (Math.min(da, de) > reach) return 0;
  return de < da ? 1 : -1;
}
