import { test } from "node:test";
import assert from "node:assert/strict";
import { computeGeometry, observeViewport } from "../../game/static/game/js/ui/viewport.js";

test("boardScale follows the formula with reserved=72", () => {
    const { boardScale, visibleTop } = computeGeometry(
        { height: 800, offsetTop: 0, scale: 1 }, 900, 360, 72
    );
    const expected = Math.min(1, (800 - 72) / 360);
    assert.equal(boardScale, expected);
    assert.equal(visibleTop, 0);
});

test("a null vv falls back to fallbackHeight", () => {
    const { boardScale } = computeGeometry(null, 640, 320, 56);
    const expected = Math.min(1, (640 - 56) / 320);
    assert.equal(boardScale, expected);
});

test("boardScale is never 0 even when available height is 0", () => {
    const { boardScale } = computeGeometry({ height: 10, offsetTop: 0 }, 10, 320, 1000);
    assert.ok(boardScale > 0);
});

test("boardWidth <= 0 and negative reserved both throw RangeError", () => {
    assert.throws(() => computeGeometry(null, 600, 0, 10), RangeError);
    assert.throws(() => computeGeometry(null, 600, 300, -1), RangeError);
});

test("observeViewport coalesces repeated resize/scroll into one callback per frame", () => {
    const listeners = {};
    const vv = {
        addEventListener: (type, fn) => { listeners[type] = fn; },
        removeEventListener: (type) => { delete listeners[type]; },
    };
    let scheduled = null;
    const fakeRaf = (fn) => { scheduled = fn; return 1; };
    let calls = 0;
    const unsubscribe = observeViewport(vv, () => { calls++; }, { requestAnimationFrame: fakeRaf });

    listeners.resize();
    listeners.scroll();
    listeners.resize();
    assert.equal(calls, 0); // nothing runs until the rAF fires
    scheduled();
    assert.equal(calls, 1);

    unsubscribe();
    assert.equal(Object.keys(listeners).length, 0);
});
