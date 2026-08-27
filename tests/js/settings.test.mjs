import { test } from "node:test";
import assert from "node:assert/strict";
import { createSettings, DEFAULTS } from "../../game/static/game/js/state/settings.js";
import { GIVENS_MIN, GIVENS_MAX, GIVENS_DEFAULT } from "../../game/static/game/js/core/givens.js";
import { DEFAULT_DIFFICULTY } from "../../game/static/game/js/core/difficulty.js";

function memoryStorage(initial) {
    const map = new Map(initial ? Object.entries(initial) : []);
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, v),
        removeItem: (k) => map.delete(k),
    };
}

test("no stored value yields the Phase 1 defaults", () => {
    const settings = createSettings(memoryStorage());
    assert.deepEqual(settings.get(), DEFAULTS);
});

test("corrupt JSON falls back to defaults without throwing", () => {
    const storage = memoryStorage({ "sudoku:v1:settings": "{not json" });
    let settings;
    assert.doesNotThrow(() => { settings = createSettings(storage); });
    assert.deepEqual(settings.get(), DEFAULTS);
});

test("setting an unknown key throws RangeError", () => {
    const settings = createSettings(memoryStorage());
    assert.throws(() => settings.set("notARealSetting", true), RangeError);
});

test("touchControls accepts only auto/show/hide", () => {
    const settings = createSettings(memoryStorage());
    assert.throws(() => settings.set("touchControls", "yes"), RangeError);
    settings.set("touchControls", "show");
    assert.equal(settings.get().touchControls, "show");
});

test("T-B03-01: newGameGivens starts at the default clue count", () => {
    assert.equal(createSettings(memoryStorage()).get().newGameGivens, GIVENS_DEFAULT);
});

test("T-B03-02: newGameGivens accepts the offered range and refuses anything else", () => {
    const settings = createSettings(memoryStorage());
    for (const good of [GIVENS_MIN, 26, GIVENS_MAX]) {
        settings.set("newGameGivens", good);
        assert.equal(settings.get().newGameGivens, good);
    }
    // Each of these is a number, so the typeof check alone would pass it.
    for (const bad of [GIVENS_MIN - 1, GIVENS_MAX + 1, 0, -1, 26.5, NaN]) {
        assert.throws(() => settings.set("newGameGivens", bad), RangeError, `accepted ${bad}`);
    }
});

test("T-B03-03: a stored newGameGivens that is out of range falls back to the default", () => {
    for (const stored of [21, 61, 26.5, 0]) {
        const storage = memoryStorage({
            "sudoku:v1:settings": JSON.stringify({ schemaVersion: 1, newGameGivens: stored }),
        });
        assert.equal(createSettings(storage).get().newGameGivens, GIVENS_DEFAULT, `stored ${stored}`);
    }
});

test("T-B03-04: settings saved before newGameGivens existed still load", () => {
    const storage = memoryStorage({
        "sudoku:v1:settings": JSON.stringify({
            schemaVersion: 1, showConflicts: false, touchControls: "show",
        }),
    });
    const values = createSettings(storage).get();
    assert.equal(values.newGameGivens, GIVENS_DEFAULT);
    assert.equal(values.newGameDifficulty, DEFAULT_DIFFICULTY);
    assert.equal(values.showConflicts, false);
    assert.equal(values.touchControls, "show");
});

test("a legacy clue-count preference migrates to its named difficulty", () => {
    for (const [givens, expected] of [[60, "beginner"], [40, "easy"], [32, "medium"], [26, "hard"], [22, "expert"]]) {
        const storage = memoryStorage({
            "sudoku:v1:settings": JSON.stringify({ schemaVersion: 1, newGameGivens: givens }),
        });
        assert.equal(createSettings(storage).get().newGameDifficulty, expected, `givens=${givens}`);
    }
});

test("newGameDifficulty accepts only a shipped difficulty id", () => {
    const settings = createSettings(memoryStorage());
    for (const value of ["beginner", "easy", "medium", "hard", "expert"]) {
        settings.set("newGameDifficulty", value);
        assert.equal(settings.get().newGameDifficulty, value);
    }
    for (const value of ["", "impossible", "MEDIUM", 32, null]) {
        assert.throws(() => settings.set("newGameDifficulty", value), RangeError);
    }
});

test("partially stored settings are filled in with defaults for the rest", () => {
    const storage = memoryStorage({
        "sudoku:v1:settings": JSON.stringify({ schemaVersion: 1, showConflicts: false }),
    });
    const settings = createSettings(storage);
    const values = settings.get();
    assert.equal(values.showConflicts, false);
    assert.equal(values.autoRemoveCandidates, DEFAULTS.autoRemoveCandidates);
    assert.equal(values.touchControls, DEFAULTS.touchControls);
});
