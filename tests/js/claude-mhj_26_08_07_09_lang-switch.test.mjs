import { test, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeDocument, fakeRoot } from "./helpers/fake-dom.mjs";

const uninstall = installFakeDocument();
const { mountShell } = await import("../../game/static/game/js/ui/app-shell.js");
const { createStore } = await import("../../game/static/game/js/core/store.js");
after(uninstall);

function freshSession() {
    return {
        schemaVersion: 1, puzzleId: "t", dim: 9,
        givens: new Uint8Array(81), values: new Uint8Array(81), candidates: new Uint16Array(81),
        createdAt: 0, updatedAt: 0,
    };
}

function shellDeps() {
    return {
        dialogs: { confirm: async () => true },
        announcer: { announce() {} },
        openShare() {}, openSettings() {}, openHelp() {},
        startNewGame() {},
    };
}

function mountWithLang(lang) {
    document.documentElement.lang = lang;
    const root = fakeRoot();
    const settings = { get: () => ({ newGameGivens: 32, hintStripSeenCount: 3 }), set() {} };
    mountShell(root, createStore(freshSession()), settings, shellDeps());
    const header = root.children.find((c) => c.className === "app-shell-header");
    return header.children.find((c) => c.className === "lang-switch");
}

test("T-B05-01: the Korean page offers English and points at /en/", () => {
    const link = mountWithLang("ko");
    assert.ok(link, "no lang-switch was mounted");
    assert.equal(link.href, "/en/");
    assert.equal(link.textContent, "English");
});

test("T-B05-02: the English page offers Korean and points back at /", () => {
    const link = mountWithLang("en");
    assert.ok(link, "no lang-switch was mounted");
    assert.equal(link.href, "/");
    assert.equal(link.textContent, "한국어");
});

// The switch is a navigation between two indexed URLs. A button with a click
// handler would look identical and be invisible to a crawler, so the element
// type is asserted rather than left to the implementation.
test("T-B05-03: the switch is a real link, marked as the alternate it targets", () => {
    const link = mountWithLang("ko");
    assert.equal(link.tagName.toLowerCase(), "a");
    assert.equal(link.getAttribute("hreflang"), "en");
    assert.equal(link.getAttribute("rel"), "alternate");
});

test("T-B05-04: an unrecognised lang falls back to Korean rather than breaking", () => {
    const link = mountWithLang("fr");
    assert.equal(link.href, "/en/");
    assert.equal(link.textContent, "English");
});
