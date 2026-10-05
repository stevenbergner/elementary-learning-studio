// Identifies a branch or commit preview from the page path. The published
// studio lives at the site root and returns null. A preview lives under
// /b/<branch>/ or /s/<sha>/ and returns "b/<branch>" or "s/<sha>". Previews
// share one browser origin with the published studio, so storage keys and
// offline caches must be namespaced by this value. sw.js carries a copy of
// this function because a classic service worker cannot import modules;
// tests/preview-scope.test.mjs keeps the two in step.
export function previewScope(pathname) {
  const match = /(?:^|\/)(b|s)\/([A-Za-z0-9._-]+)\//.exec(String(pathname));
  return match ? `${match[1]}/${match[2]}` : null;
}
