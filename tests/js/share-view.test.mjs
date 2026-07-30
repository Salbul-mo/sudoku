import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLink, createShareView } from "../../game/static/game/js/ui/share-view.js";

function baseDeps(overrides = {}) {
    return {
        location: { origin: "https://example.com", pathname: "/" },
        session: {},
        encode: async () => "short-fragment",
        ...overrides,
    };
}

test("buildLink rejects an unknown scope and a non-function encode", async () => {
    await assert.rejects(buildLink(baseDeps(), "SC4"), RangeError);
    await assert.rejects(buildLink(baseDeps({ encode: null }), "SC1"), TypeError);
});

test("a link under 2000 chars has no warning", async () => {
    const result = await buildLink(baseDeps(), "SC2");
    assert.equal(result.ok, true);
    assert.equal(result.warn, false);
});

test("a link over 2000 chars warns but is still allowed (V-UI-B11-03)", async () => {
    const encode = async () => "x".repeat(2500);
    const result = await buildLink(baseDeps({ encode }), "SC2");
    assert.equal(result.ok, true);
    assert.equal(result.warn, true);
});

test("an SC3 link over 8000 chars is rejected with an SC2 suggestion (V-UI-B11-03)", async () => {
    const encode = async () => "x".repeat(9000);
    const result = await buildLink(baseDeps({ encode }), "SC3");
    assert.equal(result.ok, false);
    assert.equal(result.code, "too-long");
    assert.equal(result.suggest, "SC2");
});

test("an SC2 link over 8000 chars is only a warning, not a rejection (only SC3 triggers the hard cap)", async () => {
    const encode = async () => "x".repeat(9000);
    const result = await buildLink(baseDeps({ encode }), "SC2");
    assert.equal(result.ok, true);
    assert.equal(result.warn, true);
});

test("buildLink never touches the address bar (T-UI-B11-10)", async () => {
    let hashSet = false;
    const location = {
        origin: "https://example.com", pathname: "/",
        set hash(_v) { hashSet = true; },
    };
    await buildLink(baseDeps({ location }), "SC1");
    assert.equal(hashSet, false);
});

test("copy() falls back to a selectable input when the clipboard API rejects", async () => {
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    let fallbackShown = null;
    let announced = null;
    Object.defineProperty(globalThis, "navigator", {
        value: { clipboard: { writeText: async () => { throw new Error("denied"); } } },
        configurable: true,
    });
    try {
        const view = createShareView({
            ...baseDeps(),
            announcer: { announce: (kind, msg) => { announced = { kind, msg }; } },
            showSelectableInput: (link) => { fallbackShown = link; },
        });
        await view.build("SC1");
        const result = await view.copy();
        assert.equal(result.ok, false);
        assert.equal(result.fallback, true);
        assert.equal(fallbackShown, "https://example.com/#s=short-fragment");
        assert.equal(announced.kind, "link-copied");
    } finally {
        Object.defineProperty(globalThis, "navigator", originalNavigator);
    }
});

test("copy() uses the clipboard successfully when it is available", async () => {
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    let written = null;
    Object.defineProperty(globalThis, "navigator", {
        value: { clipboard: { writeText: async (text) => { written = text; } } },
        configurable: true,
    });
    try {
        const view = createShareView({ ...baseDeps(), announcer: { announce() {} } });
        await view.build("SC1");
        const result = await view.copy();
        assert.equal(result.ok, true);
        assert.equal(written, "https://example.com/#s=short-fragment");
    } finally {
        Object.defineProperty(globalThis, "navigator", originalNavigator);
    }
});
