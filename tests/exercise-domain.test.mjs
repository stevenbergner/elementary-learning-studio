import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { compileExerciseSheet } from "../site/exercise-domain.js";

const sheet = JSON.parse(await readFile(new URL("../content/exercises/fr-conversation-starter.json", import.meta.url), "utf8"));

test("compiles a curated French sheet and verifies its transcription receipts", () => {
  const exercise = compileExerciseSheet(sheet);
  assert.deepEqual(exercise.promptIds, ["greeting", "thanks", "wellbeing", "farewell"]);
  for (const prompt of sheet.prompts) {
    for (const receipt of prompt.receipts) {
      const resolution = exercise.resolve(prompt.id, { transcript: receipt.transcript });
      assert.equal(resolution.kind, "one", `${prompt.id}: ${receipt.transcript}`);
      assert.equal(resolution.interpretation.value.answerId, receipt.answerId);
    }
  }
});

test("accepts reviewed variants but rejects plausible unreviewed language", () => {
  const exercise = compileExerciseSheet(sheet);
  assert.equal(exercise.resolve("thanks", { transcript: "Merci." }).kind, "one");
  assert.equal(exercise.resolve("wellbeing", { transcript: "Je vais bien." }).kind, "one");
  assert.equal(exercise.resolve("greeting", { transcript: "Bonsoir." }).kind, "none");
  assert.equal(exercise.resolve("greeting", { transcript: "Salute." }).kind, "none");
});

test("refuses a surface that means two different things within one prompt", () => {
  assert.throws(() => compileExerciseSheet({
    id: "collision",
    locale: "fr-FR",
    prompts: [{
      id: "choice",
      answers: [
        { id: "yes", canonical: "Oui", surfaces: ["d'accord"] },
        { id: "maybe", canonical: "Peut-être", surfaces: ["d'accord"] },
      ],
    }],
  }), /domain collision/);
});
