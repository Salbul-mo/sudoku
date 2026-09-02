// Finds a position that actually contains the technique being practised.
//
// A fresh puzzle is not guaranteed to hold, say, a hidden pair, so this walks
// the board forward -- filling whatever the placement finders can prove -- and
// checks after each step. Measured over 300 boards, 71-94% of them carry each
// elimination technique at the opening position and the 90th percentile is
// three steps in, so the walk almost never runs long and a second board is
// almost never needed. maxBoards is the backstop, not the plan.
//
// Walking rather than generating to order is deliberate: the puzzle generator
// takes no technique constraint, and adding one would mean either a seeded
// pre-built pool (the project does not use seeds) or a much slower generator on
// the request path.
import { CELLS } from "../core/spec.js";
import { ALL_TECHNIQUES, TECHNIQUES, findAll, findEliminations } from "../rush/techniques.js";

const DEFAULT_MAX_BOARDS = 8;

export class LearnSourceError extends Error {
    constructor(cause, technique) {
        super(`learn source failed: ${cause} (${technique})`);
        this.name = "LearnSourceError";
        this.cause = cause;
        this.technique = technique;
    }
}

export function createPositionSource(deps = {}) {
    const {
        puzzleSource,
        rng = Math.random,
        maxBoards = DEFAULT_MAX_BOARDS,
    } = deps;

    if (typeof puzzleSource?.take !== "function") {
        throw new TypeError("createPositionSource: deps.puzzleSource must expose take()");
    }
    if (!Number.isInteger(maxBoards) || maxBoards < 1) {
        throw new RangeError(`maxBoards must be a positive integer, got ${maxBoards}`);
    }

    /**
     * A position where `technique` is available, and the deduction to ask about.
     *
     * The walk terminates: every pass that finds nothing fills one empty cell,
     * so the number of empties strictly decreases -- the same argument
     * rush/engine.js's reveal loop rests on.
     *
     * @throws {RangeError}       unknown technique
     * @throws {PuzzleSourceError} propagated from the puzzle source
     * @throws {LearnSourceError}  no position found within maxBoards
     */
    async function take(technique) {
        if (!ALL_TECHNIQUES.includes(technique)) {
            throw new RangeError(`unknown technique: ${technique}`);
        }
        const find = TECHNIQUES.includes(technique) ? findAll : findEliminations;

        for (let board = 0; board < maxBoards; board++) {
            const { puzzle, solution } = await puzzleSource.take();
            const values = Uint8Array.from(puzzle);

            for (let step = 0; step <= CELLS; step++) {
                const pool = find(values).filter((d) => d.technique === technique);
                if (pool.length > 0) {
                    return {
                        values,
                        solution: Uint8Array.from(solution),
                        deduction: pool[Math.floor(rng() * pool.length)],
                    };
                }
                const empty = values.indexOf(0);
                if (empty === -1) break; // solved without ever offering it

                // Prefer a cell the board proves; only fall back to revealing an
                // arbitrary one when nothing is provable, so the positions this
                // walks through stay positions a player could have reached.
                const placements = findAll(values);
                const index = placements.length > 0 ? placements[0].index : empty;
                values[index] = solution[index];
            }
        }
        throw new LearnSourceError("exhausted", technique);
    }

    return { take };
}
