import { test } from "node:test";
import assert from "node:assert/strict";
import { CELLS, PEERS, UNITS } from "../../game/static/game/js/core/spec.js";

test("PEERS[i] has length 20 and excludes i", () => {
    for (let i = 0; i < CELLS; i++) {
        assert.equal(PEERS[i].length, 20);
        assert.ok(!PEERS[i].includes(i));
    }
});

test("UNITS has 27 groups of 9 unique indices each", () => {
    assert.equal(UNITS.length, 27);
    for (const unit of UNITS) {
        assert.equal(unit.length, 9);
        assert.equal(new Set(unit).size, 9);
    }
});

test("every cell belongs to exactly 3 units", () => {
    const membership = new Array(CELLS).fill(0);
    for (const unit of UNITS) for (const i of unit) membership[i]++;
    assert.ok(membership.every((n) => n === 3));
});

test("exported arrays are frozen", () => {
    assert.throws(() => PEERS.push([]), TypeError);
    assert.throws(() => UNITS[0].push(999), TypeError);
});
