// SPDX-License-Identifier: MPL-2.0
import { compileSurfaceDomain } from "./domain-grammar.js";

const EN_SMALL = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const FR_SMALL = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
const DE_SMALL = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf", "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"];
const DE_TENS = ["", "", "zwanzig", "dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"];
const VI_SMALL = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

export const INTEGER_DOMAIN_LOCALES = Object.freeze(["en", "fr", "de", "vi"]);

// Reviewed recognizer spellings of English unit words. Streaming recognizers
// often transcribe an isolated "four" as "for" or "two" as "to". These are
// opt-in, apply only to the final unit word, and a one-word homophone is
// accepted only as a whole utterance, never from the tail of longer prose.
export const ENGLISH_NUMBER_HOMOPHONES = Object.freeze({
  1: Object.freeze(["won"]),
  2: Object.freeze(["to", "too"]),
  4: Object.freeze(["for", "fore"]),
  8: Object.freeze(["ate"]),
});
export const INTEGER_DOMAIN_FORMS = Object.freeze(["bare", "answer-frame"]);

function assertInteger(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 999) throw new RangeError("integer word generation supports 0 through 999");
}

function english(value, withAnd = false) {
  if (value < 20) return EN_SMALL[value];
  if (value < 100) return value % 10 ? `${EN_TENS[Math.floor(value / 10)]} ${EN_SMALL[value % 10]}` : EN_TENS[value / 10];
  const rest = value % 100;
  return `${EN_SMALL[Math.floor(value / 100)]} hundred${rest ? `${withAnd ? " and" : ""} ${english(rest, withAnd)}` : ""}`;
}

function frenchUnderHundred(value) {
  if (value <= 16) return FR_SMALL[value];
  if (value < 20) return `dix ${FR_SMALL[value - 10]}`;
  if (value < 70) {
    const tens = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"][Math.floor(value / 10)];
    const rest = value % 10;
    if (!rest) return tens;
    return `${tens}${rest === 1 ? " et" : ""} ${FR_SMALL[rest]}`;
  }
  if (value < 80) return `soixante${value === 71 ? " et" : ""} ${frenchUnderHundred(value - 60)}`;
  if (value === 80) return "quatre vingts";
  return `quatre vingt ${frenchUnderHundred(value - 80)}`;
}

function french(value) {
  if (value < 100) return frenchUnderHundred(value);
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const prefix = hundreds === 1 ? "cent" : `${FR_SMALL[hundreds]} cent${rest ? "" : "s"}`;
  return rest ? `${prefix} ${frenchUnderHundred(rest)}` : prefix;
}

function german(value) {
  if (value < 20) return DE_SMALL[value];
  if (value < 100) {
    const tens = DE_TENS[Math.floor(value / 10)];
    const unit = value % 10;
    if (!unit) return tens;
    return `${unit === 1 ? "ein" : DE_SMALL[unit]}und${tens}`;
  }
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const prefix = `${hundreds === 1 ? "ein" : DE_SMALL[hundreds]}hundert`;
  return rest ? `${prefix}${german(rest)}` : prefix;
}

function germanSpaced(value) {
  if (value < 20) return DE_SMALL[value];
  if (value < 100) {
    const tens = DE_TENS[Math.floor(value / 10)];
    const unit = value % 10;
    if (!unit) return tens;
    return `${unit === 1 ? "ein" : DE_SMALL[unit]} und ${tens}`;
  }
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const prefix = `${hundreds === 1 ? "ein" : DE_SMALL[hundreds]} hundert`;
  return rest ? `${prefix} ${germanSpaced(rest)}` : prefix;
}

function vietnameseUnderHundred(value) {
  if (value < 10) return VI_SMALL[value];
  if (value < 20) {
    const unit = value % 10;
    return unit ? `mười ${unit === 5 ? "lăm" : VI_SMALL[unit]}` : "mười";
  }
  const tens = Math.floor(value / 10);
  const unit = value % 10;
  if (!unit) return `${VI_SMALL[tens]} mươi`;
  const spokenUnit = unit === 1 ? "mốt" : unit === 4 ? "tư" : unit === 5 ? "lăm" : VI_SMALL[unit];
  return `${VI_SMALL[tens]} mươi ${spokenUnit}`;
}

function vietnamese(value, bridge = "lẻ") {
  if (value < 100) return vietnameseUnderHundred(value);
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (!rest) return `${VI_SMALL[hundreds]} trăm`;
  return `${VI_SMALL[hundreds]} trăm${rest < 10 ? ` ${bridge}` : ""} ${vietnameseUnderHundred(rest)}`;
}

export function renderIntegerWords(value, locale) {
  assertInteger(value);
  const language = String(locale).toLowerCase().split("-")[0];
  if (language === "en") return english(value);
  if (language === "fr") return french(value);
  if (language === "de") return german(value);
  if (language === "vi") return vietnamese(value);
  throw new RangeError(`unsupported integer locale: ${locale}`);
}

function homophoneVariants(value, locale) {
  if (locale !== "en") return [];
  const aliases = ENGLISH_NUMBER_HOMOPHONES[value % 10];
  if (!aliases || (value % 100 >= 10 && value % 100 < 20)) return [];
  return wordVariants(value, locale).flatMap((words) => {
    const tokens = words.split(" ");
    return aliases.map((alias) => [...tokens.slice(0, -1), alias].join(" "));
  });
}

function wordVariants(value, locale) {
  const canonical = renderIntegerWords(value, locale);
  if (locale === "en" && value >= 100 && value % 100) return [canonical, english(value, true)];
  if (locale === "fr" && value === 0) return [canonical, "zero"];
  if (locale === "de") return [canonical, germanSpaced(value), canonical.replaceAll("ß", "ss"), germanSpaced(value).replaceAll("ß", "ss")];
  if (locale === "vi" && value >= 100 && value % 100 < 10) return [canonical, vietnamese(value, "linh")];
  return [canonical];
}

const ANSWER_FRAMES = Object.freeze({
  en: Object.freeze(["the answer is", "answer is"]),
  fr: Object.freeze(["la réponse est", "la reponse est"]),
  de: Object.freeze(["die antwort ist", "antwort ist"]),
  vi: Object.freeze(["câu trả lời là"]),
});

export function integerDomain({ min = 0, max = 999, locales = INTEGER_DOMAIN_LOCALES, forms = INTEGER_DOMAIN_FORMS, homophones = false } = {}) {
  assertInteger(min);
  assertInteger(max);
  if (min > max) throw new RangeError("integer domain min must not exceed max");
  const selectedLocales = [...new Set(locales.map((locale) => String(locale).toLowerCase().split("-")[0]))];
  if (selectedLocales.some((locale) => !INTEGER_DOMAIN_LOCALES.includes(locale))) throw new RangeError("integer domain locale is unsupported");
  const selectedForms = [...new Set(forms)];
  if (selectedForms.some((form) => !INTEGER_DOMAIN_FORMS.includes(form))) throw new RangeError("integer domain form is unsupported");

  const entries = [];
  for (const locale of selectedLocales) {
    for (let value = min; value <= max; value += 1) {
      const surfaces = new Set([String(value), ...wordVariants(value, locale)]);
      if (selectedForms.includes("bare")) {
        for (const surface of surfaces) entries.push({ locale, surface, value, canonicalForm: String(value) });
      }
      if (selectedForms.includes("answer-frame")) {
        for (const frame of ANSWER_FRAMES[locale]) {
          for (const surface of surfaces) entries.push({ locale, surface: `${frame} ${surface}`, value, canonicalForm: String(value) });
        }
      }
      if (homophones) {
        for (const surface of homophoneVariants(value, locale)) {
          const exactOnly = !surface.includes(" ");
          if (selectedForms.includes("bare")) entries.push({ locale, surface, value, canonicalForm: String(value), exactOnly });
          if (selectedForms.includes("answer-frame")) {
            for (const frame of ANSWER_FRAMES[locale]) entries.push({ locale, surface: `${frame} ${surface}`, value, canonicalForm: String(value) });
          }
        }
      }
    }
  }
  return compileSurfaceDomain({
    id: `integer:${min}-${max}`,
    locales: selectedLocales,
    entries,
  });
}
