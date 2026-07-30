import { test, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeDocument, fakeRoot } from "./helpers/fake-dom.mjs";

const uninstall = installFakeDocument();
const { createAnnouncer } = await import("../../game/static/game/js/ui/announcer.js");
after(uninstall);

test("an unknown kind throws RangeError", () => {
    const announcer = createAnnouncer(fakeRoot());
    assert.throws(() => announcer.announce("not-a-kind", "x"), RangeError);
});

test("the live region has polite and atomic attributes", () => {
    const root = fakeRoot();
    createAnnouncer(root);
    const region = root.children[0];
    assert.equal(region.getAttribute("aria-live"), "polite");
    assert.equal(region.getAttribute("aria-atomic"), "true");
});

test("repeating the same message changes textContent so it re-reads", () => {
    const root = fakeRoot();
    const announcer = createAnnouncer(root);
    announcer.announce("session", "복원됨");
    const first = root.children[0].textContent;
    announcer.announce("session", "복원됨");
    const second = root.children[0].textContent;
    assert.notEqual(first, second);
});
