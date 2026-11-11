// Sound effects, background music and spoken prompts, all made in the browser (no audio files).
// Browsers only allow sound after a tap or click, so call unlock() from a button handler.
//
// Each game has its own sound palette (scale, timbre, tempo) so the games do not all sound alike.
// The microphone games need to know when the game itself is making a sound, so they do not mistake
// it for the child's voice: speakerBusy() reports that.
let ctx = null;
let master = null;
let enabled = true;
let musicOn = true;
let busyUntil = 0;          // performance.now() until which our own sounds are playing

export function setSoundEnabled(on) { enabled = !!on; }
export function setMusicEnabled(on) { musicOn = !!on; if (!on) stopMusic(); }

export function unlock() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
  } catch { ctx = null; }
}

export function speakerBusy() {
  return performance.now() < busyUntil || speaking;
}
function markBusy(sec) { busyUntil = Math.max(busyUntil, performance.now() + sec * 1000 + 120); }

const PALETTES = {
  // scale: semitone steps from the root; wave: oscillator type; root: Hz
  hub: { root: 392, scale: [0, 2, 4, 7, 9, 12, 14, 16], wave: "triangle", bpm: 92, pad: 196 },
  breeze: { root: 440, scale: [0, 2, 4, 7, 9, 12, 14, 16], wave: "sine", bpm: 84, pad: 220 },
  pitch: { root: 415, scale: [0, 2, 4, 7, 9, 12, 14, 16], wave: "sine", bpm: 80, pad: 208, sparkle: true },
  glide: { root: 494, scale: [0, 3, 5, 7, 10, 12, 15, 17], wave: "triangle", bpm: 100, pad: 247 },
  mouth: { root: 330, scale: [0, 2, 5, 7, 9, 12, 14, 17], wave: "sine", bpm: 76, pad: 165, bubbly: true },
  firefly: { root: 587, scale: [0, 2, 4, 7, 11, 12, 14, 19], wave: "sine", bpm: 70, pad: 147, sparkle: true },
  garden: { root: 523, scale: [0, 2, 4, 5, 7, 9, 11, 12], wave: "triangle", bpm: 96, pad: 262 },
  letters: { root: 440, scale: [0, 2, 4, 5, 7, 9, 12, 14], wave: "triangle", bpm: 88, pad: 220 },
  numbers: { root: 392, scale: [0, 4, 7, 9, 12, 16, 19, 21], wave: "sine", bpm: 80, pad: 196, sparkle: true },
  balance: { root: 349, scale: [0, 2, 5, 7, 9, 12, 14, 17], wave: "sine", bpm: 72, pad: 175 },
  body: { root: 466, scale: [0, 3, 5, 7, 10, 12, 15, 17], wave: "triangle", bpm: 108, pad: 233 },
};
let pal = PALETTES.hub;
export function setPalette(id) { pal = PALETTES[id] || PALETTES.hub; }
const note = (i, oct = 0) => pal.root * Math.pow(2, (pal.scale[((i % pal.scale.length) + pal.scale.length) % pal.scale.length] + 12 * oct) / 12);

function tone({ freq = 440, to = null, dur = 0.15, type = "sine", gain = 0.18, delay = 0, dest = null, music = false }) {
  if (!ctx || (!music && !enabled)) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(dest || master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
  if (!music) markBusy(delay + dur);
}

export const sfx = {
  pop() { tone({ freq: note(0, 0), to: note(4, 1), dur: 0.12, type: "triangle" }); if (pal.bubbly) tone({ freq: note(2, 1), dur: 0.08, delay: 0.06, gain: 0.08 }); },
  chime(step = 0) {
    const f = note(step);
    tone({ freq: f, dur: 0.35, type: pal.wave, gain: 0.16 });
    tone({ freq: f * 2, dur: 0.25, type: "sine", gain: 0.05, delay: 0.02 });
    if (pal.sparkle) tone({ freq: f * 3, dur: 0.18, type: "sine", gain: 0.03, delay: 0.06 });
  },
  success() { [0, 2, 4, 7].forEach((s, i) => tone({ freq: note(s), dur: 0.28, type: pal.wave, gain: 0.14, delay: i * 0.09 })); },
  soft() { tone({ freq: note(2, -1), to: note(0, -1), dur: 0.26, type: "sine", gain: 0.1 }); },
  tick() { tone({ freq: note(4, 1), dur: 0.06, type: "square", gain: 0.04 }); },
  go() { tone({ freq: note(0, 1), dur: 0.22, type: pal.wave, gain: 0.14 }); tone({ freq: note(4, 1), dur: 0.3, type: pal.wave, gain: 0.1, delay: 0.08 }); },
  whoosh() { tone({ freq: 200, to: 700, dur: 0.3, type: "sawtooth", gain: 0.035 }); },
  levelUp() { [0, 2, 4, 5, 7, 9].forEach((s, i) => tone({ freq: note(s, s > 4 ? 1 : 0), dur: 0.3, type: "triangle", gain: 0.12, delay: i * 0.08 })); },
  sticker() { [7, 4, 7, 9, 12].forEach((s, i) => tone({ freq: note(s % 8, 1), dur: 0.22, type: "triangle", gain: 0.1, delay: i * 0.07 })); },
  tap() { tone({ freq: note(4, 0), dur: 0.05, type: "triangle", gain: 0.05 }); },
  locked() { tone({ freq: 220, to: 180, dur: 0.18, type: "square", gain: 0.03 }); },
};

// ---------- background music ----------
// A soft, slowly changing arpeggio over a pad. Stops automatically while a microphone game is
// listening (the engine calls stopMusic) so it never counts as the child's voice.
let musicTimer = 0, musicGain = null, musicStep = 0, nextT = 0;
export function startMusic(id = "hub") {
  if (!musicOn || !ctx) return;
  setPalette(id);
  if (musicTimer) return;
  musicGain = ctx.createGain();
  musicGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  musicGain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 1.2);
  musicGain.connect(master);
  nextT = ctx.currentTime + 0.1;
  const pattern = [0, 2, 4, 2, 5, 4, 2, 1, 0, 4, 7, 4, 5, 2, 4, 0];
  const tick = () => {
    if (!ctx) return;
    const beat = 60 / pal.bpm / 2;
    while (nextT < ctx.currentTime + 0.3) {
      const i = musicStep % pattern.length;
      tone({ freq: note(pattern[i] + (musicStep % 32 >= 16 ? 1 : 0)), dur: beat * 1.8, type: pal.wave, gain: 0.05, delay: nextT - ctx.currentTime, dest: musicGain, music: true });
      if (i % 8 === 0) tone({ freq: pal.pad * (musicStep % 32 >= 16 ? 1.122 : 1), dur: beat * 8, type: "sine", gain: 0.035, delay: nextT - ctx.currentTime, dest: musicGain, music: true });
      nextT += beat;
      musicStep++;
    }
  };
  tick();
  musicTimer = setInterval(tick, 120);
}
export function stopMusic() {
  if (!musicTimer) return;
  clearInterval(musicTimer);
  musicTimer = 0;
  const g = musicGain;
  try { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setValueAtTime(g.gain.value || 0.3, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4); setTimeout(() => g.disconnect(), 600); } catch {}
  musicGain = null;
}
export function musicPlaying() { return !!musicTimer; }

// ---------- speech ----------
let voiceOn = true;
let speaking = false;
export function setVoicePrompts(on) { voiceOn = !!on; }

// Prefer a natural-sounding voice over the robotic default when the device has one.
function pickVoice(code) {
  try {
    const all = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith(code.slice(0, 2)));
    const rank = (v) => (/natural|neural|online/i.test(v.name) ? 3 : 0) + (/google|samantha|aria|jenny|zira/i.test(v.name) ? 2 : 0) + (v.lang === code ? 1 : 0);
    return all.sort((a, b) => rank(b) - rank(a))[0] || null;
  } catch { return null; }
}

function utter(text, lang, rate, done) {
  if (!text || typeof speechSynthesis === "undefined") return false;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "ur" ? "ur-PK" : "en-US";
    const voice = pickVoice(u.lang);
    if (voice) u.voice = voice;
    u.rate = rate;
    u.pitch = 1;
    u.volume = 0.85;
    speaking = true;
    const end = () => { speaking = false; markBusy(0.4); done && done(); };
    u.onend = end;
    u.onerror = end;
    // Some browsers never fire onend; never block the microphone for more than 6 s.
    setTimeout(() => { if (speaking) { speaking = false; markBusy(0.2); } }, 6000);
    speechSynthesis.speak(u);
    return true;
  } catch { speaking = false; return false; }
}

// Optional spoken prompts and praise (Settings > Spoken prompts).
export function say(text, lang = "en") {
  if (!voiceOn) return;
  utter(text, lang, 0.95);
}

// Speak a single practice word for Word Garden (always allowed, the child taps "Hear it").
export function speakWord(word, lang = "en", done) {
  return utter(word, lang, 0.75, done);
}

export function stopSpeech() {
  try { speechSynthesis.cancel(); } catch {}
  speaking = false;
}
