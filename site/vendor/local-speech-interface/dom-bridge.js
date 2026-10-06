// SPDX-License-Identifier: MPL-2.0
import { validateSpeechEvent } from "./speech-event.js";

export const DOM_EVENT_NAME = "local-speech-interface:event";

export function dispatchSpeechEvent(target, speechEvent) {
  const result = validateSpeechEvent(speechEvent);
  if (!result.valid) throw new TypeError(`Cannot dispatch invalid speech event: ${result.errors.join("; ")}`);
  if (!target || typeof target.dispatchEvent !== "function") throw new TypeError("target must be an EventTarget");
  return target.dispatchEvent(new CustomEvent(DOM_EVENT_NAME, { detail: speechEvent }));
}
