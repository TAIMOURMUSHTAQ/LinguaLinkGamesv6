// Word Garden's words: chosen from the articulation word list (wordlist.js) and nothing else.
// Pure functions, no browser needed (unit tested).
//
// Two ways to choose the words (Word Garden's card, or Grown-ups > Settings):
//   "all" (the game's mix): the sounds in the list's own order (/p/, /b/, /t/, /d/ ...), one word each,
//     never the same sound twice in a row.
//   one sound (for example "s", or an Urdu letter): that sound's words, in the list's own order.
// The list's sequence is kept: nothing is shuffled. Each play continues where the last one stopped.
// Levels: 1 the sound at the start of the word, 2 in the middle, 3 at the end, 4 all three positions,
// 5 a big mix. Each play of a level moves on through the list, so the words change from play to play.
import { SOUNDS_EN, WORDS_EN, GRAPHEMES_EN, PICTURES_EN, SOUNDS_UR, WORDS_UR } from "./wordlist.js";

export const POSITIONS = ["initial", "medial", "final"];
export const GARDEN_LEVELS = [
  { name: "Seeds", goal: "Say each word. The sound is at the start.", positions: ["initial"], count: 8, settings: { position: "initial" } },
  { name: "Sprouts", goal: "Now the sound is in the middle of the word.", positions: ["medial"], count: 8, settings: { position: "medial" } },
  { name: "Buds", goal: "Now the sound is at the end of the word.", positions: ["final"], count: 8, settings: { position: "final" } },
  { name: "Blooms", goal: "Start, middle and end, all mixed. 10 words.", positions: ["initial", "medial", "final"], count: 10, settings: { position: "mixed" } },
  { name: "Full Garden", goal: "A big mix of sounds and words. 12 words.", positions: ["initial", "medial", "final"], count: 12, settings: { position: "mix" } },
];

export function soundsFor(lang = "en") { return lang === "ur" ? SOUNDS_UR : SOUNDS_EN; }
export function wordsFor(lang = "en") { return lang === "ur" ? WORDS_UR : WORDS_EN; }
export function isSound(id, lang = "en") { return id === "all" || soundsFor(lang).some((s) => s.id === id); }

// Mark the letters that make the sound with [ ], in the right place: at the start for "initial", at the
// end for "final", in between for "medial". English only (Urdu letters join, so they are not split).
export function markWord(word, soundId, position) {
  const list = GRAPHEMES_EN[soundId];
  if (!list) return word;
  const w = word.toLowerCase();
  const at = (i, g) => w.startsWith(g, i);
  let found = null;
  if (position === "initial") {
    for (const g of list) if (at(0, g)) { found = [0, g.length]; break; }
  } else if (position === "final") {
    // the longest spelling at the very end ("kiss", not "kis[s]"), allowing a silent final e ("five", "page")
    for (const g of list) if (w.endsWith(g)) { found = [w.length - g.length, g.length]; break; }
    if (!found) for (const g of list) if (w.endsWith(g + "e")) { found = [w.length - g.length - 1, g.length]; break; }
    for (let i = w.length - 1; i >= 0 && !found; i--) for (const g of list) if (at(i, g) && w.length - (i + g.length) <= 1) { found = [i, g.length]; break; }
  } else {
    for (let i = 1; i < w.length - 1 && !found; i++) for (const g of list) if (at(i, g) && i + g.length < w.length) { found = [i, g.length]; break; }
  }
  if (!found) return word;
  const [i, n] = found;
  return word.slice(0, i) + "[" + word.slice(i, i + n) + "]" + word.slice(i + n);
}

export function pictureFor(word, lang = "en") {
  return lang === "ur" ? null : PICTURES_EN[String(word).toLowerCase()] || null;
}

// A small seeded shuffle, so a level's words are the same for the same play number.
function shuffled(list, seed) {
  const a = [...list];
  let s = (seed * 9301 + 49297) % 233280 || 1;
  for (let i = a.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor((s / 233280) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const itemOf = (word, sound, position, lang) => ({
  word: lang === "ur" ? word : markWord(word, sound, position),
  plain: word,
  picture: pictureFor(word, lang),
  sound, position, lang,
});

// The items for one play of a level. play: how many times this level was played before (the words move
// on through the list). custom: words set by LinguaLink360 for this child, used as they are.
// position: for custom words given per position ({initial: [...], medial: [...], ...}), which one to use.
export function gardenItems({ lang = "en", sound = "all", levelIndex = 0, play = 0, custom = null, position = null } = {}) {
  const L = GARDEN_LEVELS[Math.max(0, Math.min(GARDEN_LEVELS.length - 1, levelIndex))];
  const words = wordsFor(lang);
  if (custom) {
    let list = null;
    if (Array.isArray(custom) && custom.length) list = Array.isArray(custom[0]) ? custom[levelIndex] : custom;
    else if (typeof custom === "object") list = custom[position || L.positions[0]];
    if (Array.isArray(list) && list.length) return list.map((w) => ({ word: String(w.word || w), plain: String(w.word || w).replace(/[[\]]/g, ""), picture: w.picture || pictureFor(String(w.word || w).replace(/[[\]]/g, ""), lang), sound: sound === "all" ? null : sound, position: null, lang }));
  }
  const out = [];
  if (sound !== "all" && words[sound]) {
    // one sound: its words at the level's positions, in the list's order; a position with too few
    // words is topped up from the sound's other positions (still the same sound, still the list)
    let pool = L.positions.flatMap((p) => (words[sound][p] || []).map((w) => [w, p]));
    if (pool.length < Math.min(L.count, 4)) pool = pool.concat(POSITIONS.filter((p) => !L.positions.includes(p)).flatMap((p) => (words[sound][p] || []).map((w) => [w, p])));
    const seen = new Set();
    pool = pool.filter(([w]) => (seen.has(w) ? false : seen.add(w)));
    if (L.positions.length > 1) {
      // all positions: take turns start, middle, end, each in the list's order
      const by = L.positions.map((p) => pool.filter(([, q]) => q === p));
      const mixed = [];
      for (let i = 0; mixed.length < pool.length; i++) for (const list of by) if (list[i]) mixed.push(list[i]);
      pool = mixed;
    }
    const start = (play * L.count) % Math.max(1, pool.length);
    for (let i = 0; i < Math.min(L.count, pool.length); i++) { const [w, p] = pool[(start + i) % pool.length]; out.push(itemOf(w, sound, p, lang)); }
    return out;
  }
  // the game's mix: the sounds in the list's order, one word each; each play goes on through the
  // sounds and, once round, on to each sound's next word
  const ids = soundsFor(lang).map((s) => s.id);
  const n = ids.length;
  for (let k = 0; out.length < L.count && k < n * 4; k++) {
    const step = play * L.count + k;                    // position in the endless walk through the list
    const id = ids[step % n];
    const position = L.positions[step % L.positions.length];
    const list = (words[id] && words[id][position]) || [];
    if (!list.length) continue;
    const w = list[Math.floor(step / n) % list.length];
    if (out.some((x) => x.plain === w)) continue;
    out.push(itemOf(w, id, position, lang));
  }
  return out;
}

// Urdu: the sound of a letter, as it is said with "a" ("م" is "ما", maa; "س" is "سا", saa).
const URDU_SOUND = { "ا": "آ", "ع": "عا", "ں": "نون غنہ", "ء": "ہمزہ", "ے": "اے", "ی": "یا", "و": "وا", "ہ": "ہا" };
export function urduLetterSound(letter) {
  return URDU_SOUND[letter] || letter + "ا";
}

// ---------- matching what the recogniser heard ----------
// Speech recognisers often write a child's word a little differently. A near miss counts as the word
// only when the letters of the practised sound are still there, in the same place: "rabit" counts for
// "rabbit", but "tun" never for "sun" and "budder" never for "butter".
export function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// marked: the word with the sound's letters in [ ] (markWord), or a plain word.
export function nearMiss(heard, marked) {
  const target = String(marked).replace(/[[\]]/g, "").toLowerCase();
  const h = String(heard || "").toLowerCase();
  if (!h || !target || h === target) return h === target;
  if (target.length < 4 || editDistance(h, target) > 1) return false;
  const m = /\[([^\]]+)\]/.exec(marked);
  if (!m) return h[0] === target[0] && h[h.length - 1] === target[target.length - 1];
  const before = String(marked).slice(0, m.index).replace(/[[\]]/g, "").toLowerCase();
  // a double letter may be written single by the recogniser ("rabit" for "rabbit")
  const focus = m[1].toLowerCase().replace(/^(.)\1$/, "$1");
  const after = String(marked).slice(m.index + m[0].length).replace(/[[\]]/g, "").toLowerCase();
  if (!before) return h.startsWith(focus);                    // sound at the start: the start is the same
  if (!after.replace(/e$/, "")) return h.replace(/e$/, "").endsWith(focus) || h.endsWith(focus + after);   // at the end
  return h.includes(focus) && h[0] === target[0];             // in the middle
}

// Urdu: compare letters only (no short-vowel marks or joiners).
export function normaliseUrdu(s) {
  return String(s || "").replace(/[ً-ٰٟ‌‍ـ]/g, "").replace(/\s+/g, " ").trim();
}
