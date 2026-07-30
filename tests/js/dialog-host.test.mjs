import { test, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeDocument, fakeRoot } from "./helpers/fake-dom.mjs";

const uninstall = installFakeDocument();
const { createDialogHost } = await import("../../game/static/game/js/ui/dialog-host.js");
after(uninstall);

function textNode(text) {
    const el = document.createElement("span");
    el.textContent = text;
    return el;
}

test("open() rejects an empty actions list (T-UI-B11-03)", () => {
    const host = createDialogHost(fakeRoot(), []);
    assert.throws(() => host.open({ kind: "x", title: "t", body: textNode("hi"), actions: [] }), RangeError);
});

test("open() rejects a body that is not a Node", () => {
    const host = createDialogHost(fakeRoot(), []);
    assert.throws(
        () => host.open({ kind: "x", title: "t", body: "<b>raw</b>", actions: [{ id: "ok", label: "ok" }] }),
        TypeError
    );
});

test("a nested open() while one dialog is active throws Error (T-UI-B11-04)", () => {
    const host = createDialogHost(fakeRoot(), []);
    host.open({ kind: "x", title: "t", body: textNode("hi"), actions: [{ id: "ok", label: "OK" }] });
    assert.throws(
        () => host.open({ kind: "y", title: "t2", body: textNode("hi2"), actions: [{ id: "ok", label: "OK" }] }),
        Error
    );
});

test("background elements become inert while open and are restored on close", async () => {
    const bg = fakeRoot();
    const host = createDialogHost(fakeRoot(), [bg]);
    const promise = host.open({
        kind: "x", title: "t", body: textNode("hi"),
        actions: [{ id: "ok", label: "OK" }],
    });
    assert.equal(bg.inert, true);
    document.activeElement.dispatch("click");
    const result = await promise;
    assert.equal(result, "ok");
    assert.equal(bg.inert, false);
});

test("Escape resolves the dialog as cancel (T-UI-B11-06)", async () => {
    const root = fakeRoot();
    const host = createDialogHost(root, []);
    const promise = host.open({
        kind: "x", title: "t", body: textNode("hi"),
        actions: [{ id: "cancel", label: "취소", initialFocus: true }, { id: "ok", label: "확인" }],
    });
    const dialog = root.children[0];
    dialog.dispatch("keydown", { key: "Escape" });
    assert.equal(await promise, "cancel");
});

test("confirm() resolves true only for the ok action, and rejects an empty question", async () => {
    const root = fakeRoot();
    const host = createDialogHost(root, []);
    assert.throws(() => host.confirm(""), RangeError);

    const promise = host.confirm("정말요?");
    const dialog = root.children[0];
    const okButton = dialog.children.find((c) => c.textContent === "계속");
    okButton.dispatch("click");
    assert.equal(await promise, true);
});

test("confirm()'s initial focus lands on the cancel button (T-UI-B11-05)", () => {
    const root = fakeRoot();
    const host = createDialogHost(root, []);
    host.confirm("정말요?");
    const dialog = root.children[0];
    const cancelButton = dialog.children.find((c) => c.textContent === "취소");
    assert.equal(document.activeElement, cancelButton);
});
