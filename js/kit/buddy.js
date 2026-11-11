// Buddy: the child's on-screen character in Animal Moves, a round little kid in an animal costume.
// The same drawing follows the child's body from the camera and shows each pose on the cue card.
// Joints: head, ls/rs shoulders, le/re elbows, lw/rw wrists, lh/rh hips, lk/rk knees, la/ra ankles,
// all in screen pixels, plus s: how many pixels one unit is (a shoulder width is 34 units).
import { clamp, lerp, glow } from "./draw.js";

const TAU = Math.PI * 2;

export const COSTUMES = {
  reach: { body: "#ffc93c", dark: "#d9901a", belly: "#fff1c1", kind: "giraffe" },
  wings: { body: "#4cc9f0", dark: "#2387c7", belly: "#e0f7ff", kind: "bird" },
  leanLeft: { body: "#9b6a43", dark: "#6f4a2b", belly: "#c9a27c", kind: "palm" },
  leanRight: { body: "#9b6a43", dark: "#6f4a2b", belly: "#c9a27c", kind: "palm" },
  squat: { body: "#8ad13c", dark: "#5a9a1f", belly: "#e7f9c8", kind: "frog" },
  standLeft: { body: "#ff8fb5", dark: "#e0558a", belly: "#ffe0ec", kind: "flamingo" },
  standRight: { body: "#ff8fb5", dark: "#e0558a", belly: "#ffe0ec", kind: "flamingo" },
};

// ---------- the poses, in units around the middle of the body (y goes down) ----------
const STAND = { head: [0, -66], ls: [-17, -40], rs: [17, -40], le: [-25, -18], re: [25, -18], lw: [-27, 6], rw: [27, 6], lh: [-11, 10], rh: [11, 10], lk: [-12, 38], rk: [12, 38], la: [-13, 68], ra: [13, 68] };
const POSES = {
  reach: { le: [-24, -62], re: [24, -62], lw: [-26, -90], rw: [26, -90], head: [0, -68] },
  wings: { le: [-42, -41], re: [42, -41], lw: [-68, -44], rw: [68, -44] },
  leanLeft: { head: [-22, -60], ls: [-30, -34], rs: [3, -42], le: [-40, -12], lw: [-42, 12], re: [-6, -66], rw: [-26, -88] },
  leanRight: { head: [22, -60], ls: [-3, -42], rs: [30, -34], re: [40, -12], rw: [42, 12], le: [6, -66], lw: [26, -88] },
  squat: { head: [0, -38], ls: [-17, -12], rs: [17, -12], le: [-36, -8], re: [36, -8], lw: [-40, 16], rw: [40, 16], lh: [-13, 36], rh: [13, 36], lk: [-36, 42], rk: [36, 42], la: [-24, 68], ra: [24, 68] },
  standLeft: { le: [-40, -28], re: [40, -28], lw: [-62, -22], rw: [62, -22], lk: [-26, 22], la: [-8, 42] },
  standRight: { le: [-40, -28], re: [40, -28], lw: [-62, -22], rw: [62, -22], rk: [26, 22], ra: [8, 42] },
};

// The joints for a pose. k: 0 standing .. 1 in the pose, so the card can show the movement.
export function poseJoints(move, x, y, s, k = 1) {
  const target = POSES[move] || {};
  const out = { s };
  for (const name of Object.keys(STAND)) {
    const a = STAND[name], b = target[name] || a;
    out[name] = { x: x + lerp(a[0], b[0], k) * s, y: y + lerp(a[1], b[1], k) * s };
  }
  return out;
}

const POINT = { head: 0, ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16, lh: 23, rh: 24, lk: 25, rk: 26, la: 27, ra: 28 };
const SEEN = 0.4;

// The joints from the camera. Anything the camera cannot see (feet are often out of view) is filled
// in from the standing shape, so the character is always whole. Returns null without shoulders and hips.
export function jointsFromPose(pose, ox, oy, sc, camAspect = 4 / 3) {
  if (!pose || !pose.present || !pose.points || pose.points.length < 29) return null;
  const P = pose.points;
  const at = (name) => { const p = P[POINT[name]]; return p && p.v >= SEEN ? { x: ox + (p.x - 0.5) * sc * camAspect, y: oy + (p.y - 0.5) * sc } : null; };
  const ls = at("ls"), rs = at("rs"), lh = at("lh"), rh = at("rh");
  if (!ls || !rs || !lh || !rh) return null;
  const s = clamp(Math.hypot(ls.x - rs.x, ls.y - rs.y) / 34, 1.2, 7);
  const out = { s, ls, rs, lh, rh };
  const under = (from, dx, dy) => ({ x: from.x + dx * s, y: from.y + dy * s });
  out.le = at("le") || under(ls, -8, 22);
  out.re = at("re") || under(rs, 8, 22);
  out.lw = at("lw") || under(out.le, -2, 24);
  out.rw = at("rw") || under(out.re, 2, 24);
  out.lk = at("lk") || under(lh, -1, 28);
  out.rk = at("rk") || under(rh, 1, 28);
  out.la = at("la") || under(out.lk, -1, 30);
  out.ra = at("ra") || under(out.rk, 1, 30);
  const nose = at("head"), mid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  out.head = nose ? { x: nose.x, y: Math.min(nose.y - 4 * s, mid.y - 16 * s) } : under(mid, 0, -26);
  return out;
}

// Follows the camera softly, so the character does not shake.
export function smoothJoints(prev, next, k = 0.45) {
  if (!prev) return next;
  const out = { s: lerp(prev.s, next.s, k) };
  for (const name of Object.keys(STAND)) out[name] = { x: lerp(prev[name].x, next[name].x, k), y: lerp(prev[name].y, next[name].y, k) };
  return out;
}

// ---------- drawing ----------
function limb(c, a, b, d, width, color, dark, s) {
  // a soft outline, then the colour, then a highlight, with a bend at the joint
  const path = () => { c.beginPath(); c.moveTo(a.x, a.y); c.quadraticCurveTo(b.x, b.y, b.x, b.y); c.lineTo(d.x, d.y); };
  c.lineCap = "round"; c.lineJoin = "round";
  c.strokeStyle = dark; c.lineWidth = width + 3 * s; path(); c.stroke();
  c.strokeStyle = color; c.lineWidth = width; path(); c.stroke();
  c.strokeStyle = "rgba(255,255,255,0.22)"; c.lineWidth = width * 0.26;
  c.beginPath(); c.moveTo(a.x - width * 0.16, a.y - width * 0.1); c.lineTo(b.x - width * 0.16, b.y - width * 0.1); c.lineTo(d.x - width * 0.16, d.y - width * 0.1); c.stroke();
}

function ball(c, x, y, r, color, dark, lineW) {
  c.fillStyle = color; c.strokeStyle = dark; c.lineWidth = lineW;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.stroke();
}

function feathers(c, a, b, color, s) {
  // a row of feathers hanging under the arm
  c.fillStyle = color;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, x = lerp(a.x, b.x, u), y = lerp(a.y, b.y, u);
    c.beginPath(); c.ellipse(x, y + 8 * s, 4.6 * s, 10 * s, 0, 0, TAU); c.fill();
  }
}

function headTop(c, kind, x, y, r, t, co, s) {
  c.lineCap = "round";
  if (kind === "giraffe") {
    c.strokeStyle = co.dark; c.lineWidth = 3.2 * s;
    for (const side of [-1, 1]) {
      c.beginPath(); c.moveTo(x + side * r * 0.42, y - r * 0.8); c.lineTo(x + side * r * 0.52, y - r * 1.3); c.stroke();
      c.fillStyle = "#8a5a2b"; c.beginPath(); c.arc(x + side * r * 0.52, y - r * 1.36, 3.2 * s, 0, TAU); c.fill();
      c.fillStyle = co.body; c.strokeStyle = co.dark; c.beginPath(); c.ellipse(x + side * r * 1.02, y - r * 0.5, 7.5 * s, 4.2 * s, side * 0.5, 0, TAU); c.fill(); c.stroke();
    }
  } else if (kind === "bird") {
    c.fillStyle = co.dark;
    for (let i = -1; i <= 1; i++) { c.beginPath(); c.ellipse(x + i * r * 0.28, y - r * 1.04, 3.2 * s, 7.5 * s, i * 0.5 + Math.sin(t * 3 + i) * 0.1, 0, TAU); c.fill(); }
  } else if (kind === "palm") {
    // a crown of leaves that sways
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI + (i + 0.5) * (Math.PI / 7) + Math.sin(t * 1.6 + i) * 0.07;
      c.save(); c.translate(x, y - r * 0.82); c.rotate(a);
      c.fillStyle = i % 2 ? "#2d9a55" : "#52c47b";
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(r * 0.8, -r * 0.34, r * 1.45, r * 0.1); c.quadraticCurveTo(r * 0.8, r * 0.16, 0, 0); c.fill();
      c.restore();
    }
    c.fillStyle = "#7a4a22"; c.beginPath(); c.arc(x - r * 0.2, y - r * 0.78, 4.2 * s, 0, TAU); c.arc(x + r * 0.2, y - r * 0.78, 4.2 * s, 0, TAU); c.fill();
  } else if (kind === "frog") {
    for (const side of [-1, 1]) ball(c, x + side * r * 0.5, y - r * 0.82, r * 0.42, co.body, co.dark, 2.2 * s);
  } else if (kind === "flamingo") {
    c.fillStyle = co.dark;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(x - r * 0.1 + i * r * 0.14, y - r * 1.02, 3 * s, 8 * s, -0.5 + i * 0.4 + Math.sin(t * 3 + i) * 0.1, 0, TAU); c.fill(); }
  }
}

// mood: "happy" | "wow" | "strive". lit: 0..1, how close the pose is, shown as a glow on the costume.
export function drawBuddy(c, j, move, { t = 0, mood = "happy", lit = 0, shadowY = null } = {}) {
  const co = COSTUMES[move] || COSTUMES.reach, s = j.s;
  const armW = 11 * s, legW = 13 * s, line = 2.4 * s;
  c.save();
  // shadow on the ground
  const groundY = shadowY ?? Math.max(j.la.y, j.ra.y) + 8 * s;
  c.fillStyle = "rgba(30,40,60,0.2)";
  c.beginPath(); c.ellipse((j.lh.x + j.rh.x) / 2, groundY, 34 * s, 7 * s, 0, 0, TAU); c.fill();
  if (lit > 0) glow(c, (j.ls.x + j.rh.x) / 2, (j.ls.y + j.rh.y) / 2, (82 + Math.sin(t * 6) * 5) * s, `rgba(255,255,255,${0.55 * lit})`);

  // legs and feet
  const legColor = co.kind === "flamingo" ? "#ff6fa0" : co.body;
  for (const [hip, knee, ankle, side] of [[j.lh, j.lk, j.la, -1], [j.rh, j.rk, j.ra, 1]]) {
    limb(c, hip, knee, ankle, co.kind === "flamingo" ? legW * 0.72 : legW, legColor, co.dark, s);
    c.fillStyle = co.kind === "frog" ? "#5a9a1f" : co.kind === "flamingo" ? "#e0558a" : "#ffffff"; c.strokeStyle = co.dark; c.lineWidth = line;
    c.beginPath(); c.ellipse(ankle.x + side * 5 * s, ankle.y + 3 * s, 11.5 * s, 6.5 * s, 0, 0, TAU); c.fill(); c.stroke();
  }
  // far arm parts come before the body when wings are out
  if (co.kind === "bird") { feathers(c, j.ls, j.lw, co.dark, s); feathers(c, j.rs, j.rw, co.dark, s); }

  // body: a rounded hoodie from the shoulders to the hips
  const midHx = (j.lh.x + j.rh.x) / 2, midHy = (j.lh.y + j.rh.y) / 2, midSx = (j.ls.x + j.rs.x) / 2, midSy = (j.ls.y + j.rs.y) / 2;
  const grad = c.createLinearGradient(midSx, midSy, midHx, midHy);
  grad.addColorStop(0, co.body); grad.addColorStop(1, co.dark);
  c.fillStyle = grad; c.strokeStyle = co.dark; c.lineWidth = line;
  c.beginPath();
  c.moveTo(j.ls.x - 2 * s, j.ls.y - 2 * s);
  c.quadraticCurveTo(midSx, midSy - 6 * s, j.rs.x + 2 * s, j.rs.y - 2 * s);
  c.quadraticCurveTo(j.rs.x + 7 * s, (j.rs.y + j.rh.y) / 2, j.rh.x + 7 * s, j.rh.y + 3 * s);
  c.quadraticCurveTo(midHx, midHy + 12 * s, j.lh.x - 7 * s, j.lh.y + 3 * s);
  c.quadraticCurveTo(j.ls.x - 7 * s, (j.ls.y + j.lh.y) / 2, j.ls.x - 2 * s, j.ls.y - 2 * s);
  c.closePath(); c.fill(); c.stroke();
  // belly, and the costume's pattern
  const bx = (midSx + midHx) / 2, by = (midSy + midHy) / 2 + 3 * s;
  c.fillStyle = co.belly; c.beginPath(); c.ellipse(bx, by, 12 * s, 17 * s, Math.atan2(midHx - midSx, midHy - midSy) * -1, 0, TAU); c.fill();
  if (co.kind === "giraffe") {
    c.fillStyle = "#b97a33";
    for (const [dx, dy, r] of [[-15, -14, 3.6], [15, -10, 3.2], [-17, 8, 3], [16, 12, 3.8], [0, -3, 3], [-5, 13, 2.6], [7, 2, 2.4]]) { c.beginPath(); c.arc(bx + dx * s, by + dy * s, r * s, 0, TAU); c.fill(); }
  } else if (co.kind === "palm") {
    c.strokeStyle = "rgba(70,40,20,0.45)"; c.lineWidth = 1.8 * s;
    for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(bx - 13 * s, by + i * 8 * s); c.quadraticCurveTo(bx, by + i * 8 * s + 4 * s, bx + 13 * s, by + i * 8 * s); c.stroke(); }
  } else if (co.kind === "frog") {
    c.fillStyle = "#5a9a1f";
    for (const [dx, dy] of [[-16, -8], [16, -5], [-14, 12], [15, 12]]) { c.beginPath(); c.arc(bx + dx * s, by + dy * s, 2.8 * s, 0, TAU); c.fill(); }
  } else if (co.kind === "flamingo" || co.kind === "bird") {
    c.strokeStyle = "rgba(255,255,255,0.75)"; c.lineWidth = 1.9 * s;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(bx, by - 8 * s + i * 8 * s, 6 * s, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
  }

  // arms and hands
  for (const [sh, el, wr] of [[j.ls, j.le, j.lw], [j.rs, j.re, j.rw]]) {
    limb(c, sh, el, wr, armW, co.body, co.dark, s);
    ball(c, wr.x, wr.y, 7.5 * s, co.kind === "palm" ? "#52c47b" : "#ffd9b3", co.dark, line);
  }

  // head
  const hx = j.head.x, hy = j.head.y, r = 22 * s;
  headTop(c, co.kind, hx, hy, r, t, co, s);
  const face = c.createRadialGradient(hx - r * 0.3, hy - r * 0.35, r * 0.1, hx, hy, r);
  face.addColorStop(0, "#ffe9d0"); face.addColorStop(1, "#ffcf9f");
  c.fillStyle = face; c.strokeStyle = co.dark; c.lineWidth = line + 0.6 * s;
  c.beginPath(); c.arc(hx, hy, r, 0, TAU); c.fill(); c.stroke();
  // the costume's hood around the face
  c.strokeStyle = co.body; c.lineWidth = 4.6 * s;
  c.beginPath(); c.arc(hx, hy, r - 1.2 * s, Math.PI * 0.82, Math.PI * 2.18); c.stroke();
  // eyes that blink, and look around a little
  const blink = t > 0 && Math.sin(t * 1.15) > 0.985 ? 0.12 : 1;
  const look = Math.sin(t * 0.7) * 1.2 * s;
  for (const side of [-1, 1]) {
    c.fillStyle = "#fff"; c.beginPath(); c.ellipse(hx + side * r * 0.36, hy - r * 0.07, 6.5 * s, 7.5 * s * blink, 0, 0, TAU); c.fill();
    c.fillStyle = "#2b2d42"; c.beginPath(); c.ellipse(hx + side * r * 0.36 + look, hy - r * 0.05, 4 * s, 5 * s * blink, 0, 0, TAU); c.fill();
    c.fillStyle = "#fff"; c.beginPath(); c.arc(hx + side * r * 0.36 + look - 1.3 * s, hy - r * 0.13, 1.4 * s * blink, 0, TAU); c.fill();
    c.fillStyle = "rgba(239,71,111,0.32)"; c.beginPath(); c.arc(hx + side * r * 0.62, hy + r * 0.28, 4.4 * s, 0, TAU); c.fill();
  }
  // mouth or beak
  if (co.kind === "bird" || co.kind === "flamingo") {
    c.fillStyle = co.kind === "bird" ? "#ffb703" : "#3a2e39";
    c.beginPath(); c.moveTo(hx - 6 * s, hy + r * 0.2); c.quadraticCurveTo(hx, hy + r * 0.72, hx + 6 * s, hy + r * 0.2); c.closePath(); c.fill();
  } else {
    c.strokeStyle = "#7b2d26"; c.lineWidth = 2.4 * s; c.lineCap = "round";
    if (mood === "wow") { c.fillStyle = "#7b2d26"; c.beginPath(); c.ellipse(hx, hy + r * 0.42, 5 * s, 6.5 * s, 0, 0, TAU); c.fill(); }
    else { const w = co.kind === "frog" ? 0.62 : 0.4; c.beginPath(); c.arc(hx, hy + r * 0.2, r * w, 0.14 * Math.PI, 0.86 * Math.PI); c.stroke(); }
  }
  c.restore();
}
