import { test } from "node:test";
import assert from "node:assert/strict";
import { init } from "../../game/static/game/js/main.js";

test("init is exported as a function", () => {
    assert.equal(typeof init, "function");
});

test("init rejects a non-element root", () => {
    assert.throws(() => init(null), TypeError);
    assert.throws(() => init({}), TypeError);
});

test("importing the entry module has no side effects in node", () => {
    assert.equal(typeof globalThis.document, "undefined");
});
