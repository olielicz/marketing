/**
 * Minimal service worker so OliFlow's app shell is installable as a PWA
 * (Chrome/Android's install criteria require a registered service worker
 * with a fetch handler, even a trivial one like this).
 *
 * This intentionally does NOT cache API/data responses — only the static
 * app shell — so workflow data is always fetched fresh. Bump CACHE_NAME
 * whenever app/index.html changes meaningfully to bust old caches.
 */
const CACHE_NAME = "oliflow-app-shell-v1";
const SHELL_FILES = ["./", "./index.html", "./manifest.json", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  // Network-first for navigation/app-shell requests, falling back to cache
  // when offline. Everything else (API calls, etc.) passes through untouched.
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
