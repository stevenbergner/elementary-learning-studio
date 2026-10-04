const SET_SIZE = 10;
const STORAGE_KEY = "elementary-learning-studio-progress-v2";
const OLD_STORAGE_KEY = "elementary-learning-studio-progress-v1";
const PROJECT_URL = "https://stevenbergner.github.io/elementary-learning-studio/";
const SPEECH_PROTOCOL = "local-speech-interface/v0.1";
const SPEECH_EVENT_NAME = "local-speech-interface:event";
const VOICE_ADVANCE_DELAY_MS = 850;

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
let recognition = null;
let RecognitionConstructor = null;
let voiceActive = false;
let voiceStarting = false;
let voiceShouldRun = false;
let voiceAudioActive = false;
let voiceStartTimer = null;
let voiceAdvanceTimer = null;
let speechEventSequence = 0;
const VOICE_TRACE_LIMIT = 40;

const elements = Object.fromEntries(Object.entries({
  answer: "#answer", form: "#answer-form", check: "#check-answer", hintButton: "#show-hint", hint: "#hint-text",
  feedback: "#feedback", a: "#operand-a", b: "#operand-b", operator: "#operator", setLabel: "#set-label",
  progressLabel: "#progress-label", progressBar: "#progress-bar", questionView: "#question-view", completeView: "#complete-view",
  result: "#result-summary", history: "#history-summary", learnerName: "#learner-name", knownLearners: "#known-learners",
  timingEnabled: "#timing-enabled", progressPanel: "#progress-panel", progressLearner: "#progress-learner",
  showTiming: "#show-timing", timingViewLabel: "#timing-view-label", statsGrid: "#stats-grid",
  operationStats: "#operation-stats", factList: "#fact-list", sessionList: "#session-list", legacyNote: "#legacy-note",
  voiceButton: "#voice-toggle", voicePanel: "#voice-panel", voiceLanguage: "#voice-language", voiceStatus: "#voice-status",
  voiceAvailability: "#voice-availability", voicePrivacy: "#voice-privacy", voiceDownload: "#voice-download",
  voiceDownloadLabel: "#voice-download-label", voiceSignal: "#voice-signal", voiceSignalLabel: "#voice-signal-label",
  voiceSignalDetail: "#voice-signal-detail", voiceHeard: "#voice-heard", voiceDebug: "#voice-debug",
  voiceDebugEnabled: "#voice-debug-enabled", voiceDebugOutput: "#voice-debug-output", voiceDebugState: "#voice-debug-state",
  voiceDebugClear: "#voice-debug-clear", voiceTrace: "#voice-trace",
}).map(([key, selector]) => [key, document.querySelector(selector)]));

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function makeId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function freshStore() { return { version: 2, profiles: [], sessions: [], lastProfileId: null, legacy: null }; }

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
  if (voiceActive || voiceStarting || voiceShouldRun) stopVoice("Voice input is off.");
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
    if (document.activeElement === focusOwner || document.activeElement === document.body) {
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
  if (voiceActive || voiceStarting || voiceShouldRun) stopVoice("Voice input stopped because the set is complete.");
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

const smallEnglish = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const englishTens = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const smallFrench = {
  zéro: 0, zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
};
const frenchTens = { vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 };
const smallGerman = {
  null: 0, ein: 1, eins: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9,
  zehn: 10, elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19,
};
const germanTens = { zwanzig: 20, dreißig: 30, dreissig: 30, vierzig: 40, fünfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90 };
const smallVietnamese = {
  "không": 0, "một": 1, "mốt": 1, hai: 2, ba: 3, "bốn": 4, "tư": 4, "năm": 5, "lăm": 5,
  "sáu": 6, "bảy": 7, "tám": 8, "chín": 9,
};

function normalizeSpeechText(value) {
  return value.toLocaleLowerCase().trim().replace(/[.,!?;:]/gu, "").replace(/[‐‑‒–—-]/gu, " ").replace(/\s+/g, " ");
}

function parseEnglish(tokens) {
  if (tokens.length === 1 && Object.hasOwn(smallEnglish, tokens[0])) return smallEnglish[tokens[0]];
  const hundredAt = tokens.indexOf("hundred");
  if (hundredAt >= 0) {
    const prefix = tokens.slice(0, hundredAt).filter((token) => token !== "and");
    const hundreds = prefix.length ? parseEnglish(prefix) : 1;
    const rest = tokens.slice(hundredAt + 1).filter((token) => token !== "and");
    const remainder = rest.length ? parseEnglish(rest) : 0;
    return hundreds !== null && remainder !== null ? hundreds * 100 + remainder : null;
  }
  const words = tokens.filter((token) => token !== "and");
  if (words.length === 1 && Object.hasOwn(englishTens, words[0])) return englishTens[words[0]];
  if (words.length === 2 && Object.hasOwn(englishTens, words[0]) && Object.hasOwn(smallEnglish, words[1]) && smallEnglish[words[1]] < 10) {
    return englishTens[words[0]] + smallEnglish[words[1]];
  }
  return null;
}

function parseFrenchUnderHundred(tokens) {
  const words = tokens.filter((token) => token !== "et");
  if (words.length === 1 && Object.hasOwn(smallFrench, words[0])) return smallFrench[words[0]];
  if (words.length === 1 && Object.hasOwn(frenchTens, words[0])) return frenchTens[words[0]];
  if (words[0] === "quatre" && words[1] === "vingt") {
    const remainder = words.length === 2 ? 0 : parseFrenchUnderHundred(words.slice(2));
    return remainder !== null && remainder < 20 ? 80 + remainder : null;
  }
  if (words[0] === "soixante" && words.length > 1) {
    const remainder = parseFrenchUnderHundred(words.slice(1));
    return remainder !== null && remainder < 20 ? 60 + remainder : null;
  }
  if (Object.hasOwn(frenchTens, words[0]) && words.length === 2 && Object.hasOwn(smallFrench, words[1]) && smallFrench[words[1]] < 10) {
    return frenchTens[words[0]] + smallFrench[words[1]];
  }
  if (words[0] === "dix" && words.length === 2 && Object.hasOwn(smallFrench, words[1]) && smallFrench[words[1]] < 10) {
    return 10 + smallFrench[words[1]];
  }
  return null;
}

function parseFrench(tokens) {
  const hundredAt = tokens.findIndex((token) => token === "cent" || token === "cents");
  if (hundredAt >= 0) {
    const prefix = tokens.slice(0, hundredAt);
    const hundreds = prefix.length ? parseFrenchUnderHundred(prefix) : 1;
    const rest = tokens.slice(hundredAt + 1);
    const remainder = rest.length ? parseFrenchUnderHundred(rest) : 0;
    return hundreds !== null && remainder !== null ? hundreds * 100 + remainder : null;
  }
  return parseFrenchUnderHundred(tokens);
}

function parseGermanCompact(compact) {
  if (Object.hasOwn(smallGerman, compact)) return smallGerman[compact];
  if (Object.hasOwn(germanTens, compact)) return germanTens[compact];
  const hundredAt = compact.indexOf("hundert");
  if (hundredAt >= 0) {
    const prefix = compact.slice(0, hundredAt);
    const rest = compact.slice(hundredAt + "hundert".length);
    const hundreds = prefix ? parseGermanCompact(prefix) : 1;
    const remainder = rest ? parseGermanCompact(rest) : 0;
    return hundreds !== null && remainder !== null ? hundreds * 100 + remainder : null;
  }
  for (const [tensWord, tens] of Object.entries(germanTens)) {
    if (!compact.endsWith(tensWord)) continue;
    const unitWord = compact.slice(0, -tensWord.length).replace(/und$/, "");
    const unit = smallGerman[unitWord];
    if (Number.isInteger(unit) && unit > 0 && unit < 10 && compact.includes("und")) return tens + unit;
  }
  return null;
}

function parseVietnameseUnderHundred(tokens) {
  if (tokens.length === 1 && Object.hasOwn(smallVietnamese, tokens[0])) return smallVietnamese[tokens[0]];
  if (tokens[0] === "mười") {
    if (tokens.length === 1) return 10;
    return tokens.length === 2 && Object.hasOwn(smallVietnamese, tokens[1]) ? 10 + smallVietnamese[tokens[1]] : null;
  }
  const tens = smallVietnamese[tokens[0]];
  if (Number.isInteger(tens) && tens > 0 && tokens[1] === "mươi") {
    if (tokens.length === 2) return tens * 10;
    return tokens.length === 3 && Object.hasOwn(smallVietnamese, tokens[2]) ? tens * 10 + smallVietnamese[tokens[2]] : null;
  }
  return null;
}

function parseVietnamese(tokens) {
  const hundredAt = tokens.indexOf("trăm");
  if (hundredAt >= 0) {
    const hundreds = parseVietnameseUnderHundred(tokens.slice(0, hundredAt));
    const rest = tokens.slice(hundredAt + 1).filter((token) => token !== "lẻ" && token !== "linh");
    const remainder = rest.length ? parseVietnameseUnderHundred(rest) : 0;
    return hundreds !== null && remainder !== null ? hundreds * 100 + remainder : null;
  }
  return parseVietnameseUnderHundred(tokens);
}

function spokenNumber(transcript) {
  const normalized = normalizeSpeechText(transcript);
  if (/^\d{1,3}$/.test(normalized)) return Number(normalized);
  const tokens = normalized.split(" ");
  const parsers = [parseEnglish(tokens), parseFrench(tokens), parseGermanCompact(tokens.join("")), parseVietnamese(tokens)];
  const match = parsers.find((value) => Number.isInteger(value) && value >= 0 && value <= 999);
  return match ?? null;
}

function emitSpeechInterfaceEvent(type, payload = {}) {
  const event = {
    protocol: SPEECH_PROTOCOL,
    id: makeId(),
    sequence: speechEventSequence++,
    type,
    timestamp: new Date().toISOString(),
    source: {
      adapter: "firefox-web-speech",
      locale: elements.voiceLanguage?.value || "und",
      audioSource: "microphone",
      localProcessing: "verified",
    },
    payload: structuredClone(payload),
    privacy: { networkUsed: false, retention: "memory" },
  };
  window.dispatchEvent(new CustomEvent(SPEECH_EVENT_NAME, { detail: event }));
  return event;
}

function setVoiceSignal(state, label, detail) {
  if (!elements.voiceSignal) return;
  elements.voiceSignal.dataset.state = state;
  elements.voiceSignalLabel.textContent = label;
  elements.voiceSignalDetail.textContent = detail;
}

function formatConfidence(confidence) {
  return Number.isFinite(confidence) && confidence > 0 ? `${Math.round(confidence * 100)}% confidence` : "confidence not reported";
}

function addVoiceTrace({ kind, transcript = "", alternatives = [], action = "" }) {
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
    choices.textContent = `alternatives: ${alternatives.map((choice) => `“${choice.transcript}” (${formatConfidence(choice.confidence)})`).join(" · ")}`;
    item.append(choices);
  }

  if (action) {
    const interpreted = document.createElement("span");
    interpreted.textContent = `studio action: ${action}`;
    item.append(interpreted);
  }

  elements.voiceTrace.append(item);
  while (elements.voiceTrace.children.length > VOICE_TRACE_LIMIT) elements.voiceTrace.firstElementChild.remove();
  elements.voiceDebugState.textContent = `${elements.voiceTrace.children.length} event${elements.voiceTrace.children.length === 1 ? "" : "s"} in memory.`;
  item.scrollIntoView({ block: "nearest" });
}

function interpretVoice(transcript) {
  const phrase = normalizeSpeechText(transcript);
  if (["stop", "arrête", "arrete", "stopp", "dừng"].includes(phrase)) return { kind: "command", action: "stop voice input" };
  if (["check", "enter", "vérifie", "verifie", "prüfen", "pruefen", "kiểm tra"].includes(phrase)) return { kind: "command", action: "check the current answer" };
  if (["next", "suivant", "weiter", "tiếp theo"].includes(phrase)) {
    return readyForNext
      ? { kind: "command", action: "move to the next question" }
      : { kind: "command", action: "do not move yet; the current question is not complete" };
  }
  const number = spokenNumber(phrase);
  if (number !== null && !elements.answer.disabled) return { kind: "number", value: number, action: `enter and check ${number}` };
  return { kind: "unmatched", action: "none; no number or available command matched" };
}

function scheduleVoiceAdvance() {
  clearTimeout(voiceAdvanceTimer);
  const finishing = index === SET_SIZE - 1;
  elements.voiceStatus.textContent = finishing
    ? "Correct. Completing this practice set…"
    : "Correct. Moving to the next question…";
  voiceAdvanceTimer = setTimeout(nextQuestion, VOICE_ADVANCE_DELAY_MS);
}

function handleVoice(transcript, alternatives = []) {
  const interpretation = interpretVoice(transcript);
  emitSpeechInterfaceEvent("recognition.final", {
    transcript,
    alternatives: alternatives.map((choice) => ({ text: choice.transcript, confidence: choice.confidence })),
  });
  emitSpeechInterfaceEvent("intent.proposed", { interpretation });
  elements.voiceHeard.textContent = `Browser text: “${transcript}” → ${interpretation.action}.`;
  addVoiceTrace({ kind: "final", transcript, alternatives, action: interpretation.action });

  if (interpretation.action === "stop voice input") {
    emitSpeechInterfaceEvent("action.accepted", { action: interpretation.action });
    return stopVoice("Voice input stopped by spoken command.");
  }
  if (interpretation.action === "check the current answer") {
    elements.voiceStatus.textContent = "Voice command: check the current answer.";
    checkAnswer();
    emitSpeechInterfaceEvent("action.accepted", { action: interpretation.action, correct: readyForNext });
    if (readyForNext) scheduleVoiceAdvance();
    return interpretation;
  }
  if (interpretation.action === "move to the next question") {
    elements.voiceStatus.textContent = "Voice command: next question.";
    emitSpeechInterfaceEvent("action.accepted", { action: interpretation.action });
    nextQuestion();
    return interpretation;
  }
  if (interpretation.kind === "command") {
    emitSpeechInterfaceEvent("action.rejected", { action: interpretation.action, reason: "current question is incomplete" });
    elements.voiceStatus.textContent = "Solve and check this question before moving on.";
    return interpretation;
  }
  if (interpretation.kind === "number") {
    elements.answer.value = String(interpretation.value);
    elements.answer.focus();
    checkAnswer();
    emitSpeechInterfaceEvent("action.accepted", { action: interpretation.action, value: interpretation.value, correct: readyForNext });
    if (readyForNext) scheduleVoiceAdvance();
    else elements.voiceStatus.textContent = `${interpretation.value} was checked. Try another answer.`;
    return interpretation;
  }
  emitSpeechInterfaceEvent("action.rejected", { action: interpretation.action, reason: "no safe intent matched" });
  elements.voiceStatus.textContent = "I did not match that to a number or an available command.";
  return interpretation;
}
function supportsLocalSpeech() {
  return recognition && "processLocally" in recognition
    && typeof RecognitionConstructor?.available === "function"
    && typeof RecognitionConstructor?.install === "function";
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
  recognition.lang = elements.voiceLanguage.value;
  recognition.processLocally = true;
  if (!supportsLocalSpeech()) return false;

  let status;
  try {
    status = await RecognitionConstructor.available({
      langs: [recognition.lang],
      processLocally: true,
      quality: "command",
    });
  } catch (_) {
    elements.voiceAvailability.textContent = "Private local speech unavailable";
    stopVoice("This browser could not confirm on-device recognition. Voice remains off to protect privacy.");
    return false;
  }

  if (status === "available") {
    recognition.processLocally = true;
    elements.voiceAvailability.textContent = "Private on-device speech ready";
    elements.voicePrivacy.textContent = "Microphone audio is processed on this device. The studio receives text, does not record audio, and does not send the text or audio anywhere.";
    return true;
  }

  if (status === "downloadable" || status === "downloading") {
    showVoiceDownload(true);
    elements.voiceButton.textContent = "Cancel setup";
    elements.voiceStatus.textContent = "Waiting for the browser’s local language pack…";
    const installed = await RecognitionConstructor.install({
      langs: [recognition.lang],
      processLocally: true,
      quality: "command",
    });
    showVoiceDownload(false);
    if (!voiceShouldRun) return;
    if (installed) {
      recognition.processLocally = true;
      elements.voiceAvailability.textContent = "Private on-device speech ready";
      elements.voicePrivacy.textContent = "Microphone audio is processed on this device. The studio receives text, does not record audio, and does not send the text or audio anywhere.";
      elements.voiceStatus.textContent = "Local language pack ready. Starting the microphone…";
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
  if (!recognition || !voiceShouldRun) return;
  voiceStarting = true;
  voiceAudioActive = false;
  elements.voiceButton.disabled = false;
  elements.voiceButton.textContent = "Cancel voice start";
  elements.voiceButton.setAttribute("aria-busy", "true");
  elements.voiceStatus.textContent = "Waiting for the browser to start listening…";
  setVoiceSignal("preparing", "Starting local speech", "The browser has not confirmed microphone capture yet.");
  clearTimeout(voiceStartTimer);
  voiceStartTimer = setTimeout(() => {
    if (!voiceActive && voiceShouldRun) {
      stopVoice("Voice input did not start. This browser may show the API without providing a working speech service.");
    }
  }, 7000);
  try {
    recognition.start();
  } catch (_) {
    stopVoice("Voice input could not start in this browser.");
  }
}

async function startVoice() {
  if (!recognition || voiceActive || voiceStarting) return;
  voiceShouldRun = true;
  voiceStarting = true;
  elements.voiceButton.textContent = "Cancel voice start";
  elements.voiceButton.setAttribute("aria-busy", "true");
  elements.voiceStatus.textContent = "Preparing the browser’s speech interface…";
  elements.voiceHeard.textContent = "Waiting for recognized words…";
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
    elements.voiceStatus.textContent = "This browser does not provide speech recognition to web pages. Keyboard and touch remain available.";
    elements.voiceButton.textContent = "Voice unavailable";
    elements.voiceButton.disabled = true;
    elements.voiceLanguage.disabled = true;
    return;
  }

  try {
    recognition = new RecognitionConstructor();
  } catch (_) {
    recognition = null;
    elements.voiceAvailability.textContent = "Unavailable in this browser";
    elements.voiceStatus.textContent = "This browser exposes a speech interface but could not initialize it. Keyboard and touch remain available.";
    elements.voiceButton.textContent = "Voice unavailable";
    elements.voiceButton.disabled = true;
    elements.voiceLanguage.disabled = true;
    return;
  }
  if (!supportsLocalSpeech()) {
    recognition = null;
    elements.voiceAvailability.textContent = "Private local speech unavailable";
    elements.voiceStatus.textContent = "This browser does not expose verified on-device speech recognition. Online recognition is intentionally disabled.";
    elements.voiceButton.textContent = "Local voice unavailable";
    elements.voiceButton.disabled = true;
    elements.voiceLanguage.disabled = true;
    return;
  }
  recognition.processLocally = true;
  Object.assign(recognition, { continuous: true, interimResults: true, maxAlternatives: 3 });
  recognition.addEventListener("start", () => {
    clearTimeout(voiceStartTimer);
    voiceStarting = false;
    voiceActive = true;
    elements.voiceButton.textContent = "Stop voice input";
    elements.voiceButton.setAttribute("aria-pressed", "true");
    elements.voiceButton.setAttribute("aria-busy", "false");
    elements.voiceStatus.textContent = "Speech session started. Waiting for microphone capture…";
    setVoiceSignal("preparing", "Speech session active", "Waiting for the browser’s microphone-start event.");
  });
  recognition.addEventListener("audiostart", () => {
    voiceAudioActive = true;
    elements.voiceStatus.textContent = "Listening for a number or one of the shown commands…";
    setVoiceSignal("listening", "Microphone active", "Firefox has confirmed that audio capture started.");
    addVoiceTrace({ kind: "audio start", action: "browser began microphone capture" });
    emitSpeechInterfaceEvent("audio.state", { state: "capturing" });
  });
  recognition.addEventListener("audioend", () => {
    voiceAudioActive = false;
    if (voiceShouldRun) setVoiceSignal("preparing", "Microphone paused", "The browser ended this audio segment and may restart it.");
    addVoiceTrace({ kind: "audio end", action: "browser ended microphone capture" });
    emitSpeechInterfaceEvent("audio.state", { state: "paused" });
  });
  const showSpeechDetected = () => {
    if (!voiceShouldRun) return;
    setVoiceSignal("hearing", "Speech detected", "The browser reports sound or speech in the active microphone stream.");
  };
  const showListeningAgain = () => {
    if (voiceShouldRun && voiceAudioActive) setVoiceSignal("listening", "Microphone active", "Listening for the next number or command.");
  };
  recognition.addEventListener("soundstart", showSpeechDetected);
  recognition.addEventListener("speechstart", showSpeechDetected);
  recognition.addEventListener("soundend", showListeningAgain);
  recognition.addEventListener("speechend", showListeningAgain);
  recognition.addEventListener("result", (event) => {
    const result = event.results[event.results.length - 1];
    const alternatives = [];
    for (let choice = 0; choice < result.length; choice += 1) {
      alternatives.push({ transcript: result[choice].transcript.trim(), confidence: result[choice].confidence });
    }
    const transcript = alternatives[0]?.transcript || "";
    if (!result.isFinal) {
      elements.voiceHeard.textContent = transcript ? `Hearing: “${transcript}”…` : "Hearing speech…";
      setVoiceSignal("hearing", "Speech detected", "Interim text is arriving from the local recognizer.");
      addVoiceTrace({ kind: "interim", transcript, alternatives, action: "wait for a final result" });
      emitSpeechInterfaceEvent("recognition.interim", {
        transcript,
        alternatives: alternatives.map((choice) => ({ text: choice.transcript, confidence: choice.confidence })),
      });
      return;
    }
    setVoiceSignal("processing", "Processing recognized words", "Matching the final browser text to the studio’s small command set.");
    handleVoice(transcript, alternatives);
    if (voiceShouldRun && voiceAudioActive) setVoiceSignal("listening", "Microphone active", "Listening for the next number or command.");
  });
  recognition.addEventListener("error", (event) => {
    if (event.error === "aborted" && !voiceShouldRun) return;
    addVoiceTrace({ kind: "error", action: voiceErrorMessage(event.error) });
    emitSpeechInterfaceEvent("recognition.error", { code: event.error, message: voiceErrorMessage(event.error) });
    if (event.error === "no-speech" && voiceShouldRun) {
      elements.voiceStatus.textContent = voiceErrorMessage(event.error);
      return;
    }
    stopVoice(voiceErrorMessage(event.error));
    setVoiceSignal("error", "Voice input error", voiceErrorMessage(event.error));
  });
  recognition.addEventListener("end", () => {
    voiceActive = false;
    voiceStarting = false;
    voiceAudioActive = false;
    if (voiceShouldRun) beginRecognition();
  });
  elements.voiceButton.disabled = false;
  elements.voiceLanguage.disabled = false;
  elements.voiceAvailability.textContent = "On-device speech · checked before listening";
  elements.voiceStatus.textContent = "Ready when you choose voice input.";
  setVoiceSignal("off", "Microphone off", "No audio is being captured.");
}

function stopVoice(message = "Voice input is off.") {
  clearTimeout(voiceStartTimer);
  clearTimeout(voiceAdvanceTimer);
  voiceShouldRun = false;
  voiceStarting = false;
  voiceActive = false;
  voiceAudioActive = false;
  showVoiceDownload(false);
  if (elements.voiceButton) {
    elements.voiceButton.textContent = recognition ? "Start voice input" : "Voice unavailable";
    elements.voiceButton.setAttribute("aria-pressed", "false");
    elements.voiceButton.setAttribute("aria-busy", "false");
    elements.voiceButton.disabled = !recognition;
  }
  if (elements.voiceStatus) elements.voiceStatus.textContent = message;
  setVoiceSignal("off", "Microphone off", "No audio is being captured.");
  if (recognition) {
    try { recognition.abort(); } catch (_) { /* It was already stopped. */ }
  }
}

elements.form.addEventListener("submit", (event) => { event.preventDefault(); checkAnswer(); });
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
elements.voiceLanguage.addEventListener("change", () => {
  if (voiceActive || voiceStarting) stopVoice("Language changed. Start voice input again when ready.");
  if (recognition) elements.voiceStatus.textContent = "Language changed. Ready when you choose voice input.";
});
elements.voiceDebugEnabled.addEventListener("change", () => {
  elements.voiceDebugOutput.hidden = !elements.voiceDebugEnabled.checked;
  if (elements.voiceDebugEnabled.checked) elements.voiceDebugState.textContent = "No recognition events yet.";
  else {
    elements.voiceTrace.replaceChildren();
    elements.voiceDebugState.textContent = "No recognition events yet.";
  }
});
elements.voiceDebugClear.addEventListener("click", () => {
  elements.voiceTrace.replaceChildren();
  elements.voiceDebugState.textContent = "No recognition events yet.";
});
document.addEventListener("visibilitychange", () => { if (document.hidden) stopVoice("Voice input stopped when the page was hidden."); });
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));

const previousProfile = store.profiles.find((profile) => profile.id === store.lastProfileId);
if (previousProfile) elements.learnerName.value = previousProfile.name;
renderLearnerChoices(); renderHistory(); setupVoice(); startSet();
