/*
 * Offline shell for the studio.
 *
 * Campus and hostel connectivity drops without warning. Student work is kept
 * in IndexedDB by the app itself; this worker's job is the other half — making
 * sure the app can OPEN with no connection at all, so that stored work is
 * reachable.
 *
 *  - Page navigations: network first, falling back to the last cached copy of
 *    that page, then to the cached studio shell (the app renders from its
 *    local snapshot).
 *  - Hashed build assets and fonts: cache first — their URLs change whenever
 *    their content does, so a cached copy is never stale.
 *  - Server functions and auth (/_serverFn, /api): never cached. They carry
 *    per-student data and must always be answered by the server.
 */
const VERSION = "evp-shell-v1";
const SHELL = ["/studio"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isPrivate(url) {
  return (
    url.pathname.startsWith("/_serverFn") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/__")
  );
}

function isImmutableAsset(url) {
  return (
    (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) ||
    url.hostname === "fonts.gstatic.com" ||
    url.hostname === "fonts.googleapis.com"
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && isPrivate(url)) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(VERSION);
          return (
            (await cache.match(req, { ignoreSearch: true })) ||
            (await cache.match("/studio")) ||
            new Response(
              "<!doctype html><meta name=viewport content='width=device-width'><title>Offline</title>" +
                "<body style='font-family:system-ui;padding:24px'><h1>You are offline</h1>" +
                "<p>Open the studio once while connected so it can work offline next time.</p>",
              { headers: { "content-type": "text/html; charset=utf-8" } },
            )
          );
        }),
    );
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === "opaque") cache.put(req, res.clone());
        return res;
      }),
    );
  }
});
