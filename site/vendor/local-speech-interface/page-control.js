// SPDX-License-Identifier: MPL-2.0

export const PAGE_CONTROL_OPERATIONS = Object.freeze([
  "section.next",
  "section.previous",
  "page.scrollDown",
  "page.scrollUp",
  "page.start",
  "page.end",
  "focus.search",
  "listening.stop",
  "grid.up",
  "grid.down",
  "grid.left",
  "grid.right",
]);

const PHRASES = new Map([
  ["next section", "section.next"],
  ["previous section", "section.previous"],
  ["go back a section", "section.previous"],
  ["scroll down", "page.scrollDown"],
  ["scroll up", "page.scrollUp"],
  ["go to top", "page.start"],
  ["go to the top", "page.start"],
  ["go to bottom", "page.end"],
  ["go to the bottom", "page.end"],
  ["focus search", "focus.search"],
  ["focus the search field", "focus.search"],
  ["stop listening", "listening.stop"],
  ["stop voice input", "listening.stop"],
  ["section suivante", "section.next"],
  ["section précédente", "section.previous"],
  ["section precedente", "section.previous"],
  ["faire défiler vers le bas", "page.scrollDown"],
  ["faire defiler vers le bas", "page.scrollDown"],
  ["faire défiler vers le haut", "page.scrollUp"],
  ["faire defiler vers le haut", "page.scrollUp"],
  ["arrêter l'écoute", "listening.stop"],
  ["arreter l'ecoute", "listening.stop"],
  ["nächster abschnitt", "section.next"],
  ["vorheriger abschnitt", "section.previous"],
  ["nach unten scrollen", "page.scrollDown"],
  ["nach oben scrollen", "page.scrollUp"],
  ["suche fokussieren", "focus.search"],
  ["spracherkennung stoppen", "listening.stop"],
  ["up", "grid.up"],
  ["move up", "grid.up"],
  ["down", "grid.down"],
  ["move down", "grid.down"],
  ["left", "grid.left"],
  ["move left", "grid.left"],
  ["right", "grid.right"],
  ["move right", "grid.right"],
  ["haut", "grid.up"],
  ["en haut", "grid.up"],
  ["bas", "grid.down"],
  ["en bas", "grid.down"],
  ["gauche", "grid.left"],
  ["à gauche", "grid.left"],
  ["a gauche", "grid.left"],
  ["droite", "grid.right"],
  ["à droite", "grid.right"],
  ["a droite", "grid.right"],
  ["hoch", "grid.up"],
  ["nach oben", "grid.up"],
  ["runter", "grid.down"],
  ["nach unten", "grid.down"],
  ["links", "grid.left"],
  ["nach links", "grid.left"],
  ["rechts", "grid.right"],
  ["nach rechts", "grid.right"],
  ["lên", "grid.up"],
  ["len", "grid.up"],
  ["xuống", "grid.down"],
  ["xuong", "grid.down"],
  ["trái", "grid.left"],
  ["trai", "grid.left"],
  ["sang trái", "grid.left"],
  ["sang trai", "grid.left"],
  ["phải", "grid.right"],
  ["phai", "grid.right"],
  ["sang phải", "grid.right"],
  ["sang phai", "grid.right"],
]);

function normalize(text) {
  return String(text ?? "").toLocaleLowerCase("en-US").replace(/[.,!?;:]+/gu, " ").replace(/\s+/gu, " ").trim();
}

const CONNECTIVES = new Set(["and", "then", "et", "puis", "und", "dann", "và", "va", "rồi", "roi"]);
const PHRASE_ENTRIES = [...PHRASES].map(([phrase, operation]) => Object.freeze({ phrase, operation, tokens: Object.freeze(phrase.split(" ")) }));

function proposal(transcript, normalized, operation) {
  return Object.freeze({
    kind: "page-control",
    operation,
    evidence: Object.freeze({ transcript: String(transcript), normalized }),
    safety: Object.freeze({ reversible: true, externalEffect: false, requiresConfirmation: false }),
  });
}

export function proposePageControl(transcript, { available = PAGE_CONTROL_OPERATIONS } = {}) {
  const normalized = normalize(transcript);
  const operation = PHRASES.get(normalized);
  if (!operation || !available.includes(operation)) return null;
  return proposal(transcript, normalized, operation);
}

export function proposePageControls(transcript, { available = PAGE_CONTROL_OPERATIONS } = {}) {
  const normalized = normalize(transcript);
  const tokens = normalized.split(" ").filter((token) => token && !CONNECTIVES.has(token));
  if (!tokens.length) return Object.freeze([]);
  const memo = new Map();
  function segment(index) {
    if (index === tokens.length) return [[]];
    if (memo.has(index)) return memo.get(index);
    const results = [];
    for (const entry of PHRASE_ENTRIES) {
      if (!available.includes(entry.operation)) continue;
      if (entry.tokens.some((token, offset) => tokens[index + offset] !== token)) continue;
      for (const tail of segment(index + entry.tokens.length)) {
        results.push([entry, ...tail]);
        if (results.length > 1) break;
      }
      if (results.length > 1) break;
    }
    memo.set(index, results);
    return results;
  }
  const solutions = segment(0);
  if (solutions.length !== 1) return Object.freeze([]);
  return Object.freeze(solutions[0].map((entry) => proposal(entry.phrase, entry.phrase, entry.operation)));
}

export async function applyPageControl(proposal, handlers) {
  if (!proposal || proposal.kind !== "page-control" || !PAGE_CONTROL_OPERATIONS.includes(proposal.operation)) {
    throw new TypeError("A recognized page-control proposal is required");
  }
  const handler = handlers?.[proposal.operation];
  if (typeof handler !== "function") throw new TypeError(`No handler for ${proposal.operation}`);
  return handler(proposal);
}
