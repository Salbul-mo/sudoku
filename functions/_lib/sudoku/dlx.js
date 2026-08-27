// Dancing Links (Algorithm X) over flat integer arrays, searched
// iteratively. Ported from game/sudoku/dlx.py::DancingLinks -- same node
// layout (root + column headers + four body nodes per candidate row), same
// cover/uncover primitives, same three-state (DESCEND/ADVANCE/BACKTRACK)
// iterative search over an explicit stack. See that module's docstring for
// the profiling rationale (array-of-ints beats objects; loop beats
// recursion because Workers/Node still have a bounded call stack).
import { DIM, CELLS, CANDIDATE_COUNT, CONSTRAINT_COUNT, candidateIndex, columnsForPlacement } from "./spec.js";

// Safety valve against pathological search trees, not a tuning knob --
// mirrors game/sudoku/dlx.py::default_budget's 9x9 entry (200,000
// iterations bounds a single check to ~0.2s at the profiled throughput).
export const DEFAULT_BUDGET = 200_000;

const NODE_COUNT = 1 + CONSTRAINT_COUNT + 4 * CANDIDATE_COUNT; // 3241 for 9x9

export function buildMatrix() {
    const size = NODE_COUNT;
    const L = new Array(size).fill(0);
    const R = new Array(size).fill(0);
    const U = new Array(size).fill(0);
    const D = new Array(size).fill(0);
    const COL = new Array(size).fill(0);
    const ROW = new Array(size).fill(-1);
    const SIZE = new Array(size).fill(0);

    // Node 0 is the root; nodes 1..CONSTRAINT_COUNT are column headers.
    for (let c = 1; c <= CONSTRAINT_COUNT; c++) {
        L[c] = c - 1;
        R[c] = c < CONSTRAINT_COUNT ? c + 1 : 0;
        U[c] = D[c] = c;
        COL[c] = c;
    }
    L[0] = CONSTRAINT_COUNT;
    R[0] = 1;

    const rowHead = new Array(CANDIDATE_COUNT).fill(0);
    let n = CONSTRAINT_COUNT + 1;
    for (let r = 0; r < DIM; r++) {
        for (let c = 0; c < DIM; c++) {
            for (let v = 1; v <= DIM; v++) {
                const rid = candidateIndex(r, c, v);
                const first = n;
                rowHead[rid] = first;
                const cols = columnsForPlacement(r, c, v);
                for (let k = 0; k < 4; k++) {
                    const col = cols[k] + 1; // headers are 1-based; column 0 is the root
                    U[n] = U[col];
                    D[n] = col;
                    D[U[col]] = n;
                    U[col] = n;
                    SIZE[col] += 1;
                    COL[n] = col;
                    ROW[n] = rid;
                    L[n] = k ? n - 1 : first + 3;
                    R[n] = k < 3 ? n + 1 : first;
                    n += 1;
                }
            }
        }
    }

    return { L, R, U, D, COL, ROW, SIZE, rowHead, numCols: CONSTRAINT_COUNT, maxDepth: CELLS + 1 };
}

export function cover(matrix, c) {
    const { L, R, U, D, COL, SIZE } = matrix;
    R[L[c]] = R[c];
    L[R[c]] = L[c];
    let i = D[c];
    while (i !== c) {
        let j = R[i];
        while (j !== i) {
            U[D[j]] = U[j];
            D[U[j]] = D[j];
            SIZE[COL[j]] -= 1;
            j = R[j];
        }
        i = D[i];
    }
}

export function uncover(matrix, c) {
    const { L, R, U, D, COL, SIZE } = matrix;
    let i = U[c];
    while (i !== c) {
        let j = L[i];
        while (j !== i) {
            SIZE[COL[j]] += 1;
            U[D[j]] = j;
            D[U[j]] = j;
            j = L[j];
        }
        i = U[i];
    }
    R[L[c]] = c;
    L[R[c]] = c;
}

function isActive(matrix, c) {
    return matrix.R[matrix.L[c]] === c;
}

// Force candidate row `rid` into the solution by covering its columns.
// Returns false (and stops early) if a column is already covered, which
// means the applied givens contradict each other. Columns covered before
// the clash are still recorded in `applied` so the caller can unwind them.
function applyRow(matrix, rid, applied) {
    const { R, COL } = matrix;
    const head = matrix.rowHead[rid];
    let j = head;
    while (true) {
        const col = COL[j];
        if (!isActive(matrix, col)) return false;
        j = R[j];
        if (j === head) break;
    }
    j = head;
    while (true) {
        const col = COL[j];
        cover(matrix, col);
        applied.push(col);
        j = R[j];
        if (j === head) break;
    }
    return true;
}

// Layer `board`'s clues onto the matrix. Returns a handle to pass to
// removeGivens(); `handle.consistent === false` means the clues contradict
// each other (the matrix is still safe to unwind via removeGivens).
export function applyGivens(matrix, board) {
    if (board.length !== CELLS) {
        throw new RangeError(`board must have length ${CELLS}, got ${board.length}`);
    }
    const applied = [];
    let consistent = true;
    for (let index = 0; index < CELLS; index++) {
        const value = board[index];
        if (!value) continue;
        if (!Number.isInteger(value) || value < 0 || value > DIM) {
            throw new RangeError(`board[${index}] out of range: ${value}`);
        }
        const row = Math.floor(index / DIM);
        const col = index % DIM;
        if (!applyRow(matrix, candidateIndex(row, col, value), applied)) {
            consistent = false;
            break;
        }
    }
    return { appliedCols: applied, consistent };
}

// Exact inverse of applyGivens: unwinds in reverse cover order, always
// restoring the matrix regardless of whether applyGivens found a
// contradiction.
export function removeGivens(matrix, handle) {
    const { appliedCols } = handle;
    for (let i = appliedCols.length - 1; i >= 0; i--) {
        uncover(matrix, appliedCols[i]);
    }
}

function unwind(matrix, stackCol, stackNode, depth) {
    while (depth > 0) {
        depth -= 1;
        const node = stackNode[depth];
        const col = stackCol[depth];
        if (node !== col) {
            let j = matrix.L[node];
            while (j !== node) {
                uncover(matrix, matrix.COL[j]);
                j = matrix.L[j];
            }
        }
        uncover(matrix, col);
    }
}

// Explore the matrix iteratively, stopping after `limit` solutions.
// Mirrors DancingLinks.search's three-state machine (DESCEND/ADVANCE/
// BACKTRACK) over an explicit stack -- see game/sudoku/dlx.py for the full
// rationale. The matrix is always returned to its entry state, on every
// exit path.
export function search(matrix, options = {}) {
    const { limit = 1, budget = DEFAULT_BUDGET, randomize = false, rng = null, collect = true } = options;
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`limit must be >= 1, got ${limit}`);
    if (!Number.isInteger(budget) || budget < 1) throw new RangeError(`budget must be >= 1, got ${budget}`);
    if (randomize && typeof rng !== "function") {
        throw new TypeError("search: options.rng must be a function when randomize is true");
    }

    const { L, R, U, D, COL, ROW, SIZE } = matrix;
    const depthLimit = matrix.maxDepth;
    const stackCol = new Array(depthLimit).fill(0);
    const stackNode = new Array(depthLimit).fill(0);
    const stackStart = new Array(depthLimit).fill(0);

    const DESCEND = 0, ADVANCE = 1, BACKTRACK = 2;
    let state = DESCEND;
    let depth = 0;
    let count = 0;
    let iterations = 0;
    let solutionRows = [];

    while (true) {
        iterations += 1;
        if (iterations > budget) {
            unwind(matrix, stackCol, stackNode, state === ADVANCE ? depth + 1 : depth);
            return { count, rows: solutionRows, iterations, budgetExceeded: true };
        }

        if (state === DESCEND) {
            if (R[0] === 0) { // every column covered -> exact cover found
                count += 1;
                if (collect && solutionRows.length === 0) {
                    solutionRows = [];
                    for (let d = 0; d < depth; d++) solutionRows.push(ROW[stackNode[d]]);
                }
                if (count >= limit) {
                    unwind(matrix, stackCol, stackNode, depth);
                    return { count, rows: solutionRows, iterations, budgetExceeded: false };
                }
                state = BACKTRACK;
                continue;
            }

            // MRV: fewest candidates first. A column of size 1 is forced, so
            // nothing can beat it and the scan stops early.
            let best = R[0];
            let bestSize = SIZE[best];
            let j = R[best];
            while (j !== 0) {
                const s = SIZE[j];
                if (s < bestSize) {
                    best = j;
                    bestSize = s;
                    if (s <= 1) break;
                }
                j = R[j];
            }

            if (bestSize === 0) { // dead end: an unsatisfiable constraint
                state = BACKTRACK;
                continue;
            }

            cover(matrix, best);
            stackCol[depth] = best;
            let start = D[best];
            if (randomize) {
                const steps = Math.floor(rng() * bestSize);
                for (let i = 0; i < steps; i++) start = D[start];
            }
            stackStart[depth] = start;
            stackNode[depth] = best; // header doubles as "nothing tried yet"
            state = ADVANCE;
        } else if (state === ADVANCE) {
            const col = stackCol[depth];
            let node = stackNode[depth];
            if (node !== col) {
                let j = L[node]; // undo in reverse of the covering order
                while (j !== node) {
                    uncover(matrix, COL[j]);
                    j = L[j];
                }
                node = D[node];
                if (node === col) node = D[col]; // skip the header when wrapping around
                if (node === stackStart[depth]) { // full cycle -> exhausted
                    uncover(matrix, col);
                    state = BACKTRACK;
                    continue;
                }
            } else {
                node = stackStart[depth];
            }

            stackNode[depth] = node;
            let j = R[node];
            while (j !== node) {
                cover(matrix, COL[j]);
                j = R[j];
            }
            depth += 1;
            state = DESCEND;
        } else { // BACKTRACK
            depth -= 1;
            if (depth < 0) {
                return { count, rows: solutionRows, iterations, budgetExceeded: false };
            }
            state = ADVANCE;
        }
    }
}

// Test-only diagnostics, mirroring DancingLinks.snapshot()/is_pristine().
export function snapshot(matrix) {
    return {
        L: matrix.L.slice(), R: matrix.R.slice(), U: matrix.U.slice(),
        D: matrix.D.slice(), SIZE: matrix.SIZE.slice(),
    };
}

export function activeColumns(matrix) {
    let count = 0;
    let c = matrix.R[0];
    while (c !== 0) {
        count += 1;
        c = matrix.R[c];
    }
    return count;
}

export function isPristine(matrix) {
    return activeColumns(matrix) === matrix.numCols;
}
