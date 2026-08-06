import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { installFakeDocument, fakeRoot } from "./helpers/fake-dom.mjs";

const uninstall = installFakeDocument();
const { mountTouchControls } = await import("../../game/static/game/js/ui/touch-controls.js");
after(uninstall);

function fakeAdapter() {
    const calls = [];
    let sticky = false;
    return {
        calls,
        onDigitTap(d) { calls.push(["digit", d]); return { ok: true }; },
        onPencilTap() { sticky = !sticky; calls.push(["pencil"]); return sticky; },
        onEraseTap() { calls.push(["erase"]); return { ok: true }; },
        get sticky() { return sticky; },
    };
}

function digitButton(view, d) {
    return view.element.children.find((c) => c.dataset.digit === String(d));
}

function roleButton(view, role) {
    return view.element.children.find((c) => c.dataset.role === role);
}

test("mounting without a usable adapter throws TypeError", () => {
    assert.throws(() => mountTouchControls(fakeRoot(), {}), TypeError);
    assert.throws(() => mountTouchControls(null, fakeAdapter()), TypeError);
});

test("the bar renders 1-9 plus the pencil and erase controls", () => {
    const view = mountTouchControls(fakeRoot(), fakeAdapter());
    assert.equal(view.element.className, "digit-bar");
    assert.equal(view.element.getAttribute("role"), "toolbar");
    for (let d = 1; d <= 9; d++) assert.ok(digitButton(view, d), `missing digit ${d}`);
    assert.ok(roleButton(view, "pencil"));
    assert.ok(roleButton(view, "erase"));
});

test("the erase control forwards to the adapter and carries no pressed state", () => {
    const adapter = fakeAdapter();
    const view = mountTouchControls(fakeRoot(), adapter);
    const erase = roleButton(view, "erase");
    erase.dispatch("click");
    erase.dispatch("click");
    assert.deepEqual(adapter.calls, [["erase"], ["erase"]]);
    assert.equal(erase.getAttribute("aria-pressed"), null);
});

test("every control is a button -- never an input, textarea, or contenteditable", () => {
    const view = mountTouchControls(fakeRoot(), fakeAdapter());
    for (const child of view.element.children) {
        assert.equal(child.tagName, "button");
        assert.equal(child.getAttribute("contenteditable"), null);
    }
});

test("each digit tap forwards straight to the adapter, including the same digit twice", () => {
    const adapter = fakeAdapter();
    const view = mountTouchControls(fakeRoot(), adapter);
    const three = digitButton(view, 3);

    three.dispatch("click");
    three.dispatch("click");
    digitButton(view, 7).dispatch("click");
    // Every tap is delivered: re-tapping is how a touch user erases a cell,
    // so the bar must never swallow the second press as a toggle-off.
    assert.deepEqual(adapter.calls, [["digit", 3], ["digit", 3], ["digit", 7]]);
});

test("digit buttons are momentary, not toggles, so they carry no pressed state", () => {
    const adapter = fakeAdapter();
    const view = mountTouchControls(fakeRoot(), adapter);
    const three = digitButton(view, 3);
    assert.equal(three.getAttribute("aria-pressed"), null);
    three.dispatch("click");
    assert.equal(three.getAttribute("aria-pressed"), null);
});

test("the pencil control mirrors sticky mode and reports the change", () => {
    const adapter = fakeAdapter();
    const changes = [];
    const view = mountTouchControls(fakeRoot(), adapter, { onStickyChange: (on) => changes.push(on) });
    const pencil = roleButton(view, "pencil");

    pencil.dispatch("click");
    assert.equal(pencil.getAttribute("aria-pressed"), "true");
    pencil.dispatch("click");
    assert.equal(pencil.getAttribute("aria-pressed"), "false");
    assert.deepEqual(changes, [true, false]);
});

test("setVisibility accepts only the two resolved states", () => {
    const view = mountTouchControls(fakeRoot(), fakeAdapter());
    assert.equal(view.element.dataset.visibility, "visible");
    view.setVisibility("collapsed");
    assert.equal(view.element.dataset.visibility, "collapsed");
    assert.throws(() => view.setVisibility("auto"), RangeError);
});

test("touch-controls.js source never creates an input, textarea, or contenteditable", async () => {
    const url = new URL("../../game/static/game/js/ui/touch-controls.js", import.meta.url);
    const source = await readFile(url, "utf8");
    assert.doesNotMatch(source, /createElement\(\s*["'](input|textarea)["']/);
    assert.doesNotMatch(source, /contentEditable|contenteditable="true"/);
    assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|outerHTML/);
});
