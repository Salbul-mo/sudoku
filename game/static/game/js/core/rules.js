// Constraint-only predicates. No function here accepts or references the
// completed answer grid -- that is the point of CF2's non-goal reclassification
// (M2): the client never holds it, so conflict/completion checks can only ever
// be derived from the board's own row/column/box constraints.
import { CELLS, DIM, PEERS, UNITS } from "./spec.js";

function checkBoard(values, givens) {
    if (values.length !== CELLS || givens.length !== CELLS) {
        throw new RangeError(`expected length ${CELLS} arrays`);
    }
}

function effective(values, givens, i) {
    return givens[i] || values[i];
}

export function conflicts(values, givens) {
    checkBoard(values, givens);
    const out = new Set();
    for (const unit of UNITS) {
        const seen = new Map();
        for (const i of unit) {
            const v = effective(values, givens, i);
            if (!v) continue;
            if (!seen.has(v)) seen.set(v, []);
            seen.get(v).push(i);
        }
        for (const indices of seen.values()) {
            if (indices.length > 1) for (const i of indices) out.add(i);
        }
    }
    return out;
}

export function isSolved(values, givens) {
    checkBoard(values, givens);
    const complete = (1 << DIM) - 1;
    for (const unit of UNITS) {
        let mask = 0;
        for (const i of unit) {
            const v = effective(values, givens, i);
            if (!v) return false;
            mask |= 1 << (v - 1);
        }
        if (mask !== complete) return false;
    }
    return true;
}

export function eliminationTargets(candidates, index, digit) {
    if (!Number.isInteger(index) || index < 0 || index >= CELLS) {
        throw new RangeError(`index out of range: ${index}`);
    }
    if (!Number.isInteger(digit) || digit < 1 || digit > DIM) {
        throw new RangeError(`digit out of range: ${digit}`);
    }
    const bit = 1 << (digit - 1);
    return PEERS[index].filter((p) => candidates[p] & bit);
}
