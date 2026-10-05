// SPDX-License-Identifier: MPL-2.0
import { LoudnessEndpointer, levelDbfs } from "./loudness-endpointer.js";

/**
 * A microphone input that the page routes to the recognizer itself, so it can
 * observe loudness and add a carrier to what the recognizer hears.
 *
 * Why a carrier: Firefox's English model is a streaming transducer that holds
 * back an utterance's last word until the next word starts. A lone "four" is
 * that last word, and on a live microphone nothing ever releases it. A short
 * spoken carrier (for example "okay") played into the recognizer's input after
 * the learner falls silent starts the next word, so the learner's word is
 * committed. The carrier goes only to the recognizer's track: not to the
 * speakers and not to the loudness analyser. Consumers strip its tokens.
 *
 * Privacy: the analyser reads short sample blocks only to compute a decibel
 * level; no samples are stored, and nothing leaves the page.
 */
export class RecognitionInput extends EventTarget {
  #context;
  #stream;
  #ownsStream;
  #destination;
  #analyser;
  #samples;
  #endpointer;
  #timer = null;
  #clearIntervalFn;
  #carrierBuffer;
  #carrierTokens;
  #carrierGain;
  #carrierSource = null;
  #closed = false;

  constructor({ context, stream, ownsStream, endpointer, frameMs, carrierBuffer, carrierTokens, carrierGain, now, setIntervalFn, clearIntervalFn }) {
    super();
    this.#context = context;
    this.#stream = stream;
    this.#ownsStream = ownsStream;
    this.#endpointer = endpointer;
    this.#carrierBuffer = carrierBuffer;
    this.#carrierTokens = Object.freeze([...carrierTokens]);
    this.#carrierGain = carrierGain;
    this.#clearIntervalFn = clearIntervalFn;

    const source = context.createMediaStreamSource(stream);
    this.#destination = context.createMediaStreamDestination();
    source.connect(this.#destination);
    this.#analyser = context.createAnalyser();
    this.#analyser.fftSize = 1024;
    source.connect(this.#analyser);
    this.#samples = new Float32Array(this.#analyser.fftSize);

    this.#timer = setIntervalFn(() => {
      if (this.#closed) return;
      this.#analyser.getFloatTimeDomainData(this.#samples);
      const timeMs = now();
      const levelDb = levelDbfs(this.#samples);
      for (const boundary of this.#endpointer.push({ timeMs, levelDb })) {
        this.dispatchEvent(new CustomEvent("boundary", { detail: Object.freeze({ ...boundary, atMs: timeMs }) }));
      }
    }, frameMs);
  }

  /** The track to pass to SpeechRecognition.start(track). */
  get track() {
    return this.#destination.stream.getAudioTracks()[0];
  }

  get carrierAvailable() {
    return Boolean(this.#carrierBuffer) && !this.#closed;
  }

  get carrierTokens() {
    return this.#carrierTokens;
  }

  /** Plays the carrier into the recognizer's track only. */
  injectCarrier() {
    if (!this.carrierAvailable) return null;
    const source = this.#context.createBufferSource();
    source.buffer = this.#carrierBuffer;
    const gain = this.#context.createGain();
    gain.gain.value = this.#carrierGain;
    source.connect(gain);
    gain.connect(this.#destination);
    source.onended = () => {
      if (this.#carrierSource === source) this.#carrierSource = null;
    };
    this.#carrierSource = source;
    source.start();
    return Object.freeze({ durationMs: Math.round(this.#carrierBuffer.duration * 1000), tokens: this.#carrierTokens });
  }

  /**
   * Stops a carrier that is still playing. The learner's own next word starts
   * a new word too, so the carrier is no longer needed and would overlap it.
   */
  cancelCarrier() {
    const source = this.#carrierSource;
    if (!source) return false;
    this.#carrierSource = null;
    try { source.stop(); } catch (_) { /* It already ended. */ }
    return true;
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#timer !== null) this.#clearIntervalFn(this.#timer);
    this.#timer = null;
    if (this.#ownsStream) this.#stream.getTracks().forEach((track) => track.stop());
    this.track?.stop();
    this.#context.close?.().catch?.(() => {});
  }
}

export async function openRecognitionInput({
  stream = null,
  mediaDevices = globalThis.navigator?.mediaDevices,
  constraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } },
  AudioContextClass = globalThis.AudioContext,
  endpointing = {},
  frameMs = 20,
  carrier = null,
  fetchFn = globalThis.fetch?.bind(globalThis),
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  setIntervalFn = (callback, delay) => globalThis.setInterval(callback, delay),
  clearIntervalFn = (timer) => globalThis.clearInterval(timer),
} = {}) {
  if (typeof AudioContextClass !== "function") throw new TypeError("Web Audio is required for page-side endpointing");
  if (carrier !== null) {
    if (!Array.isArray(carrier.tokens) || !carrier.tokens.length) throw new TypeError("a carrier needs the tokens the recognizer will produce for it");
    if (!carrier.url && !carrier.buffer) throw new TypeError("a carrier needs a url or an AudioBuffer");
  }
  const ownsStream = stream === null;
  const input = stream ?? await mediaDevices.getUserMedia(constraints);
  const context = new AudioContextClass();
  try {
    if (context.state === "suspended") await context.resume?.();
    let carrierBuffer = carrier?.buffer ?? null;
    if (carrier?.url) {
      const response = await fetchFn(carrier.url);
      if (!response.ok) throw new Error(`carrier audio is unavailable (${response.status})`);
      carrierBuffer = await context.decodeAudioData(await response.arrayBuffer());
    }
    return new RecognitionInput({
      context,
      stream: input,
      ownsStream,
      endpointer: new LoudnessEndpointer(endpointing),
      frameMs,
      carrierBuffer,
      carrierTokens: carrier?.tokens ?? [],
      carrierGain: carrier?.gain ?? 1,
      now,
      setIntervalFn,
      clearIntervalFn,
    });
  } catch (error) {
    if (ownsStream) input.getTracks().forEach((track) => track.stop());
    context.close?.().catch?.(() => {});
    throw error;
  }
}

/**
 * Removes carrier tokens from recognizer text. Only whole tokens are removed,
 * ignoring case and trailing punctuation, so "okay" never alters "o'clock".
 */
export function stripCarrierTokens(text, tokens) {
  const carrier = new Set(tokens.map((token) => normalizeToken(token)));
  const kept = [];
  const removed = [];
  for (const word of String(text ?? "").split(/\s+/).filter(Boolean)) {
    (carrier.has(normalizeToken(word)) ? removed : kept).push(word);
  }
  return Object.freeze({ text: kept.join(" "), removed: Object.freeze(removed) });
}

function normalizeToken(token) {
  return String(token).toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}
