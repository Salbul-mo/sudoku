import { test } from "node:test";
import assert from "node:assert/strict";
import {
    generateSolvedBoard, digHoles, generatePuzzle, cryptoRng, clueCount,
    GIVENS_MIN, GIVENS_MAX, GIVENS_DEFAULT,
} from "../../functions/_lib/sudoku/claude-mhj_26_08_05_04_generator.js";
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
    const { puzzle, solution } = generatePuzzle();
    assert.equal(puzzle.length, 81);
    assert.equal(solution.length, 81);
    assert.ok(Array.isArray(puzzle) && Array.isArray(solution));
    assert.ok(isValidCompleteGrid(solution));
    assert.equal(hasUniqueSolution(puzzle), true);
    for (let i = 0; i < 81; i++) {
        if (puzzle[i]) assert.equal(puzzle[i], solution[i]);
    }
});

test("T-B01-01: every offered clue count yields a unique puzzle that is a subset of its solution", () => {
    for (const givens of [GIVENS_MIN, 26, GIVENS_DEFAULT, 40, 50, GIVENS_MAX]) {
        const { puzzle, solution } = generatePuzzle({ givens });
        // A dig stops the moment it reaches the target, so the result can
        // land above the request but never below it.
        assert.ok(clueCount(puzzle) >= givens, `givens=${givens} produced ${clueCount(puzzle)}`);
        assert.equal(hasUniqueSolution(puzzle), true, `givens=${givens} was not unique`);
        assert.ok(isValidCompleteGrid(solution));
        for (let i = 0; i < 81; i++) {
            if (puzzle[i]) assert.equal(puzzle[i], solution[i]);
        }
    }
});

test("T-B01-02: counts of 26 and above are hit exactly", () => {
    // Retrying makes these deterministic in practice: a single dig already
    // lands on 26 about 98% of the time, so 30 attempts miss with vanishing
    // probability.
    for (const givens of [26, GIVENS_DEFAULT, 40, 50, GIVENS_MAX]) {
        assert.equal(clueCount(generatePuzzle({ givens }).puzzle), givens);
    }
});

test("T-B01-03: the lowest offered count stays within a few clues of the request", () => {
    // GIVENS_MIN is deliberately not asserted to land exactly: measured, the
    // retry loop reaches 22 about three quarters of the time, so demanding
    // equality here would be a test that fails at random roughly 1 run in 4.
    const { puzzle } = generatePuzzle({ givens: GIVENS_MIN });
    const actual = clueCount(puzzle);
    assert.ok(actual >= GIVENS_MIN, `got ${actual}, below the requested ${GIVENS_MIN}`);
    assert.ok(actual <= GIVENS_MIN + 6, `got ${actual}, unexpectedly far above ${GIVENS_MIN}`);
    assert.equal(hasUniqueSolution(puzzle), true);
});

test("T-B01-04: givens outside the offered range, or not an integer, is rejected", () => {
    for (const bad of [GIVENS_MIN - 1, GIVENS_MAX + 1, 0, -5, 26.5, "26", null, NaN]) {
        assert.throws(() => generatePuzzle({ givens: bad }), RangeError, `accepted ${String(bad)}`);
    }
});

test("T-B01-05: only dim 9 is supported", () => {
    assert.throws(() => generatePuzzle({ dim: 12 }), RangeError);
});

test("generatePuzzle produces different puzzles across calls", () => {
    assert.notDeepEqual(generatePuzzle().puzzle, generatePuzzle().puzzle);
});
