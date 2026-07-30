// Settings has a different failure mode than session persistence: a corrupt
// session bounces the user to a new game, but a corrupt settings blob should
// just fall back to defaults and continue quietly.
const KEY = "sudoku:v1:settings";

export const DEFAULTS = Object.freeze({
    schemaVersion: 1,
    autoRemoveCandidates: true,
    showConflicts: true,
    shiftQuasimode: true,
    touchControls: "auto",
    hintStripSeenCount: 0,
});

const TOUCH_CONTROLS_VALUES = new Set(["auto", "show", "hide"]);

function pickValidFields(parsed) {
    const out = {};
    for (const key of Object.keys(DEFAULTS)) {
        if (!(key in parsed)) continue;
        const value = parsed[key];
        if (typeof value !== typeof DEFAULTS[key]) continue;
        if (key === "touchControls" && !TOUCH_CONTROLS_VALUES.has(value)) continue;
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
        return { ...DEFAULTS, ...pickValidFields(parsed) };
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
            if (key === "touchControls" && !TOUCH_CONTROLS_VALUES.has(value)) {
                throw new RangeError(`invalid touchControls value: ${value}`);
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
