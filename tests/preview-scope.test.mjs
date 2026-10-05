import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { previewScope } from "../site/preview-scope.js";

const samples = [
  ["/", null],
  ["/index.html", null],
  ["/elementary-learning-studio/", null],
  ["/elementary-learning-studio/pdfs/pack.pdf", null],
  ["/elementary-learning-studio/b/feature-voice/", "b/feature-voice"],
  ["/elementary-learning-studio/s/ed811a3/index.html", "s/ed811a3"],
  ["/b/fix.1_x/", "b/fix.1_x"],
  ["/s/ed811a3/", "s/ed811a3"],
  ["/elementary-learning-studio/b/", null],
  ["/elementary-learning-studio/web/x/", null],
];

test("recognizes branch and commit preview paths and leaves the published studio unscoped", () => {
  for (const [path, expected] of samples) assert.equal(previewScope(path), expected, path);
});

test("the service worker's copy of previewScope agrees with the module", async () => {
  const source = await readFile(new URL("../site/sw.js", import.meta.url), "utf8");
  const body = /function previewScope\(pathname\) \{[\s\S]*?\n\}/.exec(source)?.[0];
  assert.ok(body, "sw.js must define previewScope");
  const workerCopy = new Function(`${body}; return previewScope;`)();
  for (const [path] of samples) assert.equal(workerCopy(path), previewScope(path), path);
});

test("only the published studio's service worker may delete the legacy cache names", async () => {
  const source = await readFile(new URL("../site/sw.js", import.meta.url), "utf8");
  const run = (scopePath, keys) => {
    const self = { registration: { scope: `https://example.test${scopePath}` } };
    const prelude = source.slice(0, source.indexOf("self.addEventListener"));
    const fn = new Function("self", "URL", `${prelude}; return { CACHE, ownsCache };`);
    const { CACHE, ownsCache } = fn(self, URL);
    return { CACHE, deleted: keys.filter((key) => key !== CACHE && ownsCache(key)) };
  };
  const version = /const VERSION = "(v\d+)"/.exec(source)[1];
  const all = [
    "elementary-learning-studio-v23",
    `elementary-learning-studio-${version}`,
    "elementary-learning-studio:b/feature:v1",
    `elementary-learning-studio:b/feature:${version}`,
    `elementary-learning-studio:s/ed811a3:${version}`,
  ];
  const published = run("/elementary-learning-studio/", all);
  assert.equal(published.CACHE, `elementary-learning-studio-${version}`);
  assert.deepEqual(published.deleted, ["elementary-learning-studio-v23"]);
  const preview = run("/elementary-learning-studio/b/feature/", all);
  assert.equal(preview.CACHE, `elementary-learning-studio:b/feature:${version}`);
  assert.deepEqual(preview.deleted, ["elementary-learning-studio:b/feature:v1"]);
});
