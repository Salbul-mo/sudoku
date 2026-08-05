import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSolvedBoard, digHoles, generatePuzzle, cryptoRng } from "../../functions/_lib/sudoku/claude-mhj_26_08_05_04_generator.js";
import { hasUniqueSolution } from "../../functions/_lib/sudoku/claude-mhj_26_08_05_03_solver.js";

function isValidCompleteGrid(board) {
    if (board.length !== 81) return false;
    const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
    for (let i = 0; i < 81; i++) {
        const v = board[i];
        if (v < 1 || v > 9) return false;
        const r = Math.floor(i / 9), c = i % 9;
        const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
        const bit = 1 << (v - 1);
        if (rows[r] & bit || cols[c] & bit || boxes[b] & bit) return false;
        rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
    }
    return true;
}

test("cryptoRng returns floats in [0, 1)", () => {
    for (let i = 0; i < 50; i++) {
        const v = cryptoRng();
        assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
    }
});

test("generateSolvedBoard always returns a valid complete grid", () => {
    for (let i = 0; i < 5; i++) {
        assert.ok(isValidCompleteGrid(generateSolvedBoard(cryptoRng)));
    }
});

test("generateSolvedBoard produces different grids across calls (statistical, not guaranteed)", () => {
    const a = generateSolvedBoard(cryptoRng);
    const b = generateSolvedBoard(cryptoRng);
    assert.notDeepEqual(a, b);
});

test("generateSolvedBoard rejects a non-function rng", () => {
    assert.throws(() => generateSolvedBoard(null), TypeError);
});

test("digHoles always returns a uniquely-solvable puzzle", () => {
    const solution = generateSolvedBoard(cryptoRng);
    const puzzle = digHoles(solution, { targetGivens: 32, rng: cryptoRng });
    assert.equal(hasUniqueSolution(puzzle), true);
    for (let i = 0; i < 81; i++) {
        if (puzzle[i]) assert.equal(puzzle[i], solution[i]);
    }
});

test("digHoles degrades gracefully under a near-zero time budget: still unique, never throws", () => {
    const solution = generateSolvedBoard(cryptoRng);
    const puzzle = digHoles(solution, { targetGivens: 32, budgetMs: 1, rng: cryptoRng });
    assert.equal(hasUniqueSolution(puzzle), true);
});

test("digHoles rejects an out-of-range targetGivens", () => {
    const solution = generateSolvedBoard(cryptoRng);
    assert.throws(() => digHoles(solution, { targetGivens: 16, rng: cryptoRng }), RangeError);
    assert.throws(() => digHoles(solution, { targetGivens: 82, rng: cryptoRng }), RangeError);
});

test("generatePuzzle returns a schema-valid, uniquely-solvable puzzle", () => {
    const { puzzle, solution } = generatePuzzle({ dim: 9, difficulty: "medium" });
    assert.equal(puzzle.length, 81);
    assert.equal(solution.length, 81);
    assert.ok(Array.isArray(puzzle) && Array.isArray(solution));
    assert.ok(isValidCompleteGrid(solution));
    assert.equal(hasUniqueSolution(puzzle), true);
    for (let i = 0; i < 81; i++) {
        if (puzzle[i]) assert.equal(puzzle[i], solution[i]);
    }
});

test("generatePuzzle rejects unsupported dim and difficulty", () => {
    assert.throws(() => generatePuzzle({ dim: 12, difficulty: "medium" }), RangeError);
    assert.throws(() => generatePuzzle({ dim: 9, difficulty: "hard" }), RangeError);
});

test("generatePuzzle produces different puzzles across calls", () => {
    const a = generatePuzzle({ dim: 9, difficulty: "medium" });
    const b = generatePuzzle({ dim: 9, difficulty: "medium" });
    assert.notDeepEqual(a.puzzle, b.puzzle);
});
