// FIREFLY NIGHT: reaching, hand-eye coordination, attention and sequencing.
// The child catches glowing fireflies with their fingertips. Later levels add hand colours
// (left hand blue, right hand orange), crossing the middle of the body, moths to avoid,
// and numbered fireflies to catch in order.
// Sensor mode: camera hand tracking (on the device). Touch mode: touch or mouse.
import { W, H, sky, glow, label, rng, clamp, rr, vignette } from "../kit/draw.js";
import { aurora, twinkles, shootingStar, motes, grass, starCursor } from "../kit/scene.js";
import { clampScore } from "../kit/results.js";

export const LEVELS = [
  { name: "First Glow", goal: "Touch each firefly with your finger. 10 fireflies, one at a time.", total: 10, at: 1, r: 62, speed: 0, rule: "any", moths: 0, time: 90, settings: { targets: 10, size: "large" } },
  { name: "Meadow Dance", goal: "Fireflies float around. Catch 15 of them.", total: 15, at: 2, r: 50, speed: 60, rule: "any", moths: 0, time: 90, settings: { targets: 15, moving: true } },
  { name: "Two-Hand Colours", goal: "Blue fireflies with your left hand, orange with your right. 16 fireflies.", total: 16, at: 2, r: 50, speed: 45, rule: "hands", moths: 0, time: 100, settings: { targets: 16, hand_rule: "colour" } },
  { name: "Cross the Path", goal: "Reach across your body to catch them, and stay away from the moths. 18 fireflies.", total: 18, at: 2, r: 46, speed: 65, rule: "cross", moths: 1, time: 110, settings: { targets: 18, cross_midline: true, moths: true } },
  { name: "Number Trail", goal: "Catch the fireflies in order: 1, 2, 3, 4. 20 fireflies.", total: 20, at: 4, r: 46, speed: 35, rule: "order", moths: 0, time: 120, settings: { targets: 20, sequence: 4 } },
];

export function scoreFirefly({ caught, total, wrong }) {
  return clampScore((caught / total) * 100 - wrong * 3);
}

// Where a new firefly may appear. For "cross" a left-hand firefly appears on the right side and the
// other way round, so the child must reach across the middle of the body.
export function spawnZone(rule, color) {
  if (rule === "cross") return color === "left" ? { x0: 700, x1: 1140 } : { x0: 140, x1: 580 };
  if (rule === "hands") return color === "left" ? { x0: 140, x1: 640 } : { x0: 640, x1: 1140 };
  return { x0: 140, x1: 1140 };
}

const HAND_COLORS = { left: "#4aa3ff", right: "#ff9f43", any: "#d9ff6b" };

function drawNight(c, t, li) {
  sky(c, ["#1b1f4b", "#191a46", "#16173f", "#131438", "#101131"][li], "#3d2c5e");
  aurora(c, t);
  twinkles(c, t, { n: 70, seed: 5, bottom: 400, size: 5.5 });
  shootingStar(c, t, { every: 7, seed: 4 + li });
  // a moon that glows, drawn as a true crescent on any sky
  glow(c, 1080, 120, 150 + Math.sin(t * 0.9) * 10, "rgba(255,244,200,0.42)");
  c.fillStyle = "#fff4cf"; c.beginPath(); c.arc(1080, 120, 48, Math.PI * 0.32, Math.PI * 1.68, false); c.quadraticCurveTo(1062, 120, 1080 + 48 * Math.cos(Math.PI * 0.32), 120 + 48 * Math.sin(Math.PI * 0.32)); c.fill();
  // far hills and trees
  c.fillStyle = "#23304f";
  c.beginPath(); c.moveTo(0, H); for (let x = 0; x <= W; x += 24) c.lineTo(x, 540 + Math.sin(x * 0.006 + 2) * 42 + Math.sin(x * 0.017) * 12); c.lineTo(W, H); c.fill();
  c.fillStyle = "#1a2a40";
  for (let i = 0; i < 9; i++) {
    const x = 50 + i * 148 + (i % 2) * 30, h = 90 + (i % 3) * 34, w = Math.sin(t * 0.8 + i) * 3;
    c.beginPath(); c.moveTo(x - 32, 590); c.lineTo(x + w, 590 - h); c.lineTo(x + 32, 590); c.closePath(); c.fill();
  }
  // tiny fireflies far away
  motes(c, t, { n: 22, seed: 19 + li, color: "#d9ff6b", size: 2.6, rise: 4, top: 380, bottom: 620, sway: 30 });
  // meadow silhouettes
  c.fillStyle = "#1f3b3a";
  c.beginPath(); c.moveTo(0, H); for (let x = 0; x <= W; x += 20) c.lineTo(x, 610 + Math.sin(x * 0.01 + 1) * 20); c.lineTo(W, H); c.fill();
  grass(c, t, { y: 720, n: 90, color: "#16302f", height: 110 });
  // midline hint
  if (li >= 2) { c.save(); c.setLineDash([4, 16]); c.strokeStyle = "rgba(255,255,255,0.12)"; c.lineWidth = 3; c.beginPath(); c.moveTo(W / 2, 80); c.lineTo(W / 2, 600); c.stroke(); c.restore(); }
}

function drawFirefly(c, f, t) {
  const col = HAND_COLORS[f.color];
  const pulse = 0.75 + 0.25 * Math.sin(t * 6 + f.seed);
  glow(c, f.x, f.y, f.r * 2.3 * pulse, hexA(col, 0.55));
  glow(c, f.x, f.y, f.r * 1.05, "rgba(255,255,255,0.55)");
  c.fillStyle = col; c.beginPath(); c.arc(f.x, f.y, f.r * 0.42, 0, Math.PI * 2); c.fill();
  // wings
  c.fillStyle = "rgba(255,255,255,0.6)";
  const flap = Math.sin(t * 20 + f.seed) * 0.4;
  c.beginPath(); c.ellipse(f.x - 12, f.y - f.r * 0.45, 12, 6, -0.6 + flap, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(f.x + 12, f.y - f.r * 0.45, 12, 6, 0.6 - flap, 0, Math.PI * 2); c.fill();
  if (f.num) label(c, String(f.num), f.x, f.y + 2, { size: 30, color: "#1b1f4b", shadow: false, weight: 800 });
}

function drawMoth(c, m, t) {
  c.save(); c.translate(m.x, m.y);
  const flap = Math.sin(t * 14) * 0.5;
  c.fillStyle = "#8d7b68";
  c.beginPath(); c.ellipse(-22, 0, 26, 18, -0.4 + flap, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(22, 0, 26, 18, 0.4 - flap, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#5e503f"; c.beginPath(); c.ellipse(0, 0, 8, 20, 0, 0, Math.PI * 2); c.fill();
  c.restore();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const def = {
  id: "firefly",
  version: "6.0.0",
  title: "Firefly Night",
  color: "#b5e48c",
  focus: "Catch the glowing fireflies with your hands",
  input: "hands",
  inputLabel: "Camera (hands, stays on this device)",
  touchLabel: "Touch or click the fireflies",
  skills: ["Reaching", "Hands and eyes together", "Both sides", "Counting in order"],
  howTo: [
    ["✋", "Hold up your hands so the camera can see them."],
    ["✨", "Move your finger onto a firefly to catch it."],
    ["🎨", "On some levels, blue fireflies need your left hand and orange ones your right."],
    ["🦋", "Watch out for the moths, and catch the numbers in order when asked."],
  ],
  levels: LEVELS,

  drawPreview(c, li, t = 0) {
    drawNight(c, 1.2 + t, li);
    [[400, 300], [700, 220], [900, 420]].forEach(([x, y], i) => drawFirefly(c, { x: x + Math.sin(t * 0.7 + i * 2) * 50, y: y + Math.cos(t * 0.9 + i) * 34, r: 50, color: li === 2 ? (i % 2 ? "right" : "left") : "any", seed: i, num: li === 4 ? i + 1 : null }, t));
    vignette(c, 0.3);
  },

  create(ctx) {
    const L = ctx.level;
    const rand = rng(1000 + ctx.levelIndex * 17);
    const g = { done: false, flies: [], moths: [], spawned: 0, caught: 0, wrong: 0, mothHits: 0, reactions: [], byHand: { left: 0, right: 0, any: 0 }, cross: 0, nextNum: 1, waveBase: 0, cursors: [], hint: 0, hintText: "", refill: 0 };
    const touch = ctx.mode === "touch";
    // Easier after 2 problems in a row (a firefly left uncaught for 8 s, a wrong hand, a moth, wrong number):
    //   fireflies 15% bigger and 20% slower per step.
    // Harder after 4 quick catches in a row (under 3 s): 10% smaller and 15% faster per step.
    g.adaptive = ctx.makeAdaptive({ upAfter: 4, downAfter: 2 });
    g.r = L.r; g.speedMul = 1;
    const retune = () => {
      const oldMul = g.speedMul;
      g.r = g.adaptive.scale(L.r, 0.15, 0.1);
      g.speedMul = g.adaptive.scale(1, -0.2, -0.15);
      for (const f of g.flies) { f.r = g.r; f.vx *= g.speedMul / oldMul; f.vy *= g.speedMul / oldMul; }
    };
    const QUICK = 3, SLOW = 8, REFILL_SEC = 0.7;
    const ruleActive = !touch && (L.rule === "hands" || L.rule === "cross");

    const spawn = () => {
      if (g.spawned >= L.total) return;
      let color = "any";
      if (L.rule === "hands" || L.rule === "cross") color = g.spawned % 2 ? "right" : "left";
      const z = spawnZone(L.rule, color);
      const f = { x: z.x0 + rand() * (z.x1 - z.x0), y: 130 + rand() * 420, r: g.r, color, seed: rand() * 10, born: ctx.time,
        vx: (rand() - 0.5) * 2 * L.speed * g.speedMul, vy: (rand() - 0.5) * 2 * L.speed * g.speedMul, num: null };
      g.flies.push(f);
      g.spawned++;
    };
    const spawnWave = () => {
      g.waveBase = g.spawned;
      const n = Math.min(L.at, L.total - g.spawned);
      for (let k = 0; k < n; k++) { spawn(); g.flies[g.flies.length - 1].num = k + 1; }
      g.nextNum = 1;
    };
    g.start = () => {
      if (L.rule === "order") spawnWave(); else for (let k = 0; k < L.at; k++) spawn();
      for (let k = 0; k < L.moths; k++) g.moths.push({ x: 300 + rand() * 680, y: 160 + rand() * 360, vx: 80, vy: 50 });
    };

    const hint = (txt) => { g.hint = 1.4; g.hintText = txt; };

    g.update = (dt) => {
      // cursors
      if (touch) g.cursors = ctx.pointer.active ? [{ x: ctx.pointer.x, y: ctx.pointer.y, hand: "any", pressed: ctx.pointer.down || ctx.pointer.justDown }] : [];
      else g.cursors = (ctx.tracker ? ctx.tracker.hands : []).map((h) => ({ x: h.x * W, y: h.y * H, hand: h.hand, pressed: true }));
      // movement
      for (const f of [...g.flies, ...g.moths]) {
        f.x += f.vx * dt; f.y += f.vy * dt + Math.sin(ctx.time * 2 + (f.seed || 0)) * 10 * dt;
        if (f.x < 120 || f.x > 1160) f.vx *= -1;
        if (f.y < 120 || f.y > 570) f.vy *= -1;
        f.x = clamp(f.x, 120, 1160); f.y = clamp(f.y, 120, 570);
      }
      // catching
      for (const cur of g.cursors) {
        if (touch && !cur.pressed) continue;
        for (const m of g.moths) {
          if (Math.hypot(m.x - cur.x, m.y - cur.y) < 50 && !m.cool) {
            g.mothHits++; g.wrong++; g.adaptive.miss(ctx.time); retune(); m.cool = 1.2; m.vx = (m.x - cur.x) * 3; m.vy = (m.y - cur.y) * 3;
            ctx.sfx.soft(); hint(ctx.t("mothOops")); ctx.event("moth_touched", {});
          }
        }
        for (const f of g.flies) {
          if (f.gone) continue;
          if (Math.hypot(f.x - cur.x, f.y - cur.y) > f.r + 26) continue;
          if (ruleActive && f.color !== cur.hand) {
            if (!f.warned) { f.warned = true; g.wrong++; g.adaptive.miss(ctx.time); retune(); ctx.sfx.soft(); hint(ctx.t(f.color === "left" ? "useLeft" : "useRight")); ctx.event("wrong_hand", { needed: f.color, used: cur.hand }); }
            continue;
          }
          if (L.rule === "order" && f.num !== g.nextNum) {
            if (!f.warned) { f.warned = true; g.wrong++; g.adaptive.miss(ctx.time); retune(); ctx.sfx.soft(); hint(ctx.t("findNumber", { n: g.nextNum })); ctx.event("wrong_order", { touched: f.num, needed: g.nextNum }); }
            continue;
          }
          f.gone = true;
          g.caught++;
          if (ctx.time - f.born < QUICK) { g.adaptive.success(ctx.time); retune(); }
          const rt = Math.round((ctx.time - f.born) * 1000);
          g.reactions.push(rt);
          g.byHand[cur.hand] = (g.byHand[cur.hand] || 0) + 1;
          const crossed = cur.hand === "left" ? f.x > W / 2 : cur.hand === "right" ? f.x < W / 2 : false;
          if (crossed) g.cross++;
          ctx.sfx.chime(g.caught);
          if (g.caught % 5 === 0) ctx.praise(W / 2, 600);
          ctx.fx.burst(f.x, f.y, { n: 14, speed: 200, colors: [HAND_COLORS[f.color], "#fff", "#ffd166"], gravity: 120 });
          ctx.event("caught", { n: g.caught, hand: cur.hand, reaction_ms: rt, crossed_midline: crossed, number: f.num });
          if (L.rule === "order") {
            g.nextNum++;
            const nxt = g.flies.find((x) => !x.gone && x.num === g.nextNum);
            if (nxt) nxt.born = ctx.time; // reach time is measured from when it becomes the next target
          }
        }
      }
      for (const f of g.flies) if (!f.gone && !f.slow && ctx.time - f.born > SLOW && (L.rule !== "order" || f.num === g.nextNum)) {
        f.slow = true; g.adaptive.miss(ctx.time); retune(); ctx.event("slow_target", { after_sec: SLOW });
      }
      for (const m of g.moths) if (m.cool) m.cool = Math.max(0, m.cool - dt);
      for (const f of g.flies) if (f.warned && !g.cursors.some((cur) => Math.hypot(f.x - cur.x, f.y - cur.y) < f.r + 40)) f.warned = false;
      g.flies = g.flies.filter((f) => !f.gone);
      // refill after a short breath, so the child sees the catch before the next one appears
      const short = g.spawned < L.total && (L.rule === "order" ? !g.flies.length : g.flies.length < L.at);
      g.refill = short ? g.refill + dt : 0;
      if (short && g.refill > REFILL_SEC) { g.refill = 0; L.rule === "order" ? spawnWave() : spawn(); }
      g.hint = Math.max(0, g.hint - dt);
      if ((g.caught >= L.total) || (g.spawned >= L.total && !g.flies.length) || ctx.time > L.time) g.done = true;
    };

    g.draw = (c) => {
      const tm = ctx.anim;
      drawNight(c, tm, ctx.levelIndex);
      for (const m of g.moths) drawMoth(c, m, ctx.time);
      for (const f of g.flies) drawFirefly(c, f, ctx.reduced ? 0 : ctx.time);
      for (const cur of g.cursors) {
        const col = HAND_COLORS[cur.hand] || HAND_COLORS.any;
        starCursor(c, cur.x, cur.y, ctx.anim, col, 22);
      }
      // jar showing progress
      c.save(); c.fillStyle = "rgba(255,255,255,0.15)"; rr(c, 40, 470, 90, 140, 24); c.fill();
      c.strokeStyle = "rgba(255,255,255,0.5)"; c.lineWidth = 4; rr(c, 40, 470, 90, 140, 24); c.stroke();
      const fill = g.caught / L.total;
      c.fillStyle = "rgba(217,255,107,0.55)"; rr(c, 44, 470 + 136 * (1 - fill), 82, 136 * fill, 20); c.fill(); c.restore();
      label(c, `${g.caught}`, 85, 440, { size: 34 });
      vignette(c, 0.3);
      if (L.rule === "order" && g.flies.length) label(c, ctx.t("nextNum", { n: g.nextNum }), W / 2, 60, { size: 34 });
      if (g.hint > 0) label(c, g.hintText, W / 2, 660, { size: 34, color: "#ffd6a5" });
      if (!touch && ctx.tracker && !ctx.tracker.hands.length) label(c, ctx.t("showHandsCam"), W / 2, 110, { size: 30, color: "#cdd6ff" });
      const left = Math.max(0, L.time - ctx.time);
      if (left < 15) label(c, `${Math.ceil(left)}`, 1200, 60, { size: 40, color: "#ffd166" });
    };

    g.hud = () => ({ progress: `${ctx.t("caught")} ${g.caught}/${L.total}` });

    g.result = () => {
      const avg = g.reactions.length ? Math.round(g.reactions.reduce((a, b) => a + b, 0) / g.reactions.length) : null;
      return {
        completed: g.caught >= L.total,
        score: scoreFirefly({ caught: g.caught, total: L.total, wrong: g.wrong }),
        metrics: {
          caught: g.caught,
          total: L.total,
          wrong_touches: g.wrong,
          moth_touches: g.mothHits,
          avg_reaction_ms: avg,
          final_firefly_size_px: Math.round(g.r),
          left_hand_catches: touch ? null : g.byHand.left || 0,
          right_hand_catches: touch ? null : g.byHand.right || 0,
          cross_midline_catches: touch ? null : g.cross,
          hand_rule_applied: ruleActive,
        },
        summary: [
          { label: ctx.t("caught"), value: `${g.caught}/${L.total}` },
          { label: ctx.t("avgReach"), value: avg != null ? `${Math.max(1, Math.round(avg / 1000))} s` : "–" },
          { label: ctx.t("wrongTouches"), value: String(g.wrong) },
          ...(!touch ? [{ label: ctx.t("leftRight"), value: `${g.byHand.left || 0} / ${g.byHand.right || 0}` }] : []),
        ],
      };
    };

    return g;
  },
};

export default def;
