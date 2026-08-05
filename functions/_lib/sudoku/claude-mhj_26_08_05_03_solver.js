// Board-level solving on top of the reusable exact-cover matrix. Ported
// from game/sudoku/solver.py. Unlike the Python version, there is no
// per-thread matrix cache: a Cloudflare Worker/Pages Function isolate runs
// single-threaded JS, so one lazily-built module-level matrix is safe to
// reuse across every call in the isolate's lifetime (search() always
// restores the matrix to its entry state, so reuse is what makes the
// "build once" cost worth paying).
import { DIM, CELLS, peersForbid } from "./claude-mhj_26_08_05_01_spec.js";
import { buildMatrix, applyGivens, removeGivens, search, DEFAULT_BUDGET } from "./claude-mhj_26_08_05_02_dlx.js";

// "BUDGET_EXCEEDED" is deliberately distinct from the three real answers.
// It means the search ran out of iterations without settling the question;
// callers must treat it as "not proven unique", never as a verdict.
export const Uniqueness = Object.freeze({
    NO_SOLUTION: "NO_SOLUTION",
    UNIQUE: "UNIQUE",
    MULTIPLE: "MULTIPLE",
    BUDGET_EXCEEDED: "BUDGET_EXCEEDED",
});

let cachedMatrix = null;
function matrixFor() {
    if (cachedMatrix === null) cachedMatrix = buildMatrix();
    return cachedMatrix;
}

function checkBoard(board) {
    if (!board || board.length !== CELLS) {
        throw new RangeError(`board must have length ${CELLS}, got ${board?.length}`);
    }
    for (let i = 0; i < CELLS; i++) {
        const v = board[i];
        if (!Number.isInteger(v) || v < 0 || v > DIM) {
            throw new RangeError(`board[${i}] out of range: ${v}`);
        }
    }
}

export function rowsToBoard(rows) {
    const board = new Array(CELLS).fill(0);
    for (const rowId of rows) {
        board[Math.floor(rowId / DIM)] = (rowId % DIM) + 1;
    }
    return board;
}

// Return one completed grid, or null if there is none (or the budget ran out).
export function solve(board, budget = DEFAULT_BUDGET) {
    checkBoard(board);
    const matrix = matrixFor();
    const handle = applyGivens(matrix, board);
    if (!handle.consistent) {
        removeGivens(matrix, handle);
        return null;
    }
    const outcome = search(matrix, { limit: 1, budget });
    removeGivens(matrix, handle);
    if (outcome.budgetExceeded || outcome.count === 0) return null;
    const filled = board.slice();
    for (const rowId of outcome.rows) {
        filled[Math.floor(rowId / DIM)] = (rowId % DIM) + 1;
    }
    return filled;
}

// Count solutions, stopping at `limit`. A budget overrun returns the count
// found so far (a lower bound) -- use classify() when the difference matters.
export function countSolutions(board, limit = 2, budget = DEFAULT_BUDGET) {
    checkBoard(board);
    const matrix = matrixFor();
    const handle = applyGivens(matrix, board);
    if (!handle.consistent) {
        removeGivens(matrix, handle);
        return 0;
    }
    const outcome = search(matrix, { limit, budget, collect: false });
    removeGivens(matrix, handle);
    return outcome.count;
}

// Decide whether `board` has zero, one, or several solutions.
export function classify(board, budget = DEFAULT_BUDGET) {
    checkBoard(board);
    const matrix = matrixFor();
    const handle = applyGivens(matrix, board);
    if (!handle.consistent) {
        removeGivens(matrix, handle);
        return Uniqueness.NO_SOLUTION;
    }
    const outcome = search(matrix, { limit: 2, budget, collect: false });
    removeGivens(matrix, handle);
    if (outcome.budgetExceeded) return Uniqueness.BUDGET_EXCEEDED;
    if (outcome.count === 0) return Uniqueness.NO_SOLUTION;
    return outcome.count === 1 ? Uniqueness.UNIQUE : Uniqueness.MULTIPLE;
}

// True only when uniqueness was *proven*; an exhausted budget yields false.
export function hasUniqueSolution(board, budget = DEFAULT_BUDGET) {
    return classify(board, budget) === Uniqueness.UNIQUE;
}

// Can cell `index` hold something other than `excludeDigit` in some
// solution of `board`? This is the cheap uniqueness probe used while
// digging holes (see generator.js::digHoles). It relies on a caller-side
// invariant: `board` with `index` set to `excludeDigit` must already be
// known to have exactly one solution. Given that, any second solution of
// the current board (with index empty) has to differ at `index` -- if it
// agreed there it would also solve the previous board and therefore be the
// same grid. So probing the alternative values at one cell settles
// uniqueness, without re-deriving the solution already known.
//
// A budget overrun is folded into `true` ("an alternative might exist, not
// proven safe to remove") so the digging loop in generator.js can treat the
// return value as a plain "keep this clue?" boolean, matching
// game/sudoku/generator.py::dig_holes's `rival is False` check.
export function alternativeExists(board, index, excludeDigit, budget = DEFAULT_BUDGET) {
    const matrix = matrixFor();
    const probe = board.slice();
    for (let value = 1; value <= DIM; value++) {
        if (value === excludeDigit) continue;
        if (peersForbid(board, index, value)) continue;
        probe[index] = value;
        const handle = applyGivens(matrix, probe);
        if (!handle.consistent) {
            removeGivens(matrix, handle);
            continue;
        }
        const outcome = search(matrix, { limit: 1, budget, collect: false });
        removeGivens(matrix, handle);
        if (outcome.budgetExceeded) return true; // not proven safe -- keep the clue
        if (outcome.count) return true;
    }
    return false;
}
