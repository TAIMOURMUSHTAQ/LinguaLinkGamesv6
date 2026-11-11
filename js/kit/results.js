// Standard result format shared by every game, and the ways a result leaves the game:
// 1. postMessage to the parent page (when embedded in an iframe in LinguaLink360). The parent
//    confirms with {type: "lingualink:result-ack", id}; until then the result is "waiting".
// 2. POST to config.resultUrl (Laravel route), with the CSRF token. Each try has a 5 s limit;
//    results that could not be sent wait in an outbox on the device and are retried later.
// 3. A local history on this device (for the grown-ups' Sessions and Progress pages).
import { load, save } from "./storage.js";

export const SCHEMA = "lingualink.game_result/v1";
const HISTORY_MAX = 60;
const SEND_TIMEOUT_MS = 5000;

export function starsFor(score) {
  if (score >= 90) return 3;
  if (score >= 70) return 2;
  if (score >= 40) return 1;
  return 0;
}

export function suggestionFor(score) {
  if (score >= 85) return "next";
  if (score >= 50) return "stay";
  return "easier";
}

// If the game had to make the level easier to get through it, do not suggest moving up yet.
// A level that was stopped before the end never suggests moving up either.
export function adjustSuggestion(base, adaptiveFinalStep, completed = true) {
  if (!completed) return base === "easier" ? "easier" : "unfinished";
  if (adaptiveFinalStep > 0 && base === "next") return "stay";
  return base;
}

export function clampScore(x) {
  return Math.max(0, Math.min(100, Math.round(x)));
}

let seq = 0;
export function newResultId() {
  seq = (seq + 1) % 1000;
  return `${Date.now().toString(36)}-${seq}-${Math.random().toString(36).slice(2, 7)}`;
}

export function buildResult({ game, gameVersion, level, levelName, mode, startedAt, endedAt, completed, score, metrics, events, settings, config, suggestion = null }) {
  const s = clampScore(score);
  return {
    schema: SCHEMA,
    result_id: newResultId(),
    game,
    game_version: gameVersion,
    level,
    level_name: levelName,
    assignment_id: config.assignmentId ?? null,
    session_id: config.sessionId ?? null,
    patient_ref: config.patientRef ?? null,
    input_mode: mode, // "sensors" or "touch"
    started_at: new Date(startedAt).toISOString(),
    ended_at: new Date(endedAt).toISOString(),
    duration_sec: Math.round((endedAt - startedAt) / 100) / 10,
    completed: !!completed,
    score: s,
    stars: starsFor(s),
    suggestion: suggestion || suggestionFor(s),
    metrics,
    settings: settings || {},
    events: (events || []).slice(0, 200),
  };
}

// Can we post to the parent page safely? Only when the target origin is known.
function parentTarget(config) {
  try {
    if (!window.parent || window.parent === window) return null;
  } catch { return null; }
  if (config.parentOrigin) return config.parentOrigin;
  try { return window.parent.location.origin; } catch { return null; } // same origin only
}

async function postWithTimeout(url, body, config) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (config.csrfToken) headers["X-CSRF-TOKEN"] = config.csrfToken;
  const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ac ? setTimeout(() => ac.abort(), SEND_TIMEOUT_MS) : 0;
  try {
    const r = await fetch(url, { method: "POST", headers, credentials: "same-origin", body: JSON.stringify(body), signal: ac && ac.signal });
    return r.ok;
  } catch { return false; } finally { clearTimeout(timer); }
}

function updateHistory(id, patch) {
  const hist = load("history", []);
  const row = hist.find((h) => h.result_id === id);
  if (row) { row.delivery = { ...row.delivery, ...patch }; save("history", hist); }
}

// Records the result on the device at once and returns. Sending happens in the background;
// `onDelivery` is called with the delivery status whenever it changes.
export function emitResult(result, config, onDelivery = () => {}) {
  const delivery = { local: false, parent: "none", server: config.resultUrl ? "sending" : "none" };
  // 1. local history (with a short event log, to keep it small)
  const hist = load("history", []);
  hist.unshift({ ...result, events: result.events.slice(0, 60), delivery });
  delivery.local = save("history", hist.slice(0, HISTORY_MAX));
  // 2. parent page
  const target = parentTarget(config);
  if (target) {
    try {
      window.parent.postMessage({ type: "lingualink:game-result", id: result.result_id, payload: result }, target);
      delivery.parent = "waiting";
    } catch { delivery.parent = "failed"; }
  } else if (config.embedded) delivery.parent = "no-origin";
  onDelivery({ ...delivery });
  // 3. server, in the background
  if (config.resultUrl) {
    postWithTimeout(config.resultUrl, result, config).then((ok) => {
      delivery.server = ok ? "sent" : "queued";
      if (!ok) { const box = load("outbox", []); box.push({ url: config.resultUrl, result }); save("outbox", box.slice(-50)); }
      updateHistory(result.result_id, { server: delivery.server });
      onDelivery({ ...delivery });
    });
  }
  try { window.dispatchEvent(new CustomEvent("lingualink:game-result", { detail: result })); } catch {}
  return delivery;
}

// The parent page confirms each result it received.
export function listenForAcks(onAck = () => {}) {
  window.addEventListener("message", (e) => {
    const d = e.data;
    if (!d || d.type !== "lingualink:result-ack" || !d.id) return;
    updateHistory(d.id, { parent: "confirmed" });
    onAck(d.id);
  });
}

// Retry results that could not be sent (called at start-up and when the connection returns).
export async function flushOutbox(config) {
  const box = load("outbox", []);
  if (!box.length) return 0;
  const left = [];
  let sent = 0;
  for (const item of box) {
    if (await postWithTimeout(item.url, item.result, config)) { sent++; updateHistory(item.result.result_id, { server: "sent" }); }
    else left.push(item);
  }
  save("outbox", left);
  return sent;
}

// Air Letters sessions saved before version 6 have the old level numbers: the alphabet levels now
// come first, so their level is 5 higher.
const majorOf = (v) => parseInt(String(v || "0"), 10) || 0;
export function history() {
  return load("history", []).map((r) => (r && r.game === "letters" && majorOf(r.game_version) < 6 && r.level <= 5 ? { ...r, level: r.level + 5 } : r));
}

export function clearHistory() {
  save("history", []);
}

export function bestStars() {
  const best = {};
  for (const r of history()) {
    const k = r.game + ":" + r.level;
    best[k] = Math.max(best[k] || 0, r.stars || 0);
  }
  return best;
}
