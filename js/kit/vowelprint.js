// Vowel fingerprints: recognise a vowel from the shape of its sound, learnt from each child.
// Pure functions, no browser needed (unit tested). Nothing leaves the device.
//
// Why: picking the two lowest resonances (vowel.js formants) fails when they merge into one peak, as
// in a man's "aaa" or "ooo", or behind a cheap microphone: a measured "aaa" of 525/2800 Hz (really
// about 730/1090 Hz) was then taken for another vowel. A fingerprint does not pick peaks. It is the
// cepstrum of the spectrum's smooth envelope found by linear prediction (LPCC, a standard speech
// feature): 12 numbers that follow the shape of the mouth and throat (the vowel), not the voice's
// pitch, and not its loudness. The child's own A, E and O are learnt the first time each is held; a
// sound then counts as a vowel when it is close to that vowel's fingerprint and clearly further from
// the others.
//
// v6.4: the first fingerprint (energy in 24 hearing-scale bands) moved with the pitch: for a man's low
// voice the bands are as narrow as the spacing of the voice's harmonics, so a slightly higher "aaa"
// looked like his "ooo". In a lifelike test (tests/e2e/realvoice.mjs: natural voice, room echo, mains
// hum, fan noise, cheap microphone) it recognised a man's "aaa" 13% of the time; this one 100%.

export const N_CEP = 12;
const FMAX = 5000;      // the envelope is fitted from 0 to 5 kHz: every vowel resonance that matters
const ORDER = 12;       // prediction order: about 5 resonances in 5 kHz
const LIFTER = 22;      // weights the 12 numbers so that each counts about equally
const FLOOR = 1e-4;     // nothing below 40 dB under the loudest part counts (room-cleaned gaps)
const PRE = 0.97;       // pre-emphasis: a microphone or voice with more or less treble matters less
const LAG_HZ = 250;     // smooths the envelope over about 250 Hz, so a child's widely spaced
                        // harmonics (a high voice) are not taken for resonances

// The fingerprint of one frame of a (room-cleaned) power spectrum: 12 numbers, or null for silence.
export function fingerprint(power, binHz) {
  const K = Math.min(power.length, Math.floor(FMAX / binHz));
  if (K < 16) return null;
  const P = new Float64Array(K);
  let max = 0;
  for (let k = 1; k < K; k++) {
    P[k] = power[k] * (1 + PRE * PRE - 2 * PRE * Math.cos((Math.PI * k) / K));
    if (P[k] > max) max = P[k];
  }
  if (!(max > 1e-14)) return null;
  for (let k = 1; k < K; k++) if (P[k] < max * FLOOR) P[k] = max * FLOOR;
  P[0] = P[1];
  // the autocorrelation is the spectrum's cosine transform; the lag window smooths the envelope
  const r = new Float64Array(ORDER + 1);
  for (let m = 0; m <= ORDER; m++) {
    let s = 0;
    for (let k = 0; k < K; k++) s += P[k] * Math.cos((Math.PI * k * m) / K);
    r[m] = s * Math.exp(-0.5 * Math.pow((Math.PI * LAG_HZ * m) / FMAX, 2));
  }
  r[0] *= 1.0001;
  // Levinson-Durbin: A(z) = 1 + a1 z^-1 + ... + ap z^-p
  const a = new Float64Array(ORDER + 1);
  a[0] = 1;
  let err = r[0];
  for (let i = 1; i <= ORDER; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / err;
    const prev = a.slice();
    for (let j = 1; j < i; j++) a[j] = prev[j] + k * prev[i - j];
    a[i] = k;
    err *= 1 - k * k;
    if (!(err > 0)) return null;
  }
  // the prediction polynomial's cepstrum (the gain, which is the loudness, is left out)
  const c = new Float64Array(N_CEP + 1);
  const out = new Float64Array(N_CEP);
  for (let n = 1; n <= N_CEP; n++) {
    let s = n <= ORDER ? -a[n] : 0;
    for (let k = 1; k < n; k++) if (n - k <= ORDER) s -= (k / n) * c[k] * a[n - k];
    c[n] = s;
    out[n - 1] = s * (1 + (LIFTER / 2) * Math.sin((Math.PI * n) / LIFTER));
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
