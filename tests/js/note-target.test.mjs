import { test } from "node:test";
import assert from "node:assert/strict";
import { affectedCells, targetLabel, targetFromSelection } from "../../game/static/game/js/ui/note-target.js";

test("all four target kinds produce the right affected cells", () => {
    assert.deepEqual(affectedCells({ kind: "cell", key: 5 }), [5]);
    assert.deepEqual(affectedCells({ kind: "row", key: 3 }), [27, 28, 29, 30, 31, 32, 33, 34, 35]);
    const col0 = affectedCells({ kind: "column", key: 0 });
    assert.equal(col0.length, 9);
    assert.ok(col0.every((i) => i % 9 === 0));
});

test("region targets always produce exactly 9 cells", () => {
    for (const kind of ["row", "column", "box"]) {
        for (let key = 0; key < 9; key++) {
            assert.equal(affectedCells({ kind, key }).length, 9);
        }
    }
});

test("an out-of-range key throws RangeError", () => {
    assert.throws(() => affectedCells({ kind: "row", key: 9 }), RangeError);
    assert.throws(() => affectedCells({ kind: "cell", key: 81 }), RangeError);
    assert.throws(() => targetFromSelection(81, "cell"), RangeError);
});

test("targetLabel gives 1-based Korean labels", () => {
    assert.equal(targetLabel({ kind: "cell", key: 0 }), "1행 1열");
    assert.equal(targetLabel({ kind: "row", key: 3 }), "4행");
    assert.equal(targetLabel({ kind: "column", key: 3 }), "4열");
    assert.equal(targetLabel({ kind: "box", key: 0 }), "1번 박스");
});

test("targetFromSelection derives row/column/box from a cell index", () => {
    assert.deepEqual(targetFromSelection(0, "row"), { kind: "row", key: 0 });
    assert.deepEqual(targetFromSelection(10, "column"), { kind: "column", key: 1 });
    assert.deepEqual(targetFromSelection(0, "box"), { kind: "box", key: 0 });
    assert.deepEqual(targetFromSelection(80, "box"), { kind: "box", key: 8 });
});
