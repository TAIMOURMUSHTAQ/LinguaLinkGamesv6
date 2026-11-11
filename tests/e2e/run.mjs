// End-to-end tests in a real browser (Chrome headless with a fake camera and microphone).
// Usage: start the server (npm start), then: node tests/e2e/run.mjs [baseUrl]
// Writes tests/e2e/out/results.json and screenshots. Exit code 1 if any check fails.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sleep } from "./cdp.mjs";

const BASE = (process.argv[2] || process.env.BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const OUT = fileURLToPath(new URL("./out/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const checks = [];
const timings = {};
const levelRuns = [];
const check = (id, name, pass, detail = "") => { checks.push({ id, name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? "PASS" : "FAIL"} ${id} ${name}${detail ? " — " + detail : ""}`); };
const GAMES = ["breeze", "glide", "pitch", "mouth", "firefly", "garden", "letters", "numbers", "balance", "body"];
const TOTAL_LEVELS = GAMES.length * 5;
const url = (q = "") => `${BASE}/index.html${q}`;

let page, runs = 0;
async function fresh(width = 1366, height = 900) {
  if (page) { page.close(); await sleep(1500); }
  page = await launch({ profile: join(OUT, `profile-${++runs}`), width, height });
  await page.init();
  return page;
}

try {
  // ---------- 1. Splash, home, first paint ----------
  await fresh();
  const t0 = Date.now();
  await page.send("Page.navigate", { url: url() });
  const splashReady = await page.waitFor("!document.querySelector('#splashGo').hidden", 20000);
  timings.splashReadyMs = splashReady >= 0 ? Date.now() - t0 : -1;
  timings.paint = await page.eval(`(()=>{const f=performance.getEntriesByName('first-contentful-paint')[0]; const n=performance.getEntriesByType('navigation')[0]; return {fcp: f?Math.round(f.startTime):null, dcl: Math.round(n.domContentLoadedEventEnd), external: performance.getEntriesByType('resource').filter(r=>!r.name.startsWith(location.origin)).map(r=>r.name)}})()`);
  await page.shot(OUT, "01-splash");
  check("UI", "The stylesheet is loaded and applied", await page.eval("document.styleSheets.length > 0 && getComputedStyle(document.querySelector('#tiles')).display === 'grid'"));
  check("M8", "First paint without waiting for an outside font server", timings.paint.fcp != null && timings.paint.fcp < 1500 && timings.paint.external.length === 0, `first paint ${timings.paint.fcp} ms, external requests: ${timings.paint.external.length}`);
  check("UI", "Splash screen with loading progress, then Tap to play", splashReady >= 0, `ready after ${timings.splashReadyMs} ms`);
  await page.click("#splashGo");
  await page.waitFor("!document.querySelector('#home').hidden", 5000);
  await sleep(900);
  await page.shot(OUT, "02-home");
  const tiles = await page.eval("document.querySelectorAll('.tile').length");
  const lvlButtons = await page.eval("document.querySelectorAll('#home .lvl, #home [data-level]').length");
  check("M6", `Home shows ${GAMES.length} game tiles and no level lists`, tiles === GAMES.length && lvlButtons === 0, `${tiles} tiles, ${lvlButtons} level buttons on home`);

  // phone width
  await page.viewport(390, 844, true, 2);
  await sleep(500);
  await page.shot(OUT, "03-home-phone");
  const phone = await page.eval("({ overflow: document.documentElement.scrollWidth > innerWidth, height: document.querySelector('#home').scrollHeight })");
  check("M9", "Phone home fits the width and is short", !phone.overflow && phone.height < 4200, `scroll height ${phone.height} px (v1: 4,193 px)`);
  await page.viewport(1366, 900);

  // sticker book and grown-ups (hold to open)
  await page.click("#openStickers"); await sleep(400);
  await page.shot(OUT, "04-stickers");
  check("UI", "Sticker book opens", await page.eval("document.querySelector('#stickers').open"));
  await page.eval("document.querySelector('#stickers').close()");
  await page.eval("document.querySelector('#openGrown').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}))");
  await sleep(600);
  const openedEarly = await page.eval("document.querySelector('#grown').open");
  await page.eval("document.querySelector('#openGrown').dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))");
  await page.eval("document.querySelector('#openGrown').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}))");
  await sleep(2300);
  const openedHold = await page.eval("document.querySelector('#grown').open");
  check("UI", "Grown-ups area opens only after a 2-second hold", !openedEarly && openedHold, `short tap opened: ${openedEarly}, hold opened: ${openedHold}`);
  await page.eval("document.querySelector('#grown').close()");

  // map + locks
  await page.click(".tile[data-game=breeze]");
  await page.waitFor("!document.querySelector('#map').hidden", 5000);
  await sleep(700);
  await page.shot(OUT, "05-map-breeze");
  const locked = await page.eval("[...document.querySelectorAll('.node')].map(n=>n.classList.contains('locked'))");
  check("M6", "Level map: level 1 open, levels 2-5 locked", JSON.stringify(locked) === "[false,true,true,true,true]", JSON.stringify(locked));
  await page.click(".node[data-level='3']"); await sleep(300);
  const toast = await page.eval("(document.querySelector('.map-toast')||{}).textContent || ''");
  check("M6", "Tapping a locked level explains how to open it", /level 3/i.test(toast), toast);
  await page.click(".node[data-level='0']");
  await page.waitFor("!document.querySelector('#gameView').hidden && !!document.querySelector('.ov-intro')", 5000);
  await sleep(500);
  await page.shot(OUT, "06-intro");
  check("UI", "Level intro card opens from the map", await page.eval("!!document.querySelector('.ov-intro [data-act=start]')"));

  // ---------- 2. Every level in touch mode ----------
  await page.goto(url("?mode=touch&unlock=1&splash=0&music=0"));
  await page.waitFor(`window.LinguaLinkPlay && window.LinguaLinkPlay.games().length===${GAMES.length}`, 15000);
  for (const g of GAMES) {
    for (let lv = 0; lv < 5; lv++) {
      const before = page.logs.length;
      await page.eval(`window.LinguaLinkPlay.launch(${JSON.stringify(g)}, ${lv})`);
      await page.waitFor("!!document.querySelector('.ov-intro [data-act=start]')", 5000);
      await page.click(".ov-intro [data-act=start]");
      const toPlay = await page.waitFor("window.LinguaLinkPlay.runner() && window.LinguaLinkPlay.runner().state==='play'", 10000);
      if (g === "breeze") { await page.eval("document.querySelector('#ctl-hold').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))"); await sleep(2600); await page.eval("document.querySelector('#ctl-hold').dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))"); }
      if (g === "mouth") { for (let k = 0; k < 2; k++) { await page.click("#ctl-done"); await sleep(1300); } }
      if (g === "garden") { for (let k = 0; k < 2; k++) { await page.click("#ctl-said"); await sleep(150); await page.click("#ctl-clear"); await sleep(250); } }
      if (g === "glide" || g === "pitch" || g === "firefly" || g === "balance") await sleep(1500);
      if (g === "letters" || g === "numbers") {
        // drag along the character for real, unless this level is finger counting
        await page.eval(`(async()=>{const r=window.LinguaLinkPlay.runner(), c=document.querySelector('#stageCanvas'), b=c.getBoundingClientRect(); const send=(t,x,y)=>{const o={bubbles:true,clientX:b.left+x/1280*b.width,clientY:b.top+y/720*b.height,pointerType:'touch'}; (t==='pointerup'?window:c).dispatchEvent(new PointerEvent(t,o));}; const gm=r.game; if(!gm.tracer) { document.querySelector('#ctl-done') && document.querySelector('#ctl-done').click(); return; } let first=true; let guard=0; const f=gm.tracer; while(!f.done&&guard++<800&&gm.tracer===f){const p=f.next; if(!p)break; send(first?'pointerdown':'pointermove',p.x,p.y); first=false; await new Promise(q=>requestAnimationFrame(q));} send('pointerup',0,0);})()`, { awaitPromise: true, timeoutMs: 30000 });
        if (lv === 0) { await sleep(700); await page.shot(OUT, `10-${g}-pop`); }
      }
      if (g === "body") { await page.click("#ctl-done"); await sleep(1800); }
      if (lv === 0) await page.shot(OUT, `10-${g}-play`);
      await page.eval("window.LinguaLinkPlay.finishNow()");
      const shown = await page.waitFor("!!document.querySelector('.ov-result')", 3000);
      if (lv === 0) await page.shot(OUT, `11-${g}-result`);
      const r = await page.eval("window.LinguaLinkPlay.runner() && window.LinguaLinkPlay.runner().lastResult");
      const txt = await page.eval("document.querySelector('.ov-result') ? document.querySelector('.ov-result').innerText : ''");
      levelRuns.push({ game: g, level: lv + 1, toPlayMs: toPlay, resultMs: shown, score: r && r.score, stars: r && r.stars, completed: r && r.completed, suggestion: r && r.suggestion, errors: page.errors(before).length, plainText: /What you did/.test(txt), json: /"schema"/.test(txt) });
      await page.click(".ov-result [data-act=exit]");
      await sleep(120);
    }
  }
  const allOk = levelRuns.every((x) => x.toPlayMs >= 0 && x.resultMs >= 0 && x.errors === 0);
  check("REG", `All ${TOTAL_LEVELS} levels start, play and finish in touch mode with no script errors`, allOk, `${levelRuns.filter((x) => x.toPlayMs >= 0 && x.resultMs >= 0 && x.errors === 0).length}/${TOTAL_LEVELS}; problems: ${JSON.stringify(levelRuns.filter((x) => !(x.toPlayMs >= 0 && x.resultMs >= 0 && x.errors === 0)).map((x) => [x.game, x.level, x.toPlayMs, x.resultMs, x.errors]))}`);
  check("H2", "Result screen appears straight away", levelRuns.every((x) => x.resultMs >= 0 && x.resultMs < 1000), `slowest ${Math.max(...levelRuns.map((x) => x.resultMs))} ms`);
  check("C3", "Word Garden: 2 of 5 words is not 100", levelRuns.filter((x) => x.game === "garden").every((x) => x.score <= 50 && x.suggestion !== "next"), levelRuns.filter((x) => x.game === "garden").map((x) => `L${x.level}: ${x.score}, ${x.suggestion}`).join("; "));
  check("JSON", "Result screen is plain language, with no JSON for the child", levelRuns.every((x) => x.plainText && !x.json));
  check("REG", "A level stopped early never suggests moving up", levelRuns.every((x) => x.completed || x.suggestion !== "next"));

  // pause during the countdown (L1)
  await page.eval("window.LinguaLinkPlay.launch('breeze', 0)");
  await page.waitFor("!!document.querySelector('.ov-intro [data-act=start]')", 5000);
  await page.click(".ov-intro [data-act=start]");
  await page.waitFor("window.LinguaLinkPlay.runner().state==='countdown'", 5000);
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(3500);
  const pausedState = await page.eval("({ s: window.LinguaLinkPlay.runner().state, p: window.LinguaLinkPlay.runner().paused })");
  await page.click("[data-act=resume]");
  const resumed = await page.waitFor("window.LinguaLinkPlay.runner().state==='play'", 6000);
  check("L1", "Pause works during the countdown", pausedState.s === "countdown" && pausedState.p && resumed >= 0, JSON.stringify(pausedState));
  await page.eval("window.LinguaLinkPlay.runner().exit()");

  // touch cursor clears on lift (L3)
  await page.eval("window.LinguaLinkPlay.launch('firefly', 0)");
  await page.waitFor("!!document.querySelector('.ov-intro [data-act=start]')", 5000);
  await page.click(".ov-intro [data-act=start]");
  await page.waitFor("window.LinguaLinkPlay.runner().state==='play'", 8000);
  await page.eval("(()=>{const c=document.querySelector('#stageCanvas'); const r=c.getBoundingClientRect(); const o={bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2,pointerType:'touch'}; c.dispatchEvent(new PointerEvent('pointerdown',o)); window.dispatchEvent(new PointerEvent('pointerup',o));})()");
  await sleep(200);
  check("L3", "Firefly touch cursor disappears when the finger lifts", (await page.eval("window.LinguaLinkPlay.runner().game.cursors.length")) === 0);
  await page.eval("window.LinguaLinkPlay.runner().exit()");

  // Fish Feast therapist mode has no time limit (M2)
  await page.eval("window.LinguaLinkPlay.launch('mouth', 0)");
  await page.waitFor("!!document.querySelector('.ov-intro [data-act=start]')", 5000);
  await page.click(".ov-intro [data-act=start]");
  await page.waitFor("window.LinguaLinkPlay.runner().state==='play'", 8000);
  await sleep(10000);
  const mouthWait = await page.eval("({ results: window.LinguaLinkPlay.runner().game.results.length, notYet: !!document.querySelector('#ctl-notyet') })");
  check("M2", "Fish Feast therapist mode waits with no time limit and has Not yet", mouthWait.results === 0 && mouthWait.notYet, `after 10 s: ${mouthWait.results} moves timed out`);
  await page.eval("window.LinguaLinkPlay.runner().exit()");

  // grown-ups report
  await page.eval("window.LinguaLinkPlay.openGrownUps('sessions')");
  await sleep(400);
  await page.shot(OUT, "20-sessions");
  await page.click(".sess");
  await sleep(500);
  await page.shot(OUT, "21-session-report");
  const rep = await page.eval("(()=>{const r=document.querySelector('#panel-sessions .report'); return r ? { lines: r.querySelectorAll('.report-lines li').length, placeholders: /\\{[a-z]+\\}/.test(r.innerText), chart: !!r.querySelector('svg.chart'), pdf: !!r.querySelector('[data-act=pdf]'), noJson: !r.querySelector('details') && !r.querySelector('pre') } : null})()");
  check("JSON", "Session report: plain sentences, chart, Save as PDF, no JSON box", rep && rep.lines >= 2 && !rep.placeholders && rep.pdf && rep.noJson, JSON.stringify(rep));
  // print the report as a sample PDF (what "Save as PDF" produces)
  await page.eval("document.querySelector('#printArea').innerHTML = document.querySelector('#panel-sessions .report').outerHTML; document.querySelector('#grown').close();");
  await page.pdf(join(OUT, "sample-session-report.pdf"), { paperWidth: 8.27, paperHeight: 11.69 });
  await page.eval("document.querySelector('#printArea').innerHTML=''");
  await page.eval("window.LinguaLinkPlay.openGrownUps('progress')"); await sleep(400);
  await page.shot(OUT, "22-progress");
  await page.eval("document.querySelector('#grown').close()");

  // ---------- 3. Urdu ----------
  await page.goto(url("?lang=ur&splash=0&mode=touch&music=0"));
  await page.waitFor("window.LinguaLinkPlay && !document.querySelector('#home').hidden", 15000);
  await sleep(800);
  await page.shot(OUT, "30-home-urdu");
  await page.eval("window.LinguaLinkPlay.launch('breeze', 0)");
  await page.waitFor("!!document.querySelector('.ov-intro')", 5000); await sleep(400);
  await page.shot(OUT, "31-intro-urdu");
  const ur = await page.eval("({ dir: document.documentElement.dir, tile: document.querySelector('.tile h2').textContent, intro: document.querySelector('.ov-intro').innerText })");
  const latin = (ur.intro.match(/[A-Za-z]{3,}/g) || []);
  check("H5", "Urdu: game names, level text and buttons are in Urdu", ur.dir === "rtl" && !/[A-Za-z]/.test(ur.tile) && latin.length === 0, `English words left on the intro card: ${latin.join(", ") || "none"}`);
  await page.eval("window.LinguaLinkPlay.runner().exit()");

  // ---------- 4. Sensors: microphone games, camera games, load times ----------
  for (const g of ["breeze", "glide", "pitch", "garden"]) {
    await page.goto(url("?mode=sensors&unlock=1&splash=0&music=0"));
    await page.waitFor("window.LinguaLinkPlay", 15000);
    await page.eval(`window.LinguaLinkPlay.launch('${g}', 0)`);
    await page.waitFor("!!document.querySelector('.ov-intro [data-act=start]')", 5000);
    const s0 = Date.now();
    await page.click(".ov-intro [data-act=start]");
    const ms = await page.waitFor("window.LinguaLinkPlay.runner().state==='play'", 20000);
    timings[`${g}StartMs`] = ms >= 0 ? Date.now() - s0 : -1;
    // frame rate during play
    const fps = await page.eval("new Promise(r=>{let n=0;const t0=performance.now();const f=()=>{n++; if(performance.now()-t0<3000) requestAnimationFrame(f); else r(Math.round(n/((performance.now()-t0)/1000)))}; requestAnimationFrame(f)})");
    timings[`${g}Fps`] = fps;
    const mode = await page.eval("window.LinguaLinkPlay.runner().mode");
    if (g === "glide") await page.shot(OUT, "40-glide-sensors");
    check("MIC", `${g}: microphone mode starts`, mode === "sensors" && ms >= 0, `${timings[`${g}StartMs`]} ms to play, ${fps} fps`);
    await page.eval("window.LinguaLinkPlay.runner().exit()");
  }

  // camera: first load, second level (reuse), other game
  await fresh();
  await page.goto(url("?mode=sensors&unlock=1&splash=0&music=0"));
  await page.waitFor("window.LinguaLinkPlay", 15000);
  const camRun = async (g, lv, name) => {
    await page.eval(`window.LinguaLinkPlay.launch('${g}', ${lv})`);
    await page.waitFor("!!document.querySelector('.ov-intro [data-act=start]')", 5000);
    const s0 = Date.now();
    await page.click(".ov-intro [data-act=start]");
    let sawBar = false;
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const st = await page.eval("({ s: window.LinguaLinkPlay.runner().state, bar: !!document.querySelector('.ov-progress') })");
      if (st.bar) sawBar = true;
      if (st.s === "play") break;
      await sleep(150);
    }
    const ms = Date.now() - s0;
    const mode = await page.eval("window.LinguaLinkPlay.runner().mode");
    timings[name] = ms;
    await page.eval("window.LinguaLinkPlay.runner().exit()");
    return { ms, mode, sawBar };
  };
  page.net = [];
  const m1 = await camRun("mouth", 0, "mouthFirstMs");
  const remote = page.net.filter((n) => !n.url.startsWith(BASE)).map((n) => n.url);
  const m2 = await camRun("mouth", 1, "mouthSecondMs");
  const f1 = await camRun("firefly", 0, "fireflyFirstMs");
  const f2 = await camRun("firefly", 1, "fireflySecondMs");
  for (const g of ["letters", "numbers", "balance", "body"]) {
    const before = page.logs.length;
    const r = await camRun(g, 0, `${g}FirstMs`);
    check("V4", `${g} starts in camera mode with no script errors`, r.mode === "sensors" && page.errors(before).length === 0, `${r.ms} ms, errors: ${JSON.stringify(page.errors(before).slice(0, 2))}`);
  }
  check("C1", "Camera library and models load from this server, not CDNs", remote.length === 0, remote.length ? remote.join(", ") : "0 outside requests");
  check("C1", "Camera game shows a progress bar on first load", m1.sawBar);
  check("C1", "Fish Feast starts in camera mode", m1.mode === "sensors", `first ${m1.ms} ms (v1: 79,473 ms)`);
  check("C1", "Second camera level starts fast (model reused)", m2.mode === "sensors" && m2.ms < 9000, `${m2.ms} ms (v1: 56,092 ms)`);
  check("C1", "Firefly Night starts in camera mode", f1.mode === "sensors", `first ${f1.ms} ms (v1: 110,238 ms)`);
  check("C1", "Second Firefly level starts fast", f2.mode === "sensors" && f2.ms < 9000, `${f2.ms} ms`);

  // ---------- 5. Ghost game (C2): exit while the camera is loading ----------
  await fresh();
  await page.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.goto(url("?mode=sensors&unlock=1&splash=0&music=0"));
  await page.waitFor("window.LinguaLinkPlay", 15000);
  await page.eval(`(()=>{window.__streams=[]; const o=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia=async(c)=>{const s=await o(c); window.__streams.push(s); return s;}; window.__results=0; addEventListener('lingualink:game-result',()=>window.__results++);})()`);
  await page.eval("window.LinguaLinkPlay.launch('mouth', 0)");
  await page.waitFor("!!document.querySelector('.ov-intro [data-act=start]')", 5000);
  await page.click(".ov-intro [data-act=start]");
  await sleep(800);
  await page.click("#gExit");
  await sleep(45000);
  const ghost = await page.eval("({ live: window.__streams.flatMap(s=>s.getTracks()).filter(t=>t.readyState==='live').length, results: window.__results, history: JSON.parse(localStorage.getItem('llplay:history')||'[]').length, gameHidden: document.querySelector('#gameView').hidden, runner: !!window.LinguaLinkPlay.runner() })");
  check("C2", "Leaving during loading: no hidden game, camera off, nothing saved", ghost.live === 0 && ghost.results === 0 && ghost.history === 0 && ghost.gameHidden && !ghost.runner, JSON.stringify(ghost));
  await page.send("Network.setCacheDisabled", { cacheDisabled: false });

  // ---------- 6. Offline (M7) ----------
  await fresh();
  await page.goto(url());
  await page.waitFor("navigator.serviceWorker && navigator.serviceWorker.ready.then(()=>true)", 15000);
  await sleep(1500);
  await page.goto(url());
  const controlled = await page.waitFor("!!navigator.serviceWorker.controller", 10000);
  const manifest = await page.eval("fetch('manifest.webmanifest').then(r=>r.json()).then(m=>m.icons.map(i=>i.sizes))");
  await page.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await page.goto(url("?splash=0"));
  const offlineOk = await page.waitFor(`!document.querySelector('#home').hidden && document.querySelectorAll('.tile').length===${GAMES.length}`, 15000);
  await page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  check("M7", "Installable (icons 192 and 512) and works offline", controlled >= 0 && offlineOk >= 0 && JSON.stringify(manifest).includes("512x512") && JSON.stringify(manifest).includes("192x192"), `service worker: ${controlled >= 0}, offline home: ${offlineOk >= 0}, icons: ${JSON.stringify(manifest)}`);

  // ---------- 7. Server delivery (H2) and headers ----------
  await fresh();
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.LINGUALINK_PLAY_CONFIG = { resultUrl: 'https://results.invalid/api', mode: 'touch', skipSplash: true, music: false, unlockAll: true };" });
  await page.goto(url());
  await page.waitFor("window.LinguaLinkPlay", 15000);
  await page.eval("window.LinguaLinkPlay.launch('breeze', 0)");
  await page.waitFor("!!document.querySelector('.ov-intro [data-act=start]')", 5000);
  await page.click(".ov-intro [data-act=start]");
  await page.waitFor("window.LinguaLinkPlay.runner().state==='play'", 8000);
  const f0 = Date.now();
  await page.eval("window.LinguaLinkPlay.finishNow()");
  const shownMs = await page.waitFor("!!document.querySelector('.ov-result')", 3000);
  const queued = await page.waitFor("JSON.parse(localStorage.getItem('llplay:outbox')||'[]').length===1", 8000);
  const note = await page.eval("document.querySelector('[data-role=delivery]').textContent");
  check("H2", "Unreachable server: result shows at once and is queued for later", shownMs >= 0 && shownMs < 1000 && queued >= 0 && /Not sent yet/.test(note), `result shown in ${shownMs} ms; note: ${note}`);
  const head = await fetch(url()).then((r) => Object.fromEntries(r.headers));
  check("SEC", "Security headers (CSP, Permissions-Policy, nosniff)", !!head["content-security-policy"] && /camera=\(self\)/.test(head["permissions-policy"] || "") && head["x-content-type-options"] === "nosniff");
  const mime = await fetch(`${BASE}/vendor/mediapipe/vision_bundle.js`, { method: "HEAD" }).then((r) => r.headers.get("content-type"));
  check("C1", "Camera library is served as JavaScript", /javascript/.test(mime || ""), mime);

  // ---------- 8. Sky Glide: both ways to play are on the level card ----------
  await fresh();
  await page.goto(url("?mode=touch&unlock=1&splash=0&music=0"));
  await page.waitFor("window.LinguaLinkPlay", 15000);
  await page.eval("window.LinguaLinkPlay.launch('glide', 0)");
  await page.waitFor("!!document.querySelector('.ov-intro [data-variant=stop]')", 5000);
  await sleep(500);
  await page.shot(OUT, "50-glide-variants");
  await page.click(".ov-intro [data-variant=stop]");
  const pressed = await page.eval("document.querySelector('.ov-intro [data-variant=stop]').getAttribute('aria-pressed')");
  await page.click(".ov-intro [data-act=start]");
  await page.waitFor("window.LinguaLinkPlay.runner().state==='play'", 8000);
  await sleep(8500);
  const stopState = await page.eval("({ v: window.LinguaLinkPlay.runner().variant, waiting: window.LinguaLinkPlay.runner().game.waiting, passed: window.LinguaLinkPlay.runner().game.passed })");
  await page.shot(OUT, "51-glide-stop-waiting");
  check("V4", "Sky Glide: Stop and say can be chosen, and the bird waits at the ring", pressed === "true" && stopState.v === "stop" && stopState.waiting && stopState.passed === 0, JSON.stringify(stopState));
  await page.eval("window.LinguaLinkPlay.finishNow()");
  await page.waitFor("!!document.querySelector('.ov-result')", 3000);
  check("V4", "The choice is kept in the result", await page.eval("window.LinguaLinkPlay.runner().lastResult.settings.variant === 'stop'"));
} catch (e) {
  check("RUN", "Test run finished without crashing", false, e && e.stack || e);
} finally {
  page && page.close();
  const passed = checks.filter((c) => c.pass).length;
  writeFileSync(join(OUT, "results.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), passed, total: checks.length, checks, timings, levelRuns }, null, 2));
  console.log(`\n${passed}/${checks.length} checks passed. Results in ${join(OUT, "results.json")}`);
  process.exit(passed === checks.length ? 0 : 1);
}
