// The techniques module and the engine policy built on it.
//
// The central check is T-B01-13: a board is masked down to what the focus view
// would actually show, and the deduction is re-derived from that alone. Hiding
// a cell only ever removes an elimination, so a masked board cannot invent a
// deduction -- it can only fail to support one, which is exactly the failure
// worth catching. Measurement with an earlier design found that showing the
// target cell's own row, column and box makes 100% of hidden singles
// unanswerable; that is why "units" is not an assist level.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    ASSISTS, TECHNIQUES, assistCells, buildCandidates, findAll, visibleSupports,
} from "../../game/static/game/js/rush/techniques.js";
import { nextTarget } from "../../game/static/game/js/rush/engine.js";
import { RUSH, difficultyFor } from "../../game/static/game/js/rush/config.js";
import { CELLS, DIM, PEERS, UNITS } from "../../game/static/game/js/core/spec.js";
import { generatePuzzle } from "../../functions/_lib/sudoku/generator.js";

function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function boardFrom(givens = 50) {
    const { puzzle, solution } = generatePuzzle({ givens });
    return { values: Uint8Array.from(puzzle), solution: Uint8Array.from(solution) };
}

// Walks a board the way a run does, handing each position to the caller.
function eachPosition(seed, steps, visit, givens = 50) {
    const rng = seeded(seed);
    const { values, solution } = boardFrom(givens);
    for (let step = 0; step < steps && values.includes(0); step++) {
        visit(values, solution, step);
        const all = findAll(values);
        const pick = all.length > 0
            ? all[Math.floor(rng() * all.length)]
            : { index: values.indexOf(0), digit: solution[values.indexOf(0)] };
        values[pick.index] = solution[pick.index];
    }
}

const bit = (d) => 1 << (d - 1);

// Independent of the module under test: plain enumeration, no bitmasks.
function naiveNakedSingles(values) {
    const out = new Set();
    for (let i = 0; i < CELLS; i++) {
        if (values[i] !== 0) continue;
        const possible = [];
        for (let d = 1; d <= DIM; d++) if (!PEERS[i].some((p) => values[p] === d)) possible.push(d);
        if (possible.length === 1) out.add(`${i}:${possible[0]}`);
    }
    return out;
}

function naiveHiddenSingles(values) {
    const out = new Set();
    for (let unit = 0; unit < UNITS.length; unit++) {
        for (let d = 1; d <= DIM; d++) {
            if (UNITS[unit].some((c) => values[c] === d)) continue;
            const spots = UNITS[unit].filter(
                (c) => values[c] === 0 && !PEERS[c].some((p) => values[p] === d),
            );
            if (spots.length === 1) out.add(`${unit}:${d}:${spots[0]}`);
        }
    }
    return out;
}

// Re-derives the deduction from the cells the assist level leaves visible.
function solvableFromVisible(values, candidate, assist) {
    const visible = assistCells(candidate, assist);
    if (visible === null) return true;
    const masked = new Uint8Array(CELLS);
    for (const i of visible) masked[i] = values[i];
    const cands = buildCandidates(masked);
    if (masked[candidate.index] !== 0) return false;
    if (candidate.technique === "naked-single") return cands[candidate.index] === bit(candidate.digit);
    if (!UNITS[candidate.unit].every((c) => visible.has(c))) return false;
    let spots = 0;
    for (const c of UNITS[candidate.unit]) {
        if (masked[c] === 0 && (cands[c] & bit(candidate.digit))) spots++;
    }
    return spots === 1 && (cands[candidate.index] & bit(candidate.digit)) !== 0;
}

test("T-B01-13: every candidate is answerable from the cells its assist level shows", () => {
    let checked = 0;
    for (let b = 0; b < 12; b++) {
        eachPosition(b * 7919 + 1, 20, (values) => {
            for (const candidate of findAll(values)) {
                for (const assist of ASSISTS) {
                    assert.ok(
                        solvableFromVisible(values, candidate, assist),
                        `${candidate.technique} at ${candidate.index} unanswerable under "${assist}"`,
                    );
                    checked++;
                }
            }
        });
    }
    assert.ok(checked > 1000, `expected a meaningful sample, got ${checked}`);
});

test("T-B01-14: the same board yields the same candidates and the same evidence", () => {
    eachPosition(4242, 15, (values) => {
        assert.deepEqual(findAll(values), findAll(values));
        for (const candidate of findAll(values)) {
            assert.deepEqual(
                [...candidate.units].sort((a, b) => a - b), candidate.units,
                "evidence units must be sorted, or two runs paint different boards",
            );
        }
    });
});

test("T-B01-16: naked and hidden singles agree with plain enumeration", () => {
    eachPosition(31337, 20, (values) => {
        const all = findAll(values);
        const naked = new Set(
            all.filter((c) => c.technique === "naked-single").map((c) => `${c.index}:${c.digit}`),
        );
        assert.deepEqual(naked, naiveNakedSingles(values));

        // A cell that is both is reported as the naked one, so the hidden set
        // is compared after removing those.
        const cands = buildCandidates(values);
        const single = (mask) => mask !== 0 && (mask & (mask - 1)) === 0;
        const expected = new Set(
            [...naiveHiddenSingles(values)].filter((key) => !single(cands[Number(key.split(":")[2])])),
        );
        const hidden = new Set(
            all.filter((c) => c.technique !== "naked-single").map((c) => `${c.unit}:${c.digit}:${c.index}`),
        );
        // Evidence that cannot be expressed as units is dropped, so the module
        // may report a subset -- never something enumeration does not see.
        for (const key of hidden) assert.ok(expected.has(key), `unexpected hidden single ${key}`);
    });
});

test("T-B01-20: a cell is never offered twice by two techniques at once", () => {
    eachPosition(777, 20, (values) => {
        const nakedCells = new Set(
            findAll(values).filter((c) => c.technique === "naked-single").map((c) => c.index),
        );
        for (const c of findAll(values)) {
            if (c.technique === "naked-single") continue;
            assert.ok(!nakedCells.has(c.index), `cell ${c.index} offered as both`);
        }
    });
});

test("T-B01-22: assist levels nest, and \"off\" means the whole board", () => {
    eachPosition(99, 10, (values) => {
        for (const candidate of findAll(values)) {
            const evidence = assistCells(candidate, "evidence");
            const band = assistCells(candidate, "band");
            assert.ok(evidence.has(candidate.index), "the target cell is always shown");
            for (const cell of evidence) assert.ok(band.has(cell), "band must contain the evidence");
            assert.ok(band.size >= evidence.size);
            assert.equal(assistCells(candidate, "off"), null);
            assert.ok(visibleSupports(candidate, "evidence"));
            assert.ok(visibleSupports(candidate, "band"));
            assert.ok(visibleSupports(candidate, "off"));
        }
    });
    assert.throws(() => assistCells({ index: 0, units: [0] }, "units"), RangeError);
});

test("T-B01-24: \"the target's own units\" is not an assist level", () => {
    // It reads as a tighter setting but is an impossible one: measured, it
    // hides the crosshatch behind every hidden single.
    assert.ok(!ASSISTS.includes("units"));
    assert.deepEqual([...ASSISTS], ["evidence", "band", "off"]);
    for (const row of RUSH.TECHNIQUE_SCHEDULE) assert.ok(ASSISTS.includes(row.assist), row.assist);
});

test("T-B01-12: the engine rejects options it does not understand", () => {
    const { values, solution } = boardFrom(45);
    const rng = seeded(1);
    assert.throws(() => nextTarget(values, solution, rng, { allow: ["x-wing"] }), RangeError);
    assert.throws(() => nextTarget(values, solution, rng, { assist: "units" }), RangeError);
    assert.throws(() => nextTarget(values, solution, rng, { maxEvidenceUnits: 0 }), RangeError);
    assert.throws(() => nextTarget(values, solution, rng, { maxEvidenceUnits: 1.5 }), RangeError);
    for (const technique of TECHNIQUES) {
        assert.doesNotThrow(() => nextTarget(values, solution, rng, { allow: [technique] }));
    }
});

test("T-B01-17: the engine honours the allowed set and the evidence cap", () => {
    for (let b = 0; b < 10; b++) {
        const { values, solution } = boardFrom(45);
        const target = nextTarget(values, solution, seeded(b + 1), {
            allow: [...TECHNIQUES], assist: "band", maxEvidenceUnits: RUSH.MAX_EVIDENCE_UNITS,
        });
        assert.notEqual(target, null);
        assert.ok(TECHNIQUES.includes(target.technique));
        assert.ok(target.units.length <= RUSH.MAX_EVIDENCE_UNITS, `${target.units.length} units`);
        assert.equal(target.digit, solution[target.index]);

        const nakedOnly = nextTarget(values, solution, seeded(b + 1), { allow: ["naked-single"] });
        assert.equal(nakedOnly.technique, "naked-single");
    }
});

test("T-B01-25: the schedule never starves the engine, and boards still complete", () => {
    let giveaways = 0;
    let steps = 0;
    for (let b = 0; b < 8; b++) {
        const rng = seeded(b * 104729 + 5);
        const { values, solution } = boardFrom(50);
        for (let step = 0; step < 40 && values.includes(0); step++) {
            const { allow, assist } = difficultyFor(step);
            const target = nextTarget(values, solution, rng, {
                allow, assist, maxEvidenceUnits: RUSH.MAX_EVIDENCE_UNITS,
            });
            if (target === null) break;
            assert.ok(visibleSupports(target, assist), "offered a step the player cannot see");
            assert.equal(new Set(target.revealed).size, target.revealed.length);
            assert.ok(!target.revealed.includes(target.index));
            for (const i of target.revealed) values[i] = solution[i];
            giveaways += target.revealed.length;
            values[target.index] = target.digit;
            steps++;
        }
    }
    assert.ok(steps > 200, `expected a real sample, got ${steps} steps`);
    // Hidden singles are plentiful enough that the giveaway fallback should
    // never be needed. If this starts firing, the cap or the schedule moved.
    assert.equal(giveaways, 0, `${giveaways} cells were given away over ${steps} steps`);
});
