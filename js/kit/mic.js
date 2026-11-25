// Microphone input: loudness, voice on/off, and pitch, all computed in the browser.
// No audio is stored or sent anywhere.
import { speakerBusy } from "./audio.js";
import { Vad } from "./vad.js";
import { fingerprint, meanPrint, matchTemplate, nearestTemplate, templateDistance } from "./vowelprint.js";
import { VOWELS, voiceType, vowelDistances, nearestVowel, matchesVowel, clearVowel, humRatio, HUM_RATIO, directionFrom, formantsFrom, cleanSpectrum, bandEnergy, isHiss } from "./vowel.js";

// ---------- pure helpers (unit tested) ----------
export function rmsOf(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

export function toDb(rms) {
  return 20 * Math.log10(Math.max(rms, 1e-8));
}

// Pitch detector (YIN). The buffer is first averaged down to about 12 kHz, which is plenty for a
// voice (70-900 Hz) and makes it about 80 times cheaper than v1's full autocorrelation.
// Returns Hz, or null when there is no clear pitch.
export function detectPitch(buf, sampleRate, minHz = 70, maxHz = 900) {
  // Only a near-silent buffer is skipped. Headset and phone microphones can be far quieter than a
  // laptop's, so loudness is judged against the room by the caller, not by a fixed level here.
  if (rmsOf(buf) < 0.0003) return null;
  const factor = Math.max(1, Math.floor(sampleRate / 12000));
  const sr = sampleRate / factor;
  const n = Math.floor(buf.length / factor);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < factor; k++) s += buf[i * factor + k];
    x[i] = s / factor;
  }
  const minLag = Math.max(2, Math.floor(sr / maxHz));
  const maxLag = Math.min(Math.floor(n / 2), Math.ceil(sr / minHz));
  const w = n - maxLag;
  if (maxLag <= minLag || w < 32) return null;
  // difference function and cumulative mean normalised difference
  const d = new Float32Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < w; i++) { const v = x[i] - x[i + lag]; s += v * v; }
    d[lag] = s;
  }
  let run = 0;
  const cm = new Float32Array(maxLag + 1);
  cm[0] = 1;
  for (let lag = 1; lag <= maxLag; lag++) { run += d[lag]; cm[lag] = run ? (d[lag] * lag) / run : 1; }
  let tau = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (cm[lag] < 0.15) {
      while (lag + 1 <= maxLag && cm[lag + 1] < cm[lag]) lag++;
      tau = lag;
      break;
    }
  }
  if (tau < 0) {
    // no dip under the threshold: accept the best dip only if it is clearly periodic
    let best = minLag;
    for (let lag = minLag; lag <= maxLag; lag++) if (cm[lag] < cm[best]) best = lag;
    if (cm[best] > 0.3) return null;
    tau = best;
  }
  // parabolic interpolation around the dip
  const a = cm[tau - 1] ?? cm[tau], b = cm[tau], c = cm[tau + 1] ?? cm[tau];
  const den = a + c - 2 * b;
  const t = den ? tau + (a - c) / (2 * den) : tau;
  const hz = sr / t;
  return isFinite(hz) && hz >= minHz && hz <= maxHz ? hz : null;
}

export function semitones(hz, refHz) {
  return 12 * Math.log2(hz / refHz);
}

// A reading an octave away from the recent pitch is almost always a detector slip, not the child.
export function fixOctave(hz, refHz) {
  if (!refHz) return hz;
  const r = hz / refHz;
  if (r > 1.8 && r < 2.2) return hz / 2;
  if (r > 0.45 && r < 0.55) return hz * 2;
  return hz;
}

// The room's level from the room check. Normally the 70th percentile (it ignores the odd click and
// keeps steady room noise). But when the check clearly heard a voice as well (the child already
// talking, a headset switching on) the loud frames are not the room: then the quiet frames decide.
// Returns { floor, quietMax }: frames up to quietMax dB are used for the room's spectrum.
export function roomLevel(samples) {
  if (!samples.length) return { floor: -60, quietMax: Infinity };
  const s = [...samples].sort((a, b) => a - b);
  const at = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
  const low = at(0.2), usual = at(0.7);
  if (usual - low > 10) return { floor: Math.max(-75, low + 3), quietMax: low + 6 };
  return { floor: Math.max(-75, usual), quietMax: Infinity };
}

// ---------- live microphone ----------
export class Mic {
  // pitch: compute pitch. vowels: recognise vowels (kit/vowel.js); this also listens for quiet voices
  // and whispers, because the room's noise is subtracted from the spectrum. onDb/offDb: how far above
  // the room a sound must be to count as voice. echoCancellation: on for Word Garden, so the spoken
  // model word is not picked up as the child's attempt.
  // pitchSmooth: how many pitch readings are averaged (a median); fewer follow a sliding voice faster.
  // vad: also run the Silero voice activity detector (vad.js), which tells a voice from noise.
  constructor({ pitch = false, vowels = false, echoCancellation = false, onDb = 12, offDb = 7, softDb = 6, pitchSmooth = 7, vad = false } = {}) {
    this.vadEnabled = vad;
    this.vad = null;
    this.pitchSmooth = Math.max(1, pitchSmooth);
    this.ready = false;
    this.db = -100;
    this.floorDb = -60;
    this.rise = 0;          // dB above the room's noise floor
    this.voiced = false;
    this.pitchHz = null;
    this.level01 = 0;       // 0..1 for meters
    this.pitchEnabled = pitch || vowels;
    this.vowelsEnabled = vowels;
    this.echoCancellation = echoCancellation;
    this.onDb = onDb;
    this.offDb = offDb;
    this.softDb = softDb;
    this.speech = false;    // a voice-like sound is present, even a whisper (vowels only)
    this.speechRise = 0;    // dB above the room in the voice band (vowels only)
    this.formants = null;   // {f1, f2}, smoothed
    this.vowelDist = null;  // distance to each vowel, smoothed
    this.vowel = null;      // the closest vowel right now, or null
    this.hiss = false;      // "sss" or "shh" rather than a vowel
    this.selfSound = false;
    this._hang = 0;
    this._busyT = 0;
    this._onT = 0;
    this._pitchHist = [];
    this._frameT = 0;
    this._pitchAge = 9;
    this._steady = 0;
    this._steadyAge = 9;
    this._lastRaw = null;
    this._type = 1;
    this._f1s = [];
    this._f2s = [];
    this.personal = null;   // the child's own vowels from the voice check (vowel.js makeVowelAnchors)
    this.print = null;      // the sound's fingerprint (vowelprint.js), averaged over the last 3 frames
    this.lastPrint = null;  // the latest single-frame fingerprint (for learning a template)
    this._prints = [];
    this.templates = {};    // the child's own vowel fingerprints {vowel: template}
    this._quietT = 0;
    this._noPitchT = 0;
    this.stopped = false;
    this.reconnects = 0;
  }

  // Use the child's own vowels (or null for the textbook values).
  setAnchors(anchors) { this.personal = anchors || null; this.vowelDist = null; }

  // Use the child's own vowel fingerprints (vowelprint.js makeTemplate), {vowel: template}.
  setTemplates(templates) { this.templates = templates ? { ...templates } : {}; }

  _constraints() {
    return { audio: { echoCancellation: this.echoCancellation, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 } } };
  }

  async start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("no-media");
    // The audio engine is made before the permission prompt, while the tap on Start still counts as
    // the user's action. Phones (Safari, Chrome on Android) only let it run when it is made then; made
    // later it can stay suspended for ever, and the game then hears nothing.
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const resume = () => { try { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {}); } catch {} };
    resume();
    const stream = await navigator.mediaDevices.getUserMedia(this._constraints());
    if (this.ctx.state === "suspended") {
      // Never wait for ever: try for a moment, then carry on and try again on the next tap.
      await Promise.race([this.ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 1200))]);
      if (this.ctx.state === "suspended") {
        this._onTap = resume;
        window.addEventListener("pointerdown", resume, true);
      }
    }
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.3;
    this._attach(stream);
    this.buf = new Float32Array(this.analyser.fftSize);
    this.freq = new Float32Array(this.analyser.frequencyBinCount);
    this.binHz = this.ctx.sampleRate / this.analyser.fftSize;
    // Only the bins up to 9 kHz are used: enough for vowels and for telling a hiss from a vowel.
    // (A Bluetooth headset may deliver only up to 4 or 8 kHz; then fewer bins are filled.)
    this.bins = Math.min(this.freq.length, Math.floor(9000 / this.binHz));
    this.power = new Float64Array(this.bins);
    this.cleanP = new Float64Array(this.bins);
    this.noise = null;
    // A headset or microphone plugged in or out mid-game: follow the new default microphone.
    this._onDevice = () => { clearTimeout(this._devT); this._devT = setTimeout(() => this._reconnect("device_change"), 600); };
    try { navigator.mediaDevices.addEventListener("devicechange", this._onDevice); } catch {}
    this.ready = true;
    // The voice detector starts in the background; until it is ready (or if it cannot run on this
    // device) the loudness and pitch checks are used, as before.
    if (this.vadEnabled && this.ctx.audioWorklet && typeof AudioWorkletNode !== "undefined") {
      const vad = new Vad();
      this.vad = vad;
      vad.start(this.ctx, this.src).catch((e) => { this.vadError = String((e && e.message) || e); if (this.vad === vad) this.vad = null; vad.close(); });
    }
  }

  _attach(stream) {
    try { this.src && this.src.disconnect(); } catch {}
    this.stream = stream;
    this.src = this.ctx.createMediaStreamSource(stream);
    this.src.connect(this.analyser);
    if (this.vad) this.vad.connect(this.src);
    const track = stream.getAudioTracks()[0];
    // The track ends when its device goes away (headset unplugged, Bluetooth dropped).
    if (track) track.addEventListener("ended", () => this._reconnect("track_ended"));
  }

  async _reconnect(reason) {
    if (this.stopped || this._reconnecting) return;
    const track = this.stream && this.stream.getAudioTracks()[0];
    // A device change that left our microphone working needs nothing.
    if (reason === "device_change" && track && track.readyState === "live" && !track.muted) {
      // ...unless the default device itself changed: then follow it, as a laptop or phone does for calls
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const id = track.getSettings ? track.getSettings().deviceId : null;
        if (!id || devs.some((d) => d.kind === "audioinput" && d.deviceId === id)) {
          const def = devs.find((d) => d.kind === "audioinput" && d.deviceId === "default");
          if (!def || !track.label || def.label.includes(track.label)) return;
        }
      } catch { return; }
    }
    this._reconnecting = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia(this._constraints());
      if (this.stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      const old = this.stream;
      this._attach(stream);
      try { old && old.getTracks().forEach((t) => t.stop()); } catch {}
      this.reconnects++;
      // A new microphone has a new loudness: let the room level settle again quickly.
      this._relearn = 1.5;
      this.noise = null;
    } catch {} finally { this._reconnecting = false; }
  }

  _readPower() {
    this.analyser.getFloatFrequencyData(this.freq);
    for (let i = 0; i < this.bins; i++) this.power[i] = Math.pow(10, Math.max(-140, this.freq[i]) / 10);
  }

  _resetVowel() {
    this.speech = false; this.speechRise = 0; this.formants = null; this.vowelDist = null; this.vowel = null; this.hiss = false;
    this._f1s = []; this._f2s = []; this.print = null; this.lastPrint = null; this._prints = [];
  }

  // Call once per frame.
  update(dt) {
    if (!this.ready) return;
    // While the game itself is making a sound or speaking, do not listen, so the speaker is never
    // mistaken for the child. A short chime keeps the last state; anything longer (a spoken
    // prompt) drops to silence, so a prompt can never fill a meter on its own. Games pause their
    // progress while selfSound is true.
    if (speakerBusy()) {
      this.selfSound = true;
      this._busyT += dt;
      if (this._busyT > 0.3) { this.voiced = false; this.db = this.floorDb; this.rise = 0; this.level01 = 0; this._hang = 0; this._onT = 0; this._resetVowel(); if (this.vad) this.vad.reset(); }
      return;
    }
    this.selfSound = false;
    this._busyT = 0;
    this.analyser.getFloatTimeDomainData(this.buf);
    const db = toDb(rmsOf(this.buf));
    // Digital silence (a Bluetooth headset switching mode, a muted track) is not the room.
    if (db < -110) { this.voiced = false; this.rise = 0; this.level01 = 0; this._resetVowel(); return; }
    this.db = this.db * 0.6 + db * 0.4;
    this._trackFloor(dt);
    this.rise = this.db - this.floorDb;
    // A sound must stay above the threshold for a moment before it counts, so a click or the tail
    // of the game's own sound does not start a hold. Short enough that "pig" or "cat" still counts.
    const loud = this.rise > this.onDb, off = this.rise < this.offDb;
    this._onT = loud ? this._onT + dt : 0;
    const on = loud && (this.voiced || this._onT >= 0.05);
    if (on) { this.voiced = true; this._hang = 0.15; }
    else if (off) { this._hang -= dt; if (this._hang <= 0) this.voiced = false; }
    this.level01 = Math.max(0, Math.min(1, Math.max(this.rise, this.speechRise) / 40));
    if (!this.pitchEnabled) return;
    // About 20 readings a second is enough to steer, and keeps the frame cheap.
    this._frameT -= dt;
    this._pitchAge += dt;
    if (this._frameT > 0) return;
    this._frameT = 0.05;
    if (this.vowelsEnabled) this._analyseVowel();
    // The pitch is also looked for in a sound under the loudness bar (a quiet microphone, a soft
    // voice): a voice has a steady pitch and room noise has none, so a steady pitch counts as a voice.
    if (this.voiced || this.speech || this.rise > 2) {
      const raw = detectPitch(this.buf, this.ctx.sampleRate);
      if (raw && this._steady >= 2 && this.rise > 2) { this.voiced = true; this._hang = Math.max(this._hang, 0.25); }
      // the same pitch several readings in a row is a real voice; a whisper or noise only flickers
      this._steady = raw && this._lastRaw && Math.abs(raw - this._lastRaw) / this._lastRaw < 0.12 ? this._steady + 1 : 0;
      this._lastRaw = raw;
      if (raw) {
        this._pitchHist.push(fixOctave(raw, this.pitchHz));
        if (this._pitchHist.length > this.pitchSmooth) this._pitchHist.shift();
        const sorted = [...this._pitchHist].sort((a, b) => a - b);
        this.pitchHz = sorted[Math.floor(sorted.length / 2)];
        this._pitchAge = 0;
        this._type = voiceType(this.pitchHz);
      }
    } else { this._steady = 0; this._lastRaw = null; }
    this._steadyAge = this._steady >= 3 ? 0 : this._steadyAge + 0.05;
    if (this._pitchAge > 0.4) { this._pitchHist = []; this.pitchHz = null; }
  }

  // The room's level is not fixed: it follows the room while nobody speaks, so a microphone that
  // changes (headset plugged in, phone gain moving) or a room check spoiled by silence corrects itself.
  _trackFloor(dt) {
    if (this._relearn > 0) {
      this._relearn -= dt;
      // a new microphone: follow its level, down quickly and up more slowly, so a child who keeps
      // talking while a headset connects is not taken for the room
      this.floorDb += (this.db - this.floorDb) * Math.min(1, dt * (this.db < this.floorDb ? 6 : 2));
      return;
    }
    const quiet = !this.voiced && !this.speech;
    this._quietT = quiet ? this._quietT + dt : 0;
    // Down quickly (the room is quieter than thought). Up slowly, and only for a level close to the
    // room's: a sustained voice just under the "voice" bar must never be absorbed into the room level
    // (that made held vowels vanish while short sounds still worked). A clear pitch is never the room.
    const up = this.db - this.floorDb;
    if (this._quietT > 1 && (up < 0 || (up < 2.5 && !this.periodic))) this.floorDb += up * Math.min(1, dt * (up < 0 ? 0.8 : 0.15));
    // A "voice" with no pitch for a long time is steady noise (a fan, headset hiss) the room check
    // missed. A whisper is not affected: it shows as speech in the vowel band.
    if (this.voiced && !this.periodic && !this.speech) this._noPitchT += dt; else this._noPitchT = 0;
    if (this._noPitchT > 6) { this.floorDb = this.db - 2; this._noPitchT = 0; this.voiced = false; this._hang = 0; }
  }

  // The voice detector (vad.js): ready, its speech decision and its latest probability.
  get vadReady() { return !!(this.vad && this.vad.ready); }
  get vadSpeech() { return this.vadReady && this.vad.speaking; }
  get vadProb() { return this.vadReady ? this.vad.prob : null; }

  // Is someone using their voice right now? The loudness and voice-band checks, or the voice detector.
  // The detector is a second way in, never a veto: tested on held sounds it missed steady "aaa" and
  // hums "mmm" (it is trained on conversation), but it catches soft and breathy speech.
  get voicePresent() { return this.voiced || this.speech || this.vadSpeech; }

  // True when the voice is really phonated: a clear pitch was heard a moment ago.
  get periodic() { return this._pitchAge < 0.25; }

  // Stricter: a held voice with the same pitch for several readings in a row. A real voice wobbles,
  // so a short flicker is forgiven.
  get steadyVoice() { return this._steadyAge < 0.3; }

  _analyseVowel() {
    this._readPower();
    // The room's spectrum: learnt again after a new microphone, then kept up to date in quiet moments.
    // While it is being learnt again (just after a new microphone), the quietest frames win, so a
    // child already talking is not learnt as the room.
    if (!this.noise) { if (!this.voiced || this._relearn > 0) this.noise = Float64Array.from(this.power); }
    else if (this._relearn > 0) { for (let i = 0; i < this.bins; i++) this.noise[i] = Math.min(this.noise[i], this.power[i] * 1.5); }
    else if (!this.voiced && !this.speech && this._quietT > 0.5) for (let i = 0; i < this.bins; i++) this.noise[i] += (this.power[i] - this.noise[i]) * 0.03;
    // A frame quieter than the learnt room cannot hold a voice: the learnt room was too loud (a voice
    // got into it), so it comes down at once. Otherwise quiet speech would be hidden as "noise".
    if (this.noise) {
      const nowE = bandEnergy(this.power, this.binHz, 150, 5000), roomE = bandEnergy(this.noise, this.binHz, 150, 5000);
      if (nowE < roomE * 0.5) for (let i = 0; i < this.bins; i++) this.noise[i] += (this.power[i] - this.noise[i]) * 0.3;
    }
    const clean = cleanSpectrum(this.power, this.noise, this.cleanP);
    // the hum feature (vowel.js humRatio), smoothed a little
    const hr = humRatio(clean, this.binHz);
    this.humRatio = hr == null ? null : this.humRatio == null ? hr : this.humRatio * 0.5 + hr * 0.5;
    const noiseE = this.noise ? bandEnergy(this.noise, this.binHz, 150, 5000) : 1e-10;
    const cleanE = bandEnergy(clean, this.binHz, 150, 5000);
    this.speechRise = 10 * Math.log10(1 + cleanE / Math.max(noiseE, 1e-11));
    const thresh = this.speech ? this.softDb - 2 : this.softDb;
    this.speech = this.speechRise > thresh;
    this.hiss = this.speech && isHiss(clean, this.binHz);
    // the fingerprint of a voiced sound (not a hiss), steadied over the last 3 frames
    const fp = this.speech && !this.hiss ? fingerprint(clean, this.binHz) : null;
    this.lastPrint = fp;
    if (fp) { this._prints.push(fp); if (this._prints.length > 3) this._prints.shift(); }
    else this._prints = [];
    this.print = meanPrint(this._prints);
    const fm =this.speech && !this.hiss ? formantsFrom(clean, this.binHz) : null;
    if (!fm) {
      if (!this.speech || this.hiss) { this.formants = null; this.vowelDist = null; this.vowel = null; this._f1s = []; this._f2s = []; }
      return;
    }
    // median of the last few frames: one odd reading never moves the game
    this._f1s.push(fm.f1); this._f2s.push(fm.f2);
    if (this._f1s.length > 5) { this._f1s.shift(); this._f2s.shift(); }
    const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
    this.formants = { f1: med(this._f1s), f2: med(this._f2s) };
    const d = vowelDistances(this.formants.f1, this.formants.f2, this._type, this.periodic, this.personal);
    if (this.vowelDist) for (const v of VOWELS) this.vowelDist[v] = this.vowelDist[v] * 0.6 + d[v] * 0.4;
    else this.vowelDist = d;
    this.vowel = nearestVowel(this.vowelDist).vowel;
  }

  // Is the child making this vowel? See matchesVowel for lenience.
  // A vowel whose fingerprint this child has given is judged by it; others by their resonances.
  isVowel(target, lenience = 0.5) {
    const m = this._templateMatch(target, Math.min(1, lenience + 0.25));
    return m == null ? matchesVowel(this.vowelDist, target, lenience) : m;
  }

  _templateMatch(target, lenience) {
    if (!this.templates[target]) return null;
    if (!this.print) return false;
    return matchTemplate(this.print, target, this.templates, lenience);
  }

  // Before a vowel is learnt from a sound: do the resonances clearly say it is another vowel? (Then it
  // is not learnt, so a child who keeps saying "aaa" when asked for O does not get "aaa" learnt as O.)
  // O and U are not held against each other: on real devices that is the reading that misleads (an O
  // read as U), and the fingerprint keeps them apart once learnt.
  clearlyOtherThan(target) {
    if (!this.vowelDist) return false;
    const near = { ooo: "uuu", uuu: "ooo" }[target];
    return VOWELS.some((v) => v !== target && v !== near && clearVowel(this.vowelDist, v, 0.25));
  }

  // The learnt vowel the sound is clearly closest to, or null.
  heardTemplate(lenience = 0.5) { return this.print ? nearestTemplate(this.print, this.templates, lenience) : null; }

  // Distance to each learnt fingerprint (for the tune view).
  templateDistances() {
    const out = {};
    for (const [v, t] of Object.entries(this.templates)) out[v] = this.print ? templateDistance(this.print, t) : null;
    return out;
  }

  // A hum "mmm": a real voice (clear pitch) with nearly no energy above 600 Hz. limit: this child's
  // own limit from the voice check, if it learnt one.
  isHum(limit = this.humLimit) {
    // "eee" also keeps most of its energy low (its first resonance is low), but it has a strong high
    // second resonance; a hum has none: a sound with one above 1500 Hz is never a hum.
    if (this.formants && this.formants.f2 > 1500) return false;
    return this.periodic && !this.hiss && this.humRatio != null && this.humRatio < (limit || HUM_RATIO);
  }

  // The strict test (vowel.js clearVowel): this vowel and no other.
  isClearVowel(target, lenience = 0.5) {
    const m = this._templateMatch(target, lenience);
    return m == null ? clearVowel(this.vowelDist, target, lenience) : m;
  }

  // Up, down or neither for Sky Glide.
  direction(anchors, reach) {
    if (!this.formants) return 0;
    return directionFrom(this.formants.f1, this.formants.f2, { anchors, type: this._type, reach });
  }

  // Measure background noise for `seconds`. Returns the noise floor in dB.
  // `isCancelled` lets the engine stop early when the player leaves.
  calibrateFloor(seconds = 1.5, isCancelled = () => false) {
    return new Promise((resolve) => {
      const samples = [];
      const frameP = [];   // [db, power] of each frame
      let frames = 0;
      const t0 = performance.now();
      const step = () => {
        if (isCancelled()) return resolve(this.floorDb);
        if (!speakerBusy()) {
          this.analyser.getFloatTimeDomainData(this.buf);
          const db = toDb(rmsOf(this.buf));
          // A headset or phone often sends pure silence for a moment while it switches on. That is
          // not the room: counting it made every later sound look like a voice.
          if (db > -110) {
            samples.push(db);
            this._readPower();
            if (frameP.length < 400) frameP.push([db, Float64Array.from(this.power)]);
            frames++;
          }
        }
        const el = performance.now() - t0;
        // wait (up to 3 s more) until the microphone really delivers sound
        if (el < seconds * 1000 || (frames < 20 && el < (seconds + 3) * 1000)) requestAnimationFrame(step);
        else {
          const { floor, quietMax } = roomLevel(samples);
          this.floorDb = floor;
          // the room's spectrum from the quiet frames only, so a voice in the check is not learnt as noise
          const quiet = frameP.filter(([db]) => db <= quietMax);
          if (quiet.length) {
            const noise = new Float64Array(this.bins);
            for (const [, pw] of quiet) for (let i = 0; i < this.bins; i++) noise[i] += pw[i];
            for (let i = 0; i < this.bins; i++) noise[i] /= quiet.length;
            this.noise = noise;
          }
          resolve(this.floorDb);
        }
      };
      step();
    });
  }

  stop() {
    this.stopped = true;
    clearTimeout(this._devT);
    try { this.vad && this.vad.close(); } catch {}
    this.vad = null;
    try { this._onDevice && navigator.mediaDevices.removeEventListener("devicechange", this._onDevice); } catch {}
    try { this._onTap && window.removeEventListener("pointerdown", this._onTap, true); } catch {}
    try { this.stream && this.stream.getTracks().forEach((t) => t.stop()); } catch {}
    try { this.ctx && this.ctx.close(); } catch {}
    this.ready = false;
  }
}
