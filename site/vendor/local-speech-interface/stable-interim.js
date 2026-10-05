// SPDX-License-Identifier: MPL-2.0

const DEFAULT_DELAY_MS = 500;
const DEFAULT_HISTORY_LIMIT = 64;

function requireKey(value, name) {
  if (typeof value !== "string" || !value) throw new TypeError(`${name} must be a non-empty string`);
}

/**
 * Promotes a narrow, unchanged interim interpretation after a bounded delay.
 * The consumer chooses which candidates are safe; a later final result for
 * the same utterance can then be recognized as already handled.
 */
export class StableInterimCommitter {
  #delayMs;
  #historyLimit;
  #onCommit;
  #setTimer;
  #clearTimer;
  #pending = null;
  #committed = new Set();
  #committedOrder = [];

  constructor({
    delayMs = DEFAULT_DELAY_MS,
    historyLimit = DEFAULT_HISTORY_LIMIT,
    onCommit,
    setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimer = (timer) => globalThis.clearTimeout(timer),
  } = {}) {
    if (!Number.isFinite(delayMs) || delayMs < 0) throw new RangeError("delayMs must be a non-negative finite number");
    if (!Number.isInteger(historyLimit) || historyLimit < 1) throw new RangeError("historyLimit must be a positive integer");
    if (typeof onCommit !== "function") throw new TypeError("onCommit must be a function");
    if (typeof setTimer !== "function" || typeof clearTimer !== "function") throw new TypeError("timer functions are required");
    this.#delayMs = Math.round(delayMs);
    this.#historyLimit = historyLimit;
    this.#onCommit = onCommit;
    this.#setTimer = setTimer;
    this.#clearTimer = clearTimer;
  }

  consider({ utteranceKey, candidateKey, evidence, delayMs = this.#delayMs } = {}) {
    requireKey(utteranceKey, "utteranceKey");
    requireKey(candidateKey, "candidateKey");
    if (!Number.isFinite(delayMs) || delayMs < 0) throw new RangeError("delayMs must be a non-negative finite number");

    if (this.#pending?.utteranceKey === utteranceKey && this.#pending.candidateKey === candidateKey) {
      this.#pending.evidence = evidence;
      return false;
    }

    this.cancel();
    const pending = { utteranceKey, candidateKey, evidence, timer: null };
    pending.timer = this.#setTimer(() => {
      if (this.#pending !== pending) return;
      this.#pending = null;
      this.#rememberCommitted(utteranceKey);
      this.#onCommit(Object.freeze({ utteranceKey, candidateKey, evidence: pending.evidence }));
    }, Math.round(delayMs));
    this.#pending = pending;
    return true;
  }

  cancel(utteranceKey = null) {
    if (!this.#pending) return false;
    if (utteranceKey !== null && this.#pending.utteranceKey !== utteranceKey) return false;
    this.#clearTimer(this.#pending.timer);
    this.#pending = null;
    return true;
  }

  finalize(utteranceKey) {
    requireKey(utteranceKey, "utteranceKey");
    this.cancel(utteranceKey);
    return this.#committed.has(utteranceKey);
  }

  reset() {
    this.cancel();
    this.#committed.clear();
    this.#committedOrder = [];
  }

  #rememberCommitted(utteranceKey) {
    if (this.#committed.has(utteranceKey)) return;
    this.#committed.add(utteranceKey);
    this.#committedOrder.push(utteranceKey);
    while (this.#committedOrder.length > this.#historyLimit) {
      this.#committed.delete(this.#committedOrder.shift());
    }
  }
}
