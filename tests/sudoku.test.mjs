import test from "node:test";
import assert from "node:assert/strict";

import { CHILD_SUDOKU_PUZZLES, checkSudokuValues, validateSudokuPuzzle } from "../site/sudoku.js";

function solutionCount(puzzle, limit = 2) {
  const values = [...puzzle];
  let count = 0;
  function allowed(index, value) {
    const row = Math.floor(index / 4);
    const column = index % 4;
    for (let offset = 0; offset < 4; offset += 1) {
      if (values[row * 4 + offset] === value || values[offset * 4 + column] === value) return false;
    }
    const boxRow = row - (row % 2);
    const boxColumn = column - (column % 2);
    for (let y = boxRow; y < boxRow + 2; y += 1) {
      for (let x = boxColumn; x < boxColumn + 2; x += 1) if (values[y * 4 + x] === value) return false;
    }
    return true;
  }
  function solve() {
    const index = values.indexOf(0);
    if (index < 0) { count += 1; return; }
    for (let value = 1; value <= 4 && count < limit; value += 1) {
      if (!allowed(index, value)) continue;
      values[index] = value;
      solve();
      values[index] = 0;
    }
  }
  solve();
  return count;
}

test("bundles valid child grids with exactly one solution", () => {
  assert.equal(CHILD_SUDOKU_PUZZLES.length, 4);
  for (const puzzle of CHILD_SUDOKU_PUZZLES) {
    assert.equal(validateSudokuPuzzle(puzzle), true);
    assert.equal(solutionCount(puzzle.puzzle), 1);
    assert.equal(puzzle.puzzle.filter(Boolean).length, 9);
  }
});

test("reports blanks and incorrect entries without revealing the solution", () => {
  const { puzzle, solution } = CHILD_SUDOKU_PUZZLES[0];
  const initial = checkSudokuValues([...puzzle], solution);
  assert.equal(initial.correct, false);
  assert.equal(initial.empty.length, 7);
  assert.deepEqual(initial.wrong, []);

  const wrong = [...puzzle];
  const blank = wrong.indexOf(0);
  wrong[blank] = solution[blank] === 1 ? 2 : 1;
  assert.deepEqual(checkSudokuValues(wrong, solution).wrong, [blank]);
  assert.equal(checkSudokuValues([...solution], solution).correct, true);
});
