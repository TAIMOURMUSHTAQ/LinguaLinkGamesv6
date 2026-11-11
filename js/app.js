// LinguaLink Play v2: splash, home, level maps, sticker book, grown-ups area, and game launcher.
import { getConfig, PREF_KEYS, prefersReducedMotion, GAME_IDS } from "./kit/config.js";
import { save, load } from "./kit/storage.js";
import { setLang, t, gameText, levelText, lang } from "./kit/i18n.js";
import { setSoundEnabled, setMusicEnabled, setVoicePrompts, unlock, startMusic, stopMusic, sfx } from "./kit/audio.js";
import { history, clearHistory, listenForAcks, flushOutbox } from "./kit/results.js";
import { getProgress, isUnlocked, currentLevel, totalStars, clearProgress, STICKERS, STICKER_TOTAL } from "./kit/progress.js";
import { describe, perRound, formatDuration, progressByLevel } from "./kit/report.js";
import { preload, onLoadProgress, isLoaded, warmEngine } from "./kit/vision.js";
import { W, H } from "./kit/draw.js";

const VERSION = "6.0.1";
const cfg = getConfig();
let runner = null;
let GAMES = [], byId = {};
let Runner = null;
let currentMap = null;

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const SENSE = { mic: "🎤", "mic-optional": "🎤", face: "📷", hands: "📷", pose: "📷" };
const MAP_DECO = { breeze: ["☁️", "🎈", "☁️", "🌤️"], glide: ["☁️", "🐦", "🌅", "☁️"], pitch: ["🎨", "🖌️", "🌈", "🎵"], mouth: ["🫧", "🐠", "🫧", "🐚"], firefly: ["✨", "🌙", "✨", "🌾"], garden: ["🌼", "🦋", "🌷", "🐝"], letters: ["🅰️", "✏️", "🔤", "🌈"], numbers: ["1️⃣", "✋", "🔢", "⭐"], balance: ["⚖️", "🍎", "🧺", "🍐"], body: ["🦒", "🦩", "🐸", "🐘"] };
// Positions of the levels on the map (percent of the stage): the classic path for 5 levels, and a
// zig-zag trail for games with more (Air Letters has 10).
const NODE_POS = [[8, 78], [28, 38], [50, 70], [72, 30], [92, 62]];
function nodePositions(n) {
  if (n <= 5) return NODE_POS.slice(0, n);
  return Array.from({ length: n }, (_, i) => [6 + (i * 88) / (n - 1), i % 2 ? 32 : 74]);
}
const zeros = (g) => new Array(g.levels.length).fill(0);

// ---------- preferences ----------
function applyPrefs() {
  setLang(cfg.lang);
  setSoundEnabled(cfg.sound);
  setMusicEnabled(cfg.music);
  setVoicePrompts(cfg.voicePrompts);
  document.documentElement.classList.toggle("reduce-motion", prefersReducedMotion(cfg));
}

// One music switch, shown on the home screen, the level map and in the game bar.
function syncMusicButtons() {
  document.querySelectorAll(".music-toggle").forEach((b) => {
    b.setAttribute("aria-pressed", String(!!cfg.music));
    b.setAttribute("aria-label", t(cfg.music ? "musicOn" : "musicOff"));
    b.querySelector(".music-icon").textContent = cfg.music ? "🎵" : "🔇";
    const lab = b.querySelector(".music-label");
    if (lab) lab.textContent = t(cfg.music ? "musicOn" : "musicOff");
  });
}

function toggleMusic() {
  cfg.music = !cfg.music;
  save("prefs", { ...load("prefs", {}), music: cfg.music });
  setMusicEnabled(cfg.music);
  if ($("#setMusic")) $("#setMusic").checked = cfg.music;
  // Never start music while a microphone game is listening: it would count as the child's voice.
  const micGame = runner && /mic/.test(runner.def.input) && runner.state !== "intro" && runner.state !== "done";
  if (cfg.music && !micGame) startMusic(runner ? runner.def.id : currentMap || "hub");
  syncMusicButtons();
}

function i18nStatic() {
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.title = t("brand");
  $("#mapBack").setAttribute("aria-label", t("back"));
  document.querySelectorAll("[data-close]").forEach((b) => b.setAttribute("aria-label", t("close")));
  syncMusicButtons();
}

const unlockOpts = () => ({ unlockAll: !!cfg.unlockAll });

// ---------- navigation ----------
const SCREENS = ["splash", "home", "map"];
function showScreen(id, { push = true } = {}) {
  for (const s of SCREENS) $("#" + s).hidden = s !== id;
  $("#gameView").hidden = true;
  const el = $("#" + id);
  el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter");
  if (push) { try { window.history.pushState({ screen: id, game: currentMap }, ""); } catch {} }
}

window.addEventListener("popstate", (e) => {
  const st = e.state || { screen: "home" };
  if (runner) { runner.destroy(); runner = null; }
  if ($("#grown").open) $("#grown").close();
  if (st.screen === "map" && st.game) openMap(st.game, { push: false });
  else if (st.screen !== "splash") showHome({ push: false });
});

// ---------- splash ----------
async function runSplash() {
  const bar = $("#splashBar"), status = $("#splashStatus"), pb = bar.parentElement;
  const set = (p) => { bar.style.width = Math.round(p * 100) + "%"; pb.setAttribute("aria-valuenow", String(Math.round(p * 100))); };
  const t0 = performance.now();
  set(0.1);
  const fonts = document.fonts ? Promise.all([
    document.fonts.load('800 40px "Baloo 2"'), document.fonts.load('400 16px "Lexend"'), document.fonts.load('700 16px "Lexend"'),
    ...(cfg.lang === "ur" ? [document.fonts.load('400 16px "Noto Nastaliq Urdu"', "ا")] : []),
  ]).catch(() => {}) : Promise.resolve();
  await loadGames((p) => set(0.1 + p * 0.5));
  await fonts;
  set(0.75);
  renderHome();
  set(1);
  // keep the little animation on screen long enough to be seen, but never more than ~1 s
  const left = 900 - (performance.now() - t0);
  if (left > 0) await new Promise((r) => setTimeout(r, left));
  $("#splash").classList.add("ready");
  const go = $("#splashGo");
  go.hidden = false;
  go.focus();
  status.textContent = "";
  await new Promise((r) => go.addEventListener("click", r, { once: true }));
  unlock();
  sfx.go();
  startMusic("hub");
  $("#splash").classList.add("leaving");
  await new Promise((r) => setTimeout(r, prefersReducedMotion(cfg) ? 0 : 380));
  showHome({ replace: true });
}

async function loadGames(onProgress = () => {}) {
  if (GAMES.length) return;
  let n = 0;
  const step = () => onProgress(++n / 7);
  const [eng, reg] = await Promise.all([
    import("./kit/engine.js").then((m) => (step(), m)),
    import("./games/index.js").then((m) => (step(), m)),
  ]);
  Runner = eng.Runner;
  GAMES = reg.GAMES;
  byId = reg.byId;
  for (let i = 0; i < 5; i++) step();
}

// ---------- home ----------
function renderHome() {
  const p = getProgress();
  $("#starTotal").textContent = `★ ${t("starsTotal", { n: totalStars(p) })}`;
  $("#tiles").innerHTML = GAMES.map((g) => {
    const best = g.levels.map((_, i) => (p.games[g.id] && p.games[g.id].best && p.games[g.id].best[i]) || 0);
    const done = best.filter((s) => s > 0).length;
    return `<button class="tile" type="button" data-game="${g.id}" style="--game:${g.color}">
      <div class="thumb"><canvas width="${W / 2}" height="${H / 2}" data-preview="${g.id}" aria-hidden="true"></canvas>
        <span class="sense" aria-hidden="true">${SENSE[g.input]}</span></div>
      <div class="tile-body">
        <h2>${esc(gameText(g, "title"))}</h2>
        <div class="dots ${best.length > 5 ? "many" : ""}" aria-label="${esc(t("levelsDone", { n: done, m: best.length }))}">${best.map((s, i) => `<b class="${s ? "got" : ""}">${s ? "★" : i + 1}</b>`).join("")}<small>${esc(t("levelsDone", { n: done, m: best.length }))}</small></div>
      </div>
      <span class="go" aria-hidden="true"><span>➜</span></span>
    </button>`;
  }).join("");
  $("#tiles").querySelectorAll(".tile").forEach((b) => b.addEventListener("click", () => { sfx.tap(); openMap(b.dataset.game); }));
  const live = [...document.querySelectorAll("canvas[data-preview]")].map((cv) => {
    const g = byId[cv.dataset.preview];
    const li = Math.min(g.levels.length - 1, currentLevel(g.id, unlockOpts(), p));
    const c = cv.getContext("2d");
    c.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
    try { g.drawPreview(c, li, 0); } catch (e) { console.warn(e); }
    return { g, li, c };
  });
  animateTiles(live);
}

// The pictures on the home screen are alive. A few are redrawn each frame, so nine scenes never
// slow the device, and nothing is drawn while another screen is showing.
let tileRaf = 0;
function animateTiles(live) {
  cancelAnimationFrame(tileRaf);
  if (prefersReducedMotion(cfg) || !live.length) return;
  const t0 = performance.now();
  let i = 0, last = 0;
  const frame = (now) => {
    tileRaf = requestAnimationFrame(frame);
    if (now - last < 30 || document.hidden || $("#home").hidden) return;
    last = now;
    for (let k = 0; k < 2; k++) {
      const { g, li, c } = live[i++ % live.length];
      try { g.drawPreview(c, li, (now - t0) / 1000); } catch (e) { console.warn(e); cancelAnimationFrame(tileRaf); return; }
    }
  };
  tileRaf = requestAnimationFrame(frame);
}

function showHome({ push = true, replace = false } = {}) {
  if (runner) { runner.destroy(); runner = null; }
  currentMap = null;
  renderHome();
  showScreen("home", { push: push && !replace });
  if (replace) { try { window.history.replaceState({ screen: "home" }, ""); } catch {} }
  startMusic("hub");
  // a few seconds after the home screen opens, fetch the camera engine in the background (not in
  // touch mode, and not when the device asks to save data)
  const saveData = typeof navigator !== "undefined" && navigator.connection && navigator.connection.saveData;
  if (cfg.mode !== "touch" && !saveData) setTimeout(() => { if (!runner) warmEngine(); }, 3000);
}

// ---------- level map ----------
function openMap(id, { push = true } = {}) {
  const g = byId[id];
  if (!g) return;
  if (runner) { runner.destroy(); runner = null; }
  currentMap = id;
  const p = getProgress();
  const map = $("#map");
  map.style.setProperty("--game", g.color);
  $("#mapTitle").textContent = gameText(g, "title");
  $("#mapSub").textContent = gameText(g, "focus");
  const cur = currentLevel(id, unlockOpts(), p);
  const best = (p.games[id] && p.games[id].best) || zeros(g);
  const pos = nodePositions(g.levels.length);
  map.classList.toggle("many-levels", g.levels.length > 5);
  $("#mapPathLine").setAttribute("d", pos.map(([x, y], i) => {
    if (!i) return `M ${x} ${y}`;
    const [px, py] = pos[i - 1];
    return `C ${(px + x) / 2} ${py}, ${(px + x) / 2} ${y}, ${x} ${y}`;
  }).join(" "));
  const rtl = lang() === "ur";
  $("#mapNodes").innerHTML = g.levels.map((lv, i) => {
    const open = isUnlocked(id, i, unlockOpts(), p);
    const [x, y] = pos[i];
    const s = best[i] || 0;
    return `<button class="node ${open ? "" : "locked"} ${i === cur ? "current" : ""}" type="button" data-level="${i}" style="left:${rtl ? 100 - x : x}%;top:${y}%"
        aria-label="${esc(`${t("level")} ${i + 1}: ${levelText(g, i, "name")}${open ? "" : " (" + t("locked", { n: i }) + ")"}`)}">
      ${i === cur ? `<span class="here" aria-hidden="true">⭐</span>` : ""}
      <span class="disc">${open ? i + 1 : "🔒"}</span>
      <span class="name">${esc(levelText(g, i, "name"))}</span>
      <span class="nstars" aria-hidden="true">${[0, 1, 2].map((k) => `<span class="${k < s ? "on" : ""}">★</span>`).join("")}</span>
    </button>`;
  }).join("");
  if (rtl) $("#mapPathLine").setAttribute("transform", ""), $(".map-path").style.transform = "scaleX(-1)";
  else $(".map-path").style.transform = "";
  $("#mapNodes").querySelectorAll(".node").forEach((b) => b.addEventListener("click", () => {
    const li = +b.dataset.level;
    if (!isUnlocked(id, li, unlockOpts())) {
      sfx.locked();
      b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake");
      mapToast(t("locked", { n: li }));
      return;
    }
    sfx.tap();
    launch(id, li);
  }));
  $("#mapDeco").innerHTML = (MAP_DECO[id] || []).map((e, i) => `<span style="left:${[14, 40, 62, 84][i]}%;top:${[12, 6, 14, 8][i]}%;animation-delay:${i * 1.3}s">${e}</span>`).join("");
  showScreen("map", { push });
  startMusic(id);
  prepareCamera(g);
}

let toastT = 0;
function mapToast(msg) {
  let el = document.querySelector(".map-toast");
  if (!el) { el = document.createElement("div"); el.className = "map-toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { el.hidden = true; }, 2600);
}

// Camera games: start loading the tracker as soon as the map opens, so Start is quick.
let prepOff = null;
function prepareCamera(g) {
  const pill = $("#mapPrep");
  prepOff && prepOff();
  prepOff = null;
  pill.hidden = true;
  if ((g.input !== "face" && g.input !== "hands" && g.input !== "pose") || cfg.mode === "touch") return;
  if (isLoaded(g.input)) return;
  pill.hidden = false;
  pill.textContent = "📷 " + t("loadingTracker", { p: 0 });
  prepOff = onLoadProgress((kind, p) => {
    if (kind !== g.input) return;
    pill.textContent = "📷 " + t("loadingTracker", { p: Math.round(p * 100) });
    if (p >= 1) setTimeout(() => (pill.hidden = true), 600);
  });
  preload(g.input, { modelBase: cfg.modelBase }).catch(() => { pill.hidden = true; });
}

// ---------- game ----------
function launch(id, levelIndex = 0) {
  const def = byId[id];
  if (!def || !Runner) return;
  levelIndex = Math.max(0, Math.min(def.levels.length - 1, levelIndex | 0));
  if (runner) runner.destroy();
  for (const s of SCREENS) $("#" + s).hidden = true;
  $("#gameView").hidden = false;
  $("#gameView").classList.remove("rotate-ok");
  document.title = `${gameText(def, "title")} · ${t("brand")}`;
  const els = {
    stage: $("#stage"), canvas: $("#stageCanvas"), overlay: $("#overlay"), controls: $("#controls"),
    toast: $("#toast"), cam: $("#cam"), title: $("#gTitle"), levelLabel: $("#gLevel"),
    progress: $("#gProgress"), timer: $("#gTimer"), pause: $("#gPause"),
  };
  els.pause.onclick = () => runner && runner.togglePause();
  $("#gExit").onclick = () => runner && runner.exit();
  $("#gExit").setAttribute("aria-label", t("exit"));
  els.pause.setAttribute("aria-label", t("pause"));
  runner = new Runner(els, def, {
    levelIndex,
    config: cfg,
    canPlayLevel: (gid, li) => isUnlocked(gid, li, unlockOpts()),
    onExit: () => {
      runner = null;
      document.title = t("brand");
      if (cfg.embedded) notifyParentExit();
      else openMap(id, { push: false });
    },
    onNavigate: (gid, li) => launch(gid, li),
    onReport: cfg.embedded ? null : (rid) => openGrown("sessions", rid),
  });
  runner.begin();
}

function notifyParentExit() {
  try { if (cfg.parentOrigin) window.parent.postMessage({ type: "lingualink:game-exit" }, cfg.parentOrigin); } catch {}
  showHome({ push: false });
}

// ---------- sticker book ----------
function openStickers() {
  const p = getProgress();
  $("#stCount").textContent = t("stickersCount", { n: p.stickers.length, m: STICKER_TOTAL });
  $("#stGrid").innerHTML = GAMES.map((g) => STICKERS[g.id].map((e, i) => {
    const got = p.stickers.includes(`${g.id}:${i + 1}`);
    return `<div class="st ${got ? "got" : "no"}" style="--game:${g.color}" title="${esc(gameText(g, "title"))} · ${esc(levelText(g, i, "name"))}">${got ? e : e}<small>${i + 1}</small></div>`;
  }).join("")).join("");
  $("#stickers").showModal();
}

// ---------- grown-ups ----------
function holdToOpen(btn, ms, fn) {
  let timer = 0;
  const start = (e) => { if (e.button > 0) return; btn.classList.add("holding"); timer = setTimeout(() => { btn.classList.remove("holding"); fn(); }, ms); };
  const cancel = () => { clearTimeout(timer); btn.classList.remove("holding"); };
  btn.addEventListener("pointerdown", start);
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => btn.addEventListener(ev, cancel));
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
  // Keyboard users (adults at a computer) open it straight away.
  btn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } });
}

function openGrown(tab = "sessions", resultId = null) {
  const d = $("#grown");
  if (!d.open) d.showModal();
  selectTab(tab);
  if (resultId) showSession(resultId);
}

function selectTab(tab) {
  document.querySelectorAll(".gr-tabs [role=tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  document.querySelectorAll(".gr-panel").forEach((p) => { p.hidden = p.id !== "panel-" + tab; });
  if (tab === "sessions") renderSessions();
  if (tab === "progress") renderProgress();
  if (tab === "levels") renderPick();
  if (tab === "settings") fillSettings();
  if (tab === "about") renderAbout();
}

const fmtDate = (iso) => { try { return new Date(iso).toLocaleString(lang() === "ur" ? "ur-PK" : undefined, { dateStyle: "medium", timeStyle: "short" }); } catch { return iso; } };
const stars = (n) => `<span class="mini-stars" aria-label="${n} / 3">${"★".repeat(n)}${"☆".repeat(3 - n)}</span>`;
const gTitle = (id) => (byId[id] ? gameText(byId[id], "title") : id);
const lvName = (r) => (byId[r.game] ? levelText(byId[r.game], r.level - 1, "name") : r.level_name);

function renderSessions() {
  const rows = history();
  const box = $("#panel-sessions");
  if (!rows.length) { box.innerHTML = `<h3>${esc(t("tabSessions"))}</h3><div class="empty-state">${esc(t("noRecent"))}</div>`; return; }
  box.innerHTML = `<div class="gr-row"><h3>${esc(t("tabSessions"))} <span class="muted">· ${esc(t("sessionsCount", { n: rows.length }))}</span></h3></div>
    <div class="sess-list">${rows.map((r) => `
      <button class="sess" type="button" data-id="${esc(r.result_id)}" style="--game:${byId[r.game] ? byId[r.game].color : "#999"}">
        <span class="bar" aria-hidden="true"></span>
        <span class="what"><b>${esc(gTitle(r.game))} · ${esc(t("level"))} ${r.level} · ${esc(lvName(r))}</b>
          <span>${esc(fmtDate(r.ended_at))} · ${esc(r.input_mode === "sensors" ? t("sensors") : t("touch"))} · ${esc(formatDuration(r.duration_sec))}
          ${r.completed ? `<span class="chip ok">${esc(t("completedYes"))}</span>` : `<span class="chip warn">${esc(t("completedNo"))}</span>`}</span></span>
        <span class="score"><b>${r.score}</b>${stars(r.stars)}</span>
      </button>`).join("")}</div>`;
  box.querySelectorAll(".sess").forEach((b) => b.addEventListener("click", () => showSession(b.dataset.id)));
}

function chartSvg(points) {
  if (!points.length) return "";
  const bw = 34, gap = 14, h = 150, top = 14, base = h - 26;
  const max = Math.max(...points.map((p) => Math.max(p.value || 0, p.target || 0)), 0.001);
  const w = points.length * (bw + gap) + gap + 30;
  const y = (v) => base - (v / max) * (base - top);
  const bars = points.map((p, i) => {
    const x = 30 + gap + i * (bw + gap);
    const v = Math.max(0.02 * max, p.value || 0);
    const lab = p.label.length > 8 ? p.label.slice(0, 7) + "…" : p.label;
    return `<rect class="${p.ok ? "bar-ok" : "bar-no"}" x="${x}" y="${y(v)}" width="${bw}" height="${base - y(v)}" rx="6"><title>${esc(p.label)}: ${p.text ? esc(p.text) : p.value + (p.unit || "")}</title></rect>
      ${p.target && p.unit ? `<line class="target" x1="${x - 4}" x2="${x + bw + 4}" y1="${y(p.target)}" y2="${y(p.target)}"/>` : ""}
      <text x="${x + bw / 2}" y="${h - 8}" text-anchor="middle">${esc(lab)}</text>`;
  }).join("");
  const unit = points[0].unit;
  const axis = unit ? `<text x="0" y="${top + 4}">${Math.round(max * 10) / 10}${unit}</text><text x="0" y="${base}">0</text>` : "";
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(t("perRound"))}"><line class="axis" x1="28" x2="${w}" y1="${base}" y2="${base}"/>${axis}${bars}</svg>`;
}

function reportHtml(r) {
  const g = byId[r.game];
  const m = r.metrics || {};
  const ad = m.adaptive;
  const pts = perRound(r);
  const d = r.delivery || {};
  const deliv = [d.local !== false ? t("deliveredLocal") : "", d.parent === "confirmed" ? t("deliveredParent") : d.parent === "waiting" ? t("deliveredParentWaiting") : "", d.server === "sent" ? t("deliveredServer") : d.server === "queued" ? t("deliveredQueued") : ""].filter(Boolean).join(" · ");
  return `<div class="report" style="--game:${g ? g.color : "#999"}">
    <div class="report-head">
      <div><p class="muted">${esc(t("sessionReport"))} · ${esc(t("brand"))}</p><h3>${esc(gTitle(r.game))} · ${esc(t("level"))} ${r.level}: ${esc(lvName(r))}</h3>
        <p class="meta">${esc(fmtDate(r.started_at))} · ${esc(t("duration"))} ${esc(formatDuration(r.duration_sec))} · ${esc(r.input_mode === "sensors" ? t("sensors") : t("touch"))}
        ${r.patient_ref ? ` · ${esc(r.patient_ref)}` : ""} · ${r.completed ? esc(t("completedYes")) : esc(t("completedNo"))}</p></div>
      <div class="report-score"><b>${r.score}</b><span class="muted">/100</span><br>${stars(r.stars)}</div>
    </div>
    <ul class="report-lines">${describe(r).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
    <p><b>${esc({ next: t("suggestNext"), stay: t("suggestStay"), easier: t("suggestEasier"), unfinished: t("suggestUnfinished") }[r.suggestion] || "")}</b></p>
    ${pts.length ? `<div><h4>${esc(t("perRound"))}</h4><div class="chart-wrap">${chartSvg(pts)}</div></div>` : ""}
    <div><h4>${esc(t("adaptiveChanges"))}</h4><p class="muted">${ad && ad.enabled && (ad.made_easier || ad.made_harder)
      ? esc([ad.made_easier ? t("madeEasier", { n: ad.made_easier }) : "", ad.made_harder ? t("madeHarder", { n: ad.made_harder }) : ""].filter(Boolean).join(", "))
      : esc(t("noChanges"))}</p></div>
    <p class="report-foot">${esc(deliv)}<br>${esc(t("reportFooter"))}</p>
    <div class="report-actions">
      <button class="btn btn-primary" type="button" data-act="pdf">${esc(t("savePdf"))}</button>
      <button class="btn btn-ghost" type="button" data-act="back">${esc(t("back"))}</button>
    </div>
  </div>`;
}

function showSession(id) {
  const r = history().find((h) => h.result_id === id);
  if (!r) return renderSessions();
  const box = $("#panel-sessions");
  box.innerHTML = reportHtml(r);
  box.querySelector("[data-act=pdf]").addEventListener("click", () => printReport(r));
  box.querySelector("[data-act=back]").addEventListener("click", renderSessions);
  box.scrollIntoView({ block: "start" });
}

function printReport(r) {
  const area = $("#printArea");
  area.innerHTML = reportHtml(r);
  const d = $("#grown");
  // A modal dialog sits in the top layer and would print over the report, so close it first.
  d.close();
  const done = () => { area.innerHTML = ""; window.removeEventListener("afterprint", done); openGrown("sessions", r.result_id); };
  window.addEventListener("afterprint", done);
  setTimeout(() => window.print(), 50);
}

function sparkline(scores) {
  if (!scores.length) return "";
  const w = 150, h = 44, n = scores.length;
  const x = (i) => (n === 1 ? w / 2 : 4 + (i * (w - 8)) / (n - 1));
  const y = (v) => h - 6 - (v / 100) * (h - 12);
  const d = scores.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${d} L${x(n - 1).toFixed(1)} ${h - 6} L${x(0).toFixed(1)} ${h - 6} Z`;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(t("trend"))}: ${scores.join(", ")}"><path class="area" d="${area}"/><path d="${d}"/><circle cx="${x(n - 1)}" cy="${y(scores[n - 1])}" r="3.5"/></svg>`;
}

// The therapy measure for each level played: first session and latest, so change can be seen.
function levelTrend(rows, id) {
  const lines = progressByLevel(rows);
  if (!lines.length) return "";
  return `<ul class="trend-list">${lines.map((l) => `<li><b>${esc(t("level"))} ${l.level}</b> ${esc(t(l.label))}: ${l.sessions > 1 ? `${esc(l.first)} → ` : ""}<strong>${esc(l.latest)}</strong> ${l.change > 0 ? `<span class="up">▲</span>` : l.change < 0 ? `<span class="down">▼</span>` : ""} <span class="muted">(×${l.sessions})</span></li>`).join("")}</ul>`;
}

function renderProgress() {
  const p = getProgress();
  const rows = history();
  $("#panel-progress").innerHTML = `<h3>${esc(t("tabProgress"))}</h3><div class="prog">${GAMES.map((g) => {
    const gp = p.games[g.id];
    const mine = rows.filter((r) => r.game === g.id);
    const scores = mine.slice(0, 10).map((r) => r.score).reverse();
    return `<div class="prog-row" style="--game:${g.color}">
      <div><h4>${esc(gameText(g, "title"))}</h4><p class="muted">${gp ? esc(t("sessionsCount", { n: gp.plays })) + " · " + esc(t("lastPlayed", { d: fmtDate(gp.last) })) : esc(t("notPlayed"))}</p></div>
      <div class="lv-cells">${g.levels.map((lv, i) => { const s = gp ? gp.best[i] : 0; return `<div><b>${i + 1}</b><span class="stars-on">${"★".repeat(s)}</span>${"☆".repeat(3 - s)}</div>`; }).join("")}</div>
      <div>${scores.length ? sparkline(scores) : ""}</div>
      ${levelTrend(mine, g.id)}
    </div>`;
  }).join("")}</div>`;
}

function renderPick() {
  $("#panel-levels").innerHTML = `<h3>${esc(t("tabLevels"))}</h3><div class="pick">${GAMES.map((g) => `
    <div class="pick-row" style="--game:${g.color}"><h4>${esc(gameText(g, "title"))}</h4><div class="pick-btns">${g.levels.map((lv, i) =>
      `<button type="button" data-game="${g.id}" data-level="${i}"><i>${i + 1}</i><span>${esc(levelText(g, i, "name"))}</span></button>`).join("")}</div></div>`).join("")}</div>`;
  $("#panel-levels").querySelectorAll("button[data-game]").forEach((b) => b.addEventListener("click", () => {
    $("#grown").close();
    currentMap = b.dataset.game;
    unlock();
    launch(b.dataset.game, +b.dataset.level);
  }));
}

function fillSettings() {
  $("#setMode").value = cfg.mode;
  $("#setLang").value = cfg.lang;
  $("#setGarden").value = cfg.gardenSound;
  $("#setSound").checked = !!cfg.sound;
  $("#setMusic").checked = !!cfg.music;
  $("#setVoice").checked = !!cfg.voicePrompts;
  $("#setCam").checked = cfg.showCamera !== false;
  $("#setOnlineSpeech").checked = !!cfg.onlineSpeech;
  $("#setAdaptive").checked = cfg.adaptive !== false;
  $("#setWholeHand").checked = !!cfg.wholeHand;
  $("#setUnlock").checked = !!cfg.unlockAll;
  $("#setMotion").checked = prefersReducedMotion(cfg);
  $("#savedNote").textContent = "";
}

function saveSettings(e) {
  e.preventDefault();
  const langChanged = cfg.lang !== $("#setLang").value;
  cfg.mode = $("#setMode").value;
  cfg.lang = $("#setLang").value;
  cfg.gardenSound = $("#setGarden").value;
  cfg.sound = $("#setSound").checked;
  cfg.music = $("#setMusic").checked;
  cfg.voicePrompts = $("#setVoice").checked;
  cfg.showCamera = $("#setCam").checked;
  cfg.onlineSpeech = $("#setOnlineSpeech").checked;
  cfg.adaptive = $("#setAdaptive").checked;
  cfg.wholeHand = $("#setWholeHand").checked;
  cfg.unlockAll = $("#setUnlock").checked;
  cfg.reducedMotion = $("#setMotion").checked;
  const prefs = {};
  for (const k of PREF_KEYS) prefs[k] = cfg[k];
  prefs.promptsV = 3;
  save("prefs", prefs);
  applyPrefs();
  i18nStatic();
  if (cfg.music) startMusic("hub");
  renderHome();
  if (currentMap) openMap(currentMap, { push: false });
  if (langChanged) selectTab("settings");
  $("#savedNote").textContent = t("saved");
}

function renderAbout() {
  let armed = false;
  $("#panel-about").innerHTML = `<div class="about">
    <h3>${esc(t("brand"))} ${VERSION}</h3>
    <p>${esc(t(cfg.onlineSpeech && !cfg.onlineLocked ? "privacyOnline" : "privacy"))}</p>
    <p class="muted">${esc(t("reportFooter"))}</p>
    <p class="muted">${GAMES.length} · ${GAMES.reduce((a, g) => a + g.levels.length, 0)}</p>
    <div><button class="btn danger" type="button" id="clearAll">${esc(t("clearData"))}</button> <span id="clearNote" class="saved-note" role="status"></span></div>
  </div>`;
  $("#clearAll").addEventListener("click", (e) => {
    if (!armed) { armed = true; e.currentTarget.textContent = t("clearConfirm"); return; }
    clearHistory(); clearProgress();
    $("#clearNote").textContent = t("cleared");
    e.currentTarget.textContent = t("clearData");
    armed = false;
    renderHome();
  });
}

// ---------- start ----------
async function init() {
  applyPrefs();
  i18nStatic();
  listenForAcks();
  if (cfg.resultUrl) { flushOutbox(cfg); window.addEventListener("online", () => flushOutbox(cfg)); }

  $("#openStickers").addEventListener("click", () => { sfx.tap(); openStickers(); });
  document.querySelectorAll(".music-toggle").forEach((b) => b.addEventListener("click", () => { unlock(); toggleMusic(); }));
  holdToOpen($("#openGrown"), 2000, () => { sfx.tap(); openGrown("sessions"); });
  $("#mapBack").addEventListener("click", () => { sfx.tap(); showHome(); });
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
  document.querySelectorAll("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));
  document.querySelectorAll(".gr-tabs [role=tab]").forEach((b) => b.addEventListener("click", () => selectTab(b.dataset.tab)));
  $(".gr-tabs").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const tabs = [...document.querySelectorAll(".gr-tabs [role=tab]")];
    const i = tabs.indexOf(document.activeElement);
    const n = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    n.focus(); selectTab(n.dataset.tab);
  });
  $("#settingsForm").addEventListener("submit", saveSettings);
  $("#rotateDismiss").addEventListener("click", () => $("#gameView").classList.add("rotate-ok"));

  // Public hook for LinguaLink360 pages and automated tests.
  window.LinguaLinkPlay = {
    version: VERSION,
    launch: async (id, li = 0) => { await loadGames(); currentMap = id; launch(id, li); },
    openMap: async (id) => { await loadGames(); openMap(id); },
    openGrownUps: (tab) => openGrown(tab),
    games: () => GAMES.map((g) => ({ id: g.id, title: g.title, levels: g.levels.map((l) => l.name) })),
    finishNow: () => runner && runner.forceFinish(),
    runner: () => runner,
  };

  // Offline support starts on the first visit, before anyone taps "Tap to play".
  if ("serviceWorker" in navigator && location.protocol !== "file:" && !cfg.embedded) {
    // When a new release takes over, reload once so the page runs the new code, but never in the
    // middle of a game.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      if (!runner) location.reload();
    });
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => reg.update()).catch(() => {});
  }

  if (cfg.skipSplash || cfg.game) {
    $("#splash").hidden = true;
    await loadGames();
    if (cfg.game) { currentMap = cfg.game; launch(cfg.game, (cfg.level || 1) - 1); }
    else if (!runner) showHome({ replace: true }); // a game may already have been started through the page API
  } else {
    await runSplash();
  }
}

init();
export { GAME_IDS };
