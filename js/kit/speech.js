// Automatic word check for Word Garden, with the browser's speech recogniser.
// - On-device recognition is used when the device already has it (Chrome 139+, `processLocally`).
//   The audio stays on the device. The game does not download it: in tests on Chrome 156 it returned
//   no words once installed, and online recognition then returned none either.
// - Online recognition sends the child's audio to the browser maker's speech service, so it is
//   used only when a grown-up allows it (Settings > Allow online word check).
// - Without either, the game falls back to noticing that the child spoke (see garden.js).
// The check tells whether the word was recognisable, not whether the target sound was perfect,
// so every item records how it was judged and an adult can always override.

const SR = () => (typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null) || null;
const STUCK_MS = 15000;  // a recogniser that has not finished by now has hung (seen in Chrome): replace it
const MAX_STALLS = 2;

// ---------- pure helpers (unit tested) ----------

// Words that sound the same as a practice word; recognisers often write the other spelling.
const SAME_SOUND = {
  son: "sun", sunn: "sun", pair: "pear", pare: "pear", sea: "see", c: "see", seel: "seal",
  hoarse: "horse", mousse: "mouse", buss: "bus", eye: "i", aye: "i", ur: "are", cee: "see",
  kat: "cat", kar: "car", kee: "key", quay: "key", rok: "rock", duk: "duck", mi: "my",
  two: "to", too: "to", hi: "high", inn: "in", wright: "right", red: "red", read: "red",
};

export function wordsOf(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => SAME_SOUND[w] || w);
}

function sameWord(heard, target) {
  if (heard === target) return true;
  // a plural is still the word ("cats" for "cat"), but only by adding an s
  return heard === target + "s" || heard === target + "es";
}

// Check one recogniser transcript against the target. `focus` lists the target words that carry
// the practice sound: all of them must be heard. Of the other words, most must be heard too.
export function judgeTranscript(transcript, target, focus = []) {
  const want = wordsOf(target);
  const heard = wordsOf(transcript);
  if (!want.length) return { ok: false, matched: 0, total: 0 };
  const pool = [...heard];
  let matched = 0;
  const missing = [];
  for (const w of want) {
    const i = pool.findIndex((h) => sameWord(h, w));
    if (i >= 0) { matched++; pool.splice(i, 1); } else missing.push(w);
  }
  const focusWords = focus.flatMap(wordsOf);
  const focusOk = focusWords.every((f) => !missing.includes(f));
  const ratio = matched / want.length;
  // one or two words: every word; longer phrases and sentences: three quarters
  const ok = focusOk && (want.length <= 2 ? ratio === 1 : ratio >= 0.75);
  return { ok, matched, total: want.length };
}

// Best result over the recogniser's alternatives.
export function judgeAlternatives(alternatives, target, focus = []) {
  let best = { ok: false, matched: 0, total: wordsOf(target).length, heard: alternatives[0] || "" };
  for (const alt of alternatives) {
    const r = judgeTranscript(alt, target, focus);
    if (r.ok || r.matched > best.matched) best = { ...r, heard: alt };
    if (r.ok) break;
  }
  return best;
}

// ---------- recogniser ----------

export const hasRecogniser = () => !!SR();

// The on-device recogniser: "available", "downloadable", "downloading" or "unavailable".
export async function localStatus(lang = "en-US") {
  const R = SR();
  if (!R || typeof R.available !== "function") return "unavailable";
  try { return await R.available({ langs: [lang], processLocally: true }); } catch { return "unavailable"; }
}


// Listens for one utterance at a time. The game calls start() whenever it is ready to listen and
// stop() while the game itself is speaking, so the model word is never taken as the child's.
export class WordListener {
  constructor({ lang = "en-US", local = false, onHeard = () => {}, track = null } = {}) {
    this.lang = lang;
    this.local = local;
    this.onHeard = onHeard;
    this.track = track;    // the game's microphone; without it the browser picks its default device
    this.copy = null;
    this.rec = null;
    this.running = false;
    this.broken = false;   // the recogniser cannot be used (blocked, offline, unsupported, hanging)
    this.failures = 0;
    this.stalls = 0;
    this.startedAt = 0;
  }

  // Called by the game while it listens: replaces a recogniser that has hung, and gives up on repeats.
  watch(now = Date.now()) {
    if (!this.running || now - this.startedAt < STUCK_MS) return;
    this.stop();
    if (++this.stalls >= MAX_STALLS) this.broken = true;
  }

  start() {
    const R = SR();
    if (this.running || this.broken || !R) return;
    let r;
    try {
      r = new R();
      r.lang = this.lang;
      r.continuous = false;
      r.interimResults = false;
      r.maxAlternatives = 5;
      if (this.local) r.processLocally = true;
    } catch { this.broken = true; return; }
    r.onresult = (e) => {
      this.failures = 0;
      this.stalls = 0;
      const res = e.results && e.results[0];
      if (!res) return;
      const alts = Array.from(res, (a) => a.transcript).filter(Boolean);
      if (alts.length) this.onHeard(alts);
    };
    r.onerror = (e) => {
      const err = e && e.error;
      if (err === "not-allowed" || err === "service-not-allowed" || err === "language-not-supported") this.broken = true;
      else if (err === "network" || err === "audio-capture") { if (++this.failures >= 2) this.broken = true; }
    };
    r.onend = () => { if (this.rec === r) { this.rec = null; this.running = false; this._dropCopy(); } };
    try { this._begin(r); this.rec = r; this.running = true; this.startedAt = Date.now(); } catch { this.running = false; this._dropCopy(); }
  }

  // The recogniser listens to the game's own microphone. Browsers that cannot take a track throw
  // here and use their default device instead.
  _begin(r) {
    if (this.track) {
      try { this.copy = this.track.clone(); r.start(this.copy); return; } catch { this._dropCopy(); }
    }
    r.start();
  }

  _dropCopy() {
    try { this.copy && this.copy.stop(); } catch {}
    this.copy = null;
  }

  stop() {
    const r = this.rec;
    this.rec = null;
    this.running = false;
    try { r && r.abort(); } catch {}
    this._dropCopy();
  }
}
