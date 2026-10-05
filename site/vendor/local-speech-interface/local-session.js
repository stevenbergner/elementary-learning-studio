// SPDX-License-Identifier: MPL-2.0
import { createSpeechEvent } from "./speech-event.js";
import { assertLocalOnlyRecognition } from "./local-policy.js";
import { FIREFOX_WEB_SPEECH_CAPABILITIES } from "./capabilities.js";

const DEFAULT_ADAPTIVE_FLUSH = Object.freeze({
  defaultMs: 900,
  minMs: 650,
  maxMs: 1400,
  cadenceMultiplier: 2.5,
});

const DEFAULT_FINALIZATION_GRACE_MS = 160;

function monotonicNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function adaptiveFlushDelay(recentGaps, policy = DEFAULT_ADAPTIVE_FLUSH) {
  if (!recentGaps.length) return policy.defaultMs;
  const ordered = [...recentGaps].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const median = ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
  return Math.round(Math.min(policy.maxMs, Math.max(policy.minMs, median * policy.cadenceMultiplier)));
}

export class LocalSpeechSession extends EventTarget {
  #Recognition;
  #recognition;
  #sequence = 0;
  #locale;
  #running = false;
  #finishingUtterance = false;
  #flushOnSpeechEnd;
  #adaptiveFlush;
  #finalizationGraceMs;
  #flushTimer = null;
  #lastResultAt = null;
  #recentResultGaps = [];
  #speechStartedAt = null;
  #speechEndedAt = null;
  #utteranceFinalized = false;
  #startRequestedAt = null;
  #lastAudioEndedAt = null;

  constructor({
    locale = "en-US",
    Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition,
    flushOnSpeechEnd = true,
    adaptiveFlush = DEFAULT_ADAPTIVE_FLUSH,
    finalizationGraceMs = DEFAULT_FINALIZATION_GRACE_MS,
  } = {}) {
    super();
    this.#locale = locale;
    this.#Recognition = Recognition;
    this.#flushOnSpeechEnd = flushOnSpeechEnd;
    this.#adaptiveFlush = adaptiveFlush;
    this.#finalizationGraceMs = finalizationGraceMs;
    const recognition = Recognition ? new Recognition() : null;
    this.#recognition = assertLocalOnlyRecognition(Recognition, recognition);
    Object.assign(this.#recognition, { lang: locale, continuous: true, interimResults: true, maxAlternatives: 3 });
    this.#wire();
  }

  async prepare() {
    const availability = await this.#Recognition.available({ langs: [this.#locale], processLocally: true });
    if (availability === "available") return true;
    if (availability !== "downloadable") throw new Error(`Local language pack is ${availability}`);
    const installed = await this.#Recognition.install({ langs: [this.#locale], processLocally: true });
    if (!installed) throw new Error("Local language-pack installation failed");
    return true;
  }

  start() {
    this.#running = true;
    this.#finishingUtterance = false;
    this.#startRequestedAt = monotonicNow();
    this.#recognition.start();
  }

  stop({ finalizePending = false } = {}) {
    this.#running = false;
    this.#finishingUtterance = finalizePending;
    this.#clearFlushTimer();
    if (finalizePending) this.#recognition.stop();
    else this.#recognition.abort();
  }

  #event(type, payload = {}) {
    const event = createSpeechEvent({
      sequence: this.#sequence++, type, adapter: "firefox-web-speech", locale: this.#locale,
      audioSource: "microphone", localProcessing: "verified", payload: {
        ...payload,
        recognizer: {
          requestedLocale: this.#locale,
          languageSelection: "explicit",
          detectedLocale: null,
          capabilities: FIREFOX_WEB_SPEECH_CAPABILITIES,
        },
      },
    });
    this.dispatchEvent(new CustomEvent("speech", { detail: event }));
  }

  #clearFlushTimer() {
    if (this.#flushTimer !== null) clearTimeout(this.#flushTimer);
    this.#flushTimer = null;
  }

  #observeResult(eventTime) {
    if (this.#lastResultAt !== null) {
      const gap = eventTime - this.#lastResultAt;
      if (gap >= 50 && gap <= 2000) {
        this.#recentResultGaps.push(gap);
        if (this.#recentResultGaps.length > 8) this.#recentResultGaps.shift();
      }
    }
    this.#lastResultAt = eventTime;
    return adaptiveFlushDelay(this.#recentResultGaps, this.#adaptiveFlush);
  }

  #finishUtterance(reason) {
    if (!this.#running || this.#finishingUtterance) return;
    this.#clearFlushTimer();
    this.#finishingUtterance = true;
    const requestedAtMs = monotonicNow();
    this.#event("audio.state", {
      state: "finalizing",
      reason,
      timing: {
        requestedAtMs,
        silenceSinceSpeechEndMs: this.#speechEndedAt === null ? null : Math.round(requestedAtMs - this.#speechEndedAt),
      },
    });
    this.#recognition.stop();
  }

  #scheduleFlush(delay, reason) {
    if (!this.#running || this.#finishingUtterance) return;
    this.#clearFlushTimer();
    this.#flushTimer = setTimeout(() => this.#finishUtterance(reason), delay);
  }

  #wire() {
    this.#recognition.addEventListener("audiostart", () => {
      const now = monotonicNow();
      this.#event("audio.state", {
        state: "capturing",
        timing: {
          startDelayMs: this.#startRequestedAt === null ? null : Math.round(now - this.#startRequestedAt),
          captureGapMs: this.#lastAudioEndedAt === null ? null : Math.round(now - this.#lastAudioEndedAt),
        },
      });
      this.#startRequestedAt = null;
    });
    this.#recognition.addEventListener("audioend", () => {
      this.#lastAudioEndedAt = monotonicNow();
      this.#event("audio.state", { state: "paused" });
    });
    this.#recognition.addEventListener("speechstart", () => {
      this.#clearFlushTimer();
      this.#speechStartedAt = monotonicNow();
      this.#speechEndedAt = null;
      this.#utteranceFinalized = false;
    });
    this.#recognition.addEventListener("result", (event) => {
      const receivedAtMs = monotonicNow();
      const adaptiveFlushMs = this.#observeResult(event.timeStamp);
      let finalSeen = false;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        finalSeen ||= result.isFinal;
        const alternatives = Array.from(result, (choice) => ({ text: choice.transcript.trim(), confidence: choice.confidence }));
        this.#event(result.isFinal ? "recognition.final" : "recognition.interim", {
          transcript: alternatives[0]?.text || "", alternatives, resultIndex: index,
          timing: {
            browserEventMs: event.timeStamp,
            receivedAtMs,
            adaptiveFlushMs,
            sinceSpeechStartMs: this.#speechStartedAt === null ? null : Math.round(receivedAtMs - this.#speechStartedAt),
            sinceSpeechEndMs: this.#speechEndedAt === null ? null : Math.round(receivedAtMs - this.#speechEndedAt),
            finalization: result.isFinal ? "browser-final" : "pending",
          },
        });
      }
      if (finalSeen) {
        // A browser-final result is already committed. Keep the continuous
        // recognizer open so a rapid follow-up command is not spoken into a
        // stop/restart gap. The stop path remains for a retained interim tail.
        this.#utteranceFinalized = true;
        this.#clearFlushTimer();
      } else {
        this.#scheduleFlush(adaptiveFlushMs, "adaptive-quiet-deadline");
      }
    });
    this.#recognition.addEventListener("speechend", () => {
      if (!this.#flushOnSpeechEnd) return;
      this.#speechEndedAt = monotonicNow();
      if (this.#utteranceFinalized) return;
      // Web Speech does not let a page append synthetic silence. Gracefully
      // ending the stream asks Firefox to finalize and drain its decoder tail.
      // Give an already-arriving browser-final result a brief opportunity to
      // win first; that preserves continuous listening between quick turns.
      this.#scheduleFlush(this.#finalizationGraceMs, "speech-end-grace");
    });
    this.#recognition.addEventListener("error", (event) => this.#event("recognition.error", { code: event.error }));
    this.#recognition.addEventListener("end", () => {
      this.#clearFlushTimer();
      this.#finishingUtterance = false;
      this.#lastResultAt = null;
      this.#utteranceFinalized = false;
      if (this.#running) {
        this.#startRequestedAt = monotonicNow();
        this.#recognition.start();
      }
    });
  }
}
