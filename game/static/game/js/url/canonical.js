// Phase 1 §15 url:canonicalization and scope projection, in one module so the
// encoder and decoder share exactly one definition of "the same state" -- if
// they diverged, "same canonical state -> same byte sequence" could not hold.
export const KIND = Object.freeze({ cell: 0, row: 1, column: 2, box: 3 });
const KIND_NAME = Object.freeze(["cell", "row", "column", "box"]);
const REGION_PREFIX_TO_KIND = { r: 1, c: 2, b: 3 };
const MAX_NOTES = 108;
const MAX_NOTE_TEXT_BYTES = 512;

function normalizeText(text) {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\r\n/g, "\n");
}

function hasForbiddenControlChars(text) {
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code === 0x0a || code === 0x09) continue; // LF and TAB are allowed
        if (code < 0x20 || code === 0x7f) return true;
    }
    return false;
}

function collectNotes(session) {
    const notes = [];
    for (const [key, text] of Object.entries(session.cellNotes ?? {})) {
        notes.push({ kind: KIND.cell, key: Number(key), text: normalizeText(text) });
    }
    for (const [key, text] of Object.entries(session.regionNotes ?? {})) {
        const kind = REGION_PREFIX_TO_KIND[key[0]];
        notes.push({ kind, key: Number(key.slice(1)), text: normalizeText(text) });
    }
    notes.sort((a, b) => (a.kind - b.kind) || (a.key - b.key));
    return notes;
}

export function project(session, scope, savedAt) {
    if (!["SC1", "SC2", "SC3"].includes(scope)) {
        throw new RangeError(`unknown scope: ${scope}`);
    }
    const givens = Uint8Array.from(session.givens);
    if (scope === "SC1") {
        return { givens, values: null, candidates: null, notes: null, savedAt: null };
    }
    const values = Uint8Array.from(session.values);
    const candidates = Uint16Array.from(session.candidates);
    for (let i = 0; i < 81; i++) {
        if (givens[i]) { values[i] = 0; candidates[i] = 0; }
        else if (values[i]) candidates[i] = 0;
    }
    const notes = scope === "SC3" ? collectNotes(session) : null;
    return { givens, values, candidates, notes, savedAt: savedAt ?? null };
}

function givensContradictionFree(givens) {
    for (let r = 0; r < 9; r++) {
        const seen = new Set();
        for (let c = 0; c < 9; c++) {
            const v = givens[r * 9 + c];
            if (!v) continue;
            if (seen.has(v)) return false;
            seen.add(v);
        }
    }
    for (let c = 0; c < 9; c++) {
        const seen = new Set();
        for (let r = 0; r < 9; r++) {
            const v = givens[r * 9 + c];
            if (!v) continue;
            if (seen.has(v)) return false;
            seen.add(v);
        }
    }
    for (let br = 0; br < 3; br++) {
        for (let bc = 0; bc < 3; bc++) {
            const seen = new Set();
            for (let dr = 0; dr < 3; dr++) {
                for (let dc = 0; dc < 3; dc++) {
                    const r = br * 3 + dr, c = bc * 3 + dc;
                    const v = givens[r * 9 + c];
                    if (!v) continue;
                    if (seen.has(v)) return false;
                    seen.add(v);
                }
            }
        }
    }
    return true;
}

export function checkInvariants(state) {
    const { givens, values, candidates, notes } = state;
    if (values && candidates) {
        for (let i = 0; i < 81; i++) {
            if (givens[i] && (values[i] || candidates[i])) return { ok: false, code: "malformed-body" };
            if (values[i] && candidates[i]) return { ok: false, code: "malformed-body" };
        }
    }
    if (notes) {
        if (notes.length > MAX_NOTES) return { ok: false, code: "malformed-body" };
        for (let i = 0; i < notes.length; i++) {
            const n = notes[i];
            if (!KIND_NAME[n.kind]) return { ok: false, code: "malformed-body" };
            if (new TextEncoder().encode(n.text).length > MAX_NOTE_TEXT_BYTES) {
                return { ok: false, code: "malformed-body" };
            }
            if (hasForbiddenControlChars(n.text)) return { ok: false, code: "malformed-body" };
            if (i > 0) {
                const prev = notes[i - 1];
                const cmp = (prev.kind - n.kind) || (prev.key - n.key);
                if (cmp >= 0) return { ok: false, code: "malformed-body" }; // strict order, no duplicates
            }
        }
    }
    if (!givensContradictionFree(givens)) return { ok: false, code: "invalid-puzzle" };
    return { ok: true };
}
