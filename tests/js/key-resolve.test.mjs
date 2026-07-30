import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDigit, resolveAction } from "../../game/static/game/js/ui/key-resolve.js";

test("Digit1..9 and Numpad1..9 resolve by code (V-UI-B07-01)", () => {
    for (let d = 1; d <= 9; d++) {
        assert.equal(resolveDigit({ code: `Digit${d}`, key: String(d) }), d);
        assert.equal(resolveDigit({ code: `Numpad${d}`, key: String(d) }), d);
    }
});

test("an AZERTY-like input (code=KeyA, key='1') falls back to the key", () => {
    assert.equal(resolveDigit({ code: "KeyA", key: "1" }), 1);
});

test("a non-digit code and key returns null", () => {
    assert.equal(resolveDigit({ code: "KeyQ", key: "q" }), null);
});

test("metaKey combinations always resolve to null", () => {
    assert.equal(resolveAction({ code: "KeyZ", key: "z", metaKey: true, ctrlKey: true }), null);
    assert.equal(resolveAction({ code: "ArrowUp", key: "ArrowUp", metaKey: true }), null);
});

test("ctrl+z, ctrl+shift+z, and ctrl+y split into undo and redo", () => {
    assert.equal(resolveAction({ code: "KeyZ", key: "z", ctrlKey: true, shiftKey: false }), "undo");
    assert.equal(resolveAction({ code: "KeyZ", key: "Z", ctrlKey: true, shiftKey: true }), "redo");
    assert.equal(resolveAction({ code: "KeyY", key: "y", ctrlKey: true, shiftKey: false }), "redo");
});

test("resolveDigit/resolveAction throw TypeError for malformed input", () => {
    assert.throws(() => resolveDigit({}), TypeError);
    assert.throws(() => resolveAction(null), TypeError);
});

test("Digit0/Numpad0/Backspace/Delete resolve to clear", () => {
    for (const code of ["Digit0", "Numpad0", "Backspace", "Delete"]) {
        assert.equal(resolveAction({ code, key: "x" }), "clear");
    }
});

test("? and F1 resolve to help", () => {
    assert.equal(resolveAction({ code: "Slash", key: "?" }), "help");
    assert.equal(resolveAction({ code: "F1", key: "F1" }), "help");
});
