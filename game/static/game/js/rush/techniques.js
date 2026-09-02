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

// The deductions that prune candidates instead of filling a cell. Kept out of
// TECHNIQUES rather than appended to it: rush/engine.js validates its allowed
// set against TECHNIQUES, and a technique that fills no cell would have the
// rush mode mark a cell and ask for a digit no deduction can supply. Only the
// learn page, which can ask for a pruning, reads this list.
export const ELIMINATION_TECHNIQUES = Object.freeze([
    "pointing", "claiming", "naked-pair", "hidden-pair",
]);

export const ALL_TECHNIQUES = Object.freeze([...TECHNIQUES, ...ELIMINATION_TECHNIQUES]);

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

// Which of a cell's three units are needed to rule out the digits its
// candidate mask does not contain. Usually not all three: measured for a naked
// single, one unit suffices 35% of the time and two 60%, so showing all three
// would be noise more often than not.
//
// Generalised from "the other eight digits" to "whatever this mask excludes"
// because a naked pair needs the same justification for a two-digit mask. That
// generalisation is why the give-up branch below returns null rather than the
// full unit set: for a naked single the cover always succeeds -- the cell's own
// units hold all eight digits by definition -- but for a wider mask it can
// genuinely fail, and answering "all three units" there would claim evidence
// that does not actually justify the mask.
//
// Greedy, and the tie-break is the lower unit id, because two runs of the same
// seed have to paint the same board -- a Map iteration order or an unstable
// sort would make replays diverge.
function evidenceForMask(values, candidates, index) {
    const need = ALL_DIGITS & ~candidates[index];
    if (need === 0) return unitsOfCell(index).sort((a, b) => a - b);
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
        // The units in hand cannot account for everything this mask excludes.
        // Dropping the deduction is honest; naming units that do not justify it
        // would put a highlight on screen the answer cannot be read from.
        if (best < 0 || bestGain <= 0) return null;
        chosen.push(units[best]);
        covered |= supply[best];
    }
    return chosen.sort((a, b) => a - b);
}

// The crosshatch: for a digit confined to some cells of a unit, every *other*
// empty cell in that unit is blocked by a peer holding that digit, and the line
// that peer sits on is the evidence. The questioned unit is part of the
// evidence too -- "only here" is a statement about that unit, so the player has
// to see all of it.
//
// `allowed` is a Set rather than the single target cell a hidden single has,
// because pointing, claiming and hidden pairs all make the same claim about a
// group of cells instead of one.
function evidenceForConfinement(values, unit, digit, allowed) {
    const blocked = UNITS[unit].filter((cell) => !allowed.has(cell) && values[cell] === 0);
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
            // Cannot be null for a single-candidate mask -- the cell's own
            // units hold the other eight digits by definition -- but the
            // generalised helper is allowed to give up, and a deduction with
            // no evidence must never reach the board.
            const units = evidenceForMask(values, candidates, i);
            if (units === null) continue;
            out.push({
                kind: "placement",
                index: i,
                digit: lowestDigit(mask),
                technique: "naked-single",
                unit: null,
                units,
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
            const units = evidenceForConfinement(values, unit, digit, new Set([spot]));
            if (units === null) continue;
            out.push({
                kind: "placement",
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

// ---------------------------------------------------------------- eliminations
//
// These prune candidates rather than fill a cell, so they carry a different
// shape from the placement finders above: `eliminations` is the answer, and it
// is a set of (cell, digit) pairs rather than one digit in one cell.
//
// Every one of them still owes the same debt the placement finders do -- the
// evidence it names must be enough to re-derive it. That is not free here. It
// is tempting to say a naked pair's evidence is just the unit it sits in, but
// "this cell holds exactly {2,5}" is a claim about the twenty peers that
// removed the other seven digits, and those peers are mostly outside that unit.
// Masking the board down to the unit alone widens the candidates and the pair
// evaporates. So each finder routes its claim through evidenceForMask or
// evidenceForConfinement and drops the deduction when neither can account for
// it -- the same policy the hidden-single finder has always used.

// (cell, digit) ascending, which is the order the learn page compares a
// player's marks against. An unstable order here would make an identical answer
// pass or fail depending on iteration order.
function sortEliminations(eliminations) {
    return eliminations.sort((a, b) => a.index - b.index || a.digit - b.digit);
}

const sortedUnique = (xs) => [...new Set(xs)].sort((a, b) => a - b);

// The unit every cell in `cells` shares, searched among one kind: "line" means
// the row and the column, "box" means the box. Returns -1 when they share none.
function sharedUnit(cells, kind) {
    const candidates = kind === "line"
        ? [rowUnit(cells[0]), colUnit(cells[0])]
        : [boxUnit(cells[0])];
    for (const unit of candidates) {
        if (cells.every((cell) => UNITS[unit].includes(cell))) return unit;
    }
    return -1;
}

/**
 * Pointing and claiming, which are one deduction read in two directions.
 *
 * `from` is the unit the digit is confined inside; the unit that confinement
 * spills into is derived. Box to line is pointing, line to box is claiming.
 */
function confinedElimination(values, candidates, from, digit, kind) {
    const spots = UNITS[from].filter(
        (cell) => values[cell] === 0 && (candidates[cell] & bit(digit)) !== 0,
    );
    // One spot is a hidden single. Reporting it here too would offer a pruning
    // when the board is actually handing the player a placement.
    if (spots.length < 2) return null;

    const to = sharedUnit(spots, kind);
    if (to === -1) return null;

    const inFrom = new Set(UNITS[from]);
    const victims = UNITS[to].filter(
        (cell) => values[cell] === 0 && !inFrom.has(cell) && (candidates[cell] & bit(digit)) !== 0,
    );
    if (victims.length === 0) return null;

    const units = evidenceForConfinement(values, from, digit, new Set(spots));
    if (units === null) return null;

    return {
        kind: "elimination",
        technique: kind === "line" ? "pointing" : "claiming",
        unit: from,
        digits: [digit],
        subject: sortedUnique(spots),
        eliminations: sortEliminations(victims.map((index) => ({ index, digit }))),
        // `to` joins the evidence because the elimination is a statement about
        // that unit; without it the player sees the confinement but not the
        // cells it acts on.
        units: sortedUnique([...units, to]),
    };
}

function findConfined(values, candidates) {
    const out = [];
    for (let digit = 1; digit <= DIM; digit++) {
        for (let box = FIRST_BOX_UNIT; box < UNITS.length; box++) {
            const found = confinedElimination(values, candidates, box, digit, "line");
            if (found !== null) out.push(found);
        }
        for (let line = 0; line < FIRST_BOX_UNIT; line++) {
            const found = confinedElimination(values, candidates, line, digit, "box");
            if (found !== null) out.push(found);
        }
    }
    return out;
}

/**
 * Naked pair: two cells in a unit whose candidates are the same two digits.
 * Between them they use both digits up, so no other cell in the unit can.
 */
function findNakedPairs(values, candidates) {
    const out = [];
    for (let unit = 0; unit < UNITS.length; unit++) {
        const empties = UNITS[unit].filter((cell) => values[cell] === 0);
        for (let a = 0; a < empties.length; a++) {
            const first = empties[a];
            if (popcount(candidates[first]) !== 2) continue;
            for (let b = a + 1; b < empties.length; b++) {
                const second = empties[b];
                if (candidates[second] !== candidates[first]) continue;

                const digits = [];
                for (let digit = 1; digit <= DIM; digit++) {
                    if (candidates[first] & bit(digit)) digits.push(digit);
                }
                const victims = [];
                for (const cell of empties) {
                    if (cell === first || cell === second) continue;
                    for (const digit of digits) {
                        if (candidates[cell] & bit(digit)) victims.push({ index: cell, digit });
                    }
                }
                if (victims.length === 0) continue;

                // Both masks have to be justified: the deduction rests on each
                // cell holding *exactly* those two digits, not merely on both
                // being able to hold them.
                const firstUnits = evidenceForMask(values, candidates, first);
                if (firstUnits === null) continue;
                const secondUnits = evidenceForMask(values, candidates, second);
                if (secondUnits === null) continue;

                out.push({
                    kind: "elimination",
                    technique: "naked-pair",
                    unit,
                    digits,
                    subject: sortedUnique([first, second]),
                    eliminations: sortEliminations(victims),
                    units: sortedUnique([...firstUnits, ...secondUnits, unit]),
                });
            }
        }
    }
    return out;
}

/**
 * Hidden pair: two digits that can only go in the same two cells of a unit.
 * Those two cells are spoken for, so every other candidate in them goes.
 */
function findHiddenPairs(values, candidates) {
    const out = [];
    for (let unit = 0; unit < UNITS.length; unit++) {
        const empties = UNITS[unit].filter((cell) => values[cell] === 0);
        const spotsOf = new Map();
        for (let digit = 1; digit <= DIM; digit++) {
            spotsOf.set(digit, empties.filter((cell) => (candidates[cell] & bit(digit)) !== 0));
        }
        for (let first = 1; first <= DIM; first++) {
            const firstSpots = spotsOf.get(first);
            if (firstSpots.length !== 2) continue;
            for (let second = first + 1; second <= DIM; second++) {
                const secondSpots = spotsOf.get(second);
                if (secondSpots.length !== 2) continue;
                if (firstSpots[0] !== secondSpots[0] || firstSpots[1] !== secondSpots[1]) continue;

                const keep = bit(first) | bit(second);
                const victims = [];
                for (const cell of firstSpots) {
                    for (let digit = 1; digit <= DIM; digit++) {
                        if (!(candidates[cell] & bit(digit)) || (keep & bit(digit))) continue;
                        victims.push({ index: cell, digit });
                    }
                }
                // Nothing else in those cells: it is already a naked pair, and
                // reporting both would ask the player to prune an empty set.
                if (victims.length === 0) continue;

                const firstUnits = evidenceForConfinement(values, unit, first, new Set(firstSpots));
                if (firstUnits === null) continue;
                const secondUnits = evidenceForConfinement(values, unit, second, new Set(secondSpots));
                if (secondUnits === null) continue;

                out.push({
                    kind: "elimination",
                    technique: "hidden-pair",
                    unit,
                    digits: [first, second],
                    subject: sortedUnique(firstSpots),
                    eliminations: sortEliminations(victims),
                    units: sortedUnique([...firstUnits, ...secondUnits]),
                });
            }
        }
    }
    return out;
}

/**
 * Every pruning available on this board, with its evidence.
 *
 * Ordered by (technique, unit, first elimination) rather than by discovery, so
 * two runs on the same position offer the same exercise.
 */
export function findEliminations(values) {
    if (values == null || values.length !== CELLS) {
        throw new RangeError(`values must have length ${CELLS}, got ${values?.length}`);
    }
    const candidates = buildCandidates(values);
    const out = [
        ...findConfined(values, candidates),
        ...findNakedPairs(values, candidates),
        ...findHiddenPairs(values, candidates),
    ];
    return out.sort((a, b) => (
        ELIMINATION_TECHNIQUES.indexOf(a.technique) - ELIMINATION_TECHNIQUES.indexOf(b.technique)
        || a.unit - b.unit
        || a.eliminations[0].index - b.eliminations[0].index
        || a.eliminations[0].digit - b.eliminations[0].digit
    ));
}
