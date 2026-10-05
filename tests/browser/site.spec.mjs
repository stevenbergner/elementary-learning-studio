import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";


async function completeSet(page, { learner = "Timmy", operation = "addition", malformedFirst = false, timing = false } = {}) {
  await page.locator("#learner-name").fill(learner);
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
  await expect(page.locator("#voice-target")).toContainText("number grid");
  await page.locator("details.voice-options").evaluate((details) => { details.open = true; });
  await page.locator("#voice-pointer-follow").check();
  const secondEditable = page.locator(".sudoku-cell:not(.is-given)").nth(1);
  await secondEditable.hover();
  await expect(secondEditable).toHaveClass(/is-selected/);
  await editable.click();
  await page.locator('[data-sudoku-value="2"]').click();
  await expect(editable).toHaveText("2");
  await editable.press("Backspace");
  await expect(editable).toHaveText("");

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
});


test("does not steal focus while a learner name is being entered", async ({ page }) => {
  const learnerName = page.locator("#learner-name");
  await learnerName.focus();
  await page.waitForTimeout(100);
  await expect(learnerName).toBeFocused();
  await learnerName.fill("Timmy");
  await expect(learnerName).toHaveValue("Timmy");
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


test("publishes a precise local-voice privacy brief", async ({ page }) => {
  await page.goto("/voice-privacy.html");
  await expect(page).toHaveTitle(/Local voice and privacy/);
  await expect(page.getByRole("heading", { name: /microphone does not become a cloud service/i })).toBeVisible();
  await expect(page.locator("main")).toContainText("does not silently fall back");
  await expect(page.locator("main")).toContainText("Vietnamese");
  await expect(page.locator("main")).toContainText("not the same as measuring pronunciation quality");
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


test("keeps the portrait-phone practice flow in a clear vertical order", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone-portrait-chromium", "Portrait-phone layout check");
  await page.locator("#practice").scrollIntoViewIfNeeded();

  const boxes = await page.locator(".practice-shell").evaluate((shell) => (
    [".input-mode-panel", ".practice-controls", ".practice-card"].map((selector) => {
      const box = shell.querySelector(selector).getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
    })
  ));
  expect(boxes[0].bottom).toBeLessThanOrEqual(boxes[1].top + 1);
  expect(boxes[1].bottom).toBeLessThanOrEqual(boxes[2].top + 1);
  const viewport = page.viewportSize();
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(viewport.width);
  }
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
  await page.locator("#learner-name").fill("Mia");
  await page.locator("#learner-name").press("Tab");
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


test("keeps unsupported voice input visible but safely unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
  });
  await page.reload();

  await expect(page.locator("#voice-panel")).toBeVisible();
  await expect(page.getByRole("button", { name: "Voice unavailable" })).toBeDisabled();
  await expect(page.locator("#voice-availability")).toHaveText("Unavailable in this browser");
  await expect(page.locator(".answer-actions #voice-toggle")).toHaveCount(0);
});


test("shows local language-pack progress and starts only after the browser confirms listening", async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition extends EventTarget {
      static installed = false;
      static async available() { return this.installed ? "available" : "downloadable"; }
      static async install() {
        await new Promise((resolve) => setTimeout(resolve, 500));
        this.installed = true;
        return true;
      }
      constructor() {
        super();
        this.processLocally = false;
        window.__voiceRecognition = this;
      }
      start() {
        this.dispatchEvent(new Event("start"));
        this.dispatchEvent(new Event("audiostart"));
      }
      abort() {
        this.dispatchEvent(new Event("audioend"));
        this.dispatchEvent(new Event("end"));
      }
      stop() {
        this.dispatchEvent(new Event("audioend"));
        this.dispatchEvent(new Event("end"));
      }
      beginSpeech() { this.dispatchEvent(new Event("speechstart")); }
      endSpeech() { this.dispatchEvent(new Event("speechend")); }
      beginSound() { this.dispatchEvent(new Event("soundstart")); }
      endSound() { this.dispatchEvent(new Event("soundend")); }
      noMatch() { this.dispatchEvent(new Event("nomatch")); }
      emitResult(transcripts, isFinal) {
        const result = transcripts.map(([transcript, confidence]) => ({ transcript, confidence }));
        result.isFinal = isFinal;
        const event = new Event("result");
        Object.defineProperties(event, {
          resultIndex: { value: 0 },
          results: { value: [result] },
        });
        this.dispatchEvent(event);
      }
    }
    window.SpeechRecognition = FakeRecognition;
    window.webkitSpeechRecognition = undefined;
  });
  await page.reload();
  await page.evaluate(() => {
    window.__speechEvents = [];
    window.addEventListener("local-speech-interface:event", (event) => window.__speechEvents.push(event.detail));
  });

  await expect(page.getByRole("button", { name: /Start.*voice/ })).toBeVisible();
  await expect(page.locator("#voice-dock")).toBeHidden();
  await expect(page.locator("#voice-language option")).toHaveText(["English", "Français", "Deutsch", "Tiếng Việt"]);
  await page.getByRole("button", { name: /Start.*voice/ }).click();
  await expect(page.locator("#voice-download")).toBeVisible();
  await expect(page.locator("#voice-download-label")).toContainText("does not report a percentage");
  await expect(page.getByRole("button", { name: "Stop voice input" })).toBeVisible({ timeout: 3_000 });
  await expect(page.locator("#voice-dock")).toBeVisible();
  await expect(page.locator("#voice-availability")).toHaveText("Private on-device speech ready");
  await expect(page.locator("#voice-privacy")).toContainText("processed on this device");
  await expect(page.locator("#voice-signal")).toHaveAttribute("data-state", "listening");
  await expect(page.locator("#voice-signal-label")).toHaveText("Microphone active");

  await page.locator("#voice-debug").evaluate((details) => { details.open = true; });
  await page.locator("#voice-debug-enabled").check();
  await page.evaluate(() => window.__voiceRecognition.beginSpeech());
  await page.evaluate(() => window.__voiceRecognition.emitResult([["four", 0.61]], false));
  await expect(page.locator("#voice-heard")).toContainText("Hearing: “four”");
  await expect(page.locator("#voice-dock-heard")).toContainText("Hearing: “four”");
  await expect(page.locator("#voice-trace")).toContainText("interim");
  await expect(page.locator("#voice-trace")).toContainText("wait up to 900 ms for the utterance boundary");

  await page.evaluate(() => window.__voiceRecognition.emitResult([["forty two", 0.87], ["forty", 0.08]], true));
  await page.evaluate(() => window.__voiceRecognition.endSpeech());
  await expect(page.locator("#answer")).toHaveValue("42");
  await expect(page.locator("#voice-heard")).toContainText("enter 42");
  await expect(page.locator("#voice-status")).toContainText("Say “check” or “done”");
  await expect(page.locator("#voice-trace")).toContainText("studio action: enter 42");
  await expect(page.locator("#voice-debug-state")).toContainText("events in memory");
  await expect(page.locator("#voice-debug-summary")).toContainText("1 speech burst · 1 final text");

  await page.evaluate(() => {
    // Firefox's current local backend emits sound boundaries but does not yet
    // emit speechstart/speechend. Reproduce the one-word/no-text failure at the
    // actual browser lifecycle boundary instead of inventing a transcript.
    window.__voiceRecognition.beginSound();
    window.__voiceRecognition.endSound();
    window.__voiceRecognition.noMatch();
  });
  await expect(page.locator("#voice-debug-summary")).toContainText("2 speech bursts · 1 final text · 1 with no text", { timeout: 2_000 });
  await expect(page.locator("#voice-debug-summary")).toContainText("1 decoder flush");
  await expect(page.locator("#voice-debug-summary")).toContainText("1 restart");

  const diagnosticDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save diagnostic JSON" }).click();
  const diagnostic = await diagnosticDownload;
  const diagnosticPath = await diagnostic.path();
  const diagnosticBundle = JSON.parse(await readFile(diagnosticPath, "utf8"));
  expect(diagnosticBundle.privacy).toEqual({
    rawAudioRecorded: false,
    uploaded: false,
    retention: "memory-until-explicit-local-download",
  });
  expect(diagnosticBundle.summary.speechBursts).toBe(2);
  expect(diagnosticBundle.summary.noText).toBe(1);
  expect(diagnosticBundle.events.some((event) => event.payload?.state === "speech-started")).toBeTruthy();

  const gridCell = page.locator(".sudoku-cell:not(.is-given)").first();
  await gridCell.click();
  await expect(page.locator("#voice-target")).toContainText("number grid");
  await page.evaluate(() => window.__voiceRecognition.emitResult([["three", 0.96]], true));
  await expect(gridCell).toHaveText("3");
  await expect(page.locator("#voice-status")).toContainText("entered in the highlighted number-grid cell");
  await page.evaluate(() => window.__voiceRecognition.emitResult([["nine", 0.96]], true));
  await expect(gridCell).toHaveText("3");
  await expect(page.locator("#voice-status")).toContainText("accepts only 1, 2, 3, or 4");
  await expect(page.locator("#voice-dock-status")).toContainText("accepts only 1, 2, 3, or 4");

  const speechEvents = await page.evaluate(() => window.__speechEvents);
  expect(speechEvents.some((event) => event.type === "recognition.interim")).toBeTruthy();
  const finalRecognition = speechEvents.find((event) => event.type === "recognition.final" && event.payload.transcript === "forty two");
  expect(finalRecognition).toBeTruthy();
  expect(finalRecognition.payload.recognizer).toMatchObject({
    requestedLocale: "en-US",
    languageSelection: "explicit",
    detectedLocale: null,
    capabilities: { transcript: true, alternatives: true, wordTiming: false },
  });
  expect(speechEvents.some((event) => event.type === "intent.proposed" && event.payload.interpretation.value === 42)).toBeTruthy();
  expect(speechEvents.some((event) => event.type === "action.rejected" && event.payload.reason === "outside-active-domain")).toBeTruthy();
  expect(speechEvents.every((event) => event.protocol === "local-speech-interface/v0.1")).toBeTruthy();
  expect(speechEvents.every((event) => event.privacy.networkUsed === false)).toBeTruthy();

  await page.getByRole("button", { name: "Stop voice input" }).click();
  await expect(page.locator("#voice-signal")).toHaveAttribute("data-state", "off");
  await expect(page.locator("#voice-dock")).toBeHidden();
  await expect(page.locator("#voice-signal-detail")).toHaveText("No audio is being captured.");
});


test("flushes a retained final word on an adaptive utterance boundary", async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition extends EventTarget {
      static async available() { return "available"; }
      static async install() { return true; }
      constructor() {
        super();
        this.processLocally = false;
        window.__voiceRecognition = this;
        window.__gracefulStops = 0;
      }
      start() {
        this.dispatchEvent(new Event("audiostart"));
      }
      abort() {
        this.dispatchEvent(new Event("audioend"));
        this.dispatchEvent(new Event("end"));
      }
      stop() {
        window.__gracefulStops += 1;
        this.emitResult("forty two", true);
        this.dispatchEvent(new Event("audioend"));
        this.dispatchEvent(new Event("end"));
      }
      emitResult(transcript, isFinal) {
        const result = [{ transcript, confidence: 0.95 }];
        result.isFinal = isFinal;
        const event = new Event("result");
        Object.defineProperties(event, {
          resultIndex: { value: 0 },
          results: { value: [result] },
        });
        this.dispatchEvent(event);
      }
    }
    window.SpeechRecognition = FakeRecognition;
    window.webkitSpeechRecognition = undefined;
  });
  await page.reload();
  await page.evaluate(() => {
    window.__speechEvents = [];
    window.addEventListener("local-speech-interface:event", (event) => window.__speechEvents.push(event.detail));
  });

  await page.getByRole("button", { name: /Start.*voice/ }).click();
  await expect(page.getByRole("button", { name: "Stop voice input" })).toBeVisible();
  await page.evaluate(() => window.__voiceRecognition.emitResult("forty", false));
  await expect(page.locator("#voice-heard")).toContainText("Hearing: “forty”");

  await expect(page.locator("#answer")).toHaveValue("42", { timeout: 2_000 });
  await expect.poll(() => page.evaluate(() => window.__gracefulStops)).toBe(1);
  const events = await page.evaluate(() => window.__speechEvents);
  const interim = events.find((event) => event.type === "recognition.interim");
  expect(interim.payload.timing.adaptiveFlushMs).toBe(900);
  expect(events.some((event) => event.type === "recognition.final" && event.payload.transcript === "forty two")).toBeTruthy();
});


test("uses a short exact-command deadline without acting on continuing commentary", async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition extends EventTarget {
      static async available() { return "available"; }
      static async install() { return true; }
      constructor() {
        super();
        this.processLocally = false;
        window.__voiceRecognition = this;
      }
      start() { this.dispatchEvent(new Event("audiostart")); }
      abort() {
        this.dispatchEvent(new Event("audioend"));
        this.dispatchEvent(new Event("end"));
      }
      stop() {}
      emitResult(transcript, isFinal) {
        const result = [{ transcript, confidence: 0.9 }];
        result.isFinal = isFinal;
        const event = new Event("result");
        Object.defineProperties(event, {
          resultIndex: { value: 0 },
          results: { value: [result] },
        });
        this.dispatchEvent(event);
      }
    }
    window.SpeechRecognition = FakeRecognition;
    window.webkitSpeechRecognition = undefined;
  });
  await page.reload();
  await page.evaluate(() => {
    window.__speechEvents = [];
    window.addEventListener("local-speech-interface:event", (event) => window.__speechEvents.push(event.detail));
  });
  await page.getByRole("button", { name: /Start.*voice/ }).click();

  await page.evaluate(() => window.__voiceRecognition.emitResult("next", false));
  const exact = await page.evaluate(() => window.__speechEvents.findLast((event) => event.type === "recognition.interim"));
  expect(exact.payload.timing).toMatchObject({
    adaptiveFlushMs: 500,
    baselineAdaptiveFlushMs: 900,
    flushPolicy: "consumer-selected",
  });

  await page.evaluate(() => window.__voiceRecognition.emitResult("next okay", false));
  const continued = await page.evaluate(() => window.__speechEvents.findLast((event) => event.type === "recognition.interim"));
  expect(continued.payload.timing.adaptiveFlushMs).toBeGreaterThan(500);
  expect(continued.payload.timing.flushPolicy).toBe("adaptive-cadence");

  const progress = await page.locator("#progress-label").innerText();
  await page.evaluate(() => window.__voiceRecognition.emitResult(
    "next okay so next and done are really not robust",
    true,
  ));
  await expect(page.locator("#progress-label")).toHaveText(progress);
  await expect(page.locator("#voice-status")).toContainText("did not match");

  const a = Number(await page.locator("#operand-a").innerText());
  const b = Number(await page.locator("#operand-b").innerText());
  await page.locator("#answer").fill(String(a + b));
  await page.evaluate(() => window.__voiceRecognition.emitResult("next done", true));
  await expect(page.locator("#progress-label")).not.toHaveText(progress);
});


test("stops hidden-page capture while draining the word already heard", async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition extends EventTarget {
      static async available() { return "available"; }
      static async install() { return true; }
      constructor() {
        super();
        this.processLocally = false;
        this.pending = "";
        window.__voiceRecognition = this;
        window.__hiddenPageStops = 0;
        window.__hiddenPageAborts = 0;
      }
      start() {
        this.dispatchEvent(new Event("audiostart"));
      }
      abort() {
        window.__hiddenPageAborts += 1;
        this.dispatchEvent(new Event("audioend"));
        this.dispatchEvent(new Event("end"));
      }
      stop() {
        window.__hiddenPageStops += 1;
        if (this.pending) this.emitResult(this.pending, true);
        this.dispatchEvent(new Event("audioend"));
        this.dispatchEvent(new Event("end"));
      }
      emitResult(transcript, isFinal) {
        this.pending = transcript;
        const result = [{ transcript, confidence: 0.97 }];
        result.isFinal = isFinal;
        const event = new Event("result");
        Object.defineProperties(event, {
          resultIndex: { value: 0 },
          results: { value: [result] },
        });
        this.dispatchEvent(event);
      }
    }
    window.SpeechRecognition = FakeRecognition;
    window.webkitSpeechRecognition = undefined;
  });
  await page.reload();

  const a = Number(await page.locator("#operand-a").innerText());
  const b = Number(await page.locator("#operand-b").innerText());
  const spokenAnswer = String(a + b);
  await page.getByRole("button", { name: /Start.*voice/ }).click();
  await expect(page.getByRole("button", { name: "Stop voice input" })).toBeVisible();
  await page.evaluate((answer) => window.__voiceRecognition.emitResult(answer, false), spokenAnswer);
  await expect(page.locator("#voice-dock-heard")).toContainText(spokenAnswer);

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect(page.locator("#answer")).toHaveValue(spokenAnswer);
  await expect(page.locator("#voice-status")).toContainText(`${spokenAnswer} entered`);
  await expect(page.getByRole("button", { name: /Start.*voice/ })).toBeVisible();
  await expect(page.locator("#voice-dock")).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__hiddenPageStops)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__hiddenPageAborts)).toBe(0);
});


test("accepts a trailing spoken answer and lets next validate before advancing", async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition extends EventTarget {
      static async available() { return "available"; }
      static async install() { return true; }
      constructor() {
        super();
        this.processLocally = false;
        window.__voiceRecognition = this;
      }
      start() {
        this.dispatchEvent(new Event("audiostart"));
      }
      abort() {
        this.dispatchEvent(new Event("audioend"));
        this.dispatchEvent(new Event("end"));
      }
      stop() {
        this.dispatchEvent(new Event("audioend"));
        this.dispatchEvent(new Event("end"));
      }
      emitFinal(transcript) {
        const result = [{ transcript, confidence: 0.98 }];
        result.isFinal = true;
        const event = new Event("result");
        Object.defineProperties(event, {
          resultIndex: { value: 0 },
          results: { value: [result] },
        });
        this.dispatchEvent(event);
      }
    }
    window.SpeechRecognition = FakeRecognition;
    window.webkitSpeechRecognition = undefined;
  });
  await page.reload();
  await page.getByRole("button", { name: /Start.*voice/ }).click();
  await expect(page.getByRole("button", { name: "Stop voice input" })).toBeVisible();

  const a = Number(await page.locator("#operand-a").innerText());
  const b = Number(await page.locator("#operand-b").innerText());
  const answer = a + b;
  const answerWords = await page.evaluate(async (value) => {
    const { renderIntegerWords } = await import("./vendor/local-speech-interface/integer-domain.js");
    return renderIntegerWords(value, "en");
  }, answer);
  await page.evaluate(
    (utterance) => window.__voiceRecognition.emitFinal(utterance),
    `I read ${a} plus ${b} and I think the answer is ${answerWords}`,
  );
  await expect(page.locator("#answer")).toHaveValue(String(answer));
  await expect(page.locator("#voice-dock-heard")).toContainText("used trailing answer");

  await page.evaluate(() => window.__voiceRecognition.emitFinal("check"));
  await expect(page.locator("#progress-label")).toHaveText("1 of 10");
  await expect(page.locator("#feedback")).toHaveClass(/success/);
  await expect(page.locator("#voice-status")).toContainText("Say “next”");

  await page.evaluate(() => window.__voiceRecognition.emitFinal("next"));
  await expect(page.locator("#progress-label")).toHaveText("2 of 10", { timeout: 2_000 });

  const nextA = Number(await page.locator("#operand-a").innerText());
  const nextB = Number(await page.locator("#operand-b").innerText());
  await page.evaluate(() => window.__voiceRecognition.emitFinal("skip"));
  await expect(page.locator("#progress-label")).toHaveText("2 of 10");
  await expect(page.locator("#voice-status")).toContainText("no skip policy");

  await page.locator("#answer").fill(String(nextA + nextB + 1));
  await page.evaluate(() => window.__voiceRecognition.emitFinal("next"));
  await expect(page.locator("#progress-label")).toHaveText("2 of 10");
  await expect(page.locator("#feedback")).toContainText("Not yet");
  await expect(page.locator("#voice-status")).toContainText("not correct yet");

  await page.locator("#answer").fill(String(nextA + nextB));
  await page.evaluate(() => window.__voiceRecognition.emitFinal("next"));
  await expect(page.locator("#progress-label")).toHaveText("3 of 10", { timeout: 2_000 });

  const gridCell = page.locator(".sudoku-cell:not(.is-given)").first();
  await gridCell.click();
  await page.evaluate(() => window.__voiceRecognition.emitFinal("I think this square should be three"));
  await expect(gridCell).toHaveText("3");
  await page.evaluate(() => window.__voiceRecognition.emitFinal("right and down"));
  await expect(page.locator("#voice-target")).toContainText("row 4, column 4");
  await page.evaluate(() => window.__voiceRecognition.emitFinal("nach oben und nach links"));
  await expect(page.locator("#voice-target")).toContainText("row 1, column 1");
});


test("resolves one safe n-best alternative and rejects conflicting alternatives", async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition extends EventTarget {
      static async available() { return "available"; }
      static async install() { return true; }
      constructor() {
        super();
        this.processLocally = false;
        window.__voiceRecognition = this;
      }
      start() { this.dispatchEvent(new Event("audiostart")); }
      abort() {
        this.dispatchEvent(new Event("audioend"));
        this.dispatchEvent(new Event("end"));
      }
      stop() {
        this.dispatchEvent(new Event("audioend"));
        this.dispatchEvent(new Event("end"));
      }
      emitFinal(alternatives) {
        const result = alternatives.map(([transcript, confidence]) => ({ transcript, confidence }));
        result.isFinal = true;
        const event = new Event("result");
        Object.defineProperties(event, {
          resultIndex: { value: 0 },
          results: { value: [result] },
        });
        this.dispatchEvent(event);
      }
    }
    window.SpeechRecognition = FakeRecognition;
    window.webkitSpeechRecognition = undefined;
  });
  await page.reload();
  await page.evaluate(() => {
    window.__speechEvents = [];
    window.addEventListener("local-speech-interface:event", (event) => window.__speechEvents.push(event.detail));
  });
  await page.getByRole("button", { name: /Start.*voice/ }).click();

  await page.evaluate(() => window.__voiceRecognition.emitFinal([
    ["for tea too", 0.58],
    ["forty two", 0.39],
    ["42", 0.03],
  ]));
  await expect(page.locator("#answer")).toHaveValue("42");
  await expect(page.locator("#voice-heard")).toContainText("matched alternative “forty two”");
  const selected = await page.evaluate(() => window.__speechEvents.findLast((event) => event.type === "intent.proposed"));
  expect(selected.payload.interpretation).toMatchObject({
    kind: "number",
    value: 42,
    match: { selection: "alternative", text: "forty two" },
  });

  await page.evaluate(() => window.__voiceRecognition.emitFinal([
    ["unclear", 0.5],
    ["forty two", 0.3],
    ["forty", 0.2],
  ]));
  await expect(page.locator("#answer")).toHaveValue("42");
  await expect(page.locator("#voice-status")).toContainText("more than one possible number or command");
  const rejected = await page.evaluate(() => window.__speechEvents.findLast((event) => event.type === "action.rejected"));
  expect(rejected.payload.reason).toBe("recognition alternatives conflict");

  await page.evaluate(() => {
    document.querySelector("#answer").disabled = true;
    window.__voiceRecognition.emitFinal([["forty two", 0.9]]);
  });
  await expect(page.locator("#voice-status")).toContainText("recognized that input");
  const unavailable = await page.evaluate(() => ({
    intent: window.__speechEvents.findLast((event) => event.type === "intent.proposed"),
    action: window.__speechEvents.findLast((event) => event.type === "action.rejected"),
  }));
  expect(unavailable.intent.payload.interpretation).toMatchObject({
    kind: "number", value: 42, permitted: false, permission: "answer-unavailable",
  });
  expect(unavailable.action.payload.reason).toBe("answer-unavailable");
});


test("completes a whole practice set from spoken numbers", async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition extends EventTarget {
      static async available() { return "available"; }
      static async install() { return true; }
      constructor() {
        super();
        this.processLocally = false;
        window.__voiceRecognition = this;
      }
      start() {
        this.dispatchEvent(new Event("start"));
        this.dispatchEvent(new Event("audiostart"));
      }
      abort() {
        this.dispatchEvent(new Event("audioend"));
        this.dispatchEvent(new Event("end"));
      }
      stop() {
        this.dispatchEvent(new Event("audioend"));
        this.dispatchEvent(new Event("end"));
      }
      emitFinal(transcript) {
        const result = [{ transcript, confidence: 0.99 }];
        result.isFinal = true;
        const event = new Event("result");
        Object.defineProperties(event, {
          resultIndex: { value: 0 },
          results: { value: [result] },
        });
        this.dispatchEvent(event);
      }
    }
    window.SpeechRecognition = FakeRecognition;
    window.webkitSpeechRecognition = undefined;
  });
  await page.reload();
  await page.getByRole("button", { name: /Start.*voice/ }).click();
  await expect(page.getByRole("button", { name: "Stop voice input" })).toBeVisible();
  await page.locator("details.voice-options").evaluate((details) => {
    details.open = true;
  });
  await page.locator("#voice-auto-check").check();

  for (let question = 0; question < 10; question += 1) {
    const a = Number(await page.locator("#operand-a").innerText());
    const b = Number(await page.locator("#operand-b").innerText());
    await page.evaluate((answer) => window.__voiceRecognition.emitFinal(String(answer)), a + b);
    if (question < 9) await expect(page.locator("#progress-label")).toHaveText(`${question + 2} of 10`, { timeout: 2_000 });
  }

  await expect(page.locator("#complete-view")).toBeVisible({ timeout: 2_000 });
  await expect(page.locator("#result-summary")).toContainText("You solved all 10");
  await expect(page.getByRole("button", { name: "Stop voice input" })).toBeVisible();
  await expect(page.locator("#voice-dock")).toBeVisible();
  await expect(page.locator("#voice-dock-target")).toContainText("No active answer target");
});


test("never falls back to an online recognizer when a local pack is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition extends EventTarget {
      static async available() { return "unavailable"; }
      static async install() { throw new Error("install must not be called"); }
      constructor() { super(); this.processLocally = false; }
      start() { window.__recognitionStarted = true; }
      abort() {}
    }
    window.SpeechRecognition = FakeRecognition;
    window.webkitSpeechRecognition = undefined;
    window.__recognitionStarted = false;
  });
  await page.reload();

  await page.getByRole("button", { name: /Start.*voice/ }).click();
  await expect(page.locator("#voice-availability")).toHaveText("Private local speech unavailable");
  await expect(page.locator("#voice-status")).toContainText("Voice remains off");
  await expect(page.locator("#voice-status")).toContainText("keyboard and touch still work");
  await expect.poll(() => page.evaluate(() => window.__recognitionStarted)).toBe(false);
});
