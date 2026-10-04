// SPDX-License-Identifier: MPL-2.0
import { createSpeechEvent } from "./speech-event.js";
import { assertLocalOnlyRecognition } from "./local-policy.js";

const DEFAULT_ADAPTIVE_FLUSH = Object.freeze({
  defaultMs: 900,
  minMs: 650,
  maxMs: 1400,
  cadenceMultiplier: 2.5,
});

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
  #flushTimer = null;
  #lastResultAt = null;
  #recentResultGaps = [];

  constructor({
    locale = "en-US",
    Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition,
    flushOnSpeechEnd = true,
    adaptiveFlush = DEFAULT_ADAPTIVE_FLUSH,
  } = {}) {
    super();
    this.#locale = locale;
    this.#Recognition = Recognition;
    this.#flushOnSpeechEnd = flushOnSpeechEnd;
    this.#adaptiveFlush = adaptiveFlush;
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
    this.#recognition.start();
  }

  stop() {
    this.#running = false;
    this.#finishingUtterance = false;
    this.#clearFlushTimer();
    this.#recognition.abort();
  }

  #event(type, payload = {}) {
    const event = createSpeechEvent({
      sequence: this.#sequence++, type, adapter: "firefox-web-speech", locale: this.#locale,
      audioSource: "microphone", localProcessing: "verified", payload,
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

  #finishUtterance() {
    if (!this.#running || this.#finishingUtterance) return;
    this.#clearFlushTimer();
    this.#finishingUtterance = true;
    this.#recognition.stop();
  }

  #scheduleAdaptiveFlush(delay) {
    if (!this.#running || this.#finishingUtterance) return;
    this.#clearFlushTimer();
    this.#flushTimer = setTimeout(() => this.#finishUtterance(), delay);
  }

  #wire() {
    this.#recognition.addEventListener("audiostart", () => this.#event("audio.state", { state: "capturing" }));
    this.#recognition.addEventListener("audioend", () => this.#event("audio.state", { state: "paused" }));
    this.#recognition.addEventListener("result", (event) => {
      const adaptiveFlushMs = this.#observeResult(event.timeStamp);
      let finalSeen = false;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        finalSeen ||= result.isFinal;
        const alternatives = Array.from(result, (choice) => ({ text: choice.transcript.trim(), confidence: choice.confidence }));
        this.#event(result.isFinal ? "recognition.final" : "recognition.interim", {
          transcript: alternatives[0]?.text || "", alternatives, resultIndex: index,
          timing: { browserEventMs: event.timeStamp, adaptiveFlushMs },
        });
      }
      if (finalSeen) this.#finishUtterance();
      else this.#scheduleAdaptiveFlush(adaptiveFlushMs);
    });
    this.#recognition.addEventListener("speechend", () => {
      if (!this.#flushOnSpeechEnd) return;
      // Web Speech does not let a page append synthetic silence. Gracefully
      // ending the stream asks Firefox to finalize and drain its decoder tail.
      this.#finishUtterance();
    });
    this.#recognition.addEventListener("error", (event) => this.#event("recognition.error", { code: event.error }));
    this.#recognition.addEventListener("end", () => {
      this.#clearFlushTimer();
      this.#finishingUtterance = false;
      this.#lastResultAt = null;
      if (this.#running) this.#recognition.start();
    });
  }
}
