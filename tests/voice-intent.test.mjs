import test from "node:test";
import assert from "node:assert/strict";

import {
  commandAwareInterimFlushDelay,
  resolveVoiceIntent,
  spokenNumber,
} from "../site/voice-intent.js";
import { INTEGER_DOMAIN_LOCALES, renderIntegerWords } from "../site/vendor/local-speech-interface/integer-domain.js";

test("round-trips the complete generated 0–999 domain through the studio resolver", () => {
  for (const locale of INTEGER_DOMAIN_LOCALES) {
    for (let value = 0; value <= 999; value += 1) {
      assert.equal(spokenNumber(renderIntegerWords(value, locale), { locale }), value, `${locale} ${value}`);
    }
  }
});

test("parses the supported number grammars without a language model", () => {
  assert.equal(spokenNumber("forty two"), 42);
  assert.equal(spokenNumber("quatre-vingt-dix", { locale: "fr" }), 90);
  assert.equal(spokenNumber("einhundertdreiundzwanzig", { locale: "de" }), 123);
  assert.equal(spokenNumber("ein hundert drei und zwanzig", { locale: "de" }), 123);
  assert.equal(spokenNumber("một trăm lẻ năm", { locale: "vi" }), 105);
});

test("accepts narrow multilingual answer frames without opening the grammar", () => {
  assert.equal(spokenNumber("The answer is forty-two."), 42);
  assert.equal(spokenNumber("La réponse est quarante-deux.", { locale: "fr-FR" }), 42);
  assert.equal(spokenNumber("Die Antwort ist 42.", { locale: "de-DE" }), 42);
  assert.equal(spokenNumber("Câu trả lời là bốn mươi hai.", { locale: "vi-VN" }), 42);
  assert.equal(spokenNumber("Bitte trage 42 ein."), null);
  assert.equal(resolveVoiceIntent({ transcript: "Die Antwort ist 42." }, { locale: "de-DE" }).value, 42);
});

test("extracts a generated answer from the utterance tail without opening command matching", () => {
  const result = resolveVoiceIntent({ transcript: "I read nine plus six and the answer is fifteen." });
  assert.equal(result.kind, "number");
  assert.equal(result.value, 15);
  assert.equal(result.semantic.evidence[0].matchMode, "suffix");
  assert.equal(result.semantic.evidence[0].normalized, "the answer is fifteen");

  assert.equal(resolveVoiceIntent({ transcript: "fifteen is not my answer" }).kind, "unmatched");
  assert.equal(resolveVoiceIntent({ transcript: "please go next" }, { readyForNext: true }).kind, "unmatched");
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

test("keeps immediate checking an explicit application mode", () => {
  const defaultMode = resolveVoiceIntent({ transcript: "forty two" });
  assert.equal(defaultMode.checkImmediately, false);
  assert.equal(defaultMode.action, "enter 42");

  const manual = resolveVoiceIntent({ transcript: "forty two" }, { autoCheck: false });
  assert.equal(manual.kind, "number");
  assert.equal(manual.checkImmediately, false);
  assert.equal(manual.action, "enter 42");

  const automatic = resolveVoiceIntent({ transcript: "forty two" }, { autoCheck: true });
  assert.equal(automatic.checkImmediately, true);
  assert.equal(automatic.action, "enter and check 42");
});

test("recovers one unambiguous command or number from n-best alternatives", () => {
  const result = resolveVoiceIntent({
    transcript: "for tea too",
    alternatives: [
      { text: "for tea too", confidence: 0.58 },
      { text: "forty two", confidence: 0.39 },
      { text: "42", confidence: 0.03 },
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
  const conditionalNext = resolveVoiceIntent({ transcript: "next" }, { answerPresent: true });
  assert.equal(conditionalNext.permitted, true);
  assert.equal(conditionalNext.permission, "check-before-next");
  assert.equal(resolveVoiceIntent({ transcript: "please go next" }).kind, "unmatched");
  assert.equal(resolveVoiceIntent({ transcript: "prüfen" }, { locale: "de" }).intent, "check");
  assert.equal(resolveVoiceIntent({ transcript: "dừng" }, { locale: "vi" }).intent, "stop");
  assert.equal(resolveVoiceIntent({ transcript: "prüfen" }, { locale: "en" }).kind, "unmatched");
  assert.equal(resolveVoiceIntent({ transcript: "go on" }, { locale: "en", readyForNext: true }).intent, "next");
  assert.equal(resolveVoiceIntent({ transcript: "next done" }, { locale: "en", answerPresent: true }).intent, "next");
  assert.equal(resolveVoiceIntent({ transcript: "next okay so next and done are really not robust" }, { locale: "en", answerPresent: true }).kind, "unmatched");
  assert.equal(resolveVoiceIntent({ transcript: "j'ai fini" }, { locale: "fr" }).intent, "check");
  assert.equal(resolveVoiceIntent({ transcript: "nächste frage" }, { locale: "de", readyForNext: true }).intent, "next");
  assert.equal(resolveVoiceIntent({ transcript: "xong rồi" }, { locale: "vi" }).intent, "check");
});

test("shortens finalization only while interim text is an exact command", () => {
  const context = { answerPresent: true, locale: "en" };
  assert.equal(commandAwareInterimFlushDelay({
    transcript: "next", alternatives: [], adaptiveFlushMs: 1001,
  }, context), 500);
  assert.equal(commandAwareInterimFlushDelay({
    transcript: "next okay", alternatives: [], adaptiveFlushMs: 650,
  }, context), 650);
  assert.equal(commandAwareInterimFlushDelay({
    transcript: "eleven", alternatives: [], adaptiveFlushMs: 900,
  }, context), 900);
  assert.equal(commandAwareInterimFlushDelay({
    transcript: "next okay so next and done are really not robust",
    alternatives: [],
    adaptiveFlushMs: 1133,
  }, context), 1133);
});

test("recognizes skip while leaving its assessment semantics to the activity", () => {
  const unavailable = resolveVoiceIntent({ transcript: "skip" });
  assert.equal(unavailable.intent, "skip");
  assert.equal(unavailable.permitted, false);
  assert.equal(unavailable.permission, "skip-unavailable");

  const deferred = resolveVoiceIntent({ transcript: "frage überspringen" }, { locale: "de-DE", skipPolicy: "defer" });
  assert.equal(deferred.intent, "skip");
  assert.equal(deferred.permitted, true);
  assert.equal(deferred.action, "defer the current question");
});

test("recognizes complete grid-movement sequences only for an active grid target", () => {
  const english = resolveVoiceIntent(
    { transcript: "up, up and left then down" },
    { gridNavigationAvailable: true },
  );
  assert.equal(english.intent, "grid-move");
  assert.equal(english.permitted, true);
  assert.deepEqual(english.operations, ["grid.up", "grid.up", "grid.left", "grid.down"]);

  const german = resolveVoiceIntent(
    { transcript: "nach oben und nach rechts" },
    { gridNavigationAvailable: true, locale: "de-DE" },
  );
  assert.deepEqual(german.operations, ["grid.up", "grid.right"]);

  assert.equal(resolveVoiceIntent({ transcript: "left" }).permission, "grid-target-unavailable");
  assert.equal(resolveVoiceIntent(
    { transcript: "left and submit the form" },
    { gridNavigationAvailable: true },
  ).kind, "unmatched");
});

test("keeps recognized meaning separate from current permission", () => {
  const result = resolveVoiceIntent({ transcript: "forty two" }, { answerEnabled: false });
  assert.equal(result.kind, "number");
  assert.equal(result.value, 42);
  assert.equal(result.permitted, false);
  assert.equal(result.permission, "answer-unavailable");
});
