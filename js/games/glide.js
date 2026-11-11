// SKY GLIDE: steer a bird with the five vowels. Each vowel has its own height, ordered like the mouth
// shapes from back to front: U "uuu" at the bottom, then O "ooo", A "aaa", E "ehh", and I "eee" at the
// top. Each ring shows a letter: say that sound and the bird flies to its height. Silence glides
// straight. Quiet voices and whispers count too. The voice check (shared with Balloon Breeze) learns
// the child's own five vowels first; it runs once per visit and every level reuses it.
// Two ways to play (chosen on the level card):
//   Keep flying: the bird never stops and the child steers through the rings.
//   Stop and say: the bird waits before each ring and asks for its sound.
// Sensor mode: microphone with vowel recognition. Touch mode: drag up and down, or use the arrow keys.
import { W, H, sky, hills, label, clamp, lerp, glow, star, vignette, rr } from "../kit/draw.js";
import { sun, cloudLayer, flock, motes, butterflies, twinkles, windStreaks, SparkTrail } from "../kit/scene.js";
import { VOWEL_HEIGHT } from "../kit/vowel.js";
import { createVowelCheck, savedVowels, forgetVowels, VOWEL_LETTER } from "../kit/vowelcheck.js";
import { clampScore } from "../kit/results.js";

// All five vowels on every level. Later levels are faster, with smaller rings, a mixed order, and a
// closer sound match (lenience 1 accepts close neighbours, 0 needs a clear match).
export const LEVELS = [
  { name: "Five Clouds", goal: "Say A, E, I, O or U to fly to that letter. Each sound twice. 10 rings.", order: "pairs", count: 10, speed: 120, gap: 118, spacing: 560, lenience: 1, settings: { rings: 10, vowels: 5, order: "pairs" } },
  { name: "Sound Steps", goal: "A, E, I, O, U in order, then again. 10 rings.", order: "steps", count: 10, speed: 135, gap: 104, spacing: 520, lenience: 0.8, settings: { rings: 10, vowels: 5, order: "steps" } },
  { name: "Rolling Hills", goal: "Up and down the sounds like a wave. 12 rings.", order: "wave", count: 12, speed: 150, gap: 94, spacing: 460, lenience: 0.6, settings: { rings: 12, vowels: 5, order: "wave" } },
  { name: "Quick Swallow", goal: "Faster, smaller rings in a mixed order. 14 rings.", order: "mixed", count: 14, speed: 175, gap: 84, spacing: 460, lenience: 0.45, settings: { rings: 14, vowels: 5, order: "mixed" } },
  { name: "Glide Slides", goal: "The fastest flight. Clear sounds, mixed order. 16 rings.", order: "mixed2", count: 16, speed: 185, gap: 78, spacing: 400, lenience: 0.3, settings: { rings: 16, vowels: 5, order: "mixed2" } },
];

const TOP = 120, BOTTOM = 620; // flying band in screen pixels
const BIRD_X = 320;
const RATE = 0.7;              // band heights per second the bird can climb or dive
const WAIT_LIMIT = 15;         // Stop and say: seconds before moving on from one ring
export const LANES = ["uuu", "ooo", "aah", "ehh", "eee"];   // bottom to top
export { forgetVowels as resetCalibration };

// The vowel of every ring in a level. Deterministic, so sessions can be compared.
export function ringVowels(order, count) {
  const f = ["aah", "ehh", "eee", "ooo", "uuu"];
  const wave = ["uuu", "ooo", "aah", "ehh", "eee", "ehh", "aah", "ooo"];
  const mixed = ["aah", "uuu", "eee", "ooo", "ehh", "aah", "eee", "uuu", "ehh", "ooo"];
  const mixed2 = ["eee", "uuu", "ehh", "aah", "ooo", "eee", "aah", "uuu", "ooo", "ehh", "aah", "eee"];
  return Array.from({ length: count }, (_, i) => {
    if (order === "pairs") return f[Math.floor(i / 2) % 5];
    if (order === "steps") return f[i % 5];
    if (order === "wave") return wave[i % wave.length];
    if (order === "mixed") return mixed[i % mixed.length];
    return mixed2[i % mixed2.length];
  });
}

// The height the bird flies to for a heard vowel, or null for none.
export function heightFor(vowel) { return vowel && VOWEL_HEIGHT[vowel] != null ? VOWEL_HEIGHT[vowel] : null; }

export function scoreGlide({ hits, total }) {
  return clampScore((hits / total) * 100);
}

const VOWEL_COLOR = { aah: "#ff7aa2", eee: "#ffc94a", ehh: "#7bd389", ooo: "#7ab8ff", uuu: "#c49bff" };

const yOf = (h) => lerp(BOTTOM, TOP, h);

function drawScene(c, time, li) {
  sky(c, ["#ffb385", "#ff9a8b", "#f78fb3", "#c38cf0", "#8f8cf0"][li], "#ffe3c2");
  if (li >= 3) twinkles(c, time, { n: 26, bottom: 300, size: 5, seed: 7 + li });
  glow(c, 260, 520, 360, "rgba(255,230,160,0.65)");
  sun(c, 260, 500, 86, time, { color: "#ffb347", face: false });
  // far clouds move slowly, near ones quickly: the world really passes by
  cloudLayer(c, -time, { n: 3, y: 60, gap: 120, speed: 16, scale: 0.6, seed: 4 + li, top: "#fff5ec", under: "#ffd3c4", alpha: 0.75 });
  flock(c, time, { y: 150, speed: -30, seed: 2 + li, color: "rgba(70,40,90,0.45)" });
  hills(c, { y: 580, amp: 130, color: "#a696cf", seed: 18, offset: time * 12, bumps: 7, shadow: false });
  hills(c, { y: 640, amp: 80, color: "#8e7dbe", seed: 21, offset: time * 25 });
  hills(c, { y: 690, amp: 50, color: "#6a5d9c", seed: 25, offset: time * 45 });
  cloudLayer(c, -time, { n: 2, y: 200, gap: 170, speed: 46, scale: 1.1, seed: 11 + li, top: "#ffffff", under: "#ffe0d6", alpha: 0.88 });
  windStreaks(c, time, { n: 5, seed: 3 + li, alpha: 0.28, speed: 340 });
  butterflies(c, time, { n: 2, y: 600, band: 40, seed: 5 + li });
  motes(c, time, { n: 16, seed: 5, rise: 6, sway: 30 });
}

function drawBird(c, x, y, t, tilt, s = 1) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.rotate(tilt);
  const flap = Math.sin(t * 10);
  // tail feathers
  c.fillStyle = "#ff7a59";
  for (let i = -1; i <= 1; i++) { c.save(); c.translate(-40, 2); c.rotate(Math.PI + i * 0.32 + Math.sin(t * 6) * 0.05); c.beginPath(); c.ellipse(20, 0, 22, 6, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
  // far wing
  c.fillStyle = "#ffb199"; c.save(); c.translate(6, -8); c.rotate(-0.5 + flap * 0.55); c.beginPath(); c.ellipse(-4, -28, 15, 34, -0.3, 0, Math.PI * 2); c.fill(); c.restore();
  // body
  const body = c.createLinearGradient(0, -24, 0, 24);
  body.addColorStop(0, "#fff7ea"); body.addColorStop(1, "#ffd9b8");
  c.fillStyle = body; c.beginPath(); c.ellipse(4, 2, 46, 22, -0.06, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#ff7a59"; c.beginPath(); c.ellipse(33, -5, 21, 19, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#fff7ea"; c.beginPath(); c.ellipse(11, 9, 24, 11, 0, 0, Math.PI * 2); c.fill();
  // near wing
  c.fillStyle = "#ff9a76"; c.save(); c.translate(-2, -4); c.rotate(-0.25 + flap * 0.75); c.beginPath(); c.ellipse(-8, -30, 18, 38, -0.35, 0, Math.PI * 2); c.fill();
  c.fillStyle = "rgba(255,255,255,0.35)"; c.beginPath(); c.ellipse(-9, -28, 8, 24, -0.35, 0, Math.PI * 2); c.fill(); c.restore();
  // eye, cheek, beak
  c.fillStyle = "#fff"; c.beginPath(); c.arc(38, -9, 8, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#2b2d42"; c.beginPath(); c.arc(40, -9, 4.4, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#fff"; c.beginPath(); c.arc(38.5, -11, 1.6, 0, Math.PI * 2); c.fill();
  c.fillStyle = "rgba(255,255,255,0.45)"; c.beginPath(); c.arc(30, 2, 5, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#ffb703"; c.beginPath(); c.moveTo(52, -7); c.lineTo(70, -2); c.lineTo(52, 3); c.closePath(); c.fill();
  c.restore();
}

const def = {
  id: "glide",
  version: "6.0.0",
  title: "Sky Glide",
  color: "#f4845f",
  focus: "Fly the bird with your voice: A, E, I, O, U",
  input: "mic",
  mic: { vowels: true, onDb: 8, offDb: 5, softDb: 5 },
  inputLabel: "Microphone (each sound flies to its own height)",
  touchLabel: "Drag up and down on the screen, or use the arrow keys",
  skills: ["Five vowel sounds", "Listening and answering", "Quiet and loud voice"],
  howTo: [
    ["🎤", "First say each sound when asked: A, E, I, O, U. The game learns your voice."],
    ["🔤", "Every ring has a letter. Each letter has its own height in the sky."],
    ["🐦", "Say the letter's sound and the bird flies to it. Be quiet to fly straight."],
    ["⭐", "Fly through as many rings as you can."],
  ],
  levels: LEVELS,
  variants: [
    { id: "fly", icon: "🕊️", label: "Keep flying", note: "The bird flies on while you steer." },
    { id: "stop", icon: "✋", label: "Stop and say", note: "The bird waits and asks for each sound." },
  ],

  drawPreview(c, li, t = 0) { drawScene(c, t, li); drawBird(c, 420, 360 + Math.sin(t * 1.5) * 40, t, -0.15, 2.2); vignette(c, 0.2); },

  create(ctx) {
    const sparks = new SparkTrail({ reduced: ctx.reduced, life: 0.9, size: 9 });
    const L = ctx.level;
    const vowels = ringVowels(L.order, L.count);
    const stopMode = ctx.variant === "stop";
    const rings = vowels.map((v, i) => ({ v, h: VOWEL_HEIGHT[v], x: W + 200 + i * L.spacing, state: "open" }));
    const sensors = ctx.mode === "sensors" && ctx.mic;
    const saved = sensors ? savedVowels() : null;
    if (saved) ctx.mic.setAnchors(saved);
    const g = {
      done: false,
      phase: sensors && !saved ? "check" : "play",
      birdH: 0.5, vel: 0, targetH: null,
      hits: 0, passed: 0,
      errors: [],
      playT: 0, voiceT: 0, quietT: 0,
      rightT: 0, wrongT: 0,          // time the sound heard was the next ring's sound, or another one
      heard: null,                   // the vowel heard right now, or null
      byVowel: {},                   // per vowel: rings hit and total
      responses: [],                 // Stop and say: ms from the prompt to the right sound
      waiting: false, waitT: 0, inGapT: 0, promptAnswered: false,
      gap: L.gap,
      speed: L.speed,
      lenience: L.lenience,
    };
    if (sensors && saved) ctx.event("voice_check_reused", {});
    const check = g.phase === "check" ? createVowelCheck(ctx, { colors: VOWEL_COLOR, onDone: () => { g.phase = "play"; } }) : null;
    // Easier after 2 missed rings in a row: rings 18% taller, 12% slower, sound match looser, per step.
    // Harder after 5 hits in a row: rings 10% smaller, 10% faster, per step.
    g.adaptive = ctx.makeAdaptive({ upAfter: 5, downAfter: 2 });
    const retune = () => {
      g.gap = g.adaptive.scale(L.gap, 0.18, 0.1);
      g.speed = g.adaptive.scale(L.speed, -0.12, -0.1);
      g.lenience = clamp(L.lenience + (g.adaptive.step > 0 ? 0.15 * g.adaptive.step : 0), 0, 1);
    };
    const nextRing = () => rings.find((r) => r.state === "open");

    g.onPointer = (type, x, y) => { if (ctx.mode === "touch" && (type === "down" || ctx.pointer.down)) { g.targetH = clamp((BOTTOM - y) / (BOTTOM - TOP), 0, 1); if (g.waiting) g.touched = true; } };
    g.start = () => { if (check) check.begin(); };

    const hearing = () => ctx.mic && (ctx.mic.speech || ctx.mic.voiced) && !ctx.mic.hiss && !ctx.mic.selfSound;

    // The vowel being said, when it is clear enough for this level.
    const heardVowel = () => {
      const mic = ctx.mic;
      if (!hearing() || !mic.vowel) return null;
      return mic.isVowel(mic.vowel, g.lenience) ? mic.vowel : null;
    };

    const moveBird = (dt) => {
      if (sensors) {
        g.heard = heardVowel();
        const to = heightFor(g.heard);
        // fly towards the height of the sound; with no sound the bird keeps its height
        const want = to == null ? 0 : clamp((to - g.birdH) * 5, -RATE, RATE);
        g.vel = lerp(g.vel, want, Math.min(1, dt * 9));
        g.birdH = clamp(g.birdH + g.vel * dt, 0, 1);
      } else {
        if (g.waiting && (ctx.keys.has("ArrowUp") || ctx.keys.has("ArrowDown"))) g.touched = true;
        if (ctx.keys.has("ArrowUp")) g.targetH = clamp((g.targetH ?? g.birdH) + dt * 0.9, 0, 1);
        if (ctx.keys.has("ArrowDown")) g.targetH = clamp((g.targetH ?? g.birdH) - dt * 0.9, 0, 1);
        const before = g.birdH;
        g.birdH = lerp(g.birdH, g.targetH ?? g.birdH, Math.min(1, dt * 6));
        g.vel = (g.birdH - before) / Math.max(dt, 1e-3);
      }
    };

    const passRing = (r) => {
      const err = Math.abs(yOf(g.birdH) - yOf(r.h));
      g.passed++;
      g.errors.push(err / (BOTTOM - TOP));
      const hit = err < g.gap;
      const bv = (g.byVowel[r.v] ||= { hit: 0, total: 0 });
      bv.total++;
      if (hit) {
        bv.hit++;
        r.state = "hit"; g.hits++; ctx.sfx.chime(g.hits); ctx.fx.burst(BIRD_X, yOf(r.h), { n: 12, speed: 180 });
        if (g.hits % 4 === 0) ctx.praise(W / 2, 200);
        ctx.event("ring_hit", { ring: g.passed, vowel: r.v, gap: Math.round(g.gap) });
        g.adaptive.success(ctx.time); retune();
      } else {
        r.state = "miss"; ctx.event("ring_miss", { ring: g.passed, vowel: r.v, bird: Math.round(g.birdH * 100) / 100, gap: Math.round(g.gap) });
        g.adaptive.miss(ctx.time); retune();
      }
    };

    g.update = (dt) => {
      if (g.phase === "check") { check.update(dt); return; }
      const mic = ctx.mic;
      g.playT += dt;
      moveBird(dt);
      const nx = nextRing();
      if (sensors && hearing()) {
        g.voiceT += dt;
        if (!mic.voiced) g.quietT += dt;
        if (g.heard && nx) { if (g.heard === nx.v) g.rightT += dt; else g.wrongT += dt; }
      } else if (!sensors) g.voiceT += dt;

      // Stop and say: the world waits in front of each ring until the bird is at the right height.
      const stopX = BIRD_X + 280;
      if (stopMode && nx && nx.x <= stopX) {
        if (!nx.prompted) {
          nx.prompted = true; g.waiting = true; g.waitT = 0; g.inGapT = 0; g.promptAnswered = false; g.touched = false;
          ctx.event("prompt", { ring: g.passed + 1, vowel: nx.v });
          ctx.say("checkSay", { s: ctx.t("snd_" + nx.v) });
        }
        if (g.waiting) {
          g.waitT += dt;
          if (!g.promptAnswered && g.heard === nx.v) { g.promptAnswered = true; g.responses.push(Math.round(g.waitT * 1000)); }
          const inGap = Math.abs(yOf(g.birdH) - yOf(nx.h)) < g.gap * 0.6;
          // the child must answer each ring, even if the bird is already at its height: with the microphone
          // by saying the ring's sound, by touch with a drag or an arrow key
          g.inGapT = inGap && (sensors ? g.promptAnswered : g.touched) ? g.inGapT + dt : 0;
          if (g.inGapT > 0.35 || g.waitT > WAIT_LIMIT) {
            if (g.waitT > WAIT_LIMIT) ctx.event("prompt_timeout", { ring: g.passed + 1 });
            g.waiting = false;
          }
        }
      }
      if (!g.waiting) {
        for (const r of rings) {
          r.x -= g.speed * dt;
          if (r.state === "open" && r.x <= BIRD_X) passRing(r);
        }
      }
      if (rings[rings.length - 1].x < 120) g.done = true;
    };

    g.draw = (c) => {
      const tm = ctx.anim;
      drawScene(c, tm, ctx.levelIndex);
      // the five lanes, each with its letter on the left
      c.save(); c.setLineDash([6, 14]); c.lineWidth = 2; c.strokeStyle = "rgba(255,255,255,0.28)";
      for (const v of LANES) { const y = yOf(VOWEL_HEIGHT[v]); c.beginPath(); c.moveTo(70, y); c.lineTo(W, y); c.stroke(); }
      c.restore();
      for (const v of LANES) {
        const y = yOf(VOWEL_HEIGHT[v]), on = g.heard === v;
        c.save(); c.fillStyle = on ? VOWEL_COLOR[v] : "rgba(255,255,255,0.75)"; c.beginPath(); c.arc(38, y, on ? 27 : 22, 0, Math.PI * 2); c.fill(); c.restore();
        label(c, VOWEL_LETTER[v], 38, y + 1, { size: on ? 32 : 26, color: "#2b2d42", shadow: false, weight: 800 });
      }
      for (const r of rings) {
        if (r.x < -100 || r.x > W + 120) continue;
        const y = yOf(r.h);
        c.save();
        if (r.state === "open") glow(c, r.x, y, g.gap * 1.45 + Math.sin(ctx.anim * 5) * 6, "rgba(255,226,120,0.42)");
        c.lineWidth = 14;
        c.strokeStyle = r.state === "hit" ? "#06d6a0" : r.state === "miss" ? "rgba(255,255,255,0.35)" : VOWEL_COLOR[r.v];
        c.beginPath(); c.ellipse(r.x, y, 30, g.gap, 0, 0, Math.PI * 2); c.stroke();
        if (r.state === "open") {
          // lights run round the ring
          c.strokeStyle = "#fff"; c.lineWidth = 5; c.setLineDash([3, 22]); c.lineDashOffset = -ctx.anim * 60; c.lineCap = "round";
          c.beginPath(); c.ellipse(r.x, y, 30, g.gap, 0, 0, Math.PI * 2); c.stroke();
        }
        c.restore();
        if (r.state === "open") {
          c.save(); c.fillStyle = "rgba(255,255,255,0.92)"; c.beginPath(); c.arc(r.x, y, 24, 0, Math.PI * 2); c.fill(); c.restore();
          label(c, VOWEL_LETTER[r.v], r.x, y + 1, { size: 30, color: "#2b2d42", shadow: false, weight: 800 });
        } else if (r.state === "hit") star(c, r.x, y, 14, "#fff", ctx.time * 2);
      }
      const tilt = clamp(-g.vel * 0.9, -0.5, 0.5);
      if (g.heard && sensors) glow(c, BIRD_X, yOf(g.birdH), 70, "rgba(255,214,102,0.55)");
      const dtDraw = Math.max(0, ctx.time - (g.lastDraw || 0)); g.lastDraw = ctx.time;
      sparks.update(dtDraw);
      for (const p of sparks.list) p.x -= dtDraw * 170;   // the world passes, so the sparks fall behind
      sparks.add(BIRD_X - 40, yOf(g.birdH), dtDraw, g.heard ? 40 : 10);
      sparks.draw(c);
      drawBird(c, BIRD_X, yOf(g.birdH), ctx.time, tilt);
      vignette(c, 0.16);
      if (g.phase === "check") { check.draw(c); return; }
      // what to say for the next ring
      const nx = nextRing();
      if (nx) {
        const big = stopMode && g.waiting;
        const w = big ? 520 : 360, h = big ? 110 : 70, x = W - w - 28, y = 26;
        c.save(); c.shadowColor = "rgba(0,0,0,0.2)"; c.shadowBlur = 14; c.fillStyle = "rgba(255,255,255,0.93)"; rr(c, x, y, w, h, h / 2); c.fill(); c.restore();
        label(c, ctx.t("cueSay", { l: VOWEL_LETTER[nx.v], s: ctx.t("snd_" + nx.v) }), x + w / 2, y + h / 2, { size: big ? 46 : 30, color: "#2b2d42", shadow: false, weight: 800 });
      }
      if (sensors) {
        // the level meter and what the game hears, so quiet voices can be seen to count
        const lv = ctx.mic.level01;
        c.fillStyle = "rgba(255,255,255,0.45)"; rr(c, 84, 220, 22, 260, 11); c.fill();
        c.fillStyle = g.heard ? "#06d6a0" : "#ffd166"; rr(c, 84, 220 + 260 * (1 - lv), 22, 260 * lv, 11); c.fill();
        if (g.heard) label(c, ctx.t("iHear", { s: `${VOWEL_LETTER[g.heard]} ${ctx.t("snd_" + g.heard)}` }), 230, 186, { size: 24, weight: 600 });
      }
    };

    g.hud = () => ({ progress: `${ctx.t("rings")} ${g.hits}/${L.count}` });

    g.result = () => {
      const meanErr = g.errors.length ? g.errors.reduce((a, b) => a + b, 0) / g.errors.length : null;
      const sens = ctx.mode === "sensors";
      const acc = Math.round((g.hits / L.count) * 100);
      const judged = g.rightT + g.wrongT;
      const rightPct = sens && judged > 0 ? Math.round((g.rightT / judged) * 100) : null;
      const avgResp = g.responses.length ? Math.round(g.responses.reduce((a, b) => a + b, 0) / g.responses.length) : null;
      return {
        completed: g.passed >= L.count,
        score: scoreGlide({ hits: g.hits, total: L.count }),
        settings: { variant: ctx.variant },
        metrics: {
          variant: ctx.variant,
          rings_hit: g.hits,
          rings_total: L.count,
          accuracy_pct: acc,
          by_vowel: g.byVowel,
          right_sound_pct: rightPct,
          personal_voice_check: sens ? !!(ctx.mic && ctx.mic.personal) : null,
          voice_check_reused: !!saved,
          avg_response_ms: avgResp,
          voiced_time_pct: g.playT ? Math.round((g.voiceT / g.playT) * 100) : 0,
          quiet_voice_pct: sens && g.voiceT ? Math.round((g.quietT / g.voiceT) * 100) : null,
          mean_height_error: meanErr != null ? Math.round(meanErr * 100) / 100 : null,
          final_ring_size_px: Math.round(g.gap),
          final_speed_px_s: Math.round(g.speed),
        },
        // shown to the child: counts and whole seconds only
        summary: [
          { label: ctx.t("rings"), value: `${g.hits}/${L.count}` },
          { label: ctx.t("soundsDone"), value: ["aah", "ehh", "eee", "ooo", "uuu"].filter((v) => g.byVowel[v] && g.byVowel[v].hit).map((v) => VOWEL_LETTER[v]).join(" ") || "–" },
          ...(avgResp != null ? [{ label: ctx.t("responseTime"), value: `${Math.max(1, Math.round(avgResp / 1000))} s` }] : []),
        ],
      };
    };

    return g;
  },
};

export default def;
