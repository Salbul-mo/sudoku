import { test } from "node:test";
import assert from "node:assert/strict";
import {
    buildMatrix, cover, uncover, applyGivens, removeGivens, search,
    snapshot, isPristine,
} from "../../functions/_lib/sudoku/claude-mhj_26_08_05_02_dlx.js";
import { CELLS, DIM } from "../../functions/_lib/sudoku/claude-mhj_26_08_05_01_spec.js";

// A known-unique 9x9 puzzle (a widely published "hardest" seed), used across
// several tests below. 0 = empty.
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

function isValidCompleteGrid(board) {
    if (board.length !== CELLS) return false;
    const rows = new Array(DIM).fill(0);
    const cols = new Array(DIM).fill(0);
    const boxes = new Array(DIM).fill(0);
    for (let i = 0; i < CELLS; i++) {
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

test("buildMatrix: every constraint column starts with exactly 9 candidate rows", () => {
    const matrix = buildMatrix();
    for (let c = 1; c <= matrix.numCols; c++) {
        assert.equal(matrix.SIZE[c], 9, `column ${c} has SIZE ${matrix.SIZE[c]}`);
    }
    assert.equal(isPristine(matrix), true);
});

test("cover then uncover restores the matrix exactly (single column)", () => {
    const matrix = buildMatrix();
    const before = snapshot(matrix);
    cover(matrix, 5);
    assert.notDeepEqual(snapshot(matrix), before);
    uncover(matrix, 5);
    assert.deepEqual(snapshot(matrix), before);
    assert.equal(isPristine(matrix), true);
});

test("nested cover/uncover in reverse order restores the matrix exactly", () => {
    const matrix = buildMatrix();
    const before = snapshot(matrix);
    const cols = [3, 40, 120, 200, 300];
    for (const c of cols) cover(matrix, c);
    for (const c of [...cols].reverse()) uncover(matrix, c);
    assert.deepEqual(snapshot(matrix), before);
});

test("applyGivens/removeGivens round-trips a consistent board", () => {
    const matrix = buildMatrix();
    const before = snapshot(matrix);
    const handle = applyGivens(matrix, UNIQUE_PUZZLE);
    assert.equal(handle.consistent, true);
    assert.notDeepEqual(snapshot(matrix), before);
    removeGivens(matrix, handle);
    assert.deepEqual(snapshot(matrix), before);
});

test("applyGivens detects a contradiction and still unwinds cleanly", () => {
    const matrix = buildMatrix();
    const before = snapshot(matrix);
    const contradictory = new Array(81).fill(0);
    contradictory[0] = 5;
    contradictory[1] = 5; // same row, same value
    const handle = applyGivens(matrix, contradictory);
    assert.equal(handle.consistent, false);
    removeGivens(matrix, handle);
    assert.deepEqual(snapshot(matrix), before);
});

test("applyGivens rejects a wrong-length board", () => {
    const matrix = buildMatrix();
    assert.throws(() => applyGivens(matrix, new Array(80).fill(0)), RangeError);
});

test("search(limit=1) on an empty matrix returns one complete valid grid", () => {
    const matrix = buildMatrix();
    const result = search(matrix, { limit: 1 });
    assert.equal(result.count, 1);
    assert.equal(result.budgetExceeded, false);
    const board = new Array(81).fill(0);
    for (const rid of result.rows) {
        const cell = Math.floor(rid / 9);
        const v = (rid % 9) + 1;
        board[cell] = v;
    }
    assert.equal(isValidCompleteGrid(board), true);
    assert.equal(isPristine(matrix), true);
});

test("search(limit=2) on a known-unique puzzle finds exactly one solution", () => {
    const matrix = buildMatrix();
    const handle = applyGivens(matrix, UNIQUE_PUZZLE);
    assert.equal(handle.consistent, true);
    const result = search(matrix, { limit: 2, collect: false });
    assert.equal(result.count, 1);
    assert.equal(result.budgetExceeded, false);
    removeGivens(matrix, handle);
    assert.equal(isPristine(matrix), true);
});

test("search(limit=2) on an empty board finds multiple solutions", () => {
    const matrix = buildMatrix();
    const result = search(matrix, { limit: 2, collect: false });
    assert.equal(result.count, 2);
    assert.equal(isPristine(matrix), true);
});

test("a very low budget reports budgetExceeded without throwing, and restores the matrix", () => {
    const matrix = buildMatrix();
    const before = snapshot(matrix);
    const result = search(matrix, { limit: 1, budget: 1 });
    assert.equal(result.budgetExceeded, true);
    assert.deepEqual(snapshot(matrix), before);
});

test("randomize=true requires a function rng", () => {
    const matrix = buildMatrix();
    assert.throws(() => search(matrix, { randomize: true, rng: 42 }), TypeError);
});

test("randomize=true still yields a valid complete grid", () => {
    const matrix = buildMatrix();
    let calls = 0;
    const rng = () => { calls++; return 0.5; };
    const result = search(matrix, { limit: 1, randomize: true, rng });
    assert.equal(result.count, 1);
    assert.ok(calls > 0);
});

test("limit and budget must be positive integers", () => {
    const matrix = buildMatrix();
    assert.throws(() => search(matrix, { limit: 0 }), RangeError);
    assert.throws(() => search(matrix, { budget: 0 }), RangeError);
});
