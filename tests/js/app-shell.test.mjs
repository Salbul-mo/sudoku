import { test, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeDocument, fakeRoot } from "./helpers/fake-dom.mjs";

const uninstall = installFakeDocument();
const { mountShell } = await import("../../game/static/game/js/ui/app-shell.js");
const { createStore } = await import("../../game/static/game/js/core/store.js");
after(uninstall);

function freshSession(overrides = {}) {
    return {
        schemaVersion: 1, puzzleId: "t", dim: 9,
        givens: new Uint8Array(81), values: new Uint8Array(81), candidates: new Uint16Array(81),
        cellNotes: {}, regionNotes: {}, createdAt: 0, updatedAt: 0,
        ...overrides,
    };
}

function noopDeps(overrides = {}) {
    return {
        dialogs: { confirm: async () => true },
        announcer: { announce() {} },
        openShare() {}, openNotes() {}, openSettings() {}, openHelp() {},
        startNewGame() {},
        ...overrides,
    };
}

test("mounting without a required callback throws TypeError", () => {
    const store = createStore(freshSession());
    const deps = noopDeps();
    delete deps.openHelp;
    assert.throws(() => mountShell(fakeRoot(), store, { get: () => ({}) }, deps), TypeError);
});

test("all 8 header actions are rendered", () => {
    const store = createStore(freshSession());
    const shell = mountShell(fakeRoot(), store, { get: () => ({}) }, noopDeps());
    assert.equal(Object.keys(shell.actions).length, 8);
});

test("an unknown destructive action throws RangeError", async () => {
    const store = createStore(freshSession());
    const shell = mountShell(fakeRoot(), store, { get: () => ({}) }, noopDeps());
    await assert.rejects(shell.onDestructive("wipeEverything"), RangeError);
});

test("clearAll removes user values and candidates but leaves givens intact (T-UI-B14-08)", async () => {
    const givens = new Uint8Array(81);
    givens[0] = 7;
    const store = createStore(freshSession({ givens }));
    store.setValue(1, 5);
    store.toggleCandidate(2, 3);
    const shell = mountShell(fakeRoot(), store, { get: () => ({}) }, noopDeps());
    await shell.onDestructive("clearAll");
    assert.equal(store.session.givens[0], 7);
    assert.equal(store.session.values[1], 0);
    assert.equal(store.session.candidates[2], 0);
});

test("deleteAllNotes clears both note bags and clearAll/deleteAllNotes each undo in one step (T-UI-B14-09)", async () => {
    const store = createStore(freshSession());
    store.setNote({ kind: "cell", key: 0 }, "note");
    const shell = mountShell(fakeRoot(), store, { get: () => ({}) }, noopDeps());
    await shell.onDestructive("deleteAllNotes");
    assert.equal(store.getNote({ kind: "cell", key: 0 }), "");
    store.undo();
    assert.equal(store.getNote({ kind: "cell", key: 0 }), "note");
});

test("cancelling a destructive action leaves the store untouched", async () => {
    const store = createStore(freshSession());
    store.setValue(0, 5);
    const shell = mountShell(fakeRoot(), store, { get: () => ({}) },
        noopDeps({ dialogs: { confirm: async () => false } }));
    await shell.onDestructive("clearAll");
    assert.equal(store.session.values[0], 5);
});

test("a corrupted hintStripSeenCount is treated as 0 (T-UI-B14-11)", () => {
    const store = createStore(freshSession());
    let savedTo = null;
    const settings = { get: () => ({ hintStripSeenCount: "not-a-number" }), set: (k, v) => { savedTo = v; } };
    const shell = mountShell(fakeRoot(), store, settings, noopDeps());
    shell.maybeShowHintStrip(true);
    assert.equal(savedTo, 1);
});

test("the hint strip does not show once the seen count reaches 3", () => {
    const store = createStore(freshSession());
    const settings = { get: () => ({ hintStripSeenCount: 3 }), set() { throw new Error("should not save"); } };
    const shell = mountShell(fakeRoot(), store, settings, noopDeps());
    assert.equal(shell.maybeShowHintStrip(true), null);
});

test("completion announces exactly once when the puzzle becomes solved", () => {
    function pattern(r, c) { return (3 * (r % 3) + Math.floor(r / 3) + c) % 9; }
    const solved = Array.from({ length: 81 }, (_, i) => pattern((i / 9) | 0, i % 9) + 1);
    const almost = Uint8Array.from(solved);
    almost[0] = 0; // one cell left empty
    const store = createStore(freshSession({ givens: new Uint8Array(81), values: almost }));
    let completions = 0;
    mountShell(fakeRoot(), store, { get: () => ({}) },
        noopDeps({ announcer: { announce: (kind) => { if (kind === "completion") completions++; } } }));
    store.setValue(0, solved[0]); // fills the last cell with the correct digit
    assert.equal(completions, 1);
});
