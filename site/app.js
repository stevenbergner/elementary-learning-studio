const SET_SIZE = 10;
const STORAGE_KEY = "elementary-learning-studio-progress-v1";

const operations = {
  addition: {
    symbol: "+",
    label: "Addition · facts to 20",
    make() {
      return { a: randomInt(1, 10), b: randomInt(1, 10), answer: null };
    },
    solve(a, b) { return a + b; },
    hint(a, b) {
      if (a === b) return `You found a double. What is ${a} + ${a}?`;
      if (a + b >= 10) return `Can you move part of one number to make 10 first?`;
      return `Start with ${Math.max(a, b)} and count on ${Math.min(a, b)} more.`;
    },
  },
  subtraction: {
    symbol: "−",
    label: "Subtraction · facts to 18",
    make() {
      const b = randomInt(0, 9);
      return { a: randomInt(Math.max(9, b), 18), b, answer: null };
    },
    solve(a, b) { return a - b; },
    hint(a, b) { return `Count up from ${b} to ${a}. How many steps did you take?`; },
  },
  multiplication: {
    symbol: "×",
    label: "Multiplication · factors 2 to 12",
    make() { return { a: randomInt(2, 12), b: randomInt(2, 12), answer: null }; },
    solve(a, b) { return a * b; },
    hint(a, b) {
      const friendly = [2, 5, 10].includes(a) ? a : ([2, 5, 10].includes(b) ? b : null);
      return friendly
        ? `Use the ${friendly}s pattern. What do you notice?`
        : `Build from a nearby fact you know, such as ${a} × ${Math.max(2, b - 1)}.`;
    },
  },
  division: {
    symbol: "÷",
    label: "Division · whole-number facts to 100",
    make() {
      const divisor = randomInt(2, 10);
      const quotient = randomInt(2, 10);
      return { a: divisor * quotient, b: divisor, answer: null };
    },
    solve(a, b) { return a / b; },
    hint(a, b) { return `What number times ${b} equals ${a}?`; },
  },
};

let operation = "addition";
let questions = [];
let index = 0;
let firstTryCorrect = 0;
let hadMistake = false;
let readyForNext = false;

const elements = {
  answer: document.querySelector("#answer"),
  form: document.querySelector("#answer-form"),
  check: document.querySelector("#check-answer"),
  hintButton: document.querySelector("#show-hint"),
  hint: document.querySelector("#hint-text"),
  feedback: document.querySelector("#feedback"),
  a: document.querySelector("#operand-a"),
  b: document.querySelector("#operand-b"),
  operator: document.querySelector("#operator"),
  setLabel: document.querySelector("#set-label"),
  progressLabel: document.querySelector("#progress-label"),
  progressBar: document.querySelector("#progress-bar"),
  questionView: document.querySelector("#question-view"),
  completeView: document.querySelector("#complete-view"),
  result: document.querySelector("#result-summary"),
  history: document.querySelector("#history-summary"),
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeSet(kind) {
  const seen = new Set();
  const set = [];
  let attempts = 0;
  while (set.length < SET_SIZE && attempts < 300) {
    attempts += 1;
    const item = operations[kind].make();
    item.answer = operations[kind].solve(item.a, item.b);
    const key = `${item.a}:${item.b}`;
    if (!seen.has(key)) {
      seen.add(key);
      set.push(item);
    }
  }
  return set;
}

function currentQuestion() { return questions[index]; }

function startSet(kind = operation) {
  operation = kind;
  questions = makeSet(operation);
  index = 0;
  firstTryCorrect = 0;
  hadMistake = false;
  readyForNext = false;
  elements.completeView.hidden = true;
  elements.questionView.hidden = false;
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
  hadMistake = false;
  window.setTimeout(() => elements.answer.focus({ preventScroll: true }), 60);
}

function checkAnswer() {
  if (readyForNext) {
    nextQuestion();
    return;
  }

  const raw = elements.answer.value.trim();
  if (!/^\d+$/.test(raw)) {
    elements.feedback.className = "feedback error";
    elements.feedback.textContent = "Enter a whole number first.";
    elements.answer.focus();
    return;
  }

  const guess = Number(raw);
  if (guess === currentQuestion().answer) {
    if (!hadMistake) firstTryCorrect += 1;
    elements.answer.disabled = true;
    elements.answer.className = "is-correct";
    elements.feedback.className = "feedback success";
    elements.feedback.textContent = encouragingMessage();
    elements.check.textContent = index === SET_SIZE - 1 ? "Finish this set" : "Next question";
    elements.hintButton.hidden = true;
    elements.hint.textContent = "";
    readyForNext = true;
    elements.check.focus();
  } else {
    hadMistake = true;
    elements.answer.className = "is-wrong";
    elements.feedback.className = "feedback error";
    elements.feedback.textContent = "Not yet. Try a different strategy.";
    window.setTimeout(() => { elements.answer.className = ""; }, 430);
    elements.answer.select();
  }
}

function nextQuestion() {
  if (index < SET_SIZE - 1) {
    index += 1;
    renderQuestion();
  } else {
    finishSet();
  }
}

function finishSet() {
  saveProgress();
  elements.questionView.hidden = true;
  elements.completeView.hidden = false;
  const retryCount = SET_SIZE - firstTryCorrect;
  elements.result.textContent = retryCount === 0
    ? `You solved all ${SET_SIZE} on the first try. What strategy helped most?`
    : `You solved all ${SET_SIZE}. ${firstTryCorrect} were right on the first try, and you stayed with ${retryCount} that needed another look.`;
  document.querySelector("#new-set").focus();
}

function encouragingMessage() {
  const messages = [
    "Yes—that relationship works.",
    "Correct. Notice what your strategy did.",
    "You checked it carefully. Nice work.",
    "That’s it. Keep the pattern in mind.",
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

function readProgress() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed && Number.isInteger(parsed.sets) && Number.isInteger(parsed.problems)) return parsed;
  } catch (_) {
    // A blocked or malformed local store should never block practice.
  }
  return { sets: 0, problems: 0 };
}

function saveProgress() {
  const progress = readProgress();
  progress.sets += 1;
  progress.problems += SET_SIZE;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch (_) { /* Device storage is optional. */ }
  renderHistory();
}

function renderHistory() {
  const progress = readProgress();
  elements.history.textContent = progress.sets === 0
    ? "A fresh start"
    : `${progress.sets} ${progress.sets === 1 ? "set" : "sets"} · ${progress.problems} problems`;
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  checkAnswer();
});

elements.hintButton.addEventListener("click", () => {
  const question = currentQuestion();
  elements.hint.textContent = operations[operation].hint(question.a, question.b);
  hadMistake = true;
  elements.answer.focus();
});

document.querySelectorAll(".operation").forEach((button) => {
  button.addEventListener("click", () => startSet(button.dataset.operation));
});

document.querySelector("#new-set").addEventListener("click", () => startSet());

document.querySelectorAll("[data-confidence]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-confidence]").forEach((item) => item.classList.remove("is-selected"));
    button.classList.add("is-selected");
  });
});

document.querySelector("#reset-history").addEventListener("click", () => {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* Device storage is optional. */ }
  renderHistory();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

renderHistory();
startSet();
