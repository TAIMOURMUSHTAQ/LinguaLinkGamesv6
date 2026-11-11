// The voice check shared by the vowel games (Balloon Breeze and Sky Glide). The child says each vowel
// for a moment: A "aaa", E "eee", I "iii", O "ooo", U "uuu". The game learns the child's own five
// sounds, so it can tell them apart even when the child's "a" and "e" are not the textbook ones.
// It runs once per visit and every vowel level reuses it. Nothing is recorded: only ten numbers
// (two resonances per vowel) are kept, in memory.
import { W, H, label, ring, rr, clamp } from "./draw.js";
import { makeVowelAnchors } from "./vowel.js";

export const CHECK_ORDER = ["aah", "eee", "iii", "ooo", "uuu"];
export const VOWEL_LETTER = { aah: "A", eee: "E", iii: "I", ooo: "O", uuu: "U" };
const SEC = 2.6;          // most time for one vowel
const ENOUGH = 16;        // samples that are plenty: move on early
const MIN_SEC = 1.2;
const REUSE_MS = 30 * 60 * 1000;

let last = null;          // {anchors, at}
export function savedVowels() { return last && Date.now() - last.at < REUSE_MS ? last.anchors : null; }
export function forgetVowels() { last = null; }
export function rememberVowels(anchors) { last = anchors ? { anchors, at: Date.now() } : null; }

// A small state machine the game runs before play. onDone(anchors or null) when finished.
export function createVowelCheck(ctx, { onDone, colors = {} }) {
  const k = { i: 0, t: 0, samples: {}, tries: 0, done: false, flash: 0 };
  const mic = ctx.mic;
  const prompt = () => ctx.say("checkSay", { s: ctx.t("snd_" + CHECK_ORDER[k.i]) });
  k.begin = () => { prompt(); ctx.event("voice_check_start", {}); };

  k.update = (dt) => {
    if (k.done) return;
    k.flash = Math.max(0, k.flash - dt);
    // the clock waits while the game itself speaks, so the child gets the whole time
    if (mic && mic.selfSound) return;
    k.t += dt;
    const v = CHECK_ORDER[k.i];
    const list = (k.samples[v] ||= []);
    if (mic && (mic.voiced || mic.speech) && !mic.hiss && mic.formants) list.push([mic.formants.f1, mic.formants.f2]);
    if (k.t > SEC || (k.t > MIN_SEC && list.length >= ENOUGH)) {
      k.i++; k.t = 0; k.flash = 0.5;
      ctx.sfx.chime(k.i);
      if (k.i < CHECK_ORDER.length) { prompt(); return; }
      const anchors = makeVowelAnchors(k.samples);
      const heard = CHECK_ORDER.filter((x) => (k.samples[x] || []).length >= 5).length;
      // hardly anything heard: ask once more, a little louder
      if (heard < 3 && k.tries === 0) {
        k.tries = 1; k.i = 0; k.samples = {}; k.note = ctx.t("calAgain");
        ctx.sfx.soft(); ctx.say("calAgain"); ctx.event("voice_check_retry", { heard });
        return;
      }
      k.done = true;
      rememberVowels(anchors);
      if (mic) mic.setAnchors(anchors);
      ctx.event("voice_check", { personal: !!anchors, vowels_heard: heard, samples: Object.fromEntries(CHECK_ORDER.map((x) => [x, (k.samples[x] || []).length])) });
      ctx.sfx.success();
      onDone(anchors);
    }
  };

  // drawn over the game's own scene
  k.draw = (c) => {
    c.fillStyle = "rgba(43,45,66,0.42)"; c.fillRect(0, 0, W, H);
    const v = CHECK_ORDER[Math.min(k.i, CHECK_ORDER.length - 1)];
    label(c, ctx.t("voiceCheckTitle"), W / 2, 92, { size: 34, weight: 600 });
    if (k.note) label(c, k.note, W / 2, 140, { size: 26, color: "#ffd6a5", weight: 500 });
    // the five letters, the current one big
    CHECK_ORDER.forEach((x, j) => {
      const now = j === k.i, past = j < k.i, x0 = W / 2 + (j - 2) * 120;
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
