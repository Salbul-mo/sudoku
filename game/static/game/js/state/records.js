// Personal bests for the classic game, per difficulty.
//
// Per-browser and nothing more -- there is no account and no server. Same
// shape and the same defensive reading as learn/progress.js: localStorage is
// writable by anything else on this origin and throws outright in some privacy
// modes, so every value is re-validated on the way in and every access is
// wrapped.
import { DIFFICULTY_IDS } from "../core/difficulty.js";

const STORAGE_KEY = "sudoku.classic.records";

const isCount = (n) => Number.isInteger(n) && n >= 0;
const isDuration = (n) => Number.isFinite(n) && n > 0;

export function createRecords(storage) {
    let byDifficulty = load();

    function load() {
        let raw = null;
        try {
            raw = storage?.getItem(STORAGE_KEY) ?? null;
        } catch {
            return {};
        }
        if (raw === null) return {};

        let parsed = null;
        try {
            parsed = JSON.parse(raw);
        } catch {
            return {};
        }
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};

        const out = {};
        for (const id of DIFFICULTY_IDS) {
            const entry = parsed[id];
            if (entry === null || typeof entry !== "object") continue;
            if (!isCount(entry.solved)) continue;
            // bestMs is allowed to be absent -- a difficulty can have
            // completions recorded from a save that predates the timer.
            if (entry.bestMs != null && !isDuration(entry.bestMs)) continue;
            out[id] = { solved: entry.solved, bestMs: entry.bestMs ?? null };
        }
        return out;
    }

    function save() {
        try {
            storage?.setItem(STORAGE_KEY, JSON.stringify(byDifficulty));
        } catch {
            // Full, denied, or absent. The in-memory records stay correct for
            // this session, which is all this was ever worth blocking on.
        }
    }

    return {
        /**
         * Records one completion.
         *
         * Returns what the completion card needs to say: the best time now
         * standing, and whether this solve is the one that set it. A zero or
         * missing duration still counts as a completion but can never become a
         * best -- a restored save reports elapsedMs 0, and letting that win
         * would put an unbeatable record on the board.
         */
        record(difficulty, elapsedMs) {
            if (!DIFFICULTY_IDS.includes(difficulty)) {
                throw new RangeError(`unknown difficulty: ${difficulty}`);
            }
            const previous = byDifficulty[difficulty] ?? { solved: 0, bestMs: null };
            const timed = isDuration(elapsedMs);
            const isBest = timed && (previous.bestMs === null || elapsedMs < previous.bestMs);
            byDifficulty[difficulty] = {
                solved: previous.solved + 1,
                bestMs: isBest ? elapsedMs : previous.bestMs,
            };
            save();
            return { isBest, bestMs: byDifficulty[difficulty].bestMs, solved: byDifficulty[difficulty].solved };
        },

        get(difficulty) {
            if (!DIFFICULTY_IDS.includes(difficulty)) {
                throw new RangeError(`unknown difficulty: ${difficulty}`);
            }
            const entry = byDifficulty[difficulty];
            return entry ? { ...entry } : { solved: 0, bestMs: null };
        },

        // A copy: a caller holding this across a later record() must not see it
        // change underneath.
        all() {
            const out = {};
            for (const [id, entry] of Object.entries(byDifficulty)) out[id] = { ...entry };
            return out;
        },

        reset() {
            byDifficulty = {};
            save();
        },
    };
}
