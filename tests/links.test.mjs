// Nothing the app points at may be missing: pages, styles, fonts, icons, scripts, offline files and text.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const walk = (dir) => readdirSync(join(ROOT, dir)).flatMap((f) => { const p = `${dir}/${f}`; return statSync(join(ROOT, p)).isDirectory() ? walk(p) : [p]; });
const JS = [...walk("js")].filter((f) => f.endsWith(".js"));

test("index.html: every linked file exists", () => {
  const html = read("index.html");
  const refs = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)].map((m) => m[1]).filter((r) => !/^https?:/.test(r));
  assert.ok(refs.length >= 6);
  for (const r of refs) assert.ok(existsSync(join(ROOT, r)), r);
});

test("index.html: every element the app looks up by id exists, or is created by the app", () => {
  const html = read("index.html");
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const app = read("js/app.js");
  for (const m of app.matchAll(/\$\("#([A-Za-z][\w-]*)"\)/g)) {
    assert.ok(ids.has(m[1]) || app.includes(`id="${m[1]}"`), `#${m[1]}`);
  }
  for (const m of html.matchAll(/\bfor="([^"]+)"/g)) assert.ok(ids.has(m[1]), `label for ${m[1]}`);
});

test("CSS, manifest and scripts: every file they point at exists", () => {
  for (const m of read("css/play.css").matchAll(/url\(([^)"']+)\)/g)) assert.ok(existsSync(join(ROOT, "css", m[1])), m[1]);
  const man = JSON.parse(read("manifest.webmanifest"));
  for (const i of man.icons) assert.ok(existsSync(join(ROOT, i.src)), i.src);
  for (const f of JS) {
    for (const m of read(f).matchAll(/(?:from\s+|import\()\s*"(\.[^"]+)"/g)) assert.ok(existsSync(resolve(ROOT, dirname(f), m[1])), `${f}: ${m[1]}`);
  }
});

test("Offline list: every file exists, and every script of the app is on it", () => {
  const sw = read("sw.js");
  const list = [...sw.slice(sw.indexOf("SHELL_FILES"), sw.indexOf("];")).matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((f) => f !== "./");
  for (const f of list) assert.ok(existsSync(join(ROOT, f)), f);
  for (const f of JS) assert.ok(list.includes(f), `${f} is missing from the offline list`);
  for (const f of readdirSync(join(ROOT, "fonts"))) assert.ok(list.includes(`fonts/${f}`), f);
});

test("Every word of text the app asks for exists in English and Urdu", async () => {
  const { STRING_TABLES } = await import("../js/kit/i18n.js");
  const { en, ur } = STRING_TABLES;
  const asked = new Set();
  for (const f of JS) for (const m of read(f).matchAll(/\bt\("([\w.-]+)"(?!\s*\+)/g)) asked.add(m[1]);
  for (const m of read("index.html").matchAll(/data-i18n="([\w.-]+)"/g)) asked.add(m[1]);
  assert.ok(asked.size > 60);
  for (const k of asked) { assert.ok(k in en, `English: ${k}`); assert.ok(k in ur, `Urdu: ${k}`); }
  for (const k of Object.keys(en)) assert.ok(k in ur, `Urdu: ${k}`);
});

test("No developer tools are left on screen", () => {
  const app = read("js/app.js") + read("index.html");
  for (const word of ["exportJson", "exportAll", "application/json", "game_result/v1", "MediaPipe", "data-act=\"json\""]) assert.ok(!app.includes(word), word);
});

test("The public site serves the app, and not the project's own files", () => {
  const s = read("server.mjs");
  for (const p of ["/tests/", "/docs/", "/integration/", "/scripts/", "/package.json", "/render.yaml", "/server.mjs"]) assert.ok(s.includes(`"${p}"`), p);
});
