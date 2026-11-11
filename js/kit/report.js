// Turns a game result into plain sentences for the result screen and the grown-ups' session
// report, so nobody has to read JSON. Pure functions (unit tested).
import { t } from "./i18n.js";

const r1 = (x) => Math.round(x * 10) / 10;
// Time is always shown in whole seconds: 1 s or 2 s, never 1.5 s.
const sec = (x) => Math.max(0, Math.round(x || 0));
const LETTER = { aah: "A", eee: "E", iii: "I", ooo: "O", uuu: "U" };
const MOUTH_KEYS = { open: "openWide", wide: "openWider", smile: "smile", kiss: "kiss", oh: "ohShape", puff: "puff", side: "lipsSide", jaw: "jawSide", lipsIn: "lipsIn", surprised: "surprisedFace", sad: "sadFace", cross: "crossFace" };

export function describe(result) {
  const m = result.metrics || {};
  const out = [];
  switch (result.game) {
    case "breeze":
      out.push(t("r_breeze_rounds", { done: m.rounds_completed, total: m.rounds_total }));
      out.push(t("r_breeze_hold", { s: sec(m.longest_hold_sec), t: m.target_hold_sec }));
      if (m.by_sound) { const got = ["aah", "eee", "iii", "ooo", "uuu"].filter((v) => m.by_sound[v] && m.by_sound[v].done).map((v) => LETTER[v]); if (got.length) out.push(t("r_vowels_done", { list: got.join(", ") })); }
      if (m.target_sound_pct != null) out.push(t("r_breeze_target", { p: m.target_sound_pct }));
      if (m.voice_breaks) out.push(t("r_breeze_breaks", { n: m.voice_breaks }));
      if (m.steady_voice_pct != null) out.push(t("r_breeze_steady", { p: m.steady_voice_pct }));
      break;
    case "glide":
      out.push(t("r_glide_rings", { hit: m.rings_hit, total: m.rings_total, p: m.accuracy_pct }));
      if (m.by_vowel) { const list = ["aah", "eee", "iii", "ooo", "uuu"].filter((v) => m.by_vowel[v]).map((v) => `${LETTER[v]} ${m.by_vowel[v].hit}/${m.by_vowel[v].total}`); if (list.length) out.push(t("r_glide_vowels", { list: list.join(", ") })); }
      if (m.right_sound_pct != null) out.push(t("r_glide_right", { p: m.right_sound_pct }));
      if (m.avg_response_ms != null) out.push(t("r_glide_response", { s: Math.max(1, sec(m.avg_response_ms / 1000)) }));
      if (m.personal_voice_check === false) out.push(t("r_glide_nocheck"));
      break;
    case "pitch":
      out.push(t("r_pitch_pictures", { done: m.pictures_done, total: m.pictures_total, good: m.pictures_good ?? 0 }));
      if (m.accuracy_pct != null) out.push(t("r_pitch_match", { p: m.accuracy_pct }));
      if (m.lowest_hz && m.highest_hz) out.push(t("r_pitch_range", { lo: m.lowest_hz, hi: m.highest_hz, st: m.pitch_range_semitones }));
      break;
    case "mouth":
      out.push(t("r_mouth_moves", { done: m.moves_done, total: m.moves_total }));
      if (m.longest_hold_sec != null) out.push(t("r_mouth_hold", { s: sec(m.longest_hold_sec), t: m.hold_final_target_sec }));
      for (const [k, v] of Object.entries(m.by_move || {})) {
        out.push(t("r_mouth_move", { move: t(MOUTH_KEYS[k] || k), done: v.done, total: v.total }));
      }
      out.push(t("r_mouth_by", { who: t(m.confirmed_by === "camera" ? "r_by_camera" : "r_by_adult") }));
      break;
    case "firefly":
      out.push(t("r_firefly_caught", { n: m.caught, total: m.total }));
      if (m.avg_reaction_ms != null) out.push(t("r_firefly_reach", { s: Math.max(1, sec(m.avg_reaction_ms / 1000)) }));
      if (m.wrong_touches) out.push(t("r_firefly_wrong", { n: m.wrong_touches }));
      if (m.left_hand_catches != null) out.push(t("r_firefly_hands", { l: m.left_hand_catches, r: m.right_hand_catches, c: m.cross_midline_catches }));
      break;
    case "garden": {
      out.push(t("r_garden_clear", { n: m.clear, total: m.items_total }));
      out.push(t("r_garden_first", { n: m.clear_first_try }));
      if (m.judged_auto) out.push(t("r_garden_auto", { n: m.judged_auto, total: m.items_total, where: t(m.word_check === "local" ? "whereLocal" : "whereOnline") }));
      if (m.judged_adult) out.push(t("r_garden_adult", { n: m.judged_adult }));
      if (m.said_not_checked) out.push(t("r_garden_said", { n: m.said_not_checked }));
      const soundsLine = Object.entries(m.by_sound || {}).map(([k, v]) => `/${k}/ ${v.clear}/${v.total}`).join(", ");
      if (soundsLine) out.push(t("r_garden_sounds", { list: soundsLine }));
      const practice = (m.items || []).filter((i) => i.result === "needs_practice").map((i) => i.item);
      if (practice.length) out.push(t("r_garden_practice", { list: practice.join(", ") }));
      break;
    }
    case "letters":
    case "numbers":
      out.push(t("r_trace_done", { n: m.items_done, total: m.items_total }));
      if (m.tracing_accuracy_pct != null) out.push(t("r_trace_accuracy", { p: m.tracing_accuracy_pct }));
      if (m.path_efficiency_pct != null) out.push(t("r_trace_smooth", { p: m.path_efficiency_pct }));
      if (m.avg_time_sec != null) out.push(t("r_trace_time", { s: Math.max(1, sec(m.avg_time_sec)) }));
      if (m.finger_isolation_pct != null) out.push(t("r_trace_isolation", { p: m.finger_isolation_pct, finger: t("finger_" + m.finger) }));
      if (m.left_hand_pct != null) out.push(t("r_trace_hands", { l: m.left_hand_pct, r: 100 - m.left_hand_pct }));
      if (m.needs_practice && m.needs_practice.length) out.push(t("r_garden_practice", { list: m.needs_practice.join(", ") }));
      break;
    case "balance":
      out.push(t("r_balance_steady", { p: m.steady_pct, tol: m.tilt_tolerance_deg }));
      out.push(t("r_balance_items", { n: m.items_kept, total: m.items_total }));
      if (m.longest_steady_sec != null) out.push(t("r_balance_longest", { s: sec(m.longest_steady_sec) }));
      if (m.side_bias) out.push(t(m.side_bias === "left" ? "r_balance_left" : "r_balance_right", { deg: m.mean_side_bias_deg }));
      break;
    case "body":
      out.push(t("r_body_moves", { done: m.moves_done, total: m.moves_total }));
      if (m.longest_hold_sec != null) out.push(t("r_body_hold", { s: sec(m.longest_hold_sec) }));
      if (m.left_right_balance_note) out.push(t(m.left_right_balance_note, {}));
      for (const [k, v] of Object.entries(m.by_move || {})) out.push(t("r_mouth_move", { move: t("body_" + k), done: v.done, total: v.total }));
      out.push(t("r_mouth_by", { who: t(m.confirmed_by === "camera" ? "r_by_camera" : "r_by_adult") }));
      break;
  }
  const ad = m.adaptive;
  if (ad && ad.enabled) {
    if (ad.made_easier) out.push(t("r_adaptive", { dir: t("easierTag"), n: ad.made_easier }));
    if (ad.made_harder) out.push(t("r_adaptive", { dir: t("harderTag"), n: ad.made_harder }));
  }
  if (result.input_mode === "touch") out.push(t("r_touch"));
  if (!result.completed) out.push(t("r_unfinished"));
  return out;
}

// Values for a small bar chart of each round / item, where the game has them.
export function perRound(result) {
  const ev = result.events || [];
  switch (result.game) {
    case "breeze": {
      const rows = ev.filter((e) => e.type === "round_complete" || e.type === "round_timeout");
      return rows.map((e) => ({ label: String(e.round), value: e.longest_hold_sec, target: e.target_sec, ok: e.type === "round_complete", unit: "s" }));
    }
    case "garden":
      return (result.metrics.items || []).map((i) => { const ok = i.result === "clear" || i.result === "said"; return { label: i.item, value: ok ? 1 : 0, target: 1, ok, text: i.result }; });
    case "mouth":
      return ev.filter((e) => e.type === "move_done" || e.type === "move_missed").map((e) => ({ label: String(e.rep), value: e.type === "move_done" ? 1 : 0, target: 1, ok: e.type === "move_done", text: e.move }));
    default:
      return [];
  }
}

// The one number that best shows therapy progress for each game. Higher is better for all of them.
export const THERAPY_MEASURE = {
  breeze: { label: "longestHold", key: "longest_hold_sec", unit: " s" },
  glide: { label: "accuracy", key: "accuracy_pct", unit: "%" },
  pitch: { label: "accuracy", key: "accuracy_pct", unit: "%" },
  mouth: { label: "longestHold", key: "longest_hold_sec", unit: " s" },
  firefly: { label: "score", top: "score", unit: "" },
  garden: { label: "clearLbl", key: "clear_pct", unit: "%" },
  letters: { label: "accuracy", key: "tracing_accuracy_pct", unit: "%" },
  numbers: { label: "accuracy", key: "tracing_accuracy_pct", unit: "%" },
  balance: { label: "steadyLbl", key: "steady_pct", unit: "%" },
  body: { label: "longestHold", key: "longest_hold_sec", unit: " s" },
};

export function therapyValue(result) {
  const spec = THERAPY_MEASURE[result.game];
  if (!spec) return null;
  const m = result.metrics || {};
  if (spec.top) return result[spec.top] ?? null;
  if (result.game === "garden") return m.items_total ? Math.round((((m.clear || 0) + (m.said_not_checked || 0)) / m.items_total) * 100) : null;
  return m[spec.key] ?? null;
}

const fmtValue = (spec, v) => `${spec.unit === " s" ? sec(v) : r1(v)}${spec.unit}`;

// Today's value against the last session of the same level. `earlier` is the history, newest first,
// without this result. Sessions in touch mode are not compared with camera or microphone sessions.
export function therapyChange(result, earlier = []) {
  const spec = THERAPY_MEASURE[result.game];
  const now = therapyValue(result);
  if (!spec || now == null) return null;
  const prev = earlier.find((r) => r.game === result.game && r.level === result.level && r.input_mode === result.input_mode && therapyValue(r) != null);
  const before = prev ? therapyValue(prev) : null;
  return { label: spec.label, unit: spec.unit, now: fmtValue(spec, now), before: before != null ? fmtValue(spec, before) : null, direction: before == null ? 0 : Math.sign(now - before) };
}

// For the Progress page: per level, first and latest value. `rows` is one game's history, newest first.
export function progressByLevel(rows) {
  const out = [];
  const levels = [...new Set(rows.map((r) => r.level))].sort((a, b) => a - b);
  for (const level of levels) {
    const list = rows.filter((r) => r.level === level && therapyValue(r) != null);
    if (!list.length) continue;
    const spec = THERAPY_MEASURE[list[0].game];
    const latest = therapyValue(list[0]), first = therapyValue(list[list.length - 1]);
    out.push({ level, label: spec.label, first: fmtValue(spec, first), latest: fmtValue(spec, latest), change: Math.sign(latest - first), sessions: list.length });
  }
  return out;
}

export function formatDuration(sec) {
  const s = Math.round(sec || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
