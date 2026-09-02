// The elimination half of the techniques module, and the guard that the
// placement half did not move while it was being built.
//
// M-B01-03 comes first on purpose. B-01 generalises the two evidence helpers
// that findAll() already depends on, and findAll() is what the rush mode is
// built out of -- so the refactor's first obligation is to prove it changed
// nothing. fixtures/find-all-baseline.json was captured from the code as it
// stood before that refactor; if a change to the evidence helpers alters a
// single deduction or a single evidence unit, T-E01-05 says so by name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
    ALL_TECHNIQUES, ASSISTS, ELIMINATION_TECHNIQUES, TECHNIQUES,
    assistCells, buildCandidates, findAll, findEliminations,
} from "../../game/static/game/js/rush/techniques.js";
import { CELLS, DIM, PEERS, UNITS } from "../../game/static/game/js/core/spec.js";
import { generatePuzzle } from "../../functions/_lib/sudoku/generator.js";

const ROOT = path.resolve(
    new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]):/, "$1:"),
);

const bit = (d) => 1 << (d - 1);
const popcount = (mask) => { let n = 0; while (mask) { mask &= mask - 1; n++; } return n; };

function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Same walk the fixture generator used, so a position here is a position a run
// could actually reach rather than a random scattering of digits.
function eachPosition(seed, steps, visit, givens = 50) {
    const rng = seeded(seed);
    const { puzzle, solution } = generatePuzzle({ givens, rng });
    const values = Uint8Array.from(puzzle);
    for (let step = 0; step < steps && values.includes(0); step++) {
        visit(values, solution);
        const all = findAll(values);
        const pick = all.length > 0
            ? all[Math.floor(rng() * all.length)]
            : { index: values.indexOf(0) };
        values[pick.index] = solution[pick.index];
    }
}

// ------------------------------------------------------------ M-B01-03

test("T-E01-05: findAll is byte-identical to the pre-refactor baseline", () => {
    const baseline = JSON.parse(
        readFileSync(path.join(ROOT, "tests", "js", "fixtures", "find-all-baseline.json"), "utf8"),
    );
    assert.deepEqual(baseline.techniques, [...TECHNIQUES], "the fixture indexes techniques by position");

    const pack = (d) => [
        TECHNIQUES.indexOf(d.technique), d.index, d.digit, d.unit ?? -1, ...d.units,
    ].join(",");

    for (const [n, position] of baseline.positions.entries()) {
        const values = Uint8Array.from(position.v, Number);
        assert.deepEqual(findAll(values).map(pack), position.d, `position ${n}`);
    }
});

test("T-E01-06: findAll marks every deduction as a placement", () => {
    eachPosition(11, 12, (values) => {
        for (const d of findAll(values)) assert.equal(d.kind, "placement");
    });
});

// ------------------------------------------------------------ M-B02-01

test("T-E01-07: the technique sets stay disjoint, and TECHNIQUES stays the rush set", () => {
    // rush/engine.js validates its options against TECHNIQUES. An elimination
    // leaking in there would have the rush mode ask "fill this cell" about a
    // deduction that fills no cell.
    assert.deepEqual([...TECHNIQUES], ["naked-single", "hidden-single-box", "hidden-single-line"]);
    assert.deepEqual(
        [...ELIMINATION_TECHNIQUES],
        ["pointing", "claiming", "naked-pair", "hidden-pair"],
    );
    assert.deepEqual([...ALL_TECHNIQUES], [...TECHNIQUES, ...ELIMINATION_TECHNIQUES]);
    for (const technique of ELIMINATION_TECHNIQUES) {
        assert.ok(!TECHNIQUES.includes(technique), `${technique} must not be a rush technique`);
    }
});

// ------------------------------------------------------------ shape

test("T-E02-13: findEliminations is deterministic and fully sorted", () => {
    eachPosition(4242, 15, (values) => {
        const once = findEliminations(values);
        assert.deepEqual(once, findEliminations(values));
        for (const d of once) {
            assert.equal(d.kind, "elimination");
            assert.ok(ELIMINATION_TECHNIQUES.includes(d.technique), d.technique);
            assert.ok(d.eliminations.length > 0, "an elimination with nothing to eliminate");
            const sorted = (xs) => xs.every((x, i) => i === 0 || xs[i - 1] < x);
            assert.ok(sorted(d.units), "evidence units must be sorted and unique");
            assert.ok(sorted(d.digits), "digits must be sorted and unique");
            assert.ok(sorted(d.subject), "subject cells must be sorted and unique");
            const keys = d.eliminations.map((e) => e.index * 10 + e.digit);
            assert.ok(sorted(keys), "eliminations must be sorted and unique");
        }
    });
});

test("T-E02-15: findEliminations rejects a board of the wrong length", () => {
    assert.throws(() => findEliminations(new Uint8Array(80)), RangeError);
    assert.throws(() => findEliminations(null), RangeError);
});

// ------------------------------------------------------------ correctness

// The elimination has to be true, not merely derivable: the digit it removes
// must not be the one the solved board puts there.
test("T-E02-02/06/10: no elimination ever removes the solution's own digit", () => {
    let checked = 0;
    for (let b = 0; b < 10; b++) {
        eachPosition(b * 613 + 5, 20, (values, solution) => {
            for (const d of findEliminations(values)) {
                for (const { index, digit } of d.eliminations) {
                    assert.notEqual(
                        solution[index], digit,
                        `${d.technique} removed the true digit ${digit} from cell ${index}`,
                    );
                    checked++;
                }
            }
        });
    }
    assert.ok(checked > 500, `expected a meaningful sample, got ${checked}`);
});

// Independent of the module under test: plain enumeration over candidate sets,
// no bitmask tricks, no shared helpers.
function naiveEliminations(values) {
    const cand = [];
    for (let i = 0; i < CELLS; i++) {
        const set = new Set();
        if (values[i] === 0) {
            for (let d = 1; d <= DIM; d++) if (!PEERS[i].some((p) => values[p] === d)) set.add(d);
        }
        cand.push(set);
    }
    const out = new Set();
    const add = (technique, index, digit) => out.add(`${technique}:${index}:${digit}`);

    for (let u = 0; u < UNITS.length; u++) {
        const empties = UNITS[u].filter((c) => values[c] === 0);

        for (let d = 1; d <= DIM; d++) {
            const spots = empties.filter((c) => cand[c].has(d));
            if (spots.length < 2) continue;
            for (let other = 0; other < UNITS.length; other++) {
                if (other === u) continue;
                const inOther = new Set(UNITS[other]);
                if (!spots.every((c) => inOther.has(c))) continue;
                const box = (x) => x >= 18;
                // box -> line is pointing; line -> box is claiming.
                const technique = box(u) && !box(other) ? "pointing"
                    : !box(u) && box(other) ? "claiming" : null;
                if (technique === null) continue;
                for (const c of UNITS[other]) {
                    if (values[c] !== 0 || inUnit(u, c) || !cand[c].has(d)) continue;
                    add(technique, c, d);
                }
            }
        }

        for (const a of empties) {
            for (const b of empties) {
                if (b <= a || cand[a].size !== 2 || cand[b].size !== 2) continue;
                if ([...cand[a]].some((d) => !cand[b].has(d))) continue;
                for (const c of empties) {
                    if (c === a || c === b) continue;
                    for (const d of cand[a]) if (cand[c].has(d)) add("naked-pair", c, d);
                }
            }
        }

        for (let d1 = 1; d1 <= DIM; d1++) {
            for (let d2 = d1 + 1; d2 <= DIM; d2++) {
                const s1 = empties.filter((c) => cand[c].has(d1));
                const s2 = empties.filter((c) => cand[c].has(d2));
                if (s1.length !== 2 || s2.length !== 2) continue;
                if (s1[0] !== s2[0] || s1[1] !== s2[1]) continue;
                for (const c of s1) {
                    for (const d of cand[c]) if (d !== d1 && d !== d2) add("hidden-pair", c, d);
                }
            }
        }
    }
    return out;
}

function inUnit(unit, cell) {
    return UNITS[unit].includes(cell);
}

// The module may report a subset: a deduction whose evidence cannot be written
// as a set of units is dropped rather than shown (M-B01-01, M-B01-02). What it
// must never do is report an elimination enumeration does not agree with.
test("T-E02-01/05/09: every reported elimination agrees with plain enumeration", () => {
    eachPosition(31337, 20, (values) => {
        const expected = naiveEliminations(values);
        for (const d of findEliminations(values)) {
            for (const { index, digit } of d.eliminations) {
                assert.ok(
                    expected.has(`${d.technique}:${index}:${digit}`),
                    `enumeration does not see ${d.technique} removing ${digit} from ${index}`,
                );
            }
        }
    });
});

// ------------------------------------------------------------ honesty

// The counterpart of T-B01-13 for eliminations. A board masked down to the
// evidence units keeps only those cells' values, so candidates there are a
// superset of the real ones -- masking can only fail to support a deduction,
// never invent one. Re-deriving the elimination from that alone is what proves
// the highlight the player sees is enough to reach the answer.
test("T-E02-03/07/11: every elimination re-derives from the cells its evidence shows", () => {
    let checked = 0;
    for (let b = 0; b < 8; b++) {
        eachPosition(b * 977 + 3, 20, (values) => {
            for (const d of findEliminations(values)) {
                for (const assist of ASSISTS) {
                    const visible = assistCells(d, assist);
                    if (visible === null) continue; // "off" shows the whole board
                    const masked = new Uint8Array(CELLS);
                    for (const i of visible) masked[i] = values[i];
                    const cands = buildCandidates(masked);
                    assert.ok(
                        supportsElimination(masked, cands, d),
                        `${d.technique} at unit ${d.unit} unanswerable under "${assist}"`,
                    );
                    checked++;
                }
            }
        });
    }
    assert.ok(checked > 200, `expected a meaningful sample, got ${checked}`);
});

// Re-derives the deduction's own reasoning on the masked board, without
// calling back into the finders.
function supportsElimination(masked, cands, d) {
    const empties = (unit) => UNITS[unit].filter((c) => masked[c] === 0);

    if (d.technique === "pointing" || d.technique === "claiming") {
        const digit = d.digits[0];
        const spots = empties(d.unit).filter((c) => cands[c] & bit(digit));
        // Every cell that can still hold the digit has to be one the deduction
        // named; if masking widened the confinement, the reasoning is gone.
        return spots.length > 0 && spots.every((c) => d.subject.includes(c));
    }
    if (d.technique === "naked-pair") {
        const wanted = d.digits.reduce((m, digit) => m | bit(digit), 0);
        return d.subject.every((c) => masked[c] === 0 && cands[c] === wanted);
    }
    if (d.technique === "hidden-pair") {
        return d.digits.every((digit) => {
            const spots = empties(d.unit).filter((c) => cands[c] & bit(digit));
            return spots.length === 2 && spots.every((c) => d.subject.includes(c));
        });
    }
    throw new RangeError(`unknown technique: ${d.technique}`);
}

// ------------------------------------------------------------ shape details

test("T-E02-04: a digit confined to a single cell is left to the placement finders", () => {
    eachPosition(555, 15, (values) => {
        const cands = buildCandidates(values);
        for (const d of findEliminations(values)) {
            if (d.technique !== "pointing" && d.technique !== "claiming") continue;
            assert.ok(d.subject.length >= 2, "one spot is a hidden single, not a pointing pair");
            assert.equal(d.digits.length, 1);
        }
        // popcount is only meaningful on an empty cell; givens carry mask 0.
        for (const d of findEliminations(values)) {
            if (d.technique !== "naked-pair") continue;
            assert.equal(d.subject.length, 2);
            for (const c of d.subject) assert.equal(popcount(cands[c]), 2);
        }
    });
});

test("T-E02-12: a hidden pair only ever prunes its own two cells", () => {
    eachPosition(8080, 15, (values) => {
        for (const d of findEliminations(values)) {
            if (d.technique !== "hidden-pair") continue;
            assert.equal(d.subject.length, 2);
            for (const { index, digit } of d.eliminations) {
                assert.ok(d.subject.includes(index), `pruned ${index}, which is not its own cell`);
                assert.ok(!d.digits.includes(digit), "the pair's own digits must survive");
            }
        }
    });
});
