import {
  compileSurfaceDomain,
  normalizeDomainSurface,
  resolveDomainEvidence,
} from "./vendor/local-speech-interface/domain-grammar.js";
import { integerDomain } from "./vendor/local-speech-interface/integer-domain.js";

const numberDomain = integerDomain({ min: 0, max: 999, locales: ["en", "fr", "de", "vi"] });

const commandSurfaces = {
  en: {
    stop: ["stop", "stop listening", "stop voice input"],
    check: ["check", "enter", "done", "i'm done", "check my answer", "that's my answer"],
    next: ["next", "next question", "go on", "continue"],
  },
  fr: {
    stop: ["arrête", "arrete", "arrête l'écoute", "arrete l'ecoute"],
    check: ["vérifie", "verifie", "j'ai fini", "terminé", "termine", "c'est ma réponse", "c est ma réponse"],
    next: ["suivant", "question suivante", "continue"],
  },
  de: {
    stop: ["stopp", "spracherkennung stoppen"],
    check: ["prüfen", "pruefen", "fertig", "ich bin fertig", "das ist meine antwort"],
    next: ["weiter", "nächste frage", "naechste frage"],
  },
  vi: {
    stop: ["dừng", "dừng nghe"],
    check: ["kiểm tra", "xong", "xong rồi"],
    next: ["tiếp theo", "câu tiếp theo", "tiếp tục"],
  },
};

const commandEntries = Object.entries(commandSurfaces).flatMap(([locale, intents]) => (
  Object.entries(intents).flatMap(([intent, surfaces]) => (
    surfaces.map((surface) => ({
      locale,
      surface,
      value: { kind: "command", intent },
      canonicalForm: intent,
    }))
  ))
));

const commandDomain = compileSurfaceDomain({
  id: "elementary-learning-studio:commands",
  locales: Object.keys(commandSurfaces),
  entries: commandEntries,
  key: (value) => `command:${value.intent}`,
});

const voiceDomain = Object.freeze({
  parse(text, { locale } = {}) {
    const command = commandDomain.parse(text, { locale });
    if (command.kind === "one") return command;
    const exactNumber = numberDomain.parse(text, { locale });
    const number = exactNumber.kind === "one" ? exactNumber : numberDomain.parseSuffix(text, { locale });
    if (number.kind !== "one") return number;
    return Object.freeze({
      kind: "one",
      interpretation: Object.freeze({
        ...number.interpretation,
        value: Object.freeze({ kind: "number", value: number.interpretation.value }),
        canonicalKey: `number:${number.interpretation.canonicalKey}`,
      }),
    });
  },
});

export function normalizeSpeechText(value, locale = "und") {
  return normalizeDomainSurface(value, locale);
}

export function spokenNumber(transcript, { locale = "en" } = {}) {
  const result = numberDomain.parse(transcript, { locale });
  return result.kind === "one" ? result.interpretation.value : null;
}

function applyPermission(interpretation, { answerEnabled, answerPresent, readyForNext, autoCheck }) {
  const meaning = interpretation.value;
  if (meaning.kind === "number") {
    return answerEnabled
      ? {
        kind: "number", intent: "answer", permitted: true, permission: "available", value: meaning.value,
        checkImmediately: autoCheck, action: autoCheck ? `enter and check ${meaning.value}` : `enter ${meaning.value}`,
      }
      : { kind: "number", intent: "answer", permitted: false, permission: "answer-unavailable", value: meaning.value, action: "do not enter; answer input is unavailable" };
  }
  if (meaning.intent === "stop") return { kind: "command", intent: "stop", permitted: true, permission: "available", action: "stop voice input" };
  if (meaning.intent === "check") {
    return answerEnabled
      ? { kind: "command", intent: "check", permitted: true, permission: "available", action: "check the current answer" }
      : { kind: "command", intent: "check", permitted: false, permission: "answer-unavailable", action: "do not check; answer input is unavailable" };
  }
  if (meaning.intent === "next") {
    if (readyForNext) return { kind: "command", intent: "next", permitted: true, permission: "available", action: "move to the next question" };
    if (answerEnabled && answerPresent) {
      return { kind: "command", intent: "next", permitted: true, permission: "check-before-next", action: "check the current answer and move if correct" };
    }
    return { kind: "command", intent: "next", permitted: false, permission: "question-incomplete", action: "do not move yet; the current question is not complete" };
  }
  throw new TypeError(`unknown interpreted command: ${meaning.intent}`);
}

function attachEvidence(permitted, interpretation, match) {
  return {
    ...permitted,
    semantic: {
      canonicalForm: interpretation.canonicalForm,
      canonicalKey: interpretation.canonicalKey,
      evidence: interpretation.evidence,
    },
    match: {
      text: match.text,
      normalized: match.normalized,
      confidence: match.confidence,
      candidateIndex: match.sourceIndex,
      selection: match.selection,
    },
  };
}

export function resolveVoiceIntent(
  { transcript = "", alternatives = [] } = {},
  { answerEnabled = true, answerPresent = false, readyForNext = false, locale = "en", autoCheck = false } = {},
) {
  const resolution = resolveDomainEvidence({ transcript, alternatives }, voiceDomain, { locale });
  if (resolution.kind === "one") {
    return attachEvidence(
      applyPermission(resolution.interpretation, { answerEnabled, answerPresent, readyForNext, autoCheck }),
      resolution.interpretation,
      resolution.match,
    );
  }
  if (resolution.kind === "ambiguous") {
    return {
      kind: "ambiguous",
      intent: null,
      permitted: false,
      permission: "ambiguous",
      action: "none; recognition alternatives imply different commands or numbers",
      candidates: resolution.interpretations.map(({ interpretation, matches }) => ({
        text: matches[0].text,
        confidence: matches[0].confidence,
        kind: interpretation.value.kind,
        intent: interpretation.value.intent,
        value: interpretation.value.value,
        canonicalKey: interpretation.canonicalKey,
      })),
    };
  }
  return {
    kind: "unmatched",
    intent: null,
    permitted: false,
    permission: "unrecognized",
    action: "none; no number or available command matched",
  };
}
