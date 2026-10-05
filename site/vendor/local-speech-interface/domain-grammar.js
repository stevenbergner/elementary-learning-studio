// SPDX-License-Identifier: MPL-2.0

function nonEmptyText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be non-empty text`);
  return value.trim();
}

function canonicalKey(value) {
  if (["string", "number", "boolean"].includes(typeof value) || value === null) return JSON.stringify(value);
  throw new TypeError("domain values require an explicit canonicalKey function");
}

export function normalizeDomainSurface(value, locale = "und") {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase(locale === "und" ? undefined : locale)
    .trim()
    .replace(/[.!?;:,]+$/gu, "")
    .replace(/[‐‑‒–—-]/gu, " ")
    .replace(/\s+/gu, " ");
}

function resolveLocale(locales, requestedLocale) {
  const normalized = String(requestedLocale || "und").toLowerCase();
  const exact = locales.find((locale) => locale.toLowerCase() === normalized);
  if (exact) return exact;
  const base = normalized.split("-")[0];
  return locales.find((locale) => locale.toLowerCase().split("-")[0] === base) ?? null;
}

export function compileSurfaceDomain({ id, locales, entries, normalize = normalizeDomainSurface, key = canonicalKey } = {}) {
  const domainId = nonEmptyText(id, "domain id");
  const supportedLocales = [...new Set((locales ?? []).map((locale) => nonEmptyText(locale, "domain locale")))];
  if (!supportedLocales.length) throw new TypeError("domain requires at least one locale");
  if (!Array.isArray(entries) || !entries.length) throw new TypeError("domain requires generated surface entries");

  const tables = new Map(supportedLocales.map((locale) => [locale, new Map()]));
  for (const entry of entries) {
    const locale = resolveLocale(supportedLocales, entry.locale);
    if (!locale) throw new TypeError(`entry locale ${entry.locale} is outside domain ${domainId}`);
    const surface = nonEmptyText(entry.surface, "entry surface");
    const normalized = normalize(surface, locale);
    if (!normalized) throw new TypeError("entry surface is empty after normalization");
    const valueKey = key(entry.value);
    const table = tables.get(locale);
    const existing = table.get(normalized);
    if (existing && existing.valueKey !== valueKey) {
      throw new Error(`domain collision for ${locale} surface ${JSON.stringify(normalized)}: ${existing.canonicalForm} and ${entry.canonicalForm}`);
    }
    if (existing) {
      existing.surfaces.add(surface);
      continue;
    }
    table.set(normalized, {
      value: structuredClone(entry.value),
      valueKey,
      canonicalForm: nonEmptyText(entry.canonicalForm ?? String(entry.value), "entry canonicalForm"),
      surfaces: new Set([surface]),
    });
  }

  function parse(surface, { locale = supportedLocales[0] } = {}) {
    const selectedLocale = resolveLocale(supportedLocales, locale);
    if (!selectedLocale) return Object.freeze({ kind: "none", reason: "unsupported-locale", locale: String(locale) });
    const normalized = normalize(surface, selectedLocale);
    const match = tables.get(selectedLocale).get(normalized);
    if (!match) return Object.freeze({ kind: "none", reason: "no-surface-match", locale: selectedLocale, normalized });
    return Object.freeze({
      kind: "one",
      interpretation: Object.freeze({
        value: structuredClone(match.value),
        canonicalForm: match.canonicalForm,
        canonicalKey: match.valueKey,
        evidence: Object.freeze([Object.freeze({
          surface: String(surface),
          normalized,
          locale: selectedLocale,
          generatedSurfaces: Object.freeze([...match.surfaces]),
        })]),
      }),
    });
  }

  return Object.freeze({
    id: domainId,
    locales: Object.freeze(supportedLocales),
    entryCount: [...tables.values()].reduce((sum, table) => sum + table.size, 0),
    parse,
  });
}

export function resolveDomainEvidence({ transcript = "", alternatives = [] } = {}, domain, { locale } = {}) {
  if (!domain || typeof domain.parse !== "function") throw new TypeError("a compiled domain is required");
  const candidates = [{ text: transcript, confidence: alternatives[0]?.confidence }]
    .concat(alternatives.map((choice) => ({ text: choice.text ?? choice.transcript ?? "", confidence: choice.confidence })));
  const seen = new Set();
  const parsed = candidates.flatMap((candidate, sourceIndex) => {
    const normalized = normalizeDomainSurface(candidate.text, locale);
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [{ candidate: { ...candidate, sourceIndex, normalized }, result: domain.parse(candidate.text, { locale }) }];
  });

  const primary = parsed[0];
  if (primary?.result.kind === "one") {
    return Object.freeze({ kind: "one", interpretation: primary.result.interpretation, match: Object.freeze({ ...primary.candidate, selection: "primary" }) });
  }

  const meanings = new Map();
  parsed.slice(1).forEach(({ candidate, result }) => {
    if (result.kind !== "one") return;
    const existing = meanings.get(result.interpretation.canonicalKey);
    if (existing) {
      existing.matches.push(candidate);
      return;
    }
    meanings.set(result.interpretation.canonicalKey, { interpretation: result.interpretation, matches: [candidate] });
  });
  if (meanings.size === 1) {
    const [{ interpretation, matches }] = meanings.values();
    return Object.freeze({ kind: "one", interpretation, match: Object.freeze({ ...matches[0], selection: "alternative" }) });
  }
  if (meanings.size > 1) {
    return Object.freeze({
      kind: "ambiguous",
      interpretations: Object.freeze([...meanings.values()].map(({ interpretation, matches }) => Object.freeze({ interpretation, matches: Object.freeze(matches) }))),
    });
  }
  return Object.freeze({ kind: "none" });
}
