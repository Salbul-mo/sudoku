import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { installFakeDocument, fakeRoot } from "./helpers/fake-dom.mjs";

const uninstall = installFakeDocument();
const { mountTouchControls } = await import("../../game/static/game/js/ui/touch-controls.js");
after(uninstall);

function fakeAdapter() {
    const calls = [];
    let activeDigit = null;
    let sticky = false;
    return {
        calls,
        onDigitTap(d) { activeDigit = activeDigit === d ? null : d; calls.push(["digit", d]); return activeDigit; },
        onPencilTap() { sticky = !sticky; calls.push(["pencil"]); return sticky; },
        onMemoTap() { calls.push(["memo"]); },
        get activeDigit() { return activeDigit; },
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

test("the bar renders 1-9 plus the pencil and memo controls", () => {
    const view = mountTouchControls(fakeRoot(), fakeAdapter());
    assert.equal(view.element.className, "digit-bar");
    assert.equal(view.element.getAttribute("role"), "toolbar");
    for (let d = 1; d <= 9; d++) assert.ok(digitButton(view, d), `missing digit ${d}`);
    assert.ok(roleButton(view, "pencil"));
    assert.ok(roleButton(view, "memo"));
});

test("every control is a button -- never an input, textarea, or contenteditable", () => {
    const view = mountTouchControls(fakeRoot(), fakeAdapter());
    for (const child of view.element.children) {
        assert.equal(child.tagName, "button");
        assert.equal(child.getAttribute("contenteditable"), null);
    }
});

test("tapping a digit reports the press state, and re-tapping releases it", () => {
    const adapter = fakeAdapter();
    const view = mountTouchControls(fakeRoot(), adapter);
    const three = digitButton(view, 3);

    three.dispatch("click");
    assert.deepEqual(adapter.calls, [["digit", 3]]);
    assert.equal(three.getAttribute("aria-pressed"), "true");
    assert.equal(three.dataset.active, "1");

    three.dispatch("click");
    assert.equal(three.getAttribute("aria-pressed"), "false");
    assert.equal(three.dataset.active, "0");
});

test("only one digit reads as pressed at a time", () => {
    const adapter = fakeAdapter();
    const view = mountTouchControls(fakeRoot(), adapter);
    digitButton(view, 3).dispatch("click");
    digitButton(view, 7).dispatch("click");
    assert.equal(digitButton(view, 3).getAttribute("aria-pressed"), "false");
    assert.equal(digitButton(view, 7).getAttribute("aria-pressed"), "true");
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
