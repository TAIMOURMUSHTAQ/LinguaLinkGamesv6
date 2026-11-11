// Minimal Chrome DevTools Protocol driver for the end-to-end tests (no dependencies).
// Starts Chrome headless with a fake camera and microphone, and offers a few helpers.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].filter(Boolean);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ profile, port = 9400 + Math.floor(Math.random() * 400), width = 1366, height = 900, extraArgs = [] } = {}) {
  const exe = CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error("Chrome not found. Set CHROME_PATH.");
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* still locked by a closing browser */ }
  mkdirSync(profile, { recursive: true });
  const proc = spawn(exe, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required",
    `--window-size=${width},${height}`, "--no-first-run", "--no-default-browser-check", ...extraArgs, "about:blank",
  ], { stdio: "ignore" });
  let ws;
  for (let i = 0; i < 300 && !ws; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      let pg = list.find((t) => t.type === "page");
      if (!pg && i > 10) pg = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
      if (pg) { ws = new WebSocket(pg.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }); }
    } catch { ws = null; }
    if (!ws) await sleep(250);
  }
  if (!ws) { proc.kill(); throw new Error("Could not connect to Chrome"); }
  return new Page(ws, proc, { width, height });
}

export class Page {
  constructor(ws, proc, size) {
    this.ws = ws; this.proc = proc; this.size = size;
    this.id = 0; this.pending = new Map(); this.logs = []; this.net = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.pending.has(d.id)) { this.pending.get(d.id)(d); this.pending.delete(d.id); return; }
      if (d.method === "Runtime.consoleAPICalled") this.logs.push({ type: d.params.type, text: d.params.args.map((a) => a.value ?? a.description).join(" ") });
      else if (d.method === "Runtime.exceptionThrown") this.logs.push({ type: "exception", text: d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text });
      else if (d.method === "Log.entryAdded") this.logs.push({ type: d.params.entry.level, text: d.params.entry.text, url: d.params.entry.url });
      else if (d.method === "Network.responseReceived") this.net.push({ id: d.params.requestId, url: d.params.response.url, status: d.params.response.status, type: d.params.response.mimeType, fromSW: d.params.response.fromServiceWorker, cache: d.params.response.fromDiskCache });
      else if (d.method === "Network.loadingFinished") { const n = this.net.find((x) => x.id === d.params.requestId); if (n) n.bytes = d.params.encodedDataLength; }
    };
  }
  // Every call gives up after `timeout` ms, so a promise that never settles cannot hang the run.
  send(method, params = {}, timeout = 60000) {
    return new Promise((r) => {
      const i = ++this.id;
      const timer = setTimeout(() => { this.pending.delete(i); r({ result: { exceptionDetails: { text: `timeout: ${method}` } } }); }, timeout);
      this.pending.set(i, (d) => { clearTimeout(timer); r(d); });
      this.ws.send(JSON.stringify({ id: i, method, params }));
    });
  }
  async init() {
    await this.send("Runtime.enable"); await this.send("Page.enable"); await this.send("Network.enable"); await this.send("Log.enable");
    await this.viewport(this.size.width, this.size.height);
  }
  viewport(width, height, mobile = false, dpr = 1) { return this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile }); }
  async eval(expr) {
    const r = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text };
    return r.result?.result?.value;
  }
  async goto(url) { await this.send("Page.navigate", { url }); await this.waitFor("document.readyState === 'complete'", 30000); }
  async waitFor(expr, ms = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const v = await this.eval(expr); if (v && !v.__error) return Date.now() - t0; await sleep(80); }
    return -1;
  }
  click(sel) { return this.eval(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}); if(!b) return false; b.click(); return true;})()`); }
  async shot(dir, name, opts = {}) {
    const r = await this.send("Page.captureScreenshot", { format: "png", ...opts });
    const file = join(dir, name + ".png");
    writeFileSync(file, Buffer.from(r.result.data, "base64"));
    return file;
  }
  async pdf(file, opts = {}) {
    const r = await this.send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true, ...opts });
    writeFileSync(file, Buffer.from(r.result.data, "base64"));
    return file;
  }
  errors(since = 0) { return this.logs.slice(since).filter((l) => l.type === "error" || l.type === "exception").filter((l) => !/TensorFlow Lite|XNNPACK|gl_context|OpenGL|landmark_projection|face_landmarker_graph/.test(l.text)); }
  close() { try { this.ws.close(); } catch {} try { this.proc.kill(); } catch {} }
}
