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

// Stands in for the real board: holds the selection the adapter reads back
// through boardView.selection, seeded at 0 exactly as mountBoard does.
function fakeBoardView(initial = 0) {
    let current = initial;
    return {
        select(i) { current = i; },
        get selection() { return current; },
    };
}

function noopDeps(store, overrides = {}) {
    return {
        root: {}, store,
        settings: { get: () => ({ autoRemoveCandidates: true }) },
        boardView: fakeBoardView(),
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

test("Cell First: a cell tap only selects, it never writes a value (V-UI-B09-02)", () => {
    const store = createStore(freshSession());
    const boardView = fakeBoardView();
    const adapter = createTouchAdapter(noopDeps(store, { boardView }));
    const result = adapter.onCellTap(10);
    assert.equal(result.reason, "selected");
    assert.equal(boardView.selection, 10);
    assert.equal(store.session.values[10], 0);
});

test("Cell First: a digit tap fills the selected cell (V-UI-B09-01)", () => {
    const store = createStore(freshSession());
    const adapter = createTouchAdapter(noopDeps(store));
    adapter.onCellTap(10);
    adapter.onDigitTap(4);
    assert.equal(store.session.values[10], 4);
});

test("a digit tap follows the selection as it moves, and writes nowhere else", () => {
    const store = createStore(freshSession());
    const adapter = createTouchAdapter(noopDeps(store));
    adapter.onCellTap(10);
    adapter.onDigitTap(4);
    adapter.onCellTap(20);
    adapter.onDigitTap(7);
    assert.equal(store.session.values[10], 4);
    assert.equal(store.session.values[20], 7);
    assert.equal(store.session.values.filter(Boolean).length, 2);
});

test("a digit tap lands on the board's seeded selection when no cell was tapped yet", () => {
    // mountBoard seeds a selection at 0 and paints it, so a first-time user
    // who taps a digit before any cell must not be silently ignored.
    const store = createStore(freshSession());
    const adapter = createTouchAdapter(noopDeps(store));
    adapter.onDigitTap(3);
    assert.equal(store.session.values[0], 3);
});

test("a given cell is selectable, but a digit tap on it is rejected and announced", () => {
    const givens = new Uint8Array(81);
    givens[1] = 7;
    const store = createStore(freshSession({ givens }));
    const announced = [];
    const adapter = createTouchAdapter(noopDeps(store, {
        announcer: { announce: (kind) => announced.push(kind) },
    }));

    assert.equal(adapter.onCellTap(1).reason, "selected");
    const result = adapter.onDigitTap(4);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "given");
    assert.equal(store.session.values[1], 0);
    assert.deepEqual(announced, ["given-rejected"]);
});

test("re-tapping the digit a cell already holds clears it (the touch-only erase path)", () => {
    const store = createStore(freshSession());
    const adapter = createTouchAdapter(noopDeps(store));
    adapter.onCellTap(10);
    adapter.onDigitTap(4);
    assert.equal(store.session.values[10], 4);
    adapter.onDigitTap(4);
    assert.equal(store.session.values[10], 0);
});

test("sticky mode routes digit entry through toggleCandidate instead of setValue", () => {
    const store = createStore(freshSession());
    const adapter = createTouchAdapter(noopDeps(store));
    adapter.onPencilTap(); // sticky on
    adapter.onCellTap(20);
    adapter.onDigitTap(6);
    assert.equal(store.session.values[20], 0);
    assert.notEqual(store.session.candidates[20] & (1 << 5), 0);
});

test("the erase button clears the selected cell's value and its candidates together", () => {
    const store = createStore(freshSession());
    const adapter = createTouchAdapter(noopDeps(store));

    adapter.onCellTap(10);
    adapter.onPencilTap();
    adapter.onDigitTap(2); // candidate only, no value
    adapter.onPencilTap();
    assert.notEqual(store.session.candidates[10], 0);

    assert.equal(adapter.onEraseTap().ok, true);
    assert.equal(store.session.values[10], 0);
    assert.equal(store.session.candidates[10], 0);
});

test("the erase button clears a filled cell without needing to know its digit", () => {
    const store = createStore(freshSession());
    const adapter = createTouchAdapter(noopDeps(store));
    adapter.onCellTap(10);
    adapter.onDigitTap(4);
    assert.equal(adapter.onEraseTap().ok, true);
    assert.equal(store.session.values[10], 0);
});

test("erasing an already-empty cell is a harmless no-op", () => {
    const store = createStore(freshSession());
    const adapter = createTouchAdapter(noopDeps(store));
    adapter.onCellTap(10);
    const result = adapter.onEraseTap();
    assert.equal(result.ok, false);
    assert.equal(result.reason, "noop");
});

test("erasing a given cell is rejected and announced, never silently ignored", () => {
    const givens = new Uint8Array(81);
    givens[1] = 7;
    const store = createStore(freshSession({ givens }));
    const announced = [];
    const adapter = createTouchAdapter(noopDeps(store, {
        announcer: { announce: (kind) => announced.push(kind) },
    }));
    adapter.onCellTap(1);
    const result = adapter.onEraseTap();
    assert.equal(result.ok, false);
    assert.equal(result.reason, "given");
    assert.equal(store.session.givens[1], 7);
    assert.deepEqual(announced, ["given-rejected"]);
});

test("a digit tap is a no-op when the board reports no selection", () => {
    const store = createStore(freshSession());
    const adapter = createTouchAdapter(noopDeps(store, {
        boardView: { select() {}, get selection() { return null; } },
    }));
    const result = adapter.onDigitTap(4);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "no-selection");
    assert.equal(store.session.values.filter(Boolean).length, 0);
});

test("an out-of-range digit still throws RangeError", () => {
    const adapter = createTouchAdapter(noopDeps(createStore(freshSession())));
    assert.throws(() => adapter.onDigitTap(0), RangeError);
    assert.throws(() => adapter.onDigitTap(10), RangeError);
});

test("touch-adapter.js source never creates an input, textarea, or contenteditable element (hard invariant)", async () => {
    const { readFile } = await import("node:fs/promises");
    const url = new URL("../../game/static/game/js/ui/touch-adapter.js", import.meta.url);
    const source = await readFile(url, "utf8");
    assert.doesNotMatch(source, /createElement\(\s*["'](input|textarea)["']\s*\)/);
    assert.doesNotMatch(source, /contentEditable/);
});
