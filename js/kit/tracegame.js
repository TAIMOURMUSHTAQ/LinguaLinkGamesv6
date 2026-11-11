// The play loop shared by Air Letters and Finger Numbers: trace a character in the air, then a big
// picture pops up and the word is spoken.
//
// A game gives: its levels, items for a level, how to read the cursor from the camera, and its art.
// Every level changes something that matters for therapy: how large the movement must be (gain),
// how exact it must be (tolerance), and what is being traced.
import { W, H, label, glow, clamp, lerp, rr, vignette, emoji } from "./draw.js";
import { speakWord } from "./audio.js";
import { Tracer, OneEuro, scoreTrace } from "./trace.js";
import { SparkTrail, starCursor, rays, sparkle, spring } from "./scene.js";

export const BOX_H = 470;
const LIMIT_SEC = 40;      // camera mode: seconds for one character before moving on
const POP_SEC = 3.2;       // how long the picture stays up
const LOST_SEC = 0.3;      // the camera may lose a hand for this long without the pen lifting
const STUCK_SEC = 9;       // no progress for this long: a little more room for error, and a demo
const MORE_ROOM = 1.2;     // how much more room each time, at most twice per character
const HAND_COLOR = { left: "#4aa3ff", right: "#ff9f43", any: "#ffd166" };

// The largest box of a character's shape that fits the play area, centred.
export function boxFor(level) {
  const h = level.boxH || BOX_H;
  const w = h * 0.8;
  return { x: W / 2 - w / 2, y: 120 + (BOX_H - h) / 2, w, h };
}

// Spread the camera's range out, so small movements cover the screen at first. A gain of 1 means
// the child's real reach matches the screen.
export function applyGain(x, y, gain) {
  return { x: clamp((x - 0.5) * gain + 0.5, 0, 1), y: clamp((y - 0.5) * gain + 0.5, 0, 1) };
}

// From the camera to the screen, with the same size of movement giving the same distance across as
// up and down. The screen is wider than the camera, so without this, sideways strokes run too fast
// and letters feel squashed.
export function airToScreen(p, gain, camAspect = 4 / 3) {
  const q = applyGain(p.x, p.y, gain);
  const across = (H * camAspect) / W;
  return { x: clamp(0.5 + (q.x - 0.5) * across, 0, 1) * W, y: q.y * H };
}

// When two hands are in view, keep following the one that is drawing, instead of jumping between them.
export function closestHand(hands, cursor, read = (h) => h) {
  if (hands.length < 2 || !cursor) return hands[0] || null;
  let best = hands[0], bd = Infinity;
  for (const h of hands) { const p = read(h), d = Math.hypot(p.x - cursor.x / W, p.y - cursor.y / H); if (d < bd) { bd = d; best = h; } }
  return best;
}

// spec: { background(c, tm, li), readCursor(ctx, g) -> {x, y, hand, ok, hint?, isolated?} | null,
//         colors: {ink}, drawExtra(c, ctx, g)?, count(item, ctx) -> number of fingers up? }
export function createTraceGame(ctx, spec) {
  const L = ctx.level;
  const items = L.items;
  const sensors = ctx.mode === "sensors" && ctx.tracker;
  const g = {
    done: false, i: 0, state: "ready", stateT: 0,
    results: [],
    tracer: null,
    cursor: null,            // smoothed position in screen pixels
    seen: null,
    trail: [],
    tolerance: L.tolerance,
    gain: L.gain,
    hands: { left: 0, right: 0, any: 0 },
    isolatedT: 0, activeT: 0,
    hint: null, hintT: 0,
    holdCount: 0,            // counting items: time the right number of fingers has been up
    itemT: 0,
    lostT: 9, stuckT: 0, helped: 0, lastReached: 0, pen: null, flash: 0,
  };
  const filterX = new OneEuro(), filterY = new OneEuro();
  const sparks = new SparkTrail({ reduced: ctx.reduced });
  // Easier after 2 characters that ran out of time: 15% more room for error per step.
  // Harder after 4 quick, accurate characters: 10% less per step.
  g.adaptive = ctx.makeAdaptive({ upAfter: 4, downAfter: 2 });
  const item = () => items[Math.min(g.i, items.length - 1)];
  const box = () => boxFor(L);

  const startItem = () => {
    g.itemT = 0; g.holdCount = 0; g.trail = []; g.stuckT = 0; g.helped = 0; g.lastReached = 0; g.pen = null;
    g.tolerance = g.adaptive.scale(L.tolerance, 0.15, 0.1);
    g.tracer = item().count ? null : new Tracer(item().ch, box(), { tolerance: g.tolerance });
    g.state = item().count ? "count" : "trace";
    g.stateT = 0;
    ctx.event("item_start", { item: item().ch, tolerance_px: Math.round(g.tolerance) });
  };

  const finishItem = (ok, why) => {
    const it = item();
    const t = g.tracer;
    const quick = g.itemT < (it.count ? 8 : 14);
    g.results.push({
      item: it.label || String(it.ch), done: ok, reason: why || null, time_sec: Math.round(g.itemT * 10) / 10,
      accuracy: t ? t.accuracy() : ok ? 100 : 0, efficiency: t ? t.efficiency() : null,
    });
    ctx.event(ok ? "item_done" : "item_missed", { item: it.label || String(it.ch), reason: why || null, time_sec: Math.round(g.itemT * 10) / 10, accuracy: t ? t.accuracy() : null });
    if (ok && quick && (!t || t.accuracy() >= 60)) g.adaptive.success(ctx.time);
    if (!ok) g.adaptive.miss(ctx.time);
    if (ok) {
      ctx.sfx.levelUp();
      ctx.fx.burst(W / 2, 330, { n: 60, speed: 420 });
      ctx.fx.ring && ctx.fx.ring(W / 2, 330, { r: 460, life: 0.7 });
      ctx.fx.confetti && ctx.fx.confetti(40);
      g.state = "pop"; g.stateT = 0;
      if (it.say && ctx.config.sound !== false) speakWord(it.say, "en");
    } else {
      ctx.sfx.soft();
      next();
    }
  };

  const next = () => {
    g.i++;
    if (g.i >= items.length) { g.done = true; return; }
    startItem();
  };

  const controls = [{ id: "skip", kind: "tap", label: ctx.t("skip"), onTap: () => { if (g.state === "trace" || g.state === "count") finishItem(false, "skipped"); else if (g.state === "pop") next(); } }];
  if (!sensors && items.some((it) => it.count)) controls.unshift({ id: "done", kind: "tap", tone: "go", label: "✓ " + ctx.t("done"), onTap: () => { if (g.state === "count") finishItem(true, "therapist_confirmed"); } });
  ctx.setControls(controls);

  g.onPointer = (type, x, y) => {
    if (sensors) return;
    if (type === "down" || (type === "move" && ctx.pointer.down)) {
      g.seen = { x, y, hand: "any", ok: true };
    } else if (type === "up") g.seen = null;
  };

  g.start = () => { startItem(); };

  g.update = (dt) => {
    g.stateT += dt;
    g.hintT = Math.max(0, g.hintT - dt);
    g.flash = Math.max(0, g.flash - dt);
    sparks.update(dt);
    if (g.state === "pop") {
      if (g.stateT > POP_SEC) next();
      return;
    }
    g.itemT += dt;
    if (sensors) g.seen = spec.readCursor(ctx, g);
    const seen = g.seen;
    if (seen && seen.ok) {
      g.lostT = 0;
      g.cursor = { x: sensors ? filterX.next(seen.x, dt) : seen.x, y: sensors ? filterY.next(seen.y, dt) : seen.y, hand: seen.hand };
      g.hands[seen.hand] = (g.hands[seen.hand] || 0) + dt;
      g.activeT += dt;
      if (seen.isolated) g.isolatedT += dt;
      if (seen.other) g.otherT = (g.otherT || 0) + dt;   // drawn with another finger or the whole hand
      if (seen.note && g.otherT < 3) { g.hint = seen.note; g.hintT = 0.3; }
    } else {
      // A camera loses a hand for a moment all the time. The pen only lifts if it stays lost.
      g.lostT += dt;
      if (g.lostT > LOST_SEC) {
        g.cursor = null; g.pen = null; filterX.reset(); filterY.reset();
        if (seen && seen.hint) { g.hint = seen.hint; g.hintT = 0.5; }
      }
    }

    if (g.state === "count") {
      const it = item();
      const up = sensors ? spec.count(ctx) : 0;
      g.fingersUp = up;
      if (sensors) {
        g.holdCount = up === it.count ? g.holdCount + dt : Math.max(0, g.holdCount - dt * 1.5);
        if (g.holdCount >= 1.2) finishItem(true);
        else if (g.itemT > LIMIT_SEC) finishItem(false, "time");
      }
      return;
    }
    if (g.tracer) {
      // Stuck for a while: a little more room for error, and the spark shows the way again.
      const reached = g.tracer.reached;
      if (reached !== g.lastReached) { g.lastReached = reached; g.stuckT = 0; } else g.stuckT += dt;
      if (g.stuckT > STUCK_SEC && g.helped < 2) {
        g.helped++; g.stuckT = 0;
        g.tracer.tolerance *= MORE_ROOM;
        ctx.event("more_room", { item: item().label || String(item().ch), tolerance_px: Math.round(g.tracer.tolerance) });
      }
    }
    if (g.cursor && g.tracer && g.lostT === 0) {
      const strokeBefore = g.tracer.stroke;
      const endOfStroke = g.tracer.next;
      const ev = g.tracer.follow(g.cursor.x, g.cursor.y);
      if (g.tracer.tracing) sparks.add(g.cursor.x, g.cursor.y, dt);
      if (ev === "start") { ctx.sfx.tick(); ctx.fx.ring && ctx.fx.ring(g.cursor.x, g.cursor.y, { r: 70, life: 0.4 }); }
      if (ev === "stroke" && g.tracer.stroke !== strokeBefore) {
        ctx.sfx.chime(g.tracer.stroke + 2); g.flash = 0.35;
        if (endOfStroke) { ctx.fx.burst(endOfStroke.x, endOfStroke.y, { n: 16, speed: 220 }); ctx.fx.ring && ctx.fx.ring(endOfStroke.x, endOfStroke.y, { r: 90, life: 0.45 }); }
      }
      if (ev === "done") { finishItem(true); return; }
    }
    // the pen is drawn on the line when the hand is close, so the ink flows smoothly
    if (g.cursor && g.tracer) {
      const near = g.tracer.nearest(g.cursor.x, g.cursor.y);
      const pull = near && near.d < g.tracer.tolerance ? 0.45 : 0;
      const tx = near ? lerp(g.cursor.x, near.x, pull) : g.cursor.x, ty = near ? lerp(g.cursor.y, near.y, pull) : g.cursor.y;
      const k = Math.min(1, dt * 22);
      g.pen = g.pen ? { x: lerp(g.pen.x, tx, k), y: lerp(g.pen.y, ty, k) } : { x: tx, y: ty };
    }
    if (sensors && g.itemT > LIMIT_SEC) finishItem(false, "time");
  };

  const drawGlyph = (c) => {
    const t = g.tracer;
    if (!t) return;
    const tm = ctx.anim;
    const b = box();
    // a magic slate, so the line stands out on any background
    c.save();
    const pad = 70, sx = b.x - pad, sy = b.y - pad + 4, sw = b.w + pad * 2, sh = b.h + pad * 2 - 8;
    const slate = c.createLinearGradient(0, sy, 0, sy + sh);
    slate.addColorStop(0, "rgba(26,30,84,0.72)"); slate.addColorStop(1, "rgba(44,26,96,0.72)");
    c.fillStyle = slate; rr(c, sx, sy, sw, sh, 40); c.fill();
    c.strokeStyle = `rgba(255,255,255,${0.35 + Math.sin(tm * 2.4) * 0.12 + g.flash})`; c.lineWidth = 4; rr(c, sx, sy, sw, sh, 40); c.stroke();
    c.lineCap = "round"; c.lineJoin = "round";
    const path = (pts, upto = pts.length) => { c.beginPath(); for (let k = 0; k < upto; k++) (k ? c.lineTo(pts[k].x, pts[k].y) : c.moveTo(pts[k].x, pts[k].y)); };
    // the whole shape: a soft road as wide as the room for error, with a dotted line down the middle
    t.strokes.forEach((pts) => {
      c.strokeStyle = "rgba(255,255,255,0.2)"; c.lineWidth = Math.max(26, Math.min(70, t.tolerance * 0.85));
      path(pts); c.stroke();
    });
    c.save(); c.strokeStyle = "rgba(255,255,255,0.75)"; c.lineWidth = 5; c.setLineDash([2, 17]); c.lineDashOffset = -tm * 26;
    t.strokes.forEach((pts, si) => { if (si >= t.stroke) { path(pts); c.stroke(); } });
    c.restore();
    // the ink: a rainbow that follows the hand, with a bright middle
    let hue = 330;
    t.strokes.forEach((pts, si) => {
      const upto = si < t.stroke ? pts.length : si === t.stroke ? t.point : 0;
      if (upto < 2) return;
      c.lineWidth = 28;
      for (let k = 1; k < upto; k++) {
        c.strokeStyle = `hsl(${(hue + tm * 40) % 360} 95% 62%)`;
        c.beginPath(); c.moveTo(pts[k - 1].x, pts[k - 1].y); c.lineTo(pts[k].x, pts[k].y); c.stroke();
        hue += 7;
      }
      c.strokeStyle = "rgba(255,255,255,0.65)"; c.lineWidth = 8; path(pts, upto); c.stroke();
    });
    const pts = t.strokes[t.stroke], last = t.point > 0 && pts ? pts[t.point - 1] : null;
    if (last && g.pen && Math.hypot(g.pen.x - last.x, g.pen.y - last.y) < t.tolerance * 1.3) {
      c.strokeStyle = `hsl(${(hue + tm * 40) % 360} 95% 62%)`; c.lineWidth = 28;
      c.beginPath(); c.moveTo(last.x, last.y); c.lineTo(g.pen.x, g.pen.y); c.stroke();
    }
    const n = t.next;
    if (n) {
      // the way ahead: arrows slide along the next part of the stroke
      const ahead = Math.max(0, pts.length - t.point);
      for (let q = 0; q < 3 && ahead > 3; q++) {
        const u = ((tm * 0.8 + q / 3) % 1), idx = Math.min(pts.length - 1, t.point + Math.floor(u * Math.min(ahead, 9))), p = pts[idx], p2 = pts[Math.min(pts.length - 1, idx + 1)];
        if (p === p2) continue;
        c.save(); c.translate(p.x, p.y); c.rotate(Math.atan2(p2.y - p.y, p2.x - p.x)); c.globalAlpha = Math.sin(u * Math.PI);
        c.fillStyle = "#fff"; c.beginPath(); c.moveTo(13, 0); c.lineTo(-8, -11); c.lineTo(-3, 0); c.lineTo(-8, 11); c.closePath(); c.fill(); c.restore();
      }
      // before a stroke starts, and when stuck, a spark runs along it to show how it goes
      if ((t.point === 0 || g.stuckT > 4) && !ctx.reduced) {
        const u = (ctx.time * 0.45) % 1, p = pts[Math.floor(u * (pts.length - 1))];
        glow(c, p.x, p.y, 30, "rgba(255,255,255,0.75)"); sparkle(c, p.x, p.y, 15, "#fff", ctx.time * 5);
      }
      // a magic thread from the hand to where to start
      if (t.point === 0 && g.cursor) {
        c.save(); c.strokeStyle = "rgba(255,209,102,0.9)"; c.lineWidth = 5; c.setLineDash([3, 14]); c.lineDashOffset = -ctx.time * 50;
        c.beginPath(); c.moveTo(g.cursor.x, g.cursor.y); c.lineTo(n.x, n.y); c.stroke(); c.restore();
      }
      // where to go next: a pulsing dot, and a stroke number at the start of a stroke
      const pulse = ctx.reduced ? 1 : 1 + Math.sin(ctx.time * 6) * 0.18;
      if (t.point === 0 && !ctx.reduced) rays(c, n.x, n.y, 62 * pulse, ctx.time, { color: "rgba(255,214,102,0.45)", n: 10, speed: 1.2 });
      glow(c, n.x, n.y, 46 * pulse, "rgba(255,214,102,0.85)");
      c.fillStyle = "#ffd166"; c.strokeStyle = "#fff"; c.lineWidth = 4;
      c.beginPath(); c.arc(n.x, n.y, 17 * pulse, 0, Math.PI * 2); c.fill(); c.stroke();
      if (t.point === 0 && t.strokes.length > 1) label(c, String(t.stroke + 1), n.x, n.y + 1, { size: 22, color: "#2b2d42", shadow: false, weight: 800 });
    }
    c.restore();
  };

  g.draw = (c) => {
    const tm = ctx.anim;
    spec.background(c, tm, ctx.levelIndex);
    const it = item();
    if (g.state !== "pop") {
      drawGlyph(c);
      if (g.state === "count") spec.drawCount(c, ctx, g, it);
      // the moving hand or finger: a magic star with sparks behind it
      sparks.draw(c);
      if (g.cursor) {
        const p = g.pen || g.cursor;
        starCursor(c, p.x, p.y, ctx.anim, HAND_COLOR[g.cursor.hand] || HAND_COLOR.any);
      }
    }
    spec.drawExtra && spec.drawExtra(c, ctx, g, it);
    // progress dots
    const n = items.length, x0 = W / 2 - ((n - 1) * 34) / 2;
    for (let k = 0; k < n; k++) {
      const r = g.results[k];
      const now = !r && k === g.i;
      c.fillStyle = r ? (r.done ? "#06d6a0" : "rgba(255,255,255,0.35)") : now ? "#ffd166" : "rgba(255,255,255,0.6)";
      c.beginPath(); c.arc(x0 + k * 34, 690, now ? 12 + Math.sin(ctx.anim * 5) * 2 : 10, 0, Math.PI * 2); c.fill();
    }
    vignette(c, 0.14);
    if (g.state === "pop") {
      // the reward: the character grows, and its picture springs up beside the word
      const T = g.stateT, m = ctx.reduced ? 0 : 1;
      const s = ctx.reduced ? 1 : spring(T);
      const fade = T > POP_SEC - 0.35 ? clamp((POP_SEC - T) / 0.35, 0, 1) : 1;
      c.save(); c.globalAlpha = fade;
      const veil = c.createRadialGradient(W / 2, 330, 80, W / 2, 330, 800);
      veil.addColorStop(0, "rgba(90,40,160,0.55)"); veil.addColorStop(1, "rgba(15,18,60,0.8)");
      c.fillStyle = veil; c.fillRect(0, 0, W, H);
      if (m) {
        rays(c, W / 2, 330, 900, T, { color: "rgba(255,226,130,0.2)", n: 16, speed: 0.5 });
        for (let q = 0; q < 12; q++) { const a = T * 0.9 + (q * Math.PI) / 6; sparkle(c, W / 2 + Math.cos(a) * 470, 330 + Math.sin(a) * 285, 11 + Math.sin(T * 6 + q) * 5, q % 2 ? "#ffd166" : "#fff", a * 2); }
      }
      c.translate(W / 2, 330 + (m ? Math.sin(T * 2.4) * 5 : 0)); c.scale(s, s);
      c.shadowColor = "rgba(0,0,0,0.35)"; c.shadowBlur = 34; c.shadowOffsetY = 10;
      const face = c.createLinearGradient(0, -230, 0, 230);
      face.addColorStop(0, "#ffffff"); face.addColorStop(1, "#fff4d6");
      c.fillStyle = face; rr(c, -390, -230, 780, 460, 44); c.fill(); c.shadowBlur = 0; c.shadowOffsetY = 0;
      c.lineWidth = 8; c.strokeStyle = spec.colors.ink; rr(c, -378, -218, 756, 436, 36); c.stroke();
      const letterS = m ? 0.92 + 0.14 * spring(Math.max(0, T - 0.15), 0.4) + Math.sin(T * 5) * 0.025 : 1;
      const pics = it.pics || [it.emoji];
      if (pics.length === 1) {
        c.save(); c.translate(-190, -20); c.scale(letterS, letterS); c.rotate(m ? Math.sin(T * 3) * 0.03 : 0);
        label(c, it.big ?? String(it.ch), 0, 0, { size: 230, color: spec.colors.ink, shadow: false, weight: 800 });
        c.restore();
        // the picture springs in after the letter, then keeps dancing
        const ps = m ? spring(Math.max(0, T - 0.3), 0.45) : 1;
        c.save(); c.translate(180, -30 + (m ? Math.sin(T * 4) * 9 : 0)); c.scale(ps, ps); c.rotate(m ? Math.sin(T * 2.6) * 0.1 : 0);
        emoji(c, pics[0], 0, 0, 200);
        c.restore();
      } else {
        c.save(); c.translate(0, -120); c.scale(letterS, letterS);
        label(c, it.big ?? String(it.ch), 0, 0, { size: 130, color: spec.colors.ink, shadow: false, weight: 800 });
        c.restore();
        const cols = Math.min(5, pics.length), size = 62;
        pics.forEach((p, q) => {
          const row = Math.floor(q / 5), inRow = row === 0 ? cols : pics.length - 5;
          // the pictures pop in one by one, as if being counted
          const ps = m ? spring(Math.max(0, T - 0.25 - q * 0.13), 0.35) : 1;
          c.save(); c.translate((q % 5 - (inRow - 1) / 2) * (size + 20), 20 + row * (size + 14) + (m ? Math.sin(T * 4 + q) * 4 : 0)); c.scale(ps, ps);
          emoji(c, p, 0, 0, size);
          c.restore();
        });
      }
      const ts = m ? spring(Math.max(0, T - 0.45), 0.4) : 1;
      c.translate(0, 170); c.scale(ts, ts);
      label(c, it.text, 0, 0, { size: 54, color: "#2b2d42", shadow: false, weight: 700 });
      c.restore();
    } else if (g.hintT > 0 && g.hint) label(c, g.hint, W / 2, 80, { size: 34, weight: 700 });
    else if (g.state === "trace") label(c, g.cursor ? ctx.t(g.tracer && g.tracer.point === 0 ? "goToDot" : "followLine") : ctx.t(sensors ? spec.showKey : "dragLine"), W / 2, 80, { size: 34, weight: 700 });
  };

  g.hud = () => ({ progress: `${ctx.t(spec.unitKey)} ${g.results.filter((r) => r.done).length}/${items.length}` });

  g.result = () => {
    const done = g.results.filter((r) => r.done);
    const traced = done.filter((r) => r.efficiency != null);
    const avg = (list, f) => (list.length ? Math.round(list.reduce((a, r) => a + f(r), 0) / list.length) : null);
    const handT = g.hands.left + g.hands.right;
    const sens = ctx.mode === "sensors";
    return {
      completed: g.results.length >= items.length,
      score: scoreTrace(g.results, items.length),
      settings: { items: items.map((it) => it.label || String(it.ch)), tolerance_px: L.tolerance, movement_gain: L.gain },
      metrics: {
        items_total: items.length,
        items_done: done.length,
        tracing_accuracy_pct: sens && traced.length ? avg(traced, (r) => r.accuracy) : null,
        path_efficiency_pct: sens && traced.length ? avg(traced, (r) => r.efficiency) : null,
        avg_time_sec: done.length ? Math.round((done.reduce((a, r) => a + r.time_sec, 0) / done.length) * 10) / 10 : null,
        left_hand_pct: sens && handT > 1 ? Math.round((g.hands.left / handT) * 100) : null,
        finger: L.finger != null && sens ? spec.fingerName(L.finger) : undefined,
        finger_isolation_pct: L.finger != null && sens && g.activeT > 1 ? Math.round((g.isolatedT / g.activeT) * 100) : undefined,
        other_finger_or_hand_pct: L.finger != null && sens && g.activeT > 1 ? Math.round(((g.otherT || 0) / g.activeT) * 100) : undefined,
        final_tolerance_px: Math.round(g.tolerance),
        movement_gain: L.gain,
        needs_practice: g.results.filter((r) => !r.done).map((r) => r.item),
        items: g.results,
      },
      summary: [
        { label: ctx.t(spec.unitKey), value: `${done.length}/${items.length}` },
        ...(sens && traced.length ? [{ label: ctx.t("accuracy"), value: `${avg(traced, (r) => r.accuracy)}%` }, { label: ctx.t("smoothness"), value: `${avg(traced, (r) => r.efficiency)}%` }] : []),
      ],
    };
  };

  return g;
}
