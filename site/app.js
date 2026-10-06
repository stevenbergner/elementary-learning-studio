const SET_SIZE = 10;
// A branch or commit preview lives under /b/<branch>/ or /s/<sha>/ on the
// same origin as the published studio. It returns "b/<branch>" or "s/<sha>",
// and null for the published studio. sw.js carries an identical copy;
// tests/preview-scope.test.mjs checks that both behave the same.
function previewScope(pathname) {
  const match = /(?:^|\/)(b|s)\/([A-Za-z0-9._-]+)\//.exec(String(pathname));
  return match ? `${match[1]}/${match[2]}` : null;
}
// The published studio keeps its original keys. A preview shares the browser
// origin, so it gets its own keys and never reads or overwrites real progress.
const STORAGE_SUFFIX = previewScope(location.pathname) ? `:preview:${previewScope(location.pathname)}` : "";
const STORAGE_KEY = `elementary-learning-studio-progress-v2${STORAGE_SUFFIX}`;
const OLD_STORAGE_KEY = `elementary-learning-studio-progress-v1${STORAGE_SUFFIX}`;
const PROJECT_URL = "https://stevenbergner.github.io/elementary-learning-studio/";

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

const elements = Object.fromEntries(Object.entries({
  answer: "#answer", form: "#answer-form", check: "#check-answer", hintButton: "#show-hint", hint: "#hint-text",
  feedback: "#feedback", a: "#operand-a", b: "#operand-b", operator: "#operator", setLabel: "#set-label",
  progressLabel: "#progress-label", progressBar: "#progress-bar", questionView: "#question-view", completeView: "#complete-view",
  result: "#result-summary", history: "#history-summary", learnerName: "#learner-name", knownLearners: "#known-learners",
  timingEnabled: "#timing-enabled", progressPanel: "#progress-panel", progressLearner: "#progress-learner",
  showTiming: "#show-timing", timingViewLabel: "#timing-view-label", statsGrid: "#stats-grid",
  operationStats: "#operation-stats", factList: "#fact-list", sessionList: "#session-list", legacyNote: "#legacy-note",
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
  const question = currentQuestion();
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
  window.setTimeout(() => elements.answer.focus({ preventScroll: true }), 60);
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

function nextQuestion() { index < SET_SIZE - 1 ? (index += 1, renderQuestion()) : finishSet(); }

function finishSet() {
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
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));

const previousProfile = store.profiles.find((profile) => profile.id === store.lastProfileId);
if (previousProfile) elements.learnerName.value = previousProfile.name;
renderLearnerChoices(); renderHistory(); startSet();
