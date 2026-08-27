// Settings has a different failure mode than session persistence: a corrupt
// session bounces the user to a new game, but a corrupt settings blob should
// just fall back to defaults and continue quietly.
import { GIVENS_MIN, GIVENS_MAX, GIVENS_DEFAULT } from "../core/givens.js";
import {
    DEFAULT_DIFFICULTY,
    DIFFICULTY_IDS,
    difficultyForGivens,
} from "../core/difficulty.js";

const KEY = "sudoku:v1:settings";

export const DEFAULTS = Object.freeze({
    schemaVersion: 1,
    autoRemoveCandidates: true,
    showConflicts: true,
    shiftQuasimode: true,
    touchControls: "auto",
    hintStripSeenCount: 0,
    newGameGivens: GIVENS_DEFAULT,
    newGameDifficulty: DEFAULT_DIFFICULTY,
});

const TOUCH_CONTROLS_VALUES = new Set(["auto", "show", "hide"]);
const DIFFICULTY_VALUES = new Set(DIFFICULTY_IDS);

// Constraints that a matching `typeof` does not already cover. newGameGivens
// needs one because every out-of-range count -- 0, 500, even 26.5 -- is still
// a number, so the type check alone would let it through to the API and earn
// a 400.
const VALIDATORS = {
    touchControls: (v) => TOUCH_CONTROLS_VALUES.has(v),
    newGameGivens: (v) => Number.isInteger(v) && v >= GIVENS_MIN && v <= GIVENS_MAX,
    newGameDifficulty: (v) => DIFFICULTY_VALUES.has(v),
};

function pickValidFields(parsed) {
    const out = {};
    for (const key of Object.keys(DEFAULTS)) {
        if (!(key in parsed)) continue;
        const value = parsed[key];
        if (typeof value !== typeof DEFAULTS[key]) continue;
        if (VALIDATORS[key] && !VALIDATORS[key](value)) continue;
        out[key] = value;
    }
    return out;
}

export function createSettings(storage) {
    function load() {
        let parsed = {};
        try {
            const raw = storage.getItem(KEY);
            parsed = raw ? JSON.parse(raw) : {};
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) parsed = {};
        } catch {
            parsed = {};
        }
        const valid = pickValidFields(parsed);
        // Settings written before named difficulties existed remember only the
        // exact clue count. Preserve that choice instead of resetting everyone
        // to medium on their first visit after the upgrade.
        if (!("newGameDifficulty" in valid) && "newGameGivens" in valid) {
            valid.newGameDifficulty = difficultyForGivens(valid.newGameGivens).id;
        }
        return { ...DEFAULTS, ...valid };
    }

    let current = load();
    const listeners = new Set();

    function trySave() {
        try {
            storage.setItem(KEY, JSON.stringify(current));
        } catch {
            // in-memory only; settings loss on quota failure is tolerable (UI-B04 scope)
        }
    }

    return {
        get() {
            return { ...current };
        },
        set(key, value) {
            if (!(key in DEFAULTS)) throw new RangeError(`unknown setting: ${key}`);
            if (typeof value !== typeof DEFAULTS[key]) {
                throw new RangeError(`setting ${key} must be a ${typeof DEFAULTS[key]}`);
            }
            if (VALIDATORS[key] && !VALIDATORS[key](value)) {
                throw new RangeError(`invalid ${key} value: ${value}`);
            }
            current[key] = value;
            trySave();
            for (const fn of listeners) fn(this.get());
        },
        subscribe(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
    };
}
