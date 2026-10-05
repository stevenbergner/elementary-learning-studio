// SPDX-License-Identifier: MPL-2.0
export { EVENT_TYPES, PROTOCOL, createSpeechEvent, validateSpeechEvent } from "./speech-event.js";
export { LOCAL_SESSION_POLICIES, assertLocalOnlyRecognition } from "./local-policy.js";
export { DOM_EVENT_NAME, dispatchSpeechEvent } from "./dom-bridge.js";
export { LocalSpeechSession, adaptiveFlushDelay } from "./local-session.js";
export {
  CAPABILITY_KEYS,
  FIREFOX_WEB_SPEECH_CAPABILITIES,
  PARAKEET_CLI_CAPABILITIES,
  createCapabilityManifest,
  supportsCapability,
} from "./capabilities.js";
