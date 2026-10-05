// SPDX-License-Identifier: MPL-2.0

export const CAPABILITY_KEYS = Object.freeze([
  "transcript",
  "alternatives",
  "wordTiming",
  "wordConfidence",
  "tokenTiming",
  "tokenConfidence",
  "rankedHypotheses",
  "endOfUtterance",
  "speakerDiarization",
  "speakerIdentification",
  "soundEvents",
  "rawLogits",
  "constrainedDecoding",
]);

export function createCapabilityManifest(values = {}) {
  const unknown = Object.keys(values).filter((key) => !CAPABILITY_KEYS.includes(key));
  if (unknown.length) throw new TypeError(`Unknown capabilities: ${unknown.join(", ")}`);
  return Object.freeze(Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, values[key] === true])));
}

export function supportsCapability(manifest, capability) {
  if (!CAPABILITY_KEYS.includes(capability)) throw new TypeError(`Unknown capability: ${capability}`);
  return manifest?.[capability] === true;
}

export const FIREFOX_WEB_SPEECH_CAPABILITIES = createCapabilityManifest({
  transcript: true,
  alternatives: true,
  endOfUtterance: true,
});

export const PARAKEET_CLI_CAPABILITIES = createCapabilityManifest({
  transcript: true,
  alternatives: true,
  wordTiming: true,
  wordConfidence: true,
  tokenTiming: true,
  tokenConfidence: true,
  rankedHypotheses: true,
  endOfUtterance: true,
});
