// ANIMAL MOVES: whole-body movement. Lumi's animal friends each have a pose to copy: giraffe (reach
// up), bird (arms out), palm tree (sway to the side), frog (squat), flamingo (stand on one leg).
// Every pose is held until the ring fills: 5, 10, 15, 20 and 25 seconds, level by level. Higher levels
// ask for bigger movements, standing balance, and finally a mixed routine. A pose counts as soon as
// it is made, keeps counting through small wobbles, and a camera glitch does not reset the hold.
// Sensor mode: camera body tracking (on the device, the child stands back so the whole body shows).
// Touch mode: a grown-up taps "Done" when the child makes the pose, with no time limit.
import { W, H, sky, hills, label, ring, clamp, rr, vignette, emoji, glow } from "../kit/draw.js";
import { measureBody, moveAmount, scoreBody, baseFrom } from "../kit/body.js";
import { drawBuddy, poseJoints, jointsFromPose, smoothJoints } from "../kit/buddy.js";
import { sun, cloudLayer, flock, butterflies, swayTree, grass, flowerRow, bunting, motes, rays, SparkTrail, sparkle } from "../kit/scene.js";

export const MOVES = {
  reach: { key: "body_reach", animal: "🦒", color: "#ffb703" },
  wings: { key: "body_wings", animal: "🐦", color: "#4cc9f0" },
  leanLeft: { key: "body_leanLeft", animal: "🌴", color: "#52b788" },
  leanRight: { key: "body_leanRight", animal: "🌴", color: "#52b788" },
  squat: { key: "body_squat", animal: "🐸", color: "#80b918" },
  standLeft: { key: "body_standLeft", animal: "🦩", color: "#ff5d8f" },
  standRight: { key: "body_standRight", animal: "🦩", color: "#ff5d8f" },
};

// hold: seconds every pose in the level is held: 5, 10, 15, 20 and 25, level by level. need: how big
// the movement must be.
export const LEVELS = [
  { name: "Tall Giraffe", goal: "Reach up like a giraffe, then arms out like a bird. Hold each pose for 5 seconds. 4 poses.", seq: ["reach", "wings"], reps: 4, hold: 5, holdEnd: 5, need: 0.85, settings: { moves: ["reach", "wings"], reps: 4, hold_sec: 5 } },
  { name: "Swaying Palm", goal: "Sway left and right like a palm tree, then reach up. 10 seconds each. 4 poses.", seq: ["leanLeft", "leanRight", "reach"], reps: 4, hold: 10, holdEnd: 10, need: 1, settings: { moves: ["leanLeft", "leanRight", "reach"], reps: 4, hold_sec: 10 } },
  { name: "Frog Squats", goal: "Bend your knees and squat like a frog, then stretch up tall. 15 seconds each. 4 poses.", seq: ["squat", "reach"], reps: 4, hold: 15, holdEnd: 15, need: 1, settings: { moves: ["squat", "reach"], reps: 4, hold_sec: 15 } },
  { name: "Flamingo Balance", goal: "Stand on one leg like a flamingo. Try each side. 20 seconds each. 4 poses.", seq: ["standLeft", "standRight"], reps: 4, hold: 20, holdEnd: 20, need: 1, settings: { moves: ["standLeft", "standRight"], reps: 4, hold_sec: 20 } },
  { name: "Animal Parade", goal: "All the animals in a mixed routine. 25 seconds each. 6 poses.", seq: ["reach", "squat", "wings", "standLeft", "leanRight", "standRight"], reps: 6, hold: 25, holdEnd: 25, need: 1.1, settings: { moves: "all", reps: 6, hold_sec: 25 } },
];

const GRACE = 0.5;   // seconds a pose may drop out (a wobble, a blink of the camera) without losing any hold

// Every pose in a level is held for the same time.
export function holdForPose(level, rep) {
  return level.hold;
}

export function poseSequence(level) {
  return Array.from({ length: level.reps }, (_, i) => level.seq[i % level.seq.length]);
}

function drawScene(c, t, li) {
  sky(c, ["#74c5ee", "#6dd3e6", "#8fb2ff", "#ffb3d0", "#b794e6"][li], "#fff4d6");
  sun(c, 980, 120, 60, t);
  cloudLayer(c, t, { n: 4, y: 50, gap: 110, speed: 12, scale: 0.85, seed: 17 + li });
  flock(c, t, { y: 200, seed: 9 + li });
  hills(c, { y: 600, amp: 72, color: "#95d5b2", seed: 23 + li, offset: t * 3 });
  swayTree(c, 90, 610, 1.3, t);
  swayTree(c, 1190, 600, 1.45, t, { leaf: "#74c69d" });
  swayTree(c, 1040, 610, 0.85, t, { leaf: "#40916c", dark: "#1b4332" });
  hills(c, { y: 670, amp: 38, color: "#52b788", seed: 29 + li, offset: t * 5 });
  // the animal friends peek over the hill, and bob along with the child
  ["🦒", "🐘", "🦓", "🐒"].forEach((pic, i) => emoji(c, pic, 210 + i * 300 - 40, 618 + Math.sin(t * 1.5 + i * 1.7) * 14, 70 + (i % 2) * 14));
  grass(c, t, { y: 720, color: "#2d6a4f" });
  flowerRow(c, t, { y: 716, n: 18, seed: 41 + li });
  bunting(c, t, { y: 8, sag: 26 });
  butterflies(c, t, { n: 3, y: 470, band: 110, seed: 3 + li });
  motes(c, t, { n: 14, seed: 6, rise: 7 });
}

// Moves into the pose, holds it, and eases back out, so the picture shows the movement. Still at t = 0.
export function demoK(t) {
  if (t <= 0) return 1;
  const u = (t * 0.4) % 1;
  return u < 0.3 ? u / 0.3 : u < 0.8 ? 1 : (1 - u) / 0.2;
}

const def = {
  id: "body",
  version: "6.0.0",
  title: "Animal Moves",
  color: "#2a9d8f",
  focus: "Move like the animals and hold the pose",
  input: "pose",
  inputLabel: "Camera (your whole body, stays on this device)",
  touchLabel: "A grown-up taps Done when the child makes the pose",
  skills: ["Big moves", "Balance", "Stretching", "Following along"],
  howTo: [
    ["🧍", "Stand back until the camera can see all of you, from head to feet."],
    ["🦒", "The card shows an animal pose. Buddy shows you how."],
    ["⏳", "Make the pose and hold it until the ring is full."],
    ["🎉", "Every pose you finish makes the animals cheer."],
  ],
  levels: LEVELS,

  drawPreview(c, li, t = 0) {
    drawScene(c, t, li);
    const row = [["reach", "wings"], ["leanLeft", "reach"], ["squat", "reach"], ["standLeft"], ["reach", "squat", "standLeft"]][li];
    row.forEach((m, i) => drawBuddy(c, poseJoints(m, W / 2 + (i - (row.length - 1) / 2) * 340, 390, row.length > 2 ? 2.4 : 3, demoK(t + i)), m, { t }));
    vignette(c, 0.16);
  },

  create(ctx) {
    const L = ctx.level;
    const seq = poseSequence(L);
    const sensors = ctx.mode === "sensors" && ctx.tracker;
    const g = {
      done: false, i: 0, state: "cue", stateT: 0, hold: 0, amount: 0,
      results: [], therapistTap: false, seen: false, unseenT: 0,
      holdT: holdForPose(L, 0), need: L.need, limitT: L.hold * 2 + 12, inPose: false, offT: 0,
      bestHold: 0, bestByMove: {}, maxAmount: {}, pop: 0, joints: null, lastDraw: 0,
    };
    const sparks = new SparkTrail({ reduced: ctx.reduced, life: 0.8, size: 10 });
    g.adaptive = ctx.makeAdaptive({ enabled: !!sensors, upAfter: 3, downAfter: 2 });
    // The hold time is the level's and never changes. Easier after 2 missed poses: the movement needed
    // is 15% smaller and there is 25% more time. Harder after 3 poses in a row: 10% bigger movement.
    const retune = () => {
      g.holdT = holdForPose(L, g.i);
      g.need = g.adaptive.scale(L.need, -0.15, -0.1);
      g.limitT = g.adaptive.scale(L.hold * 2 + 12, 0.25, 0);
    };
    const finishRep = (ok, why) => {
      const move = seq[g.i];
      g.results.push({ move, done: ok, reason: why || null, hold_sec: ok ? g.holdT : Math.floor(g.hold) });
      ctx.event(ok ? "pose_done" : "pose_missed", { rep: g.i + 1, move, reason: why || null, hold_target_sec: g.holdT });
      if (ok) { g.adaptive.success(ctx.time); ctx.sfx.success(); ctx.fx.burst(W / 2, 300, { n: 50, speed: 380, colors: [MOVES[move].color, "#fff", "#ffd166"] }); ctx.fx.ring && ctx.fx.ring(W / 2, 300, { r: 320 }); g.pop = 1; }
      else { g.adaptive.miss(ctx.time); ctx.sfx.soft(); }
      if (ok && sensors) { g.bestHold = Math.max(g.bestHold, g.holdT); g.bestByMove[move] = Math.max(g.bestByMove[move] || 0, g.holdT); }
      if (ok && g.results.filter((r) => r.done).length % 3 === 0) ctx.praise(W / 2, 620, "#2b2d42");
      g.state = ok ? "yay" : "missed"; g.stateT = 0;
    };

    const controls = [];
    if (!sensors) {
      controls.push({ id: "done", kind: "tap", tone: "go", label: "✓ " + ctx.t("done"), onTap: () => (g.therapistTap = true) });
      controls.push({ id: "notyet", kind: "tap", label: ctx.t("notYet"), onTap: () => { if (g.state === "cue") finishRep(false, "adult_not_yet"); } });
    }
    controls.push({ id: "skip", kind: "tap", label: ctx.t("skip"), onTap: () => { if (g.state === "cue") finishRep(false, "skipped"); } });
    ctx.setControls(controls);

    g.start = () => ctx.say(MOVES[seq[0]].key);

    g.update = (dt) => {
      g.stateT += dt;
      g.pop = Math.max(0, g.pop - dt * 1.6);
      const move = seq[g.i];
      if (g.state !== "cue") {
        if (g.stateT > (g.state === "yay" ? 1.6 : 1.3)) {
          g.i++;
          if (g.i >= seq.length) { g.done = true; return; }
          g.state = "cue"; g.stateT = 0; g.hold = 0; g.amount = 0; g.therapistTap = false; g.inPose = false; g.offT = 0;
          retune();
          ctx.say(MOVES[seq[g.i]].key);
        }
        return;
      }
      if (!sensors) {
        if (g.therapistTap) { g.therapistTap = false; g.hold = g.holdT; finishRep(true, "adult_confirmed"); }
        return;
      }
      const m = measureBody(ctx.tracker.pose);
      g.seen = !!m;
      if (!m) {
        // out of view: the clock stops, so the camera can never fail a child
        g.unseenT += dt;
        g.stateT -= dt;
        return;
      }
      // no standing reference from the start-up check: the first frame seen is the reference
      g.base ||= ctx.poseBase || baseFrom([m]);
      g.amount = moveAmount(move, m, g.base, g.need);
      g.maxAmount[move] = Math.max(g.maxAmount[move] || 0, g.amount * g.need);
      // in the pose at full size; once in, it stays in down to 75%, so a wobble does not break it
      g.inPose = g.amount >= (g.inPose ? 0.75 : 1);
      if (g.inPose) { g.offT = 0; g.hold += dt; }
      else { g.offT += dt; if (g.offT > GRACE) g.hold = Math.max(0, g.hold - dt * 0.6); }
      if (g.hold >= g.holdT) finishRep(true);
      else if (g.stateT > g.limitT) finishRep(false, "time");
    };

    g.draw = (c) => {
      const tm = ctx.anim;
      drawScene(c, tm, ctx.levelIndex);
      const move = seq[Math.min(g.i, seq.length - 1)];
      const mv = MOVES[move];
      const inPose = g.state === "cue" && g.inPose;
      const dt = Math.max(0, ctx.time - g.lastDraw); g.lastDraw = ctx.time;
      sparks.update(dt);
      // Buddy follows the child. In touch mode, or until the camera sees the child, Buddy shows the move.
      const live = sensors ? jointsFromPose(ctx.tracker.pose, W / 2, 360, 680) : null;
      if (live) g.joints = smoothJoints(g.joints, live, 0.65);
      const mood = inPose || g.state === "yay" ? "wow" : "happy";
      if (live && g.joints) {
        if (inPose) { sparks.add(g.joints.lw.x, g.joints.lw.y, dt, 30); sparks.add(g.joints.rw.x, g.joints.rw.y, dt, 30); }
        if (inPose && !ctx.reduced) rays(c, (g.joints.lh.x + g.joints.rh.x) / 2, g.joints.ls.y, 420, tm, { color: "rgba(255,255,255,0.14)", n: 12, speed: 0.5 });
        drawBuddy(c, g.joints, move, { t: tm, mood, lit: clamp(g.amount, 0, 1) });
        sparks.draw(c);
      } else if (!sensors || !g.seen) {
        const jump = g.state === "yay" && !ctx.reduced ? Math.abs(Math.sin(g.stateT * 6)) * 34 : 0;
        drawBuddy(c, poseJoints(move, W / 2 + 40, 372 - jump, 3.2, ctx.reduced ? 1 : demoK(tm + 0.01)), move, { t: tm, mood, shadowY: 610 });
      }
      // the cue card: animal, the pose to copy, and its name
      const cardIn = ctx.reduced ? 1 : clamp(g.stateT / 0.3, 0, 1);
      c.save(); c.translate(196, 190); { const k = 0.9 + 0.1 * cardIn; c.scale(k, k); } c.translate(-196, -190);
      c.save(); c.shadowColor = "rgba(0,0,0,0.22)"; c.shadowBlur = 18; c.shadowOffsetY = 6; c.fillStyle = "rgba(255,255,255,0.96)"; rr(c, 36, 40, 320, 300, 28); c.fill(); c.restore();
      c.save(); c.strokeStyle = mv.color; c.lineWidth = 6; rr(c, 44, 48, 304, 284, 22); c.stroke(); c.restore();
      const bob = ctx.reduced ? 0 : Math.sin(ctx.time * 3) * 5;
      c.save(); c.translate(106, 118 + bob); c.rotate(ctx.reduced ? 0 : Math.sin(ctx.time * 2) * 0.1); emoji(c, mv.animal, 0, 0, 76); c.restore();
      drawBuddy(c, poseJoints(move, 258, 152, 1, ctx.reduced ? 1 : demoK(tm + 0.01)), move, { t: tm, mood: "happy", shadowY: 230 });
      label(c, ctx.t(mv.key), 196, 262, { size: 30, color: "#2b2d42", shadow: false });
      label(c, `${ctx.t("hold")} ${g.holdT}s`, 196, 302, { size: 22, color: "#5c5f7a", shadow: false, weight: 500 });
      c.restore();
      if (sensors) {
        // below the camera preview, which sits in the top corner
        ring(c, W - 130, 310, 76, g.hold / g.holdT, { color: mv.color, width: 16, track: "rgba(255,255,255,0.6)" });
        label(c, `${Math.floor(Math.min(g.hold, g.holdT))}s`, W - 130, 310, { size: 34, color: "#2b2d42", shadow: false, weight: 800 });
      }
      if (g.state === "yay") {
        const s = ctx.reduced ? 1 : 1 + Math.sin(g.pop * Math.PI) * 0.35;
        if (!ctx.reduced) rays(c, W / 2, 300, 560, ctx.time, { color: "rgba(255,226,130,0.28)", n: 14, speed: 0.8 });
        glow(c, W / 2, 300, 200, "rgba(255,255,255,0.7)");
        for (let q = 0; q < 8; q++) { const a = ctx.time * 1.8 + (q * Math.PI) / 4; sparkle(c, W / 2 + Math.cos(a) * 150, 300 + Math.sin(a) * 150, 14, q % 2 ? "#ffd166" : "#fff", a); }
        c.save(); c.translate(W / 2, 300); c.rotate(ctx.reduced ? 0 : Math.sin(ctx.time * 8) * 0.12); emoji(c, mv.animal, 0, 0, 170 * s); c.restore();
      }
      // rep dots
      for (let k = 0; k < seq.length; k++) {
        const r = g.results[k];
        c.fillStyle = r ? (r.done ? "#06d6a0" : "rgba(255,255,255,0.45)") : k === g.i ? "#ffd166" : "rgba(255,255,255,0.75)";
        c.beginPath(); c.arc(W / 2 - (seq.length - 1) * 16 + k * 32, 690, 10, 0, Math.PI * 2); c.fill();
      }
      vignette(c, 0.12);
      if (sensors && !g.seen && g.state === "cue") label(c, ctx.t("standBack"), W / 2, 60, { size: 32 });
    };

    g.hud = () => ({ progress: `${ctx.t("reps")} ${g.results.filter((r) => r.done).length}/${seq.length}` });

    g.result = () => {
      const done = g.results.filter((r) => r.done).length;
      const byMove = {};
      for (const r of g.results) { const e = (byMove[r.move] ||= { done: 0, total: 0 }); e.total++; if (r.done) e.done++; }
      const sens = ctx.mode === "sensors";
      const side = (a, b) => (byMove[a] && byMove[b] ? byMove[a].done - byMove[b].done : 0);
      const gap = side("standLeft", "standRight") || side("leanLeft", "leanRight");
      return {
        completed: g.i >= seq.length,
        score: scoreBody(done, seq.length),
        metrics: {
          moves_done: done,
          moves_total: seq.length,
          hold_first_sec: L.hold,
          hold_final_target_sec: L.holdEnd,
          longest_hold_sec: sens ? g.bestHold : null,
          longest_hold_by_move: sens ? g.bestByMove : null,
          by_move: byMove,
          left_right_balance_note: gap > 0 ? "r_body_left_better" : gap < 0 ? "r_body_right_better" : null,
          skipped: g.results.filter((r) => r.reason === "skipped").length,
          confirmed_by: sens ? "camera" : "adult",
          out_of_view_sec: sens ? Math.round(g.unseenT * 10) / 10 : null,
        },
        summary: [
          { label: ctx.t("reps"), value: `${done}/${seq.length}` },
          ...(sens ? [{ label: ctx.t("longestHold"), value: `${Math.floor(g.bestHold)} s` }] : []),
        ],
      };
    };

    return g;
  },
};

export default def;
