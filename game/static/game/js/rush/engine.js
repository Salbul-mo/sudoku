// Picks the cell the player is asked to fill next.
//
// Which deduction may be asked for is the caller's decision (options.allow);
// the techniques themselves live in techniques.js. When the allowed set has
// nothing on offer this reveals a correct cell and looks again, which is what
// keeps the game moving instead of stalling on a position nobody can crack in
// time. Widening the allowed set makes that fallback rarer: measured over
// 2,400 steps, allowing hidden singles removed it entirely.
//
// Everything here is pure. The caller owns the board (core/store.js) and
// applies whatever this returns; nothing in this file mutates its arguments.
import { CELLS, PEERS } from "../core/spec.js";
import { ASSISTS, HARDNESS, TECHNIQUES, findAll, visibleSupports } from "./techniques.js";

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

// What the caller is asking for. Defaulting to naked singles alone keeps every
// existing three-argument call behaving exactly as it did before techniques
// were a thing (T-B01-04), so the difficulty schedule is the only thing that
// can change what a run offers.
function normalizeOptions(options) {
    const requested = options?.allow?.length ? options.allow : ["naked-single"];
    for (const technique of requested) {
        if (!TECHNIQUES.includes(technique)) {
            throw new RangeError(`unknown technique: ${technique}`);
        }
    }
    const assist = options?.assist ?? "off";
    if (!ASSISTS.includes(assist)) throw new RangeError(`unknown assist: ${assist}`);

    const maxEvidenceUnits = options?.maxEvidenceUnits ?? Infinity;
    const boundedByAnInteger = Number.isInteger(maxEvidenceUnits) && maxEvidenceUnits >= 1;
    if (maxEvidenceUnits !== Infinity && !boundedByAnInteger) {
        throw new RangeError(`maxEvidenceUnits must be a positive integer, got ${maxEvidenceUnits}`);
    }
    return { allow: new Set(requested), assist, maxEvidenceUnits };
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
 * The reveal loop terminates. Each pass that finds nothing to ask fills one
 * empty cell, so the number of empties strictly decreases; and once a single
 * empty cell is left its twenty peers hold the other eight digits of its row,
 * column and box, leaving exactly one candidate -- a naked single, which every
 * allowed set contains. So the loop cannot pass the cell count without finding
 * a target.
 *
 * @param options.allow             techniques that may be asked for
 * @param options.assist            how much of the board the player will see
 * @param options.maxEvidenceUnits  cap on how far the evidence may spread
 */
export function nextTarget(values, solution, rng = Math.random, options) {
    const { allow, assist, maxEvidenceUnits } = normalizeOptions(options);
    validate(values, solution);

    const work = Uint8Array.from(values);
    const revealed = [];

    for (let pass = 0; pass <= MAX_REVEALS; pass++) {
        const empties = [];
        for (let i = 0; i < CELLS; i++) if (work[i] === 0) empties.push(i);
        if (empties.length === 0) return null;

        // Filtered before the pick, not after: a candidate whose evidence does
        // not fit inside what the assist level shows is one the player cannot
        // answer, and offering it would be a step nobody can win.
        const pool = findAll(work).filter((candidate) => (
            allow.has(candidate.technique)
            && candidate.units.length <= maxEvidenceUnits
            && visibleSupports(candidate, assist)
        ));
        // Hardest tier that has anything on offer -- otherwise a board full of
        // naked singles would never surface the deduction the schedule just
        // unlocked.
        for (const technique of HARDNESS) {
            if (!allow.has(technique)) continue;
            const tier = pool.filter((candidate) => candidate.technique === technique);
            if (tier.length === 0) continue;
            const chosen = tier[Math.floor(rng() * tier.length)];
            // The digit comes from the solution rather than from the finder:
            // if the two ever disagree that is a bug in the finder, and the
            // board must not be poisoned while it is being found.
            return { ...chosen, digit: solution[chosen.index], revealed };
        }

        const index = empties[Math.floor(rng() * empties.length)];
        work[index] = solution[index];
        revealed.push(index);
    }

    throw new Error("nextTarget: reveal loop failed to terminate");
}
