// Settings come from three places, in this order of priority:
// 1. window.LINGUALINK_PLAY_CONFIG (set by the Laravel page that embeds the games)
// 2. URL query parameters (?game=breeze&level=2&mode=touch)
// 3. Saved per-device preferences (local storage), then defaults.
import { load } from "./storage.js";
import { SOUNDS_EN } from "./wordlist.js";
import { isSound } from "./wordgarden.js";

export const GAME_IDS = ["breeze", "glide", "pitch", "mouth", "firefly", "garden", "letters", "numbers", "balance", "body"];
// Word Garden: "all" (the game's mix) or any sound of the articulation word list (kit/wordlist.js)
export const GARDEN_SOUNDS = ["all", ...SOUNDS_EN.map((s) => s.id)];
export const GARDEN_ACCENTS = ["en-US", "en-GB", "en-IN"];

const DEFAULTS = {
  mode: "auto",            // auto | sensors | touch
  sound: true,             // sound effects
  music: true,             // background music (never plays while a microphone game listens)
  voicePrompts: false,     // spoken instructions (speechSynthesis); off unless a grown-up turns it on
  lang: "en",              // en | ur (interface language)
  gardenSound: "all",      // Word Garden: "all" (the game's mix) or one sound of the word list (or an Urdu letter)
  gardenLang: "en",        // Word Garden words: en (default) | ur (Urdu words only)
  gardenAccent: "en-US",   // the English accent the word check expects: en-US | en-GB | en-IN
  showCamera: true,        // small mirrored camera preview while playing
  onlineSpeech: false,     // Word Garden may use an online speech recogniser (audio leaves the device)
                           // a Laravel page that sets this to false also stops grown-ups turning it on
  adaptive: true,          // automatic difficulty inside a level
  wholeHand: false,        // hand games: the whole hand points and draws, no single finger needed
  unlockAll: false,        // grown-up: open every level
  reducedMotion: null,     // null = follow the device setting
  // Integration (filled by Laravel when embedded)
  assignmentId: null,
  sessionId: null,
  patientRef: null,
  resultUrl: null,         // POST results here (JSON)
  csrfToken: null,         // Laravel X-CSRF-TOKEN
  parentOrigin: null,      // postMessage target when embedded in an iframe
  modelBase: null,         // folder with *.task model files (defaults to ./models/)
  embedded: false,         // launch one game directly, no hub
  game: null,
  level: null,
  // Word Garden words set by the therapist. Either one list for every level, a list per level
  // ([[...], [...], ...]), or a list per position ({initial: [...], final: [...], ...}).
  // Each item: {word, picture}. Wrap the target letters in [ ] to highlight them, e.g. "[s]un".
  customWords: null,
  skipSplash: false,       // tests and embedded use
};

function bool(v) { return !(v === "0" || v === "false" || v === false); }

function fromQuery() {
  const out = {};
  let q;
  try { q = new URLSearchParams(window.location.search); } catch { return out; }
  const map = { game: "game", level: "level", mode: "mode", lang: "lang", sound: "gardenSound",
                assignment: "assignmentId", session: "sessionId", embedded: "embedded", adaptive: "adaptive",
                unlock: "unlockAll", wordlang: "gardenLang", accent: "gardenAccent", music: "music", splash: "skipSplash", parent: "parentOrigin", variant: "variant", tune: "tune" };
  for (const [k, key] of Object.entries(map)) if (q.has(k)) out[key] = q.get(k);
  if (out.embedded !== undefined) out.embedded = out.embedded === "1" || out.embedded === "true";
  if (out.adaptive !== undefined) out.adaptive = bool(out.adaptive);
  if (out.unlockAll !== undefined) out.unlockAll = bool(out.unlockAll);
  if (out.music !== undefined) out.music = bool(out.music);
  if (out.tune !== undefined) out.tune = out.tune === "1" || out.tune === "true";
  if (out.skipSplash !== undefined) out.skipSplash = out.skipSplash === "0" || out.skipSplash === "false";
  return out;
}

export function normalise(cfg) {
  if (!["auto", "sensors", "touch"].includes(cfg.mode)) cfg.mode = "auto";
  if (!["en", "ur"].includes(cfg.lang)) cfg.lang = "en";
  if (cfg.gardenLang !== "ur") cfg.gardenLang = "en";
  if (!isSound(cfg.gardenSound, cfg.gardenLang)) cfg.gardenSound = "all";
  if (!GARDEN_ACCENTS.includes(cfg.gardenAccent)) cfg.gardenAccent = "en-US";
  if (cfg.game && !GAME_IDS.includes(cfg.game)) cfg.game = null;
  // up to 10: Air Letters has 10 levels (the game itself limits it to its own number of levels)
  if (cfg.level != null) cfg.level = Math.min(10, Math.max(1, parseInt(cfg.level, 10) || 1));
  if (cfg.embedded) cfg.skipSplash = true;
  // parentOrigin must be a bare origin such as https://app.lingualink360.com
  if (cfg.parentOrigin) { try { cfg.parentOrigin = new URL(cfg.parentOrigin).origin; } catch { cfg.parentOrigin = null; } }
  return cfg;
}

export function getConfig() {
  const saved = load("prefs", {});
  // Spoken prompts used to default to on. Settings saved before that change are reset to the new
  // default; a grown-up who turns them on again is remembered (promptsV 2).
  if ((saved.promptsV || 0) < 2) delete saved.voicePrompts;
  // Word Garden used to be saved on /s/ by default. v4 practises all sounds unless a grown-up picks one.
  if ((saved.promptsV || 0) < 3) delete saved.gardenSound;
  const injected = (typeof window !== "undefined" && window.LINGUALINK_PLAY_CONFIG) || {};
  return normalise({ ...DEFAULTS, ...saved, ...fromQuery(), ...injected, onlineLocked: injected.onlineSpeech === false });
}

export function prefersReducedMotion(cfg) {
  if (cfg.reducedMotion === true || cfg.reducedMotion === false) return cfg.reducedMotion;
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

export const PREF_KEYS = ["mode", "sound", "music", "voicePrompts", "lang", "gardenSound", "gardenLang", "gardenAccent", "showCamera", "adaptive", "wholeHand", "unlockAll", "reducedMotion", "onlineSpeech"];
