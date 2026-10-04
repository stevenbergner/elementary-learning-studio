const smallEnglish = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const englishTens = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const smallFrench = {
  zéro: 0, zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
};
const frenchTens = { vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 };
const smallGerman = {
  null: 0, ein: 1, eins: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9,
  zehn: 10, elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19,
};
const germanTens = { zwanzig: 20, dreißig: 30, dreissig: 30, vierzig: 40, fünfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90 };
const smallVietnamese = {
  "không": 0, "một": 1, "mốt": 1, hai: 2, ba: 3, "bốn": 4, "tư": 4, "năm": 5, "lăm": 5,
  "sáu": 6, "bảy": 7, "tám": 8, "chín": 9,
};

const commands = new Map([
  ["stop", "stop"], ["arrête", "stop"], ["arrete", "stop"], ["stopp", "stop"], ["dừng", "stop"],
  ["check", "check"], ["enter", "check"], ["vérifie", "check"], ["verifie", "check"], ["prüfen", "check"],
  ["pruefen", "check"], ["kiểm tra", "check"],
  ["next", "next"], ["suivant", "next"], ["weiter", "next"], ["tiếp theo", "next"],
]);

export function normalizeSpeechText(value) {
  return String(value || "").toLocaleLowerCase().trim().replace(/[.,!?;:]/gu, "").replace(/[‐‑‒–—-]/gu, " ").replace(/\s+/g, " ");
}

function parseEnglish(tokens) {
  if (tokens.length === 1 && Object.hasOwn(smallEnglish, tokens[0])) return smallEnglish[tokens[0]];
  const hundredAt = tokens.indexOf("hundred");
  if (hundredAt >= 0) {
    const prefix = tokens.slice(0, hundredAt).filter((token) => token !== "and");
    const hundreds = prefix.length ? parseEnglish(prefix) : 1;
    const rest = tokens.slice(hundredAt + 1).filter((token) => token !== "and");
    const remainder = rest.length ? parseEnglish(rest) : 0;
    return hundreds !== null && remainder !== null ? hundreds * 100 + remainder : null;
  }
  const words = tokens.filter((token) => token !== "and");
  if (words.length === 1 && Object.hasOwn(englishTens, words[0])) return englishTens[words[0]];
  if (words.length === 2 && Object.hasOwn(englishTens, words[0]) && Object.hasOwn(smallEnglish, words[1]) && smallEnglish[words[1]] < 10) {
    return englishTens[words[0]] + smallEnglish[words[1]];
  }
  return null;
}

function parseFrenchUnderHundred(tokens) {
  const words = tokens.filter((token) => token !== "et");
  if (words.length === 1 && Object.hasOwn(smallFrench, words[0])) return smallFrench[words[0]];
  if (words.length === 1 && Object.hasOwn(frenchTens, words[0])) return frenchTens[words[0]];
  if (words[0] === "quatre" && words[1] === "vingt") {
    const remainder = words.length === 2 ? 0 : parseFrenchUnderHundred(words.slice(2));
    return remainder !== null && remainder < 20 ? 80 + remainder : null;
  }
  if (words[0] === "soixante" && words.length > 1) {
    const remainder = parseFrenchUnderHundred(words.slice(1));
    return remainder !== null && remainder < 20 ? 60 + remainder : null;
  }
  if (Object.hasOwn(frenchTens, words[0]) && words.length === 2 && Object.hasOwn(smallFrench, words[1]) && smallFrench[words[1]] < 10) {
    return frenchTens[words[0]] + smallFrench[words[1]];
  }
  if (words[0] === "dix" && words.length === 2 && Object.hasOwn(smallFrench, words[1]) && smallFrench[words[1]] < 10) {
    return 10 + smallFrench[words[1]];
  }
  return null;
}

function parseFrench(tokens) {
  const hundredAt = tokens.findIndex((token) => token === "cent" || token === "cents");
  if (hundredAt >= 0) {
    const prefix = tokens.slice(0, hundredAt);
    const hundreds = prefix.length ? parseFrenchUnderHundred(prefix) : 1;
    const rest = tokens.slice(hundredAt + 1);
    const remainder = rest.length ? parseFrenchUnderHundred(rest) : 0;
    return hundreds !== null && remainder !== null ? hundreds * 100 + remainder : null;
  }
  return parseFrenchUnderHundred(tokens);
}

function parseGermanCompact(compact) {
  if (Object.hasOwn(smallGerman, compact)) return smallGerman[compact];
  if (Object.hasOwn(germanTens, compact)) return germanTens[compact];
  const hundredAt = compact.indexOf("hundert");
  if (hundredAt >= 0) {
    const prefix = compact.slice(0, hundredAt);
    const rest = compact.slice(hundredAt + "hundert".length);
    const hundreds = prefix ? parseGermanCompact(prefix) : 1;
    const remainder = rest ? parseGermanCompact(rest) : 0;
    return hundreds !== null && remainder !== null ? hundreds * 100 + remainder : null;
  }
  for (const [tensWord, tens] of Object.entries(germanTens)) {
    if (!compact.endsWith(tensWord)) continue;
    const unitWord = compact.slice(0, -tensWord.length).replace(/und$/, "");
    const unit = smallGerman[unitWord];
    if (Number.isInteger(unit) && unit > 0 && unit < 10 && compact.includes("und")) return tens + unit;
  }
  return null;
}

function parseVietnameseUnderHundred(tokens) {
  if (tokens.length === 1 && Object.hasOwn(smallVietnamese, tokens[0])) return smallVietnamese[tokens[0]];
  if (tokens[0] === "mười") {
    if (tokens.length === 1) return 10;
    return tokens.length === 2 && Object.hasOwn(smallVietnamese, tokens[1]) ? 10 + smallVietnamese[tokens[1]] : null;
  }
  const tens = smallVietnamese[tokens[0]];
  if (Number.isInteger(tens) && tens > 0 && tokens[1] === "mươi") {
    if (tokens.length === 2) return tens * 10;
    return tokens.length === 3 && Object.hasOwn(smallVietnamese, tokens[2]) ? tens * 10 + smallVietnamese[tokens[2]] : null;
  }
  return null;
}

function parseVietnamese(tokens) {
  const hundredAt = tokens.indexOf("trăm");
  if (hundredAt >= 0) {
    const hundreds = parseVietnameseUnderHundred(tokens.slice(0, hundredAt));
    const rest = tokens.slice(hundredAt + 1).filter((token) => token !== "lẻ" && token !== "linh");
    const remainder = rest.length ? parseVietnameseUnderHundred(rest) : 0;
    return hundreds !== null && remainder !== null ? hundreds * 100 + remainder : null;
  }
  return parseVietnameseUnderHundred(tokens);
}

export function spokenNumber(transcript) {
  const normalized = normalizeSpeechText(transcript);
  if (/^\d{1,3}$/.test(normalized)) return Number(normalized);
  const tokens = normalized.split(" ");
  const parsers = [parseEnglish(tokens), parseFrench(tokens), parseGermanCompact(tokens.join("")), parseVietnamese(tokens)];
  const match = parsers.find((value) => Number.isInteger(value) && value >= 0 && value <= 999);
  return match ?? null;
}

function interpretCandidate(text, { answerEnabled, readyForNext }) {
  const phrase = normalizeSpeechText(text);
  const command = commands.get(phrase);
  if (command === "stop") return { kind: "command", intent: "stop", permitted: true, action: "stop voice input" };
  if (command === "check") return { kind: "command", intent: "check", permitted: true, action: "check the current answer" };
  if (command === "next") {
    return readyForNext
      ? { kind: "command", intent: "next", permitted: true, action: "move to the next question" }
      : { kind: "command", intent: "next", permitted: false, action: "do not move yet; the current question is not complete" };
  }
  const number = spokenNumber(phrase);
  if (number !== null && answerEnabled) return { kind: "number", intent: "answer", permitted: true, value: number, action: `enter and check ${number}` };
  return { kind: "unmatched", intent: null, permitted: false, action: "none; no number or available command matched" };
}

function candidateSignature(interpretation) {
  if (interpretation.kind === "number") return `number:${interpretation.value}`;
  if (interpretation.kind === "command") return `command:${interpretation.intent}:${interpretation.permitted}`;
  return interpretation.kind;
}

function withMatch(interpretation, candidate, selection) {
  return {
    ...interpretation,
    match: {
      text: candidate.text,
      normalized: candidate.normalized,
      confidence: candidate.confidence,
      candidateIndex: candidate.index,
      selection,
    },
  };
}

export function resolveVoiceIntent({ transcript = "", alternatives = [] } = {}, { answerEnabled = true, readyForNext = false } = {}) {
  const rawCandidates = [{ text: transcript, confidence: alternatives[0]?.confidence }]
    .concat(alternatives.map((choice) => ({ text: choice.text ?? choice.transcript ?? "", confidence: choice.confidence })));
  const seen = new Set();
  const candidates = rawCandidates.flatMap((candidate) => {
    const normalized = normalizeSpeechText(candidate.text);
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [{ ...candidate, normalized, index: seen.size - 1 }];
  });
  const interpreted = candidates.map((candidate) => ({ candidate, interpretation: interpretCandidate(candidate.text, { answerEnabled, readyForNext }) }));
  const primary = interpreted[0];
  if (primary && primary.interpretation.kind !== "unmatched") return withMatch(primary.interpretation, primary.candidate, "primary");

  const alternativesWithIntent = interpreted.slice(1).filter(({ interpretation }) => interpretation.kind !== "unmatched");
  const distinct = new Map();
  alternativesWithIntent.forEach((entry) => {
    const signature = candidateSignature(entry.interpretation);
    if (!distinct.has(signature)) distinct.set(signature, entry);
  });
  if (distinct.size === 1) {
    const [entry] = distinct.values();
    return withMatch(entry.interpretation, entry.candidate, "alternative");
  }
  if (distinct.size > 1) {
    return {
      kind: "ambiguous",
      intent: null,
      permitted: false,
      action: "none; recognition alternatives imply different commands or numbers",
      candidates: [...distinct.values()].map(({ candidate, interpretation }) => ({
        text: candidate.text,
        confidence: candidate.confidence,
        kind: interpretation.kind,
        intent: interpretation.intent,
        value: interpretation.value,
      })),
    };
  }
  return primary
    ? withMatch(primary.interpretation, primary.candidate, "primary")
    : { kind: "unmatched", intent: null, permitted: false, action: "none; no number or available command matched" };
}
