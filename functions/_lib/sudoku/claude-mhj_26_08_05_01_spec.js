// 9x9 Sudoku geometry: cell/box/candidate index math shared by the DLX
// matrix builder, solver, and generator. Ported from game/sudoku/spec.py's
// SudokuSpec(9, 3, 3) -- this module only needs the 9x9 case (the frontend
// is hardcoded to dim=9 via game/static/game/js/core/spec.js), so the
// general box_w/box_h parameterization from the Python version is not
// carried over.
export const DIM = 9;
export const CELLS = 81;
export const CANDIDATE_COUNT = DIM * DIM * DIM; // 729
export const CONSTRAINT_COUNT = 4 * DIM * DIM; // 324

function checkCoord(row, col) {
    if (!Number.isInteger(row) || row < 0 || row >= DIM) {
        throw new RangeError(`row out of range: ${row}`);
    }
    if (!Number.isInteger(col) || col < 0 || col >= DIM) {
        throw new RangeError(`col out of range: ${col}`);
    }
}

function checkDigit(digit) {
    if (!Number.isInteger(digit) || digit < 1 || digit > DIM) {
        throw new RangeError(`digit out of range: ${digit}`);
    }
}

export function cellIndex(row, col) {
    checkCoord(row, col);
    return row * DIM + col;
}

export function boxIndex(row, col) {
    checkCoord(row, col);
    return Math.floor(row / 3) * 3 + Math.floor(col / 3);
}

// v is 1-based (matches board values); the underlying row id is 0-based.
export function candidateIndex(row, col, digit) {
    checkCoord(row, col);
    checkDigit(digit);
    return (row * DIM + col) * DIM + (digit - 1);
}

export function candidateFromIndex(idx) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= CANDIDATE_COUNT) {
        throw new RangeError(`candidate index out of range: ${idx}`);
    }
    const v = idx % DIM;
    const cell = Math.floor(idx / DIM);
    return { row: Math.floor(cell / DIM), col: cell % DIM, digit: v + 1 };
}

// The four 0-based constraint columns covered by placing `digit` at (row,col).
export function columnsForPlacement(row, col, digit) {
    checkCoord(row, col);
    checkDigit(digit);
    const block = DIM * DIM;
    const v = digit - 1;
    const box = boxIndex(row, col);
    return [
        row * DIM + col,
        block + row * DIM + v,
        2 * block + col * DIM + v,
        3 * block + box * DIM + v,
    ];
}

// True if `value` already appears among the peers (row/column/box) of the
// cell at `index`, ignoring `index` itself. Used to skip hopeless candidates
// before handing them to the solver (mirrors SudokuSpec.peers_forbid).
export function peersForbid(board, index, value) {
    const row = Math.floor(index / DIM);
    const col = index % DIM;
    const rowBase = row * DIM;
    for (let c = 0; c < DIM; c++) {
        if (board[rowBase + c] === value && rowBase + c !== index) return true;
    }
    for (let r = 0; r < DIM; r++) {
        if (board[r * DIM + col] === value && r * DIM + col !== index) return true;
    }
    const r0 = Math.floor(row / 3) * 3;
    const c0 = Math.floor(col / 3) * 3;
    for (let r = r0; r < r0 + 3; r++) {
        for (let c = c0; c < c0 + 3; c++) {
            if (board[r * DIM + c] === value && r * DIM + c !== index) return true;
        }
    }
    return false;
}
