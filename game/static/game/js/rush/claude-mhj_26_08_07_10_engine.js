// Picks the cell the player is asked to fill next.
//
// The game only ever asks for a "naked single" -- a cell whose peers leave
// exactly one digit available -- because that is the one deduction a player
// can reliably make inside a few seconds. A unique-solution puzzle does not
// always have one: plenty of positions need a hidden single or worse. When
// none exists this reveals a correct cell and looks again, which is what keeps
// the game moving instead of stalling on a position nobody can crack in time.
//
// Everything here is pure. The caller owns the board (core/store.js) and
// applies whatever this returns; nothing in this file mutates its arguments.
import { CELLS, PEERS } from "../core/spec.js";

// Bits 0..8 stand for digits 1..9, the same convention session.candidates uses.
const ALL_DIGITS = 0x1FF;

// The loop below cannot run longer than the number of cells -- see the comment
// on nextTarget -- so anything past that is a bug in this file, not a puzzle
// the game failed to handle. Crashing beats spinning the tab forever.
const MAX_REVEALS = CELLS;

function assertLength(board, name) {
    if (board == null || board.length !== CELLS) {
        throw new RangeError(`${name} must have length ${CELLS}, got ${board?.length}`);
    }
}

function assertIndex(index) {
    if (!Number.isInteger(index) || index < 0 || index >= CELLS) {
        throw new RangeError(`index must be an integer in 0..${CELLS - 1}, got ${index}`);
    }
}

// Digits still legal in this cell. Callers past the entry point have already
// been validated, so the hot path does no checking of its own.
export function candidatesFor(values, index) {
    assertLength(values, "values");
    assertIndex(index);
    if (values[index] !== 0) return 0;
    let used = 0;
    for (const peer of PEERS[index]) {
        const value = values[peer];
        if (value !== 0) used |= 1 << (value - 1);
    }
    return ALL_DIGITS & ~used;
}

function candidatesUnchecked(values, index) {
    let used = 0;
    for (const peer of PEERS[index]) {
        const value = values[peer];
        if (value !== 0) used |= 1 << (value - 1);
    }
    return ALL_DIGITS & ~used;
}

// Exactly one bit set. Cheaper than counting bits, and one candidate is the
// only count this game cares about.
function isSingle(mask) {
    return mask !== 0 && (mask & (mask - 1)) === 0;
}

function validate(values, solution) {
    assertLength(values, "values");
    assertLength(solution, "solution");
    for (let i = 0; i < CELLS; i++) {
        if (solution[i] === 0) {
            throw new RangeError(`solution must be complete; cell ${i} is empty`);
        }
        if (values[i] !== 0 && values[i] !== solution[i]) {
            throw new Error(
                `values disagrees with solution at cell ${i}: ${values[i]} vs ${solution[i]}`,
            );
        }
    }
}

/**
 * The next cell to ask for, plus any cells that had to be given away to
 * produce it.
 *
 * Returns null when the board is already full.
 *
 * The reveal loop terminates. Each pass that finds no naked single fills one
 * empty cell, so the number of empties strictly decreases; and once a single
 * empty cell is left its twenty peers hold the other eight digits of its row,
 * column and box, leaving exactly one candidate. So the loop cannot pass the
 * cell count without finding a target.
 */
export function nextTarget(values, solution, rng = Math.random) {
    validate(values, solution);

    const work = Uint8Array.from(values);
    const revealed = [];

    for (let pass = 0; pass <= MAX_REVEALS; pass++) {
        const empties = [];
        const singles = [];
        for (let i = 0; i < CELLS; i++) {
            if (work[i] !== 0) continue;
            empties.push(i);
            if (isSingle(candidatesUnchecked(work, i))) singles.push(i);
        }

        if (empties.length === 0) return null;
        if (singles.length > 0) {
            const index = singles[Math.floor(rng() * singles.length)];
            return { index, digit: solution[index], revealed };
        }

        const index = empties[Math.floor(rng() * empties.length)];
        work[index] = solution[index];
        revealed.push(index);
    }

    throw new Error("nextTarget: reveal loop failed to terminate");
}
