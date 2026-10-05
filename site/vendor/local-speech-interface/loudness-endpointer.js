// SPDX-License-Identifier: MPL-2.0

/**
 * Loudness-only end-of-speech detection.
 *
 * Firefox's on-device recognizer exposes no usable end-of-speech boundary: its
 * soundstart/soundend pair comes from a generic audibility monitor that room
 * noise keeps open, and speechstart/speechend are not dispatched. This class
 * derives a boundary from frame loudness alone. It receives decibel levels,
 * never samples, so it cannot retain or reconstruct audio.
 */
export const DEFAULT_LOUDNESS_ENDPOINTING = Object.freeze({
  onsetDb: 12,
  offsetDb: 7,
  absoluteMinDb: -62,
  minSpeechMs: 80,
  tailMs: 300,
  initialFloorDb: -70,
  floorRiseDbPerSecond: 3,
  calibrationMs: 200,
  maxSpeechMs: 6000,
});

export class LoudnessEndpointer {
  #policy;
  #floorDb;
  #firstTimeMs = null;
  #calibration = [];
  #lastTimeMs = null;
  #onsetAtMs = null;
  #speechStartedAtMs = null;
  #lastLoudAtMs = null;

  constructor(policy = {}) {
    this.#policy = Object.freeze({ ...DEFAULT_LOUDNESS_ENDPOINTING, ...policy });
    for (const [name, value] of Object.entries(this.#policy)) {
      if (!Number.isFinite(value)) throw new RangeError(`${name} must be a finite number`);
    }
    if (this.#policy.tailMs < 0 || this.#policy.minSpeechMs < 0) throw new RangeError("durations must be non-negative");
    this.#floorDb = this.#policy.initialFloorDb;
  }

  get inSpeech() {
    return this.#speechStartedAtMs !== null;
  }

  get noiseFloorDb() {
    return this.#floorDb;
  }

  /** Feeds one loudness frame and returns the boundary events it completes. */
  push({ timeMs, levelDb }) {
    if (!Number.isFinite(timeMs)) throw new TypeError("timeMs must be finite");
    const level = Number.isFinite(levelDb) ? levelDb : -Infinity;
    const elapsedMs = this.#lastTimeMs === null ? 0 : Math.max(0, timeMs - this.#lastTimeMs);
    this.#lastTimeMs = timeMs;
    this.#firstTimeMs ??= timeMs;
    const { onsetDb, offsetDb, absoluteMinDb, minSpeechMs, tailMs, floorRiseDbPerSecond, calibrationMs, maxSpeechMs } = this.#policy;

    // Learn the room before listening for speech: average the first frames.
    if (timeMs - this.#firstTimeMs < calibrationMs) {
      if (Number.isFinite(level)) {
        this.#calibration.push(level);
        this.#floorDb = this.#calibration.reduce((sum, value) => sum + value, 0) / this.#calibration.length;
      }
      return [];
    }

    if (!this.inSpeech) {
      // Track the noise floor only outside speech: fall quickly, rise slowly.
      if (level < this.#floorDb) this.#floorDb = 0.7 * this.#floorDb + 0.3 * level;
      else this.#floorDb = Math.min(level, this.#floorDb + floorRiseDbPerSecond * elapsedMs / 1000);
      const onset = level > Math.max(this.#floorDb + onsetDb, absoluteMinDb);
      if (!onset) {
        this.#onsetAtMs = null;
        return [];
      }
      this.#onsetAtMs ??= timeMs;
      if (timeMs - this.#onsetAtMs < minSpeechMs) return [];
      this.#speechStartedAtMs = this.#onsetAtMs;
      this.#lastLoudAtMs = timeMs;
      this.#onsetAtMs = null;
      return [Object.freeze({ type: "speech-start", startedAtMs: this.#speechStartedAtMs, floorDb: round(this.#floorDb) })];
    }

    if (timeMs - this.#speechStartedAtMs > maxSpeechMs) {
      // Sustained "speech" this long means the room got louder. Re-learn the
      // floor from the present level; consumers ignore a recalibrated end.
      const startedAtMs = this.#speechStartedAtMs;
      this.#floorDb = Number.isFinite(level) ? level : this.#floorDb;
      this.#speechStartedAtMs = null;
      this.#lastLoudAtMs = null;
      return [Object.freeze({ type: "speech-end", reason: "recalibrated", startedAtMs, endedAtMs: timeMs, speechMs: Math.round(timeMs - startedAtMs), quietMs: 0, floorDb: round(this.#floorDb) })];
    }
    if (level > Math.max(this.#floorDb + offsetDb, absoluteMinDb - offsetDb)) {
      this.#lastLoudAtMs = timeMs;
      return [];
    }
    if (timeMs - this.#lastLoudAtMs < tailMs) return [];
    const event = Object.freeze({
      type: "speech-end",
      reason: "quiet-tail",
      startedAtMs: this.#speechStartedAtMs,
      endedAtMs: this.#lastLoudAtMs,
      speechMs: Math.round(this.#lastLoudAtMs - this.#speechStartedAtMs),
      quietMs: Math.round(timeMs - this.#lastLoudAtMs),
      floorDb: round(this.#floorDb),
    });
    this.#speechStartedAtMs = null;
    this.#lastLoudAtMs = null;
    return [event];
  }

  reset() {
    this.#floorDb = this.#policy.initialFloorDb;
    this.#firstTimeMs = null;
    this.#calibration = [];
    this.#lastTimeMs = null;
    this.#onsetAtMs = null;
    this.#speechStartedAtMs = null;
    this.#lastLoudAtMs = null;
  }
}

function round(value) {
  return Math.round(value * 10) / 10;
}

/** Root-mean-square level of one block of samples, in dBFS. */
export function levelDbfs(samples) {
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) sum += samples[index] * samples[index];
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}
