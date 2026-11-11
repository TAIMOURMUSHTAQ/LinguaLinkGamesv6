// BALANCE TRAY: hold a tray level with two hands. The child holds a tray with two
// hands. Fruit lands on it; a tilted tray makes the fruit slide, and heavy fruit on one side pulls the
// tray down on that side, so the child must lift that hand to keep it level. Higher levels bring
// heavier and more uneven loads, a narrower "level" zone, and a height the tray must follow.
// Sensor mode: camera hand tracking (on the device). Touch mode: drag up and down on the left or right
// half of the screen to lift that side, or use the arrow keys.
import { W, H, sky, hills, label, clamp, lerp, rr, vignette, emoji, lumi } from "../kit/draw.js";
import { sun, cloudLayer, windmill, swayTree, butterflies, flock, flowerRow, starCursor, motes } from "../kit/scene.js";
import { clampScore } from "../kit/results.js";

// load: fruit per round. pull: how strongly off-centre fruit tilts the tray. tol: tilt in degrees that
// still counts as level. lift: the tray must also follow a moving height line.
export const LEVELS = [
  { name: "Level Tray", goal: "Hold the tray with both hands and keep it level. One apple at a time.", rounds: 3, roundSec: 10, load: 1, pull: 0, tol: 14, lift: false, heavy: 0, settings: { rounds: 3, tolerance_deg: 14 } },
  { name: "Two Sides", goal: "Fruit lands on the left and the right. Keep them from sliding off.", rounds: 3, roundSec: 13, load: 2, pull: 0.35, tol: 12, lift: false, heavy: 0, settings: { rounds: 3, tolerance_deg: 12, side_pull: true } },
  { name: "Heavy Side", goal: "A heavy melon pulls the tray down. Lift that hand to balance it.", rounds: 4, roundSec: 14, load: 2, pull: 0.65, tol: 10, lift: false, heavy: 1, settings: { rounds: 4, tolerance_deg: 10, heavy_load: true } },
  { name: "Up and Down", goal: "Carry the load and move the tray up and down along the line.", rounds: 4, roundSec: 16, load: 3, pull: 0.65, tol: 9, lift: true, heavy: 1, settings: { rounds: 4, tolerance_deg: 9, height_tracking: true } },
  { name: "Tower of Treats", goal: "A big uneven load, and only a small level zone. Stay smooth and steady.", rounds: 5, roundSec: 18, load: 4, pull: 0.85, tol: 7, lift: true, heavy: 2, settings: { rounds: 5, tolerance_deg: 7, height_tracking: true, heavy_load: true } },
];

const TRAY_HALF = 300;      // half the tray's width, in pixels
const FRUIT = [["🍎", 1], ["🍐", 1], ["🍊", 1], ["🍋", 1]];
const HEAVY = ["🍉", 3];
const MAX_TILT = 38;
const INK = "#5a3d1e";     // text on the pale sky
const READY_SEC = 1.2;     // "hold the tray level" before a round
const PAUSE_SEC = 1.6;     // the round's result before the next one
const REFILL_SEC = 0.6;    // a fruit that fell off is replaced this quickly
const LOST_HAND_SEC = 1.2; // one hand missing: its last place is used for this long
const MAX_GAP_SEC = 2.5;   // most time between two fruits

// Tilt from the two hands, in degrees. Positive means the right side is lower.
export function tiltFromHands(left, right) {
  return (Math.atan2(right.y - left.y, Math.max(1e-3, right.x - left.x)) * 180) / Math.PI;
}

// How far the load pulls the tray over, in degrees: heavier and further from the middle pulls more.
export function loadPull(items, pull) {
  let m = 0;
  for (const it of items) m += it.weight * it.pos;
  return clamp(m * pull * 22, -MAX_TILT, MAX_TILT);
}

export function scoreBalance({ steadyPct, kept, total }) {
  const keptPct = total ? (kept / total) * 100 : 0;
  return clampScore(steadyPct * 0.6 + keptPct * 0.4);
}

function drawScene(c, t, li) {
  sky(c, ["#ffe5b4", "#ffd6a5", "#fdc5a0", "#f4a78f", "#d8848f"][li], "#fff5e1");
  sun(c, 1090, 130, 60, t, { color: "#ffc43d" });
  cloudLayer(c, t, { n: 3, y: 90, gap: 90, speed: 10, scale: 0.75, seed: 31 + li, under: "#ffe8cf" });
  flock(c, t, { y: 250, seed: 6 + li, color: "rgba(90,61,30,0.5)" });
  hills(c, { y: 620, amp: 70, color: "#c5d86d", seed: 11 + li, offset: t * 3 });
  windmill(c, 150, 630, 1.25, t);
  swayTree(c, 1200, 630, 1.1, t, { leaf: "#7fb069", dark: "#4f7a3f" });
  hills(c, { y: 650, amp: 70, color: "#a7c957", seed: 13 + li, offset: t * 5 });
  hills(c, { y: 700, amp: 40, color: "#6a994e", seed: 17 + li, offset: t * 9 });
  flowerRow(c, t, { y: 716, n: 18, seed: 61 + li });
  butterflies(c, t, { n: 2, y: 560, band: 70, seed: 4 + li });
  motes(c, t, { n: 12, seed: 3, rise: 6 });
}

function drawTray(c, x, y, tilt, ok) {
  c.save();
  c.translate(x, y); c.rotate((tilt * Math.PI) / 180);
  c.shadowColor = "rgba(0,0,0,0.25)"; c.shadowBlur = 16; c.shadowOffsetY = 8;
  const wood = c.createLinearGradient(0, -14, 0, 14);
  wood.addColorStop(0, ok ? "#d9a66c" : "#e0694f"); wood.addColorStop(1, ok ? "#a06f3e" : "#b03f2b");
  c.fillStyle = wood;
  rr(c, -TRAY_HALF, -14, TRAY_HALF * 2, 28, 14); c.fill();
  c.shadowColor = "transparent";
  c.fillStyle = "rgba(255,255,255,0.35)"; rr(c, -TRAY_HALF + 10, -11, TRAY_HALF * 2 - 20, 6, 3); c.fill();
  c.strokeStyle = "rgba(90,50,20,0.28)"; c.lineWidth = 2;
  for (let i = 0; i < 6; i++) { const x = -TRAY_HALF + 50 + i * 100; c.beginPath(); c.moveTo(x, 0); c.quadraticCurveTo(x + 30, 7, x + 62, 2); c.stroke(); }
  // handles
  c.fillStyle = "#7f5539"; rr(c, -TRAY_HALF - 26, -18, 30, 36, 12); c.fill(); rr(c, TRAY_HALF - 4, -18, 30, 36, 12); c.fill();
  c.restore();
}

// The bubble level: shows the tilt and the zone that counts as level.
function drawLevelMeter(c, tilt, tol) {
  const x = W / 2, y = 112, half = 210, scale = half / MAX_TILT;
  c.save();
  c.fillStyle = "rgba(255,255,255,0.75)"; rr(c, x - half - 16, y - 20, half * 2 + 32, 40, 20); c.fill();
  c.fillStyle = "rgba(6,214,160,0.55)"; rr(c, x - tol * scale, y - 16, tol * scale * 2, 32, 12); c.fill();
  c.fillStyle = Math.abs(tilt) <= tol ? "#06a77d" : "#ef476f";
  c.beginPath(); c.arc(x + clamp(tilt, -MAX_TILT, MAX_TILT) * scale, y, 15, 0, Math.PI * 2); c.fill();
  c.restore();
}

const def = {
  id: "balance",
  version: "6.0.0",
  title: "Balance Tray",
  color: "#fb8500",
  focus: "Keep the tray level and the fruit safe",
  input: "hands",
  inputLabel: "Camera (both hands, stays on this device)",
  touchLabel: "Drag up or down on the left or right side to lift that side, or use the arrow keys",
  skills: ["Two hands together", "Balance", "Steady arms"],
  howTo: [
    ["🙌", "Hold up both hands to the camera, as if holding a tray."],
    ["🍎", "Fruit falls onto the tray. Keep the tray level so nothing slides off."],
    ["⬆️", "If one side goes down, lift that hand."],
    ["📏", "On later levels, keep the tray on the moving line."],
  ],
  levels: LEVELS,

  drawPreview(c, li, t = 0) {
    drawScene(c, t, li);
    const rock = [0, -5, 7, -8, 5][li] + Math.sin(t * 1.4) * 5, a = (rock * Math.PI) / 180;
    drawTray(c, W / 2, 430, rock, true);
    const row = [["🍎"], ["🍎", "🍐"], ["🍉", "🍋"], ["🍉", "🍊", "🍎"], ["🍉", "🍐", "🍋", "🍎"]][li];
    row.forEach((f, i) => { const d = (i - (row.length - 1) / 2) * 120; emoji(c, f, W / 2 + d * Math.cos(a), 375 + d * Math.sin(a), 84); });
    vignette(c, 0.16);
  },

  create(ctx) {
    const L = ctx.level;
    const sensors = ctx.mode === "sensors" && ctx.tracker;
    const g = {
      done: false,
      round: 0, roundT: 0, state: "ready", stateT: 0,
      tilt: 0, handTilt: 0, trayY: 430, trayX: W / 2,
      items: [], dropT: 0, dropped: 0,
      kept: 0, total: 0, lost: 0,
      steadyT: 0, playT: 0, curSteady: 0, bestSteady: 0,
      tiltSum: 0, tiltAbs: 0, tiltN: 0,
      heightErr: 0, heightN: 0,
      sawHands: false, handsMissing: 0, lastHands: null, oneHandT: 0, refill: [],
      tol: L.tol,
      touchL: 430, touchR: 430,
      pop: 0,
    };
    // Easier after a round that lost fruit: 15% wider level zone per step. Harder after 2 clean rounds: 10% narrower.
    g.adaptive = ctx.makeAdaptive({ upAfter: 2, downAfter: 1 });
    let seed = 7 + ctx.levelIndex * 13;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

    const targetY = () => (L.lift ? 400 + Math.sin(g.roundT * 0.55) * 110 : null);

    const dropFruit = (refill = false) => {
      const heavy = !refill && g.dropped < L.heavy && g.round > 0;
      const [pic, weight] = heavy ? HEAVY : FRUIT[Math.floor(rnd() * FRUIT.length)];
      // fruit lands on alternating sides; the first one of the first level lands in the middle
      const side = L.load === 1 ? 0 : (g.dropped % 2 ? 1 : -1) * (0.3 + rnd() * 0.4);
      // fruit that fell off long ago is gone from the list
      g.items = g.items.filter((i) => !i.off || (i.dropY || 0) < 900);
      g.items.push({ pic, weight, pos: side, vel: 0, fall: 1, off: false, size: heavy ? 104 : 74 });
      if (!refill) g.dropped++;
      g.total++;
      ctx.event("fruit_dropped", { round: g.round + 1, weight, side: Math.round(side * 100) / 100 });
    };

    const newRound = () => {
      g.roundT = 0; g.items = []; g.dropT = 0.1; g.dropped = 0; g.state = "ready"; g.stateT = 0; g.refill = [];
      g.roundLost = 0;
      g.tol = g.adaptive.scale(L.tol, 0.15, 0.1);
    };

    g.start = () => { newRound(); };

    g.onPointer = (type, x, y) => {
      if (sensors || !(type === "down" || ctx.pointer.down)) return;
      if (x < W / 2) g.touchL = clamp(y, 200, 620); else g.touchR = clamp(y, 200, 620);
    };

    const readHands = (dt) => {
      if (sensors) {
        const hands = ctx.tracker.hands;
        let pair = null;
        if (hands.length >= 2) {
          // the hand on the left of the screen holds the left side of the tray
          pair = hands[0].palm.x <= hands[1].palm.x ? [hands[0].palm, hands[1].palm] : [hands[1].palm, hands[0].palm];
          g.oneHandT = 0;
        } else if (hands.length === 1 && g.lastHands && g.oneHandT < LOST_HAND_SEC) {
          // One hand lost for a moment (it left the picture, or the camera missed it): keep its last
          // place, so the game carries on instead of stopping.
          g.oneHandT += dt;
          const h = hands[0].palm, [la, lb] = g.lastHands;
          pair = Math.abs(h.x - la.x) < Math.abs(h.x - lb.x) ? [h, lb] : [la, h];
        }
        if (pair) {
          const [a, b] = pair;
          g.sawHands = true; g.handsMissing = 0; g.lastHands = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
          g.handTilt = lerp(g.handTilt, tiltFromHands(a, b), Math.min(1, dt * 12));
          g.trayY = lerp(g.trayY, clamp(((a.y + b.y) / 2) * H, 180, 640), Math.min(1, dt * 10));
          g.handsPos = [{ x: a.x * W, y: a.y * H }, { x: b.x * W, y: b.y * H }];
        } else { g.handsMissing += dt; g.handsPos = null; if (hands.length === 0) g.oneHandT = 0; }
      } else {
        if (ctx.keys.has("ArrowLeft")) g.touchL = clamp(g.touchL - dt * 180, 200, 620);
        if (ctx.keys.has("ArrowRight")) g.touchR = clamp(g.touchR - dt * 180, 200, 620);
        if (ctx.keys.has("ArrowUp")) { g.touchL = clamp(g.touchL - dt * 160, 200, 620); g.touchR = clamp(g.touchR - dt * 160, 200, 620); }
        if (ctx.keys.has("ArrowDown")) { g.touchL = clamp(g.touchL + dt * 160, 200, 620); g.touchR = clamp(g.touchR + dt * 160, 200, 620); }
        const t = tiltFromHands({ x: W / 2 - TRAY_HALF, y: g.touchL }, { x: W / 2 + TRAY_HALF, y: g.touchR });
        g.handTilt = lerp(g.handTilt, t, Math.min(1, dt * 10));
        g.trayY = lerp(g.trayY, (g.touchL + g.touchR) / 2, Math.min(1, dt * 8));
      }
    };

    g.update = (dt) => {
      g.stateT += dt;
      g.pop = Math.max(0, g.pop - dt * 2);
      readHands(dt);
      g.tilt = clamp(g.handTilt + loadPull(g.items.filter((i) => !i.off && i.fall <= 0), L.pull), -MAX_TILT, MAX_TILT);
      if (g.state === "ready") {
        if (g.stateT > READY_SEC) { g.state = "carry"; g.stateT = 0; }
        return;
      }
      if (g.state === "pause") {
        if (g.stateT > PAUSE_SEC) {
          g.round++;
          if (g.round >= L.rounds) { g.done = true; return; }
          newRound();
        }
        return;
      }
      // no hands in view: everything waits, so the game never punishes the camera
      if (sensors && g.handsMissing > 0.6) return;

      g.roundT += dt; g.playT += dt;
      const level = Math.abs(g.tilt) <= g.tol;
      if (level) { g.steadyT += dt; g.curSteady += dt; g.bestSteady = Math.max(g.bestSteady, g.curSteady); }
      else g.curSteady = 0;
      g.tiltSum += g.handTilt; g.tiltAbs += Math.abs(g.tilt); g.tiltN++;
      const ty = targetY();
      if (ty != null) { g.heightErr += Math.abs(g.trayY - ty); g.heightN++; }

      // fruit arrives through the round, never far apart
      g.dropT -= dt;
      if (g.dropT <= 0 && g.dropped < L.load) { dropFruit(); g.dropT = Math.min(MAX_GAP_SEC, (L.roundSec * 0.45) / L.load); }
      // a fruit that fell off is replaced straight away, so the tray is never left empty
      for (const r of g.refill) r.t -= dt;
      while (g.refill.length && g.refill[0].t <= 0 && L.roundSec - g.roundT > 1.5) { g.refill.shift(); dropFruit(true); }

      // fruit falls onto the tray, then slides when the tray tilts past its grip
      const slope = Math.sin((g.tilt * Math.PI) / 180);
      for (const it of g.items) {
        if (it.off) { it.dropY = (it.dropY || 0) + dt * 620; continue; }
        if (it.fall > 0) { it.fall = Math.max(0, it.fall - dt * 1.6); if (it.fall === 0) { ctx.sfx.pop(); g.pop = 1; } continue; }
        const grip = (g.tol * Math.PI) / 180;
        const force = Math.abs(slope) > Math.sin(grip) ? slope * 2.2 : 0;
        it.vel += force * dt;
        it.vel *= Math.pow(0.12, dt);    // friction
        it.pos += it.vel * dt;
        if (Math.abs(it.pos) > 1) {
          it.off = true; g.lost++; g.roundLost++;
          g.refill.push({ t: REFILL_SEC });
          ctx.sfx.soft();
          ctx.event("fruit_lost", { round: g.round + 1, tilt: Math.round(g.tilt) });
        }
      }

      if (g.roundT >= L.roundSec) {
        const on = g.items.filter((i) => !i.off).length;
        g.kept += on;
        ctx.event("round_end", { round: g.round + 1, kept: on, lost: g.roundLost, steady_sec: Math.round(g.steadyT * 10) / 10 });
        if (g.roundLost === 0) { g.adaptive.success(ctx.time); ctx.sfx.success(); ctx.fx.burst(W / 2, g.trayY - 80, { n: 34 }); ctx.praise(W / 2, 560, "#2b2d42"); }
        else { g.adaptive.miss(ctx.time); ctx.sfx.soft(); }
        g.state = "pause"; g.stateT = 0;
      }
    };

    g.draw = (c) => {
      const tm = ctx.anim;
      drawScene(c, tm, ctx.levelIndex);
      const ty = targetY();
      if (ty != null) {
        c.save(); c.setLineDash([16, 14]); c.strokeStyle = "rgba(255,255,255,0.95)"; c.lineWidth = 5;
        c.beginPath(); c.moveTo(150, ty); c.lineTo(W - 150, ty); c.stroke(); c.restore();
      }
      const ok = Math.abs(g.tilt) <= g.tol;
      const a = (g.tilt * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
      // fruit
      for (const it of g.items) {
        const d = it.pos * (TRAY_HALF - 30);
        const fx = g.trayX + d * cos, base = g.trayY + d * sin - 12 - it.size / 2.4;
        if (it.off) { emoji(c, it.pic, fx + Math.sign(it.pos) * 40, base + (it.dropY || 0), it.size); continue; }
        emoji(c, it.pic, fx, base - it.fall * it.fall * 480, it.size);
      }
      drawTray(c, g.trayX, g.trayY, g.tilt, ok);
      // the child's hands
      if (g.handsPos) for (const p of g.handsPos) starCursor(c, p.x, p.y, ctx.anim, "#fb8500", 20);
      lumi(c, 1180, 600, 0.8, { t: ctx.time, mood: ok ? "happy" : "wow" });
      vignette(c, 0.14);
      drawLevelMeter(c, g.tilt, g.tol);
      if (sensors && g.handsMissing > 0.6) label(c, ctx.t("showBothHands"), W / 2, 330, { size: 44, color: INK, shadow: false });
      else if (g.state === "ready") label(c, ctx.t("holdTrayLevel"), W / 2, 200, { size: 40, color: INK, shadow: false });
      else if (g.state === "pause") label(c, g.roundLost ? ctx.t("fruitFell", { n: g.roundLost }) : ctx.t("allSafe"), W / 2, 200, { size: 40, color: INK, shadow: false });
      else if (!ok) label(c, ctx.t(g.tilt > 0 ? "liftRight" : "liftLeft"), W / 2, 180, { size: 38, color: "#b3261e", shadow: false });
      else if (L.lift) label(c, ctx.t("followLineTray"), W / 2, 180, { size: 32, weight: 600, color: INK, shadow: false });
      // time left in the round
      if (g.state === "carry") { c.fillStyle = "rgba(255,255,255,0.5)"; rr(c, 40, 40, 240, 16, 8); c.fill(); c.fillStyle = "#fb8500"; rr(c, 40, 40, 240 * clamp(1 - g.roundT / L.roundSec, 0, 1), 16, 8); c.fill(); }
    };

    g.hud = () => ({ progress: `${ctx.t("rounds")} ${Math.min(g.round + 1, L.rounds)}/${L.rounds}` });

    g.result = () => {
      const steadyPct = g.playT ? Math.round((g.steadyT / g.playT) * 100) : 0;
      const bias = g.tiltN ? g.tiltSum / g.tiltN : 0;
      const sens = ctx.mode === "sensors";
      // a positive hand tilt means the right hand was held lower
      const biasDeg = Math.round(Math.abs(bias) * 10) / 10;
      return {
        completed: g.round >= L.rounds,
        score: scoreBalance({ steadyPct, kept: g.kept, total: g.total }),
        settings: { tolerance_deg: L.tol },
        metrics: {
          steady_pct: steadyPct,
          tilt_tolerance_deg: L.tol,
          mean_tilt_deg: g.tiltN ? Math.round((g.tiltAbs / g.tiltN) * 10) / 10 : null,
          items_kept: g.kept,
          items_lost: g.lost,
          items_total: g.total,
          longest_steady_sec: Math.round(g.bestSteady * 10) / 10,
          mean_side_bias_deg: sens ? biasDeg : null,
          side_bias: sens && biasDeg >= 3 ? (bias > 0 ? "right" : "left") : null,
          height_error_px: g.heightN ? Math.round(g.heightErr / g.heightN) : null,
          hands_seen: sens ? g.sawHands : null,
        },
        // shown to the child: counts and whole seconds only
        summary: [
          { label: ctx.t("fruitSafe"), value: `${g.kept}/${g.total}` },
          { label: ctx.t("longestSteady"), value: `${Math.floor(g.bestSteady)} s` },
        ],
      };
    };

    return g;
  },
};

export default def;
