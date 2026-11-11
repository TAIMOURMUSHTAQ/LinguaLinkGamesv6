// Small static server for LinguaLink Play (Node 18+, no dependencies).
// Sends correct file types on every platform (v1 relied on Python, which served .mjs as text on
// Windows), compresses text files, caches the large model files, and sets the security headers
// camera and microphone pages need. Used by `npm start` locally and on Render.
import { createServer } from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip, brotliCompress, gzip, constants as Z } from "node:zlib";
import { promisify } from "node:util";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const PORT = +process.env.PORT || 8080;
const HOST = process.env.HOST || (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".wasm": "application/wasm",
  ".task": "application/octet-stream", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".pdf": "application/pdf",
};
const COMPRESS = new Set([".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".svg", ".md", ".txt"]);
// The camera engine and models are big. The engine shrinks to a quarter when compressed (11 MB to
// about 3 MB) and the models by about a quarter, so they are compressed once, kept in memory and
// sent compressed: the first camera game starts much sooner, above all on a phone or a slow line.
const BIG_COMPRESS = new Set([".wasm", ".task"]);
const packed = new Map();   // "file|etag|enc" -> Promise<Buffer>
const brAsync = promisify(brotliCompress), gzAsync = promisify(gzip);
function packedBody(file, etag, enc) {
  const key = `${file}|${etag}|${enc}`;
  if (!packed.has(key)) {
    packed.set(key, fs.readFile(file).then((buf) => enc === "br"
      ? brAsync(buf, { params: { [Z.BROTLI_PARAM_QUALITY]: 9, [Z.BROTLI_PARAM_SIZE_HINT]: buf.length } })
      : gzAsync(buf, { level: 9 })).catch((e) => { packed.delete(key); throw e; }));
  }
  return packed.get(key);
}
// Prepare the compressed engine and models as soon as the server starts, so no visitor waits for it.
async function warmPacked() {
  for (const dir of ["vendor/mediapipe/wasm", "models"]) {
    const names = await fs.readdir(join(ROOT, dir)).catch(() => []);
    for (const n of names) {
      if (!BIG_COMPRESS.has(extname(n).toLowerCase())) continue;
      const file = join(ROOT, dir, n), st = await fs.stat(file).catch(() => null);
      if (!st) continue;
      const etag = `"${st.size.toString(36)}-${st.mtimeMs.toString(36)}"`;
      for (const enc of ["br", "gzip"]) await packedBody(file, etag, enc).catch(() => {});
    }
  }
}

// Never served: tooling, tests, reports and project notes. Only the app itself is public.
const PRIVATE = ["/tests/", "/scripts/", "/node_modules/", "/.git/", "/qa/", "/docs/", "/integration/"];
const PRIVATE_FILES = ["/package.json", "/package-lock.json", "/render.yaml", "/server.mjs", "/start-mac-linux.sh", "/start-windows.bat"];

const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
    "connect-src 'self' https://cdn.jsdelivr.net https://storage.googleapis.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "worker-src 'self' blob:",
    // Allow LinguaLink360 to embed the games; set FRAME_ANCESTORS on the server, e.g. "https://app.lingualink360.com"
    `frame-ancestors 'self' ${process.env.FRAME_ANCESTORS || ""}`.trim(),
  ].join("; "),
};

function cacheFor(path) {
  if (path.startsWith("/models/") || path.startsWith("/vendor/") || path.startsWith("/fonts/")) return "public, max-age=2592000, immutable";
  if (path === "/sw.js") return "no-cache";
  // Everything else (HTML, JS, CSS, manifest) is checked with the server on every load. Unchanged
  // files answer 304 from their ETag, so this is cheap, and a new release is never hidden.
  return "no-cache";
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    let path = decodeURIComponent(url.pathname);
    if (path === "/healthz") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("ok"); }
    if (path.endsWith("/")) path += "index.html";
    if (PRIVATE.some((p) => path.startsWith(p)) || PRIVATE_FILES.includes(path) || path.endsWith(".md") || path.endsWith(".pdf") || path.split("/").some((s) => s.startsWith("."))) { res.writeHead(404); return res.end("Not found"); }
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT + sep)) { res.writeHead(403); return res.end(); }
    const st = await fs.stat(file).catch(() => null);
    if (!st || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    const ext = extname(file).toLowerCase();
    const etag = `"${st.size.toString(36)}-${st.mtimeMs.toString(36)}"`;
    const headers = { ...SECURITY, "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": cacheFor(path), ETag: etag, "Last-Modified": st.mtime.toUTCString() };
    if (req.headers["if-none-match"] === etag) { res.writeHead(304, headers); return res.end(); }
    if (req.method === "HEAD") { res.writeHead(200, { ...headers, "Content-Length": st.size }); return res.end(); }
    const accept = req.headers["accept-encoding"] || "";
    const big = BIG_COMPRESS.has(ext) && (/\bbr\b/.test(accept) ? "br" : /\bgzip\b/.test(accept) ? "gzip" : null);
    if (big) {
      const body = await packedBody(file, etag, big);
      res.writeHead(200, { ...headers, "Content-Encoding": big, Vary: "Accept-Encoding", "Content-Length": body.length });
      return res.end(body);
    }
    if (COMPRESS.has(ext) && /\bgzip\b/.test(accept)) {
      res.writeHead(200, { ...headers, "Content-Encoding": "gzip", Vary: "Accept-Encoding" });
      createReadStream(file).pipe(createGzip()).pipe(res);
    } else {
      res.writeHead(200, { ...headers, "Content-Length": st.size });
      createReadStream(file).pipe(res);
    }
  } catch (e) {
    res.writeHead(500); res.end("Server error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`LinguaLink Play is running at http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  warmPacked().then(() => console.log("Camera files ready (compressed)"));
});
