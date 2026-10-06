import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";


// On the emulated phone the page can still be scrolling when the test types;
// confirm the name arrived, then leave the field the way a person would.
async function typeLearnerName(page, learner) {
  const learnerName = page.locator("#learner-name");
  await expect(async () => {
    await learnerName.fill(learner);
    await expect(learnerName).toHaveValue(learner, { timeout: 500 });
  }).toPass({ timeout: 5_000 });
  await learnerName.press("Tab");
}

async function completeSet(page, { learner = "Timmy", operation = "addition", malformedFirst = false, timing = false } = {}) {
  await typeLearnerName(page, learner);
  if (timing) await page.locator("#timing-enabled").check();
  await page.locator(`[data-operation="${operation}"]`).click();

  for (let question = 0; question < 10; question += 1) {
    const a = Number(await page.locator("#operand-a").innerText());
    const b = Number(await page.locator("#operand-b").innerText());
    const symbol = await page.locator("#operator").innerText();
    const solution = symbol === "+" ? a + b : symbol === "−" ? a - b : symbol === "×" ? a * b : a / b;
    const answer = page.locator("#answer");
    if (question === 0 && malformedFirst) {
      await answer.fill("hello");
      await answer.press("Enter");
      await expect(page.locator("#feedback")).toContainText("whole number");
    }
    await answer.fill(String(solution));
    await answer.press("Enter");
    await page.locator("#check-answer").press("Enter");
  }
  await expect(page.locator("#complete-view")).toBeVisible();
}


test.beforeEach(async ({ page }) => {
  await page.goto("/");
});


test("loads without JavaScript errors and exposes the core learning paths", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.reload();
  await page.waitForLoadState("networkidle");

  await expect(page).toHaveTitle("Elementary Learning Studio");
  await expect(page.getByRole("heading", { name: /Math you can/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the printable pack" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Addition" })).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});


test("supports a complete keyboard answer flow", async ({ page }) => {
  await page.locator('[data-operation="multiplication"]').click();

  const a = Number(await page.locator("#operand-a").innerText());
  const b = Number(await page.locator("#operand-b").innerText());
  const answer = page.getByLabel("Your answer");

  await answer.fill(String(a * b));
  await answer.press("Enter");

  await expect(page.locator("#feedback")).toHaveClass(/success/);
  await expect(page.getByRole("button", { name: "Next question" })).toBeFocused();
  await page.getByRole("button", { name: "Next question" }).press("Enter");
  await expect(page.locator("#progress-label")).toHaveText("2 of 10");
  await expect(answer).toBeFocused();
});


test("gives a strategy hint without exposing the numeric answer", async ({ page }) => {
  await page.getByRole("button", { name: "Give me a hint" }).click();
  const hint = await page.locator("#hint-text").innerText();

  expect(hint.length).toBeGreaterThan(15);
  expect(hint).not.toContain("=");
  expect(hint).not.toMatch(/answer is/i);
});


test("publishes the reviewed PDF in the Pages artifact", async ({ request }) => {
  const response = await request.get("/pdfs/grade4_fluency-starter-pack.pdf");
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-type"]).toContain("application/pdf");
  expect((await response.body()).byteLength).toBeGreaterThan(10_000);
});


test("keeps the page inside the viewport and touch controls comfortably sized", async ({ page }) => {
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBeFalsy();

  await page.locator("#practice").scrollIntoViewIfNeeded();
  for (const button of await page.locator(".operation").all()) {
    const size = await button.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height };
    });
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
  }

  const answerSize = await page.locator("#answer").evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { width: box.width, height: box.height };
  });
  expect(answerSize.width).toBeGreaterThanOrEqual(44);
  expect(answerSize.height).toBeGreaterThanOrEqual(44);
});


test("supports a uniquely solvable child Sudoku by mouse, touch, and keyboard", async ({ page }) => {
  await page.locator("#number-grid").scrollIntoViewIfNeeded();
  const cells = page.locator(".sudoku-cell");
  await expect(cells).toHaveCount(16);
  await expect(page.locator(".sudoku-cell.is-given")).toHaveCount(9);

  const editable = page.locator(".sudoku-cell:not(.is-given)").first();
  await editable.hover();
  await expect(editable).not.toHaveClass(/is-selected/);
  await editable.click();
  await expect(editable).toHaveClass(/is-selected/);
  await page.locator('[data-sudoku-value="2"]').click();
  await expect(editable).toHaveText("2");
  await editable.press("Backspace");
  await expect(editable).toHaveText("");

  const given = page.locator(".sudoku-cell.is-given").first();
  await given.click();
  await expect(page.locator("#sudoku-feedback")).toContainText("fixed clue");

  const solution = await page.evaluate(async () => {
    const { CHILD_SUDOKU_PUZZLES } = await import("./sudoku.js");
    return [...CHILD_SUDOKU_PUZZLES[0].solution];
  });
  for (const cell of await page.locator(".sudoku-cell:not(.is-given)").all()) {
    const index = Number(await cell.getAttribute("data-sudoku-index"));
    await cell.click();
    await cell.press(String(solution[index]));
  }
  await page.getByRole("button", { name: "Check the grid" }).click();
  await expect(page.locator("#sudoku-feedback")).toContainText("whole grid works");
  await expect(page.locator(".sudoku-cell.is-wrong")).toHaveCount(0);

  await page.getByRole("button", { name: "New grid" }).click();
  await expect(page.locator("#sudoku-label")).toHaveText("Easy grid 2 of 4");
  await expect(page.locator(".sudoku-cell.is-selected")).toHaveCount(1);
});


test("keeps the portrait-phone practice flow in a clear vertical order", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-portrait-chromium", "Portrait-phone layout check");
  await page.locator("#practice").scrollIntoViewIfNeeded();
  const boxes = await page.locator(".practice-controls, .practice-card").evaluateAll((items) => items.map((item) => {
    const box = item.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
  }));
  expect(boxes[0].bottom).toBeLessThanOrEqual(boxes[1].top + 1);
  const viewport = page.viewportSize();
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(viewport.width);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
});


test("remembers named learners and exposes meaningful local progress", async ({ page }) => {
  await completeSet(page, { learner: "Timmy", malformedFirst: true, timing: true });
  await page.getByRole("button", { name: "Confidence 4 out of 5" }).click();
  await page.getByRole("button", { name: "View progress", exact: true }).click();

  await expect(page.locator("#stats-grid")).toContainText("100%");
  await expect(page.locator("#stats-grid")).toContainText("0 · 0");
  await expect(page.locator("#session-list")).toContainText("Timmy");
  await expect(page.locator("#session-list")).toContainText("4/5");
  await expect(page.locator("#timing-view-label")).toBeVisible();
  await expect(page.locator(".timing-column").first()).toBeHidden();

  await page.reload();
  await expect(page.locator("#learner-name")).toHaveValue("Timmy");
  await typeLearnerName(page, "Mia");
  await expect(page.locator("#known-learners option")).toHaveCount(2);
});


test("downloads an informal award and interoperable xAPI statements", async ({ page }) => {
  await completeSet(page, { learner: "Mia", operation: "multiplication" });

  const awardPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download practice award" }).click();
  const award = await awardPromise;
  expect(award.suggestedFilename()).toBe("mia-practice-award.svg");
  const awardText = await readFile(await award.path(), "utf8");
  expect(awardText).toContain("Mia");
  expect(awardText).toContain("not a graded or verified credential");

  await page.getByRole("button", { name: "View progress", exact: true }).click();
  const csvPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const csv = await csvPromise;
  const csvText = await readFile(await csv.path(), "utf8");
  expect(csvText).toContain("learner,completed_at,operation");
  expect(csvText).toContain("Mia");

  const xapiPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download xAPI JSON" }).click();
  const xapi = await xapiPromise;
  const statements = JSON.parse(await readFile(await xapi.path(), "utf8"));
  expect(statements).toHaveLength(1);
  expect(statements[0].actor.name).toBe("Mia");
  expect(statements[0].verb.id).toBe("http://adlnet.gov/expapi/verbs/completed");
  expect(statements[0].object.id).toContain("activities/multiplication");
  expect(statements[0].result).toMatchObject({ completion: true, success: true });
});


test("offers no voice input and never asks for the microphone", async ({ page }) => {
  await page.addInitScript(() => {
    window.__speechConstructed = 0;
    window.__microphoneRequests = 0;
    window.SpeechRecognition = class extends EventTarget {
      constructor() { super(); window.__speechConstructed += 1; }
      start() {}
      stop() {}
    };
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = async () => { window.__microphoneRequests += 1; throw new Error("not expected"); };
    }
  });
  await page.reload();
  await expect(page.locator("#answer")).toBeVisible();
  await expect(page.locator("[id^=voice]")).toHaveCount(0);
  await page.locator("#answer").fill("1");
  await page.getByRole("button", { name: "Check my answer" }).click();
  expect(await page.evaluate(() => [window.__speechConstructed, window.__microphoneRequests])).toEqual([0, 0]);
});


test.describe("branch and commit previews", () => {
  // Storage isolation is under test here; the service worker is covered by
  // tests/preview-scope.test.mjs and would bypass the routed preview path.
  test.use({ serviceWorkers: "block" });

  test("a branch preview keeps its own learner storage apart from the published studio", async ({ page }) => {
    const store = (name) => JSON.stringify({
      version: 2,
      profiles: [{ id: `id-${name}`, name, createdAt: "2026-10-05T00:00:00.000Z" }],
      sessions: [],
      lastProfileId: null,
      legacy: null,
    });
    // Serve the same build under /b/demo/ the way a Pages preview would.
    await page.route("**/b/demo/**", async (route) => {
      const response = await route.fetch({ url: route.request().url().replace("/b/demo/", "/") });
      await route.fulfill({ response });
    });

    await page.goto("/");
    await page.evaluate((value) => localStorage.setItem("elementary-learning-studio-progress-v2", value), store("Published"));
    await page.reload();
    await expect(page.locator("#known-learners option")).toHaveAttribute("value", "Published");

    await page.goto("/b/demo/");
    await expect(page.locator("#learner-name")).toBeVisible();
    await expect(page.locator("#known-learners option")).toHaveCount(0);

    await page.evaluate((value) => localStorage.setItem("elementary-learning-studio-progress-v2:preview:b/demo", value), store("Preview"));
    await page.reload();
    await expect(page.locator("#known-learners option")).toHaveAttribute("value", "Preview");

    await page.goto("/");
    await expect(page.locator("#known-learners option")).toHaveAttribute("value", "Published");
    await expect(page.locator("#known-learners option")).toHaveCount(1);
  });
});
