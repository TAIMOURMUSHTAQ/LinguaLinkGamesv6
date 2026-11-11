// WORD GARDEN: articulation practice with words, phrases and sentences.
// The child sees a picture, can hear the word, then says it. Every clear word grows a flower.
// Two ways to play, chosen on the level card:
// - "Game listens": the browser's speech recogniser (kit/speech.js) checks each attempt: on the
//   device when possible, online only if a grown-up allows it. A match blooms a flower and moves on;
//   otherwise the child is asked to try again or go to the next word, up to 3 tries. If the check is
//   not ready, a grown-up chooses what to do. If no check can run here, the game notices that the
//   child spoke and moves on unless an adult taps "Try again". An adult can always override.
// - "Grown-up checks": the adult taps "Said it", then Clear or Try again. Touch mode always plays so.
// The last attempt is kept in memory for "Listen back" and never uploaded.
// The automatic check tells whether the word was recognisable, not whether each sound was right,
// so every item records how it was judged (auto, voice or adult).
import { W, H, sky, label, lumi, rr, rng, clamp, ring } from "../kit/draw.js";
import { sun, cloudLayer, butterflies, bee, flowerRow, motes, rays, spring } from "../kit/scene.js";
import { speakWord } from "../kit/audio.js";
import { hasRecogniser, localStatus, WordListener, judgeAlternatives } from "../kit/speech.js";
import { load, save } from "../kit/storage.js";
import { clampScore } from "../kit/results.js";

const P = (word, picture) => ({ word, picture });

// The letters for the target sound are marked with [ ]. Only real target sounds are marked, so
// the /sh/ in "Wash" and the /z/ in "is" or "glasses" are not.
export const WORD_BANK = {
  s: {
    initial: [P("[s]un", "☀️"), P("[s]ock", "🧦"), P("[s]oap", "🧼"), P("[s]eal", "🦭"), P("[s]andwich", "🥪")],
    final: [P("bu[s]", "🚌"), P("hou[s]e", "🏠"), P("hor[s]e", "🐎"), P("mou[s]e", "🐭"), P("dre[ss]", "👗"), P("i[c]e", "🧊")],
    medial: [P("pen[c]il", "✏️"), P("bi[c]ycle", "🚲"), P("gla[ss]es", "👓"), P("ca[s]tle", "🏰"), P("dino[s]aur", "🦕"), P("ba[s]eball", "⚾")],
    phrase: [P("big [s]un", "☀️"), P("red [s]ock", "🧦"), P("yellow bu[s]", "🚌"), P("my hou[s]e", "🏠"), P("[s]oft [s]oap", "🧼"), P("pink dre[ss]", "👗")],
    sentence: [P("The [s]un is hot.", "☀️"), P("I [s]ee a [s]eal.", "🦭"), P("The bu[s] is big.", "🚌"), P("A mou[s]e is in the hou[s]e.", "🐭"), P("I ride my bi[c]ycle.", "🚲"), P("Wash with [s]oap.", "🧼")],
  },
  k: {
    initial: [P("[c]at", "🐱"), P("[c]ake", "🎂"), P("[c]ar", "🚗"), P("[c]ow", "🐄"), P("[k]ey", "🔑")],
    final: [P("boo[k]", "📖"), P("du[ck]", "🦆"), P("so[ck]", "🧦"), P("mil[k]", "🥛"), P("tru[ck]", "🚚"), P("ro[ck]", "🪨")],
    medial: [P("coo[k]ie", "🍪"), P("mon[k]ey", "🐒"), P("chi[ck]en", "🐔"), P("ro[ck]et", "🚀"), P("pump[k]in", "🎃"), P("ja[ck]et", "🧥")],
    phrase: [P("[c]ute [c]at", "🐱"), P("big [c]ake", "🎂"), P("red [c]ar", "🚗"), P("my boo[k]", "📖"), P("yellow du[ck]", "🦆"), P("[c]oo[k]ie jar", "🍪")],
    sentence: [P("The [c]at [c]an jump.", "🐱"), P("I li[k]e [c]ake.", "🎂"), P("The du[ck] [c]an swim.", "🦆"), P("My [c]ar is red.", "🚗"), P("The mon[k]ey is funny.", "🐒"), P("Loo[k] at the ro[ck]et.", "🚀")],
  },
  p: {
    initial: [P("[p]ig", "🐷"), P("[p]en", "🖊️"), P("[p]izza", "🍕"), P("[p]anda", "🐼"), P("[p]ear", "🍐")],
    final: [P("cu[p]", "☕"), P("ma[p]", "🗺️"), P("shi[p]", "🚢"), P("soa[p]", "🧼"), P("shee[p]", "🐑"), P("ca[p]", "🧢")],
    medial: [P("a[pp]le", "🍎"), P("pu[pp]y", "🐶"), P("pa[p]er", "📄"), P("ha[pp]y", "😀"), P("hi[pp]o", "🦛"), P("tea[p]ot", "🫖")],
    phrase: [P("[p]ink [p]ig", "🐷"), P("hot [p]izza", "🍕"), P("my cu[p]", "☕"), P("big shi[p]", "🚢"), P("ha[pp]y [p]u[pp]y", "🐶"), P("red a[pp]le", "🍎")],
    sentence: [P("The [p]ig is [p]ink.", "🐷"), P("I like [p]izza.", "🍕"), P("[P]ass the cu[p].", "☕"), P("The [p]u[pp]y can [p]lay.", "🐶"), P("The shi[p] is big.", "🚢"), P("[P]ut the a[pp]le u[p].", "🍎")],
  },
  t: {
    initial: [P("[t]ree", "🌳"), P("[t]iger", "🐯"), P("[t]oy", "🧸"), P("[t]rain", "🚂"), P("[t]urtle", "🐢")],
    final: [P("ca[t]", "🐱"), P("ha[t]", "🎩"), P("boa[t]", "⛵"), P("foo[t]", "🦶"), P("coa[t]", "🧥"), P("be[d]", "🛏️")].slice(0, 5).concat([P("nu[t]", "🌰")]),
    medial: [P("wa[t]er", "💧"), P("bu[tt]er", "🧈"), P("bu[tt]on", "🔘"), P("ki[tt]en", "🐱"), P("guita[r]", "🎸")].slice(0, 4).concat([P("pho[t]o", "📷"), P("po[t]ato", "🥔")]),
    phrase: [P("big [t]ree", "🌳"), P("red ha[t]", "🎩"), P("my [t]oy", "🧸"), P("fast [t]rain", "🚂"), P("hot wa[t]er", "💧"), P("white boa[t]", "⛵")],
    sentence: [P("The [t]iger is big.", "🐯"), P("I see a [t]ree.", "🌳"), P("My ca[t] is black.", "🐱"), P("The [t]rain is fast.", "🚂"), P("Pu[t] on your ha[t].", "🎩"), P("I drink wa[t]er.", "💧")],
  },
  m: {
    initial: [P("[m]oon", "🌙"), P("[m]ilk", "🥛"), P("[m]ouse", "🐭"), P("[m]ango", "🥭"), P("[m]onkey", "🐒")],
    final: [P("dru[m]", "🥁"), P("ar[m]", "💪"), P("ho[m]e", "🏠"), P("swi[m]", "🏊"), P("plu[m]", "🍑"), P("ice crea[m]", "🍦")],
    medial: [P("ha[mm]er", "🔨"), P("le[m]on", "🍋"), P("ca[m]el", "🐫"), P("to[m]ato", "🍅"), P("su[mm]er", "☀️"), P("co[m]b", "🪮")].slice(0, 5).concat([P("ani[m]al", "🐘")]),
    phrase: [P("big [m]oon", "🌙"), P("cold [m]ilk", "🥛"), P("[m]y [m]ango", "🥭"), P("red dru[m]", "🥁"), P("little [m]ouse", "🐭"), P("funny [m]onkey", "🐒")],
    sentence: [P("The [m]oon is bright.", "🌙"), P("I drink [m]ilk.", "🥛"), P("[M]y [m]om is here.", "🏠"), P("The [m]onkey can jump.", "🐒"), P("I like ice crea[m].", "🍦"), P("I hit the dru[m].", "🥁")],
  },
  b: {
    initial: [P("[b]all", "⚽"), P("[b]ag", "🎒"), P("[b]anana", "🍌"), P("[b]ird", "🐦"), P("[b]ear", "🐻")],
    final: [P("cra[b]", "🦀"), P("tu[b]", "🛁"), P("cu[b]e", "🧊"), P("we[b]", "🕸️"), P("ro[b]e", "🥋"), P("bi[b]", "👶")],
    medial: [P("ta[b]le", "🍽️"), P("ra[bb]it", "🐰"), P("ro[b]ot", "🤖"), P("ru[bb]er", "🧽"), P("ca[bb]age", "🥬"), P("ze[b]ra", "🦓")],
    phrase: [P("big [b]all", "⚽"), P("red [b]ag", "🎒"), P("yellow [b]anana", "🍌"), P("little [b]ird", "🐦"), P("my ra[bb]it", "🐰"), P("funny ro[b]ot", "🤖")],
    sentence: [P("The [b]ird can fly.", "🐦"), P("I kick the [b]all.", "⚽"), P("My [b]ag is red.", "🎒"), P("The ra[bb]it is white.", "🐰"), P("I eat a [b]anana.", "🍌"), P("The [b]ear is big.", "🐻")],
  },
  f: {
    initial: [P("[f]ish", "🐟"), P("[f]ive", "🖐️"), P("[f]lower", "🌸"), P("[f]ox", "🦊"), P("[f]ork", "🍴")],
    final: [P("lea[f]", "🍃"), P("kni[f]e", "🔪"), P("el[f]", "🧝"), P("wol[f]", "🐺"), P("scar[f]", "🧣"), P("gira[ff]e", "🦒")],
    medial: [P("co[ff]ee", "☕"), P("wa[ff]le", "🧇"), P("so[f]a", "🛋️"), P("bu[ff]alo", "🐃"), P("sa[f]e", "🔐"), P("mu[ff]in", "🧁")],
    phrase: [P("big [f]ish", "🐟"), P("red [f]lower", "🌸"), P("green lea[f]", "🍃"), P("[f]unny [f]ox", "🦊"), P("soft so[f]a", "🛋️"), P("sweet mu[ff]in", "🧁")],
    sentence: [P("The [f]ish can swim.", "🐟"), P("I see a [f]lower.", "🌸"), P("The [f]ox is red.", "🦊"), P("A lea[f] is green.", "🍃"), P("I eat with a [f]ork.", "🍴"), P("The gira[ff]e is tall.", "🦒")],
  },
};

// Fallback highlighting for custom words that have no [ ] marks.
export const FOCUS = { s: /ss|s(?!h)|c(?=[eiy])/gi, k: /ck|k|c(?![eiyh])/gi, p: /pp|p(?!h)/gi, t: /tt|t(?!h)/gi, m: /mm|m/gi, b: /bb|b/gi, f: /ff|f/gi };

export const LEVELS = [
  { name: "Seeds", goal: "Say each word. The sound is at the start.", group: "initial", settings: { position: "initial" } },
  { name: "Sprouts", goal: "Now the sound is at the end of the word.", group: "final", settings: { position: "final" } },
  { name: "Buds", goal: "The sound is in the middle of the word.", group: "medial", settings: { position: "medial" } },
  { name: "Blooms", goal: "Say two-word phrases.", group: "phrase", settings: { position: "phrase" } },
  { name: "Full Garden", goal: "Say short sentences.", group: "sentence", settings: { position: "sentence" } },
];

export const MAX_ATTEMPTS = 3;
const RETRY_SEC = 3;            // the "Try again" prompt, then the game listens again by itself
const BLOOM_SEC = 1.4;          // time to enjoy the new flower before the next word
const NOTE_SEC = 2;             // "Good try! Next word" after the last try
const AUTO_CONTINUE_SEC = 3.5;  // voice checking: time for an adult to step in before moving on
const NO_RESULT_SEC = 3;        // the child spoke but the recogniser returned no words
const SILENT_MODEL_SEC = 10;    // nothing said for this long: the game says the word once

export function plainWord(word) {
  return String(word).replace(/[[\]]/g, "");
}

// customWords may be: one list for all levels; a list per level ([[...], ...]);
// or a list per position ({initial: [...], ...}).
export function wordList(sound, group, custom, levelIndex = 0) {
  let list = null;
  if (Array.isArray(custom) && custom.length) list = Array.isArray(custom[0]) ? custom[levelIndex] : custom;
  else if (custom && typeof custom === "object") list = custom[group];
  if (Array.isArray(list) && list.length) return list.map((w) => ({ word: String(w.word), picture: w.picture || "⭐", sound: sound === "all" ? null : sound }));
  if (sound === "all" || !WORD_BANK[sound]) return mixedList(group);
  return WORD_BANK[sound][group].map((it) => ({ ...it, sound }));
}

// "All sounds": every sound takes turns, so each session practises the whole set.
export const MIXED_ITEMS = 8;
export function mixedList(group) {
  const sounds = Object.keys(WORD_BANK), out = [];
  for (let i = 0; out.length < MIXED_ITEMS; i++) {
    const sound = sounds[i % sounds.length], list = WORD_BANK[sound][group];
    out.push({ ...list[Math.floor(i / sounds.length) % list.length], sound });
  }
  return out;
}

// Split a word into [{text, focus}] parts for highlighting.
export function splitFocus(word, sound) {
  const parts = [];
  if (/\[[^\]]+\]/.test(word)) {
    const re = /\[([^\]]+)\]/g;
    let last = 0, m;
    while ((m = re.exec(word))) {
      if (m.index > last) parts.push({ text: word.slice(last, m.index), focus: false });
      parts.push({ text: m[1], focus: true });
      last = m.index + m[0].length;
    }
    if (last < word.length) parts.push({ text: word.slice(last), focus: false });
    return parts;
  }
  if (!FOCUS[sound]) return [{ text: word, focus: false }];
  const re = new RegExp(FOCUS[sound].source, "gi");
  let last = 0, m;
  while ((m = re.exec(word))) {
    if (m.index > last) parts.push({ text: word.slice(last, m.index), focus: false });
    parts.push({ text: m[0], focus: true });
    last = m.index + m[0].length;
  }
  if (last < word.length) parts.push({ text: word.slice(last), focus: false });
  return parts;
}

// Score is the share of the level's items that were clear (or said, on a device that cannot check
// words). Items not reached count as not clear, so stopping early can never give a high score.
export function scoreGarden(results, total = results.length) {
  if (!total) return 0;
  return clampScore((results.filter((r) => r.result === "clear" || r.result === "said").length / total) * 100);
}

// The whole words that hold the target sound ("sun" in "The [s]un is hot."); the automatic check
// requires every one of them.
export function focusWords(word, sound) {
  const out = [];
  let pos = 0;
  for (const p of splitFocus(word, sound)) {
    const plain = plainWord(word);
    if (p.focus) {
      const left = plain.slice(0, pos).split(/\s+/).pop();
      const right = plain.slice(pos + p.text.length).split(/\s+/)[0];
      const w = (left + p.text + right).replace(/[^A-Za-z']/g, "");
      if (w && !out.includes(w.toLowerCase())) out.push(w.toLowerCase());
    }
    pos += p.text.length;
  }
  return out;
}

const FLOWER_COLORS = ["#ef476f", "#ffd166", "#06d6a0", "#118ab2", "#c77dff", "#ff9f1c"];

function drawGarden(c, t, li, grown) {
  sky(c, ["#c7f9cc", "#b8f2e6", "#aee6e6", "#a3d9ff", "#bde0fe"][li], "#fefae0");
  sun(c, 130, 110, 58, t);
  cloudLayer(c, t, { n: 3, y: 50, gap: 110, speed: 11, scale: 0.8, seed: 13 + li });
  c.fillStyle = "#e9c46a";
  for (let x = 0; x < W; x += 60) { rr(c, x + 8, 470, 34, 140, 10); c.fill(); }
  c.fillRect(0, 500, W, 14); c.fillRect(0, 560, W, 14);
  c.fillStyle = "#8d6346"; rr(c, 60, 600, W - 120, 90, 30); c.fill();
  flowerRow(c, t, { y: 600, n: 13, seed: 51 + li, s: 1.15 });
  c.fillStyle = "#6f4e37"; for (let i = 0; i < 40; i++) { const r = rng(i + 3); c.beginPath(); c.arc(80 + r() * (W - 160), 620 + r() * 60, 3, 0, Math.PI * 2); c.fill(); }
  const n = Math.max(6, grown.length);
  grown.forEach((gr, i) => {
    const x = 130 + i * ((W - 260) / n) + 40;
    const h = 60 + 80 * clamp(gr.t, 0, 1);
    c.strokeStyle = "#2d6a4f"; c.lineWidth = 8;
    c.beginPath(); c.moveTo(x, 640); c.quadraticCurveTo(x + Math.sin(t + i) * 8, 640 - h / 2, x, 640 - h); c.stroke();
    c.fillStyle = "#52b788"; c.beginPath(); c.ellipse(x + 18, 640 - h * 0.45, 18, 8, -0.5, 0, Math.PI * 2); c.fill();
    const col = FLOWER_COLORS[i % FLOWER_COLORS.length];
    const s = clamp(gr.t, 0, 1);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + t * 0.4; c.fillStyle = col; c.beginPath(); c.ellipse(x + Math.cos(a) * 22 * s, 640 - h + Math.sin(a) * 22 * s, 16 * s, 11 * s, a, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = "#fff3b0"; c.beginPath(); c.arc(x, 640 - h, 12 * s, 0, Math.PI * 2); c.fill();
  });
  butterflies(c, t, { n: 3, y: 470, band: 80, seed: 8 + li });
  bee(c, 200 + Math.sin(t * 0.8) * 130, 520 + Math.sin(t * 2.1) * 42, t, 1.2);
  bee(c, 1090 + Math.sin(t * 0.6 + 2) * 110, 500 + Math.cos(t * 1.7) * 40, t + 1, 1);
  motes(c, t, { n: 14, seed: 23, rise: 7 });
}

// cueStep: +2/+1 the word is modelled aloud (more help), 0 normal, -1 no letter highlight, -2 picture only.
export function cueName(step) {
  return step >= 1 ? "model_aloud" : step === 0 ? "written_highlighted" : step === -1 ? "written" : "picture_only";
}

// Word-wrapped text, centred on x. Returns the y for whatever comes next.
function para(c, text, x, y, maxW, size) {
  c.font = `500 ${size}px "Baloo 2", "Noto Nastaliq Urdu", system-ui, sans-serif`;
  let line = "";
  const lines = [];
  for (const word of String(text).split(" ")) {
    const next = line ? line + " " + word : word;
    if (c.measureText(next).width > maxW && line) { lines.push(line); line = word; } else line = next;
  }
  lines.push(line);
  for (const l of lines) { label(c, l, x, y, { size, color: "#2b2d42", shadow: false, weight: 500 }); y += size * 1.35; }
  return y + 8;
}

// Shown when "Game listens" was chosen but the word check is not ready on this device.
function drawSetupCard(c, t, setup) {
  c.save(); c.shadowColor = "rgba(0,0,0,0.18)"; c.shadowBlur = 24; c.shadowOffsetY = 8;
  c.fillStyle = "#ffffff"; rr(c, 230, 70, 820, 420, 34); c.fill(); c.restore();
  label(c, t("wcSetupTitle"), 640, 122, { size: 36, color: "#2b2d42", shadow: false });
  let y = 180;
  y = para(c, t(setup.failed ? "wcSetupFailed" : "wcSetupNoLocal"), 640, y, 720, 25);
  if (setup.online) y = para(c, t("wcSetupOnline"), 640, y, 720, 25);
  para(c, t("wcSetupAdult"), 640, y, 720, 25);
}

function drawWordCard(c, item, sound, attempts, state, t, cueStep = 0, maxAttempts = MAX_ATTEMPTS) {
  c.save(); c.shadowColor = "rgba(0,0,0,0.18)"; c.shadowBlur = 24; c.shadowOffsetY = 8;
  c.fillStyle = "#ffffff"; rr(c, 380, 70, 520, 360, 34); c.fill(); c.restore();
  c.font = '150px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText(item.picture, 640, 205);
  const plain = plainWord(item.word);
  const parts = cueStep <= -2 ? [] : cueStep === -1 ? [{ text: plain, focus: false }] : splitFocus(item.word, item.sound || sound);
  const size = plain.length > 18 ? 38 : plain.length > 12 ? 46 : 58;
  c.font = `700 ${size}px "Lexend", "Baloo 2", system-ui, sans-serif`;
  const total = parts.reduce((a, p) => a + c.measureText(p.text).width, 0);
  let x = 640 - total / 2;
  c.textAlign = "left";
  for (const p of parts) {
    c.fillStyle = p.focus ? "#e63946" : "#2b2d42";
    c.fillText(p.text, x, 365);
    if (p.focus) { c.fillRect(x, 365 + size * 0.48, c.measureText(p.text).width, 5); }
    x += c.measureText(p.text).width;
  }
  if (cueStep <= -2) label(c, t("whatIsThis"), 640, 365, { size: 40, color: "#5c5f7a", shadow: false });
  if (attempts > 0 && state !== "check") label(c, t("tryOf", { n: attempts + 1, m: maxAttempts }), 640, 452, { size: 24, color: "#5c5f7a", shadow: false, weight: 500 });
}

const def = {
  id: "garden",
  version: "6.0.0",
  title: "Word Garden",
  color: "#06d6a0",
  focus: "Say the words and make the garden bloom",
  input: "mic-optional",
  mic: { pitch: true, echoCancellation: true, onDb: 8, offDb: 5 },
  inputLabel: "Microphone: the game or a grown-up checks each word",
  touchLabel: "The adult taps “Said it”, then marks it clear or try again",
  variantsNeedSensors: true,
  variants: [
    { id: "auto", icon: "👂", label: "Game listens", note: "The game checks each word. Right: a flower blooms. If not: try again or go to the next word." },
    { id: "adult", icon: "🧑", label: "Grown-up checks", note: "A grown-up taps “Said it”, then Clear or Try again." },
  ],
  skills: ["Clear words", "Sounds at the start, middle and end", "Phrases and sentences"],
  howTo: [
    ["🖼️", "Look at the picture and the word."],
    ["🗣️", "Say the word clearly. Tap “Hear it” to listen first."],
    ["🌸", "Said right, a flower blooms. If not, try again or go to the next word."],
    ["🧑", "A grown-up can check the words instead, if you choose that on this card."],
  ],
  levels: LEVELS,

  drawPreview(c, li, t = 0) { drawGarden(c, t, li, [{ t: 1 }, { t: 1 }, { t: 0.6 }]); drawWordCard(c, WORD_BANK.s[LEVELS[li].group][0], "s", 0, "listen", (k) => k); },

  create(ctx) {
    const L = ctx.level;
    const sound = ctx.config.gardenSound || "all";
    const items = wordList(sound, L.group, ctx.config.customWords, ctx.levelIndex);
    const sensors = ctx.mode === "sensors" && ctx.mic;
    const wantsAuto = sensors && ctx.variant !== "adult";
    const g = {
      done: false, i: 0, state: "listen", attempts: 0, results: [], grown: [], voicedFor: 0, silentFor: 0, heard: false,
      clipUrl: null, rec: null, chunks: [], stateT: 0, timers: [], quietT: 0, autoModelled: false, periodicT: 0,
      // How attempts are judged: "auto" (speech recogniser), "voice" (the game hears the child speak
      // and moves on unless an adult steps in), "adult". "pending" while finding out.
      checkBy: wantsAuto ? "pending" : "adult",
      checker: null,       // "local" | "online" when checkBy is "auto"
      checkFailed: false,  // the recogniser stopped working during this session
      everHeard: false,    // the recogniser has returned words, so it works here
      noWords: 0,          // the child spoke but no words came back, before everHeard
      lastHeard: "", noteT: 0, setup: null, next: null,
    };
    let listener = null;
    // Adaptive cueing (the standard cueing hierarchy):
    //   easier after 2 misses in a row: the word is said aloud first (+1), then also 4 tries instead of 3 (+2)
    //   harder after 3 first-try clears in a row: no letter highlight (-1), then picture only (-2)
    g.adaptive = ctx.makeAdaptive({ upAfter: 3, downAfter: 2 });
    const maxAttempts = () => (g.adaptive.step >= 2 ? MAX_ATTEMPTS + 1 : MAX_ATTEMPTS);
    const cur = () => items[Math.min(g.i, items.length - 1)];
    const later = (fn, ms) => g.timers.push(setTimeout(fn, ms));
    // While the word is being said aloud, the microphone and the recogniser are ignored
    // (audio.speakerBusy), and the child's attempt only counts once the speech has finished.
    const speak = () => { g.heard = false; g.voicedFor = 0; listener && listener.stop(); speakWord(plainWord(cur().word), "en"); };
    const modelIfHelped = () => { if (g.adaptive.step >= 1) later(speak, 350); };

    const stopRec = () => new Promise((resolve) => {
      if (!g.rec || g.rec.state === "inactive") return resolve();
      g.rec.onstop = () => {
        try { if (g.chunks.length) { g.clipUrl && URL.revokeObjectURL(g.clipUrl); g.clipUrl = URL.createObjectURL(new Blob(g.chunks, { type: g.rec.mimeType })); } } catch {}
        resolve();
      };
      g.rec.stop();
    });
    const startRec = () => {
      if (!sensors || typeof MediaRecorder === "undefined" || (g.rec && g.rec.state === "recording")) return;
      try { g.chunks = []; g.rec = new MediaRecorder(ctx.mic.stream); g.rec.ondataavailable = (e) => e.data.size && g.chunks.push(e.data); g.rec.start(); } catch { g.rec = null; }
    };
    const listenBack = () => (g.clipUrl ? [{ id: "listen", kind: "tap", label: "▶ " + ctx.t("listenBack"), onTap: () => { try { new Audio(g.clipUrl).play(); } catch {} } }] : []);

    const setListenControls = () => {
      const list = [{ id: "hear", kind: "tap", label: "🔊 " + ctx.t("hearIt"), onTap: () => { speak(); ctx.event("model_played", { item: plainWord(cur().word) }); } }];
      const retrying = g.state === "retry";
      if (retrying) list.push({ id: "again", kind: "tap", tone: "go", label: "↻ " + ctx.t("tryAgain"), onTap: () => { if (g.state === "retry") toListen(); } });
      if (g.checkBy === "auto") {
        // The game checks by itself: no "Correct" button, so the word only counts when the game hears
        // it. (A grown-up who wants to judge the words chooses "Grown-up checks" on the level card.)
        list.push(...listenBack());
      } else {
        list.push({ id: "said", kind: "tap", tone: "go", label: ctx.t("saidIt"), onTap: () => toCheck(false) });
      }
      // after a try, this passes to the next word; the word is kept as one to practise
      if (g.attempts > 0) list.push({ id: "next", kind: "tap", label: ctx.t("nextWord") + " ➜", onTap: () => record("needs_practice", "adult") });
      else list.push({ id: "skip", kind: "tap", label: ctx.t("skip"), onTap: () => record("skipped", "adult") });
      ctx.setControls(list);
    };
    const setSetupControls = () => {
      const list = [];
      if (g.setup.online) list.push({ id: "online", kind: "tap", tone: "go", label: ctx.t("useOnline"), onTap: allowOnline });
      list.push({ id: "byadult", kind: "tap", label: ctx.t("adultChecks"), onTap: toAdult });
      ctx.setControls(list);
    };
    const setCheckControls = () => {
      ctx.setControls([
        ...listenBack(),
        { id: "clear", kind: "tap", tone: "go", label: "✓ " + ctx.t("clear"), onTap: () => record("clear", "adult") },
        { id: "again", kind: "tap", label: "↻ " + ctx.t("tryAgain"), onTap: () => tryAgain() },
      ]);
    };
    const toListen = () => {
      g.state = "listen"; g.stateT = 0; g.heard = false; g.voicedFor = 0; g.silentFor = 0; g.quietT = 0; g.periodicT = 0;
      setListenControls();
      modelIfHelped();
    };

    // "voice" and "adult" checking: the adult decides. In "voice" mode the game moves on by itself
    // after a few seconds (the word counts as said, not checked), so it never waits on the adult.
    const toCheck = async (auto) => {
      if (g.state !== "listen") return;
      g.state = "check"; g.stateT = 0;
      await stopRec();
      if (g.state !== "check") return;
      ctx.event("attempt", { item: plainWord(cur().word), attempt: g.attempts + 1, voice_detected: g.heard, detected_by: auto ? "microphone" : "adult" });
      setCheckControls();
    };
    const tryAgain = () => {
      if (g.state !== "check") return;
      g.attempts++;
      ctx.event("try_again", { item: plainWord(cur().word), attempt: g.attempts });
      g.adaptive.miss(ctx.time);
      if (g.attempts >= maxAttempts()) { record("needs_practice", "adult"); return; }
      ctx.sfx.soft();
      toListen();
    };

    // "auto" checking: the recogniser heard something.
    const onHeard = async (alts) => {
      if (g.state !== "listen") return;
      listener && listener.stop();
      g.everHeard = true; g.noWords = 0;
      const it = cur();
      const r = judgeAlternatives(alts, plainWord(it.word), focusWords(it.word, it.sound || sound));
      g.lastHeard = r.heard;
      ctx.event("auto_check", { item: plainWord(it.word), attempt: g.attempts + 1, heard: r.heard, ok: r.ok, words_matched: r.matched, words_total: r.total });
      await stopRec();
      if (g.state !== "listen" || cur() !== it) return;
      if (r.ok) record("clear", "auto");
      else autoMiss();
    };
    const autoMiss = () => {
      g.attempts++;
      g.adaptive.miss(ctx.time);
      if (g.attempts >= maxAttempts()) { record("needs_practice", "auto"); return; }
      ctx.sfx.soft();
      toRetry();
    };
    const toRetry = () => { g.state = "retry"; g.stateT = 0; setListenControls(); };

    // ---------- which check runs on this device ----------
    const canOnline = () => hasRecogniser() && !ctx.config.onlineLocked;
    const useChecker = (mode) => {
      listener && listener.stop();
      g.checkBy = "auto"; g.checker = mode; g.setup = null;
      const track = ctx.mic.stream && ctx.mic.stream.getAudioTracks ? ctx.mic.stream.getAudioTracks()[0] : null;
      listener = new WordListener({ lang: "en-US", local: mode === "local", onHeard, track });
      ctx.event("word_check", { mode });
      if (g.state === "setup") toListen();
      else if (g.state === "listen") setListenControls();
    };
    const toVoice = (reason) => {
      listener && listener.stop();
      g.checkBy = "voice"; g.checker = null; g.setup = null; g.checkFailed = !!reason;
      ctx.event("word_check", { mode: "voice", reason: reason || null });
      if (g.state === "setup") toListen();
      else if (g.state === "listen") setListenControls();
    };
    const toAdult = () => {
      g.checkBy = "adult"; g.checker = null; g.setup = null;
      ctx.event("word_check", { mode: "adult" });
      toListen();
    };
    const toSetup = (setup) => {
      g.state = "setup"; g.stateT = 0; g.setup = setup; g.checkBy = "pending"; g.checker = null;
      setSetupControls();
    };
    // Sending a child's voice online is a grown-up's choice, made here or in Settings, and remembered.
    const allowOnline = () => {
      ctx.config.onlineSpeech = true;
      save("prefs", { ...load("prefs", {}), onlineSpeech: true });
      useChecker("online");
    };
    const checkerFailed = (reason) => {
      const wasLocal = g.checker === "local";
      ctx.event("word_check_failed", { mode: g.checker, reason });
      listener && listener.stop();
      if (wasLocal && canOnline()) {
        if (ctx.config.onlineSpeech) useChecker("online");
        else toSetup({ failed: true, online: true });
      } else toVoice(reason);
    };

    const record = (result, by) => {
      if (g.state === "end" || g.state === "bloom") return;
      listener && listener.stop();
      stopRec();
      const it = cur();
      g.results.push({ item: plainWord(it.word), sound: it.sound || null, attempts: g.attempts + (result === "clear" || result === "said" ? 1 : 0), result, judged_by: by, voice_detected: g.heard, cue: cueName(g.adaptive.step) });
      if (result === "clear" && g.attempts === 0) g.adaptive.success(ctx.time);
      ctx.event("item_result", { item: plainWord(it.word), result, judged_by: by, attempts: g.attempts + (result === "clear" || result === "said" ? 1 : 0) });
      if (result === "clear" || result === "said") {
        g.grown.push({ t: 0 }); ctx.sfx.success(); ctx.fx.burst(640, 250, { n: 44, speed: 380 }); ctx.praise(640, 470, "#2b2d42");
        ctx.fx.ring && ctx.fx.ring(640, 250, { r: 300, color: "rgba(255,255,255,0.95)" });
      }
      else ctx.sfx.soft();
      g.lastHeard = "";
      g.next = () => {
        g.i++; g.attempts = 0; g.autoModelled = false; g.next = null;
        if (g.clipUrl) { try { URL.revokeObjectURL(g.clipUrl); } catch {} g.clipUrl = null; }
        if (g.i >= items.length) { ctx.setControls([]); later(() => (g.done = true), 900); g.state = "end"; return; }
        toListen();
      };
      // the game heard the right word: let the flower bloom before the next card
      if (by === "auto" && result === "clear") { g.state = "bloom"; g.stateT = 0; ctx.setControls([]); return; }
      if (by === "auto" && result === "needs_practice") g.noteT = NOTE_SEC;
      g.next();
    };

    g.start = async () => {
      setListenControls();
      modelIfHelped();
      if (!wantsAuto) return;
      const status = await localStatus("en-US");
      if (g.done || g.destroyed) return;
      if (status === "available") { useChecker("local"); return; }
      if (canOnline() && ctx.config.onlineSpeech) useChecker("online");
      else if (canOnline()) toSetup({ online: true });
      else toVoice();
    };
    g.destroy = () => { g.destroyed = true; listener && listener.stop(); g.timers.forEach(clearTimeout); try { g.rec && g.rec.state !== "inactive" && g.rec.stop(); } catch {} if (g.clipUrl) try { URL.revokeObjectURL(g.clipUrl); } catch {} };

    g.update = (dt) => {
      g.stateT += dt;
      for (const f of g.grown) f.t = Math.min(1, f.t + dt * 1.5);
      g.noteT = Math.max(0, g.noteT - dt);
      if (g.state === "bloom" && g.stateT > BLOOM_SEC) g.next();
      if (g.state === "retry" && g.stateT > RETRY_SEC) toListen();
      // voice checking moves on by itself when no adult steps in
      if (g.state === "check" && g.checkBy === "voice" && g.stateT > AUTO_CONTINUE_SEC) record("said", "voice");
      if (g.state !== "listen" || !sensors) return;
      if (ctx.mic.selfSound) { if (listener && listener.running) listener.stop(); g.quietT = 0; return; }
      g.quietT += dt;
      if (g.checkBy === "auto") {
        listener.watch();
        if (listener.broken) { checkerFailed("recogniser_unavailable"); return; }
        if (!listener.running && g.quietT > 0.3) listener.start();
      }
      // A spoken word needs a moment of real voice: "pig" or "cat" count, but a hiss, a clap or a
      // cough alone does not. Short plosive words are over quickly, so the time asked for is short.
      if (ctx.mic.periodic) g.periodicT += dt;
      if (ctx.mic.voiced) { g.voicedFor += dt; g.silentFor = 0; if (g.voicedFor > 0.05) startRec(); if (g.voicedFor > 0.1 && g.periodicT > 0.05) g.heard = true; }
      else {
        g.silentFor += dt;
        if (!g.heard) g.voicedFor = Math.max(0, g.voicedFor - dt);
        if (g.heard && g.checkBy === "voice" && g.silentFor > 0.6) toCheck(true);
        // The child spoke but no words came back. Once the recogniser has proved it works, that
        // counts as a try. Before that it may be the recogniser's fault, so the child is not marked down.
        if (g.heard && g.checkBy === "auto" && g.silentFor > NO_RESULT_SEC) {
          ctx.event("auto_check", { item: plainWord(cur().word), attempt: g.attempts + 1, heard: "", ok: false });
          listener.stop(); stopRec();
          g.lastHeard = "";
          if (g.everHeard) autoMiss();
          else if (++g.noWords >= 2) checkerFailed("no_words");
          else toRetry();
          return;
        }
      }
      // nothing said for a while: say the word once, so the child knows what to do
      if (!g.heard && !g.autoModelled && g.stateT > SILENT_MODEL_SEC) {
        g.autoModelled = true; speak(); ctx.event("model_played", { item: plainWord(cur().word), auto: true });
      }
    };

    g.draw = (c) => {
      const tm = ctx.anim;
      drawGarden(c, tm, ctx.levelIndex, g.grown);
      if (g.state === "setup") { drawSetupCard(c, ctx.t, g.setup); return; }
      if (g.state === "bloom" && !ctx.reduced) rays(c, 640, 250, 620, ctx.time, { color: "rgba(255,226,130,0.3)", n: 14, speed: 0.7 });
      if (g.state !== "end") {
        // each new word springs in, then the card floats gently
        if (g.cardFor !== g.i) { g.cardFor = g.i; g.cardAt = ctx.time; }
        const k = ctx.reduced ? 1 : spring(ctx.time - g.cardAt) * (g.state === "bloom" ? 1 + Math.sin(g.stateT * 7) * 0.02 : 1);
        c.save(); c.translate(640, 250 + (ctx.reduced ? 0 : Math.sin(ctx.time * 1.6) * 4)); c.scale(k, k); c.translate(-640, -250);
        drawWordCard(c, cur(), sound, g.attempts, g.state, ctx.t, g.adaptive.step, maxAttempts());
        c.restore();
      }
      lumi(c, 1060, 300, 1.1, { t: ctx.time, mood: g.state === "check" || g.state === "retry" || g.state === "bloom" ? "wow" : "happy" });
      const voiced = sensors && ctx.mic.voiced && !ctx.mic.selfSound;
      const msg = g.state === "bloom" ? ctx.t("youSaidIt")
        : g.state === "retry" ? ctx.t(g.lastHeard ? "notQuite" : "didntCatch")
        : g.state === "check" ? ctx.t("adultCheck")
        : g.noteT > 0 ? ctx.t("goodTryNext")
        : !sensors || (g.checkBy === "adult" && !voiced) ? ctx.t("sayWordTap")
        : voiced ? ctx.t("listening")
        : g.heard && g.checkBy === "auto" ? ctx.t("checking")
        : ctx.t("sayWord");
      if (g.state !== "end") label(c, msg, 640, 38, { size: 30, color: "#2b2d42", shadow: false });
      if (g.state === "retry" && g.lastHeard) label(c, ctx.t("heardWord", { heard: g.lastHeard }), 640, 490, { size: 26, color: "#2b2d42", shadow: false, weight: 600 });
      if (g.state === "check" && g.checkBy === "voice") {
        // time left before the game moves on by itself
        ring(c, 640, 500, 22, 1 - g.stateT / AUTO_CONTINUE_SEC, { color: "#06d6a0", width: 7 });
        label(c, ctx.t("movingOn"), 640, 540, { size: 20, color: "#2b2d42", shadow: false, weight: 500 });
      }
      if (sensors && g.state === "listen") {
        const lv = ctx.mic.level01;
        c.fillStyle = "rgba(43,45,66,0.15)"; rr(c, 1010, 380, 100, 16, 8); c.fill();
        c.fillStyle = "#06d6a0"; rr(c, 1010, 380, 100 * lv, 16, 8); c.fill();
      }
      // how words are being checked, for the adult
      if (sensors && g.checkBy !== "pending") {
        const how = g.checkBy === "auto" ? ctx.t(g.checker === "local" ? "wc_local" : "wc_online")
          : g.checkBy === "adult" ? ctx.t("wc_adult")
          : ctx.t(g.checkFailed ? "wc_failed" : "wc_voice");
        label(c, how, 640, 704, { size: 17, color: "#2b2d42", shadow: false, weight: 500 });
      }
    };

    g.hud = () => ({ progress: `${ctx.t("words")} ${Math.min(g.i + 1, items.length)}/${items.length}` });

    g.result = () => {
      const clear = g.results.filter((r) => r.result === "clear").length;
      const said = g.results.filter((r) => r.result === "said").length;
      const firstTry = g.results.filter((r) => r.result === "clear" && r.attempts === 1).length;
      const by = (k) => g.results.filter((r) => r.judged_by === k).length;
      return {
        completed: g.results.length >= items.length,
        score: scoreGarden(g.results, items.length),
        settings: { items: items.length, target_sound: sound, variant: wantsAuto ? "auto" : "adult" },
        metrics: {
          target_sound: sound,
          position: L.group,
          items_total: items.length,
          items_answered: g.results.length,
          clear,
          clear_first_try: firstTry,
          needs_practice: g.results.filter((r) => r.result === "needs_practice").length,
          by_sound: g.results.reduce((acc, r) => { if (r.sound) { const e = (acc[r.sound] ||= { clear: 0, total: 0 }); e.total++; if (r.result === "clear" || r.result === "said") e.clear++; } return acc; }, {}),
          skipped: g.results.filter((r) => r.result === "skipped").length,
          said_not_checked: said,
          variant: wantsAuto ? "auto" : "adult",
          // how the session was checked: "auto" (speech recogniser), "voice" or "adult"
          judged_by: g.checkBy === "pending" ? "voice" : g.checkBy,
          word_check: g.checker,            // "local" | "online" | null
          judged_auto: by("auto"),
          judged_adult: by("adult"),
          items: g.results,
        },
        summary: [
          { label: ctx.t("clearLbl"), value: `${clear + said}/${items.length}` },
          { label: ctx.t("clearFirst"), value: String(firstTry) },
          { label: ctx.t("soundLbl"), value: `${sound === "all" ? ctx.t("allSounds") : `/${sound}/`} · ${ctx.t("pos_" + L.group)}` },
        ],
      };
    };

    return g;
  },
};

export default def;
