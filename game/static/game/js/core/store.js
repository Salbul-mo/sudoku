// Single domain state shared by every input adapter (RK1). DOM-free by
// construction (CV1): nothing here touches document, window, or storage.
import { CELLS, DIM, PEERS } from "./spec.js";
import { conflicts, eliminationTargets, isSolved } from "./rules.js";
import { History } from "./history.js";

function validateSession(session) {
    if (session.dim !== DIM) throw new RangeError(`unsupported dim: ${session.dim}`);
    for (const field of ["givens", "values"]) {
        if (session[field].length !== CELLS) {
            throw new RangeError(`${field} must have length ${CELLS}`);
        }
    }
    if (session.candidates.length !== CELLS) {
        throw new RangeError("candidates must have length " + CELLS);
    }
    // solution is optional (null for a session adopted from a shared link,
    // or restored from a save written before this field existed) -- see
    // bootstrap.js::sessionFromDecoded and checkAnswer() below.
    if (session.solution != null && session.solution.length !== CELLS) {
        throw new RangeError("solution must have length " + CELLS);
    }
    for (let i = 0; i < CELLS; i++) {
        if (session.givens[i] && session.values[i]) {
            throw new Error(`cell ${i} has both a given and a user value`);
        }
    }
}

// A value change can flip the conflict cue on any cell sharing a row, column,
// or box with it -- not just the cell itself -- so every caller that mutates
// session.values must widen its notification to the same peers rules.js's
// conflicts() would consult.
function addConflictPeers(changed, index) {
    for (const p of PEERS[index]) changed.add(p);
}

export function createStore(session) {
    validateSession(session);
    const listeners = new Set();
    const history = new History();

    function notify(changed, kind) {
        if (!changed.size) return;
        session.updatedAt = Date.now();
        for (const fn of listeners) fn({ changed, kind });
    }

    function subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
    }

    function setValue(index, digit, opts = {}) {
        if (!Number.isInteger(index) || index < 0 || index >= CELLS) {
            throw new RangeError(`index out of range: ${index}`);
        }
        if (!Number.isInteger(digit) || digit < 1 || digit > DIM) {
            throw new RangeError(`digit out of range: ${digit}`);
        }
        if (session.givens[index]) return { ok: false, reason: "given" };
        if (session.values[index] === digit) return clearCell(index);

        const autoRemove = opts.autoRemoveCandidates !== false;
        const changed = new Set([index]);
        history.beginGroup();
        history.record({
            kind: "value", key: index, before: session.values[index], after: digit,
            groupId: 0, at: Date.now(),
        });
        session.values[index] = digit;
        history.record({
            kind: "candidates", key: index, before: session.candidates[index], after: 0,
            groupId: 0, at: Date.now(),
        });
        session.candidates[index] = 0;
        if (autoRemove) {
            for (const p of eliminationTargets(session.candidates, index, digit)) {
                const bit = 1 << (digit - 1);
                history.record({
                    kind: "candidates", key: p, before: session.candidates[p],
                    after: session.candidates[p] & ~bit, groupId: 0, at: Date.now(),
                });
                session.candidates[p] &= ~bit;
                changed.add(p);
            }
        }
        history.endGroup();
        addConflictPeers(changed, index);
        notify(changed, "value");
        return { ok: true, changed };
    }

    function toggleCandidate(index, digit) {
        if (!Number.isInteger(index) || index < 0 || index >= CELLS) {
            throw new RangeError(`index out of range: ${index}`);
        }
        if (!Number.isInteger(digit) || digit < 1 || digit > DIM) {
            throw new RangeError(`digit out of range: ${digit}`);
        }
        if (session.givens[index]) return { ok: false, reason: "given" };
        if (session.values[index]) return { ok: false, reason: "noop" };

        const bit = 1 << (digit - 1);
        history.beginGroup();
        history.record({
            kind: "candidates", key: index, before: session.candidates[index],
            after: session.candidates[index] ^ bit, groupId: 0, at: Date.now(),
        });
        session.candidates[index] ^= bit;
        history.endGroup();
        const changed = new Set([index]);
        notify(changed, "candidates");
        return { ok: true, changed };
    }

    function clearCell(index) {
        if (!Number.isInteger(index) || index < 0 || index >= CELLS) {
            throw new RangeError(`index out of range: ${index}`);
        }
        if (session.givens[index]) return { ok: false, reason: "given" };
        if (!session.values[index] && !session.candidates[index]) {
            return { ok: false, reason: "noop" };
        }
        history.beginGroup();
        history.record({
            kind: "value", key: index, before: session.values[index], after: 0,
            groupId: 0, at: Date.now(),
        });
        session.values[index] = 0;
        history.record({
            kind: "candidates", key: index, before: session.candidates[index], after: 0,
            groupId: 0, at: Date.now(),
        });
        session.candidates[index] = 0;
        history.endGroup();
        const changed = new Set([index]);
        addConflictPeers(changed, index);
        notify(changed, "value");
        return { ok: true, changed };
    }

    function applyEntries(entries) {
        const changed = new Set();
        for (const entry of entries) {
            if (entry.kind === "value") {
                session.values[entry.key] = entry.after;
                changed.add(entry.key);
                addConflictPeers(changed, entry.key);
            }
            else if (entry.kind === "candidates") { session.candidates[entry.key] = entry.after; changed.add(entry.key); }
        }
        return changed;
    }

    function undo() {
        const entries = history.undo();
        if (!entries) return { ok: false, reason: "empty" };
        const reversed = entries.map((e) => ({ ...e, after: e.before, before: e.after }));
        const changed = applyEntries(reversed);
        notify(changed, "undo");
        return { ok: true, changed };
    }

    function redo() {
        const entries = history.redo();
        if (!entries) return { ok: false, reason: "empty" };
        const changed = applyEntries(entries);
        notify(changed, "redo");
        return { ok: true, changed };
    }

    return {
        session,
        history,
        subscribe,
        setValue,
        toggleCandidate,
        clearCell,
        undo,
        redo,
        conflicts: () => conflicts(session.values, session.givens),
        isSolved: () => isSolved(session.values, session.givens),
        // Every filled, non-given cell that disagrees with the known
        // solution -- distinct from conflicts(), which only catches values
        // that clash with a peer, not ones that are merely wrong. Returns
        // null (not an empty Set) when no solution is available, so a
        // caller can tell "checked, all correct" apart from "can't check".
        checkAnswer: () => {
            if (!session.solution) return null;
            const wrong = new Set();
            for (let i = 0; i < CELLS; i++) {
                const v = session.values[i];
                if (v && v !== session.solution[i]) wrong.add(i);
            }
            return wrong;
        },
        // For a caller (app-shell's bulk operations) that mutates session/history
        // directly as a single undo group instead of through the methods above,
        // and so must trigger the same subscriber notification itself.
        notifyAll: (changed) => notify(changed, "bulk"),
    };
}
