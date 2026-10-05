// Copy of site/preview-scope.js (a classic worker cannot import modules);
// tests/preview-scope.test.mjs keeps the two behaving identically.
function previewScope(pathname) {
  const match = /(?:^|\/)(b|s)\/([A-Za-z0-9._-]+)\//.exec(String(pathname));
  return match ? `${match[1]}/${match[2]}` : null;
}

// Branch and commit previews share this origin with the published studio, so
// each keeps its own cache and may only clean up caches that belong to it.
const VERSION = "v26";
const SCOPE = previewScope(new URL(self.registration.scope).pathname);
const CACHE_PREFIX = SCOPE ? `elementary-learning-studio:${SCOPE}:` : "elementary-learning-studio-";
const CACHE = `${CACHE_PREFIX}${VERSION}`;
const ownsCache = (key) => (SCOPE
  ? key.startsWith(CACHE_PREFIX)
  : /^elementary-learning-studio-v\d+$/.test(key));
const CORE = [
  "./", "index.html", "voice-privacy.html", "styles.css", "app.js", "voice-intent.js", "preview-scope.js", "sudoku.js", "manifest.webmanifest", "icon.svg",
  "vendor/local-speech-interface/index.js",
  "vendor/local-speech-interface/capabilities.js",
  "vendor/local-speech-interface/domain-grammar.js",
  "vendor/local-speech-interface/integer-domain.js",
  "vendor/local-speech-interface/local-session.js",
  "vendor/local-speech-interface/local-policy.js",
  "vendor/local-speech-interface/page-control.js",
  "vendor/local-speech-interface/speech-event.js",
  "vendor/local-speech-interface/stable-interim.js",
  "vendor/local-speech-interface/loudness-endpointer.js",
  "vendor/local-speech-interface/recognition-input.js",
  "vendor/local-speech-interface/dom-bridge.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && ownsCache(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // The published worker's scope also covers preview paths. Leave those to
  // the network (or to the preview's own worker) so they never enter this cache.
  if (previewScope(url.pathname) !== SCOPE) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
