// SPDX-License-Identifier: MPL-2.0

export const PROTOCOL = "local-speech-interface/v0.1";

export const EVENT_TYPES = Object.freeze([
  "audio.state",
  "recognition.interim",
  "recognition.final",
  "recognition.error",
  "intent.proposed",
  "action.accepted",
  "action.rejected",
]);

const LOCAL_STATES = new Set(["required", "verified", "unverified"]);
const AUDIO_SOURCES = new Set(["microphone", "file", "system", "unknown"]);
const RETENTION_STATES = new Set(["memory", "session", "persistent"]);

function fallbackId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createSpeechEvent({
  sequence,
  type,
  adapter,
  locale,
  audioSource = "unknown",
  localProcessing = "unverified",
  payload = {},
  privacy = {},
  id = globalThis.crypto?.randomUUID?.() || fallbackId(),
  timestamp = new Date().toISOString(),
}) {
  const event = {
    protocol: PROTOCOL,
    id,
    sequence,
    type,
    timestamp,
    source: { adapter, locale, audioSource, localProcessing },
    payload: structuredClone(payload),
    privacy: {
      networkUsed: privacy.networkUsed ?? false,
      retention: privacy.retention ?? "memory",
    },
  };
  const result = validateSpeechEvent(event);
  if (!result.valid) throw new TypeError(`Invalid speech event: ${result.errors.join("; ")}`);
  return Object.freeze(event);
}

export function validateSpeechEvent(event) {
  const errors = [];
  if (!event || typeof event !== "object" || Array.isArray(event)) return { valid: false, errors: ["event must be an object"] };
  if (event.protocol !== PROTOCOL) errors.push(`protocol must equal ${PROTOCOL}`);
  if (typeof event.id !== "string" || !event.id) errors.push("id must be a non-empty string");
  if (!Number.isInteger(event.sequence) || event.sequence < 0) errors.push("sequence must be a non-negative integer");
  if (!EVENT_TYPES.includes(event.type)) errors.push("type is not recognized");
  if (typeof event.timestamp !== "string" || Number.isNaN(Date.parse(event.timestamp))) errors.push("timestamp must be ISO date-time text");
  if (!event.source || typeof event.source !== "object") {
    errors.push("source must be an object");
  } else {
    if (typeof event.source.adapter !== "string" || !event.source.adapter) errors.push("source.adapter is required");
    if (typeof event.source.locale !== "string" || !event.source.locale) errors.push("source.locale is required");
    if (!AUDIO_SOURCES.has(event.source.audioSource)) errors.push("source.audioSource is not recognized");
    if (!LOCAL_STATES.has(event.source.localProcessing)) errors.push("source.localProcessing is not recognized");
  }
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) errors.push("payload must be an object");
  if (!event.privacy || typeof event.privacy !== "object") {
    errors.push("privacy must be an object");
  } else {
    if (typeof event.privacy.networkUsed !== "boolean") errors.push("privacy.networkUsed must be boolean");
    if (!RETENTION_STATES.has(event.privacy.retention)) errors.push("privacy.retention is not recognized");
  }
  return { valid: errors.length === 0, errors };
}
