// Phase 1 §15 url:canonicalization and scope projection, in one module so the
// encoder and decoder share exactly one definition of "the same state" -- if
// they diverged, "same canonical state -> same byte sequence" could not hold.
export function project(session, scope, savedAt) {
    if (!["SC1", "SC2"].includes(scope)) {
        throw new RangeError(`unknown scope: ${scope}`);
    }
    const givens = Uint8Array.from(session.givens);
    if (scope === "SC1") {
        return { givens, values: null, candidates: null, savedAt: null };
    }
    const values = Uint8Array.from(session.values);
    const candidates = Uint16Array.from(session.candidates);
    for (let i = 0; i < 81; i++) {
        if (givens[i]) { values[i] = 0; candidates[i] = 0; }
        else if (values[i]) candidates[i] = 0;
    }
    return { givens, values, candidates, savedAt: savedAt ?? null };
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
    const { givens, values, candidates } = state;
    if (values && candidates) {
        for (let i = 0; i < 81; i++) {
            if (givens[i] && (values[i] || candidates[i])) return { ok: false, code: "malformed-body" };
            if (values[i] && candidates[i]) return { ok: false, code: "malformed-body" };
        }
    }
    if (!givensContradictionFree(givens)) return { ok: false, code: "invalid-puzzle" };
    return { ok: true };
}
