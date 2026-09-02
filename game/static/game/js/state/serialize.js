// GameSession <-> plain-JSON conversion, with a validating decoder for the
// untrusted input localStorage really is: users can and do edit it by hand.
export const CURRENT_SCHEMA_VERSION = 2;

// Registered migration steps, keyed by the version they migrate *from*.
//
// Held separately from the live map so the test helpers below can add a step
// and put things back: before there were any real steps, "clear" could mean
// "empty", and now it has to mean "restore".
const BUILT_IN_STEPS = Object.freeze([
    // 1 -> 2 added the two fields the completion card reports on. A save
    // written before them is a game already in progress, and there is no way
    // to recover how long it has been running or what was checked -- so it
    // starts from zero rather than guessing. The result is a first completion
    // that under-reports; inventing a number would be worse.
    [1, (obj) => ({ ...obj, schemaVersion: 2, elapsedMs: 0, mistakeCells: [] })],
]);

const STEPS = new Map(BUILT_IN_STEPS);

export function migrate(obj) {
    let cur = obj;
    while (cur.schemaVersion < CURRENT_SCHEMA_VERSION) {
        const step = STEPS.get(cur.schemaVersion);
        if (!step) return null; // fail closed: never guess at an unknown version
        cur = step(cur);
    }
    return cur;
}

export function serializeSession(session) {
    return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        puzzleId: session.puzzleId,
        dim: 9,
        givens: Array.from(session.givens),
        values: Array.from(session.values),
        candidates: Array.from(session.candidates),
        solution: session.solution ? Array.from(session.solution) : null,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        elapsedMs: session.elapsedMs ?? 0,
        // Cells, not a count: pressing check twice must not report the same
        // wrong cell as two separate mistakes.
        mistakeCells: Array.from(session.mistakeCells ?? []),
    };
}

function fail(code, message = code) {
    return { ok: false, code, message };
}

function isByteArray(arr, length, max) {
    return Array.isArray(arr) && arr.length === length
        && arr.every((v) => Number.isInteger(v) && v >= 0 && v <= max);
}

export function deserializeSession(raw) {
    let obj;
    try {
        obj = JSON.parse(raw);
    } catch {
        return fail("corrupt", "invalid JSON");
    }
    if (obj === null || typeof obj !== "object" || !Number.isInteger(obj.schemaVersion)) {
        return fail("corrupt", "missing or invalid schemaVersion");
    }
    if (obj.schemaVersion > CURRENT_SCHEMA_VERSION) {
        return fail("future-version", `unrecognized schemaVersion ${obj.schemaVersion}`);
    }
    if (obj.schemaVersion < CURRENT_SCHEMA_VERSION) {
        obj = migrate(obj);
        if (!obj) return fail("corrupt", "no migration path from this schemaVersion");
    }
    if (obj.dim !== 9) return fail("unsupported-dim", `unsupported dim ${obj.dim}`);
    if (!isByteArray(obj.givens, 81, 9)) return fail("corrupt", "invalid givens");
    if (!isByteArray(obj.values, 81, 9)) return fail("corrupt", "invalid values");
    if (!isByteArray(obj.candidates, 81, 511)) return fail("corrupt", "invalid candidates");
    for (let i = 0; i < 81; i++) {
        if (obj.givens[i] && obj.values[i]) return fail("corrupt", `cell ${i} given and value overlap`);
    }
    // solution is optional: absent in every save written before this field
    // existed, and null for a session adopted from a shared link. Only a
    // *present but malformed* value is corrupt.
    if (obj.solution != null && !isByteArray(obj.solution, 81, 9)) {
        return fail("corrupt", "invalid solution");
    }
    if (!Number.isFinite(obj.elapsedMs) || obj.elapsedMs < 0) {
        return fail("corrupt", "invalid elapsedMs");
    }
    if (!Array.isArray(obj.mistakeCells)
        || !obj.mistakeCells.every((i) => Number.isInteger(i) && i >= 0 && i < 81)) {
        return fail("corrupt", "invalid mistakeCells");
    }

    return {
        ok: true,
        session: {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            puzzleId: obj.puzzleId,
            dim: 9,
            givens: Uint8Array.from(obj.givens),
            values: Uint8Array.from(obj.values),
            candidates: Uint16Array.from(obj.candidates),
            solution: obj.solution != null ? Uint8Array.from(obj.solution) : null,
            createdAt: obj.createdAt,
            updatedAt: obj.updatedAt,
            elapsedMs: obj.elapsedMs,
            mistakeCells: new Set(obj.mistakeCells),
        },
    };
}

// Exposed only for M-UI-B04-03's migration-ladder tests, which register fake
// steps and remove them again; production code never calls this directly.
export function _registerMigrationStepForTests(fromVersion, step) {
    STEPS.set(fromVersion, step);
}

export function _clearMigrationStepsForTests() {
    STEPS.clear();
    for (const [from, step] of BUILT_IN_STEPS) STEPS.set(from, step);
}
