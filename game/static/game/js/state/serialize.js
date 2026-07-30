// GameSession <-> plain-JSON conversion, with a validating decoder for the
// untrusted input localStorage really is: users can and do edit it by hand.
export const CURRENT_SCHEMA_VERSION = 1;

const CELL_KEY = /^\d{1,2}$/;
const REGION_KEY = /^[rcb][0-8]$/;
const MAX_NOTE_BYTES = 512;

// Registered migration steps, keyed by the version they migrate *from*.
// Empty today (schema version 1 is the only one that has ever existed) but
// the ladder exists now so a future version 2 does not need an ad hoc path.
const STEPS = new Map();

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
        cellNotes: { ...session.cellNotes },
        regionNotes: { ...session.regionNotes },
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
    };
}

function fail(code, message = code) {
    return { ok: false, code, message };
}

function isByteArray(arr, length, max) {
    return Array.isArray(arr) && arr.length === length
        && arr.every((v) => Number.isInteger(v) && v >= 0 && v <= max);
}

function validNotes(bag, keyPattern) {
    if (typeof bag !== "object" || bag === null || Array.isArray(bag)) return false;
    for (const [key, value] of Object.entries(bag)) {
        if (!keyPattern.test(key)) return false;
        if (typeof value !== "string") return false;
        if (new TextEncoder().encode(value).length > MAX_NOTE_BYTES) return false;
    }
    return true;
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
    if (!validNotes(obj.cellNotes, CELL_KEY)) return fail("corrupt", "invalid cellNotes");
    if (!validNotes(obj.regionNotes, REGION_KEY)) return fail("corrupt", "invalid regionNotes");

    return {
        ok: true,
        session: {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            puzzleId: obj.puzzleId,
            dim: 9,
            givens: Uint8Array.from(obj.givens),
            values: Uint8Array.from(obj.values),
            candidates: Uint16Array.from(obj.candidates),
            cellNotes: { ...obj.cellNotes },
            regionNotes: { ...obj.regionNotes },
            createdAt: obj.createdAt,
            updatedAt: obj.updatedAt,
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
}
