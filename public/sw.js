// public/sw.js
// Hand-written Service Worker (Offline Read-Only Support - Stage 1)
// Pure JavaScript, zero dependencies.

const swUrl = new URL(self.location.href);
const BUILD_ID = swUrl.searchParams.get("buildId") || "v1";

const CACHE_PREFIX = "app-cache-";
const STATIC_CACHE = `${CACHE_PREFIX}static-${BUILD_ID}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${BUILD_ID}`;
const PRECACHE_ASSETS = ["/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // In local development (localhost / 127.0.0.1), purge all caches and unregister
      if (
        self.location.hostname === "localhost" ||
        self.location.hostname === "127.0.0.1"
      ) {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((name) => name.startsWith(CACHE_PREFIX))
            .map((name) => caches.delete(name)),
        );
        await self.registration.unregister();
        return;
      }

      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((name) => {
          // Delete caches belonging to this app from older builds
          if (
            name.startsWith(CACHE_PREFIX) &&
            name !== STATIC_CACHE &&
            name !== RUNTIME_CACHE
          ) {
            return caches.delete(name);
          }
          return null;
        }),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Rule 0: NEVER intercept or cache requests in local development (localhost / 127.0.0.1)
  const url = new URL(req.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return;
  }

  // Rule 1: Only handle GET requests. NEVER intercept POST/PUT/PATCH/DELETE.
  if (req.method !== "GET") {
    return;
  }

  // Rule 2: NEVER cache /api/*
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Rule 3: /_next/static/* is cache-first (content-hashed assets)
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.ico" ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) {
          return cached;
        }
        const netRes = await fetch(req);
        if (netRes.status === 200 && !netRes.headers.has("set-cookie")) {
          cache.put(req, netRes.clone());
        }
        return netRes;
      }),
    );
    return;
  }

  // Rule 4: Navigation requests: network-first with a 4-second timeout
  // Fall back to the last cached copy of that same page, else to static /offline
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const runtimeCache = await caches.open(RUNTIME_CACHE);

        try {
          // Race network fetch against a 4000ms timeout
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Network timeout")), 4000),
          );

          const netRes = await Promise.race([fetch(req), timeoutPromise]);

          if (netRes && netRes.status === 200 && !netRes.headers.has("set-cookie")) {
            // Store this visited page only on this device
            runtimeCache.put(req, netRes.clone());
          }
          return netRes;
        } catch {
          // Network failed or exceeded 4 seconds: try cached copy of this exact page
          const cachedPage = await runtimeCache.match(req);
          if (cachedPage) {
            return cachedPage;
          }

          // If not visited before on this device, fall back to /offline
          const staticCache = await caches.open(STATIC_CACHE);
          const offlineFallback = await staticCache.match("/offline");
          if (offlineFallback) {
            return offlineFallback;
          }

          return new Response(
            "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Offline</title></head><body><h1>Offline</h1><p>Internet connection required.</p></body></html>",
            {
              status: 503,
              statusText: "Service Unavailable",
              headers: { "Content-Type": "text/html; charset=utf-8" },
            },
          );
        }
      })(),
    );
    return;
  }
});
