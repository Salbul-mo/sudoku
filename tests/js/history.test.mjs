import { test } from "node:test";
import assert from "node:assert/strict";
import { History } from "../../game/static/game/js/core/history.js";

function entry(n) {
    return { kind: "value", key: n, before: 0, after: n, groupId: 0, at: 0 };
}

test("an empty group is not pushed onto the stack", () => {
    const h = new History();
    h.beginGroup();
    h.endGroup();
    assert.equal(h.undo(), null);
});

test("the 201st group evicts the oldest, order preserved", () => {
    const h = new History();
    for (let i = 0; i < 201; i++) {
        h.beginGroup();
        h.record(entry(i));
        h.endGroup();
    }
    const popped = [];
    let group;
    while ((group = h.undo()) !== null) popped.push(group[0].key);
    // Group 0 was evicted; groups 200..1 remain, popped in LIFO order.
    assert.equal(popped.length, 200);
    assert.equal(popped[0], 200);
    assert.equal(popped[199], 1);
});

test("recording after an undo clears the redo stack", () => {
    const h = new History();
    h.beginGroup(); h.record(entry(1)); h.endGroup();
    h.undo();
    h.beginGroup(); h.record(entry(2)); h.endGroup();
    assert.equal(h.redo(), null);
});

test("undo returns entries reversed, redo returns them forward", () => {
    const h = new History();
    h.beginGroup(); h.record(entry(1)); h.record(entry(2)); h.endGroup();
    const undone = h.undo();
    assert.deepEqual(undone.map((e) => e.key), [2, 1]);
    const redone = h.redo();
    assert.deepEqual(redone.map((e) => e.key), [1, 2]);
});

test("record without an open group throws", () => {
    const h = new History();
    assert.throws(() => h.record(entry(1)), Error);
});
