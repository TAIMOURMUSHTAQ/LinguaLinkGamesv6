// The voice check shared by the vowel games (Balloon Breeze and Sky Glide). The child says each vowel
// for a moment: A "aaa", E "ehh", O "ooo" (the three the games practise). The game learns the child's
// own sounds, so it can tell them apart even when the child's "a" and "e" are not the textbook ones.
// It runs once per visit and every vowel level reuses it. Nothing is recorded: only a few numbers
// (two resonances per vowel) are kept, in memory.
import { W, H, label, ring, rr, clamp } from "./draw.js";
import { makeVowelAnchors, learnHumLimit } from "./vowel.js";
import { makeTemplate, templateGap, MIN_TEMPLATE_GAP } from "./vowelprint.js";

export const CHECK_ORDER = ["aah", "ehh", "ooo"];
export const VOWEL_LETTER = { aah: "A", ehh: "E", eee: "I", ooo: "O", uuu: "U", mmm: "M", sss: "S" };
const SEC = 2.6;          // most time for one vowel
const ENOUGH = 16;        // samples that are plenty: move on early
const MIN_SEC = 1.2;
const REUSE_MS = 30 * 60 * 1000;

let last = null;          // {anchors, at}
let lastHum = null;       // {limit, at}: the child's own hum limit (Sky Glide's "mmm"); limit null: checked, nothing learnt
let lastVowelHum = null;  // {ratios, at}: the hum feature of the child's vowels, from any vowel check
export function savedVowels() { return last && Date.now() - last.at < REUSE_MS ? last.anchors : null; }
export function savedHum() { return lastHum && Date.now() - lastHum.at < REUSE_MS ? lastHum.limit : null; }
export function humChecked() { return !!(lastHum && Date.now() - lastHum.at < REUSE_MS); }
export function forgetVowels() { last = null; lastHum = null; lastVowelHum = null; lastPrints = null; }
export function rememberVowels(anchors) { last = anchors ? { anchors, at: Date.now() } : null; }
// The child's own vowel fingerprints (vowelprint.js), kept in memory for the visit like the anchors.
let lastPrints = null;    // {templates, at}
export function savedPrints() { return lastPrints && Date.now() - lastPrints.at < REUSE_MS ? lastPrints.templates : null; }
export function rememberPrints(templates) { lastPrints = templates && Object.keys(templates).length ? { templates: { ...templates }, at: Date.now() } : null; }

// Learn the fingerprint of the vowel just held (frames: single-frame prints collected while it was held).
// Refused (null) when it is too close to another vowel already learnt: the child probably said that
// one again, and learning it would make the two impossible to tell apart.
export function learnPrint(vowel, frames, templates) {
  const tpl = makeTemplate(frames, 8);
  if (!tpl) return null;
  for (const [v, other] of Object.entries(templates || {})) if (v !== vowel && other && templateGap(tpl, other) < MIN_TEMPLATE_GAP) return null;
  return tpl;
}
export function rememberHum(limit) { lastHum = { limit: limit || null, at: Date.now() }; }

// A small state machine the game runs before play. onDone(anchors or null) when finished.
export function createVowelCheck(ctx, { onDone, colors = {}, vowels = CHECK_ORDER }) {
  const ORDER = vowels;
  const k = { i: 0, t: 0, samples: {}, tries: 0, done: false, flash: 0, order: ORDER };
  const mic = ctx.mic;
  const prompt = () => ctx.say("checkSay", { s: ctx.t("snd_" + ORDER[k.i]) });
  k.begin = () => { prompt(); ctx.event("voice_check_start", {}); };

  k.update = (dt) => {
    if (k.done) return;
    k.flash = Math.max(0, k.flash - dt);
    // the clock waits while the game itself speaks, so the child gets the whole time
    if (mic && mic.selfSound) return;
    k.t += dt;
    const v = ORDER[k.i];
    const list = (k.samples[v] ||= []);
    const voice = mic && (mic.voiced || mic.speech) && !mic.hiss;
    // "mmm" is learnt from its hum feature; vowels from their resonances (and their hum feature too,
    // so the hum limit sits between this child's hum and vowels)
    if (v === "mmm") { if (voice && mic.periodic && mic.humRatio != null) list.push(mic.humRatio); }
    else if (voice && mic.formants) { list.push([mic.formants.f1, mic.formants.f2]); if (mic.humRatio != null) (k.vowelHum ||= []).push(mic.humRatio); }
    if (k.t > SEC || (k.t > MIN_SEC && list.length >= ENOUGH)) {
      k.i++; k.t = 0; k.flash = 0.5;
      ctx.sfx.chime(k.i);
      if (k.i < ORDER.length) { prompt(); return; }
      const formantSamples = Object.fromEntries(Object.entries(k.samples).filter(([x]) => x !== "mmm"));
      const learnt = makeVowelAnchors(formantSamples);
      // only "mmm" asked for (the vowels were learnt earlier this visit): keep those vowels
      const anchors = learnt || (ORDER.every((x) => x === "mmm") ? savedVowels() : null);
      const heard = ORDER.filter((x) => (k.samples[x] || []).length >= 5).length;
      // hardly anything heard: ask once more, a little louder
      if (heard < Math.min(3, ORDER.length) && k.tries === 0) {
        k.tries = 1; k.i = 0; k.samples = {}; k.note = ctx.t("calAgain");
        ctx.sfx.soft(); ctx.say("calAgain"); ctx.event("voice_check_retry", { heard });
        return;
      }
      k.done = true;
      rememberVowels(anchors);
      if (mic) mic.setAnchors(anchors);
      if (k.vowelHum && k.vowelHum.length >= 5) lastVowelHum = { ratios: k.vowelHum.slice(-200), at: Date.now() };
      if (ORDER.includes("mmm")) {
        const vowelRatios = k.vowelHum && k.vowelHum.length >= 5 ? k.vowelHum : lastVowelHum && Date.now() - lastVowelHum.at < REUSE_MS ? lastVowelHum.ratios : [];
        const limit = learnHumLimit(k.samples.mmm || [], vowelRatios);
        rememberHum(limit);
        if (mic) mic.humLimit = limit;
        ctx.event("hum_check", { learnt: !!limit });
      }
      ctx.event("voice_check", { personal: !!anchors, vowels_heard: heard, samples: Object.fromEntries(ORDER.map((x) => [x, (k.samples[x] || []).length])) });
      ctx.sfx.success();
      onDone(anchors);
    }
  };

  // drawn over the game's own scene
  k.draw = (c) => {
    c.fillStyle = "rgba(43,45,66,0.42)"; c.fillRect(0, 0, W, H);
    const v = ORDER[Math.min(k.i, ORDER.length - 1)];
    label(c, ctx.t("voiceCheckTitle"), W / 2, 92, { size: 34, weight: 600 });
    if (k.note) label(c, k.note, W / 2, 140, { size: 26, color: "#ffd6a5", weight: 500 });
    // the letters, the current one big
    ORDER.forEach((x, j) => {
      const now = j === k.i, past = j < k.i, x0 = W / 2 + (j - (ORDER.length - 1) / 2) * 120;
      c.save(); c.fillStyle = past ? "#06d6a0" : now ? (colors[x] || "#ffd166") : "rgba(255,255,255,0.35)";
      rr(c, x0 - 46, 180, 92, 92, 26); c.fill(); c.restore();
      label(c, VOWEL_LETTER[x], x0, 228, { size: 52, color: "#2b2d42", shadow: false, weight: 800 });
    });
    const s = 1 + (k.flash > 0 ? Math.sin(k.flash * Math.PI * 2) * 0.06 : 0);
    c.save(); c.translate(W / 2, 400); c.scale(s, s);
    label(c, ctx.t("checkSay", { s: ctx.t("snd_" + v) }), 0, 0, { size: 60 });
    c.restore();
    ring(c, W / 2, 520, 50, clamp(k.t / SEC, 0, 1), { color: colors[v] || "#ffd166" });
    const n = (k.samples[v] || []).length;
    label(c, n >= 5 ? ctx.t("gotIt") : ctx.t("keepGoingCal"), W / 2, 610, { size: 30, weight: 500 });
  };

  return k;
}
