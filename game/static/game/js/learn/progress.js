// How many exercises of each technique have been tried and solved.
//
// Per-browser and nothing more: there is no account and no server, so this is a
// convenience for the person at this keyboard rather than a record. Every
// storage access is wrapped, because reading localStorage does not merely
// return null in some privacy modes -- it throws -- and a page that cannot show
// a progress count is still a page that must let someone practise.
//
// Stored values are re-validated on the way in rather than trusted. The key is
// writable by anything else running on this origin, and a corrupted count that
// reached the view would be a crash in a place with nothing to do with storage.
import { ALL_TECHNIQUES } from "../rush/techniques.js";

const STORAGE_KEY = "sudoku.learn.progress";

const isCount = (n) => Number.isInteger(n) && n >= 0;

export function createProgress(storage) {
    let counts = load();

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
        for (const technique of ALL_TECHNIQUES) {
            const entry = parsed[technique];
            if (entry === null || typeof entry !== "object") continue;
            if (!isCount(entry.tried) || !isCount(entry.solved)) continue;
            // A solved count above the tried count is not merely odd, it makes
            // any ratio the view computes nonsense. Treat the pair as spoiled.
            if (entry.solved > entry.tried) continue;
            out[technique] = { tried: entry.tried, solved: entry.solved };
        }
        return out;
    }

    function save() {
        try {
            storage?.setItem(STORAGE_KEY, JSON.stringify(counts));
        } catch {
            // Full, denied, or absent. The in-memory counts stay correct for
            // this session, which is all this was ever worth blocking on.
        }
    }

    return {
        record(technique, ok) {
            if (!ALL_TECHNIQUES.includes(technique)) {
                throw new RangeError(`unknown technique: ${technique}`);
            }
            if (typeof ok !== "boolean") throw new TypeError("record: ok must be a boolean");
            const entry = counts[technique] ?? { tried: 0, solved: 0 };
            counts[technique] = { tried: entry.tried + 1, solved: entry.solved + (ok ? 1 : 0) };
            save();
        },

        // A copy: the view holds this across renders, and handing out the live
        // object would let a later record() mutate what a caller already read.
        all() {
            const out = {};
            for (const [technique, entry] of Object.entries(counts)) {
                out[technique] = { ...entry };
            }
            return out;
        },

        reset() {
            counts = {};
            save();
        },
    };
}
