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
  #recognitionCycle = 0;
  #utterance = 0;
  #utteranceOpen = false;
  #utteranceCycle = 0;
  #locale;
  #audioSource = "microphone";
  #audioTrack = null;
  #phraseHintCount = 0;
  #phraseHintsApplied = false;
  #running = false;
  #finishingUtterance = false;
  #flushOnSpeechEnd;
  #adaptiveFlush;
  #interimFlushDelay;
  #finalizationGraceMs;
  #flushTimer = null;
  #lastResultAt = null;
  #recentResultGaps = [];
  #speechStartedAt = null;
  #speechEndedAt = null;
  #soundStartedAt = null;
  #soundEndedAt = null;
  #utteranceFinalized = false;
  #startRequestedAt = null;
  #lastAudioEndedAt = null;
  #cycleStartedAt = null;

  constructor({
    locale = "en-US",
    Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition,
    flushOnSpeechEnd = true,
    adaptiveFlush = DEFAULT_ADAPTIVE_FLUSH,
    interimFlushDelay = null,
    finalizationGraceMs = DEFAULT_FINALIZATION_GRACE_MS,
    phrases = [],
    Phrase = globalThis.SpeechRecognitionPhrase,
  } = {}) {
    super();
    this.#locale = locale;
    this.#Recognition = Recognition;
    this.#flushOnSpeechEnd = flushOnSpeechEnd;
    this.#adaptiveFlush = adaptiveFlush;
    if (interimFlushDelay !== null && typeof interimFlushDelay !== "function") {
      throw new TypeError("interimFlushDelay must be a function or null");
    }
    this.#interimFlushDelay = interimFlushDelay;
    this.#finalizationGraceMs = finalizationGraceMs;
    const recognition = Recognition ? new Recognition() : null;
    this.#recognition = assertLocalOnlyRecognition(Recognition, recognition);
    Object.assign(this.#recognition, { lang: locale, continuous: true, interimResults: true, maxAlternatives: 3 });
    const phraseData = phrases.map((entry) => typeof entry === "string"
      ? { phrase: entry, boost: 5 }
      : { phrase: entry?.phrase, boost: entry?.boost ?? 5 });
    phraseData.forEach(({ phrase, boost }) => {
      if (typeof phrase !== "string" || !phrase.trim()) throw new TypeError("phrase hint text must be non-empty");
      if (!Number.isFinite(boost) || boost < 0 || boost > 10) throw new RangeError("phrase hint boost must be between 0 and 10");
    });
    this.#phraseHintCount = phraseData.length;
    if (phraseData.length && typeof Phrase === "function" && "phrases" in this.#recognition) {
      this.#recognition.phrases = phraseData.map(({ phrase, boost }) => new Phrase(phrase.trim(), boost));
      this.#phraseHintsApplied = true;
    }
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

  start({ audioTrack = null, audioSource = audioTrack ? "unknown" : "microphone" } = {}) {
    if (audioTrack !== null && audioTrack?.kind !== "audio") {
      throw new TypeError("audioTrack must be an audio MediaStreamTrack");
    }
    if (!["microphone", "file", "system", "unknown"].includes(audioSource)) {
      throw new TypeError("audioSource is not recognized");
    }
    this.#audioSource = audioSource;
    this.#audioTrack = audioTrack;
    this.#running = true;
    this.#finishingUtterance = false;
    this.#beginRecognition();
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
      audioSource: this.#audioSource, localProcessing: "verified", payload: {
        ...payload,
        lifecycle: {
          recognitionCycle: this.#recognitionCycle,
          utterance: this.#utterance,
        },
        recognizer: {
          requestedLocale: this.#locale,
          languageSelection: "explicit",
          detectedLocale: null,
          capabilities: FIREFOX_WEB_SPEECH_CAPABILITIES,
          contextualBiasing: {
            requestedPhrases: this.#phraseHintCount,
            applied: this.#phraseHintsApplied,
          },
        },
      },
    });
    this.dispatchEvent(new CustomEvent("speech", { detail: event }));
  }

  #clearFlushTimer() {
    if (this.#flushTimer !== null) clearTimeout(this.#flushTimer);
    this.#flushTimer = null;
  }

  #beginRecognition() {
    this.#recognitionCycle += 1;
    this.#startRequestedAt = monotonicNow();
    if (this.#audioTrack) this.#recognition.start(this.#audioTrack);
    else this.#recognition.start();
  }

  #beginUtterance(boundary, startedAt = monotonicNow()) {
    if (this.#utteranceOpen) return;
    this.#utterance += 1;
    this.#utteranceOpen = true;
    this.#utteranceCycle = this.#recognitionCycle;
    this.#speechStartedAt = null;
    this.#speechEndedAt = null;
    this.#soundStartedAt = boundary === "sound" ? startedAt : null;
    this.#soundEndedAt = null;
    this.#utteranceFinalized = false;
  }

  #ensureResultUtterance() {
    if (this.#utteranceCycle === this.#recognitionCycle) return;
    this.#beginUtterance("result");
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
        silenceSinceSoundEndMs: this.#soundEndedAt === null ? null : Math.round(requestedAtMs - this.#soundEndedAt),
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
    this.#recognition.addEventListener("start", () => {
      this.#cycleStartedAt = monotonicNow();
      this.#event("audio.state", { state: "recognition-started" });
    });
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
    this.#recognition.addEventListener("soundstart", () => {
      const now = monotonicNow();
      this.#clearFlushTimer();
      this.#beginUtterance("sound", now);
      if (this.#soundStartedAt === null) this.#soundStartedAt = now;
      this.#event("audio.state", { state: "sound-started", boundarySource: "browser-sound" });
    });
    this.#recognition.addEventListener("soundend", () => {
      this.#soundEndedAt = monotonicNow();
      this.#event("audio.state", {
        state: "sound-ended",
        boundarySource: "browser-sound",
        timing: {
          soundDurationMs: this.#soundStartedAt === null ? null : Math.round(this.#soundEndedAt - this.#soundStartedAt),
        },
      });
      this.#utteranceOpen = false;
      if (this.#flushOnSpeechEnd && !this.#utteranceFinalized) {
        // Firefox's on-device backend currently does not dispatch the Web
        // Speech speechstart/speechend events. soundend is therefore the only
        // content-visible boundary for a very short utterance that produced no
        // interim text. Stop synchronously, before the browser's imminent
        // audioend/nomatch path, so its decoder gets a chance to drain.
        this.#finishUtterance("sound-end");
      }
    });
    this.#recognition.addEventListener("speechstart", () => {
      this.#clearFlushTimer();
      const now = monotonicNow();
      this.#beginUtterance("speech", now);
      this.#speechStartedAt = now;
      this.#speechEndedAt = null;
      this.#utteranceFinalized = false;
      this.#event("audio.state", { state: "speech-started", boundarySource: "browser-speech" });
    });
    this.#recognition.addEventListener("result", (event) => {
      this.#ensureResultUtterance();
      const receivedAtMs = monotonicNow();
      const adaptiveFlushMs = this.#observeResult(event.timeStamp);
      let selectedFlushMs = adaptiveFlushMs;
      let flushPolicy = "adaptive-cadence";
      let finalSeen = false;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        finalSeen ||= result.isFinal;
        const alternatives = Array.from(result, (choice) => ({ text: choice.transcript.trim(), confidence: choice.confidence }));
        if (!result.isFinal && this.#interimFlushDelay) {
          const selected = this.#interimFlushDelay({
            transcript: alternatives[0]?.text || "",
            alternatives: Object.freeze(alternatives.map((choice) => Object.freeze({ ...choice }))),
            adaptiveFlushMs,
            locale: this.#locale,
          });
          if (selected !== null && selected !== undefined) {
            if (!Number.isFinite(selected) || selected < 0) {
              throw new RangeError("interimFlushDelay must return a non-negative finite number, null, or undefined");
            }
            selectedFlushMs = Math.round(selected);
            flushPolicy = selectedFlushMs === adaptiveFlushMs ? "adaptive-cadence" : "consumer-selected";
          }
        }
        this.#event(result.isFinal ? "recognition.final" : "recognition.interim", {
          transcript: alternatives[0]?.text || "", alternatives, resultIndex: index,
          timing: {
            browserEventMs: event.timeStamp,
            receivedAtMs,
            adaptiveFlushMs: selectedFlushMs,
            baselineAdaptiveFlushMs: adaptiveFlushMs,
            flushPolicy,
            sinceSpeechStartMs: this.#speechStartedAt === null ? null : Math.round(receivedAtMs - this.#speechStartedAt),
            sinceSpeechEndMs: this.#speechEndedAt === null ? null : Math.round(receivedAtMs - this.#speechEndedAt),
            sinceSoundStartMs: this.#soundStartedAt === null ? null : Math.round(receivedAtMs - this.#soundStartedAt),
            sinceSoundEndMs: this.#soundEndedAt === null ? null : Math.round(receivedAtMs - this.#soundEndedAt),
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
        this.#scheduleFlush(selectedFlushMs, "adaptive-quiet-deadline");
      }
    });
    this.#recognition.addEventListener("speechend", () => {
      this.#speechEndedAt = monotonicNow();
      this.#event("audio.state", {
        state: "speech-ended",
        timing: {
          speechDurationMs: this.#speechStartedAt === null ? null : Math.round(this.#speechEndedAt - this.#speechStartedAt),
        },
      });
      this.#utteranceOpen = false;
      if (!this.#flushOnSpeechEnd) return;
      if (this.#utteranceFinalized) return;
      // Web Speech does not let a page append synthetic silence. Gracefully
      // ending the stream asks Firefox to finalize and drain its decoder tail.
      // Give an already-arriving browser-final result a brief opportunity to
      // win first; that preserves continuous listening between quick turns.
      this.#scheduleFlush(this.#finalizationGraceMs, "speech-end-grace");
    });
    this.#recognition.addEventListener("nomatch", () => {
      this.#event("audio.state", { state: "no-match" });
    });
    this.#recognition.addEventListener("error", (event) => this.#event("recognition.error", { code: event.error }));
    this.#recognition.addEventListener("end", () => {
      const endedAtMs = monotonicNow();
      this.#event("audio.state", {
        state: "recognition-ended",
        willRestart: this.#running,
        timing: {
          cycleDurationMs: this.#cycleStartedAt === null ? null : Math.round(endedAtMs - this.#cycleStartedAt),
        },
      });
      this.#clearFlushTimer();
      this.#finishingUtterance = false;
      this.#lastResultAt = null;
      this.#utteranceFinalized = false;
      this.#utteranceOpen = false;
      if (this.#running) {
        this.#beginRecognition();
      }
    });
  }
}
