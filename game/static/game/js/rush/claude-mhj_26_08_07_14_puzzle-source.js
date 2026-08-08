// The only place this game touches the network.
//
// A board lasts about 31 steps, so at a few seconds a step one puzzle covers
// roughly a minute and a half of play. That slack is what makes the existing
// Worker fine for a game clocked in seconds: fetch the next board when the
// current one starts, and the round trip is spent long before anyone needs it.
//
// Failure policy deliberately matches bootstrap.js: one retry on anything that
// might be transient, none on a 4xx, so a player who hits trouble sees the same
// behaviour in both games.
import { GIVENS_MIN, GIVENS_MAX } from "../core/claude-mhj_26_08_07_01_givens.js";
import { CELLS } from "../core/spec.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_DELAY_MS = 1000;

export const PUZZLE_SOURCE_CAUSES = Object.freeze(["offline", "server", "network"]);

export class PuzzleSourceError extends Error {
    constructor(cause) {
        super(`puzzle source failed: ${cause}`);
        this.name = "PuzzleSourceError";
        this.cause = cause;
    }
}

// A board the game can actually be played on: the puzzle has to be the
// solution with holes in it, or the engine's contradiction check would fire on
// the first step and take the page down with it.
function toBoard(data) {
    const { puzzle, solution } = data ?? {};
    for (const [grid, name] of [[puzzle, "puzzle"], [solution, "solution"]]) {
        if (!Array.isArray(grid) || grid.length !== CELLS) return null;
    }
    for (let i = 0; i < CELLS; i++) {
        const p = puzzle[i];
        const s = solution[i];
        if (!Number.isInteger(p) || p < 0 || p > 9) return null;
        if (!Number.isInteger(s) || s < 1 || s > 9) return null;
        if (p !== 0 && p !== s) return null;
    }
    return { puzzle: Uint8Array.from(puzzle), solution: Uint8Array.from(solution) };
}

export function createPuzzleSource(deps = {}) {
    const {
        fetch: fetchImpl = globalThis.fetch?.bind(globalThis),
        givens,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        retryDelayMs = DEFAULT_RETRY_DELAY_MS,
        isOnline = () => globalThis.navigator?.onLine !== false,
        delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    } = deps;

    if (typeof fetchImpl !== "function") {
        throw new TypeError("createPuzzleSource: deps.fetch must be a function");
    }
    // Caught here rather than at the Worker, which would answer 400 and cost a
    // round trip to say what we already know.
    if (!Number.isInteger(givens) || givens < GIVENS_MIN || givens > GIVENS_MAX) {
        throw new RangeError(`givens must be an integer in ${GIVENS_MIN}..${GIVENS_MAX}, got ${givens}`);
    }

    async function requestOnce() {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetchImpl(`/api/new-puzzle?givens=${givens}`, { signal: controller.signal });
            if (response.status >= 500) throw new PuzzleSourceError("network"); // worth a retry
            if (!response.ok) throw new PuzzleSourceError("server"); // 4xx: asking again changes nothing
            const board = toBoard(await response.json());
            if (board === null) throw new PuzzleSourceError("server");
            return board;
        } finally {
            clearTimeout(timer);
        }
    }

    async function fetchOne() {
        if (!isOnline()) throw new PuzzleSourceError("offline");
        try {
            return await requestOnce();
        } catch (error) {
            if (error instanceof PuzzleSourceError && error.cause === "server") throw error;
            await delay(retryDelayMs);
            try {
                return await requestOnce();
            } catch (retryError) {
                if (retryError instanceof PuzzleSourceError && retryError.cause === "server") throw retryError;
                throw new PuzzleSourceError("network");
            }
        }
    }

    // At most one board is held ahead. Queueing more would spend requests on
    // boards a player who quits after two minutes will never see.
    let pending = null;

    function primeNext() {
        if (pending !== null) return;
        pending = fetchOne().catch(() => {
            // A failed prefetch must not surface here: nothing is waiting on it,
            // and the next take() will retry in the foreground where the UI can
            // actually show the problem.
            pending = null;
            return null;
        });
    }

    async function take() {
        const queued = pending;
        pending = null;
        const board = (queued && await queued) || await fetchOne();
        primeNext();
        return board;
    }

    return { take, prime: primeNext };
}
