// SPDX-License-Identifier: MPL-2.0

export const LOCAL_SESSION_POLICIES = Object.freeze({
  LOCAL_ONLY: "local-only",
  LOCAL_PREFERRED: "local-preferred",
  EXPLICIT_REMOTE: "explicit-remote",
});

export function assertLocalOnlyRecognition(RecognitionConstructor, recognition) {
  const failures = [];
  if (!RecognitionConstructor) failures.push("SpeechRecognition constructor is unavailable");
  if (!recognition || !("processLocally" in recognition)) failures.push("recognizer does not expose processLocally");
  if (typeof RecognitionConstructor?.available !== "function") failures.push("recognizer cannot report local language-pack availability");
  if (typeof RecognitionConstructor?.install !== "function") failures.push("recognizer cannot install a local language pack");
  if (failures.length) {
    const error = new Error(`Local-only speech requirements failed: ${failures.join("; ")}`);
    error.code = "LOCAL_ONLY_UNAVAILABLE";
    throw error;
  }
  recognition.processLocally = true;
  if (recognition.processLocally !== true) {
    const error = new Error("Recognizer did not accept processLocally=true");
    error.code = "LOCAL_ONLY_UNAVAILABLE";
    throw error;
  }
  return recognition;
}
