import { test } from "node:test";
import assert from "node:assert/strict";
import { conflicts, eliminationTargets, isSolved } from "../../game/static/game/js/core/rules.js";

const EMPTY = new Uint8Array(81);

// A valid, complete 9x9 grid via the standard base-pattern construction:
// pattern(r,c) = (3*(r%3) + floor(r/3) + c) % 9 satisfies every row, column,
// and 3x3 box exactly once.
function pattern(r, c) {
    return (3 * (r % 3) + Math.floor(r / 3) + c) % 9;
}
const SOLVED = Uint8Array.from(
    Array.from({ length: 81 }, (_, i) => pattern((i / 9) | 0, i % 9) + 1)
);

test("duplicate values in the same row are both reported", () => {
    const values = new Uint8Array(81);
    values[0] = 5;
    values[1] = 5;
    const out = conflicts(values, EMPTY);
    assert.ok(out.has(0) && out.has(1));
});

test("a given and a user value conflicting are both reported", () => {
    const givens = new Uint8Array(81);
    givens[0] = 5;
    const values = new Uint8Array(81);
    values[1] = 5;
    const out = conflicts(values, givens);
    assert.ok(out.has(0) && out.has(1));
});

test("isSolved is true for a complete valid grid, false after one change", () => {
    assert.equal(isSolved(SOLVED, EMPTY), true);
    const mutated = Uint8Array.from(SOLVED);
    mutated[0] = mutated[0] === 9 ? 1 : mutated[0] + 1;
    assert.equal(isSolved(mutated, EMPTY), false);
});

test("isSolved is false while any cell is empty", () => {
    const values = Uint8Array.from(SOLVED);
    values[0] = 0;
    assert.equal(isSolved(values, EMPTY), false);
});

test("wrong-length array and out-of-range digit throw RangeError", () => {
    assert.throws(() => conflicts(new Uint8Array(80), new Uint8Array(80)), RangeError);
    assert.throws(() => eliminationTargets(new Uint16Array(81), 0, 0), RangeError);
});

test("rules.js source has no identifier named solution (M2 regression)", async () => {
    const url = new URL("../../game/static/game/js/core/rules.js", import.meta.url);
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(url, "utf8");
    assert.doesNotMatch(source, /\bsolution\b/);
});
