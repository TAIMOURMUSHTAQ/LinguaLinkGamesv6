// The child's progress on this device: which levels are open, best stars, and stickers.
// Level 1 of every game is always open. The next level opens when one session finishes a level
// with at least 1 star. A level finished with 2 or more stars wins its sticker.
// Grown-ups can open every level in Grown-ups > Settings ("Open all levels").
// Most games have 5 levels; Air Letters has 10 (the alphabet first). One sticker per level.
import { load, save } from "./storage.js";

export const STICKERS = {
  breeze: ["🎈", "⛰️", "🌬️", "🪁", "🦅"],
  glide: ["☁️", "🪜", "🌊", "🐦", "🛝"],
  pitch: ["🖌️", "🌈", "🏠", "🏰", "🎢"],
  mouth: ["🐟", "😄", "💋", "🔁", "🐡"],
  firefly: ["✨", "💃", "🎨", "🌉", "🔢"],
  garden: ["🌱", "🌿", "🌷", "🌸", "🌻"],
  letters: ["🍎", "🐟", "🪁", "🐷", "🦓", "📏", "🌀", "⚡", "🖍️", "📚"],
  numbers: ["☝️", "💍", "👍", "🤙", "🔟"],
  balance: ["🍎", "🍐", "🏋️", "🛒", "🗼"],
  body: ["🦒", "🌳", "🐸", "🦩", "🎉"],
};
export const STICKER_TOTAL = Object.values(STICKERS).flat().length;

// How many levels a game has.
export function levelCount(id) { return (STICKERS[id] || []).length || 5; }

function empty() { return { games: {}, stickers: [], v: 6 }; }

// Version 6 put five alphabet levels in front of Air Letters' old levels: what was level 1 is now
// level 6. Saved stars, open levels and stickers move with their levels, once.
export function migrate(p) {
  if (!p || p.v >= 6) return p;
  const g = p.games && p.games.letters;
  if (g) for (const k of ["best", "done", "passed"]) if (Array.isArray(g[k])) g[k] = [...new Array(5).fill(k === "best" ? 0 : false), ...g[k]];
  p.stickers = (p.stickers || []).map((s) => { const m = /^letters:(\d+)$/.exec(s); return m ? `letters:${+m[1] + 5}` : s; });
  p.v = 6;
  return p;
}

export function getProgress() {
  const p = load("progress", null);
  if (!p || !p.games) return empty();
  if (!(p.v >= 6)) { migrate(p); save("progress", p); }
  return p;
}

function gameEntry(p, id) {
  const n = levelCount(id);
  const g = (p.games[id] ||= { best: new Array(n).fill(0), done: new Array(n).fill(false), plays: 0, last: null });
  g.passed ||= new Array(n).fill(false);
  return g;
}

export function isUnlocked(id, levelIndex, { unlockAll = false } = {}, p = getProgress()) {
  if (unlockAll || levelIndex === 0) return true;
  const g = p.games[id];
  return !!(g && g.passed && g.passed[levelIndex - 1]);
}

// Highest open level for a game (0-based), used to place "you are here" on the map.
export function currentLevel(id, opts = {}, p = getProgress()) {
  let i = 0;
  const last = levelCount(id) - 1;
  while (i < last && isUnlocked(id, i + 1, opts, p)) i++;
  // stay on the first open level that has no stars yet
  const g = p.games[id];
  for (let k = 0; k <= i; k++) if (!g || !g.best[k]) return k;
  return i;
}

// Record a finished session. Returns what changed, for the result screen.
export function recordResult(result) {
  const p = getProgress();
  const li = result.level - 1;
  const last = levelCount(result.game) - 1;
  const wasOpen = li < last ? isUnlocked(result.game, li + 1, {}, p) : true;
  const g = gameEntry(p, result.game);
  g.plays++;
  g.last = result.ended_at;
  g.best[li] = Math.max(g.best[li] || 0, result.stars || 0);
  if (result.completed) g.done[li] = true;
  if (result.completed && result.stars >= 1) g.passed[li] = true;
  const key = `${result.game}:${result.level}`;
  let newSticker = null;
  if (result.completed && result.stars >= 2 && !p.stickers.includes(key)) {
    p.stickers.push(key);
    newSticker = STICKERS[result.game][li];
  }
  const nowOpen = li < last ? isUnlocked(result.game, li + 1, {}, p) : false;
  save("progress", p);
  return { newSticker, unlockedLevel: !wasOpen && nowOpen ? li + 2 : null };
}

export function totalStars(p = getProgress()) {
  return Object.values(p.games).reduce((a, g) => a + g.best.reduce((x, y) => x + (y || 0), 0), 0);
}

export function clearProgress() {
  save("progress", empty());
}
