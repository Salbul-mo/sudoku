import { test } from "node:test";
import assert from "node:assert/strict";
import { moveSelection } from "../../game/static/game/js/ui/board-nav.js";

test("each of the four directions moves one cell and stops at the boundary", () => {
    assert.equal(moveSelection(0, "up", "none"), 0); // top row, can't go up
    assert.equal(moveSelection(0, "down", "none"), 9);
    assert.equal(moveSelection(0, "left", "none"), 0); // left column, can't go left
    assert.equal(moveSelection(0, "right", "none"), 1);
});

test("ctrl moves 3 cells and clamps to the edge", () => {
    assert.equal(moveSelection(0, "down", "ctrl"), 27); // row 0 -> row 3
    assert.equal(moveSelection(72, "down", "ctrl"), 72); // row 8, already at bottom
});

test("lineStart/lineEnd with ctrl give 0 and 80", () => {
    assert.equal(moveSelection(40, "lineStart", "ctrl"), 0);
    assert.equal(moveSelection(40, "lineEnd", "ctrl"), 80);
    assert.equal(moveSelection(40, "lineStart", "none"), 36); // row 4 start
    assert.equal(moveSelection(40, "lineEnd", "none"), 44); // row 4 end
});

test("all 81 starting points x 6 directions x 2 modifiers stay in 0..80", () => {
    const directions = ["up", "down", "left", "right", "lineStart", "lineEnd"];
    for (let from = 0; from < 81; from++) {
        for (const direction of directions) {
            for (const modifier of ["none", "ctrl"]) {
                const to = moveSelection(from, direction, modifier);
                assert.ok(to >= 0 && to <= 80, `from=${from} dir=${direction} mod=${modifier} -> ${to}`);
            }
        }
    }
});

test("out-of-range inputs throw RangeError", () => {
    assert.throws(() => moveSelection(-1, "up", "none"), RangeError);
    assert.throws(() => moveSelection(0, "diagonal", "none"), RangeError);
    assert.throws(() => moveSelection(0, "up", "shift"), RangeError);
});
