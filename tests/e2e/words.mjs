// Browser test of Word Garden's two ways to play. A stand-in speech recogniser says what was "heard",
// so every path can be walked: nothing leaves the machine and no real microphone is used.
// Usage: start the server (npm start), then: node tests/e2e/words.mjs [baseUrl]
//
// With --real <file.wav> it also plays level 5 with Chrome's real ONLINE recogniser, fed by a
// recording of the first sentence, "The cat can jump." (use the sound /k/). The recording is sent to the browser's speech service. A start()
// without the fake microphone's track is blocked, because Chrome would then use the machine's REAL
// microphone and send the sounds of the room. Never remove that guard.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sleep } from "./cdp.mjs";

const args = process.argv.slice(2);
const realAt = args.indexOf("--real");
const realWav = realAt >= 0 ? args.splice(realAt, 2)[1] : null;
const BASE = (args[0] || process.env.BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const OUT = fileURLToPath(new URL("./out/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const checks = [];
const check = (name, pass, detail = "") => { checks.push({ name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };

// A quiet room, so the game hears no "voice" of its own.
const SR = 48000, quiet = Buffer.alloc(44 + SR * 2);
quiet.write("RIFF", 0); quiet.writeUInt32LE(36 + SR * 2, 4); quiet.write("WAVEfmt ", 8); quiet.writeUInt32LE(16, 16); quiet.writeUInt16LE(1, 20); quiet.writeUInt16LE(1, 22);
quiet.writeUInt32LE(SR, 24); quiet.writeUInt32LE(SR * 2, 28); quiet.writeUInt16LE(2, 32); quiet.writeUInt16LE(16, 34); quiet.write("data", 36); quiet.writeUInt32LE(SR * 2, 40);
const quietWav = join(OUT, "quiet-room.wav");
writeFileSync(quietWav, quiet);

const standIn = (status) => `(() => {
  class F {
    start(track) { window.__rec = this; F.started++; if (track) F.withTrack++; }
    abort() { if (window.__rec === this) window.__rec = null; this.onend && this.onend(); }
    stop() { this.abort(); }
  }
  F.started = 0; F.withTrack = 0; F.status = ${JSON.stringify(status)};
  F.available = async () => F.status;
  window.SpeechRecognition = F; window.webkitSpeechRecognition = F; window.__F = F;
  window.__say = (...alts) => { const r = window.__rec; if (!r) return false; r.onresult({ results: [alts.map((transcript) => ({ transcript }))] }); r.onend && r.onend(); return true; };
})()`;

const GAME = "window.LinguaLinkPlay.runner().game";
const state = (pg) => pg.eval(`(()=>{const g=${GAME}; return { state: g.state, i: g.i, attempts: g.attempts, by: g.checkBy, checker: g.checker, heard: g.lastHeard, grown: g.grown.length, results: g.results, started: window.__F ? window.__F.started : null, withTrack: window.__F ? window.__F.withTrack : null };})()`);

async function open(name, status, query = "", over = {}) {
  const pg = await launch({ profile: join(OUT, "profile-words-" + name), extraArgs: [`--use-file-for-fake-audio-capture=${quietWav}`], ...over });
  await pg.init();
  await pg.send("Page.addScriptToEvaluateOnNewDocument", { source: standIn(status) });
  await pg.goto(`${BASE}/index.html?mode=sensors&unlock=1&splash=0&music=0&sound=k${query}`);
  await pg.waitFor("window.LinguaLinkPlay && window.LinguaLinkPlay.games().length>0", 15000);
  await pg.eval("window.LinguaLinkPlay.launch('garden', 0)");
  await pg.waitFor("!!document.querySelector('.ov-intro [data-act=start]')", 5000);
  return pg;
}
async function play(pg) {
  await pg.click(".ov-intro [data-act=start]");
  await pg.waitFor("window.LinguaLinkPlay.runner().state==='play'", 15000);
  await pg.waitFor(`${GAME}.checkBy !== 'pending' || ${GAME}.state === 'setup'`, 5000);
}
const listening = (pg) => pg.waitFor("!!window.__rec", 3000);
const has = (pg, id) => pg.eval(`!!document.querySelector('#ctl-${id}')`);
// say a word and wait for the game to act on it
async function say(pg, ...alts) { await listening(pg); await pg.eval(`window.__say(${alts.map((a) => JSON.stringify(a)).join(",")})`); await sleep(120); }
const nextWord = (pg, i) => pg.waitFor(`${GAME}.i === ${i} && ${GAME}.state === 'listen'`, 4000);

try {
  // ---------- the choice ----------
  {
    const pg = await open("choice", "available");
    const opts = await pg.eval("[...document.querySelectorAll('.ov-intro [data-variant]')].map(b=>[b.dataset.variant,b.getAttribute('aria-pressed')])");
    check("The level card offers both ways, Game listens first", JSON.stringify(opts) === '[["auto","true"],["adult","false"]]', JSON.stringify(opts));
    await pg.shot(OUT, "60-garden-choice");
    await pg.eval("window.LinguaLinkPlay.runner().exit()");
    await pg.goto(`${BASE}/index.html?mode=touch&unlock=1&splash=0&music=0`);
    await pg.waitFor("window.LinguaLinkPlay && window.LinguaLinkPlay.games().length>0", 15000);
    await pg.eval("window.LinguaLinkPlay.launch('garden', 0)");
    await pg.waitFor("!!document.querySelector('.ov-intro [data-act=start]')", 5000);
    check("Touch mode has no choice to make", await pg.eval("document.querySelectorAll('.ov-intro [data-variant]').length === 0"));
    pg.close(); await sleep(500);
  }

  // ---------- Game listens: right, wrong, try again, next word, to the result ----------
  {
    const pg = await open("listens", "unavailable");
    const before = pg.logs.length;
    await play(pg);
    let s = await state(pg);
    check("No check on this device: a grown-up is asked, nothing listens yet", s.state === "setup" && s.started === 0 && await has(pg, "online") && await has(pg, "byadult"), JSON.stringify({ state: s.state, started: s.started }));
    await pg.shot(OUT, "61-garden-setup");
    await pg.click("#ctl-online");
    await sleep(200);
    check("Allowing online is remembered on this device", await pg.eval("Object.keys(localStorage).some(k=>/prefs/.test(k)&&JSON.parse(localStorage[k]).onlineSpeech===true) && window.LinguaLinkPlay.runner().config.onlineSpeech===true"));

    await say(pg, "cat");
    s = await state(pg);
    check("Right word: the flower blooms", s.state === "bloom" && s.grown === 1 && s.results[0].result === "clear" && s.results[0].judged_by === "auto" && s.results[0].attempts === 1, JSON.stringify({ state: s.state, grown: s.grown, r: s.results[0] }));
    await pg.shot(OUT, "62-garden-bloom");
    check("Then the next word comes by itself", await nextWord(pg, 1) >= 0);

    await say(pg, "cap", "cab");
    s = await state(pg);
    check("Wrong word: no flower, and the game says what it heard", s.state === "retry" && s.grown === 1 && s.attempts === 1 && s.heard === "cap", JSON.stringify({ state: s.state, grown: s.grown, heard: s.heard }));
    check("It offers Try again and Next word", await has(pg, "again") && await has(pg, "next"));
    await pg.shot(OUT, "63-garden-retry");
    await pg.viewport(390, 844, true, 2); await sleep(300);
    await pg.shot(OUT, "64-garden-retry-phone");
    const fits = await pg.eval("(()=>{const w=innerWidth; return [...document.querySelectorAll('[id^=ctl-]')].every(b=>{const r=b.getBoundingClientRect(); return r.left>=0&&r.right<=w;}) && document.documentElement.scrollWidth<=w;})()");
    check("The buttons fit a phone", fits);
    await pg.viewport(1366, 900); await sleep(200);
    await pg.click("#ctl-again"); await sleep(150);
    check("Try again listens straight away", (await state(pg)).state === "listen");
    await say(pg, "cape"); await sleep(3100);
    check("Left alone, the game listens again by itself", (await state(pg)).state === "listen");
    await say(pg, "cane");
    s = await state(pg);
    check("After 3 tries it passes to the next word, kept for practice", s.i === 2 && s.results[1].result === "needs_practice" && s.results[1].attempts === 3 && s.results[1].judged_by === "auto", JSON.stringify(s.results[1]));

    await say(pg, "star");
    await pg.click("#ctl-next"); await sleep(150);
    s = await state(pg);
    check("Next word passes after one try", s.i === 3 && s.results[2].result === "needs_practice" && s.results[2].attempts === 1, JSON.stringify(s.results[2]));

    await say(pg, "cows"); await nextWord(pg, 4);
    await say(pg, "quay");
    await pg.waitFor("window.LinguaLinkPlay.runner().state==='done'", 8000);
    const r = await pg.eval("window.LinguaLinkPlay.runner().lastResult");
    check("The result counts the 3 right words of 5", r && r.score === 60 && r.metrics.clear === 3 && r.metrics.needs_practice === 2, r && `score ${r.score}, clear ${r.metrics.clear}`);
    check("The result says how it was checked", r && r.metrics.variant === "auto" && r.metrics.judged_by === "auto" && r.metrics.word_check === "online" && r.settings.variant === "auto", r && JSON.stringify({ v: r.metrics.variant, by: r.metrics.judged_by, w: r.metrics.word_check }));
    check("The recogniser is given the game's own microphone", await pg.eval("window.__F.started>0 && window.__F.started===window.__F.withTrack"));
    check("No script errors", pg.errors(before).length === 0, JSON.stringify(pg.errors(before).slice(0, 2)));
    pg.close(); await sleep(500);
  }

  // ---------- Grown-up checks ----------
  {
    const pg = await open("adult", "available");
    await pg.click(".ov-intro [data-variant=adult]");
    await play(pg);
    await sleep(800);
    let s = await state(pg);
    check("Grown-up checks: no recogniser runs, even when one is ready", s.by === "adult" && s.started === 0 && await has(pg, "said"), JSON.stringify({ by: s.by, started: s.started }));
    await pg.shot(OUT, "65-garden-adult");
    await pg.click("#ctl-said"); await sleep(200);
    await pg.click("#ctl-again"); await sleep(200);
    s = await state(pg);
    check("Said it, then Try again", s.state === "listen" && s.attempts === 1 && s.i === 0);
    await pg.click("#ctl-said"); await sleep(200);
    await pg.click("#ctl-clear"); await sleep(200);
    s = await state(pg);
    check("Said it, then Clear grows the flower", s.i === 1 && s.grown === 1 && s.results[0].judged_by === "adult" && s.results[0].attempts === 2, JSON.stringify(s.results[0]));
    await pg.eval("window.LinguaLinkPlay.runner().exit()");
    await sleep(200);
    await pg.eval("window.LinguaLinkPlay.launch('garden', 0)");
    await pg.waitFor("!!document.querySelector('.ov-intro [data-act=start]')", 5000);
    check("The choice is remembered", await pg.eval("document.querySelector('.ov-intro [data-variant=adult]').getAttribute('aria-pressed')==='true'"));
    pg.close(); await sleep(500);
  }

  // ---------- the other ways the check gets ready ----------
  {
    const pg = await open("local", "available");
    await play(pg);
    const s = await state(pg);
    check("On-device check ready: the game simply starts", s.state === "listen" && s.checker === "local", JSON.stringify({ state: s.state, checker: s.checker }));
    pg.close(); await sleep(500);
  }
  {
    const pg = await open("urdu", "downloadable", "&lang=ur");
    await pg.shot(OUT, "66-garden-choice-urdu");
    await play(pg);
    await pg.shot(OUT, "67-garden-setup-urdu");
    pg.close(); await sleep(500);
  }

  // ---------- optional: Chrome's real online recogniser, fed only by a recording ----------
  if (realWav) {
    const pg = await launch({ profile: join(OUT, "profile-words-real"), extraArgs: [`--use-file-for-fake-audio-capture=${realWav}`] });
    await pg.init();
    await pg.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.LINGUALINK_PLAY_CONFIG = { onlineSpeech: true };
      (() => { const R = window.SpeechRecognition || window.webkitSpeechRecognition; const start = R.prototype.start;
        R.prototype.start = function (track) { if (!track) throw new Error("blocked: this would use the real microphone"); return start.call(this, track); }; })();` });
    const before = pg.logs.length;
    await pg.goto(`${BASE}/index.html?mode=sensors&unlock=1&splash=0&music=0&sound=k`);
    await pg.waitFor("window.LinguaLinkPlay && window.LinguaLinkPlay.games().length>0", 15000);
    await pg.eval("window.LinguaLinkPlay.launch('garden', 4)");
    await pg.waitFor("!!document.querySelector('.ov-intro [data-act=start]')", 5000);
    await play(pg);
    const bloomed = await pg.waitFor(`${GAME}.grown.length === 1`, 30000);
    let s = await state(pg);
    check("REAL recogniser: the spoken sentence blooms its flower", bloomed >= 0 && s.results[0] && s.results[0].result === "clear" && s.results[0].judged_by === "auto", JSON.stringify({ after_ms: bloomed, checker: s.checker, r: s.results[0] }));
    const missed = await pg.waitFor(`${GAME}.i === 1 && ${GAME}.state === 'retry'`, 30000);
    s = await state(pg);
    check("REAL recogniser: the same sentence is not accepted for the next one", missed >= 0 && s.grown === 1, JSON.stringify({ after_ms: missed, heard: s.heard, grown: s.grown }));
    await pg.shot(OUT, "68-garden-real-retry");
    check("REAL recogniser: no script errors", pg.errors(before).length === 0, JSON.stringify(pg.errors(before).slice(0, 2)));
    pg.close();
  }
} catch (err) {
  check("The test ran to the end", false, err && err.stack);
}

const passed = checks.filter((c) => c.pass).length;
console.log(`\n${passed} of ${checks.length} checks passed. Pictures are in tests/e2e/out/.`);
process.exit(passed === checks.length ? 0 : 1);
