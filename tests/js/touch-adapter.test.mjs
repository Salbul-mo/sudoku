import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveVisibility, createTouchAdapter } from "../../game/static/game/js/ui/touch-adapter.js";
import { createStore } from "../../game/static/game/js/core/store.js";

function freshSession(overrides = {}) {
    return {
        schemaVersion: 1, puzzleId: "t", dim: 9,
        givens: new Uint8Array(81), values: new Uint8Array(81), candidates: new Uint16Array(81),
        createdAt: 0, updatedAt: 0,
        ...overrides,
    };
}

function noopDeps(store, overrides = {}) {
    return {
        root: {}, store,
        settings: { get: () => ({ autoRemoveCandidates: true }) },
        boardView: { select() {} },
        announcer: { announce() {} },
        ...overrides,
    };
}

test("show/hide/auto resolve independently of the media query (V-UI-B09-03)", () => {
    assert.equal(resolveVisibility("show", false), "visible");
    assert.equal(resolveVisibility("hide", true), "collapsed");
    assert.equal(resolveVisibility("auto", true), "visible");
    assert.equal(resolveVisibility("auto", false), "collapsed");
});

test("resolveVisibility rejects an unknown setting or non-boolean match", () => {
    assert.throws(() => resolveVisibility("maybe", true), RangeError);
    assert.throws(() => resolveVisibility("auto", "yes"), TypeError);
});

test("re-tapping the same digit clears activeDigit", () => {
    const adapter = createTouchAdapter(noopDeps(createStore(freshSession())));
    assert.equal(adapter.onDigitTap(5), 5);
    assert.equal(adapter.onDigitTap(5), null);
    assert.equal(adapter.onDigitTap(3), 3);
});

test("Digit First: tapping a cell with an active digit sets the value, given cells are ignored (V-UI-B09-01)", () => {
    const givens = new Uint8Array(81);
    givens[1] = 7;
    const store = createStore(freshSession({ givens }));
    const adapter = createTouchAdapter(noopDeps(store));
    adapter.onDigitTap(4);
    adapter.onCellTap(0);
    assert.equal(store.session.values[0], 4);

    const result = adapter.onCellTap(1); // given cell
    assert.equal(result.ok, false);
    assert.equal(result.reason, "given");
    assert.equal(store.session.values[1], 0);
});

test("Cell First: selecting a cell without an active digit just selects (V-UI-B09-02)", () => {
    let selected = null;
    const store = createStore(freshSession());
    const adapter = createTouchAdapter(noopDeps(store, { boardView: { select(i) { selected = i; } } }));
    const result = adapter.onCellTap(10);
    assert.equal(result.reason, "selected");
    assert.equal(selected, 10);
    assert.equal(store.session.values[10], 0);
});

test("sticky mode routes digit entry through toggleCandidate instead of setValue", () => {
    const store = createStore(freshSession());
    const adapter = createTouchAdapter(noopDeps(store));
    adapter.onPencilTap(); // sticky on
    adapter.onDigitTap(6);
    adapter.onCellTap(20);
    assert.equal(store.session.values[20], 0);
    assert.notEqual(store.session.candidates[20] & (1 << 5), 0);
});

test("touch-adapter.js source never creates an input, textarea, or contenteditable element (hard invariant)", async () => {
    const { readFile } = await import("node:fs/promises");
    const url = new URL("../../game/static/game/js/ui/touch-adapter.js", import.meta.url);
    const source = await readFile(url, "utf8");
    assert.doesNotMatch(source, /createElement\(\s*["'](input|textarea)["']\s*\)/);
    assert.doesNotMatch(source, /contentEditable/);
});
