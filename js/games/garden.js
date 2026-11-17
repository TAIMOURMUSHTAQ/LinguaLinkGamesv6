// WORD GARDEN: practise sounds in words, from the articulation word list (kit/wordlist.js, the same
// list as LinguaLink360's Articulation page) and no other words.
// The child sees a picture (or animated word art), can hear the word, then says it. Every clear word
// grows a flower. On the level card: the language (English, or Urdu with only Urdu words) and the
// sound: "Game's mix" (many sounds, mixed) or one sound chosen from the list. Levels: the sound at the
// start, in the middle, at the end, all three, then a big mix (kit/wordgarden.js).
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
import { GARDEN_LEVELS, gardenItems, soundsFor, isSound, nearMiss, normaliseUrdu, editDistance } from "../kit/wordgarden.js";
import { load, save } from "../kit/storage.js";
import { t as tr } from "../kit/i18n.js";
import { clampScore } from "../kit/results.js";

// Highlighting comes from the word list's marks ([ ] around the sound's letters, kit/wordgarden.js).
export const FOCUS = {};
export const LEVELS = GARDEN_LEVELS.map((l) => ({ ...l, group: l.settings.position }));

// The items of a level (kit/wordgarden.js gardenItems), kept under its old name for LinguaLink360.
export function wordList(sound, group, custom, levelIndex = 0, lang = "en", play = 0) {
  return gardenItems({ lang, sound, levelIndex, play, custom, position: group });
}

export const MAX_ATTEMPTS = 3;
const RETRY_SEC = 2.8;          // the "Try again" prompt, then the game listens again by itself
const BLOOM_SEC = 1.4;          // time to enjoy the new flower before the next word
const NOTE_SEC = 2;             // "Good try! Next word" after the last try
const AUTO_CONTINUE_SEC = 3.5;  // voice checking: time for an adult to step in before moving on
const NO_RESULT_SEC = 6;        // the child spoke but the recogniser returned no words (online results can be slow)
const FINISH_AFTER_SEC = 1.2;   // silence after the word: the recogniser is asked to finish (it keeps what it heard)
const SILENT_MODEL_SEC = 10;    // nothing said for this long: the game says the word once

export function plainWord(word) {
  return String(word).replace(/[[\]]/g, "");
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

// Animated word art, for words without a picture (and every Urdu word): big shiny letters in a moving
// rainbow, a light sweeping across, sparkles around, and a gentle bounce.
const ART = ["#ff595e", "#ff924c", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93", "#ff595e"];
const ART_DEEP = ["#d00000", "#e85d04", "#2b9348", "#0077b6", "#7209b7", "#d00000"];
function drawWordArt(c, text, x, y, tm, rtl = false) {
  const plain = plainWord(text);
  const size = rtl ? (plain.length > 8 ? 84 : 110) : plain.length > 9 ? 66 : plain.length > 6 ? 82 : 100;
  // Nastaliq strokes are thin: a thin outline and deeper colours keep Urdu words bold and readable
  const colors = rtl ? ART_DEEP : ART;
  c.save();
  c.translate(x, y + Math.sin(tm * 2.2) * 5);
  c.rotate(Math.sin(tm * 1.3) * 0.02);
  c.font = rtl ? `700 ${size}px "Noto Nastaliq Urdu", serif` : `800 ${size}px "Baloo 2", "Lexend", system-ui, sans-serif`;
  c.textAlign = "center"; c.textBaseline = "middle";
  if (rtl) c.direction = "rtl";
  const w = Math.max(60, c.measureText(plain).width);
  // a soft glow behind
  const glow = c.createRadialGradient(0, 0, 10, 0, 0, w * 0.75);
  glow.addColorStop(0, "rgba(255,240,180,0.85)"); glow.addColorStop(1, "rgba(255,240,180,0)");
  c.fillStyle = glow; c.beginPath(); c.ellipse(0, 0, w * 0.75, size * 0.95, 0, 0, Math.PI * 2); c.fill();
  // the moving rainbow letters with a thick white outline and a drop shadow
  const g = c.createLinearGradient(-w / 2 + Math.sin(tm) * 40, 0, w / 2 + Math.sin(tm) * 40, 0);
  colors.forEach((col, i) => g.addColorStop(((i / (colors.length - 1)) + tm * 0.12) % 1, col));
  c.lineJoin = "round"; c.lineWidth = size * (rtl ? 0.05 : 0.16); c.strokeStyle = "#ffffff";
  c.shadowColor = "rgba(43,45,66,0.25)"; c.shadowBlur = 14; c.shadowOffsetY = 6;
  c.strokeText(plain, 0, 0);
  c.shadowColor = "transparent";
  c.fillStyle = g; c.fillText(plain, 0, 0);
  // a thin dark edge keeps the bright colours crisp on the white card
  c.lineWidth = Math.max(1.5, size * 0.02); c.strokeStyle = "rgba(43,45,66,0.55)"; c.strokeText(plain, 0, 0);
  // sparkles around the word
  for (let k = 0; k < 6; k++) {
    const a = tm * 0.9 + (k * Math.PI * 2) / 6, r = w * 0.55 + Math.sin(tm * 3 + k) * 10;
    const px = Math.cos(a) * r, py = Math.sin(a) * size * 0.75, s = 5 + 4 * Math.abs(Math.sin(tm * 4 + k));
    c.fillStyle = ART[k % ART.length];
    c.beginPath(); for (let j = 0; j < 8; j++) { const rr2 = j % 2 ? s * 0.4 : s; const aa = (j * Math.PI) / 4; c.lineTo(px + Math.cos(aa) * rr2, py + Math.sin(aa) * rr2); } c.fill();
  }
  c.restore();
}

function drawWordCard(c, item, sound, attempts, state, t, cueStep = 0, maxAttempts = MAX_ATTEMPTS, tm = 0) {
  c.save(); c.shadowColor = "rgba(0,0,0,0.18)"; c.shadowBlur = 24; c.shadowOffsetY = 8;
  c.fillStyle = "#ffffff"; rr(c, 380, 70, 520, 360, 34); c.fill(); c.restore();
  const urdu = item.lang === "ur";
  if (item.picture) {
    c.font = '150px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(item.picture, 640, 205);
  } else drawWordArt(c, item.word, 640, 210, tm, urdu);
  const plain = plainWord(item.word);
  if (urdu) {
    // Urdu letters join, so the word is not split: the letter being practised is shown beside it
    if (item.sound) label(c, `${t("letterLbl")}: ${item.sound} · ${t("pos_" + (item.position || "mixed"))}`, 640, 365, { size: 30, color: "#2b2d42", shadow: false, weight: 600 });
    if (attempts > 0 && state !== "check") label(c, t("tryOf", { n: attempts + 1, m: maxAttempts }), 640, 452, { size: 24, color: "#5c5f7a", shadow: false, weight: 500 });
    return;
  }
  // picture only (the hardest cue) needs a picture; a word without one keeps its letters
  const pictureOnly = cueStep <= -2 && item.picture;
  const parts = pictureOnly ? [] : cueStep <= -1 ? [{ text: plain, focus: false }] : splitFocus(item.word, item.sound || sound);
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
  if (pictureOnly) label(c, t("whatIsThis"), 640, 365, { size: 40, color: "#5c5f7a", shadow: false });
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
  skills: ["Clear words", "Sounds at the start, middle and end", "English or Urdu words"],
  howTo: [
    ["🖼️", "Look at the picture and the word. Choose the language and the sound on this card."],
    ["🗣️", "Say the word clearly. Tap “Hear it” to listen first."],
    ["🌸", "Said right, a flower blooms. If not, try again or go to the next word."],
    ["🧑", "A grown-up can check the words instead, if you choose that on this card."],
  ],
  levels: LEVELS,

  // On the level card: the language of the words, and the sound to practise (or the game's mix).
  cardOptions(config) {
    const lang = config.gardenLang === "ur" ? "ur" : "en";
    return [
      { key: "gardenLang", label: tr("gardenLangLbl"), options: [{ value: "en", label: "English" }, { value: "ur", label: "اردو" }] },
      { key: "gardenSound", label: tr("soundLbl"), options: [{ value: "all", label: tr("gameMix") }, ...soundsFor(lang).map((x) => ({ value: x.id, label: lang === "ur" ? `${x.id}  (${x.example})` : `${x.ipa}  ${x.example}` }))] },
    ];
  },
  // a new language has its own sounds: the choice goes back to the game's mix if it does not fit
  onCardOption(config, key) {
    if (key === "gardenLang" && !isSound(config.gardenSound, config.gardenLang === "ur" ? "ur" : "en")) config.gardenSound = "all";
  },

  drawPreview(c, li, t = 0) { drawGarden(c, t, li, [{ t: 1 }, { t: 1 }, { t: 0.6 }]); drawWordCard(c, gardenItems({ levelIndex: li })[0], "all", 0, "listen", (k) => k, 0, MAX_ATTEMPTS, t); },

  create(ctx) {
    const L = ctx.level;
    const lang = ctx.config.gardenLang === "ur" ? "ur" : "en";
    const sound = isSound(ctx.config.gardenSound || "all", lang) ? ctx.config.gardenSound || "all" : "all";
    // each play of a level moves on through the word list, so the words change from play to play
    const playKey = `garden:play:${lang}:${sound}:${ctx.levelIndex}`;
    const play = load(playKey, 0) || 0;
    try { save(playKey, play + 1); } catch {}
    const items = gardenItems({ lang, sound, levelIndex: ctx.levelIndex, play, custom: ctx.config.customWords });
    const recLang = lang === "ur" ? "ur-PK" : ctx.config.gardenAccent || "en-US";
    const sensors = ctx.mode === "sensors" && ctx.mic;
    const wantsAuto = sensors && ctx.variant !== "adult";
    const g = {
      done: false, i: 0, state: wantsAuto ? "setup" : "listen", attempts: 0, results: [], grown: [], voicedFor: 0, silentFor: 0, heard: false,
      clipUrl: null, rec: null, chunks: [], stateT: 0, timers: [], quietT: 0, autoModelled: false, periodicT: 0,
      // How attempts are judged: "auto" (speech recogniser), "voice" (the game hears the child speak
      // and moves on unless an adult steps in), "adult". "pending" while finding out.
      checkBy: wantsAuto ? "pending" : "adult",
      checker: null,       // "local" | "online" when checkBy is "auto"
      checkFailed: false,  // the recogniser stopped working during this session
      everHeard: false,    // the recogniser has returned words, so it works here
      noWords: 0,          // the child spoke but no words came back, before everHeard
      lastHeard: "", noteT: 0, setup: { online: false, failed: false }, next: null,
      useTrack: true,      // give the recogniser the game's microphone; switched off if it hears nothing through it
      deaf: 0,             // listens where the child spoke but no sound reached the recogniser
    };
    g.items = items;       // this play's words (read by tests and the session report)
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
    const speak = () => { g.heard = false; g.voicedFor = 0; listener && listener.stop(); speakWord(plainWord(cur().word), lang); };
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
      g.recSound = false;  // this attempt: did any sound reach the recogniser (over all its listens)?
      setListenControls();
      modelIfHelped();
      if (g.checkBy === "auto" && listener && !listener.running && !listener.broken && !ctx.mic.selfSound) listener.start();
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

    // "auto" checking: the recogniser heard something. Early (interim) results count as soon as they
    // match, so the flower can bloom while the child is still speaking; a final result that does not
    // match is a try. A near miss in spelling counts only if the practised sound is still there.
    const near = (h, w) => (lang === "ur"
      ? (() => { const a = normaliseUrdu(h), b = normaliseUrdu(w); return a === b || (b.length >= 4 && editDistance(a, b) <= 1); })()
      : w === plainWord(cur().word).toLowerCase() && nearMiss(h, cur().word));
    const onHeard = async (alts, final = true) => {
      if (g.state !== "listen") return;
      g.everHeard = true; g.noWords = 0; g.deaf = 0;
      const it = cur();
      const r = judgeAlternatives(alts, plainWord(it.word), lang === "ur" ? [] : focusWords(it.word, it.sound || sound), near);
      g.lastHeard = r.heard;
      if (!r.ok && !final) return;          // still listening: an early result may change
      listener && listener.stop();
      ctx.event("auto_check", { item: plainWord(it.word), attempt: g.attempts + 1, heard: r.heard, ok: r.ok, early: !final, words_matched: r.matched, words_total: r.total });
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
      listener = new WordListener({ lang: recLang, local: mode === "local", onHeard, track, useTrack: g.useTrack });
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
      g.results.push({ item: plainWord(it.word), sound: it.sound || null, position: it.position || null, attempts: g.attempts + (result === "clear" || result === "said" ? 1 : 0), result, judged_by: by, voice_detected: g.heard, cue: cueName(g.adaptive.step) });
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
      if (!wantsAuto) {
        setListenControls();
        modelIfHelped();
        return;
      }
      const status = await localStatus(recLang);
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
      if (g.state === "retry" && g.stateT >= RETRY_SEC) toListen();
      // voice checking moves on by itself when no adult steps in
      if (g.state === "check" && g.checkBy === "voice" && g.stateT > AUTO_CONTINUE_SEC) record("said", "voice");
      if (g.state !== "listen" || !sensors) return;
      if (ctx.mic.selfSound) { if (listener && listener.running) listener.stop(); g.quietT = 0; return; }
      g.quietT += dt;
      if (g.checkBy === "auto") {
        listener.watch();
        if (listener.broken) { checkerFailed("recogniser_unavailable"); return; }
        if (!listener.running && g.quietT > 0.3) listener.start();
        if (listener.heardSound) g.recSound = true;
      }
      // A spoken word needs a moment of real voice: "pig" or "cat" count, but a hiss, a clap or a
      // cough alone does not. Short plosive words are over quickly, so the time asked for is short.
      if (ctx.mic.periodic) g.periodicT += dt;
      if (ctx.mic.voiced) { g.voicedFor += dt; g.silentFor = 0; if (g.voicedFor > 0.05) startRec(); if (g.voicedFor > 0.1 && g.periodicT > 0.05) g.heard = true; }
      else {
        g.silentFor += dt;
        if (!g.heard) g.voicedFor = Math.max(0, g.voicedFor - dt);
        if (g.heard && g.checkBy === "voice" && g.silentFor > 0.6) toCheck(true);
        // the word is over: ask the recogniser to finish, keeping what it heard
        if (g.heard && g.checkBy === "auto" && g.silentFor > FINISH_AFTER_SEC && listener && listener.running) listener.finish();
        // The child spoke but no words came back. Once the recogniser has proved it works, that
        // counts as a try. Before that it may be the recogniser's fault, so the child is not marked down.
        if (g.heard && g.checkBy === "auto" && g.silentFor > NO_RESULT_SEC) {
          const deaf = !g.recSound && !listener.heardSound;
          ctx.event("auto_check", { item: plainWord(cur().word), attempt: g.attempts + 1, heard: "", ok: false, recogniser_heard_sound: !deaf });
          listener.stop(); stopRec();
          g.lastHeard = "";
          // The game heard the child, but no sound reached the recogniser twice: the microphone given to
          // it delivers silence on this device. Switch microphone (the game's own, or the default).
          if (deaf && !g.micSwitched && ++g.deaf >= 2) {
            g.deaf = 0; g.useTrack = !g.useTrack; g.micSwitched = true;   // once; after that the usual fallback
            ctx.event("word_check_microphone", { use_game_microphone: g.useTrack });
            useChecker(g.checker);
            toRetry();
            return;
          }
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
        drawWordCard(c, cur(), sound, g.attempts, g.state, ctx.t, g.adaptive.step, maxAttempts(), tm);
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
        settings: { items: items.length, target_sound: sound, language: lang, variant: wantsAuto ? "auto" : "adult" },
        metrics: {
          target_sound: sound,
          language: lang,
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
          { label: ctx.t("soundLbl"), value: `${sound === "all" ? ctx.t("gameMix") : (soundsFor(lang).find((x) => x.id === sound) || {}).ipa || sound} · ${ctx.t("pos_" + L.group)}` },
        ],
      };
    };

    return g;
  },
};

export default def;
