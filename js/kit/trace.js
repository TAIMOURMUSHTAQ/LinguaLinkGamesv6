// Letter and number shapes, and the tracer that follows a hand or finger along them.
// Pure functions, no browser needed (unit tested).
//
// Each character is a list of strokes in the order a child learns to write them. A stroke is a list
// of [x, y] points in a 0..1 box, with y going down.

const line = (...pts) => pts;
// Part of an ellipse. Angles in degrees: 0 right, 90 down, 180 left, -90 up.
function arc(cx, cy, rx, ry, from, to, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

export const GLYPHS = {
  A: [line([0.5, 0], [0.1, 1]), line([0.5, 0], [0.9, 1]), line([0.25, 0.62], [0.75, 0.62])],
  B: [line([0.18, 0], [0.18, 1]), [[0.18, 0], ...arc(0.5, 0.25, 0.3, 0.25, -90, 90), [0.18, 0.5], ...arc(0.52, 0.75, 0.33, 0.25, -90, 90), [0.18, 1]]],
  C: [arc(0.55, 0.5, 0.42, 0.5, -50, -310, 22)],
  D: [line([0.18, 0], [0.18, 1]), [[0.18, 0], ...arc(0.42, 0.5, 0.42, 0.5, -90, 90, 20), [0.18, 1]]],
  E: [line([0.8, 0], [0.2, 0], [0.2, 1], [0.8, 1]), line([0.2, 0.5], [0.7, 0.5])],
  F: [line([0.8, 0], [0.2, 0], [0.2, 1]), line([0.2, 0.5], [0.65, 0.5])],
  G: [[...arc(0.55, 0.5, 0.42, 0.5, -50, -330, 24), [0.86, 0.55], [0.55, 0.55]]],
  H: [line([0.18, 0], [0.18, 1]), line([0.82, 0], [0.82, 1]), line([0.18, 0.5], [0.82, 0.5])],
  I: [line([0.5, 0], [0.5, 1])],
  J: [[[0.7, 0], ...arc(0.42, 0.72, 0.28, 0.28, 0, 180)]],
  K: [line([0.2, 0], [0.2, 1]), line([0.8, 0], [0.2, 0.55]), line([0.38, 0.42], [0.85, 1])],
  L: [line([0.22, 0], [0.22, 1], [0.8, 1])],
  M: [line([0.12, 1], [0.12, 0], [0.5, 0.65], [0.88, 0], [0.88, 1])],
  N: [line([0.18, 1], [0.18, 0], [0.82, 1], [0.82, 0])],
  O: [arc(0.5, 0.5, 0.42, 0.5, -90, -450, 28)],
  P: [line([0.2, 0], [0.2, 1]), [[0.2, 0], ...arc(0.52, 0.27, 0.3, 0.27, -90, 90), [0.2, 0.54]]],
  Q: [arc(0.5, 0.5, 0.42, 0.5, -90, -450, 28), line([0.6, 0.7], [0.92, 1])],
  R: [line([0.2, 0], [0.2, 1]), [[0.2, 0], ...arc(0.52, 0.27, 0.3, 0.27, -90, 90), [0.2, 0.54]], line([0.45, 0.54], [0.85, 1])],
  S: [[...arc(0.5, 0.26, 0.3, 0.26, -30, -270), ...arc(0.5, 0.74, 0.32, 0.26, -90, 150)]],
  T: [line([0.12, 0], [0.88, 0]), line([0.5, 0], [0.5, 1])],
  U: [[[0.18, 0], ...arc(0.5, 0.62, 0.32, 0.38, 180, 0), [0.82, 0]]],
  V: [line([0.12, 0], [0.5, 1], [0.88, 0])],
  W: [line([0.05, 0], [0.28, 1], [0.5, 0.3], [0.72, 1], [0.95, 0])],
  X: [line([0.15, 0], [0.85, 1]), line([0.85, 0], [0.15, 1])],
  Y: [line([0.12, 0], [0.5, 0.5]), line([0.88, 0], [0.5, 0.5], [0.5, 1])],
  Z: [line([0.15, 0], [0.85, 0], [0.15, 1], [0.85, 1])],
  0: [arc(0.5, 0.5, 0.34, 0.5, -90, -450, 28)],
  1: [line([0.32, 0.2], [0.52, 0], [0.52, 1])],
  2: [[...arc(0.5, 0.28, 0.32, 0.28, -160, 40), [0.18, 1], [0.84, 1]]],
  3: [[...arc(0.48, 0.26, 0.3, 0.26, -150, 90), ...arc(0.48, 0.76, 0.34, 0.24, -90, 150)]],
  4: [line([0.62, 0], [0.15, 0.68], [0.88, 0.68]), line([0.62, 0], [0.62, 1])],
  5: [[[0.75, 0], [0.28, 0], [0.24, 0.45], ...arc(0.48, 0.68, 0.32, 0.32, -130, 150)]],
  6: [[[0.72, 0.02], [0.45, 0.18], [0.2, 0.62], ...arc(0.5, 0.68, 0.3, 0.32, 180, -180, 24)]],
  7: [line([0.15, 0], [0.85, 0], [0.4, 1])],
  8: [[...arc(0.5, 0.25, 0.27, 0.25, -45, -270), ...arc(0.5, 0.75, 0.32, 0.25, -90, 270, 24), ...arc(0.5, 0.25, 0.27, 0.25, 90, -45)]],
  9: [[...arc(0.5, 0.3, 0.3, 0.3, 0, -360, 22), [0.72, 1]]],
};
// "10" is the 1 and the 0 side by side.
const squeeze = (strokes, x0, w) => strokes.map((s) => s.map(([x, y]) => [x0 + x * w, y]));
GLYPHS[10] = [...squeeze(GLYPHS[1], 0, 0.45), ...squeeze(GLYPHS[0], 0.45, 0.55)];

// Spaced points along a polyline, every `spacing` pixels.
export function resample(points, spacing) {
  const out = [{ x: points[0][0], y: points[0][1] }];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    let [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    let len = Math.hypot(bx - ax, by - ay);
    while (carry + len >= spacing) {
      const k = (spacing - carry) / len;
      ax += (bx - ax) * k; ay += (by - ay) * k;
      out.push({ x: ax, y: ay });
      len = Math.hypot(bx - ax, by - ay);
      carry = 0;
    }
    carry += len;
  }
  const [lx, ly] = points[points.length - 1];
  const last = out[out.length - 1];
  if (Math.hypot(lx - last.x, ly - last.y) > spacing * 0.3) out.push({ x: lx, y: ly });
  return out;
}

// Pixels for a character inside a box. Characters keep a child-friendly shape: narrower than tall.
export function strokesInBox(ch, box) {
  const glyph = GLYPHS[ch];
  if (!glyph) throw new Error(`no shape for ${ch}`);
  return glyph.map((s) => s.map(([x, y]) => [box.x + x * box.w, box.y + y * box.h]));
}

// Removes camera shake without making the hand feel slow (the "1 Euro" filter): a slow hand is
// smoothed a lot, so wobble goes away, and a fast hand hardly at all, so nothing lags behind.
export class OneEuro {
  constructor({ minCutoff = 1.5, beta = 0.012, dCutoff = 1 } = {}) { Object.assign(this, { minCutoff, beta, dCutoff }); this.reset(); }
  reset() { this.x = null; this.dx = 0; }
  static alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  next(value, dt) {
    if (this.x == null || dt <= 0) { this.x = value; this.dx = 0; return value; }
    const d = (value - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (d - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}

// Follows a cursor along a character, stroke by stroke. The child must reach each point in order;
// a slip off the path never loses ground, it just waits for them to come back.
export class Tracer {
  constructor(ch, box, { tolerance = 70, spacing = 28 } = {}) {
    this.ch = ch;
    this.tolerance = tolerance;
    this.strokes = strokesInBox(ch, box).map((s) => resample(s, spacing));
    this.stroke = 0;       // current stroke
    this.point = 0;        // next point on it (0 means the child has not reached the start yet)
    this.done = false;
    this.devSum = 0;       // distance from the path while tracing
    this.devN = 0;
    this.moved = 0;        // how far the cursor really travelled while tracing
    this.ideal = 0;        // how far the path is
    this.last = null;
    for (const s of this.strokes) for (let i = 1; i < s.length; i++) this.ideal += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
  }

  get total() { return this.strokes.reduce((a, s) => a + s.length, 0); }
  get reached() { return this.strokes.slice(0, this.stroke).reduce((a, s) => a + s.length, 0) + this.point; }
  get progress() { return this.done ? 1 : this.reached / this.total; }
  get next() { return this.done ? null : this.strokes[this.stroke][this.point]; }
  get tracing() { return !this.done && this.point > 0; }

  // Feed the cursor position. Returns "start", "stroke", "done" or null, for sounds and sparkles.
  update(x, y) {
    if (this.done) return null;
    const pts = this.strokes[this.stroke];
    let event = null;
    const near = (p, r) => Math.hypot(p.x - x, p.y - y) <= r;
    if (this.point === 0) {
      if (near(pts[0], this.tolerance * 1.2)) { this.point = 1; event = "start"; this.last = { x, y }; }
      return event;
    }
    // while tracing: how far off the path, and how far the hand really moved
    let best = Infinity;
    const a = Math.max(0, this.point - 2), b = Math.min(pts.length - 1, this.point + 2);
    for (let i = a; i <= b; i++) best = Math.min(best, Math.hypot(pts[i].x - x, pts[i].y - y));
    this.devSum += best; this.devN++;
    if (this.last) this.moved += Math.hypot(x - this.last.x, y - this.last.y);
    this.last = { x, y };
    // advance to the furthest of the next few points in reach
    let reached = -1;
    for (let i = this.point; i < Math.min(pts.length, this.point + 4); i++) if (near(pts[i], this.tolerance)) reached = i;
    if (reached >= 0) this.point = reached + 1;
    if (this.point >= pts.length) {
      this.stroke++;
      this.point = 0;
      if (this.stroke >= this.strokes.length) { this.done = true; return "done"; }
      return "stroke";
    }
    return null;
  }

  // Like update, for a hand that may have moved far since the last camera frame: walks the way
  // there in small steps, so a quick stroke along the line is not lost between frames.
  follow(x, y) {
    if (this.done) return null;
    const from = this.last;
    const dist = from ? Math.hypot(x - from.x, y - from.y) : 0;
    const steps = from && this.point > 0 ? Math.min(12, Math.ceil(dist / (this.tolerance * 0.5))) : 1;
    let event = null;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps, before = this.stroke;
      const ev = steps === 1 ? this.update(x, y) : this.update(from.x + (x - from.x) * k, from.y + (y - from.y) * k);
      if (ev) event = ev;
      // a finished stroke ends the walk: the next stroke starts from its own first point
      if (this.done || this.stroke !== before) break;
    }
    return event;
  }

  // Where the pen is along the current stroke, for drawing the ink right up to the hand.
  nearest(x, y) {
    const pts = this.strokes[this.stroke];
    if (!pts || this.point === 0) return null;
    let best = null, bd = Infinity;
    for (let i = Math.max(0, this.point - 2); i < Math.min(pts.length, this.point + 3); i++) {
      const d = Math.hypot(pts[i].x - x, pts[i].y - y);
      if (d < bd) { bd = d; best = pts[i]; }
    }
    return best ? { ...best, d: bd } : null;
  }

  // 100 when the cursor stayed right on the path, 0 at the edge of the allowed distance.
  accuracy() {
    if (!this.devN) return 0;
    return Math.round(Math.max(0, Math.min(1, 1 - this.devSum / this.devN / this.tolerance)) * 100);
  }

  // 100 when the hand took the direct way; lower when it wandered or shook.
  efficiency() {
    if (!this.moved) return 0;
    return Math.round(Math.min(1, this.ideal / this.moved) * 100);
  }
}

// Score for a tracing session: every item counts, so stopping early cannot give a high score.
// A finished item is worth 60 points, plus up to 40 for accuracy.
export function scoreTrace(results, total) {
  if (!total) return 0;
  const sum = results.reduce((a, r) => a + (r.done ? 60 + (r.accuracy || 0) * 0.4 : 0), 0);
  return Math.max(0, Math.min(100, Math.round(sum / total)));
}
