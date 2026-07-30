import { test } from "node:test";
import assert from "node:assert/strict";
import { createSettings, DEFAULTS } from "../../game/static/game/js/state/settings.js";

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
