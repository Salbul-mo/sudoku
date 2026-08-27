// The deductions the rush mode is allowed to ask for, and the evidence each
// one rests on.
//
// A technique here must determine one cell outright -- the game marks a cell
// and asks for its digit, so a technique that merely eliminates candidates has
// nothing to ask. That rules out pointing pairs and friends for now; they are
// two-step deductions and need a way to show the intermediate step.
//
// Every candidate carries the units its deduction actually used. That list is
// what the focus view paints, which is why it is computed here rather than in
// the view: the board can only dim what the engine can justify. Masking a
// board down to those units and re-deriving the deduction is how the tests
// check this file is telling the truth (T-B01-13).
//
// Everything is pure. Callers own their boards; nothing here mutates them.
import { CELLS, DIM, PEERS, UNITS, ROW_OF, COL_OF, BOX_OF } from "../core/spec.js";

const ALL_DIGITS = 0x1FF;

// UNITS is laid out rows 0..8, columns 9..17, boxes 18..26 (core/spec.js), and
// the whole file leans on that order rather than re-deriving it per call.
const FIRST_COL_UNIT = DIM;
const FIRST_BOX_UNIT = 2 * DIM;

export const TECHNIQUES = Object.freeze(["naked-single", "hidden-single-box", "hidden-single-line"]);

// Hardest first. The engine walks this order, so a run offers the hardest
// deduction the current schedule allows rather than whatever it finds first.
export const HARDNESS = Object.freeze(["hidden-single-line", "hidden-single-box", "naked-single"]);

// How much of the board the player is shown. "units" -- the target cell's own
// row, column and box -- is deliberately absent: measurement showed it hides
// the crosshatch a hidden single needs, making 100% of them unsolvable.
export const ASSISTS = Object.freeze(["evidence", "band", "off"]);

const bit = (digit) => 1 << (digit - 1);
const popcount = (mask) => { let n = 0; while (mask) { mask &= mask - 1; n++; } return n; };
const lowestDigit = (mask) => Math.log2(mask & -mask) + 1;

const rowUnit = (index) => ROW_OF[index];
const colUnit = (index) => FIRST_COL_UNIT + COL_OF[index];
const boxUnit = (index) => FIRST_BOX_UNIT + BOX_OF[index];
const unitsOfCell = (index) => [rowUnit(index), colUnit(index), boxUnit(index)];

/**
 * Candidate masks for the whole board in one pass.
 *
 * Three finders read the same table, so building it once is not only cheaper
 * but the only way to guarantee they all judge the same position.
 */
export function buildCandidates(values) {
    if (values == null || values.length !== CELLS) {
        throw new RangeError(`values must have length ${CELLS}, got ${values?.length}`);
    }
    const out = new Uint16Array(CELLS);
    for (let i = 0; i < CELLS; i++) {
        if (values[i] !== 0) continue;
        let used = 0;
        for (const peer of PEERS[i]) {
            const value = values[peer];
            if (value !== 0) used |= bit(value);
        }
        out[i] = ALL_DIGITS & ~used;
    }
    return out;
}

// Which of the target's three units are needed to rule out the other eight
// digits. Usually not all three: measured, one unit suffices 35% of the time
// and two 60%, so showing all three would be noise more often than not.
//
// Greedy, and the tie-break is the lower unit id, because two runs of the same
// seed have to paint the same board -- a Map iteration order or an unstable
// sort would make replays diverge.
function evidenceForNaked(values, candidates, index) {
    const need = ALL_DIGITS & ~candidates[index];
    const units = unitsOfCell(index).sort((a, b) => a - b);
    const supply = units.map((unit) => {
        let mask = 0;
        for (const cell of UNITS[unit]) if (cell !== index && values[cell]) mask |= bit(values[cell]);
        return mask;
    });

    const chosen = [];
    let covered = 0;
    while ((covered & need) !== need) {
        let best = -1;
        let bestGain = -1;
        for (let k = 0; k < units.length; k++) {
            if (chosen.includes(units[k])) continue;
            const gain = popcount(supply[k] & need & ~covered);
            if (gain > bestGain) { bestGain = gain; best = k; } // ascending scan => lowest id wins
        }
        // Unreachable for a real naked single -- its own units hold all eight
        // digits by definition -- but returning the full set beats returning a
        // set that does not justify the answer.
        if (best < 0 || bestGain <= 0) return units;
        chosen.push(units[best]);
        covered |= supply[best];
    }
    return chosen.sort((a, b) => a - b);
}

// The crosshatch: for a digit confined to one cell of a unit, every other
// empty cell in that unit is blocked by a peer holding that digit, and the
// line that peer sits on is the evidence. The questioned unit is part of the
// evidence too -- "only here" is a statement about that unit, so the player
// has to see all of it.
function evidenceForHidden(values, unit, digit, target) {
    const blocked = UNITS[unit].filter((cell) => cell !== target && values[cell] === 0);
    const blockers = new Map(); // unit id -> the cells it accounts for
    for (const cell of blocked) {
        for (const peer of PEERS[cell]) {
            if (values[peer] !== digit) continue;
            for (const candidateUnit of unitsOfCell(peer)) {
                if (candidateUnit === unit) continue;
                if (!blockers.has(candidateUnit)) blockers.set(candidateUnit, new Set());
                blockers.get(candidateUnit).add(cell);
            }
        }
    }

    const remaining = new Set(blocked);
    const ordered = [...blockers.keys()].sort((a, b) => a - b);
    const chosen = [];
    while (remaining.size > 0) {
        let best = -1;
        let bestGain = 0;
        for (const candidateUnit of ordered) {
            if (chosen.includes(candidateUnit)) continue;
            let gain = 0;
            for (const cell of blockers.get(candidateUnit)) if (remaining.has(cell)) gain++;
            if (gain > bestGain) { bestGain = gain; best = candidateUnit; }
        }
        // No unit accounts for what is left: the elimination came from cells
        // inside the questioned unit alone, which the evidence set cannot
        // express. Dropping the candidate is honest; offering it would ask the
        // player to see something the board never shows.
        if (best < 0) return null;
        chosen.push(best);
        for (const cell of blockers.get(best)) remaining.delete(cell);
    }
    return [unit, ...chosen].sort((a, b) => a - b);
}

/**
 * Every deduction available on this board, with its evidence.
 *
 * A cell that is both a naked single and a hidden single is reported as the
 * naked one: it is the easier reading, and counting it twice would let the
 * harder tier claim a cell nobody had to work for.
 */
export function findAll(values) {
    const candidates = buildCandidates(values);
    const out = [];

    for (let i = 0; i < CELLS; i++) {
        if (values[i] !== 0) continue;
        const mask = candidates[i];
        if (mask !== 0 && (mask & (mask - 1)) === 0) {
            out.push({
                index: i,
                digit: lowestDigit(mask),
                technique: "naked-single",
                unit: null,
                units: evidenceForNaked(values, candidates, i),
            });
        }
    }

    for (let unit = 0; unit < UNITS.length; unit++) {
        for (let digit = 1; digit <= DIM; digit++) {
            let spot = -1;
            let count = 0;
            for (const cell of UNITS[unit]) {
                if (values[cell] !== 0 || !(candidates[cell] & bit(digit))) continue;
                spot = cell;
                if (++count > 1) break;
            }
            if (count !== 1) continue;
            if (popcount(candidates[spot]) === 1) continue; // already reported as naked
            const units = evidenceForHidden(values, unit, digit, spot);
            if (units === null) continue;
            out.push({
                index: spot,
                digit,
                technique: unit >= FIRST_BOX_UNIT ? "hidden-single-box" : "hidden-single-line",
                unit,
                units,
            });
        }
    }

    return out;
}

// A row or column widens to the three boxes it crosses; a box is its own band.
// This is what turns the evidence into a view with decoys in it, so the
// highlight stops being a diagram of the answer.
function bandBoxes(unit) {
    if (unit < FIRST_COL_UNIT) {
        const band = ((unit / 3) | 0) * 3;
        return [FIRST_BOX_UNIT + band, FIRST_BOX_UNIT + band + 1, FIRST_BOX_UNIT + band + 2];
    }
    if (unit < FIRST_BOX_UNIT) {
        const stack = ((unit - FIRST_COL_UNIT) / 3) | 0;
        return [FIRST_BOX_UNIT + stack, FIRST_BOX_UNIT + stack + 3, FIRST_BOX_UNIT + stack + 6];
    }
    return [unit];
}

/** The units an assist level puts on screen, or null for "the whole board". */
export function assistUnits(candidate, assist) {
    if (assist === "off") return null;
    if (assist === "evidence") return new Set(candidate.units);
    if (assist === "band") return new Set([...candidate.units, ...candidate.units.flatMap(bandBoxes)]);
    throw new RangeError(`unknown assist: ${assist}`);
}

/** The cells an assist level puts on screen, or null for "the whole board". */
export function assistCells(candidate, assist) {
    const units = assistUnits(candidate, assist);
    if (units === null) return null;
    const cells = new Set();
    for (const unit of units) for (const cell of UNITS[unit]) cells.add(cell);
    cells.add(candidate.index);
    return cells;
}

/**
 * Can the player answer this from what the assist level shows?
 *
 * The invariant that keeps the two halves of the design honest: the schedule
 * decides how much to show, the finders decide what is needed, and nothing
 * stops those two drifting apart except this check. Without it, an assist
 * level narrower than the evidence produces an unanswerable step -- which is
 * exactly what measurement found for the old "target's own units" level.
 */
export function visibleSupports(candidate, assist) {
    if (assist === "off") return true;
    const shown = assistUnits(candidate, assist);
    return candidate.units.every((unit) => shown.has(unit));
}
