// SPDX-License-Identifier: MPL-2.0
import { createSpeechEvent } from "./speech-event.js";
import { assertLocalOnlyRecognition } from "./local-policy.js";
import { FIREFOX_WEB_SPEECH_CAPABILITIES } from "./capabilities.js";
import { stripCarrierTokens } from "./recognition-input.js";

const DEFAULT_ADAPTIVE_FLUSH = Object.freeze({
  defaultMs: 900,
  minMs: 650,
  maxMs: 1400,
  cadenceMultiplier: 2.5,
});

const DEFAULT_FINALIZATION_GRACE_MS = 160;
const DEFAULT_CARRIER_WINDOW_MS = 2500;
const DEFAULT_CARRIER_RESULT_TIMEOUT_MS = 1500;
// Firefox can commit a word only once it has decoded the start of the next
// one. Text that arrives sooner after the carrier was committed by the
// learner's own speech, so it is not yet known to be the end of the turn.
// Lab measurement: carrier-committed words arrived 450–500 ms after injection;
// a lagging phrase prefix arrived about 200 ms after it.
const DEFAULT_CARRIER_RELEASE_DELAY_MS = 300;
// Early text that is still the newest text this long after the carrier will
// not grow further: release it as the completed turn.
const DEFAULT_CARRIER_SETTLE_MS = 650;
const INPUT_MODE_SAFETY_FLUSH_MS = 2500;

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

function tokenKey(token) {
  return String(token ?? "").toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function tokensOf(text) {
  return String(text).split(/\s+/).filter(Boolean).map(tokenKey);
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
  #input = null;
  #inputListener = null;
  #lastFinalAt = null;
  #carrierOutstanding = false;
  #carrierInjectedAt = null;
  #carrierTimer = null;
  #carrierPending = false;
  #carrierTokens = [];
  #deliveredByIndex = new Map();
  #carrierWindowMs;
  #carrierResultTimeoutMs;
  #carrierReleaseDelayMs;
  #carrierSettleMs;
  #carrierSettleTimer = null;
  #earlyCarrierText = null;

  constructor({
    locale = "en-US",
    Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition,
    flushOnSpeechEnd = true,
    adaptiveFlush = DEFAULT_ADAPTIVE_FLUSH,
    interimFlushDelay = null,
    finalizationGraceMs = DEFAULT_FINALIZATION_GRACE_MS,
    phrases = [],
    Phrase = globalThis.SpeechRecognitionPhrase,
    carrierWindowMs = DEFAULT_CARRIER_WINDOW_MS,
    carrierResultTimeoutMs = DEFAULT_CARRIER_RESULT_TIMEOUT_MS,
    carrierReleaseDelayMs = DEFAULT_CARRIER_RELEASE_DELAY_MS,
    carrierSettleMs = DEFAULT_CARRIER_SETTLE_MS,
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
    this.#carrierWindowMs = carrierWindowMs;
    this.#carrierResultTimeoutMs = carrierResultTimeoutMs;
    this.#carrierReleaseDelayMs = carrierReleaseDelayMs;
    this.#carrierSettleMs = carrierSettleMs;
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

  /**
   * Starts listening. With `input` (see openRecognitionInput), the page owns
   * the microphone track: its loudness boundaries replace Firefox's audibility
   * events, and a silent end of speech without a final result adds the
   * input's carrier so a withheld last word is committed.
   */
  start({ audioTrack = null, audioSource = audioTrack ? "unknown" : "microphone", input = null } = {}) {
    if (input !== null) {
      if (typeof input.addEventListener !== "function" || !input.track) throw new TypeError("input must be a RecognitionInput");
      audioTrack = input.track;
      audioSource = "microphone";
    }
    if (audioTrack !== null && audioTrack?.kind !== "audio") {
      throw new TypeError("audioTrack must be an audio MediaStreamTrack");
    }
    if (!["microphone", "file", "system", "unknown"].includes(audioSource)) {
      throw new TypeError("audioSource is not recognized");
    }
    this.#audioSource = audioSource;
    this.#audioTrack = audioTrack;
    this.#attachInput(input);
    this.#running = true;
    this.#finishingUtterance = false;
    this.#beginRecognition();
  }

  stop({ finalizePending = false } = {}) {
    this.#running = false;
    this.#finishingUtterance = finalizePending;
    this.#clearFlushTimer();
    this.#clearCarrier();
    this.#attachInput(null);
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
    if (this.#utteranceCycle === this.#recognitionCycle && this.#utteranceOpen) return;
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

  #attachInput(input) {
    if (this.#input && this.#inputListener) this.#input.removeEventListener("boundary", this.#inputListener);
    this.#input = input;
    this.#inputListener = null;
    if (!input) return;
    this.#inputListener = ({ detail }) => this.#onInputBoundary(detail);
    input.addEventListener("boundary", this.#inputListener);
  }

  #clearCarrier() {
    if (this.#carrierTimer !== null) clearTimeout(this.#carrierTimer);
    this.#carrierTimer = null;
    if (this.#carrierSettleTimer !== null) clearTimeout(this.#carrierSettleTimer);
    this.#carrierSettleTimer = null;
    this.#earlyCarrierText = null;
  }

  // Records interim text that arrived before the release guard, and releases
  // it if nothing newer arrives before the settle deadline.
  #holdEarlyCarrierText(index, payload) {
    this.#earlyCarrierText = { index, payload };
    if (this.#carrierSettleTimer !== null) return;
    const delay = Math.max(0, this.#carrierInjectedAt + this.#carrierSettleMs - monotonicNow());
    this.#carrierSettleTimer = setTimeout(() => {
      this.#carrierSettleTimer = null;
      const early = this.#earlyCarrierText;
      this.#earlyCarrierText = null;
      if (!early || !this.#carrierPending || !this.#running) return;
      this.#carrierPending = false;
      this.#clearCarrier();
      this.#clearFlushTimer();
      const delivered = this.#deliveredByIndex.get(early.index) ?? [];
      this.#deliveredByIndex.set(early.index, [...delivered, ...tokensOf(early.payload.transcript)]);
      this.#utteranceFinalized = true;
      this.#utteranceOpen = false;
      this.#event("recognition.final", {
        ...early.payload,
        timing: { ...early.payload.timing, adaptiveFlushMs: null, flushPolicy: "carrier-settled", finalization: "carrier-settled" },
      });
    }, delay);
  }

  #carrierActive(now = monotonicNow()) {
    return this.#carrierInjectedAt !== null && now - this.#carrierInjectedAt <= this.#carrierWindowMs;
  }

  // Removes text this session already delivered from a Firefox result that is
  // still growing, then removes carrier tokens. A cache-aware transducer
  // never revises committed words, so the delivered words are its prefix.
  #reviseForCarrier(index, alternatives, now) {
    const delivered = this.#deliveredByIndex.get(index) ?? null;
    if (!delivered && !this.#carrierOutstanding && !this.#carrierActive(now)) return { alternatives, carrier: null };
    const tokens = this.#carrierTokens;
    const revised = alternatives.map((choice) => {
      // Carriers sit between delivered words ("nine ok check ok next"), so
      // remove them before matching the delivered prefix.
      const { text: withoutCarrier, removed } = stripCarrierTokens(choice.text, tokens);
      let words = withoutCarrier.split(/\s+/).filter(Boolean);
      if (delivered && delivered.every((token, position) => tokenKey(words[position]) === token)) {
        words = words.slice(delivered.length);
      }
      return { text: words.join(" "), confidence: choice.confidence, removed };
    });
    // An uncommitted carrier can surface at the front of much later speech.
    if (revised[0]?.removed.length) this.#carrierOutstanding = false;
    const carrier = {
      rawTranscript: alternatives[0]?.text || "",
      removed: [...(revised[0]?.removed ?? [])],
      ...(delivered ? { alreadyDelivered: delivered.join(" ") } : {}),
    };
    return {
      alternatives: revised.map(({ text, confidence }) => ({ text, confidence })).filter(({ text }, position) => position === 0 || text),
      carrier,
    };
  }

  #onInputBoundary(boundary) {
    if (!this.#running) return;
    if (boundary.type === "speech-start") {
      if (this.#input?.cancelCarrier?.()) {
        this.#event("audio.state", { state: "carrier-cancelled", boundarySource: "page-loudness" });
      }
      this.#clearFlushTimer();
      this.#beginUtterance("speech");
      this.#event("audio.state", {
        state: "speech-started",
        boundarySource: "page-loudness",
        timing: { floorDb: boundary.floorDb },
      });
      return;
    }
    if (boundary.type !== "speech-end") return;
    if (boundary.reason === "recalibrated") {
      this.#event("audio.state", { state: "level-recalibrated", boundarySource: "page-loudness", timing: { floorDb: boundary.floorDb } });
      return;
    }
    this.#utteranceOpen = false;
    this.#event("audio.state", {
      state: "speech-ended",
      boundarySource: "page-loudness",
      timing: { speechMs: boundary.speechMs, quietMs: boundary.quietMs, floorDb: boundary.floorDb },
    });
    // A lone word yields no text at all, and a phrase's last word is held back
    // behind interim text; either way only a final shows the turn is complete.
    // A final proves this segment complete only if it arrived after the
    // segment's last loud frame; an earlier one belongs to a previous turn.
    const lastLoudAt = monotonicNow() - (boundary.quietMs ?? 0);
    if (this.#lastFinalAt !== null && this.#lastFinalAt >= lastLoudAt) return;
    if (this.#finishingUtterance || !this.#input?.carrierAvailable) return;
    const carrier = this.#input.injectCarrier();
    if (!carrier) return;
    this.#carrierInjectedAt = monotonicNow();
    this.#carrierPending = true;
    this.#carrierOutstanding = true;
    // Kept from injection time: a draining final can arrive after stop() has
    // already detached the input.
    this.#carrierTokens = [...carrier.tokens];
    this.#clearCarrier();
    // If the carrier draws out no text, the sound was not a decodable word.
    // Stopping cannot recover it (finalize does not invent tokens) and would
    // cost a restart gap, so only stop waiting for a release.
    this.#carrierTimer = setTimeout(() => {
      this.#carrierTimer = null;
      if (!this.#carrierPending) return;
      this.#carrierPending = false;
      this.#event("audio.state", { state: "carrier-no-text", boundarySource: "page-loudness" });
    }, carrier.durationMs + this.#carrierResultTimeoutMs);
    this.#event("audio.state", {
      state: "carrier-injected",
      boundarySource: "page-loudness",
      carrier: { durationMs: carrier.durationMs, tokens: [...carrier.tokens] },
      timing: { speechMs: boundary.speechMs, quietMs: boundary.quietMs },
    });
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
      // With a page-owned input the loudness endpointer and carrier decide the
      // boundary; stopping at soundend can discard the word's last frames.
      if (this.#flushOnSpeechEnd && !this.#utteranceFinalized && !this.#input) {
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
      let closedUtterance = false;
      let pendingInterim = false;
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const raw = Array.from(result, (choice) => ({ text: choice.transcript.trim(), confidence: choice.confidence }));
        const { alternatives, carrier } = this.#reviseForCarrier(index, raw, receivedAtMs);
        if (!alternatives[0]?.text) {
          // Only the carrier, or text already delivered, remains: it is not
          // new learner evidence.
          if (carrier) this.#event("audio.state", { state: "carrier-only", carrier: { ...carrier, final: result.isFinal } });
          if (result.isFinal) {
            this.#deliveredByIndex.delete(index);
            closedUtterance = true;
          }
          continue;
        }
        // The carrier was added only after the learner fell silent, so the
        // first text it draws out is a complete turn. Deliver it as final
        // without stopping: a stop would drop a quick follow-up word and cost
        // a restart gap. Firefox keeps extending this result; later text is
        // revised against what was delivered.
        const released = !result.isFinal
          && this.#carrierPending
          && receivedAtMs - this.#carrierInjectedAt >= this.#carrierReleaseDelayMs;
        if (released) {
          this.#carrierPending = false;
          this.#clearCarrier();
          const delivered = this.#deliveredByIndex.get(index) ?? [];
          this.#deliveredByIndex.set(index, [...delivered, ...tokensOf(alternatives[0].text)]);
        }
        if (result.isFinal) this.#deliveredByIndex.delete(index);
        const isFinal = result.isFinal || released;
        if (isFinal) {
          closedUtterance = true;
          // A carrier release belongs to the earlier segment whose carrier
          // produced it; only the browser's own final can complete this one.
          if (result.isFinal) this.#lastFinalAt = receivedAtMs;
        } else {
          pendingInterim = true;
          if (this.#interimFlushDelay) {
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
          if (this.#input) {
            // With a page-owned input the loudness boundary and carrier finish
            // a turn; stopping on an interim quiet deadline drops the held-back
            // last word. Keep the deadline only as a slow safety net.
            selectedFlushMs = Math.max(selectedFlushMs, INPUT_MODE_SAFETY_FLUSH_MS);
            flushPolicy = "input-safety-net";
          }
        }
        const payload = {
          transcript: alternatives[0]?.text || "", alternatives, resultIndex: index,
          ...(carrier ? { carrier } : {}),
          timing: {
            browserEventMs: event.timeStamp,
            receivedAtMs,
            adaptiveFlushMs: isFinal ? null : selectedFlushMs,
            baselineAdaptiveFlushMs: adaptiveFlushMs,
            flushPolicy: released ? "carrier-released" : flushPolicy,
            sinceSpeechStartMs: this.#speechStartedAt === null ? null : Math.round(receivedAtMs - this.#speechStartedAt),
            sinceSpeechEndMs: this.#speechEndedAt === null ? null : Math.round(receivedAtMs - this.#speechEndedAt),
            sinceSoundStartMs: this.#soundStartedAt === null ? null : Math.round(receivedAtMs - this.#soundStartedAt),
            sinceSoundEndMs: this.#soundEndedAt === null ? null : Math.round(receivedAtMs - this.#soundEndedAt),
            finalization: result.isFinal ? "browser-final" : released ? "carrier-released" : "pending",
          },
        };
        if (isFinal) this.#earlyCarrierText = null;
        else if (this.#carrierPending) this.#holdEarlyCarrierText(index, payload);
        this.#event(isFinal ? "recognition.final" : "recognition.interim", payload);
      }
      if (closedUtterance) {
        // A final result is already committed. Keep the continuous
        // recognizer open so a rapid follow-up command is not spoken into a
        // stop/restart gap. The stop path remains for a retained interim tail.
        this.#utteranceFinalized = true;
        // Firefox can commit several conversational turns without emitting a
        // new soundstart boundary. Treat the next result as a new logical
        // utterance so diagnostics and consumer state do not merge attempts.
        this.#utteranceOpen = false;
      }
      if (pendingInterim) this.#scheduleFlush(selectedFlushMs, "adaptive-quiet-deadline");
      else if (closedUtterance) this.#clearFlushTimer();
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
      this.#clearCarrier();
      this.#carrierPending = false;
      this.#carrierOutstanding = false;
      this.#deliveredByIndex.clear();
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
