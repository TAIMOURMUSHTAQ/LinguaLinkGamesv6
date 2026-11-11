// Living scenery shared by the games: everything moves a little, all the time. Every function takes
// the scenery time t, which stands still when "Less movement on screen" is on. All art is drawn in
// code. No blur or filters per frame, so low-end tablets keep their frame rate.
import { W, H, clamp, lerp, rng, rr, glow, ease } from "./draw.js";

const TAU = Math.PI * 2;

// Rays turning around a point. Used behind suns and rewards.
export function rays(c, x, y, r, t, { color = "rgba(255,255,255,0.25)", n = 12, width = 0.5, speed = 0.15, inner = 0 } = {}) {
  c.save(); c.translate(x, y); c.rotate(t * speed); c.fillStyle = color;
  const step = TAU / n;
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const a = i * step;
    c.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    c.lineTo(Math.cos(a - step * width * 0.5) * r, Math.sin(a - step * width * 0.5) * r);
    c.lineTo(Math.cos(a + step * width * 0.5) * r, Math.sin(a + step * width * 0.5) * r);
    c.closePath();
  }
  c.fill(); c.restore();
}

// A smiling sun that breathes and turns its rays.
export function sun(c, x, y, r, t, { color = "#ffd166", face = true } = {}) {
  const b = 1 + Math.sin(t * 1.6) * 0.04;
  glow(c, x, y, r * 3, "rgba(255,226,130,0.55)");
  rays(c, x, y, r * 1.75 * b, t, { color: "rgba(255,209,102,0.55)", n: 14, width: 0.55, speed: 0.22 });
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, "#fff3b0"); g.addColorStop(1, color);
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r * b, 0, TAU); c.fill();
  if (!face) return;
  const blink = t > 0 && Math.sin(t * 0.9) > 0.985 ? 0.15 : 1;
  c.fillStyle = "#6b4a1e";
  c.beginPath(); c.ellipse(x - r * 0.32, y - r * 0.12, r * 0.09, r * 0.11 * blink, 0, 0, TAU); c.ellipse(x + r * 0.32, y - r * 0.12, r * 0.09, r * 0.11 * blink, 0, 0, TAU); c.fill();
  c.strokeStyle = "#6b4a1e"; c.lineWidth = Math.max(2, r * 0.07); c.lineCap = "round";
  c.beginPath(); c.arc(x, y + r * 0.1, r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
  c.fillStyle = "rgba(239,71,111,0.35)";
  c.beginPath(); c.arc(x - r * 0.58, y + r * 0.2, r * 0.13, 0, TAU); c.arc(x + r * 0.58, y + r * 0.2, r * 0.13, 0, TAU); c.fill();
}

// A soft, rounded cloud with a shaded underside, gently changing shape.
export function puff(c, x, y, s, t = 0, { top = "#ffffff", under = "#dbe7ff", alpha = 0.95 } = {}) {
  c.save(); c.globalAlpha = alpha; c.translate(x, y); c.scale(s, s);
  const g = c.createLinearGradient(0, -46, 0, 34);
  g.addColorStop(0, top); g.addColorStop(1, under);
  c.fillStyle = g;
  const w = Math.sin(t * 0.8 + x * 0.01) * 2.5;
  c.beginPath();
  c.arc(-58, 6, 24 + w * 0.4, 0, TAU);
  c.arc(-24, -14, 34 - w * 0.5, 0, TAU);
  c.arc(22, -22, 40 + w * 0.6, 0, TAU);
  c.arc(62, 2, 28 - w * 0.3, 0, TAU);
  c.rect(-58, 2, 120, 28);
  c.arc(-58, 16, 14, 0, TAU);
  c.arc(62, 16, 14, 0, TAU);
  c.fill(); c.restore();
}

export function cloudLayer(c, t, { n = 4, y = 90, gap = 60, speed = 16, scale = 1, seed = 1, ...look } = {}) {
  const r = rng(seed), span = W + 400;
  for (let i = 0; i < n; i++) {
    const x0 = r() * span, yy = y + r() * gap, sc = scale * (0.7 + r() * 0.5);
    const x = ((x0 + t * speed * (0.7 + sc * 0.3)) % span) - 200;
    puff(c, x, yy, sc, t, look);
  }
}

// Far-away birds crossing the sky in a loose V.
export function flock(c, t, { y = 150, speed = 40, n = 6, seed = 3, color = "rgba(43,45,66,0.55)", s = 1 } = {}) {
  const r = rng(seed), span = W + 500, lead = ((t * speed + r() * span) % span) - 250;
  c.save(); c.strokeStyle = color; c.lineWidth = 3 * s; c.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
    const x = lead - row * 34 * s, yy = y + side * row * 16 * s + Math.sin(t * 1.2 + i) * 4;
    const f = Math.sin(t * 7 + i * 1.3) * 7 * s;
    c.beginPath(); c.moveTo(x - 13 * s, yy - f); c.quadraticCurveTo(x - 4 * s, yy - 3 * s, x, yy); c.quadraticCurveTo(x + 4 * s, yy - 3 * s, x + 13 * s, yy - f); c.stroke();
  }
  c.restore();
}

export function butterfly(c, x, y, t, color = "#ff70a6", s = 1) {
  const f = Math.abs(Math.sin(t * 11)) * 0.75 + 0.25;
  c.save(); c.translate(x, y); c.rotate(Math.sin(t * 2) * 0.3); c.scale(s, s);
  c.fillStyle = color;
  for (const side of [-1, 1]) {
    c.beginPath(); c.ellipse(side * 10 * f, -6, 11 * f, 12, side * 0.4, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(side * 8 * f, 8, 8 * f, 8, -side * 0.4, 0, TAU); c.fill();
  }
  c.fillStyle = "#3a2e39"; rr(c, -2, -11, 4, 22, 2); c.fill();
  c.restore();
}

// Butterflies wander on looping paths inside a band of the screen.
export function butterflies(c, t, { n = 3, y = 380, band = 90, seed = 5, colors = ["#ff70a6", "#70d6ff", "#ffd670", "#c77dff"], s = 1 } = {}) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, sp = 0.18 + r() * 0.2, cx = 150 + r() * (W - 300);
    butterfly(c, cx + Math.sin(t * sp + a) * 230 + Math.sin(t * sp * 2.7) * 40, y + Math.cos(t * sp * 1.7 + a) * band, t + a, colors[i % colors.length], s);
  }
}

export function bee(c, x, y, t, s = 1) {
  c.save(); c.translate(x, y); c.scale(s, s);
  const f = Math.sin(t * 40) * 0.35;
  c.fillStyle = "rgba(255,255,255,0.75)";
  c.beginPath(); c.ellipse(-3, -11, 6, 10, -0.5 + f, 0, TAU); c.ellipse(5, -11, 6, 10, 0.5 - f, 0, TAU); c.fill();
  c.fillStyle = "#ffc300"; c.beginPath(); c.ellipse(0, 0, 13, 9, 0, 0, TAU); c.fill();
  c.fillStyle = "#2b2d42"; c.fillRect(-4, -8.5, 3.5, 17); c.fillRect(3, -8, 3.5, 16);
  c.beginPath(); c.arc(11, -2, 1.7, 0, TAU); c.fill();
  c.restore();
}

// Soft specks floating: pollen by day, fireflies by night, sparkle dust in the sea.
export function motes(c, t, { n = 24, seed = 9, color = "rgba(255,255,255,0.7)", size = 3, rise = 10, top = 0, bottom = H, sway = 18 } = {}) {
  const r = rng(seed), h = bottom - top;
  c.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const x = r() * W, y0 = r() * h, p = r() * TAU, sz = size * (0.5 + r());
    const y = top + ((y0 - t * rise * (0.6 + sz / size * 0.4)) % h + h) % h;
    c.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.9 + p));
    c.beginPath(); c.arc(x + Math.sin(t * 0.7 + p) * sway, y, sz, 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
}

// Rising bubbles with a shine.
export function bubbles(c, t, { n = 14, seed = 4, speed = 46, size = 9, bottom = 650 } = {}) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * W, y0 = r() * bottom, p = r() * TAU, sz = size * (0.45 + r());
    const y = ((y0 - t * speed * (0.6 + r() * 0.6)) % bottom + bottom) % bottom;
    const xx = x + Math.sin(t * 1.3 + p) * 14;
    c.strokeStyle = "rgba(255,255,255,0.6)"; c.lineWidth = 2; c.fillStyle = "rgba(255,255,255,0.1)";
    c.beginPath(); c.arc(xx, y, sz, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = "rgba(255,255,255,0.75)"; c.beginPath(); c.arc(xx - sz * 0.35, y - sz * 0.35, sz * 0.22, 0, TAU); c.fill();
  }
}

// A four-pointed sparkle.
export function sparkle(c, x, y, r, color = "#fff", rot = 0) {
  c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = color;
  c.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2, b = a + Math.PI / 4;
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    c.lineTo(Math.cos(b) * r * 0.22, Math.sin(b) * r * 0.22);
  }
  c.closePath(); c.fill(); c.restore();
}

export function twinkles(c, t, { n = 60, seed = 5, top = 0, bottom = 400, color = "#fff", size = 5 } = {}) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = top + r() * (bottom - top), p = r() * TAU, sz = size * (0.35 + r() * 0.8), sp = 0.8 + r() * 2;
    const k = 0.25 + 0.75 * Math.abs(Math.sin(t * sp + p));
    c.globalAlpha = k;
    sparkle(c, x, y, sz * (0.6 + k * 0.5), color, t * 0.25 + p);
  }
  c.globalAlpha = 1;
}

// A shooting star every so often.
export function shootingStar(c, t, { every = 6, seed = 8 } = {}) {
  const cycle = Math.floor(t / every), k = t / every - cycle;
  if (k > 0.2 || t <= 0) return;
  const r = rng(seed + cycle), x0 = 200 + r() * 800, y0 = 30 + r() * 170, p = k / 0.2;
  const x = x0 + p * 420, y = y0 + p * 170;
  const g = c.createLinearGradient(x - 150, y - 60, x, y);
  g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(255,255,255,0.95)");
  c.save(); c.globalAlpha = Math.sin(p * Math.PI); c.strokeStyle = g; c.lineWidth = 4; c.lineCap = "round";
  c.beginPath(); c.moveTo(x - 150, y - 60); c.lineTo(x, y); c.stroke();
  sparkle(c, x, y, 11, "#fff", t * 4); c.restore();
}

// Curtains of northern light.
export function aurora(c, t, { colors = ["6,214,160,0.34", "199,125,255,0.3", "76,201,240,0.28"], y = 70, height = 210 } = {}) {
  colors.forEach((col, k) => {
    const rgb = col.split(",").slice(0, 3).join(",");
    const g = c.createLinearGradient(0, y, 0, y + height);
    g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(0.45, `rgba(${col})`); g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g;
    c.beginPath();
    for (let x = 0; x <= W; x += 40) c.lineTo(x, y + k * 26 + Math.sin(x * 0.006 + t * 0.35 + k * 1.7) * 44 + Math.sin(x * 0.017 + t * 0.6 + k) * 16);
    for (let x = W; x >= 0; x -= 40) c.lineTo(x, y + height + k * 20 + Math.sin(x * 0.005 + t * 0.28 + k * 2.1) * 56);
    c.closePath(); c.fill();
  });
}

// Sunlight through water.
export function lightShafts(c, t, { n = 6, color = "255,255,255", alpha = 0.12 } = {}) {
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * (W / n) + Math.sin(t * 0.3 + i * 1.7) * 60, w = 60 + 30 * Math.sin(t * 0.5 + i);
    const g = c.createLinearGradient(0, 0, 0, H * 0.95);
    g.addColorStop(0, `rgba(${color},${alpha * (0.7 + 0.5 * Math.sin(t * 0.7 + i))})`); g.addColorStop(1, `rgba(${color},0)`);
    c.fillStyle = g;
    c.beginPath(); c.moveTo(x - w * 0.5, 0); c.lineTo(x + w * 0.5, 0); c.lineTo(x + w * 1.1 - 160, H * 0.95); c.lineTo(x - w * 1.1 - 160, H * 0.95); c.closePath(); c.fill();
  }
}

export function swayTree(c, x, y, s, t, { leaf = "#52b788", dark = "#2d6a4f", trunk = "#7f5539" } = {}) {
  const w = Math.sin(t * 1.1 + x) * 0.05;
  c.save(); c.translate(x, y); c.scale(s, s); c.rotate(w);
  c.fillStyle = trunk; c.beginPath(); c.moveTo(-9, 0); c.lineTo(-5, -56); c.lineTo(5, -56); c.lineTo(9, 0); c.closePath(); c.fill();
  c.fillStyle = dark; c.beginPath(); c.arc(-24, -66, 28, 0, TAU); c.arc(24, -66, 28, 0, TAU); c.fill();
  c.fillStyle = leaf; c.beginPath(); c.arc(0, -92, 36, 0, TAU); c.arc(-20, -74, 24, 0, TAU); c.arc(20, -74, 24, 0, TAU); c.fill();
  c.fillStyle = "rgba(255,255,255,0.2)"; c.beginPath(); c.arc(-10, -104, 13, 0, TAU); c.fill();
  c.restore();
}

export function grass(c, t, { y = H, n = 70, color = "#2d6a4f", height = 28, width = 4 } = {}) {
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = "round";
  const r = rng(77);
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const x = (i / n) * W + r() * 12, h = height * (0.5 + r() * 0.7), b = Math.sin(t * 1.5 + i * 0.7) * 7;
    c.moveTo(x, y); c.quadraticCurveTo(x + b * 0.4, y - h * 0.6, x + b, y - h);
  }
  c.stroke();
}

// Little flowers nodding along a line.
export function flowerRow(c, t, { y = 690, n = 14, seed = 12, colors = ["#ef476f", "#ffd166", "#ffffff", "#c77dff", "#ff9f1c"], s = 1 } = {}) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * W, h = (20 + r() * 26) * s, col = colors[i % colors.length], b = Math.sin(t * 1.4 + i) * 6;
    c.strokeStyle = "#40916c"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x, y - h * 0.5, x + b, y - h); c.stroke();
    c.fillStyle = col;
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + t * 0.3; c.beginPath(); c.arc(x + b + Math.cos(a) * 6 * s, y - h + Math.sin(a) * 6 * s, 4.2 * s, 0, TAU); c.fill(); }
    c.fillStyle = "#fff3b0"; c.beginPath(); c.arc(x + b, y - h, 3.4 * s, 0, TAU); c.fill();
  }
}

// A school of small fish swimming across.
export function fishSchool(c, t, { y = 240, n = 7, speed = 46, color = "#ffffff", s = 1, dir = 1, seed = 2, alpha = 0.55 } = {}) {
  const r = rng(seed), span = W + 400, lead = ((t * speed + r() * span) % span);
  c.save(); c.globalAlpha = alpha; c.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const ox = r() * 170, oy = (r() - 0.5) * 90;
    const px = lead - 200 - ox;
    const x = dir > 0 ? px : W - px, yy = y + oy + Math.sin(t * 1.6 + i) * 8, w = Math.sin(t * 9 + i) * 3.5;
    c.save(); c.translate(x, yy); c.scale(dir * s, s);
    c.beginPath(); c.ellipse(0, 0, 13, 6.5, 0, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(-10, 0); c.lineTo(-22, -6 + w); c.lineTo(-22, 6 + w); c.closePath(); c.fill();
    c.restore();
  }
  c.restore();
}

export function jelly(c, x, y, t, color = "#ff99c8", s = 1) {
  const pulse = 1 + Math.sin(t * 2.2 + x) * 0.1, yy = y + Math.sin(t * 0.6 + x) * 26;
  c.save(); c.translate(x + Math.sin(t * 0.3 + x) * 22, yy); c.scale(s * pulse, s / pulse);
  c.fillStyle = color; c.globalAlpha = 0.7;
  c.beginPath(); c.arc(0, 0, 30, Math.PI, 0); c.quadraticCurveTo(0, 10, -30, 0); c.fill();
  c.strokeStyle = color; c.lineWidth = 3.5; c.lineCap = "round";
  c.beginPath();
  for (let i = -2; i <= 2; i++) { const xx = i * 10; c.moveTo(xx, 4); c.quadraticCurveTo(xx + Math.sin(t * 3 + i) * 9, 28, xx + Math.sin(t * 2 + i) * 5, 52); }
  c.stroke(); c.restore();
}

export function coral(c, x, y, s, t, color = "#ff6b6b") {
  c.save(); c.translate(x, y); c.scale(s, s); c.strokeStyle = color; c.lineCap = "round";
  const branch = (len, w, depth, a) => {
    c.save(); c.rotate(a + Math.sin(t * 0.9 + depth + x) * 0.03); c.lineWidth = w;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -len); c.stroke(); c.translate(0, -len);
    if (depth > 0) { branch(len * 0.72, w * 0.72, depth - 1, -0.5); branch(len * 0.72, w * 0.72, depth - 1, 0.45); }
    c.restore();
  };
  branch(34, 11, 3, 0); c.restore();
}

export function nebula(c, t, { colors = ["rgba(247,37,133,0.3)", "rgba(76,201,240,0.26)", "rgba(114,9,183,0.32)"] } = {}) {
  colors.forEach((col, i) => {
    const x = W * (0.2 + i * 0.3) + Math.sin(t * 0.08 + i * 2) * 110, y = H * (0.3 + (i % 2) * 0.35) + Math.cos(t * 0.1 + i) * 70;
    glow(c, x, y, 360 + Math.sin(t * 0.2 + i) * 40, col);
  });
}

export function planet(c, x, y, r, t, { a = "#ffb703", b = "#fb8500", ring = false } = {}) {
  const g = c.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, a); g.addColorStop(1, b);
  if (ring) { c.save(); c.translate(x, y); c.rotate(-0.35); c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = r * 0.14; c.beginPath(); c.ellipse(0, 0, r * 1.6, r * 0.42, 0, Math.PI, TAU); c.stroke(); c.restore(); }
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip(); c.fillStyle = "rgba(255,255,255,0.16)";
  for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(x + (((t * 7 + i * 40) % (r * 3)) - r * 1.5), y - r * 0.5 + i * r * 0.5, r * 0.5, r * 0.11, 0, 0, TAU); c.fill(); }
  c.restore();
  if (ring) { c.save(); c.translate(x, y); c.rotate(-0.35); c.strokeStyle = "rgba(255,255,255,0.75)"; c.lineWidth = r * 0.14; c.beginPath(); c.ellipse(0, 0, r * 1.6, r * 0.42, 0, 0, Math.PI); c.stroke(); c.restore(); }
}

// Party flags waving on a string.
export function bunting(c, t, { y = 30, n = 16, sag = 34, colors = ["#ef476f", "#ffd166", "#06d6a0", "#118ab2", "#c77dff"] } = {}) {
  const at = (u) => y + Math.sin(u * Math.PI) * sag;
  c.strokeStyle = "rgba(90,70,60,0.7)"; c.lineWidth = 3;
  c.beginPath(); for (let i = 0; i <= 40; i++) { const u = i / 40; c.lineTo(u * W, at(u)); } c.stroke();
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, x = u * W, yy = at(u), flap = Math.sin(t * 3 + i * 0.8) * 7;
    c.fillStyle = colors[i % colors.length];
    c.beginPath(); c.moveTo(x - 17, yy); c.lineTo(x + 17, yy); c.lineTo(x + flap, yy + 40); c.closePath(); c.fill();
  }
}

export function windmill(c, x, y, s, t) {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.fillStyle = "#fff8e7"; c.beginPath(); c.moveTo(-26, 0); c.lineTo(-15, -112); c.lineTo(15, -112); c.lineTo(26, 0); c.closePath(); c.fill();
  c.fillStyle = "#e76f51"; c.beginPath(); c.moveTo(-19, -110); c.lineTo(0, -138); c.lineTo(19, -110); c.closePath(); c.fill();
  c.fillStyle = "#6b4a3a"; rr(c, -8, -26, 16, 26, 7); c.fill();
  c.translate(0, -106); c.rotate(t * 0.9);
  for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); c.fillStyle = "rgba(255,255,255,0.92)"; c.beginPath(); c.moveTo(0, 0); c.lineTo(11, -13); c.lineTo(11, -72); c.lineTo(-7, -72); c.closePath(); c.fill(); }
  c.fillStyle = "#6b4a3a"; c.beginPath(); c.arc(0, 0, 6, 0, TAU); c.fill();
  c.restore();
}

export function rainbow(c, x, y, r, alpha = 0.4) {
  const cols = ["#ef476f", "#ff9f1c", "#ffd166", "#06d6a0", "#118ab2", "#7209b7"];
  c.save(); c.globalAlpha = alpha; c.lineWidth = r * 0.055;
  cols.forEach((col, i) => { c.strokeStyle = col; c.beginPath(); c.arc(x, y, r - i * r * 0.055, Math.PI, TAU); c.stroke(); });
  c.restore();
}

export function windStreaks(c, t, { n = 7, seed = 6, alpha = 0.35, speed = 240 } = {}) {
  const r = rng(seed), span = W + 300;
  c.strokeStyle = `rgba(255,255,255,${alpha})`; c.lineWidth = 3; c.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const x0 = r() * span, y = 70 + r() * 480, len = 50 + r() * 90, sp = speed * (0.6 + r() * 0.8);
    const x = span - ((x0 + t * sp) % span) - 150;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + len * 0.5, y - 8, x + len, y + Math.sin(t + i) * 5); c.stroke();
  }
}

// A sky-sailing balloon far away.
export function farBalloon(c, x, y, s, t, color = "#ef476f") {
  c.save(); c.translate(x, y + Math.sin(t * 0.8 + x) * 10); c.scale(s, s);
  c.fillStyle = color; c.beginPath(); c.ellipse(0, 0, 24, 29, 0, 0, TAU); c.fill();
  c.fillStyle = "rgba(255,255,255,0.3)"; c.beginPath(); c.ellipse(-7, -8, 6, 13, 0.2, 0, TAU); c.fill();
  c.strokeStyle = "rgba(70,50,40,0.7)"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-12, 24); c.lineTo(-5, 40); c.moveTo(12, 24); c.lineTo(5, 40); c.stroke();
  c.fillStyle = "#a9744f"; rr(c, -6, 39, 12, 9, 3); c.fill();
  c.restore();
}

// Sparks that follow a moving hand, finger, bird or balloon.
export class SparkTrail {
  constructor({ colors = ["#ffd166", "#ffffff", "#ff8fab", "#7bdff2"], life = 0.7, size = 8, reduced = false } = {}) {
    this.list = []; this.colors = colors; this.life = life; this.size = size; this.reduced = reduced; this.acc = 0; this.i = 0;
  }
  add(x, y, dt, rate = 60) {
    if (this.reduced) return;
    this.acc += dt * rate;
    while (this.acc >= 1 && this.list.length < 90) {
      this.acc -= 1; this.i++;
      this.list.push({ x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 14, vx: (Math.random() - 0.5) * 50, vy: 15 + Math.random() * 60, life: this.life, rot: Math.random() * 6, color: this.colors[this.i % this.colors.length], size: this.size * (0.5 + Math.random() * 0.8) });
    }
    if (this.acc > 1) this.acc = 0;
  }
  update(dt) {
    for (const p of this.list) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 4; }
    this.list = this.list.filter((p) => p.life > 0);
  }
  draw(c) {
    for (const p of this.list) { const k = clamp(p.life / this.life, 0, 1); c.globalAlpha = k; sparkle(c, p.x, p.y, p.size * (0.4 + k * 0.6), p.color, p.rot); }
    c.globalAlpha = 1;
  }
  clear() { this.list = []; }
}

// A glowing magic star for the hand or finger.
export function starCursor(c, x, y, t, color = "#ffd166", r = 24) {
  const pulse = 1 + Math.sin(t * 8) * 0.08;
  glow(c, x, y, r * 2.8 * pulse, "rgba(255,255,255,0.55)");
  c.save(); c.translate(x, y); c.rotate(t * 1.4); c.scale(pulse, pulse);
  c.strokeStyle = "#fff"; c.lineWidth = 5; c.lineJoin = "round"; c.fillStyle = color;
  c.beginPath();
  for (let i = 0; i < 10; i++) { const rad = i % 2 ? r * 0.48 : r, a = (Math.PI / 5) * i - Math.PI / 2; c.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
  c.closePath(); c.stroke(); c.fill();
  c.restore();
  for (let i = 0; i < 3; i++) { const a = t * 2.2 + (i * TAU) / 3; sparkle(c, x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.5, 6, "#fff", a); }
}

// A springy scale from 0 to 1 over `dur` seconds.
export const spring = (sec, dur = 0.45) => ease.back(clamp(sec / dur, 0, 1));
export { lerp };
