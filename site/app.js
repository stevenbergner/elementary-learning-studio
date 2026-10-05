import {
  LocalSpeechSession,
  StableInterimCommitter,
  createSpeechEvent,
  dispatchSpeechEvent,
} from "./vendor/local-speech-interface/index.js";
import {
  commandAwareInterimFlushDelay,
  commandPhraseHints,
  resolveVoiceIntent,
} from "./voice-intent.js";
import { CHILD_SUDOKU_PUZZLES, checkSudokuValues } from "./sudoku.js";

const SET_SIZE = 10;
const STORAGE_KEY = "elementary-learning-studio-progress-v2";
const OLD_STORAGE_KEY = "elementary-learning-studio-progress-v1";
const PROJECT_URL = "https://stevenbergner.github.io/elementary-learning-studio/";
const VOICE_ADVANCE_DELAY_MS = 450;
const VOICE_DEBUG_ENABLED_KEY = "els-voice-debug-enabled";
const VOICE_DEBUG_BACKGROUND_KEY = "els-voice-debug-background";
const LOCAL_DEVELOPER_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

const operations = {
  addition: {
    symbol: "+", name: "Addition", label: "Addition · facts to 20",
    make: () => ({ a: randomInt(1, 10), b: randomInt(1, 10) }),
    solve: (a, b) => a + b,
    hint(a, b) {
      if (a === b) return `You found a double. What is ${a} + ${a}?`;
      if (a + b >= 10) return "Can you move part of one number to make 10 first?";
      return `Start with ${Math.max(a, b)} and count on ${Math.min(a, b)} more.`;
    },
  },
  subtraction: {
    symbol: "−", name: "Subtraction", label: "Subtraction · facts to 18",
    make() { const b = randomInt(0, 9); return { a: randomInt(Math.max(9, b), 18), b }; },
    solve: (a, b) => a - b,
    hint: (a, b) => `Count up from ${b} to ${a}. How many steps did you take?`,
  },
  multiplication: {
    symbol: "×", name: "Multiplication", label: "Multiplication · factors 2 to 12",
    make: () => ({ a: randomInt(2, 12), b: randomInt(2, 12) }),
    solve: (a, b) => a * b,
    hint(a, b) {
      const friendly = [2, 5, 10].includes(a) ? a : ([2, 5, 10].includes(b) ? b : null);
      return friendly ? `Use the ${friendly}s pattern. What do you notice?` : `Build from a nearby fact you know, such as ${a} × ${Math.max(2, b - 1)}.`;
    },
  },
  division: {
    symbol: "÷", name: "Division", label: "Division · whole-number facts to 100",
    make() { const b = randomInt(2, 10); return { a: b * randomInt(2, 10), b }; },
    solve: (a, b) => a / b,
    hint: (a, b) => `What number times ${b} equals ${a}?`,
  },
};

let store = readStore();
let operation = "addition";
let questions = [];
let index = 0;
let firstTryCorrect = 0;
let readyForNext = false;
let setStartedAt = null;
let timerStartedAt = null;
let lastSessionId = null;
let speechSession = null;
let RecognitionConstructor = null;
let voiceActive = false;
let voiceStarting = false;
let voiceShouldRun = false;
let voiceAudioActive = false;
let voiceStartTimer = null;
let voiceAdvanceTimer = null;
let interimCommandCommitter = null;
let soundSinceStableCommit = true;
let speechEventSequence = 0;
let activeAnswerTarget = Object.freeze({ kind: "math" });
let sudokuPuzzleIndex = 0;
let sudokuValues = [];
const VOICE_TRACE_LIMIT = 40;
const VOICE_DIAGNOSTIC_LIMIT = 600;
let voiceDiagnosticEvents = [];
let voiceDiagnosticStartedAt = new Date().toISOString();

const elements = Object.fromEntries(Object.entries({
  answer: "#answer", form: "#answer-form", check: "#check-answer", hintButton: "#show-hint", hint: "#hint-text",
  feedback: "#feedback", a: "#operand-a", b: "#operand-b", operator: "#operator", setLabel: "#set-label",
  progressLabel: "#progress-label", progressBar: "#progress-bar", questionView: "#question-view", completeView: "#complete-view",
  result: "#result-summary", history: "#history-summary", learnerName: "#learner-name", knownLearners: "#known-learners",
  timingEnabled: "#timing-enabled", progressPanel: "#progress-panel", progressLearner: "#progress-learner",
  showTiming: "#show-timing", timingViewLabel: "#timing-view-label", statsGrid: "#stats-grid",
  operationStats: "#operation-stats", factList: "#fact-list", sessionList: "#session-list", legacyNote: "#legacy-note",
  voiceButton: "#voice-toggle", voicePanel: "#voice-panel", voiceLanguage: "#voice-language", voiceStatus: "#voice-status",
  voiceAutoCheck: "#voice-auto-check", voicePointerFollow: "#voice-pointer-follow",
  voiceAvailability: "#voice-availability", voicePrivacy: "#voice-privacy", voiceDownload: "#voice-download",
  voiceDownloadLabel: "#voice-download-label", voiceSignal: "#voice-signal", voiceSignalLabel: "#voice-signal-label",
  voiceSignalDetail: "#voice-signal-detail", voiceTarget: "#voice-target", voiceHeard: "#voice-heard", voiceDebug: "#voice-debug",
  voiceDebugEnabled: "#voice-debug-enabled", voiceDebugOutput: "#voice-debug-output", voiceDebugState: "#voice-debug-state",
  voiceDebugSummary: "#voice-debug-summary", voiceDebugExport: "#voice-debug-export",
  voiceDebugClear: "#voice-debug-clear", voiceTrace: "#voice-trace",
  voiceDebugBackground: "#voice-debug-background", voiceDebugBackgroundLabel: "#voice-debug-background-label",
  voiceDock: "#voice-dock", voiceDockStatus: "#voice-dock-status", voiceDockHeard: "#voice-dock-heard",
  voiceDockTarget: "#voice-dock-target", voiceDockStop: "#voice-dock-stop",
  sudokuGrid: "#sudoku-grid", sudokuFeedback: "#sudoku-feedback", sudokuCheck: "#sudoku-check",
  sudokuClear: "#sudoku-clear", sudokuNew: "#sudoku-new", sudokuLabel: "#sudoku-label",
}).map(([key, selector]) => [key, document.querySelector(selector)]));

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function makeId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function freshStore() { return { version: 2, profiles: [], sessions: [], lastProfileId: null, legacy: null }; }
function localDeveloperMode() { return LOCAL_DEVELOPER_HOSTS.has(location.hostname); }
function sessionPreference(key, fallback = false) {
  try {
    const stored = sessionStorage.getItem(key);
    return stored === null ? fallback : stored === "true";
  } catch (_) {
    return fallback;
  }
}
function rememberSessionPreference(key, value) {
  try { sessionStorage.setItem(key, String(Boolean(value))); } catch (_) { /* A private tab may deny storage. */ }
}

function sudokuCell(index) { return elements.sudokuGrid.querySelector(`[data-sudoku-index="${index}"]`); }

function setVoiceStatus(message) {
  elements.voiceStatus.textContent = message;
  elements.voiceDockStatus.textContent = message;
}

function setVoiceHeard(message) {
  elements.voiceHeard.textContent = message;
  elements.voiceDockHeard.textContent = message;
}

function setVoiceTarget(message) {
  elements.voiceTarget.textContent = message;
  elements.voiceDockTarget.textContent = message;
}

function showVoiceDock(show) {
  elements.voiceDock.hidden = !show;
  document.body.classList.toggle("has-voice-dock", show);
}

function setActiveAnswerTarget(target) {
  activeAnswerTarget = Object.freeze({ ...target });
  elements.sudokuGrid.querySelectorAll(".sudoku-cell").forEach((cell) => {
    const selected = target.kind === "sudoku" && Number(cell.dataset.sudokuIndex) === target.index;
    cell.classList.toggle("is-selected", selected);
    if (selected) cell.setAttribute("aria-current", "true");
    else cell.removeAttribute("aria-current");
  });
  setVoiceTarget(target.kind === "sudoku"
    ? `Current speech target: number grid, row ${Math.floor(target.index / 4) + 1}, column ${(target.index % 4) + 1}.`
    : target.kind === "math"
      ? "Current speech target: arithmetic answer."
      : "No active answer target. Select an exercise field or grid cell.");
}

function activateSudokuCell(index, { focus = false } = {}) {
  const puzzle = CHILD_SUDOKU_PUZZLES[sudokuPuzzleIndex];
  if (puzzle.puzzle[index]) {
    elements.sudokuFeedback.className = "sudoku-feedback";
    elements.sudokuFeedback.textContent = "That number is a fixed clue. Choose a blank cell.";
    return false;
  }
  setActiveAnswerTarget({ kind: "sudoku", index });
  if (focus) sudokuCell(index)?.focus({ preventScroll: true });
  elements.sudokuFeedback.className = "sudoku-feedback";
  elements.sudokuFeedback.textContent = `Row ${Math.floor(index / 4) + 1}, column ${(index % 4) + 1} is ready.`;
  return true;
}

function enterSudokuValue(value, source = "keyboard or touch") {
  let index = activeAnswerTarget.kind === "sudoku" ? activeAnswerTarget.index : -1;
  const puzzle = CHILD_SUDOKU_PUZZLES[sudokuPuzzleIndex];
  if (index < 0 || puzzle.puzzle[index]) {
    index = puzzle.puzzle.findIndex((given, candidate) => !given && !sudokuValues[candidate]);
    if (index < 0) index = puzzle.puzzle.findIndex((given) => !given);
    if (index < 0) return false;
    activateSudokuCell(index);
  }
  sudokuValues[index] = value;
  const cell = sudokuCell(index);
  cell.textContent = value ? String(value) : "";
  cell.classList.remove("is-wrong", "is-correct");
  cell.setAttribute("aria-label", `Row ${Math.floor(index / 4) + 1}, column ${(index % 4) + 1}${value ? `, ${value}` : ", blank"}`);
  elements.sudokuFeedback.className = "sudoku-feedback";
  elements.sudokuFeedback.textContent = value
    ? `${value} entered by ${source}. Keep thinking, or check the grid when ready.`
    : "The selected cell is blank again.";
  return true;
}

function checkSudoku() {
  const puzzle = CHILD_SUDOKU_PUZZLES[sudokuPuzzleIndex];
  const result = checkSudokuValues(sudokuValues, puzzle.solution);
  elements.sudokuGrid.querySelectorAll(".sudoku-cell").forEach((cell) => {
    const index = Number(cell.dataset.sudokuIndex);
    cell.classList.toggle("is-wrong", result.wrong.includes(index));
    cell.classList.toggle("is-correct", result.correct && !puzzle.puzzle[index]);
  });
  if (result.correct) {
    elements.sudokuFeedback.className = "sudoku-feedback success";
    elements.sudokuFeedback.textContent = "The whole grid works. Every row, column, and box has 1–4.";
  } else if (result.wrong.length) {
    elements.sudokuFeedback.className = "sudoku-feedback error";
    elements.sudokuFeedback.textContent = "Some entries need another look. The cells to revisit are highlighted.";
  } else {
    elements.sudokuFeedback.className = "sudoku-feedback";
    elements.sudokuFeedback.textContent = `${result.empty.length} blank ${result.empty.length === 1 ? "cell remains" : "cells remain"}.`;
  }
  return result;
}

function moveSudokuFocus(index, key) {
  const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 };
  if (!(key in offsets)) return false;
  const row = Math.floor(index / 4);
  const column = index % 4;
  const target = index + offsets[key];
  if (target < 0 || target >= 16) return true;
  if ((key === "ArrowLeft" || key === "ArrowRight") && Math.floor(target / 4) !== row) return true;
  if ((key === "ArrowUp" || key === "ArrowDown") && target % 4 !== column) return true;
  sudokuCell(target)?.focus({ preventScroll: true });
  return true;
}

function moveSudokuSelection(operation) {
  if (activeAnswerTarget.kind !== "sudoku") return false;
  const vectors = {
    "grid.up": [-1, 0], "grid.down": [1, 0], "grid.left": [0, -1], "grid.right": [0, 1],
  };
  const vector = vectors[operation];
  if (!vector) return false;
  const puzzle = CHILD_SUDOKU_PUZZLES[sudokuPuzzleIndex];
  let row = Math.floor(activeAnswerTarget.index / 4) + vector[0];
  let column = (activeAnswerTarget.index % 4) + vector[1];
  while (row >= 0 && row < 4 && column >= 0 && column < 4) {
    const candidate = row * 4 + column;
    if (!puzzle.puzzle[candidate]) return activateSudokuCell(candidate, { focus: true });
    row += vector[0];
    column += vector[1];
  }
  return false;
}

function renderSudoku(index = sudokuPuzzleIndex) {
  sudokuPuzzleIndex = (index + CHILD_SUDOKU_PUZZLES.length) % CHILD_SUDOKU_PUZZLES.length;
  const puzzle = CHILD_SUDOKU_PUZZLES[sudokuPuzzleIndex];
  sudokuValues = [...puzzle.puzzle];
  const cells = puzzle.puzzle.map((given, cellIndex) => {
    const row = Math.floor(cellIndex / 4);
    const column = cellIndex % 4;
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `sudoku-cell${given ? " is-given" : ""}`;
    cell.dataset.sudokuIndex = String(cellIndex);
    cell.dataset.row = String(row);
    cell.dataset.column = String(column);
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-readonly", String(Boolean(given)));
    cell.setAttribute("aria-label", `Row ${row + 1}, column ${column + 1}${given ? `, fixed ${given}` : ", blank"}`);
    cell.textContent = given ? String(given) : "";
    cell.addEventListener("focus", () => { if (!given) activateSudokuCell(cellIndex); });
    cell.addEventListener("click", () => activateSudokuCell(cellIndex));
    cell.addEventListener("pointerenter", (event) => {
      if (!given && event.pointerType === "mouse" && elements.voicePointerFollow.checked) activateSudokuCell(cellIndex);
    });
    cell.addEventListener("keydown", (event) => {
      if (moveSudokuFocus(cellIndex, event.key)) return event.preventDefault();
      if (!given && /^[1-4]$/.test(event.key)) { event.preventDefault(); enterSudokuValue(Number(event.key)); }
      if (!given && ["Backspace", "Delete", "0"].includes(event.key)) { event.preventDefault(); enterSudokuValue(0); }
    });
    return cell;
  });
  elements.sudokuGrid.replaceChildren(...cells);
  elements.sudokuLabel.textContent = `Easy grid ${sudokuPuzzleIndex + 1} of ${CHILD_SUDOKU_PUZZLES.length}`;
  elements.sudokuFeedback.className = "sudoku-feedback";
  elements.sudokuFeedback.textContent = "Select a blank cell to begin.";
}

function readStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed?.version === 2 && Array.isArray(parsed.profiles) && Array.isArray(parsed.sessions)) return parsed;
  } catch (_) { /* Practice works even if local storage is unavailable. */ }
  const migrated = freshStore();
  try {
    const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY));
    if (old && Number.isInteger(old.sets) && Number.isInteger(old.problems) && old.sets >= 0) migrated.legacy = { sets: old.sets, problems: old.problems };
  } catch (_) { /* Ignore an invalid older summary. */ }
  return migrated;
}

function writeStore() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (_) { /* Storage is optional. */ }
}

function cleanName(value) { return value.trim().replace(/\s+/g, " ").slice(0, 40); }
function findProfileByName(name) {
  const folded = cleanName(name).toLocaleLowerCase();
  return store.profiles.find((profile) => profile.name.toLocaleLowerCase() === folded) || null;
}

function ensureProfile(value = elements.learnerName.value) {
  const name = cleanName(value) || "Learner";
  let profile = findProfileByName(name);
  if (!profile) {
    profile = { id: makeId(), name, createdAt: new Date().toISOString() };
    store.profiles.push(profile);
  }
  store.lastProfileId = profile.id;
  elements.learnerName.value = profile.name;
  writeStore();
  renderLearnerChoices();
  renderHistory();
  return profile;
}

function selectedProfile() { return findProfileByName(elements.learnerName.value); }

function renderLearnerChoices() {
  const sorted = store.profiles.slice().sort((a, b) => a.name.localeCompare(b.name));
  elements.knownLearners.replaceChildren(...sorted.map((profile) => new Option(profile.name, profile.name)));
  const previous = elements.progressLearner.value || store.lastProfileId || "all";
  elements.progressLearner.replaceChildren(new Option("All learners", "all"), ...sorted.map((profile) => new Option(profile.name, profile.id)));
  elements.progressLearner.value = [...elements.progressLearner.options].some((option) => option.value === previous) ? previous : "all";
}

function makeSet(kind) {
  const seen = new Set();
  const set = [];
  while (set.length < SET_SIZE) {
    const item = operations[kind].make();
    const key = `${item.a}:${item.b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    set.push({ ...item, answer: operations[kind].solve(item.a, item.b), wrongAttempts: 0, hintUsed: false });
  }
  return set;
}

function currentQuestion() { return questions[index]; }

function startSet(kind = operation) {
  clearTimeout(voiceAdvanceTimer);
  operation = kind;
  questions = makeSet(operation);
  index = 0;
  firstTryCorrect = 0;
  readyForNext = false;
  lastSessionId = null;
  setStartedAt = new Date();
  timerStartedAt = elements.timingEnabled.checked ? performance.now() : null;
  elements.completeView.hidden = true;
  elements.questionView.hidden = false;
  document.querySelectorAll("[data-confidence]").forEach((item) => item.classList.remove("is-selected"));
  document.querySelectorAll(".operation").forEach((button) => {
    const selected = button.dataset.operation === operation;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  renderQuestion();
}

function renderQuestion() {
  clearTimeout(voiceAdvanceTimer);
  setActiveAnswerTarget({ kind: "math" });
  const question = currentQuestion();
  const focusOwner = document.activeElement;
  elements.a.textContent = question.a;
  elements.b.textContent = question.b;
  elements.operator.textContent = operations[operation].symbol;
  elements.setLabel.textContent = operations[operation].label;
  elements.progressLabel.textContent = `${index + 1} of ${SET_SIZE}`;
  elements.progressBar.style.width = `${((index + 1) / SET_SIZE) * 100}%`;
  elements.answer.value = "";
  elements.answer.disabled = false;
  elements.answer.className = "";
  elements.feedback.className = "feedback";
  elements.feedback.textContent = "Take your time. You can press Enter to check.";
  elements.hint.textContent = "";
  elements.check.textContent = "Check my answer";
  elements.hintButton.hidden = false;
  readyForNext = false;
  window.setTimeout(() => {
    if (activeAnswerTarget.kind === "math"
      && (document.activeElement === focusOwner || document.activeElement === document.body)) {
      elements.answer.focus({ preventScroll: true });
    }
  }, 60);
}

function checkAnswer() {
  if (readyForNext) return nextQuestion();
  const raw = elements.answer.value.trim();
  if (!/^\d+$/.test(raw)) {
    elements.feedback.className = "feedback error";
    elements.feedback.textContent = "Enter a whole number so I can check it.";
    elements.answer.focus();
    return;
  }
  const question = currentQuestion();
  if (Number(raw) === question.answer) {
    if (question.wrongAttempts === 0 && !question.hintUsed) firstTryCorrect += 1;
    elements.answer.className = "is-correct";
    elements.answer.disabled = true;
    elements.feedback.className = "feedback success";
    elements.feedback.textContent = encouragingMessage();
    elements.check.textContent = index === SET_SIZE - 1 ? "Finish this set" : "Next question";
    elements.hintButton.hidden = true;
    elements.hint.textContent = "";
    readyForNext = true;
    elements.check.focus();
  } else {
    question.wrongAttempts += 1;
    elements.answer.className = "is-wrong";
    elements.feedback.className = "feedback error";
    elements.feedback.textContent = "Not yet. Try a different strategy.";
    window.setTimeout(() => { elements.answer.className = ""; }, 430);
    elements.answer.select();
  }
}

function nextQuestion() {
  clearTimeout(voiceAdvanceTimer);
  index < SET_SIZE - 1 ? (index += 1, renderQuestion()) : finishSet();
}

function finishSet() {
  setActiveAnswerTarget({ kind: "none" });
  const profile = ensureProfile();
  const items = questions.map((question) => ({
    a: question.a, b: question.b, answer: question.answer,
    firstTryCorrect: question.wrongAttempts === 0 && !question.hintUsed,
    wrongAttempts: question.wrongAttempts, hintUsed: question.hintUsed,
  }));
  const session = {
    id: makeId(), profileId: profile.id, learner: profile.name, operation,
    startedAt: setStartedAt.toISOString(), completedAt: new Date().toISOString(),
    durationMs: elements.timingEnabled.checked && timerStartedAt !== null ? Math.max(0, Math.round(performance.now() - timerStartedAt)) : null,
    questionCount: SET_SIZE, firstTryCorrect,
    mistakeCount: items.reduce((sum, item) => sum + item.wrongAttempts, 0),
    hintCount: items.filter((item) => item.hintUsed).length,
    confidence: null, items,
  };
  store.sessions.push(session);
  lastSessionId = session.id;
  writeStore();
  renderHistory();
  elements.questionView.hidden = true;
  elements.completeView.hidden = false;
  const retryQuestions = SET_SIZE - firstTryCorrect;
  elements.result.textContent = retryQuestions === 0
    ? `You solved all ${SET_SIZE} on the first try. What strategy helped most?`
    : `You solved all ${SET_SIZE}. ${firstTryCorrect} were right on the first try, and you stayed with ${retryQuestions} that needed another look.`;
  document.querySelector("#new-set").focus();
}

function encouragingMessage() {
  const messages = ["Yes—that relationship works.", "Correct. Notice what your strategy did.", "You checked it carefully. Nice work.", "That’s it. Keep the pattern in mind."];
  return messages[Math.floor(Math.random() * messages.length)];
}

function sessionsForSelection() {
  return elements.progressLearner.value === "all" ? store.sessions : store.sessions.filter((session) => session.profileId === elements.progressLearner.value);
}
function formatPercent(value, total) { return total ? `${Math.round((value / total) * 100)}%` : "—"; }
function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "—";
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
}
function formatDate(iso) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)); }
function cell(text, className = "") {
  const td = document.createElement("td"); td.textContent = text; if (className) td.className = className; return td;
}

function renderHistory() {
  const profile = selectedProfile();
  const sessions = profile ? store.sessions.filter((session) => session.profileId === profile.id) : store.sessions;
  const problems = sessions.reduce((sum, session) => sum + session.questionCount, 0);
  elements.history.textContent = sessions.length
    ? `${sessions.length} ${sessions.length === 1 ? "set" : "sets"} · ${problems} problems`
    : (store.legacy?.sets ? `${store.legacy.sets} earlier sets · details unavailable` : "No completed sets yet");
}

function renderProgress() {
  const sessions = sessionsForSelection();
  document.querySelector("#clear-learner").disabled = elements.progressLearner.value === "all";
  const problems = sessions.reduce((sum, session) => sum + session.questionCount, 0);
  const correct = sessions.reduce((sum, session) => sum + session.firstTryCorrect, 0);
  const mistakes = sessions.reduce((sum, session) => sum + session.mistakeCount, 0);
  const hints = sessions.reduce((sum, session) => sum + session.hintCount, 0);
  const timed = sessions.some((session) => Number.isFinite(session.durationMs));
  elements.timingViewLabel.hidden = !timed;
  if (!timed) elements.showTiming.checked = false;
  document.querySelectorAll(".timing-column").forEach((item) => { item.hidden = !elements.showTiming.checked; });

  const cards = [["Completed sets", sessions.length], ["Problems", problems], ["First-try accuracy", formatPercent(correct, problems)], ["Retries · hints", `${mistakes} · ${hints}`]];
  elements.statsGrid.replaceChildren(...cards.map(([label, value]) => {
    const article = document.createElement("article");
    const strong = document.createElement("strong"); strong.textContent = value;
    const span = document.createElement("span"); span.textContent = label;
    article.append(strong, span); return article;
  }));

  elements.operationStats.replaceChildren(...Object.entries(operations).map(([kind, config]) => {
    const matching = sessions.filter((session) => session.operation === kind);
    const count = matching.reduce((sum, session) => sum + session.questionCount, 0);
    const first = matching.reduce((sum, session) => sum + session.firstTryCorrect, 0);
    const retried = matching.reduce((sum, session) => sum + session.mistakeCount, 0);
    const timedSessions = matching.filter((session) => Number.isFinite(session.durationMs));
    const trend = timedSessions.length ? `${formatDuration(timedSessions[0].durationMs)} → ${formatDuration(timedSessions.at(-1).durationMs)}` : "—";
    const row = document.createElement("tr");
    const timing = cell(trend, "timing-column"); timing.hidden = !elements.showTiming.checked;
    row.append(cell(config.name), cell(matching.length), cell(formatPercent(first, count)), cell(retried), timing);
    return row;
  }));

  const facts = new Map();
  sessions.forEach((session) => (session.items || []).forEach((item) => {
    if (!item.wrongAttempts && !item.hintUsed) return;
    const key = `${session.operation}:${item.a}:${item.b}`;
    const fact = facts.get(key) || { operation: session.operation, a: item.a, b: item.b, retries: 0, hints: 0, occasions: 0 };
    fact.retries += item.wrongAttempts; fact.hints += Number(item.hintUsed); fact.occasions += 1; facts.set(key, fact);
  }));
  const top = [...facts.values()].sort((a, b) => b.occasions + b.retries - a.occasions - a.retries).slice(0, 6);
  if (!top.length) {
    const empty = document.createElement("p"); empty.className = "empty-state";
    empty.textContent = sessions.length ? "No facts need a return visit yet." : "Complete a set to see gentle review suggestions.";
    elements.factList.replaceChildren(empty);
  } else {
    elements.factList.replaceChildren(...top.map((fact) => {
      const item = document.createElement("div"); item.className = "fact-chip";
      const strong = document.createElement("strong"); strong.textContent = `${fact.a} ${operations[fact.operation].symbol} ${fact.b}`;
      const span = document.createElement("span"); span.textContent = `${fact.retries} ${fact.retries === 1 ? "retry" : "retries"} · ${fact.hints} ${fact.hints === 1 ? "hint" : "hints"}`;
      item.append(strong, span); return item;
    }));
  }

  const recent = sessions.slice().reverse().slice(0, 20);
  elements.sessionList.replaceChildren(...(recent.length ? recent.map((session) => {
    const row = document.createElement("tr");
    const timing = cell(formatDuration(session.durationMs), "timing-column"); timing.hidden = !elements.showTiming.checked;
    row.append(cell(formatDate(session.completedAt)), cell(session.learner), cell(operations[session.operation]?.name || session.operation), cell(`${session.firstTryCorrect}/${session.questionCount}`), cell(session.mistakeCount), cell(session.confidence ? `${session.confidence}/5` : "—"), timing);
    return row;
  }) : (() => { const row = document.createElement("tr"); const message = cell("No recorded sessions for this view."); message.colSpan = 7; row.append(message); return [row]; })()));

  elements.legacyNote.hidden = !store.legacy?.sets;
  if (store.legacy?.sets) elements.legacyNote.textContent = `${store.legacy.sets} earlier ${store.legacy.sets === 1 ? "set was" : "sets were"} preserved as an aggregate from the previous tracker. Learner, operation, and timing details were not recorded then.`;
}

function openProgress() {
  const profile = selectedProfile();
  renderLearnerChoices();
  if (profile) elements.progressLearner.value = profile.id;
  renderProgress();
  elements.progressPanel.hidden = false;
  elements.progressPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelector("#close-progress").focus({ preventScroll: true });
}
function closeProgress() { elements.progressPanel.hidden = true; document.querySelector("#view-progress").focus({ preventScroll: true }); }

function download(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csvValue(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function exportCsv() {
  const rows = [["session_id", "learner", "completed_at", "operation", "questions", "first_try_correct", "wrong_attempts", "hints", "confidence_1_to_5", "duration_seconds"]];
  sessionsForSelection().forEach((session) => rows.push([session.id, session.learner, session.completedAt, session.operation, session.questionCount, session.firstTryCorrect, session.mistakeCount, session.hintCount, session.confidence ?? "", Number.isFinite(session.durationMs) ? (session.durationMs / 1000).toFixed(1) : ""]));
  download(rows.map((row) => row.map(csvValue).join(",")).join("\n"), "elementary-learning-progress.csv", "text/csv;charset=utf-8");
}
function isoDuration(ms) { return `PT${Math.max(0, ms / 1000).toFixed(3).replace(/\.000$/, "")}S`; }
function exportXapi() {
  const statements = sessionsForSelection().map((session) => {
    const result = {
      score: { raw: session.firstTryCorrect, min: 0, max: session.questionCount, scaled: session.firstTryCorrect / session.questionCount },
      success: session.firstTryCorrect / session.questionCount >= 0.8, completion: true,
      extensions: {
        [`${PROJECT_URL}extensions/wrong-attempts`]: session.mistakeCount,
        [`${PROJECT_URL}extensions/hints-used`]: session.hintCount,
        [`${PROJECT_URL}extensions/question-results`]: session.items,
      },
    };
    if (session.confidence) result.extensions[`${PROJECT_URL}extensions/confidence`] = session.confidence;
    if (Number.isFinite(session.durationMs)) result.duration = isoDuration(session.durationMs);
    return {
      id: session.id,
      actor: { objectType: "Agent", name: session.learner, account: { homePage: PROJECT_URL, name: session.profileId } },
      verb: { id: "http://adlnet.gov/expapi/verbs/completed", display: { "en-US": "completed" } },
      object: { objectType: "Activity", id: `${PROJECT_URL}activities/${session.operation}`, definition: { name: { "en-US": operations[session.operation].label }, type: `${PROJECT_URL}activity-types/arithmetic-practice` } },
      result, context: { platform: "Elementary Learning Studio", language: "en" }, timestamp: session.completedAt,
    };
  });
  download(JSON.stringify(statements, null, 2), "elementary-learning-xapi.json", "application/json");
}

function escapeXml(value) { return String(value).replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char]); }
function safeFilename(value) { return cleanName(value).toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "learner"; }
function downloadAward() {
  const session = store.sessions.find((item) => item.id === lastSessionId);
  if (!session) return;
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(session.completedAt));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="850" viewBox="0 0 1200 850"><title>Practice award for ${escapeXml(session.learner)}</title><rect width="1200" height="850" fill="#f8f3e8"/><rect x="46" y="46" width="1108" height="758" rx="38" fill="#fffdf8" stroke="#0c746d" stroke-width="8"/><circle cx="600" cy="180" r="76" fill="#e1a52b"/><text x="600" y="205" text-anchor="middle" font-size="72" fill="#18343b">✦</text><text x="600" y="310" text-anchor="middle" font-family="Georgia,serif" font-size="38" fill="#0c746d">PRACTICE AWARD</text><text x="600" y="405" text-anchor="middle" font-family="Georgia,serif" font-size="76" font-weight="bold" fill="#18343b">${escapeXml(session.learner)}</text><text x="600" y="485" text-anchor="middle" font-family="system-ui,sans-serif" font-size="32" fill="#5e706e">completed a ${escapeXml(operations[session.operation].name.toLowerCase())} set</text><text x="600" y="555" text-anchor="middle" font-family="system-ui,sans-serif" font-size="42" font-weight="bold" fill="#18343b">${session.firstTryCorrect} of ${session.questionCount} first try</text><text x="600" y="635" text-anchor="middle" font-family="system-ui,sans-serif" font-size="26" fill="#5e706e">${escapeXml(date)}</text><path d="M280 700 H920" stroke="#d6cbb8" stroke-width="2"/><text x="600" y="750" text-anchor="middle" font-family="system-ui,sans-serif" font-size="20" fill="#5e706e">Personal practice celebration — not a graded or verified credential</text></svg>`;
  download(svg, `${safeFilename(session.learner)}-practice-award.svg`, "image/svg+xml;charset=utf-8");
}

function summarizeVoiceDiagnostics() {
  const utterances = new Map();
  let decoderFlushes = 0;
  let recognitionRestarts = 0;
  let acceptedActions = 0;
  let rejectedActions = 0;
  let errors = 0;

  voiceDiagnosticEvents.forEach((event) => {
    const lifecycle = event.payload?.lifecycle;
    if (lifecycle?.utterance > 0) {
      const key = `${lifecycle.recognitionCycle}:${lifecycle.utterance}`;
      if (!utterances.has(key)) utterances.set(key, { started: false, ended: false, interims: 0, finals: 0 });
      const utterance = utterances.get(key);
      if (["sound-started", "speech-started"].includes(event.payload.state)) utterance.started = true;
      if (["sound-ended", "speech-ended"].includes(event.payload.state)) utterance.ended = true;
      if (event.type === "recognition.interim") {
        utterance.started = true;
        utterance.interims += 1;
      }
      if (event.type === "recognition.final") {
        utterance.started = true;
        utterance.ended = true;
        utterance.finals += 1;
      }
    }
    if (event.payload?.state === "finalizing") decoderFlushes += 1;
    if (event.payload?.state === "recognition-ended" && event.payload.willRestart) recognitionRestarts += 1;
    if (event.type === "action.accepted") acceptedActions += 1;
    if (event.type === "action.rejected") rejectedActions += 1;
    if (event.type === "recognition.error") errors += 1;
  });

  const observed = [...utterances.values()].filter(({ started }) => started);
  return {
    events: voiceDiagnosticEvents.length,
    speechBursts: observed.length,
    finalTexts: observed.filter(({ finals }) => finals > 0).length,
    noText: observed.filter(({ ended, interims, finals }) => ended && interims === 0 && finals === 0).length,
    interimOnly: observed.filter(({ ended, interims, finals }) => ended && interims > 0 && finals === 0).length,
    acceptedActions,
    rejectedActions,
    decoderFlushes,
    recognitionRestarts,
    errors,
  };
}

function updateVoiceDiagnosticSummary() {
  const summary = summarizeVoiceDiagnostics();
  elements.voiceDebugState.textContent = `${summary.events} event${summary.events === 1 ? "" : "s"} in memory.`;
  elements.voiceDebugSummary.textContent = summary.speechBursts
    ? `${summary.speechBursts} speech burst${summary.speechBursts === 1 ? "" : "s"} · ${summary.finalTexts} final text · ${summary.noText} with no text · ${summary.interimOnly} interim-only · ${summary.acceptedActions} accepted · ${summary.rejectedActions} rejected · ${summary.decoderFlushes} decoder flushes · ${summary.recognitionRestarts} restarts · ${summary.errors} errors`
    : "No utterances observed yet. Start voice and speak normally; no audio will be recorded.";
  elements.voiceDebugExport.disabled = voiceDiagnosticEvents.length === 0;
}

function recordVoiceDiagnostic(event) {
  if (!elements.voiceDebugEnabled?.checked) return;
  voiceDiagnosticEvents.push(event);
  if (voiceDiagnosticEvents.length > VOICE_DIAGNOSTIC_LIMIT) voiceDiagnosticEvents.shift();
  updateVoiceDiagnosticSummary();
}

function clearVoiceDiagnostics() {
  voiceDiagnosticEvents = [];
  voiceDiagnosticStartedAt = new Date().toISOString();
  elements.voiceTrace.replaceChildren();
  updateVoiceDiagnosticSummary();
}

function exportVoiceDiagnostics() {
  const createdAt = new Date().toISOString();
  const build = new URL(location.href).searchParams.get("build") || "unlabeled";
  const bundle = {
    schema: "elementary-learning-studio/speech-diagnostic-v1",
    startedAt: voiceDiagnosticStartedAt,
    createdAt,
    build,
    environment: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      recognitionLanguage: elements.voiceLanguage.value,
      localDeveloperMode: localDeveloperMode(),
      retainBackgroundCapture: localDeveloperMode() && elements.voiceDebugBackground.checked,
      requestedCommandHints: commandPhraseHints(elements.voiceLanguage.value).length,
    },
    privacy: {
      rawAudioRecorded: false,
      uploaded: false,
      retention: "memory-until-explicit-local-download",
    },
    summary: summarizeVoiceDiagnostics(),
    events: voiceDiagnosticEvents,
  };
  const stamp = createdAt.replace(/[:.]/gu, "-");
  download(JSON.stringify(bundle, null, 2), `els-speech-diagnostic-${stamp}.json`, "application/json;charset=utf-8");
}

function emitSpeechInterfaceEvent(type, payload = {}, adapter = "elementary-learning-studio") {
  const event = createSpeechEvent({
    sequence: speechEventSequence++, type, adapter,
    locale: elements.voiceLanguage?.value || "und",
    audioSource: "microphone", localProcessing: "verified", payload,
  });
  recordVoiceDiagnostic(event);
  dispatchSpeechEvent(window, event);
  return event;
}

function setVoiceSignal(state, label, detail) {
  if (!elements.voiceSignal) return;
  elements.voiceSignal.dataset.state = state;
  elements.voiceDock.dataset.state = state;
  elements.voiceSignalLabel.textContent = label;
  elements.voiceSignalDetail.textContent = detail;
}

function formatConfidence(confidence) {
  return Number.isFinite(confidence) && confidence > 0 ? `${Math.round(confidence * 100)}% confidence` : "confidence not reported";
}

function formatVoiceTiming(timing = {}) {
  const parts = [];
  if (Number.isFinite(timing.sinceSpeechStartMs)) parts.push(`result ${timing.sinceSpeechStartMs} ms after speech began`);
  if (Number.isFinite(timing.sinceSpeechEndMs)) parts.push(`result ${timing.sinceSpeechEndMs} ms after speech ended`);
  if (Number.isFinite(timing.adaptiveFlushMs)) {
    const baseline = timing.baselineAdaptiveFlushMs;
    parts.push(Number.isFinite(baseline) && baseline !== timing.adaptiveFlushMs
      ? `quiet fallback ${timing.adaptiveFlushMs} ms (baseline ${baseline} ms)`
      : `quiet fallback ${timing.adaptiveFlushMs} ms`);
  }
  if (Number.isFinite(timing.intentParseMs)) parts.push(`intent match ${timing.intentParseMs.toFixed(1)} ms`);
  if (Number.isFinite(timing.captureGapMs)) parts.push(`recognizer restart gap ${timing.captureGapMs} ms`);
  if (Number.isFinite(timing.startDelayMs)) parts.push(`capture start ${timing.startDelayMs} ms`);
  if (Number.isFinite(timing.guiFrameMs)) parts.push(`GUI frame ${timing.guiFrameMs.toFixed(1)} ms`);
  if (Number.isFinite(timing.policyDelayMs)) parts.push(`intentional feedback pause ${timing.policyDelayMs} ms`);
  if (timing.finalization) parts.push(timing.finalization);
  return parts.join(" · ");
}

function addVoiceTrace({ kind, transcript = "", alternatives = [], action = "", timing = null }) {
  if (!elements.voiceDebugEnabled?.checked) return;
  const item = document.createElement("li");
  item.dataset.kind = kind;
  const heading = document.createElement("strong");
  const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  heading.textContent = `${timestamp} · ${kind}`;
  item.append(heading);

  const raw = document.createElement("span");
  raw.textContent = transcript ? `browser text: “${transcript}”` : "browser text: none";
  item.append(raw);

  if (alternatives.length) {
    const choices = document.createElement("span");
    choices.textContent = `alternatives: ${alternatives.map((choice) => `“${choice.text}” (${formatConfidence(choice.confidence)})`).join(" · ")}`;
    item.append(choices);
  }

  if (action) {
    const interpreted = document.createElement("span");
    interpreted.textContent = `studio action: ${action}`;
    item.append(interpreted);
  }

  const timingText = timing ? formatVoiceTiming(timing) : "";
  if (timingText) {
    const measured = document.createElement("span");
    measured.textContent = `timing: ${timingText}`;
    item.append(measured);
  }

  elements.voiceTrace.append(item);
  while (elements.voiceTrace.children.length > VOICE_TRACE_LIMIT) elements.voiceTrace.firstElementChild.remove();
  updateVoiceDiagnosticSummary();
  item.scrollIntoView({ block: "nearest" });
}

function advanceQuestionFromVoice(status = "Voice command: next question.", policyDelayMs = 0) {
  const renderStartedAt = performance.now();
  nextQuestion();
  setVoiceStatus(status);
  requestAnimationFrame(() => addVoiceTrace({
    kind: "render",
    action: "next question painted",
    timing: { guiFrameMs: performance.now() - renderStartedAt, policyDelayMs },
  }));
}

function scheduleVoiceAdvance() {
  clearTimeout(voiceAdvanceTimer);
  const finishing = index === SET_SIZE - 1;
  setVoiceStatus(finishing
    ? "Correct. Completing this practice set…"
    : "Correct. Moving to the next question…");
  voiceAdvanceTimer = setTimeout(
    () => advanceQuestionFromVoice("Correct. Next question.", VOICE_ADVANCE_DELAY_MS),
    VOICE_ADVANCE_DELAY_MS,
  );
}

function voiceIntentContext() {
  const targetingSudoku = activeAnswerTarget.kind === "sudoku";
  return {
    answerEnabled: targetingSudoku || !elements.answer.disabled,
    answerPresent: !targetingSudoku && /^\d+$/.test(elements.answer.value.trim()),
    readyForNext: !targetingSudoku && readyForNext,
    gridNavigationAvailable: targetingSudoku,
    locale: elements.voiceLanguage.value,
    autoCheck: !targetingSudoku && elements.voiceAutoCheck.checked,
    skipPolicy: "unavailable",
  };
}

function handleVoice(transcript, alternatives = [], recognitionTiming = {}, recognitionLifecycle = null, traceKind = "final") {
  const intentStartedAt = performance.now();
  const targetingSudoku = activeAnswerTarget.kind === "sudoku";
  const emitDecision = (type, payload = {}) => emitSpeechInterfaceEvent(type, {
    ...payload,
    ...(recognitionLifecycle ? { lifecycle: recognitionLifecycle } : {}),
  });
  const interpretation = resolveVoiceIntent(
    { transcript, alternatives },
    voiceIntentContext(),
  );
  const intentParseMs = performance.now() - intentStartedAt;
  emitDecision("intent.proposed", { interpretation });
  const alternativeNote = interpretation.match?.selection === "alternative"
    ? `; matched alternative “${interpretation.match.text}”`
    : "";
  const trailingEvidence = interpretation.semantic?.evidence?.find((item) => item.matchMode === "suffix");
  const trailingNote = trailingEvidence ? `; used trailing answer “${trailingEvidence.normalized}”` : "";
  setVoiceHeard(`Browser text: “${transcript}”${alternativeNote}${trailingNote} → ${interpretation.action}.`);
  addVoiceTrace({
    kind: traceKind, transcript, alternatives,
    action: `${interpretation.action}${alternativeNote}${trailingNote}`,
    timing: { ...recognitionTiming, intentParseMs },
  });

  if (!interpretation.permitted && ["number", "command"].includes(interpretation.kind)) {
    emitDecision("action.rejected", { action: interpretation.action, reason: interpretation.permission });
    setVoiceStatus(interpretation.permission === "question-incomplete"
      ? "I recognized “next,” but this question needs an entered answer first."
      : interpretation.permission === "skip-unavailable"
        ? "I recognized “skip,” but this practice set has no skip policy. Nothing was counted or changed."
      : interpretation.permission === "grid-target-unavailable"
        ? "Select a blank number-grid cell before using direction words."
        : "I recognized that input, but the answer field is not available right now.");
    return interpretation;
  }

  if (interpretation.intent === "grid-move") {
    const moved = interpretation.operations.filter((operation) => moveSudokuSelection(operation)).length;
    emitDecision("action.accepted", { action: interpretation.action, operations: interpretation.operations, moved });
    setVoiceStatus(moved
      ? `Moved the number-grid target ${moved} ${moved === 1 ? "step" : "steps"}.`
      : "The number-grid target is already at that boundary.");
    return interpretation;
  }

  if (interpretation.action === "stop voice input") {
    emitDecision("action.accepted", { action: interpretation.action });
    return stopVoice("Voice input stopped by spoken command.");
  }
  if (interpretation.action === "check the current answer") {
    if (targetingSudoku) {
      const result = checkSudoku();
      setVoiceStatus(result.correct
        ? "Voice command: the number grid is complete and correct."
        : "Voice command: the number grid was checked; keep thinking.");
      emitDecision("action.accepted", { action: "check the number grid", correct: result.correct });
      return interpretation;
    }
    if (!readyForNext) checkAnswer();
    emitDecision("action.accepted", { action: interpretation.action, correct: readyForNext });
    setVoiceStatus(readyForNext
      ? "Correct. Say “next question” or “next” when you want to continue."
      : "I checked the entered answer. Keep thinking and try again.");
    return interpretation;
  }
  if (interpretation.action === "move to the next question") {
    emitDecision("action.accepted", { action: interpretation.action });
    advanceQuestionFromVoice();
    return interpretation;
  }
  if (interpretation.action === "check the current answer and move if correct") {
    checkAnswer();
    emitDecision("action.accepted", { action: interpretation.action, correct: readyForNext });
    if (readyForNext) advanceQuestionFromVoice("Correct. Next question.");
    else setVoiceStatus("I checked the entered answer. It is not correct yet, so this question stays here.");
    return interpretation;
  }
  if (interpretation.kind === "number") {
    if (targetingSudoku) {
      if (interpretation.value < 1 || interpretation.value > 4) {
        emitDecision("action.rejected", { action: interpretation.action, reason: "outside-active-domain", allowedValues: [1, 2, 3, 4] });
        setVoiceStatus("That number was recognized, but this grid accepts only 1, 2, 3, or 4.");
        elements.sudokuFeedback.className = "sudoku-feedback error";
        elements.sudokuFeedback.textContent = "This small grid uses only the numbers 1–4.";
        return { ...interpretation, permitted: false, permission: "outside-active-domain" };
      }
      enterSudokuValue(interpretation.value, "voice");
      emitDecision("action.accepted", {
        action: `enter ${interpretation.value} in number-grid cell`,
        value: interpretation.value,
        row: Math.floor(activeAnswerTarget.index / 4) + 1,
        column: (activeAnswerTarget.index % 4) + 1,
        checked: false,
      });
      setVoiceStatus(`${interpretation.value} entered in the highlighted number-grid cell.`);
      return interpretation;
    }
    elements.answer.value = String(interpretation.value);
    elements.answer.focus();
    if (!interpretation.checkImmediately) {
      emitDecision("action.accepted", { action: interpretation.action, value: interpretation.value, checked: false });
      setVoiceStatus(`${interpretation.value} entered. Say “check” or “done” when you are ready.`);
      return interpretation;
    }
    checkAnswer();
    emitDecision("action.accepted", { action: interpretation.action, value: interpretation.value, correct: readyForNext });
    if (readyForNext) scheduleVoiceAdvance();
    else setVoiceStatus(`${interpretation.value} was checked. Try another answer.`);
    return interpretation;
  }
  const reason = interpretation.kind === "ambiguous" ? "recognition alternatives conflict" : "no safe intent matched";
  emitDecision("action.rejected", { action: interpretation.action, reason });
  setVoiceStatus(interpretation.kind === "ambiguous"
    ? "I heard more than one possible number or command. Please say it again."
    : "I did not match that to a number or an available command.");
  return interpretation;
}

function speechUtteranceKey(payload = {}) {
  const lifecycle = payload.lifecycle;
  return lifecycle?.recognitionCycle > 0 && lifecycle?.utterance > 0
    ? `${lifecycle.recognitionCycle}:${lifecycle.utterance}`
    : null;
}

function createInterimCommandCommitter() {
  return new StableInterimCommitter({
    delayMs: 500,
    onCommit: ({ evidence }) => {
      if (!voiceShouldRun || !evidence) return;
      soundSinceStableCommit = false;
      setVoiceSignal("processing", "Acting on a stable command", "Firefox supplied an exact command as interim text but did not finalize it in time.");
      handleVoice(
        evidence.transcript,
        evidence.alternatives,
        { ...evidence.timing, finalization: "stable-interim-commit" },
        evidence.lifecycle,
        "stable interim commit",
      );
    },
  });
}
function supportsLocalSpeech() {
  return speechSession
    && typeof RecognitionConstructor?.available === "function"
    && typeof RecognitionConstructor?.install === "function";
}

function handleSpeechSessionEvent(event) {
  const { type, payload } = event;
  if (type === "recognition.error" && payload.code === "aborted" && !voiceShouldRun) return;
  emitSpeechInterfaceEvent(type, payload, event.source.adapter);

  if (type === "audio.state" && payload.state === "capturing") {
    const resumedAfterUtterance = voiceActive;
    clearTimeout(voiceStartTimer);
    voiceStarting = false;
    voiceActive = true;
    voiceAudioActive = true;
    elements.voiceButton.textContent = "Stop voice input";
    elements.voiceButton.setAttribute("aria-pressed", "true");
    elements.voiceButton.setAttribute("aria-busy", "false");
    if (!resumedAfterUtterance) setVoiceStatus("Listening locally. Speak a number or one of the supported commands.");
    const resumedQuickly = Number.isFinite(payload.timing?.captureGapMs);
    setVoiceSignal("listening", "Microphone active", resumedQuickly
      ? `Firefox resumed capture after a ${payload.timing.captureGapMs} ms recognition restart gap.`
      : "Firefox has confirmed that audio capture started.");
    addVoiceTrace({ kind: "audio start", action: "browser began microphone capture", timing: payload.timing });
    return;
  }

  if (type === "audio.state" && payload.state === "finalizing") {
    setVoiceSignal("processing", "Completing the last word", "Firefox has not finalized this utterance yet, so the local adapter is draining its decoder tail.");
    addVoiceTrace({
      kind: "decoder flush",
      action: `graceful finalization: ${payload.reason}`,
      timing: payload.timing,
    });
    return;
  }

  if (type === "audio.state" && payload.state === "paused") {
    voiceAudioActive = false;
    if (voiceShouldRun) {
      setVoiceSignal("processing", "Completing the last word", "The local speech layer is finalizing this utterance before listening again.");
    }
    addVoiceTrace({ kind: "audio end", action: "local speech segment finalized" });
    return;
  }

  if (type === "audio.state") {
    if (payload.state === "speech-started" || payload.state === "sound-started") soundSinceStableCommit = true;
    if (payload.state === "speech-started") {
      setVoiceSignal("hearing", "Speech detected", "Firefox reported the beginning of a speech burst.");
    } else if (payload.state === "speech-ended") {
      setVoiceSignal("processing", "Speech ended", "Waiting for Firefox to provide final text.");
    } else if (payload.state === "no-match") {
      setVoiceStatus("Firefox heard a sound but returned no words. Try the answer in a short phrase, or use keyboard or touch.");
    }
    const phraseHints = payload.state === "recognition-started"
      ? payload.recognizer?.contextualBiasing
      : null;
    const phraseEvidence = phraseHints?.requestedPhrases
      ? ` · ${phraseHints.requestedPhrases} command hints ${phraseHints.applied ? "applied" : "requested but unsupported"}`
      : "";
    addVoiceTrace({
      kind: "lifecycle",
      action: `${payload.state} · cycle ${payload.lifecycle?.recognitionCycle ?? "?"} · utterance ${payload.lifecycle?.utterance ?? "?"}${phraseEvidence}`,
      timing: payload.timing,
    });
    return;
  }

  if (type === "recognition.interim") {
    setVoiceHeard(payload.transcript ? `Hearing: “${payload.transcript}”…` : "Hearing speech…");
    const preview = resolveVoiceIntent(
      { transcript: payload.transcript, alternatives: payload.alternatives },
      voiceIntentContext(),
    );
    const commandPreview = preview.kind === "command";
    const utteranceKey = speechUtteranceKey(payload);
    const stableCandidate = commandPreview && payload.timing?.flushPolicy === "consumer-selected" && utteranceKey;
    if (stableCandidate) {
      interimCommandCommitter?.consider({
        utteranceKey,
        candidateKey: preview.semantic.canonicalKey,
        evidence: payload,
        delayMs: payload.timing.adaptiveFlushMs,
      });
    } else if (utteranceKey) {
      interimCommandCommitter?.cancel(utteranceKey);
    }
    setVoiceSignal("hearing", commandPreview ? `Heard “${payload.transcript}”` : "Speech detected", commandPreview
      ? `Holding the exact command for ${payload.timing.adaptiveFlushMs} ms to ensure the phrase has ended.`
      : "Interim text is arriving from the local recognizer.");
    addVoiceTrace({
      kind: "interim", transcript: payload.transcript, alternatives: payload.alternatives,
      action: commandPreview
        ? `commit if the command remains unchanged for ${payload.timing.adaptiveFlushMs} ms`
        : `wait up to ${payload.timing.adaptiveFlushMs} ms for the utterance boundary`,
      timing: payload.timing,
    });
    return;
  }

  if (type === "recognition.final") {
    const utteranceKey = speechUtteranceKey(payload);
    if (utteranceKey && interimCommandCommitter?.finalize(utteranceKey)) {
      setVoiceHeard(`Browser final text: “${payload.transcript}” · action already taken from the stable interim command.`);
      addVoiceTrace({
        kind: "final", transcript: payload.transcript, alternatives: payload.alternatives,
        action: "duplicate action suppressed after stable interim commit",
        timing: payload.timing,
      });
      return;
    }
    // Firefox may drain a short word under a new utterance number after the
    // adapter's sound-end flush. Compare by canonical command meaning so the
    // provisional candidate and its final cannot both act.
    const finalPreview = resolveVoiceIntent(
      { transcript: payload.transcript, alternatives: payload.alternatives },
      voiceIntentContext(),
    );
    const finalKey = finalPreview.kind === "command" ? finalPreview.semantic?.canonicalKey : null;
    if (finalKey && interimCommandCommitter) {
      const last = interimCommandCommitter.lastCommitted;
      if (!soundSinceStableCommit && last?.candidateKey === finalKey) {
        setVoiceHeard(`Browser final text: “${payload.transcript}” · action already taken from the stable interim command.`);
        addVoiceTrace({
          kind: "final", transcript: payload.transcript, alternatives: payload.alternatives,
          action: "duplicate action suppressed: same command drained after stable interim commit",
          timing: payload.timing,
        });
        return;
      }
      if (interimCommandCommitter.supersede(finalKey)) {
        addVoiceTrace({ kind: "final", action: "pending stable interim command superseded by browser final", timing: payload.timing });
      }
    }
    setVoiceSignal("processing", "Processing recognized words", "Matching the final local text to the studio’s small command set.");
    handleVoice(payload.transcript, payload.alternatives, payload.timing, payload.lifecycle);
    return;
  }

  if (type === "recognition.error") {
    addVoiceTrace({ kind: "error", action: voiceErrorMessage(payload.code) });
    if (payload.code === "no-speech" && voiceShouldRun) {
      setVoiceStatus(voiceErrorMessage(payload.code));
      return;
    }
    stopVoice(voiceErrorMessage(payload.code));
    setVoiceSignal("error", "Voice input error", voiceErrorMessage(payload.code));
  }
}

function createSpeechSession() {
  try {
    interimCommandCommitter?.reset();
    soundSinceStableCommit = true;
    interimCommandCommitter = createInterimCommandCommitter();
    speechSession = new LocalSpeechSession({
      locale: elements.voiceLanguage.value,
      Recognition: RecognitionConstructor,
      phrases: commandPhraseHints(elements.voiceLanguage.value),
      interimFlushDelay: (evidence) => commandAwareInterimFlushDelay(evidence, voiceIntentContext()),
    });
    speechSession.addEventListener("speech", ({ detail }) => handleSpeechSessionEvent(detail));
    return true;
  } catch (_) {
    speechSession = null;
    return false;
  }
}

function showVoiceDownload(show, language = elements.voiceLanguage.value) {
  elements.voiceDownload.hidden = !show;
  if (show) {
    const label = elements.voiceLanguage.options[elements.voiceLanguage.selectedIndex].text;
    elements.voiceDownloadLabel.textContent = `The browser is downloading its ${label} language pack. It does not report a percentage.`;
    elements.voiceDownload.dataset.language = language;
  }
}

async function prepareVoice() {
  if (!supportsLocalSpeech()) return false;
  const language = elements.voiceLanguage.value;

  let status;
  try {
    status = await RecognitionConstructor.available({
      langs: [language],
      processLocally: true,
      quality: "command",
    });
  } catch (_) {
    elements.voiceAvailability.textContent = "Private local speech unavailable";
    stopVoice("This browser could not confirm on-device recognition. Voice remains off to protect privacy.");
    return false;
  }

  if (status === "available") {
    await speechSession.prepare();
    elements.voiceAvailability.textContent = "Private on-device speech ready";
    elements.voicePrivacy.textContent = "Microphone audio is processed on this device. The studio receives text, does not record audio, and does not send the text or audio anywhere.";
    return true;
  }

  if (status === "downloadable" || status === "downloading") {
    showVoiceDownload(true);
    elements.voiceButton.textContent = "Cancel setup";
    setVoiceStatus("Waiting for the browser’s local language pack…");
    const installed = await RecognitionConstructor.install({
      langs: [language],
      processLocally: true,
      quality: "command",
    });
    showVoiceDownload(false);
    if (!voiceShouldRun) return;
    if (installed) {
      await speechSession.prepare();
      elements.voiceAvailability.textContent = "Private on-device speech ready";
      elements.voicePrivacy.textContent = "Microphone audio is processed on this device. The studio receives text, does not record audio, and does not send the text or audio anywhere.";
      setVoiceStatus("Local language pack ready. Starting the microphone…");
      return true;
    }
    elements.voiceAvailability.textContent = "Private local speech unavailable";
    stopVoice("The local language pack was not installed. Voice remains off; this studio never falls back to an online speech service.");
    return false;
  }

  elements.voiceAvailability.textContent = "Private local speech unavailable";
  stopVoice("The selected language is not available for on-device recognition. Voice remains off; keyboard and touch still work.");
  return false;
}

function beginRecognition() {
  if (!speechSession || !voiceShouldRun) return;
  voiceStarting = true;
  voiceAudioActive = false;
  elements.voiceButton.disabled = false;
  elements.voiceButton.textContent = "Cancel voice start";
  elements.voiceButton.setAttribute("aria-busy", "true");
  setVoiceStatus("Waiting for the browser to start listening…");
  setVoiceSignal("preparing", "Starting local speech", "The browser has not confirmed microphone capture yet.");
  clearTimeout(voiceStartTimer);
  voiceStartTimer = setTimeout(() => {
    if (!voiceActive && voiceShouldRun) {
      stopVoice("Voice input did not start. This browser may show the API without providing a working speech service.");
    }
  }, 7000);
  try {
    speechSession.start();
  } catch (_) {
    stopVoice("Voice input could not start in this browser.");
  }
}

async function startVoice() {
  if (!RecognitionConstructor || voiceActive || voiceStarting) return;
  if (!createSpeechSession()) {
    stopVoice("This browser could not initialize verified local speech. Keyboard and touch still work.");
    return;
  }
  voiceShouldRun = true;
  voiceStarting = true;
  showVoiceDock(true);
  elements.voiceButton.textContent = "Cancel voice start";
  elements.voiceButton.setAttribute("aria-busy", "true");
  setVoiceStatus("Preparing the browser’s speech interface…");
  setVoiceHeard("Waiting for browser text…");
  setVoiceSignal("preparing", "Preparing local speech", "Checking the on-device language pack before opening the microphone.");
  try {
    const localReady = await prepareVoice();
    if (!localReady || !voiceShouldRun) return;
    beginRecognition();
  } catch (_) {
    stopVoice("The browser could not prepare voice input. Keyboard and touch still work.");
  }
}

function voiceErrorMessage(error) {
  const messages = {
    "not-allowed": "Microphone permission was not granted. Voice input is off.",
    "service-not-allowed": "The browser’s speech service is unavailable or blocked.",
    "audio-capture": "The browser could not access a microphone.",
    "language-not-supported": "This browser does not support the selected speech language.",
    network: "The browser’s speech service could not connect.",
    "no-speech": "I did not hear speech. Voice input is still available; try again.",
  };
  return messages[error] || `Voice input stopped (${error}).`;
}

function setupVoice() {
  RecognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!RecognitionConstructor) {
    elements.voiceAvailability.textContent = "Unavailable in this browser";
    setVoiceStatus("This browser does not provide speech recognition to web pages. Keyboard and touch remain available.");
    elements.voiceButton.textContent = "Voice unavailable";
    elements.voiceButton.disabled = true;
    elements.voiceLanguage.disabled = true;
    return;
  }

  if (!createSpeechSession()) {
    elements.voiceAvailability.textContent = "Unavailable in this browser";
    setVoiceStatus("This browser exposes a speech interface but could not initialize it. Keyboard and touch remain available.");
    elements.voiceButton.textContent = "Voice unavailable";
    elements.voiceButton.disabled = true;
    elements.voiceLanguage.disabled = true;
    return;
  }
  if (!supportsLocalSpeech()) {
    speechSession = null;
    elements.voiceAvailability.textContent = "Private local speech unavailable";
    setVoiceStatus("This browser does not expose verified on-device speech recognition. Online recognition is intentionally disabled.");
    elements.voiceButton.textContent = "Local voice unavailable";
    elements.voiceButton.disabled = true;
    elements.voiceLanguage.disabled = true;
    return;
  }
  elements.voiceButton.disabled = false;
  elements.voiceLanguage.disabled = false;
  elements.voiceAvailability.textContent = "On-device speech · checked before listening";
  setVoiceStatus("Optional local voice is ready when you choose it.");
  setVoiceSignal("off", "Microphone off", "No audio is being captured.");
}

function stopVoice(message = "Voice input is off.", { finalizePending = false } = {}) {
  clearTimeout(voiceStartTimer);
  clearTimeout(voiceAdvanceTimer);
  voiceShouldRun = false;
  voiceStarting = false;
  voiceActive = false;
  voiceAudioActive = false;
  interimCommandCommitter?.reset();
  showVoiceDownload(false);
  if (elements.voiceButton) {
    elements.voiceButton.textContent = speechSession ? "Start optional voice" : "Voice unavailable";
    elements.voiceButton.setAttribute("aria-pressed", "false");
    elements.voiceButton.setAttribute("aria-busy", "false");
    elements.voiceButton.disabled = !speechSession;
  }
  if (elements.voiceStatus) setVoiceStatus(message);
  setVoiceSignal("off", "Microphone off", "No audio is being captured.");
  showVoiceDock(false);
  if (speechSession) {
    try { speechSession.stop({ finalizePending }); } catch (_) { /* It was already stopped. */ }
  }
}

elements.form.addEventListener("submit", (event) => { event.preventDefault(); checkAnswer(); });
elements.answer.addEventListener("focus", () => setActiveAnswerTarget({ kind: "math" }));
elements.hintButton.addEventListener("click", () => {
  const question = currentQuestion(); elements.hint.textContent = operations[operation].hint(question.a, question.b); question.hintUsed = true; elements.answer.focus();
});
document.querySelectorAll(".operation").forEach((button) => button.addEventListener("click", () => startSet(button.dataset.operation)));
document.querySelector("#new-set").addEventListener("click", () => startSet());
document.querySelector("#view-progress").addEventListener("click", openProgress);
document.querySelector("#open-progress").addEventListener("click", openProgress);
document.querySelector("#close-progress").addEventListener("click", closeProgress);
elements.progressLearner.addEventListener("change", renderProgress);
elements.showTiming.addEventListener("change", renderProgress);
elements.timingEnabled.addEventListener("change", () => { timerStartedAt = elements.timingEnabled.checked ? performance.now() : null; });
elements.learnerName.addEventListener("change", () => { if (cleanName(elements.learnerName.value)) ensureProfile(); renderHistory(); });
document.querySelectorAll("[data-confidence]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("[data-confidence]").forEach((item) => item.classList.remove("is-selected")); button.classList.add("is-selected");
  const session = store.sessions.find((item) => item.id === lastSessionId); if (session) { session.confidence = Number(button.dataset.confidence); writeStore(); }
}));
document.querySelector("#export-csv").addEventListener("click", exportCsv);
document.querySelector("#export-xapi").addEventListener("click", exportXapi);
document.querySelector("#download-award").addEventListener("click", downloadAward);
document.querySelector("#clear-learner").addEventListener("click", () => {
  const id = elements.progressLearner.value; if (id === "all") return;
  const profile = store.profiles.find((item) => item.id === id);
  if (!profile || !confirm(`Clear all locally stored sessions for ${profile.name}?`)) return;
  const clearingCurrentProfile = selectedProfile()?.id === id;
  store.sessions = store.sessions.filter((session) => session.profileId !== id); store.profiles = store.profiles.filter((item) => item.id !== id);
  if (store.lastProfileId === id) store.lastProfileId = null;
  if (clearingCurrentProfile) elements.learnerName.value = "";
  writeStore(); renderLearnerChoices(); renderHistory(); renderProgress();
});
document.querySelector("#clear-all").addEventListener("click", () => {
  if (!confirm("Clear every learner and session stored by this studio on this device?")) return;
  store = freshStore(); elements.learnerName.value = "";
  try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(OLD_STORAGE_KEY); } catch (_) { /* Storage is optional. */ }
  renderLearnerChoices(); renderHistory(); renderProgress();
});
elements.voiceButton.addEventListener("click", () => (voiceActive || voiceStarting) ? stopVoice() : startVoice());
elements.voiceDockStop.addEventListener("click", () => stopVoice("Optional voice input stopped."));
elements.voiceLanguage.addEventListener("change", () => {
  if (voiceActive || voiceStarting) stopVoice("Language changed. Start optional voice again when ready.");
  if (speechSession) setVoiceStatus("Language changed. Optional local voice is ready when you choose it.");
});
elements.voiceDebugEnabled.addEventListener("change", () => {
  rememberSessionPreference(VOICE_DEBUG_ENABLED_KEY, elements.voiceDebugEnabled.checked);
  elements.voiceDebugOutput.hidden = !elements.voiceDebugEnabled.checked;
  updateVoiceDiagnosticSummary();
});
elements.voiceDebugBackground.addEventListener("change", () => {
  rememberSessionPreference(VOICE_DEBUG_BACKGROUND_KEY, elements.voiceDebugBackground.checked);
});
elements.voiceDebugExport.addEventListener("click", exportVoiceDiagnostics);
elements.voiceDebugClear.addEventListener("click", clearVoiceDiagnostics);
document.querySelectorAll("[data-sudoku-value]").forEach((button) => button.addEventListener("click", () => {
  enterSudokuValue(Number(button.dataset.sudokuValue), "touch control");
}));
elements.sudokuCheck.addEventListener("click", checkSudoku);
elements.sudokuClear.addEventListener("click", () => {
  const selected = activeAnswerTarget.kind === "sudoku" ? activeAnswerTarget.index : null;
  renderSudoku(sudokuPuzzleIndex);
  if (selected !== null && !CHILD_SUDOKU_PUZZLES[sudokuPuzzleIndex].puzzle[selected]) activateSudokuCell(selected, { focus: true });
});
elements.sudokuNew.addEventListener("click", () => {
  renderSudoku(sudokuPuzzleIndex + 1);
  const firstBlank = CHILD_SUDOKU_PUZZLES[sudokuPuzzleIndex].puzzle.findIndex((value) => !value);
  activateSudokuCell(firstBlank, { focus: true });
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (localDeveloperMode() && elements.voiceDebugBackground.checked) {
      emitSpeechInterfaceEvent("audio.state", {
        state: "background-capture-retained",
        reason: "explicit-local-developer-preference",
      });
      addVoiceTrace({ kind: "lifecycle", action: "local developer mode retained background capture" });
      return;
    }
    stopVoice("Voice input stopped when the page was hidden; finishing the words already heard.", { finalizePending: true });
  }
});
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));

const previousProfile = store.profiles.find((profile) => profile.id === store.lastProfileId);
if (previousProfile) elements.learnerName.value = previousProfile.name;
elements.voiceDebugEnabled.checked = sessionPreference(VOICE_DEBUG_ENABLED_KEY, localDeveloperMode());
elements.voiceDebugBackgroundLabel.hidden = !localDeveloperMode();
elements.voiceDebugBackground.checked = localDeveloperMode()
  && sessionPreference(VOICE_DEBUG_BACKGROUND_KEY, false);
elements.voiceDebugOutput.hidden = !elements.voiceDebugEnabled.checked;
updateVoiceDiagnosticSummary();
renderLearnerChoices(); renderHistory(); renderSudoku(); setupVoice(); startSet();
