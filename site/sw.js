const CACHE = "elementary-learning-studio-v9";
const CORE = [
  "./", "index.html", "voice-privacy.html", "styles.css", "app.js", "voice-intent.js", "manifest.webmanifest", "icon.svg",
  "vendor/local-speech-interface/index.js",
  "vendor/local-speech-interface/local-session.js",
  "vendor/local-speech-interface/local-policy.js",
  "vendor/local-speech-interface/speech-event.js",
  "vendor/local-speech-interface/dom-bridge.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

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
