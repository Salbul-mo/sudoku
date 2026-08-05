import { test } from "node:test";
import assert from "node:assert/strict";
import {
    serializeSession, deserializeSession, migrate,
    _registerMigrationStepForTests, _clearMigrationStepsForTests,
} from "../../game/static/game/js/state/serialize.js";

function freshSession(overrides = {}) {
    return {
        schemaVersion: 1, puzzleId: "abc", dim: 9,
        givens: new Uint8Array(81), values: new Uint8Array(81), candidates: new Uint16Array(81),
        createdAt: 1, updatedAt: 2,
        ...overrides,
    };
}

test("serialized output has no typed arrays and round-trips through JSON", () => {
    const out = serializeSession(freshSession());
    const json = JSON.stringify(out);
    assert.equal(typeof json, "string");
    for (const field of ["givens", "values", "candidates"]) {
        assert.ok(Array.isArray(out[field]));
    }
});

test("history and UiState keys are absent from the serialized output (V-UI-B04-05)", () => {
    const out = serializeSession(freshSession());
    assert.ok(!("history" in out));
    assert.ok(!("uiState" in out));
    assert.ok(!("UiState" in out));
});

test("a length-80 array is rejected as corrupt (V-UI-B04-03)", () => {
    const raw = JSON.stringify({ ...serializeSession(freshSession()), givens: new Array(80).fill(0) });
    const result = deserializeSession(raw);
    assert.equal(result.ok, false);
    assert.equal(result.code, "corrupt");
});

test("a value of 10 is rejected as corrupt", () => {
    const values = new Array(81).fill(0);
    values[0] = 10;
    const raw = JSON.stringify({ ...serializeSession(freshSession()), values });
    assert.equal(deserializeSession(raw).code, "corrupt");
});

test("a future schemaVersion is rejected as future-version", () => {
    const raw = JSON.stringify({ ...serializeSession(freshSession()), schemaVersion: 999 });
    assert.equal(deserializeSession(raw).code, "future-version");
});

test("overlapping given and value is rejected as corrupt", () => {
    const givens = new Array(81).fill(0);
    const values = new Array(81).fill(0);
    givens[0] = 5; values[0] = 3;
    const raw = JSON.stringify({ ...serializeSession(freshSession()), givens, values });
    assert.equal(deserializeSession(raw).code, "corrupt");
});

test("a normal round trip succeeds and the session is well-formed", () => {
    const session = freshSession();
    session.givens[0] = 5;
    const result = deserializeSession(JSON.stringify(serializeSession(session)));
    assert.equal(result.ok, true);
    assert.equal(result.session.givens[0], 5);
    assert.ok(result.session.values instanceof Uint8Array);
});

test("no malformed input ever throws (200-case fuzz)", () => {
    const inputs = [
        "not json", "", "null", "42", "[]", '{"schemaVersion": "one"}',
        '{"schemaVersion": 1}', '{"schemaVersion": 1, "givens": null}',
        '{"schemaVersion": 1, "givens": [1,2,3]}',
    ];
    for (let i = 0; i < 200; i++) {
        const raw = inputs[i % inputs.length];
        assert.doesNotThrow(() => deserializeSession(raw));
    }
});

test("registered migration steps apply in order up to CURRENT", () => {
    _registerMigrationStepForTests(-1, (obj) => ({ ...obj, schemaVersion: 0, migratedFromMinusOne: true }));
    _registerMigrationStepForTests(0, (obj) => ({ ...obj, schemaVersion: 1 }));
    try {
        const result = migrate({ schemaVersion: -1 });
        assert.equal(result.schemaVersion, 1);
        assert.equal(result.migratedFromMinusOne, true);
    } finally {
        _clearMigrationStepsForTests();
    }
});

test("an unregistered prior version returns null", () => {
    assert.equal(migrate({ schemaVersion: -1 }), null);
});
