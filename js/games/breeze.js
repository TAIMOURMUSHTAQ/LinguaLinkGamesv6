// BALLOON BREEZE: hold a vowel to blow up the balloon. The child holds the sound shown (A "aaa",
// E "ehh", I "eee", O "ooo", U "uuu") and the balloon blows up step by step. Only the sound asked for
// counts: other sounds, noise, claps, hissing or whispering do nothing, and the game says which sound
// it wants. Every level uses all five vowels. Holds are 5, 10, 15, 20 and 25 seconds, level by level;
// the child may take a breath, and the balloon waits. Later levels ask for a closer match.
// Sensor mode: microphone with vowel recognition (after a short voice check that learns the child's
// own five vowels). Touch mode: press and hold the big button (or the space bar), where the adult
// judges the sound.
import { W, H, sky, hills, ring, label, lumi, clamp, lerp, rr, vignette, star, glow } from "../kit/draw.js";
import { sun, rainbow, cloudLayer, farBalloon, flock, swayTree, flowerRow, windStreaks, motes, SparkTrail } from "../kit/scene.js";
import { clampScore } from "../kit/results.js";
import { createVowelCheck, savedVowels, VOWEL_LETTER } from "../kit/vowelcheck.js";

// lenience: 1 accepts close neighbours (ooo for uuu), 0 needs a clear match. It tightens level by level.
// target: seconds of the sound for each balloon: 5, 10, 15, 20, 25.
export const LEVELS = [
  { name: "First Puffs", goal: "Say A, E, I, O and U. Each sound for 5 seconds to blow up the balloon.", target: 5, rounds: 5, continuous: false, steadyTol: null, lenience: 1, sounds: ["aah", "ehh", "eee", "ooo", "uuu"], settings: { target_sec: 5, rounds: 5, lenience: 1 } },
  { name: "Bigger Balloons", goal: "All five sounds, 10 seconds each. Take a breath when you need to.", target: 10, rounds: 5, continuous: false, steadyTol: null, lenience: 0.8, sounds: ["ooo", "aah", "uuu", "eee", "ehh"], settings: { target_sec: 10, rounds: 5, lenience: 0.8 } },
  { name: "High in the Sky", goal: "All five sounds, 15 seconds each. Keep the sound clear.", target: 15, rounds: 5, continuous: false, steadyTol: null, lenience: 0.6, sounds: ["eee", "uuu", "aah", "ehh", "ooo"], settings: { target_sec: 15, rounds: 5, lenience: 0.6 } },
  { name: "Gentle Voice", goal: "All five sounds, 20 seconds each, with a steady voice.", target: 20, rounds: 5, continuous: false, steadyTol: 8, lenience: 0.4, sounds: ["ehh", "ooo", "eee", "aah", "uuu"], settings: { target_sec: 20, rounds: 5, steady_tolerance_db: 8, lenience: 0.4 } },
  { name: "Over the Mountains", goal: "All five sounds, 25 seconds each, smooth, steady and clear.", target: 25, rounds: 5, continuous: false, steadyTol: 6, lenience: 0.25, sounds: ["uuu", "ehh", "ooo", "eee", "aah"], settings: { target_sec: 25, rounds: 5, steady_tolerance_db: 6, lenience: 0.25 } },
];

// The sound for each round, cycling through the level's list.
export function soundForRound(level, round) {
  return level.sounds[round % level.sounds.length];
}

// Score: rounds completed matter most; steadiness adds a little on the harder levels.
export function scoreBreeze({ roundsDone, rounds, steadyPct = null }) {
  const base = (roundsDone / rounds) * 100;
  if (steadyPct == null) return clampScore(base);
  return clampScore(base * 0.85 + steadyPct * 0.15);
}

const READY_SEC = 1.4; // pause before each round starts listening

const BALLOON = { aah: "#ff7aa2", ooo: "#7ab8ff", eee: "#ffc94a", ehh: "#9be38f", uuu: "#c49bff" };
const STEPS = 4; // the balloon grows in visible steps, each marked on the ring


function drawScene(c, time, lift, levelIndex) {
  const tones = [["#9ad7ff", "#fde2c8"], ["#8ecbff", "#ffe0d1"], ["#7fb8f5", "#ffd6c9"], ["#6fa3ea", "#ffcfc4"], ["#5b8fde", "#ffc7bd"]][levelIndex];
  sky(c, tones[0], tones[1]);
  sun(c, 860, 170 + lift * 40, 62, time);
  rainbow(c, 240, 640 + lift * 150, 400, 0.32);
  cloudLayer(c, time, { n: 3, y: 70 + lift * 40, gap: 120, speed: 9, scale: 0.65, seed: 3, alpha: 0.7 });
  farBalloon(c, 170 + Math.sin(time * 0.1) * 60, 250 + lift * 90, 1, time, "#ffd166");
  farBalloon(c, 1160 + Math.sin(time * 0.13 + 1) * 40, 330 + lift * 110, 0.8, time, "#06d6a0");
  flock(c, time, { y: 210 + lift * 50, seed: 5 + levelIndex });
  const mtn = levelIndex >= 4;
  hills(c, { y: 520 + lift * 140, amp: mtn ? 260 : 120, color: "#b8a1e6", seed: 3, offset: time * 6, bumps: mtn ? 7 : 5 });
  hills(c, { y: 590 + lift * 180, amp: 90, color: "#86c5a6", seed: 7, offset: time * 12 });
  swayTree(c, 150, 600 + lift * 190, 1.1, time);
  swayTree(c, 1130, 590 + lift * 190, 1.3, time, { leaf: "#74c69d" });
  hills(c, { y: 660 + lift * 220, amp: 60, color: "#5fa98a", seed: 11, offset: time * 20 });
  flowerRow(c, time, { y: 712 + lift * 220, n: 16, seed: 21 + levelIndex });
  cloudLayer(c, time, { n: 2, y: 150 + lift * 100, gap: 110, speed: 24, scale: 1.15, seed: 9 });
  windStreaks(c, time, { n: 6, alpha: 0.28 });
  motes(c, time, { n: 14, seed: 13, rise: 12 });
}

// size: 0 (nearly flat) .. 1 (fully blown up). The basket stays the same size.
function drawBalloon(c, x, y, t, voicing, color, sad = false, size = 1) {
  const k = lerp(0.42, 1, clamp(size, 0, 1));
  c.save();
  c.translate(x, y + Math.sin(t * 2) * 6);
  c.rotate(Math.sin(t * 1.3) * 0.04);
  c.save();
  c.translate(0, 110 - 110 * k);   // the neck stays above the basket while the balloon grows
  c.scale(k, k);
  c.strokeStyle = "#6b4f3a"; c.lineWidth = 3;
  c.beginPath(); c.moveTo(-40, 70); c.lineTo(-22, 110); c.moveTo(40, 70); c.lineTo(22, 110); c.stroke();
  if (voicing) glow(c, 0, 0, 150 + Math.sin(t * 9) * 12, "rgba(255,255,255,0.6)");
  const g = c.createRadialGradient(-25, -40, 10, 0, 0, 110);
  g.addColorStop(0, "#ffffff"); g.addColorStop(0.25, color); g.addColorStop(1, "#5a3d8a");
  c.fillStyle = g;
  c.beginPath(); c.ellipse(0, 0, 78, 92, 0, 0, Math.PI * 2); c.fill();
  // coloured panels, a band of stars, and a shine that slides across
  c.save(); c.beginPath(); c.ellipse(0, 0, 78, 92, 0, 0, Math.PI * 2); c.clip();
  c.fillStyle = "rgba(255,255,255,0.2)";
  for (const w of [-52, 0, 52]) { c.beginPath(); c.ellipse(w, 0, 12, 92, 0, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = "rgba(255,255,255,0.3)"; c.fillRect(-80, 30, 160, 16);
  for (let i = -3; i <= 3; i++) star(c, i * 24, 38, 6, "#fff3b0", t);
  c.fillStyle = "rgba(255,255,255,0.28)"; c.save(); c.translate(((t * 40) % 260) - 130, 0); c.rotate(0.3); c.fillRect(-13, -110, 26, 220); c.restore();
  c.restore();
  c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = 6;
  c.beginPath(); c.ellipse(0, 0, 30, 90, 0, -Math.PI / 2, Math.PI / 2); c.stroke();
  c.beginPath(); c.ellipse(0, 0, 30, 90, 0, Math.PI / 2, Math.PI * 1.5); c.stroke();
  c.restore();
  c.fillStyle = "#c98b4a"; rr(c, -28, 118, 56, 36, 8); c.fill();
  c.strokeStyle = "#9c6630"; c.lineWidth = 3; rr(c, -28, 118, 56, 36, 8); c.stroke();
  c.restore();
  lumi(c, x, y + 108, 0.55, { t, mood: voicing ? "wow" : sad ? "happy" : "happy" });
}

const def = {
  id: "breeze",
  version: "6.0.0",
  title: "Balloon Breeze",
  color: "#ef476f",
  focus: "Blow up the balloon with your voice: A, E, I, O, U",
  input: "mic",
  mic: { vowels: true, onDb: 9, offDb: 5, softDb: 7 },
  inputLabel: "Microphone (only the sound asked for counts)",
  touchLabel: "Hold the big button while the child holds the sound",
  skills: ["Long sounds", "Clear sounds", "Steady voice"],
  howTo: [
    ["🎤", "First say each sound when asked: A, E, I, O, U. The game learns your voice."],
    ["🔤", "Look at the letter in the bubble and say that sound."],
    ["🎈", "Keep the sound going. The balloon grows until it is full."],
    ["😮‍💨", "Take a breath when you need to. The balloon waits for you."],
  ],
  levels: LEVELS,

  drawPreview(c, li, t = 0) { drawScene(c, t, 0, li); drawBalloon(c, W / 2, 330, t, false, BALLOON[LEVELS[li].sounds[0]]); vignette(c, 0.2); },

  create(ctx) {
    const sparks = new SparkTrail({ reduced: ctx.reduced, life: 1, size: 9 });
    const L = ctx.level;
    const g = {
      done: false,
      round: 0,
      roundsDone: 0,
      progress: 0,         // 0..1 of the current round
      hold: 0,             // current continuous voiced time
      holds: [],           // longest continuous hold per round
      roundLongest: 0,
      roundTime: 0,
      breaks: 0,
      steadyFrames: 0,
      voicedFrames: 0,
      holdDb: [],
      touchDown: false,
      stars: [],
      ready: 0,            // seconds left of the "get ready" moment before a round listens
      celebrate: 0,        // seconds left of the between-rounds moment
      celebrateLen: 0,
      failed: false,       // that moment follows a missed round
      warn: 0,
      lift: 0,
      riseSum: 0,
      target: L.target,    // current hold target (adaptive changes it between rounds)
      tol: L.steadyTol,
      targets: [],         // target used for each round
      sound: soundForRound(L, 0),
      soundsUsed: [],
      lenience: L.lenience,
      wrongT: 0,           // how long another sound has been going on
      heardAs: null,       // the vowel it sounded like, shown as a hint
      targetFrames: 0,     // voice frames that matched the sound asked for
      speechFrames: 0,     // all voice frames
      bySound: {},         // per vowel: rounds, done, longest hold
    };
    // Rounds are few, so the game reacts quickly: easier after 1 missed round, harder after 2 in a row.
    // The hold time is the level's (5, 10, 15, 20 or 25 s) and never changes. Easier: the sound may be
    // a little less exact, and the steadiness band is wider. Harder: the reverse.
    g.adaptive = ctx.makeAdaptive({ upAfter: 2, downAfter: 1 });
    const limitFor = (target) => target * 2 + 10; // seconds allowed per round, breaths included

    // First the voice check (once per visit), so the game knows this child's own five vowels.
    const sensors0 = ctx.mode === "sensors" && ctx.mic;
    const saved = sensors0 ? savedVowels() : null;
    if (saved) ctx.mic.setAnchors(saved);
    g.phase = sensors0 && !saved ? "check" : "play";
    if (sensors0 && saved) ctx.event("voice_check_reused", {});
    const check = g.phase === "check" ? createVowelCheck(ctx, { colors: BALLOON, onDone: () => { g.phase = "play"; newRound(); } }) : null;

    const newRound = () => {
      g.target = L.target;
      g.tol = L.steadyTol ? g.adaptive.scale(L.steadyTol, 0.3, -0.15) : null;
      g.lenience = clamp(g.adaptive.scale(L.lenience, 0.6, 0.4) + (g.adaptive.step > 0 ? 0.15 * g.adaptive.step : 0), 0, 1);
      g.targets.push(g.target);
      g.sound = soundForRound(L, g.round);
      g.soundsUsed.push(g.sound);
      (g.bySound[g.sound] ||= { rounds: 0, done: 0, longest_hold_sec: 0 }).rounds++;
      g.wrongT = 0; g.heardAs = null;
      g.progress = 0; g.hold = 0; g.roundLongest = 0; g.roundTime = 0; g.holdDb = []; g.failed = false;
      g.stars = Array.from({ length: STEPS - 1 }, (_, i) => ({ p: (i + 1) / STEPS, got: false }));
      g.ready = READY_SEC;
      ctx.event("round_start", { round: g.round + 1, sound: g.sound, target_sec: g.target });
      ctx.say("sayTarget", { s: ctx.t("snd_" + g.sound) });
    };
    const celebrate = (sec) => { g.celebrate = sec; g.celebrateLen = sec; };

    if (ctx.mode === "touch") {
      ctx.setControls([{ id: "hold", kind: "hold", label: ctx.t("holdButton"), onDown: () => (g.touchDown = true), onUp: () => (g.touchDown = false) }]);
    }

    g.start = () => { if (check) check.begin(); else newRound(); };

    g.update = (dt) => {
      if (g.phase === "check") { check.update(dt); return; }
      if (g.celebrate > 0) {
        g.celebrate -= dt;
        // a finished round floats up; a missed round sinks gently back
        g.lift = g.failed ? lerp(g.lift, 0, dt * 3) : lerp(g.lift, 1, dt * 2);
        if (g.failed) g.progress = Math.max(0, g.progress - dt * 0.8);
        if (g.celebrate <= 0) {
          g.round++;
          if (g.round >= L.rounds) { g.done = true; return; }
          g.lift = 0; newRound();
        }
        return;
      }
      const sensors = ctx.mode === "sensors" && ctx.mic;
      // The round only starts listening once the child has seen the new sound (and any spoken
      // prompt has finished). While the game itself makes a sound, the round simply waits.
      if (g.ready > 0) {
        if (!(sensors && ctx.mic.selfSound)) g.ready -= dt;
        return;
      }
      if (sensors && ctx.mic.selfSound) return;
      g.roundTime += dt;
      let voicing = false, steady = true;
      if (sensors) {
        // Progress needs a real voice (clear pitch, not noise, a clap, a hiss or a whisper) making
        // the sound asked for.
        const mic = ctx.mic;
        const heard = (mic.voiced || mic.speech) && mic.steadyVoice && !mic.hiss;
        if (heard) g.speechFrames++;
        voicing = heard && mic.isVowel(g.sound, g.lenience);
        if (voicing) { g.targetFrames++; g.wrongT = 0; g.heardAs = null; }
        else if (mic.voiced || mic.speech) { g.wrongT += dt; if (mic.vowel && mic.vowel !== g.sound) g.heardAs = mic.vowel; }
        else { g.wrongT = Math.max(0, g.wrongT - dt * 2); if (g.wrongT === 0) g.heardAs = null; }
        if (voicing) {
          g.holdDb.push(ctx.mic.rise);
          g.riseSum += ctx.mic.rise;
          if (g.tol && g.holdDb.length > 20) {
            const recent = g.holdDb.slice(-60);
            const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
            steady = Math.abs(ctx.mic.rise - mean) <= g.tol;
          }
        }
      } else {
        voicing = g.touchDown;
      }
      if (voicing) {
        g.voicedFrames++;
        if (steady) g.steadyFrames++;
        g.hold += dt;
        g.roundLongest = Math.max(g.roundLongest, g.hold);
        if (steady) g.progress = clamp(g.progress + dt / g.target, 0, 1);
        else g.warn = 0.6;
      } else {
        if (g.hold > 0.25) { g.breaks++; ctx.event("voice_break", { after_sec: Math.round(g.hold * 10) / 10 }); }
        g.hold = 0;
        if (L.continuous) g.progress = Math.max(0, g.progress - dt * 0.9);
      }
      g.warn = Math.max(0, g.warn - dt);
      // A chime would pause the microphone mid-hold, so stars only sparkle when listening.
      for (const s of g.stars) if (!s.got && g.progress >= s.p) { s.got = true; if (!sensors) ctx.sfx.chime(Math.round(s.p * 4)); ctx.fx.burst(W / 2 + 96, 330 - s.p * 170, { n: 12, speed: 170 }); }
      g.lift = g.progress * 0.6;
      if (g.progress >= 1) {
        g.roundsDone++;
        (g.doneRounds ||= {})[g.round] = true;
        g.holds.push(g.roundLongest);
        g.bySound[g.sound].done++;
        g.bySound[g.sound].longest_hold_sec = Math.max(g.bySound[g.sound].longest_hold_sec, Math.round(g.roundLongest * 10) / 10);
        ctx.event("round_complete", { round: g.round + 1, sound: g.sound, target_sec: g.target, longest_hold_sec: Math.round(g.roundLongest * 10) / 10, time_sec: Math.round(g.roundTime * 10) / 10 });
        g.adaptive.success(ctx.time);
        ctx.sfx.success();
        ctx.fx.burst(W / 2, 220, { n: 30 });
        ctx.praise(W / 2, 560);
        celebrate(2.6);
      } else if (g.roundTime > limitFor(g.target)) {
        g.holds.push(g.roundLongest);
        g.bySound[g.sound].longest_hold_sec = Math.max(g.bySound[g.sound].longest_hold_sec, Math.round(g.roundLongest * 10) / 10);
        ctx.event("round_timeout", { round: g.round + 1, sound: g.sound, target_sec: g.target, longest_hold_sec: Math.round(g.roundLongest * 10) / 10 });
        g.adaptive.miss(ctx.time);
        ctx.sfx.soft();
        ctx.fx.text(ctx.t("tryRoundAgain"), W / 2, 560, "#fff");
        g.failed = true;
        celebrate(2.2);
      }
    };

    g.draw = (c) => {
      const tm = ctx.anim;
      drawScene(c, tm, g.lift, ctx.levelIndex);
      const sinking = g.failed && g.celebrate > 0;
      const by = 420 - g.progress * 170 - (g.celebrate > 0 && !g.failed ? (g.celebrateLen - g.celebrate) * 30 : 0);
      const voicing = ctx.mode === "sensors" ? ctx.mic && ctx.mic.isVowel(g.sound, g.lenience) && (ctx.mic.voiced || ctx.mic.speech) : g.touchDown;
      drawBalloon(c, W / 2, by, ctx.time, voicing, BALLOON[g.sound] || BALLOON.aah, sinking, g.progress);
      // sparkles rise from the balloon while the right sound is held; each step gets a little party
      const dtDraw = Math.max(0, ctx.time - (g.lastDraw || 0)); g.lastDraw = ctx.time;
      sparks.update(dtDraw);
      if (voicing) sparks.add(W / 2 + (Math.random() - 0.5) * 120 * (0.4 + g.progress * 0.6), by + 120, dtDraw, 40);
      sparks.draw(c);
      const stepNow = Math.floor(g.progress * STEPS + 1e-6);
      if (stepNow > (g.stepShown || 0)) { ctx.fx.burst(W / 2, by, { n: 18, speed: 300 }); ctx.fx.ring && ctx.fx.ring(W / 2, by, { r: 180, color: "rgba(255,255,255,0.8)" }); }
      g.stepShown = stepNow;
      vignette(c, 0.18);
      if (g.phase === "check") { check.draw(c); return; }
      // hold ring, marked in steps, with whole seconds
      ring(c, 150, 150, 70, g.progress, { color: "#ef476f", track: "rgba(255,255,255,0.45)", width: 14 });
      c.save(); c.strokeStyle = "#fff"; c.lineWidth = 4;
      for (let i = 0; i < STEPS; i++) {
        const a = -Math.PI / 2 + (i / STEPS) * Math.PI * 2;
        c.beginPath(); c.moveTo(150 + Math.cos(a) * 60, 150 + Math.sin(a) * 60); c.lineTo(150 + Math.cos(a) * 80, 150 + Math.sin(a) * 80); c.stroke();
      }
      c.restore();
      label(c, `${Math.floor(g.progress * g.target + 1e-6)}s`, 150, 140, { size: 34, color: "#2b2d42", shadow: false });
      label(c, ctx.t("ofSec", { n: g.target }), 150, 174, { size: 20, color: "#2b2d42", shadow: false, weight: 500 });
      // the sound to make this round, as a big bubble: its letter and how it sounds
      c.save(); c.fillStyle = "rgba(255,255,255,0.92)"; rr(c, 960, 62, 270, 108, 54); c.fill(); c.restore();
      c.save(); c.fillStyle = BALLOON[g.sound]; c.beginPath(); c.arc(1016, 116, 40, 0, Math.PI * 2); c.fill(); c.restore();
      label(c, VOWEL_LETTER[g.sound], 1016, 118, { size: 52, color: "#2b2d42", shadow: false, weight: 800 });
      label(c, ctx.t("snd_" + g.sound), 1146, 116, { size: 44, color: BALLOON[g.sound] === "#ffc94a" ? "#b07d00" : "#2b2d42", shadow: false, weight: 800 });
      // the rounds so far, one letter chip each
      const n = L.rounds, x0 = W / 2 - ((n - 1) * 62) / 2;
      for (let i = 0; i < n; i++) {
        const snd = soundForRound(L, i), past = i < g.round, now = i === g.round;
        c.save(); c.globalAlpha = past || now ? 1 : 0.55;
        c.fillStyle = past ? (g.doneRounds && g.doneRounds[i] ? "#06d6a0" : "rgba(255,255,255,0.55)") : now ? BALLOON[snd] : "rgba(255,255,255,0.7)";
        rr(c, x0 + i * 62 - 27, 26, 54, 36, 18); c.fill(); c.restore();
        label(c, VOWEL_LETTER[snd], x0 + i * 62, 44, { size: 22, color: "#2b2d42", shadow: false, weight: 800 });
      }
      if (ctx.mode === "sensors" && ctx.mic) {
        const lv = ctx.mic.level01;
        c.fillStyle = "rgba(255,255,255,0.5)"; rr(c, 1170, 220, 34, 300, 17); c.fill();
        c.fillStyle = voicing ? "#06d6a0" : "#f4a261"; rr(c, 1170, 220 + 300 * (1 - lv), 34, 300 * lv, 17); c.fill();
      }
      const askFor = ctx.t("sayTarget", { s: ctx.t("snd_" + g.sound) });
      if (g.ready > 0 && g.celebrate <= 0) label(c, ctx.t("getReady"), W / 2, 640, { size: 38 });
      else if (g.celebrate > 0) { /* the round's praise is on screen */ }
      else if (g.warn > 0) label(c, ctx.t("softer"), W / 2, 640, { size: 38, color: "#fff" });
      // another sound is going on: say what was heard and what is wanted
      else if (g.wrongT > 0.5 && g.heardAs) label(c, ctx.t("heardInstead", { heard: ctx.t("snd_" + g.heardAs), s: ctx.t("snd_" + g.sound) }), W / 2, 640, { size: 36, color: "#fff" });
      else if (g.wrongT > 0.5 || g.progress === 0) label(c, askFor, W / 2, 640, { size: 38 });
    };

    g.hud = () => ({ progress: `${ctx.t("rounds")} ${Math.min(g.round + 1, L.rounds)}/${L.rounds}` });

    g.result = () => {
      const longest = Math.max(0, ...g.holds, g.roundLongest);
      const avg = g.holds.length ? g.holds.reduce((a, b) => a + b, 0) / g.holds.length : 0;
      const steadyPct = L.steadyTol && g.voicedFrames ? Math.round((g.steadyFrames / g.voicedFrames) * 100) : null;
      const score = scoreBreeze({ roundsDone: g.roundsDone, rounds: L.rounds, steadyPct });
      return {
        completed: g.round >= L.rounds,
        score,
        settings: { sounds: L.sounds },
        metrics: {
          rounds_completed: g.roundsDone,
          rounds_total: L.rounds,
          target_hold_sec: L.target,
          target_hold_sec_per_round: g.targets,
          sounds_per_round: g.soundsUsed,
          longest_hold_sec: Math.round(longest * 10) / 10,
          average_longest_hold_sec: Math.round(avg * 10) / 10,
          voice_breaks: g.breaks,
          steady_voice_pct: steadyPct,
          average_loudness_above_room_db: ctx.mode === "sensors" && g.voicedFrames ? Math.round(g.riseSum / g.voicedFrames) : null,
          target_sound_pct: ctx.mode === "sensors" && g.speechFrames ? Math.round((g.targetFrames / g.speechFrames) * 100) : null,
          by_sound: g.bySound,
          personal_voice_check: ctx.mode === "sensors" ? !!(ctx.mic && ctx.mic.personal) : null,
        },
        // shown to the child: counts and whole seconds only
        summary: [
          { label: ctx.t("balloons"), value: `${g.roundsDone}/${L.rounds}` },
          { label: ctx.t("longestHold"), value: `${Math.floor(longest)} s` },
          { label: ctx.t("soundsDone"), value: ["aah", "ehh", "eee", "ooo", "uuu"].filter((v) => g.bySound[v] && g.bySound[v].done).map((v) => VOWEL_LETTER[v]).join(" ") || "–" },
        ],
      };
    };

    return g;
  },
};

export default def;
