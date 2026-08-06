// Puzzle generation: a random full grid, then holes dug while uniqueness
// holds. Ported from game/sudoku/generator.py.
import { CELLS, DIM } from "./claude-mhj_26_08_05_01_spec.js";
import { buildMatrix, search, DEFAULT_BUDGET } from "./claude-mhj_26_08_05_02_dlx.js";
import { rowsToBoard, alternativeExists, hasUniqueSolution } from "./claude-mhj_26_08_05_03_solver.js";

// The clue count the caller may ask for. The bounds are measured, not
// chosen: digHoles is a single greedy pass, so it stops at the first set it
// cannot shrink further, and over 2,000 runs asking for 17 it never once got
// below 21 (median 24). With the retry loop in generatePuzzle below, 23+ is
// reached essentially always and 22 about three quarters of the time, so 22
// is the lowest count worth offering. 60 is the top end: past that the board
// is mostly filled in and there is little puzzle left.
//
// Reaching the true minimum of 17 is out of reach for this family of
// algorithms -- a random solved grid admits a 17-clue puzzle at best about 1
// in 111,000, and the clue subset would then have to be found among ~1.3e17
// candidates. Serving 17s needs a catalogue of known ones, not a generator.
export const GIVENS_MIN = 22;
export const GIVENS_MAX = 60;
export const GIVENS_DEFAULT = 32;

// Each attempt is a fresh solved grid plus a fresh dig (~1.75ms). 30 attempts
// bound the worst case -- an unreachable target burns all of them -- at about
// 53ms, which is 0.5% of wrangler.jsonc's limits.cpu_ms.
const MAX_ATTEMPTS = 30;

// Wall-clock ceiling for the digging phase, in milliseconds. Hitting it
// yields a puzzle with more clues than requested rather than a slow
// request -- see digHoles(). Kept under wrangler.jsonc's limits.cpu_ms
// (10,000ms) with headroom for generateSolvedBoard() and HTTP overhead.
const DIG_TIME_LIMIT_MS = 8000;

// A uniformly-shuffled complete grid. Randomization happens inside the
// search: each column's candidate scan starts at a random offset and
// wraps, so every candidate stays reachable on backtracking while the
// first choice is unbiased.
export function generateSolvedBoard(rng) {
    if (typeof rng !== "function") throw new TypeError("generateSolvedBoard: rng must be a function");
    const matrix = buildMatrix();
    const outcome = search(matrix, { limit: 1, randomize: true, rng });
    if (outcome.budgetExceeded || !outcome.count) {
        // Practically unreachable: an empty 9x9 grid always has a solution
        // well within the default budget.
        throw new Error("could not build a solved 9x9 grid");
    }
    return rowsToBoard(outcome.rows);
}

function shuffle(array, rng) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Remove clues from `solution` while the puzzle stays uniquely solvable.
// Cells are visited in random order. A removal is kept only when
// uniqueness is proven to survive it; an exhausted budget counts as not
// proven and the clue goes back, so the budget can only make the puzzle
// easier than asked, never wrong.
export function digHoles(solution, options) {
    const { targetGivens, budgetMs = DIG_TIME_LIMIT_MS, rng, budget = DEFAULT_BUDGET } = options;
    if (solution.length !== CELLS) {
        throw new RangeError(`solution must have length ${CELLS}, got ${solution.length}`);
    }
    if (!Number.isInteger(targetGivens) || targetGivens < 17 || targetGivens > CELLS) {
        throw new RangeError(`targetGivens must be in 17..${CELLS}, got ${targetGivens}`);
    }
    if (typeof budgetMs !== "number" || budgetMs <= 0) {
        throw new RangeError(`budgetMs must be > 0, got ${budgetMs}`);
    }
    if (typeof rng !== "function") throw new TypeError("digHoles: rng must be a function");

    const puzzle = solution.slice();
    const order = shuffle(Array.from({ length: CELLS }, (_, i) => i), rng);

    let givens = CELLS;
    const deadline = Date.now() + budgetMs;
    for (const index of order) {
        if (givens <= targetGivens) break;
        if (Date.now() > deadline) break;
        const removed = puzzle[index];
        puzzle[index] = 0;
        // Invariant: before this removal the puzzle was uniquely solvable,
        // so a rival solution must disagree at `index` -- see
        // alternativeExists() in solver.js.
        const rival = alternativeExists(puzzle, index, removed, budget);
        if (!rival) {
            givens -= 1;
        } else {
            puzzle[index] = removed; // put the clue back
        }
    }
    return puzzle;
}

export function clueCount(board) {
    let n = 0;
    for (const v of board) if (v) n++;
    return n;
}

// Return { puzzle, solution }; the puzzle has exactly one solution.
//
// `givens` is a target, not a promise. A dig stops as soon as it reaches the
// target, so the result never has *fewer* clues than asked -- but a dig that
// runs out of removable cells first lands above it. Retrying with a fresh
// grid is what turns the low targets from luck into near-certainty; the best
// (fewest-clue) attempt is kept so an unreachable target still returns the
// closest puzzle found rather than failing.
export function generatePuzzle(options = {}) {
    const { dim = DIM, givens = GIVENS_DEFAULT, rng = cryptoRng } = options;
    if (dim !== DIM) throw new RangeError(`only dim=${DIM} is supported, got ${dim}`);
    if (!Number.isInteger(givens) || givens < GIVENS_MIN || givens > GIVENS_MAX) {
        throw new RangeError(
            `givens must be an integer in ${GIVENS_MIN}..${GIVENS_MAX}, got ${givens}`
        );
    }

    let best = null;
    let bestCount = CELLS + 1;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const solution = generateSolvedBoard(rng);
        const puzzle = digHoles(solution, { targetGivens: givens, rng });
        const count = clueCount(puzzle);
        if (count < bestCount) {
            best = { puzzle, solution };
            bestCount = count;
        }
        if (count <= givens) break; // target met -- no reason to keep trying
    }

    // Defensive final check: generatePuzzle must never hand back a puzzle
    // that is not proven unique. Reaching the else-branch would indicate an
    // algorithm defect, not a normal runtime condition.
    if (!hasUniqueSolution(best.puzzle)) {
        throw new Error("generated puzzle failed its own uniqueness check");
    }

    return { puzzle: Array.from(best.puzzle), solution: Array.from(best.solution) };
}

// Crypto-backed RNG returning a float in [0, 1), matching the quality bar
// already used by functions/api/new-puzzle.js's pool selector.
export function cryptoRng() {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return bytes[0] / 0x100000000;
}
