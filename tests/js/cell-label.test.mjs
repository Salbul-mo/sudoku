import { test } from "node:test";
import assert from "node:assert/strict";
import { cellLabel } from "../../game/static/game/js/ui/cell-label.js";

function base(overrides = {}) {
    return { index: 0, given: 0, value: 0, candidates: 0, conflict: false, ...overrides };
}

test("given, user value, and empty cells each produce the right phrase (V-UI-B06-04)", () => {
    assert.match(cellLabel(base({ given: 7 })), /고정 숫자 7/);
    assert.ok(cellLabel(base({ value: 3 })).split(", ").includes("3"));
    assert.match(cellLabel(base()), /빈 칸/);
});

test("a candidate mask becomes an ascending digit list", () => {
    const mask = (1 << 0) | (1 << 2) | (1 << 6); // digits 1, 3, 7
    assert.match(cellLabel(base({ candidates: mask })), /후보 1, 3, 7/);
});

test("conflict is reflected in the sentence", () => {
    const label = cellLabel(base({ value: 5, conflict: true }));
    assert.match(label, /규칙 위반/);
});

test("given and value both non-zero throws Error", () => {
    assert.throws(() => cellLabel(base({ given: 5, value: 3 })), Error);
});

test("every label starts with '행 열'", () => {
    assert.match(cellLabel(base({ index: 40 })), /^5행 5열/);
});
