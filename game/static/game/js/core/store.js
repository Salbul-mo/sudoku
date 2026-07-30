// Single domain state shared by every input adapter (RK1). DOM-free by
// construction (CV1): nothing here touches document, window, or storage.
import { CELLS, DIM } from "./spec.js";
import { conflicts, eliminationTargets, isSolved } from "./rules.js";
import { History } from "./history.js";

const REGION_PREFIX = { row: "r", column: "c", box: "b" };
const REGION_KINDS = new Set(["row", "column", "box"]);
const NOTE_KIND_CODE = { cell: 0, row: 1, column: 2, box: 3 };
const MAX_NOTE_BYTES = 512;

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
    for (let i = 0; i < CELLS; i++) {
        if (session.givens[i] && session.values[i]) {
            throw new Error(`cell ${i} has both a given and a user value`);
        }
    }
}

function regionAffectedCells(kind, key) {
    const cells = [];
    for (let i = 0; i < CELLS; i++) {
        const r = (i / DIM) | 0;
        const c = i % DIM;
        const b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
        const matches = kind === "row" ? r === key : kind === "column" ? c === key : b === key;
        if (matches) cells.push(i);
    }
    return cells;
}

function noteKeyOf(target) {
    return target.kind === "cell" ? String(target.key) : REGION_PREFIX[target.kind] + target.key;
}

function validateNoteTarget(target) {
    if (target.kind === "cell") {
        if (!Number.isInteger(target.key) || target.key < 0 || target.key >= CELLS) {
            throw new RangeError(`cell note key out of range: ${target.key}`);
        }
    } else if (REGION_KINDS.has(target.kind)) {
        if (!Number.isInteger(target.key) || target.key < 0 || target.key >= DIM) {
            throw new RangeError(`region note key out of range: ${target.key}`);
        }
    } else {
        throw new RangeError(`unknown note target kind: ${target.kind}`);
    }
}

function utf8Length(text) {
    return new TextEncoder().encode(text).length;
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
        notify(changed, "value");
        return { ok: true, changed };
    }

    function setNote(target, text) {
        validateNoteTarget(target);
        if (typeof text !== "string") throw new TypeError("note text must be a string");
        if (utf8Length(text) > MAX_NOTE_BYTES) {
            throw new RangeError(`note text exceeds ${MAX_NOTE_BYTES} bytes`);
        }
        const bag = target.kind === "cell" ? session.cellNotes : session.regionNotes;
        const key = noteKeyOf(target);
        const before = bag[key] ?? "";
        const after = text.trim();
        if (before === after) return { ok: false, reason: "noop" };

        history.beginGroup();
        history.record({
            kind: target.kind === "cell" ? "cellNote" : "regionNote",
            key, before, after, groupId: 0, at: Date.now(),
        });
        if (after) bag[key] = after; else delete bag[key];
        history.endGroup();

        const changed = new Set(
            target.kind === "cell" ? [target.key] : regionAffectedCells(target.kind, target.key)
        );
        notify(changed, "note");
        return { ok: true, changed };
    }

    function getNote(target) {
        validateNoteTarget(target);
        const bag = target.kind === "cell" ? session.cellNotes : session.regionNotes;
        return bag[noteKeyOf(target)] ?? "";
    }

    function applyEntries(entries) {
        const changed = new Set();
        for (const entry of entries) {
            if (entry.kind === "value") { session.values[entry.key] = entry.after; changed.add(entry.key); }
            else if (entry.kind === "candidates") { session.candidates[entry.key] = entry.after; changed.add(entry.key); }
            else if (entry.kind === "cellNote") {
                if (entry.after) session.cellNotes[entry.key] = entry.after; else delete session.cellNotes[entry.key];
                changed.add(Number(entry.key));
            } else if (entry.kind === "regionNote") {
                if (entry.after) session.regionNotes[entry.key] = entry.after; else delete session.regionNotes[entry.key];
                const kind = { r: "row", c: "column", b: "box" }[entry.key[0]];
                for (const c of regionAffectedCells(kind, Number(entry.key.slice(1)))) changed.add(c);
            }
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
        setNote,
        getNote,
        undo,
        redo,
        conflicts: () => conflicts(session.values, session.givens),
        isSolved: () => isSolved(session.values, session.givens),
        // For a caller (app-shell's bulk operations) that mutates session/history
        // directly as a single undo group instead of through the methods above,
        // and so must trigger the same subscriber notification itself.
        notifyAll: (changed) => notify(changed, "bulk"),
    };
}
