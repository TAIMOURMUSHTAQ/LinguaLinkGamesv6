// Service worker: makes LinguaLink Play installable and lets it run offline.
// - The app shell (HTML, CSS, JS, fonts, icons) is cached at install. Online, it is always
//   fetched fresh (network first) so a new release shows at once; offline, the cache answers.
// - The large camera files (WebAssembly engine and models) are cached the first time they are
//   used and then served from the cache, so camera games start quickly and work offline.
const VERSION = "6.0.1";
const SHELL = `llp-shell-${VERSION}`;
const BIG = "llp-big-v1"; // models and engine change rarely; kept across releases

const SHELL_FILES = [
  "./", "index.html", "css/play.css", "manifest.webmanifest",
  "js/app.js", "js/kit/engine.js", "js/kit/adaptive.js", "js/kit/audio.js", "js/kit/config.js", "js/kit/draw.js",
  "js/kit/i18n.js", "js/kit/mic.js", "js/kit/progress.js", "js/kit/report.js", "js/kit/results.js", "js/kit/speech.js", "js/kit/storage.js", "js/kit/vision.js", "js/kit/vowel.js", "js/kit/vowelcheck.js", "js/kit/scene.js", "js/kit/buddy.js", "js/kit/trace.js", "js/kit/tracegame.js", "js/kit/body.js",
  "js/games/index.js", "js/games/breeze.js", "js/games/glide.js", "js/games/pitch.js", "js/games/mouth.js", "js/games/firefly.js", "js/games/garden.js", "js/games/letters.js", "js/games/numbers.js", "js/games/balance.js", "js/games/body.js",
  "fonts/baloo2-latin.woff2", "fonts/lexend-latin.woff2", "fonts/nastaliq-arabic.woff2", "icons/icon.svg", "icons/icon-192.png",
];

self.addEventListener("install", (e) => {
  // cache: "reload" skips the browser's HTTP cache, so a new release never stores old files
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES.map((f) => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== BIG) await caches.delete(k);
    await self.clients.claim();
  })());
});

const isBig = (url) => /\/(models|vendor\/mediapipe)\//.test(url.pathname) || /\.(task|wasm)$/.test(url.pathname)
  || url.hostname === "storage.googleapis.com" || url.hostname === "cdn.jsdelivr.net";

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin && !isBig(url)) return;
  if (isBig(url)) {
    // cache first: these files are large and versioned
    e.respondWith(caches.open(BIG).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type !== "opaque") c.put(req, res.clone());
      return res;
    }));
    return;
  }
  // app shell: network first (fresh code), cache when offline
  e.respondWith(caches.open(SHELL).then(async (c) => {
    try {
      const res = await fetch(req, { cache: "no-cache" });
      if (res.ok) c.put(req, res.clone());
      return res;
    } catch {
      const hit = await c.match(req, { ignoreSearch: req.mode === "navigate" });
      return hit || (req.mode === "navigate" ? (await c.match("index.html")) || Response.error() : Response.error());
    }
  }));
});
