import { test } from "node:test";
import assert from "node:assert/strict";
import { candidatesFor, nextTarget } from "../../game/static/game/js/rush/claude-mhj_26_08_07_10_engine.js";
import { CELLS, PEERS } from "../../game/static/game/js/core/spec.js";
import { generatePuzzle } from "../../functions/_lib/sudoku/claude-mhj_26_08_05_04_generator.js";

// Deterministic RNG so a failure can be replayed from its seed.
function seeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

// The obvious implementation, kept separate so the bitmask version has
// something independent to be wrong against.
function naiveCandidates(values, index) {
    if (values[index] !== 0) return new Set();
    const out = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const peer of PEERS[index]) out.delete(values[peer]);
    return out;
}

function maskToSet(mask) {
    const out = new Set();
    for (let d = 1; d <= 9; d++) if (mask & (1 << (d - 1))) out.add(d);
    return out;
}

function boardFrom(givens) {
    const { puzzle, solution } = generatePuzzle({ givens });
    return { values: Uint8Array.from(puzzle), solution: Uint8Array.from(solution) };
}

test("T-B01-01: the bitmask candidates agree with a naive peer scan", () => {
    const rng = seeded(1);
    for (let n = 0; n < 50; n++) {
        const { values, solution } = boardFrom(40);
        // Fill a random slice so the positions tested are mid-game, not just
        // the puzzle as generated.
        for (let i = 0; i < CELLS; i++) if (values[i] === 0 && rng() < 0.3) values[i] = solution[i];
        for (let i = 0; i < CELLS; i++) {
            assert.deepEqual(
                maskToSet(candidatesFor(values, i)),
                naiveCandidates(values, i),
                `cell ${i} of board ${n}`,
            );
        }
    }
});

// The whole game rests on this loop ending. If it can spin, the tab locks up.
test("T-B01-02: every board can be played to completion, and reveals are counted", () => {
    const stats = new Map();
    for (const givens of [45, 50, 55]) {
        const reveals = [];
        for (let n = 0; n < 60; n++) {
            const rng = seeded(n * 977 + givens);
            const { values, solution } = boardFrom(givens);
            let revealed = 0;
            let steps = 0;
            for (;;) {
                const target = nextTarget(values, solution, rng);
                if (target === null) break;
                for (const i of target.revealed) values[i] = solution[i];
                revealed += target.revealed.length;
                values[target.index] = target.digit;
                steps++;
                assert.ok(steps <= CELLS, `board ${n} took more than ${CELLS} steps`);
            }
            for (let i = 0; i < CELLS; i++) assert.equal(values[i], solution[i], `board ${n} cell ${i}`);
            reveals.push(revealed);
        }
        reveals.sort((a, b) => a - b);
        stats.set(givens, {
            median: reveals[Math.floor(reveals.length / 2)],
            p90: reveals[Math.floor(reveals.length * 0.9)],
            max: reveals.at(-1),
        });
    }
    // Printed rather than asserted: this is the input to the givens decision
    // (R2), and a threshold picked before seeing the numbers would be noise.
    for (const [givens, s] of stats) {
        console.log(`  givens=${givens}  auto-reveals per board: median=${s.median} p90=${s.p90} max=${s.max}`);
    }
});

test("T-B01-03: nextTarget does not mutate the board it is given", () => {
    const { values, solution } = boardFrom(45);
    const before = Uint8Array.from(values);
    nextTarget(values, solution, seeded(7));
    assert.deepEqual(values, before);
});

test("T-B01-04: the returned target really is a naked single", () => {
    for (let n = 0; n < 40; n++) {
        const { values, solution } = boardFrom(50);
        const target = nextTarget(values, solution, seeded(n));
        assert.notEqual(target, null);

        assert.equal(values[target.index], 0, "target must be an empty cell");
        assert.equal(target.digit, solution[target.index], "target digit must be the solution's");
        assert.equal(new Set(target.revealed).size, target.revealed.length, "reveals must be distinct");
        assert.ok(!target.revealed.includes(target.index), "the target is not itself a reveal");

        const after = Uint8Array.from(values);
        for (const i of target.revealed) after[i] = solution[i];
        assert.equal(
            maskToSet(candidatesFor(after, target.index)).size, 1,
            "the target must have exactly one candidate once the reveals are applied",
        );
    }
});

test("T-B01-05: malformed input is rejected rather than played", () => {
    const { values, solution } = boardFrom(45);
    assert.throws(() => nextTarget(new Uint8Array(80), solution), RangeError);
    assert.throws(() => nextTarget(values, new Uint8Array(80)), RangeError);

    const incomplete = Uint8Array.from(solution);
    incomplete[17] = 0;
    assert.throws(() => nextTarget(values, incomplete), RangeError);

    const contradictory = Uint8Array.from(values);
    const empty = contradictory.indexOf(0);
    contradictory[empty] = (solution[empty] % 9) + 1; // any digit but the right one
    assert.throws(() => nextTarget(contradictory, solution), (e) => e instanceof Error && !(e instanceof RangeError));

    assert.throws(() => candidatesFor(values, 81), RangeError);
    assert.throws(() => candidatesFor(values, 1.5), RangeError);
});

test("T-B01-06: the same seed replays the same target", () => {
    const { values, solution } = boardFrom(45);
    const a = nextTarget(values, solution, seeded(42));
    const b = nextTarget(values, solution, seeded(42));
    assert.deepEqual(a, b);
});

test("T-B01-07: a full board yields no target", () => {
    const { solution } = boardFrom(45);
    assert.equal(nextTarget(Uint8Array.from(solution), solution, seeded(1)), null);
});
