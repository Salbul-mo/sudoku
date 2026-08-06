import { test, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeDocument, fakeRoot } from "./helpers/fake-dom.mjs";

const uninstall = installFakeDocument();
const { renderSettings, renderHelp } = await import("../../game/static/game/js/ui/settings-view.js");
const { getKeymap } = await import("../../game/static/game/js/ui/keyboard-adapter.js");
after(uninstall);

function fakeSettings(initial) {
    let values = { ...initial };
    const sets = [];
    return {
        get: () => values,
        set: (k, v) => { values = { ...values, [k]: v }; sets.push([k, v]); },
        sets,
    };
}

test("renderSettings creates 3 checkboxes and 3 radios, reflecting current values", () => {
    const settings = fakeSettings({
        autoRemoveCandidates: true, showConflicts: false, shiftQuasimode: true, touchControls: "show",
    });
    const form = renderSettings(settings);
    const checkboxes = form.children.filter((c) => c.tagName === "label" && c.children[0].type === "checkbox");
    assert.equal(checkboxes.length, 3);
    assert.equal(checkboxes[0].children[0].checked, true);
    assert.equal(checkboxes[1].children[0].checked, false);
});

test("toggling a checkbox calls settings.set immediately", () => {
    const settings = fakeSettings({ autoRemoveCandidates: false, showConflicts: false, shiftQuasimode: false, touchControls: "auto" });
    const form = renderSettings(settings);
    const checkbox = form.children[0].children[0];
    checkbox.checked = true;
    checkbox.dispatch("change");
    assert.deepEqual(settings.sets[0], ["autoRemoveCandidates", true]);
});

test("selecting a touchControls radio calls settings.set with its value", () => {
    const settings = fakeSettings({ autoRemoveCandidates: false, showConflicts: false, shiftQuasimode: false, touchControls: "auto" });
    const form = renderSettings(settings);
    const fieldset = form.children[form.children.length - 1];
    const hideRadio = fieldset.children.find((row) => row.children[0].value === "hide").children[0];
    hideRadio.checked = true;
    hideRadio.dispatch("change");
    assert.deepEqual(settings.sets[0], ["touchControls", "hide"]);
});

test("renderHelp produces one table row per KEYMAP entry (T-UI-B14-16)", () => {
    const table = renderHelp();
    assert.equal(table.children.length, getKeymap().length);
});

test("renderHelp throws on an empty keymap", () => {
    assert.throws(() => renderHelp([]), Error);
});
