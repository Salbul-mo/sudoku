import { test, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeDocument, fakeRoot, FakeElement } from "./helpers/fake-dom.mjs";

const uninstall = installFakeDocument();
const { boardHasFocus, createKeyboardAdapter, getKeymap } =
    await import("../../game/static/game/js/ui/keyboard-adapter.js");
const { createStore } = await import("../../game/static/game/js/core/store.js");
after(uninstall);

function gridWithOneCell() {
    const grid = fakeRoot();
    grid.setAttribute("role", "grid");
    const cell = new FakeElement("div");
    cell.setAttribute("role", "gridcell");
    grid.appendChild(cell);
    return { grid, cell };
}

function freshSession() {
    return {
        schemaVersion: 1, puzzleId: "t", dim: 9,
        givens: new Uint8Array(81), values: new Uint8Array(81), candidates: new Uint16Array(81),
        createdAt: 0, updatedAt: 0,
    };
}

function noopCallbacks() {
    return { openHelp() {} };
}

test("boardHasFocus is true only for a gridcell descendant of gridRoot", () => {
    const { grid, cell } = gridWithOneCell();
    assert.equal(boardHasFocus(cell, grid), true);
});

test("boardHasFocus is false for null, body, textarea, and dialog descendants", () => {
    const { grid } = gridWithOneCell();
    assert.equal(boardHasFocus(null, grid), false);
    assert.equal(boardHasFocus(document.body, grid), false);

    const textarea = new FakeElement("textarea");
    assert.equal(boardHasFocus(textarea, grid), false);

    const dialog = new FakeElement("div");
    dialog.setAttribute("role", "dialog");
    const insideDialog = new FakeElement("div");
    insideDialog.setAttribute("role", "gridcell");
    dialog.appendChild(insideDialog);
    assert.equal(boardHasFocus(insideDialog, grid), false);
});

test("boardHasFocus requires gridRoot to be an Element", () => {
    assert.throws(() => boardHasFocus(null, {}), TypeError);
});

test("mounting without the required callback throws TypeError", () => {
    const { grid } = gridWithOneCell();
    const store = createStore(freshSession());
    assert.throws(() => createKeyboardAdapter({
        gridRoot: grid, store, settings: { get: () => ({}) },
        boardView: { select() {} }, announcer: { announce() {} },
        // openHelp missing
    }), TypeError);
});

test("KEYMAP covers move, digit, sticky, clear, undo/redo, and help", () => {
    const actions = getKeymap().map((row) => row.action);
    for (const expected of ["value", "candidate", "stickyToggle", "clear", "undo", "redo", "help"]) {
        assert.ok(actions.includes(expected), `KEYMAP is missing an entry for "${expected}"`);
    }
});

test("digit entry sets a value when the board has focus and a cell is selected", () => {
    const { grid, cell } = gridWithOneCell();
    document.activeElement = cell;
    const store = createStore(freshSession());
    const settings = { get: () => ({ shiftQuasimode: true, autoRemoveCandidates: true }) };
    const adapter = createKeyboardAdapter({
        gridRoot: grid, store, settings,
        boardView: { select() {} },
        announcer: { announce() {} },
        ...noopCallbacks(),
    });
    adapter.select(0);
    let prevented = false;
    adapter.onKeyDown({ code: "Digit5", key: "5", preventDefault: () => { prevented = true; } });
    assert.equal(store.session.values[0], 5);
    assert.ok(prevented);
});

test("keys are ignored entirely when the board does not have focus", () => {
    const { grid } = gridWithOneCell();
    document.activeElement = document.body;
    const store = createStore(freshSession());
    const adapter = createKeyboardAdapter({
        gridRoot: grid, store, settings: { get: () => ({ shiftQuasimode: true, autoRemoveCandidates: true }) },
        boardView: { select() {} }, announcer: { announce() {} },
        ...noopCallbacks(),
    });
    adapter.select(0);
    adapter.onKeyDown({ code: "Digit5", key: "5", preventDefault() {} });
    assert.equal(store.session.values[0], 0);
});
