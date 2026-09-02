#!/usr/bin/env node
// How much the elimination finders actually have to teach.
//
//   node tools/measure-techniques.mjs [boards] [steps]
//
// A development instrument, not a test. The learn page can only ask about a
// technique it can find, so before any of its UI is built this answers three
// questions per technique:
//
//   found        how often the deduction exists at all
//   kept         how often its evidence could be written as a set of units --
//                the ones that fail are dropped, and a technique that mostly
//                fails cannot be taught honestly
//   units        how wide the resulting highlight is; evidence spanning most
//                of the board is a diagram of the answer, not a hint
//
// Deterministic: the board generator takes an injected rng, so the same
// arguments give the same numbers on any machine.
import { generatePuzzle } from '../functions/_lib/sudoku/generator.js';
import {
  ALL_TECHNIQUES, ELIMINATION_TECHNIQUES,
  buildCandidates, findAll, findEliminations,
} from '../game/static/game/js/rush/techniques.js';
import { CELLS, DIM, UNITS } from '../game/static/game/js/core/spec.js';

const boards = Number(process.argv[2] ?? 200);
const steps = Number(process.argv[3] ?? 30);

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const bit = (d) => 1 << (d - 1);
const popcount = (mask) => { let n = 0; while (mask) { mask &= mask - 1; n++; } return n; };

// Counts the deductions that exist before evidence is demanded, so "kept" can
// be reported as a fraction rather than an absolute nobody can calibrate.
// Independent of the finders: plain enumeration over candidate sets.
function rawCounts(values) {
  const cands = buildCandidates(values);
  const counts = Object.fromEntries(ELIMINATION_TECHNIQUES.map((t) => [t, 0]));

  for (let unit = 0; unit < UNITS.length; unit++) {
    const empties = UNITS[unit].filter((c) => values[c] === 0);
    const isBox = unit >= 18;

    for (let d = 1; d <= DIM; d++) {
      const spots = empties.filter((c) => cands[c] & bit(d));
      if (spots.length < 2) continue;
      for (let other = 0; other < UNITS.length; other++) {
        if (other === unit) continue;
        const otherIsBox = other >= 18;
        if (isBox === otherIsBox) continue;
        const inOther = new Set(UNITS[other]);
        if (!spots.every((c) => inOther.has(c))) continue;
        const inUnit = new Set(UNITS[unit]);
        const victims = UNITS[other].filter(
          (c) => values[c] === 0 && !inUnit.has(c) && (cands[c] & bit(d)),
        );
        if (victims.length > 0) counts[isBox ? 'pointing' : 'claiming']++;
      }
    }

    for (let a = 0; a < empties.length; a++) {
      if (popcount(cands[empties[a]]) !== 2) continue;
      for (let b = a + 1; b < empties.length; b++) {
        if (cands[empties[b]] !== cands[empties[a]]) continue;
        const victims = empties.filter(
          (c) => c !== empties[a] && c !== empties[b] && (cands[c] & cands[empties[a]]),
        );
        if (victims.length > 0) counts['naked-pair']++;
      }
    }

    for (let d1 = 1; d1 <= DIM; d1++) {
      const s1 = empties.filter((c) => cands[c] & bit(d1));
      if (s1.length !== 2) continue;
      for (let d2 = d1 + 1; d2 <= DIM; d2++) {
        const s2 = empties.filter((c) => cands[c] & bit(d2));
        if (s2.length !== 2 || s1[0] !== s2[0] || s1[1] !== s2[1]) continue;
        const keep = bit(d1) | bit(d2);
        if (s1.some((c) => cands[c] & ~keep & 0x1FF)) counts['hidden-pair']++;
      }
    }
  }
  return counts;
}

const stats = new Map(ALL_TECHNIQUES.map((t) => [t, {
  found: 0, raw: 0, positions: 0, unitsTotal: 0, unitsMax: 0, elimsTotal: 0,
}]));

let positions = 0;
for (let b = 0; b < boards; b++) {
  const rng = seeded(b * 7919 + 1);
  const { puzzle, solution } = generatePuzzle({ givens: 50, rng });
  const values = Uint8Array.from(puzzle);

  for (let step = 0; step < steps && values.includes(0); step++) {
    positions++;
    const placements = findAll(values);
    const eliminations = findEliminations(values);
    const raw = rawCounts(values);

    for (const t of ALL_TECHNIQUES) {
      const s = stats.get(t);
      const hits = [...placements, ...eliminations].filter((d) => d.technique === t);
      if (hits.length > 0) s.positions++;
      s.found += hits.length;
      s.raw += raw[t] ?? hits.length; // placements are never dropped
      for (const d of hits) {
        s.unitsTotal += d.units.length;
        s.unitsMax = Math.max(s.unitsMax, d.units.length);
        s.elimsTotal += d.eliminations?.length ?? 1;
      }
    }

    const pick = placements.length > 0 ? placements[0].index : values.indexOf(0);
    values[pick] = solution[pick];
  }
}

const pct = (n, d) => (d === 0 ? '   -' : `${((n / d) * 100).toFixed(0).padStart(3)}%`);
const num = (n, w = 6) => n.toFixed(2).padStart(w);

console.log(`${boards} boards x up to ${steps} steps = ${positions} positions\n`);
console.log('technique             found  per-pos   kept   seen-in   units  max  elims');
console.log('-'.repeat(78));
for (const t of ALL_TECHNIQUES) {
  const s = stats.get(t);
  console.log(
    t.padEnd(20),
    String(s.found).padStart(6),
    num(s.found / positions),
    pct(s.found, s.raw),
    pct(s.positions, positions),
    num(s.found === 0 ? 0 : s.unitsTotal / s.found, 7),
    String(s.unitsMax).padStart(4),
    num(s.found === 0 ? 0 : s.elimsTotal / s.found),
  );
}
console.log(`\nCELLS=${CELLS}; "kept" is finders vs plain enumeration.`);
