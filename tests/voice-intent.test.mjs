import test from "node:test";
import assert from "node:assert/strict";

import { resolveVoiceIntent, spokenNumber } from "../site/voice-intent.js";

test("parses the supported number grammars without a language model", () => {
  assert.equal(spokenNumber("forty two"), 42);
  assert.equal(spokenNumber("quatre-vingt-dix"), 90);
  assert.equal(spokenNumber("einhundertdreiundzwanzig"), 123);
  assert.equal(spokenNumber("một trăm lẻ năm"), 105);
});

test("accepts narrow multilingual answer frames without opening the grammar", () => {
  assert.equal(spokenNumber("The answer is forty-two."), 42);
  assert.equal(spokenNumber("La réponse est quarante-deux."), 42);
  assert.equal(spokenNumber("Die Antwort ist 42."), 42);
  assert.equal(spokenNumber("Câu trả lời là bốn mươi hai."), 42);
  assert.equal(spokenNumber("Bitte trage 42 ein."), null);
  assert.equal(resolveVoiceIntent({ transcript: "Die Antwort ist 42." }).value, 42);
});

test("uses the recognizer's primary valid number even when lower alternatives differ", () => {
  const result = resolveVoiceIntent({
    transcript: "forty two",
    alternatives: [
      { text: "forty two", confidence: 0.76 },
      { text: "forty", confidence: 0.22 },
    ],
  });
  assert.equal(result.kind, "number");
  assert.equal(result.value, 42);
  assert.equal(result.match.selection, "primary");
});

test("recovers one unambiguous command or number from n-best alternatives", () => {
  const result = resolveVoiceIntent({
    transcript: "for tea too",
    alternatives: [
      { text: "for tea too", confidence: 0.58 },
      { text: "forty two", confidence: 0.39 },
      { text: "forty two", confidence: 0.03 },
    ],
  });
  assert.equal(result.kind, "number");
  assert.equal(result.value, 42);
  assert.equal(result.match.selection, "alternative");
  assert.equal(result.match.text, "forty two");
});

test("rejects conflicting actionable alternatives instead of guessing", () => {
  const result = resolveVoiceIntent({
    transcript: "unclear",
    alternatives: [
      { text: "unclear", confidence: 0.5 },
      { text: "forty two", confidence: 0.3 },
      { text: "forty", confidence: 0.2 },
    ],
  });
  assert.equal(result.kind, "ambiguous");
  assert.deepEqual(result.candidates.map(({ value }) => value), [42, 40]);
});

test("keeps commands exact and applies application state", () => {
  assert.equal(resolveVoiceIntent({ transcript: "next" }, { readyForNext: false }).permitted, false);
  assert.equal(resolveVoiceIntent({ transcript: "next" }, { readyForNext: true }).permitted, true);
  assert.equal(resolveVoiceIntent({ transcript: "please go next" }).kind, "unmatched");
  assert.equal(resolveVoiceIntent({ transcript: "prüfen" }).intent, "check");
  assert.equal(resolveVoiceIntent({ transcript: "dừng" }).intent, "stop");
});

test("does not infer a number when the answer surface is unavailable", () => {
  const result = resolveVoiceIntent({ transcript: "forty two" }, { answerEnabled: false });
  assert.equal(result.kind, "unmatched");
});
