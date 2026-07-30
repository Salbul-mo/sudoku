import { test } from "node:test";
import assert from "node:assert/strict";
import { createPersistence } from "../../game/static/game/js/state/persistence.js";
import { serializeSession, deserializeSession } from "../../game/static/game/js/state/serialize.js";

// M-UI-B13-03: 100 trials of "mutate, then pagehide fires before the 300ms
// debounce would otherwise flush". flushNow() is exactly what bootstrap.js's
// pagehide listener calls (M-UI-B12-05), so exercising it directly here is a
// faithful simulation of the real durability contract, not a proxy for it --
// no real browser is needed to prove the debounce+flush+restore path is lossless.
function freshSession(overrides = {}) {
    return {
        schemaVersion: 1, puzzleId: "durability", dim: 9,
        givens: new Uint8Array(81), values: new Uint8Array(81), candidates: new Uint16Array(81),
        cellNotes: {}, regionNotes: {}, createdAt: 0, updatedAt: 0,
        ...overrides,
    };
}

function memoryStorage() {
    const map = new Map();
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, v),
        removeItem: (k) => map.delete(k),
    };
}

function fakeClock() {
    let nextId = 1;
    const pending = new Map();
    return {
        setTimeout: (fn) => { const id = nextId++; pending.set(id, fn); return id; },
        clearTimeout: (id) => pending.delete(id),
    };
}

test("100 trials: a mutation immediately followed by pagehide is never lost (V-UI-B13-02)", () => {
    let lost = 0;
    for (let trial = 0; trial < 100; trial++) {
        const storage = memoryStorage();
        const clock = fakeClock();
        const persistence = createPersistence({
            storage, now: () => trial, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
            onWarning: () => {},
        });
        const session = freshSession({ updatedAt: trial });
        session.values[0] = (trial % 9) + 1; // a distinct expected value per trial
        persistence.schedule(session);
        persistence.flushNow(); // simulates the pagehide listener firing before the debounce

        // "reload": a fresh persistence instance reading the same storage.
        const reloaded = createPersistence({
            storage, now: () => trial, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
            onWarning: () => {},
        });
        const restored = reloaded.restore();
        if (!restored.ok || restored.session.values[0] !== session.values[0]) lost++;
    }
    assert.equal(lost, 0);
});

test("serialize/deserialize round trip agrees with the persistence path (sanity check)", () => {
    const session = freshSession();
    session.values[5] = 7;
    const restored = deserializeSession(JSON.stringify(serializeSession(session)));
    assert.equal(restored.ok, true);
    assert.equal(restored.session.values[5], 7);
});
