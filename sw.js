// Cache name is bumped on every meaningful change to this file so the activate handler below
// actually purges the old cache — it's also the only thing that makes the browser notice the
// service worker itself changed and re-run install/activate.
const CACHE = "kcal-tracker-v2";
const ASSETS = [
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js"
];

// Install: pre-cache the CDN libraries only. index.html is deliberately NOT pre-cached here —
// see the fetch handler below for why.
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate: remove any cache from a previous version.
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy is split in two, and the split is the whole point of this file:
//
//  - Navigations and index.html itself: NETWORK-FIRST. This app has no build step — "shipping
//    an update" just means the HTML file on GitHub Pages changes — so the one thing this
//    service worker must never do is serve a stale copy of that file when the network is
//    available. Falling back to cache only covers being offline.
//
//  - Everything else (the pinned-version CDN libraries): CACHE-FIRST, unchanged from before.
//    Their URLs are version-pinned and never change content, so caching them is a pure win —
//    it's what makes cold starts faster and the app usable offline at all.
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.url.includes("anthropic.com")) return; // never intercept API calls

  const isHTML = req.mode === "navigate" || req.destination === "document" || req.url.endsWith("/") || req.url.endsWith("index.html");

  if (isHTML) {
    e.respondWith(
      fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(req, clone));
        return res;
      }).catch(() => caches.match(req).then(cached => cached || caches.match("/Kcal-Tracking/index.html")))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (req.url.includes("cdnjs.cloudflare.com")) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
