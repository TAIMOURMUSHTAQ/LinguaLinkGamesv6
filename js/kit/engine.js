// Game runner shared by every game: intro, sensor setup and calibration, countdown, the play loop,
// pause, results, and sending the result to LinguaLink360.
//
// Every step after an `await` checks `this.closed`: if the player has left (✕, Back, or a new
// game), the start-up stops there, the camera or microphone is released, and nothing is saved.
import { W, H, Particles, label, lumi, clamp, ease } from "./draw.js";
import { rays } from "./scene.js";
import { sfx, unlock, say, stopSpeech, startMusic, stopMusic } from "./audio.js";
import { Mic } from "./mic.js";
import { Tracker, isLoaded } from "./vision.js";
import { t, lang, gameText, levelText, praise, howToText } from "./i18n.js";
import { buildResult, emitResult, starsFor, suggestionFor, adjustSuggestion } from "./results.js";
import { recordResult } from "./progress.js";
import { describe, therapyChange } from "./report.js";
import { history } from "./results.js";
import { load, save } from "./storage.js";
import { Adaptive } from "./adaptive.js";
import { prefersReducedMotion } from "./config.js";
import { measureBody, baseFrom } from "./body.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Runner {
  constructor(els, def, { levelIndex = 0, config, onExit, onNavigate, onReport, canPlayLevel = () => true }) {
    this.els = els;
    this.def = def;
    this.levelIndex = levelIndex;
    this.level = def.levels[levelIndex];
    this.config = config;
    this.onExit = onExit;
    this.onNavigate = onNavigate;
    this.onReport = onReport;
    this.canPlayLevel = canPlayLevel;
    this.state = "intro";       // intro | loading | calibrate | countdown | play | done | closed
    this.closed = false;
    this.paused = false;
    this.mode = "touch";
    this.mic = null;
    this.tracker = null;
    // A game may offer ways to play (Sky Glide: Keep flying, Stop and say); the choice is remembered.
    const ids = (def.variants || []).map((v) => v.id);
    const wanted = config.variant || load("variant:" + def.id, null);
    this.variant = ids.length ? (ids.includes(wanted) ? wanted : ids[0]) : null;
    this.reduced = prefersReducedMotion(config);
    this.fx = new Particles({ reduced: this.reduced });
    this.events = [];
    this.pointer = { x: W / 2, y: H / 2, down: false, justDown: false, active: false };
    this.keys = new Set();
    this._raf = 0;
    this._bound = [];
    this.canvas = els.canvas;
    this.c = this.canvas.getContext("2d");
    this._setupCanvas();
    this._setupInput();
  }

  // ---------- setup ----------
  _setupCanvas() {
    // Phones and tablets draw at most 1.5 pixels per point; any device that cannot keep up drops to 1
    // (see _govern). The picture stays sharp enough and the game stays smooth and responsive.
    let coarse = false;
    try { coarse = window.matchMedia("(pointer: coarse)").matches; } catch {}
    this._dprCap = coarse ? 1.5 : 2;
    const fit = () => {
      const box = this.els.stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, this._dprCap);
      const scale = Math.min(box.width / W, box.height / H) || 1;
      const cw = Math.round(W * scale), ch = Math.round(H * scale);
      this.canvas.style.width = cw + "px";
      this.canvas.style.height = ch + "px";
      this.canvas.width = Math.max(1, Math.round(cw * dpr));
      this.canvas.height = Math.max(1, Math.round(ch * dpr));
      this.scale = scale * dpr;
      if (this.state === "intro" || this.state === "loading" || this.state === "calibrate") this._drawIdle();
      else if (this.state === "done" || this.paused) this._drawFrame();
    };
    fit();
    this._fit = fit;
    this._on(window, "resize", fit);
    // The stage also shrinks when touch controls appear under it, so watch its size directly.
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => fit());
      ro.observe(this.els.stage);
      this._bound.push(() => ro.disconnect());
    }
  }

  _on(target, ev, fn, opts) {
    target.addEventListener(ev, fn, opts);
    this._bound.push(() => target.removeEventListener(ev, fn, opts));
  }

  _setupInput() {
    const toLogical = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    };
    const live = () => this.game && this.game.onPointer && this.state === "play" && !this.paused;
    this._on(this.canvas, "pointerdown", (e) => {
      const p = toLogical(e);
      Object.assign(this.pointer, p, { down: true, justDown: true, active: true });
      live() && this.game.onPointer("down", p.x, p.y);
    });
    this._on(this.canvas, "pointermove", (e) => {
      const p = toLogical(e);
      Object.assign(this.pointer, p, { active: true });
      live() && this.game.onPointer("move", p.x, p.y);
    });
    const up = (e) => {
      this.pointer.down = false;
      // A finger that lifts is gone; a mouse pointer stays on screen.
      if (e && e.pointerType && e.pointerType !== "mouse") this.pointer.active = false;
      this.game && this.game.onPointer && this.game.onPointer("up", this.pointer.x, this.pointer.y);
    };
    this._on(window, "pointerup", up);
    this._on(window, "pointercancel", up);
    this._on(window, "keydown", (e) => {
      if (e.key === "Escape" && this._pausable()) { this.togglePause(); return; }
      if (e.key === " " && this.state === "play") e.preventDefault();
      this.keys.add(e.key);
      if (e.key === " " && this._holdControl && !this.paused && !e.repeat) this._holdControl.onDown();
    });
    this._on(window, "keyup", (e) => {
      this.keys.delete(e.key);
      if (e.key === " " && this._holdControl) this._holdControl.onUp();
    });
    this._on(document, "visibilitychange", () => { if (document.hidden && this._pausable() && !this.paused) this.togglePause(); });
  }

  _pausable() { return this.state === "play" || this.state === "countdown" || this.state === "calibrate"; }

  // Resolves when the game is not paused (or has been closed).
  async _unpaused() {
    while (this.paused && !this.closed) await wait(100);
  }

  // ---------- flow ----------
  begin() {
    const def = this.def, li = this.levelIndex;
    this.els.title.textContent = gameText(def, "title");
    this.els.levelLabel.textContent = `${t("level")} ${li + 1} · ${levelText(def, li, "name")}`;
    this.els.progress.textContent = "";
    this.els.timer.textContent = "";
    this.els.controls.innerHTML = "";
    this.els.controls.hidden = true;
    this.els.cam.hidden = true;
    this.els.pause.hidden = true;
    this._drawIdle();
    startMusic(def.id);
    const sensorLabel = gameText(def, "input");
    const controls = this.config.mode === "touch" ? gameText(def, "touch")
      : this.config.mode === "auto" ? t("controlsAuto", { sensor: sensorLabel }) : sensorLabel;
    // How to play: shown at the start of every game, in a few short steps with pictures.
    const steps = howToText(def);
    const howTo = steps.length ? `<div class="ov-howto"><h3>${esc(t("howToPlay"))}</h3><ol>${steps.map(([icon, text]) => `<li><span class="h-icon" aria-hidden="true">${icon}</span><span>${esc(text)}</span></li>`).join("")}</ol></div>` : "";
    this._overlay(`
      <div class="ov-card ov-intro" style="--game:${def.color}">
        <div class="ov-badge" aria-hidden="true">${li + 1}</div>
        <p class="ov-eyebrow">${esc(t("levelOf", { n: li + 1, m: def.levels.length }))}</p>
        <h2>${esc(levelText(def, li, "name"))}</h2>
        <p class="ov-goal">${esc(levelText(def, li, "goal"))}</p>
        ${howTo}
        <ul class="ov-meta">
          <li><span>${esc(t("controls"))}</span>${esc(controls)}</li>
        </ul>
        ${this._variantHtml()}
        <p class="ov-note">${esc(t(this.config.onlineSpeech && !this.config.onlineLocked ? "privacyOnline" : "privacy"))}</p>
        <div class="ov-actions"><button class="btn btn-primary btn-big" data-act="start">${esc(t("start"))}</button>
        <button class="btn btn-ghost" data-act="exit">${esc(t("backToMap"))}</button></div>
      </div>`);
    this._wire({ start: () => this._start(), exit: () => this.exit() });
    this.els.overlay.querySelectorAll("[data-variant]").forEach((b) => b.addEventListener("click", () => {
      sfx.tap();
      this.variant = b.dataset.variant;
      save("variant:" + def.id, this.variant);
      this.els.overlay.querySelectorAll("[data-variant]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    }));
    setTimeout(() => { const b = this.els.overlay.querySelector("[data-act=start]"); b && b.focus(); }, 30);
  }

  _variantHtml() {
    const list = this.def.variants;
    // A choice that only matters with a microphone or camera is not offered in touch mode.
    if (!list || (this.def.variantsNeedSensors && this.config.mode === "touch")) return "";
    const txt = (v, f) => t(`${this.def.id}.variant.${v.id}.${f}`);
    return `<div class="ov-variants" role="group" aria-label="${esc(t("howToPlay"))}">${list.map((v) => `
      <button type="button" class="variant" data-variant="${v.id}" aria-pressed="${v.id === this.variant}">
        <span class="v-icon" aria-hidden="true">${v.icon}</span><b>${esc(txt(v, "label"))}</b><small>${esc(txt(v, "note"))}</small>
      </button>`).join("")}</div>`;
  }

  _loadingCard(title, text, pct = null) {
    const bar = pct == null ? `<div class="spinner" aria-hidden="true"></div>`
      : `<div class="ov-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct * 100)}"><i style="width:${Math.round(pct * 100)}%"></i></div>`;
    return `<div class="ov-card ov-loading"><div class="ov-lumi" aria-hidden="true"><span></span></div><h2>${esc(title)}</h2><p class="ov-goal" data-role="text">${esc(text)}</p>${bar}</div>`;
  }

  async _start() {
    if (this.state !== "intro") return;
    unlock();
    sfx.tick();
    this.state = "loading";
    const needs = this.def.input; // "mic" | "face" | "hands" | "pose" | "mic-optional"
    const usesMic = needs === "mic" || needs === "mic-optional";
    if (usesMic) stopMusic();     // music must never be heard as the child's voice
    let sensorOk = false, failMsg = "noSensor";
    if (this.config.mode !== "touch") {
      try {
        if (usesMic) {
          this._overlay(this._loadingCard(t("calibrating"), t("allowAccess")));
          this.mic = new Mic(this.def.mic || {});
          await this.mic.start();
        } else {
          const firstLoad = !isLoaded(needs);
          this._overlay(this._loadingCard(t("calibrating"), firstLoad ? t("loadingTrackerNote") : t("allowAccess"), firstLoad ? 0 : null));
          this.tracker = new Tracker(needs, {
            modelBase: this.config.modelBase,
            onProgress: (p) => this._setLoading(p),
          });
          this.tracker.wholeHand = !!this.config.wholeHand;
          await this.tracker.start(() => this.closed);
        }
        sensorOk = true;
      } catch (err) {
        if (this.closed) return;
        this.mic && this.mic.stop();
        this.tracker && this.tracker.stop();
        this.mic = null;
        this.tracker = null;
        const name = String((err && err.name) || err);
        if (!/NotAllowed|NotFound|no-media|Security|NotReadable/i.test(name) && !usesMic) failMsg = "trackerFailed";
        this.event("sensor_unavailable", { reason: name });
      }
    }
    if (this.closed) { this._stopSensors(); return; }
    this.mode = sensorOk ? "sensors" : "touch";
    if (!sensorOk && this.config.mode !== "touch") this._toast(t(failMsg));
    this.state = "calibrate";
    this.els.pause.hidden = false;
    if (sensorOk) await this._calibrate(needs);
    if (this.closed) return;
    await this._unpaused();
    if (this.closed) return;
    this._createGame();
    await this._countdown();
    if (this.closed) return;
    this._play();
  }

  _setLoading(p) {
    const bar = this.els.overlay.querySelector(".ov-progress i");
    if (!bar) return;
    const pct = Math.round(clamp(p, 0, 1) * 100);
    bar.style.width = pct + "%";
    bar.parentElement.setAttribute("aria-valuenow", String(pct));
    const txt = this.els.overlay.querySelector("[data-role=text]");
    if (txt) txt.textContent = t("loadingTracker", { p: pct });
  }

  async _calibrate(needs) {
    if (this.mic) {
      this._overlay(this._loadingCard(t("calibrating"), t("stayQuiet")));
      const floor = await this.mic.calibrateFloor(1.5, () => this.closed);
      if (this.closed) return;
      this.event("calibrated_noise_floor", { db: Math.round(floor) });
    }
    if (this.tracker && needs === "face") {
      this._overlay(this._loadingCard(t("calibrating"), t("relaxFace")));
      this.faceBase = await this._sampleFace(2000);
      if (this.closed) return;
      this.event("calibrated_face", this.faceBase);
    }
    if (this.tracker && needs === "hands") {
      this._overlay(this._loadingCard(t("calibrating"), t("showHands")));
      await this._waitHands(5000);
      if (this.closed) return;
    }
    if (this.tracker && needs === "pose") {
      this._overlay(this._loadingCard(t("calibrating"), t("standBack")));
      this.poseBase = await this._samplePose(10000);
      if (this.closed) return;
      this.event("calibrated_pose", { seen: !!this.poseBase });
    }
    if (this.tracker && this.config.showCamera !== false) this.els.cam.hidden = false;
  }

  _sampleFace(ms) {
    return new Promise((resolve) => {
      // every measure of the face at rest (blend scores and shape measures), as medians
      const acc = {};
      let elapsed = 0, last = performance.now();
      const step = (now) => {
        if (this.closed) return resolve(null);
        const dt = now - last; last = now;
        if (!this.paused) {
          elapsed += dt;
          this.tracker.update();
          this.tracker.drawPreview(this.els.cam);
          const f = this.tracker.face;
          if (f.present) for (const [k, v] of Object.entries(f)) if (typeof v === "number") (acc[k] ||= []).push(v);
        }
        // a face that has not been seen yet gets up to 3 s more
        if (elapsed < ms || (!acc.jawOpen && elapsed < ms + 3000)) requestAnimationFrame(step);
        else {
          const med = (a) => (a && a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
          const out = { jawOpen: 0, pucker: 0, smile: 0, puff: 0, mouthW: 0 };
          for (const k of Object.keys(acc)) out[k] = med(acc[k]);
          resolve(out);
        }
      };
      this.els.cam.hidden = this.config.showCamera === false;
      requestAnimationFrame(step);
    });
  }

  // Wait until the whole body is in view, then measure the child standing still for a moment.
  _samplePose(ms) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const frames = [];
      this.els.cam.hidden = this.config.showCamera === false;
      const step = () => {
        if (this.closed) return resolve(null);
        const now = performance.now();
        if (!this.paused) {
          this.tracker.update();
          this.tracker.drawPreview(this.els.cam);
          const m = measureBody(this.tracker.pose);
          if (m) frames.push(m);
        }
        if (frames.length >= 25) return resolve(baseFrom(frames));
        if (now - t0 > ms) return resolve(frames.length >= 5 ? baseFrom(frames) : null);
        requestAnimationFrame(step);
      };
      step();
    });
  }

  _waitHands(ms) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      this.els.cam.hidden = this.config.showCamera === false;
      const step = () => {
        if (this.closed) return resolve();
        this.tracker.update();
        this.tracker.drawPreview(this.els.cam);
        if (this.tracker.hands.length || performance.now() - t0 > ms) resolve();
        else requestAnimationFrame(step);
      };
      step();
    });
  }

  _createGame() {
    const self = this;
    this.ctx = {
      W, H,
      level: this.level,
      levelIndex: this.levelIndex,
      mode: this.mode,
      mic: this.mic,
      tracker: this.tracker,
      faceBase: this.faceBase || { jawOpen: 0, pucker: 0, smile: 0, puff: 0, mouthW: 0 },
      poseBase: this.poseBase || null,
      variant: this.variant,
      pointer: this.pointer,
      keys: this.keys,
      fx: this.fx,
      sfx,
      t,
      lang: lang(),
      config: this.config,
      reduced: this.reduced,
      get time() { return self.playTime || 0; },
      // scenery time: stands still when "Less movement on screen" is on
      get anim() { return self.reduced ? 0 : self.playTime || 0; },
      say: (key, vars) => say(t(key, vars), lang()),
      // A varied word of praise, shown on screen. It is not spoken: mid-game speech interrupts
      // the child and blocks the microphone.
      praise: (x = W / 2, y = 560, color) => { const p = praise(); this.fx.text(p, x, y, color); return p; },
      event: (type, data) => this.event(type, data),
      setControls: (list) => this._setControls(list),
      toast: (msg) => this._toast(msg),
      // Each game creates one Adaptive helper; the engine records every change it makes.
      makeAdaptive: (opts = {}) => new Adaptive({
        enabled: this.config.adaptive !== false && opts.enabled !== false,
        ...opts,
        onChange: (ch) => {
          this.event("difficulty_changed", { direction: ch.direction, step: ch.step });
          if (ch.direction === "harder") { this.fx.text(t("levelUp"), W / 2, 120, "#ffd166"); sfx.whoosh(); }
          opts.onChange && opts.onChange(ch);
        },
      }),
    };
    this.game = this.def.create(this.ctx);
  }

  async _countdown() {
    this.state = "countdown";
    this._overlay("");
    for (let n = 3; n >= 0; n--) {
      await this._unpaused();
      if (this.closed) return;
      n > 0 ? sfx.tick() : sfx.go();
      const text = n > 0 ? String(n) : t("go");
      const dur = n > 0 ? 850 : 650;
      const t0 = performance.now();
      await new Promise((resolve) => {
        const frame = (now) => {
          if (this.closed) return resolve();
          const k = clamp((now - t0) / dur, 0, 1);
          this._drawFrame();
          const c = this.c;
          c.save();
          c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
          c.fillStyle = "rgba(15,23,42,0.35)";
          c.fillRect(0, 0, W, H);
          if (!this.reduced) {
            rays(c, W / 2, H / 2, 620, now / 1000, { color: `rgba(255,255,255,${0.1 * (1 - k)})`, n: 14, speed: 0.5 });
            c.strokeStyle = `rgba(255,209,102,${1 - k})`; c.lineWidth = 16 * (1 - k) + 2;
            c.beginPath(); c.arc(W / 2, H / 2, 90 + ease.out(k) * 240, 0, Math.PI * 2); c.stroke();
          }
          const s = this.reduced ? 1 : 0.6 + 0.4 * ease.back(Math.min(1, k * 2));
          c.translate(W / 2, H / 2);
          c.scale(s, s);
          c.globalAlpha = k > 0.8 ? 1 - (k - 0.8) * 5 : 1;
          label(c, text, 0, 0, { size: 170, color: n > 0 ? "#fff" : "#ffd166" });
          c.restore();
          if (k < 1) requestAnimationFrame(frame); else resolve();
        };
        requestAnimationFrame(frame);
      });
    }
  }

  _play() {
    this.state = "play";
    this.startedAt = Date.now();
    this.playTime = 0;
    this.els.pause.hidden = false;
    this.game.start && this.game.start();
    if (this.level.promptKey) this.ctx.say(this.level.promptKey);
    let last = performance.now();
    let hudAcc = 0;
    const loop = (now) => {
      if (this.closed) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!this.paused) {
        this.playTime += dt;
        if (this.mic) this.mic.update(dt);
        if (this.tracker) { this.tracker.update(); if (!this.els.cam.hidden) this.tracker.drawPreview(this.els.cam); }
        this.game.update(dt);
        this.fx.update(dt);
        this.pointer.justDown = false;
      }
      this._drawFrame();
      this._govern(now);
      hudAcc += dt;
      if (hudAcc > 0.1) { hudAcc = 0; this._hud(); }
      if (this.game.done) { this._finish(); return; }
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  // A device that cannot keep 30 frames a second for two seconds draws at 1 pixel per point from then
  // on: the game, the buttons and the camera or microphone all stay responsive.
  _govern(now) {
    const dt = now - (this._gLast || now);
    this._gLast = now;
    if (!dt || dt > 500 || this._dprCap <= 1) return;
    this._gAvg = this._gAvg ? this._gAvg * 0.95 + dt * 0.05 : dt;
    this._gSlow = this._gAvg > 34 ? (this._gSlow || 0) + dt : 0;
    if (this._gSlow > 2000 && (window.devicePixelRatio || 1) > 1) {
      this._dprCap = 1;
      this._gSlow = 0;
      this.event("lower_detail", { frame_ms: Math.round(this._gAvg) });
      this._fit && this._fit();
    }
  }

  _drawFrame() {
    const c = this.c;
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    c.clearRect(0, 0, W, H);
    if (this.game) this.game.draw(c);
    else this._drawIdle();
    this.fx.draw(c);
  }

  _drawIdle() {
    const c = this.c;
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    if (this.def.drawPreview) this.def.drawPreview(c, this.levelIndex);
    else { c.fillStyle = "#1d2b53"; c.fillRect(0, 0, W, H); lumi(c, W / 2, H / 2, 2); }
  }

  _hud() {
    const h = this.game.hud ? this.game.hud() : {};
    const ad = this.game.adaptive;
    const tag = ad && ad.enabled && ad.step !== 0 ? ` · ${t(ad.step > 0 ? "easierTag" : "harderTag")}` : "";
    this.els.progress.textContent = (h.progress || "") + tag;
    const s = Math.floor(this.playTime);
    this.els.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  togglePause() {
    if (!this._pausable()) return;
    this.paused = !this.paused;
    this.event(this.paused ? "paused" : "resumed");
    if (this.paused) {
      this._savedOverlay = this.els.overlay.innerHTML;
      this._overlay(`<div class="ov-card ov-pause"><div class="ov-lumi sleepy" aria-hidden="true"><span></span></div><h2>${esc(t("pause"))}</h2><div class="ov-actions">
        <button class="btn btn-primary btn-big" data-act="resume">${esc(t("resume"))}</button>
        <button class="btn btn-ghost" data-act="exit">${esc(t("exit"))}</button></div></div>`);
      this._wire({ resume: () => this.togglePause(), exit: () => this.exit() });
      setTimeout(() => { const b = this.els.overlay.querySelector("[data-act=resume]"); b && b.focus(); }, 30);
    } else {
      // During calibration the loading card comes back; during play the stage is clear.
      this._overlay(this.state === "calibrate" ? this._savedOverlay || "" : "");
    }
  }

  _finish() {
    if (this.state !== "play") return;
    this.state = "done";
    cancelAnimationFrame(this._raf);
    this.els.pause.hidden = true;
    this._setControls([]);
    const r = this.game.result();
    const earlier = history();
    const ad = this.game.adaptive;
    if (ad) r.metrics = { ...r.metrics, adaptive: ad.summary() };
    const suggestion = adjustSuggestion(suggestionFor(r.score), ad && ad.enabled ? ad.step : 0, r.completed);
    const result = buildResult({
      game: this.def.id, gameVersion: this.def.version, level: this.levelIndex + 1, levelName: this.level.name,
      mode: this.mode, startedAt: this.startedAt, endedAt: Date.now(), completed: r.completed,
      score: r.score, metrics: r.metrics, events: this.events, config: this.config, suggestion,
      settings: { ...(this.level.settings || {}), ...(r.settings || {}), adaptive: !!(ad && ad.enabled) },
    });
    this.lastResult = result;
    this._stopSensors();
    // Record and send in the background; the result screen appears straight away.
    const gained = recordResult(result);
    this.delivery = emitResult(result, this.config, (d) => { this.delivery = d; this._showDelivery(); });
    if (result.stars >= 2) sfx.levelUp(); else sfx.soft();
    if (gained.newSticker) setTimeout(() => sfx.sticker(), 900);
    for (let i = 0; i < result.stars; i++) setTimeout(() => { this.fx.burst(W / 2 + (i - 1) * 120, H / 2 - 40, { n: 26 }); this.fx.ring(W / 2 + (i - 1) * 120, H / 2 - 40); }, i * 220);
    if (result.stars >= 1) this.fx.confetti(result.stars * 35);
    const settle = () => { if (this.closed) return; this.fx.update(1 / 60); this._drawFrame(); if (this.fx.list.length || this.fx.texts.length || this.fx.rings.length) requestAnimationFrame(settle); };
    requestAnimationFrame(settle);
    startMusic(this.def.id);
    say(result.stars === 3 ? t("greatJob") : result.stars >= 1 ? t("wellDone") : t("keepGoing"), lang());

    const head = result.stars === 3 ? t("greatJob") : result.stars >= 1 ? t("wellDone") : t("keepGoing");
    const sug = { next: t("suggestNext"), stay: t("suggestStay"), easier: t("suggestEasier"), unfinished: t("suggestUnfinished") }[result.suggestion];
    // The child's result card shows stars, counts and whole seconds only: no points and no
    // percentages. The full numbers stay in the grown-ups' report and in the result sent to LinguaLink360.
    const plain = (v) => !/%/.test(String(v));
    const tiles = (r.summary || []).filter((m) => plain(m.value)).slice(0, 4).map((m) => `<li><span>${esc(m.label)}</span><strong>${esc(m.value)}</strong></li>`).join("");
    const lines = describe(result).filter(plain).slice(0, 4).map((s) => `<li>${esc(s)}</li>`).join("");
    const starHtml = [0, 1, 2].map((i) => `<span class="star ${i < starsFor(result.score) ? "on" : ""}" aria-hidden="true"></span>`).join("");
    const nextIndex = this.levelIndex + 1;
    const hasNext = nextIndex < this.def.levels.length && this.canPlayLevel(this.def.id, nextIndex);
    const nextFirst = hasNext && result.suggestion === "next";
    const change = therapyChange(result, earlier);
    const trend = change && change.unit === " s" ? `<p class="ov-trend ${change.direction > 0 ? "better" : ""}"><b>${esc(t(change.label))}:</b> ${esc(change.now)}${change.before != null ? ` <span>(${esc(t("lastTime"))}: ${esc(change.before)}) ${change.direction > 0 ? "▲" : change.direction < 0 ? "▼" : ""}</span>` : ""}</p>` : "";
    const adTag = "";
    const rewards = [
      gained.newSticker ? `<div class="reward sticker"><span class="reward-icon">${gained.newSticker}</span><b>${esc(t("newSticker"))}</b></div>` : "",
      gained.unlockedLevel ? `<div class="reward unlock"><span class="reward-icon">🔓</span><b>${esc(t("unlockedLevel", { n: gained.unlockedLevel }))}</b></div>` : "",
    ].join("");
    this._overlay(`
      <div class="ov-card ov-result" style="--game:${this.def.color}">
        <div class="stars" role="img" aria-label="${result.stars} / 3">${starHtml}</div>
        <h2>${esc(head)}</h2>
        ${rewards ? `<div class="rewards">${rewards}</div>` : ""}
        <ul class="ov-metrics">${tiles}</ul>
        ${trend}
        ${adTag}
        <div class="ov-did"><h3>${esc(t("whatYouDid"))}</h3><ul>${lines}</ul></div>
        <p class="ov-suggest">${esc(sug)}</p>
        <div class="ov-actions">
          ${nextFirst ? `<button class="btn btn-primary btn-big" data-act="next">${esc(t("nextLevel"))}</button>` : ""}
          <button class="btn ${nextFirst ? "btn-ghost" : "btn-primary btn-big"}" data-act="again">${esc(t("playAgain"))}</button>
          ${hasNext && !nextFirst ? `<button class="btn btn-ghost" data-act="next">${esc(t("nextLevel"))}</button>` : ""}
          <button class="btn btn-ghost" data-act="exit">${esc(t("backToMap"))}</button>
        </div>
        <p class="ov-delivery" data-role="delivery"></p>
        ${this.onReport ? `<button class="linkish" data-act="report">${esc(t("grownUps"))}: ${esc(t("fullReport"))}</button>` : ""}
      </div>`);
    this._showDelivery();
    this._wire({
      next: () => this.onNavigate(this.def.id, nextIndex),
      again: () => this.onNavigate(this.def.id, this.levelIndex),
      exit: () => this.exit(),
      report: () => { const id = result.result_id; this.exit(); this.onReport && this.onReport(id); },
    });
    setTimeout(() => { const b = this.els.overlay.querySelector(".ov-actions .btn"); b && b.focus(); }, 60);
  }

  _showDelivery() {
    const el = this.els.overlay.querySelector("[data-role=delivery]");
    if (!el || !this.delivery) return;
    const d = this.delivery, parts = [];
    if (d.local) parts.push(t("deliveredLocal"));
    if (d.parent === "waiting") parts.push(t("deliveredParentWaiting"));
    if (d.parent === "confirmed") parts.push(t("deliveredParent"));
    if (d.server === "sent") parts.push(t("deliveredServer"));
    if (d.server === "queued") parts.push(t("deliveredQueued"));
    el.textContent = parts.join(" · ");
  }

  // Used by automated tests: end the level now and record whatever happened so far.
  forceFinish() {
    if (this.state === "play" && this.game) this.game.done = true;
  }

  exit() {
    this.destroy();
    this.onExit && this.onExit();
  }

  destroy() {
    if (this.closed) return;
    this.closed = true;
    cancelAnimationFrame(this._raf);
    this.state = "closed";
    this._stopSensors();
    this._bound.forEach((off) => off());
    this._bound = [];
    this._setControls([]);
    this._overlay("");
    clearTimeout(this._toastT);
    this.els.toast.hidden = true;
    stopSpeech();
    this.game && this.game.destroy && this.game.destroy();
  }

  _stopSensors() {
    this.mic && this.mic.stop();
    this.tracker && this.tracker.stop();
    this.els.cam.hidden = true;
  }

  event(type, data = {}) {
    if (this.events.length < 400) this.events.push({ t: Math.round((this.playTime || 0) * 100) / 100, type, ...data });
  }

  // ---------- DOM helpers ----------
  _overlay(html) {
    this.els.overlay.innerHTML = html;
    this.els.overlay.hidden = !html;
  }

  _wire(map) {
    this.els.overlay.querySelectorAll("[data-act]").forEach((b) => {
      const fn = map[b.dataset.act];
      if (fn) b.addEventListener("click", () => { sfx.tap(); fn(); });
    });
  }

  _toast(msg) {
    const el = this.els.toast;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { el.hidden = true; }, 4200);
  }

  _setControls(list) {
    const box = this.els.controls;
    box.innerHTML = "";
    this._holdControl = null;
    for (const ctl of list || []) {
      const b = document.createElement("button");
      b.className = "ctl " + (ctl.kind === "hold" ? "ctl-hold" : "ctl-tap") + (ctl.tone ? " ctl-" + ctl.tone : "");
      b.type = "button";
      b.id = "ctl-" + ctl.id;
      b.textContent = ctl.label;
      if (ctl.kind === "hold") {
        const down = (e) => { e && e.preventDefault(); if (this.paused) return; b.classList.add("is-down"); ctl.onDown(); };
        const up = () => { b.classList.remove("is-down"); ctl.onUp(); };
        b.addEventListener("pointerdown", down);
        b.addEventListener("pointerup", up);
        b.addEventListener("pointerleave", up);
        b.addEventListener("pointercancel", up);
        b.addEventListener("contextmenu", (e) => e.preventDefault());
        if (!this._holdControl) this._holdControl = { onDown: () => { b.classList.add("is-down"); ctl.onDown(); }, onUp: up };
      } else {
        b.addEventListener("click", () => { if (!this.paused && this.state === "play") ctl.onTap(); });
      }
      box.appendChild(b);
    }
    box.hidden = !(list && list.length);
  }
}
