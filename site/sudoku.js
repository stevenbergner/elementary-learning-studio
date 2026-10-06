const SIZE = 4;
const BOX_SIZE = 2;

function freezePuzzle({ puzzle, solution }) {
  return Object.freeze({
    puzzle: Object.freeze([...puzzle]),
    solution: Object.freeze([...solution]),
  });
}

export const CHILD_SUDOKU_PUZZLES = Object.freeze([
  freezePuzzle({
    puzzle: [0, 3, 4, 0, 0, 1, 0, 3, 3, 2, 0, 4, 1, 4, 0, 0],
    solution: [2, 3, 4, 1, 4, 1, 2, 3, 3, 2, 1, 4, 1, 4, 3, 2],
  }),
  freezePuzzle({
    puzzle: [0, 4, 1, 0, 1, 2, 3, 0, 4, 3, 0, 0, 2, 0, 0, 3],
    solution: [3, 4, 1, 2, 1, 2, 3, 4, 4, 3, 2, 1, 2, 1, 4, 3],
  }),
  freezePuzzle({
    puzzle: [4, 1, 0, 3, 0, 3, 4, 0, 0, 0, 0, 2, 0, 2, 1, 4],
    solution: [4, 1, 2, 3, 2, 3, 4, 1, 1, 4, 3, 2, 3, 2, 1, 4],
  }),
  freezePuzzle({
    puzzle: [1, 2, 0, 0, 3, 0, 1, 0, 0, 1, 4, 3, 4, 3, 0, 0],
    solution: [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1],
  }),
]);

function validGroup(values) {
  return values.slice().sort().join("") === "1234";
}

export function validateSudokuPuzzle({ puzzle, solution }) {
  if (!Array.isArray(puzzle) || !Array.isArray(solution) || puzzle.length !== 16 || solution.length !== 16) return false;
  if (!solution.every((value) => Number.isInteger(value) && value >= 1 && value <= 4)) return false;
  if (!puzzle.every((value, index) => Number.isInteger(value) && value >= 0 && value <= 4 && (!value || value === solution[index]))) return false;
  for (let row = 0; row < SIZE; row += 1) {
    if (!validGroup(solution.slice(row * SIZE, row * SIZE + SIZE))) return false;
  }
  for (let column = 0; column < SIZE; column += 1) {
    if (!validGroup(solution.filter((_, index) => index % SIZE === column))) return false;
  }
  for (let boxRow = 0; boxRow < SIZE; boxRow += BOX_SIZE) {
    for (let boxColumn = 0; boxColumn < SIZE; boxColumn += BOX_SIZE) {
      const box = [];
      for (let row = boxRow; row < boxRow + BOX_SIZE; row += 1) {
        for (let column = boxColumn; column < boxColumn + BOX_SIZE; column += 1) box.push(solution[row * SIZE + column]);
      }
      if (!validGroup(box)) return false;
    }
  }
  return true;
}

export function checkSudokuValues(values, solution) {
  if (!Array.isArray(values) || !Array.isArray(solution) || values.length !== 16 || solution.length !== 16) {
    throw new TypeError("Sudoku values and solution must contain 16 cells");
  }
  const empty = [];
  const wrong = [];
  values.forEach((value, index) => {
    if (!value) empty.push(index);
    else if (value !== solution[index]) wrong.push(index);
  });
  return Object.freeze({
    complete: empty.length === 0,
    correct: empty.length === 0 && wrong.length === 0,
    empty: Object.freeze(empty),
    wrong: Object.freeze(wrong),
  });
}

for (const puzzle of CHILD_SUDOKU_PUZZLES) {
  if (!validateSudokuPuzzle(puzzle)) throw new Error("Invalid bundled child Sudoku puzzle");
}
