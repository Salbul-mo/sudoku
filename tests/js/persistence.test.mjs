import { test } from "node:test";
import assert from "node:assert/strict";
import { createPersistence } from "../../game/static/game/js/state/persistence.js";

function freshSession() {
    return {
        schemaVersion: 1, puzzleId: "abc", dim: 9,
        givens: new Uint8Array(81), values: new Uint8Array(81), candidates: new Uint16Array(81),
        cellNotes: {}, regionNotes: {}, createdAt: 0, updatedAt: 0,
    };
}

function fakeClock() {
    let nextId = 1;
    const pending = new Map();
    return {
        setTimeout: (fn) => { const id = nextId++; pending.set(id, fn); return id; },
        clearTimeout: (id) => pending.delete(id),
        fireAll() {
            for (const [id, fn] of [...pending]) { pending.delete(id); fn(); }
        },
        pendingCount: () => pending.size,
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

test("5 schedules inside the debounce window collapse into 1 write (V-UI-B04-01)", () => {
    const clock = fakeClock();
    let writes = 0;
    const storage = memoryStorage();
    const realSetItem = storage.setItem.bind(storage);
    storage.setItem = (...args) => { writes++; return realSetItem(...args); };

    const persistence = createPersistence({
        storage, now: () => 0, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
        onWarning: () => {},
    });
    for (let i = 0; i < 5; i++) persistence.schedule(freshSession());
    clock.fireAll();
    assert.equal(writes, 1);
});

test("flushNow cancels the pending timer and writes immediately (V-UI-B04-02)", () => {
    const clock = fakeClock();
    const storage = memoryStorage();
    const persistence = createPersistence({
        storage, now: () => 0, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
        onWarning: () => {},
    });
    persistence.schedule(freshSession());
    assert.equal(clock.pendingCount(), 1);
    persistence.flushNow();
    assert.equal(clock.pendingCount(), 0);
    assert.ok(storage.getItem("sudoku:v1:session"));
});

test("a throwing storage switches to memory mode and warns exactly once (V-UI-B04-04)", () => {
    const clock = fakeClock();
    let warnings = 0;
    const storage = {
        getItem: () => null,
        setItem: () => { throw new Error("QuotaExceededError"); },
        removeItem: () => {},
    };
    const persistence = createPersistence({
        storage, now: () => 0, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
        onWarning: () => { warnings++; },
    });
    persistence.schedule(freshSession());
    clock.fireAll();
    persistence.schedule(freshSession());
    clock.fireAll();
    assert.equal(persistence.mode, "memory");
    assert.equal(warnings, 1);
});

test("scheduling continues without error once in memory mode", () => {
    const clock = fakeClock();
    const storage = { getItem: () => null, setItem: () => { throw new Error("boom"); }, removeItem: () => {} };
    const persistence = createPersistence({
        storage, now: () => 0, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
        onWarning: () => {},
    });
    persistence.schedule(freshSession());
    clock.fireAll();
    assert.doesNotThrow(() => { persistence.schedule(freshSession()); clock.fireAll(); });
});

test("missing deps throws TypeError", () => {
    assert.throws(() => createPersistence({}), TypeError);
});
