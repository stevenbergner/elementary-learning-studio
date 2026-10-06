import { CHILD_SUDOKU_PUZZLES, checkSudokuValues } from "./sudoku.js";

// A child-sized 4×4 Sudoku for touch, mouse, and keyboard. Its state lives
// only in this page; nothing is stored or sent. Other input methods drive the
// same board through the exported numberGrid controller and can follow the
// selection through the "number-grid:select" event.
const grid = document.querySelector("#sudoku-grid");
const feedback = document.querySelector("#sudoku-feedback");
const label = document.querySelector("#sudoku-label");
let puzzleIndex = 0;
let values = [];
let selected = -1;

const cellAt = (index) => grid.querySelector(`[data-sudoku-index="${index}"]`);
const place = (index) => `Row ${Math.floor(index / 4) + 1}, column ${(index % 4) + 1}`;

function say(message, tone = "") {
  feedback.className = `sudoku-feedback${tone ? ` ${tone}` : ""}`;
  feedback.textContent = message;
}

function select(index, { focus = false } = {}) {
  if (CHILD_SUDOKU_PUZZLES[puzzleIndex].puzzle[index]) {
    say("That number is a fixed clue. Choose a blank cell.");
    return false;
  }
  selected = index;
  grid.querySelectorAll(".sudoku-cell").forEach((cell) => {
    const isSelected = Number(cell.dataset.sudokuIndex) === index;
    cell.classList.toggle("is-selected", isSelected);
    if (isSelected) cell.setAttribute("aria-current", "true");
    else cell.removeAttribute("aria-current");
  });
  if (focus) cellAt(index)?.focus({ preventScroll: true });
  say(`${place(index)} is ready.`);
  grid.dispatchEvent(new CustomEvent("number-grid:select", {
    bubbles: true,
    detail: Object.freeze({ index, row: Math.floor(index / 4) + 1, column: (index % 4) + 1 }),
  }));
  return true;
}

function enter(value, { source = "" } = {}) {
  const { puzzle } = CHILD_SUDOKU_PUZZLES[puzzleIndex];
  let index = selected;
  if (index < 0 || puzzle[index]) {
    // Without a selection, fill the first blank cell rather than ignore the tap.
    index = puzzle.findIndex((given, candidate) => !given && !values[candidate]);
    if (index < 0) index = puzzle.findIndex((given) => !given);
    if (index < 0) return false;
    select(index);
  }
  values[index] = value;
  const cell = cellAt(index);
  cell.textContent = value ? String(value) : "";
  cell.classList.remove("is-wrong", "is-correct");
  cell.setAttribute("aria-label", `${place(index)}${value ? `, ${value}` : ", blank"}`);
  say(value ? `${value} entered${source ? ` by ${source}` : ""}. Keep thinking, or check the grid when ready.` : "The selected cell is blank again.");
  return true;
}

function check() {
  const { puzzle, solution } = CHILD_SUDOKU_PUZZLES[puzzleIndex];
  const result = checkSudokuValues(values, solution);
  grid.querySelectorAll(".sudoku-cell").forEach((cell) => {
    const index = Number(cell.dataset.sudokuIndex);
    cell.classList.toggle("is-wrong", result.wrong.includes(index));
    cell.classList.toggle("is-correct", result.correct && !puzzle[index]);
  });
  if (result.correct) say("The whole grid works. Every row, column, and box has 1–4.", "success");
  else if (result.wrong.length) say("Some entries need another look. The cells to revisit are highlighted.", "error");
  else say(`${result.empty.length} blank ${result.empty.length === 1 ? "cell remains" : "cells remain"}.`);
  return result;
}

// Moves the selection to the nearest blank cell in a direction, skipping
// fixed clues; stays put at the edge of the grid.
function move(direction) {
  const vector = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[direction];
  if (!vector || selected < 0) return false;
  const { puzzle } = CHILD_SUDOKU_PUZZLES[puzzleIndex];
  let row = Math.floor(selected / 4) + vector[0];
  let column = (selected % 4) + vector[1];
  while (row >= 0 && row < 4 && column >= 0 && column < 4) {
    const candidate = row * 4 + column;
    if (!puzzle[candidate]) return select(candidate, { focus: true });
    row += vector[0];
    column += vector[1];
  }
  return false;
}

function moveFocus(index, key) {
  const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 };
  if (!(key in offsets)) return false;
  const target = index + offsets[key];
  if (target < 0 || target >= 16) return true;
  if ((key === "ArrowLeft" || key === "ArrowRight") && Math.floor(target / 4) !== Math.floor(index / 4)) return true;
  if ((key === "ArrowUp" || key === "ArrowDown") && target % 4 !== index % 4) return true;
  cellAt(target)?.focus({ preventScroll: true });
  return true;
}

function render(index = puzzleIndex) {
  puzzleIndex = (index + CHILD_SUDOKU_PUZZLES.length) % CHILD_SUDOKU_PUZZLES.length;
  const { puzzle } = CHILD_SUDOKU_PUZZLES[puzzleIndex];
  values = [...puzzle];
  selected = -1;
  grid.replaceChildren(...puzzle.map((given, cellIndex) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `sudoku-cell${given ? " is-given" : ""}`;
    cell.dataset.sudokuIndex = String(cellIndex);
    cell.dataset.row = String(Math.floor(cellIndex / 4));
    cell.dataset.column = String(cellIndex % 4);
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-readonly", String(Boolean(given)));
    cell.setAttribute("aria-label", `${place(cellIndex)}${given ? `, fixed ${given}` : ", blank"}`);
    cell.textContent = given ? String(given) : "";
    cell.addEventListener("focus", () => { if (!given) select(cellIndex); });
    cell.addEventListener("click", () => select(cellIndex));
    cell.addEventListener("keydown", (event) => {
      if (moveFocus(cellIndex, event.key)) return event.preventDefault();
      if (!given && /^[1-4]$/.test(event.key)) { event.preventDefault(); enter(Number(event.key)); }
      if (!given && ["Backspace", "Delete", "0"].includes(event.key)) { event.preventDefault(); enter(0); }
    });
    return cell;
  }));
  label.textContent = `Easy grid ${puzzleIndex + 1} of ${CHILD_SUDOKU_PUZZLES.length}`;
  say("Select a blank cell to begin.");
}

document.querySelectorAll("[data-sudoku-value]").forEach((button) => button.addEventListener("click", () => {
  enter(Number(button.dataset.sudokuValue));
}));
document.querySelector("#sudoku-check").addEventListener("click", check);
document.querySelector("#sudoku-clear").addEventListener("click", () => {
  const keep = selected;
  render(puzzleIndex);
  if (keep >= 0) select(keep, { focus: true });
});
document.querySelector("#sudoku-new").addEventListener("click", () => {
  render(puzzleIndex + 1);
  select(CHILD_SUDOKU_PUZZLES[puzzleIndex].puzzle.findIndex((value) => !value), { focus: true });
});

export const numberGrid = Object.freeze({
  get selectedIndex() { return selected; },
  isGiven: (index) => Boolean(CHILD_SUDOKU_PUZZLES[puzzleIndex].puzzle[index]),
  select,
  enter(value, options) {
    if (!Number.isInteger(value) || value < 0 || value > 4) return false;
    return enter(value, options);
  },
  move,
  check,
  notify: say,
});

render();
