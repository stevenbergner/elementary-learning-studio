import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const samples = [
  ["/", null],
  ["/index.html", null],
  ["/elementary-learning-studio/", null],
  ["/elementary-learning-studio/pdfs/pack.pdf", null],
  ["/elementary-learning-studio/b/feature-x/", "b/feature-x"],
  ["/elementary-learning-studio/s/ed811a3/index.html", "s/ed811a3"],
  ["/b/fix.1_x/", "b/fix.1_x"],
  ["/s/ed811a3/", "s/ed811a3"],
  ["/elementary-learning-studio/b/", null],
  ["/elementary-learning-studio/web/x/", null],
];

async function previewScopeFrom(file) {
  const source = await readFile(new URL(`../site/${file}`, import.meta.url), "utf8");
  const body = /function previewScope\(pathname\) \{[\s\S]*?\n\}/.exec(source)?.[0];
  assert.ok(body, `${file} must define previewScope`);
  return { source, previewScope: new Function(`${body}; return previewScope;`)() };
}

test("the page and the service worker recognize the same preview paths", async () => {
  const page = await previewScopeFrom("app.js");
  const worker = await previewScopeFrom("sw.js");
  for (const [path, expected] of samples) {
    assert.equal(page.previewScope(path), expected, `app.js ${path}`);
    assert.equal(worker.previewScope(path), expected, `sw.js ${path}`);
  }
});

test("only the published studio's service worker may delete the legacy cache names", async () => {
  const { source } = await previewScopeFrom("sw.js");
  const version = /const VERSION = "(v\d+)"/.exec(source)[1];
  const run = (scopePath, keys) => {
    const self = { registration: { scope: `https://example.test${scopePath}` } };
    const prelude = source.slice(0, source.indexOf("self.addEventListener"));
    const { CACHE, ownsCache } = new Function("self", "URL", `${prelude}; return { CACHE, ownsCache };`)(self, URL);
    return { CACHE, deleted: keys.filter((key) => key !== CACHE && ownsCache(key)) };
  };
  const all = [
    "elementary-learning-studio-v3",
    `elementary-learning-studio-${version}`,
    "elementary-learning-studio:b/feature:v1",
    `elementary-learning-studio:b/feature:${version}`,
    `elementary-learning-studio:s/ed811a3:${version}`,
  ];
  const published = run("/elementary-learning-studio/", all);
  assert.equal(published.CACHE, `elementary-learning-studio-${version}`);
  assert.deepEqual(published.deleted, ["elementary-learning-studio-v3"]);
  const preview = run("/elementary-learning-studio/b/feature/", all);
  assert.equal(preview.CACHE, `elementary-learning-studio:b/feature:${version}`);
  assert.deepEqual(preview.deleted, ["elementary-learning-studio:b/feature:v1"]);
});
