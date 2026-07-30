import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAction } from "../../game/static/game/js/ui/key-resolve.js";
import { moveSelection } from "../../game/static/game/js/ui/board-nav.js";
import { KEYMAP } from "../../game/static/game/js/ui/keyboard-adapter.js";

// Regression: the ctrl branch used to return null for everything except
// ctrl+Z / ctrl+Y, so Ctrl+Arrow and Ctrl+Home/End never reached
// moveSelection() at all -- the "ctrl" modifier it implements was unreachable
// from the keyboard even though KEYMAP documents both shortcuts.
const key = (code, extra = {}) => ({ code, key: "x", ...extra });

test("Ctrl+Arrow resolves to the same movement action as a bare arrow", () => {
    for (const [code, action] of [
        ["ArrowUp", "moveUp"], ["ArrowDown", "moveDown"],
        ["ArrowLeft", "moveLeft"], ["ArrowRight", "moveRight"],
    ]) {
        assert.equal(resolveAction(key(code)), action);
        assert.equal(resolveAction(key(code, { ctrlKey: true })), action);
    }
});

test("Ctrl+Home and Ctrl+End resolve to the line actions", () => {
    assert.equal(resolveAction(key("Home", { ctrlKey: true })), "lineStart");
    assert.equal(resolveAction(key("End", { ctrlKey: true })), "lineEnd");
});

test("the ctrl modifier reaches moveSelection and produces the documented jump", () => {
    // KEYMAP promises a one-box (3 cell) jump and a grid start/end jump.
    assert.equal(moveSelection(40, "right", "ctrl"), 43);
    assert.equal(moveSelection(40, "lineStart", "ctrl"), 0);
    assert.equal(moveSelection(40, "lineEnd", "ctrl"), 80);
    assert.ok(KEYMAP.some((e) => e.combo.includes("Ctrl+방향키")));
    assert.ok(KEYMAP.some((e) => e.combo.includes("Ctrl+Home/End")));
});

test("undo and redo still win over navigation, and other ctrl combos stay unclaimed", () => {
    assert.equal(resolveAction(key("KeyZ", { ctrlKey: true })), "undo");
    assert.equal(resolveAction(key("KeyZ", { ctrlKey: true, shiftKey: true })), "redo");
    assert.equal(resolveAction(key("KeyY", { ctrlKey: true })), "redo");
    // Browser and OS shortcuts must not be swallowed.
    for (const code of ["KeyA", "KeyC", "KeyV", "KeyR", "KeyT", "KeyW", "Backspace", "Delete", "Space"]) {
        assert.equal(resolveAction(key(code, { ctrlKey: true })), null, code);
    }
});

test("meta still suppresses everything, including navigation", () => {
    assert.equal(resolveAction(key("ArrowUp", { metaKey: true })), null);
    assert.equal(resolveAction(key("ArrowUp", { metaKey: true, ctrlKey: true })), null);
});
