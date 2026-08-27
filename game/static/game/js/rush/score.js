// Score, combo, lives, and the one number worth keeping between visits.
//
// Storage failures are swallowed rather than thrown: a browser that refuses
// localStorage (private mode, blocked cookies) should still let someone play,
// just without a saved best. state().persisted says which world we are in, so
// the UI can decline to promise a record it cannot keep. This mirrors
// state/settings.js, where a corrupt blob falls back to defaults quietly.
import { RUSH, RUSH_STORAGE_KEY, pointsFor } from "./config.js";

const SCHEMA_VERSION = 1;

function readBest(storage) {
    if (!storage) return { best: { bestScore: 0, bestCombo: 0 }, persisted: false };
    let raw;
    try {
        raw = storage.getItem(RUSH_STORAGE_KEY);
    } catch {
        return { best: { bestScore: 0, bestCombo: 0 }, persisted: false };
    }
    // Reachable storage with nothing (or nonsense) in it still counts as
    // persisted -- the next commit will write successfully.
    const best = { bestScore: 0, bestCombo: 0 };
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
            for (const key of ["bestScore", "bestCombo"]) {
                const value = parsed[key];
                if (Number.isInteger(value) && value >= 0) best[key] = value;
            }
        }
    } catch {
        // Corrupt or absent: start from zero, do not throw.
    }
    return { best, persisted: true };
}

export function createScore(deps = {}) {
    const storage = deps.storage === undefined ? globalThis.localStorage : deps.storage;
    const { best, persisted } = readBest(storage);

    let score = 0;
    let combo = 0;
    let bestCombo = 0;
    let lives = RUSH.LIVES;
    let step = 0;

    function state() {
        return {
            score, combo, bestCombo, lives, step, persisted,
            best: { ...best },
            over: lives === 0,
        };
    }

    // The technique and its evidence count price the cell; the combo
    // multiplies it. Called with no arguments -- a step whose technique is not
    // known, such as one the engine had to give away -- it scores exactly what
    // it scored before techniques existed.
    function hit(technique = null, units = 1) {
        step++;
        combo++;
        if (combo > bestCombo) bestCombo = combo;
        score += pointsFor(technique, units) * Math.min(combo, RUSH.COMBO_CAP);
        return state();
    }

    // Swapping the board costs the combo and nothing else. miss() cannot stand
    // in for this: it spends a life, and choosing a fresh board is not the
    // same as getting a cell wrong.
    function breakCombo() {
        combo = 0;
        return state();
    }

    function miss() {
        step++;
        combo = 0;
        if (lives > 0) lives--;
        return state();
    }

    // Called once when a run ends. Only ever raises the stored numbers, so a
    // bad run cannot erase a good one.
    function commit() {
        if (!persisted) return state();
        const next = {
            schemaVersion: SCHEMA_VERSION,
            bestScore: Math.max(best.bestScore, score),
            bestCombo: Math.max(best.bestCombo, bestCombo),
        };
        try {
            storage.setItem(RUSH_STORAGE_KEY, JSON.stringify(next));
            best.bestScore = next.bestScore;
            best.bestCombo = next.bestCombo;
        } catch {
            // Quota or a mid-session permission change: the run still counts,
            // it just does not outlive the tab.
        }
        return state();
    }

    function reset() {
        score = 0;
        combo = 0;
        bestCombo = 0;
        lives = RUSH.LIVES;
        step = 0;
        return state();
    }

    return { hit, miss, breakCombo, commit, reset, state };
}
