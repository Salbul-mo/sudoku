import { test } from "node:test";
import assert from "node:assert/strict";
import {
    solve, countSolutions, classify, hasUniqueSolution, alternativeExists, Uniqueness,
} from "../../functions/_lib/sudoku/solver.js";

const UNIQUE_PUZZLE = [
    8, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 3, 6, 0, 0, 0, 0, 0,
    0, 7, 0, 0, 9, 0, 2, 0, 0,
    0, 5, 0, 0, 0, 7, 0, 0, 0,
    0, 0, 0, 0, 4, 5, 7, 0, 0,
    0, 0, 0, 1, 0, 0, 0, 3, 0,
    0, 0, 1, 0, 0, 0, 0, 6, 8,
    0, 0, 8, 5, 0, 0, 0, 1, 0,
    0, 9, 0, 0, 0, 0, 4, 0, 0,
];

const UNIQUE_SOLUTION = [
    8, 1, 2, 7, 5, 3, 6, 4, 9,
    9, 4, 3, 6, 8, 2, 1, 7, 5,
    6, 7, 5, 4, 9, 1, 2, 8, 3,
    1, 5, 4, 2, 3, 7, 8, 9, 6,
    3, 6, 9, 8, 4, 5, 7, 2, 1,
    2, 8, 7, 1, 6, 9, 5, 3, 4,
    5, 2, 1, 9, 7, 4, 3, 6, 8,
    4, 3, 8, 5, 2, 6, 9, 1, 7,
    7, 9, 6, 3, 1, 8, 4, 5, 2,
];

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

test("solve() on a fully-filled valid grid returns it unchanged", () => {
    const result = solve(UNIQUE_SOLUTION);
    assert.deepEqual(result, UNIQUE_SOLUTION);
});

test("solve() on a unique puzzle returns its solution", () => {
    const result = solve(UNIQUE_PUZZLE);
    assert.ok(isValidCompleteGrid(result));
    for (let i = 0; i < 81; i++) {
        if (UNIQUE_PUZZLE[i]) assert.equal(result[i], UNIQUE_PUZZLE[i]);
    }
});

test("solve() on a contradictory board returns null", () => {
    const bad = new Array(81).fill(0);
    bad[0] = 5; bad[1] = 5;
    assert.equal(solve(bad), null);
});

test("countSolutions caps at the given limit", () => {
    assert.equal(countSolutions(new Array(81).fill(0), 2), 2);
    assert.equal(countSolutions(UNIQUE_PUZZLE, 2), 1);
});

test("classify: UNIQUE / MULTIPLE / NO_SOLUTION / BUDGET_EXCEEDED", () => {
    assert.equal(classify(UNIQUE_PUZZLE), Uniqueness.UNIQUE);
    assert.equal(classify(new Array(81).fill(0)), Uniqueness.MULTIPLE);
    const bad = new Array(81).fill(0);
    bad[0] = 5; bad[1] = 5;
    assert.equal(classify(bad), Uniqueness.NO_SOLUTION);
    assert.equal(classify(UNIQUE_PUZZLE, 1), Uniqueness.BUDGET_EXCEEDED);
});

test("hasUniqueSolution mirrors classify()", () => {
    assert.equal(hasUniqueSolution(UNIQUE_PUZZLE), true);
    assert.equal(hasUniqueSolution(new Array(81).fill(0)), false);
});

test("alternativeExists agrees with countSolutions(cap=2) across a real digging sequence", () => {
    // Simulate generator.js::digHoles: starting from the full (trivially
    // unique) solution, remove cells one at a time in a fixed order,
    // keeping the removal only when it does not break uniqueness. This is
    // exactly the caller-side invariant alternativeExists relies on --
    // board-with-index=excludeDigit is always known unique going in -- and
    // it naturally exercises both the true and false branches.
    const board = UNIQUE_SOLUTION.slice();
    let sawTrue = false;
    let sawFalse = false;
    for (let index = 0; index < 40; index++) {
        const digit = board[index];
        board[index] = 0;
        const rival = alternativeExists(board, index, digit);
        const oracle = countSolutions(board, 2) > 1;
        assert.equal(rival, oracle, `mismatch at index ${index}`);
        if (rival) { sawTrue = true; board[index] = digit; } else { sawFalse = true; }
    }
    assert.ok(sawTrue, "expected at least one removal to break uniqueness");
    assert.ok(sawFalse, "expected at least one removal to preserve uniqueness");
});
