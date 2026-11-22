// Treder service worker — ilovani oʻrnatish va internetsiz ochilish uchun.
// Strategiya: sayt fayllari uchun "avval tarmoq, keyin kesh" — yangilanishlar darhol keladi,
// internet boʻlmasa oxirgi saqlangan nusxa ochiladi. Tashqi API (Binance, RSS, tarjima,
// TradingView) keshlanmaydi — narxlar har doim jonli.

const VERSION = "treder-v1";
const SHELL = [
  "./",
  "index.html",
  "signal.html",
  "3d.html",
  "ilova.html",
  "treder.css",
  "treder.js",
  "market.js",
  "algo26.js",
  "spectra.js",
  "signal.js",
  "news.js",
  "chart3d.js",
  "manifest.webmanifest",
  "vendor/lightweight-charts-4.2.3.js",
  "vendor/three/three.module.min.js",
  "vendor/three/OrbitControls.js",
  "vendor/three/CSS2DRenderer.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // tashqi soʻrovlar — oʻz holicha

  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    } catch {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === "navigate") {
        const page = url.pathname.split("/").pop() || "index.html";
        return (await caches.match(page)) || (await caches.match("index.html")) || Response.error();
      }
      return Response.error();
    }
  })());
});
