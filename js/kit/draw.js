// Small drawing toolkit. All game art is drawn in code (no image files), in a layered
// "paper cut-out" style: flat shapes, soft shadows, and parallax hills.

export const W = 1280;
export const H = 720;

export const ease = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;

// Seeded random so scenes look the same every time.
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rr(c, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rad, y);
  c.arcTo(x + w, y, x + w, y + h, rad);
  c.arcTo(x + w, y + h, x, y + h, rad);
  c.arcTo(x, y + h, x, y, rad);
  c.arcTo(x, y, x + w, y, rad);
  c.closePath();
}

export function sky(c, top, bottom) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
}

// Paper cut-out hill layer. `offset` scrolls it (parallax).
export function hills(c, { y, amp, color, seed = 1, offset = 0, shadow = true, bumps = 5 }) {
  const r = rng(seed);
  const pts = [];
  for (let i = 0; i <= bumps; i++) pts.push({ a: amp * (0.5 + r() * 0.5), p: r() * Math.PI * 2 });
  c.save();
  if (shadow) { c.shadowColor = "rgba(20,20,40,0.18)"; c.shadowBlur = 18; c.shadowOffsetY = -4; }
  // lit from above: the crest is lighter than the foot of the hill
  const g = c.createLinearGradient(0, y - amp, 0, H);
  try { g.addColorStop(0, `color-mix(in srgb, ${color} 72%, white)`); } catch { g.addColorStop(0, color); }
  g.addColorStop(0.45, color);
  c.fillStyle = color;
  try { g.addColorStop(1, `color-mix(in srgb, ${color} 82%, black)`); c.fillStyle = g; } catch { /* older browser: flat colour */ }
  c.beginPath();
  c.moveTo(0, H);
  for (let x = 0; x <= W; x += 16) {
    let yy = y;
    const xx = x + offset;
    for (let i = 0; i < pts.length; i++) yy -= pts[i].a * 0.35 * Math.sin((xx / W) * Math.PI * (i + 1) * 0.9 + pts[i].p);
    c.lineTo(x, yy);
  }
  c.lineTo(W, H);
  c.closePath();
  c.fill();
  c.restore();
}

export function cloud(c, x, y, s = 1, color = "rgba(255,255,255,0.9)") {
  c.save();
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, 34 * s, 0, Math.PI * 2);
  c.arc(x + 38 * s, y - 14 * s, 40 * s, 0, Math.PI * 2);
  c.arc(x + 80 * s, y, 30 * s, 0, Math.PI * 2);
  c.rect(x, y, 80 * s, 30 * s);
  c.fill();
  c.restore();
}

export function star(c, x, y, r, color = "#ffd166", rot = 0) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.fillStyle = color;
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.45 : r;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    c.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  c.closePath();
  c.fill();
  c.restore();
}

export function glow(c, x, y, r, color) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  // fade to the same colour with no opacity: fading to white looks grey on a dark sky
  g.addColorStop(1, color.replace(/,\s*[\d.]+\)$/, ",0)"));
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

export function label(c, text, x, y, { size = 36, color = "#fff", align = "center", weight = 700, shadow = true, font = "Baloo 2" } = {}) {
  c.save();
  c.font = `${weight} ${size}px "${font}", "Noto Nastaliq Urdu", "Trebuchet MS", system-ui, sans-serif`;
  c.textAlign = align;
  c.textBaseline = "middle";
  if (shadow) { c.shadowColor = "rgba(0,0,0,0.25)"; c.shadowBlur = 8; c.shadowOffsetY = 3; }
  c.fillStyle = color;
  c.fillText(text, x, y);
  c.restore();
}

// Ring meter, used for "hold" progress.
export function ring(c, x, y, r, t, { color = "#ffd166", track = "rgba(255,255,255,0.25)", width = 12 } = {}) {
  c.save();
  c.lineCap = "round";
  c.lineWidth = width;
  c.strokeStyle = track;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = color;
  c.beginPath(); c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(t, 0, 1)); c.stroke();
  c.restore();
}

// Simple particle system for celebrations.
export class Particles {
  // reduced: fewer, slower particles for "Less movement on screen".
  constructor({ reduced = false } = {}) { this.list = []; this.texts = []; this.rings = []; this.reduced = reduced; }
  burst(x, y, { n = 18, colors = ["#ffd166", "#06d6a0", "#ef476f", "#4cc9f0"], speed = 260, life = 0.9, size = 7, gravity = 380 } = {}) {
    if (this.reduced) { n = Math.ceil(n / 4); speed *= 0.4; }
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life, max: life, size: size * (0.6 + Math.random() * 0.8), color: colors[i % colors.length], g: gravity, rot: Math.random() * 6, shape: i % 3 });
    }
  }
  // An expanding ring of light: the moment something good happens.
  ring(x, y, { color = "rgba(255,255,255,0.9)", r = 120, life = 0.55 } = {}) { if (!this.reduced) this.rings.push({ x, y, color, r, life, max: life }); }
  // Paper falling from the top of the screen, for the end of a level.
  confetti(n = 70) {
    if (this.reduced) n = Math.ceil(n / 5);
    const colors = ["#ffd166", "#06d6a0", "#ef476f", "#4cc9f0", "#c77dff", "#ff9f1c"];
    for (let i = 0; i < n; i++) {
      const life = 2.2 + Math.random() * 1.2;
      this.list.push({ x: Math.random() * W, y: -20 - Math.random() * 260, vx: (Math.random() - 0.5) * 70, vy: 120 + Math.random() * 130, life, max: life, size: 10 + Math.random() * 7, color: colors[i % colors.length], g: 30, rot: Math.random() * 6, shape: 0 });
    }
  }
  text(str, x, y, color = "#fff") { this.texts.push({ str, x, y, life: 1.1, max: 1.1, color }); }
  update(dt) {
    for (const p of this.list) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 6; }
    this.list = this.list.filter((p) => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y -= 50 * dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
  }
  draw(c) {
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      c.save(); c.globalAlpha = 1 - k; c.strokeStyle = r.color; c.lineWidth = 14 * (1 - k) + 2;
      c.beginPath(); c.arc(r.x, r.y, r.r * ease.out(k), 0, Math.PI * 2); c.stroke(); c.restore();
    }
    for (const p of this.list) {
      c.save();
      c.globalAlpha = clamp(p.life / p.max, 0, 1);
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.fillStyle = p.color;
      if (p.shape === 1) { star(c, 0, 0, p.size * 0.75, p.color); }
      else if (p.shape === 2) { c.beginPath(); c.arc(0, 0, p.size * 0.42, 0, Math.PI * 2); c.fill(); }
      else { c.scale(1, Math.abs(Math.cos(p.rot * 1.4)) * 0.8 + 0.2); c.fillRect(-p.size / 2, -p.size / 3, p.size, (p.size * 2) / 3); }
      c.restore();
    }
    for (const t of this.texts) {
      // the word of praise jumps out, then floats up and fades
      const age = t.max - t.life, s = this.reduced ? 1 : 0.5 + 0.5 * ease.back(clamp(age / 0.28, 0, 1));
      c.save();
      c.globalAlpha = clamp(t.life * 2, 0, 1);
      c.translate(t.x, t.y); c.scale(s, s);
      label(c, t.str, 0, 0, { size: 42, color: t.color, weight: 800 });
      c.restore();
    }
  }
}

// The LinguaLink Play guide character, "Lumi": a small round light with a face.
export function lumi(c, x, y, s = 1, { mood = "happy", t = 0, color = "#ffd166" } = {}) {
  const bob = Math.sin(t * 3) * 5 * s;
  const squash = 1 + Math.sin(t * 6) * 0.025;
  const blink = t > 0 && Math.sin(t * 1.1) > 0.985 ? 0.12 : 1;
  c.save();
  c.translate(x, y + bob);
  glow(c, 0, 0, (74 + Math.sin(t * 2.4) * 8) * s, "rgba(255,220,120,0.5)");
  // little lights circling Lumi
  for (let i = 0; i < 3; i++) {
    const a = t * 1.5 + (i * Math.PI * 2) / 3;
    c.fillStyle = "rgba(255,255,255,0.9)";
    c.beginPath(); c.arc(Math.cos(a) * 50 * s, Math.sin(a) * 18 * s - 4 * s, (2.5 + Math.sin(t * 4 + i)) * s, 0, Math.PI * 2); c.fill();
  }
  c.scale(1 / squash, squash);
  const body = c.createRadialGradient(-11 * s, -13 * s, 3 * s, 0, 0, 36 * s);
  body.addColorStop(0, "#fff3b0"); body.addColorStop(1, color);
  c.fillStyle = body;
  c.beginPath(); c.arc(0, 0, 34 * s, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#2b2d42";
  c.beginPath(); c.ellipse(-11 * s, -6 * s, 4.5 * s, 4.5 * s * blink, 0, 0, Math.PI * 2); c.ellipse(11 * s, -6 * s, 4.5 * s, 4.5 * s * blink, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "#2b2d42"; c.lineWidth = 3.5 * s; c.lineCap = "round";
  c.beginPath();
  if (mood === "wow") c.arc(0, 10 * s, 6 * s, 0, Math.PI * 2);
  else c.arc(0, 6 * s, 10 * s, 0.15 * Math.PI, 0.85 * Math.PI);
  c.stroke();
  c.fillStyle = "rgba(239,71,111,0.45)";
  c.beginPath(); c.arc(-20 * s, 6 * s, 5 * s, 0, Math.PI * 2); c.arc(20 * s, 6 * s, 5 * s, 0, Math.PI * 2); c.fill();
  c.restore();
}

// Soft dark edge around a scene, to give the flat art some depth.
// Draw an emoji as a picture.
export function emoji(c, text, x, y, size) {
  c.save();
  c.font = `${Math.round(size)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = "#000";
  c.fillText(text, x, y);
  c.restore();
}

export function vignette(c, strength = 0.28) {
  const g = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(10,12,40,${strength})`);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
}
