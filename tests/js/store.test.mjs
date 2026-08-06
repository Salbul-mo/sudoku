import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../../game/static/game/js/core/store.js";

function freshSession(overrides = {}) {
    return {
        schemaVersion: 1,
        puzzleId: "test",
        dim: 9,
        givens: new Uint8Array(81),
        values: new Uint8Array(81),
        candidates: new Uint16Array(81),
        createdAt: 0,
        updatedAt: 0,
        ...overrides,
    };
}

test("dim=12 session throws RangeError", () => {
    assert.throws(() => createStore(freshSession({ dim: 12 })), RangeError);
});

test("overlapping given and value throws Error", () => {
    const givens = new Uint8Array(81);
    givens[0] = 5;
    const values = new Uint8Array(81);
    values[0] = 3;
    assert.throws(() => createStore(freshSession({ givens, values })), Error);
});

test("unsubscribing stops further notifications", () => {
    const store = createStore(freshSession());
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    store.setValue(0, 5);
    unsubscribe();
    store.setValue(1, 5);
    assert.equal(calls, 1);
});

test("a no-op mutation does not notify", () => {
    const store = createStore(freshSession());
    let calls = 0;
    store.subscribe(() => calls++);
    const result = store.clearCell(0); // already empty
    assert.equal(result.ok, false);
    assert.equal(calls, 0);
});

test("setValue removes the same candidate from peers, undo restores both (V-UI-B03-01)", () => {
    const store = createStore(freshSession());
    store.toggleCandidate(1, 5); // peer of 0, same row
    store.setValue(0, 5, { autoRemoveCandidates: true });
    assert.equal(store.session.values[0], 5);
    assert.equal(store.session.candidates[1] & (1 << 4), 0);
    store.undo();
    assert.equal(store.session.values[0], 0);
    assert.equal(store.session.candidates[1] & (1 << 4), 1 << 4);
});

test("given cell mutation is rejected and the array is unchanged (V-UI-B03-02)", () => {
    const givens = new Uint8Array(81);
    givens[0] = 7;
    const store = createStore(freshSession({ givens }));
    const before = Array.from(store.session.values);
    const result = store.setValue(0, 3);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "given");
    assert.deepEqual(Array.from(store.session.values), before);
});

test("autoRemoveCandidates=false leaves peer candidates untouched", () => {
    const store = createStore(freshSession());
    store.toggleCandidate(1, 5);
    store.setValue(0, 5, { autoRemoveCandidates: false });
    assert.equal(store.session.candidates[1] & (1 << 4), 1 << 4);
});

test("re-entering the same digit clears the value", () => {
    const store = createStore(freshSession());
    store.setValue(0, 5);
    store.setValue(0, 5);
    assert.equal(store.session.values[0], 0);
});

test("toggleCandidate on a filled cell is a noop (CF normalization)", () => {
    const store = createStore(freshSession());
    store.setValue(0, 5);
    const result = store.toggleCandidate(0, 3);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "noop");
});

test("conflicts() reflects live mutations without any solution (V-UI-B03-03)", () => {
    const store = createStore(freshSession());
    store.setValue(0, 5);
    store.setValue(1, 5);
    const out = store.conflicts();
    assert.ok(out.has(0) && out.has(1));
});

test("isSolved() is true once the grid is complete (V-UI-B03-04)", () => {
    function pattern(r, c) { return (3 * (r % 3) + Math.floor(r / 3) + c) % 9; }
    const givens = Uint8Array.from(
        Array.from({ length: 81 }, (_, i) => pattern((i / 9) | 0, i % 9) + 1)
    );
    const store = createStore(freshSession({ givens }));
    assert.equal(store.isSolved(), true);
});

test("checkAnswer() returns null when the session has no solution", () => {
    const store = createStore(freshSession({ solution: null }));
    store.setValue(0, 5);
    assert.equal(store.checkAnswer(), null);
});

test("checkAnswer() flags only filled cells that disagree with the solution", () => {
    const solution = Uint8Array.from({ length: 81 }, (_, i) => (i % 9) + 1);
    const store = createStore(freshSession({ solution }));
    store.setValue(0, solution[0]); // correct
    store.setValue(1, solution[1] === 9 ? 1 : solution[1] + 1); // wrong
    const wrong = store.checkAnswer();
    assert.deepEqual([...wrong], [1]);
});

test("checkAnswer() ignores empty cells (unfilled is not wrong)", () => {
    const solution = Uint8Array.from({ length: 81 }, (_, i) => (i % 9) + 1);
    const store = createStore(freshSession({ solution }));
    const wrong = store.checkAnswer();
    assert.equal(wrong.size, 0);
});
