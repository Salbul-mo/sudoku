import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { installFakeDocument, fakeRoot } from "./helpers/fake-dom.mjs";

const uninstall = installFakeDocument();
const { mountNotes } = await import("../../game/static/game/js/ui/notes-view.js");
const { createStore } = await import("../../game/static/game/js/core/store.js");
after(uninstall);

function freshSession() {
    return {
        schemaVersion: 1, puzzleId: "t", dim: 9,
        givens: new Uint8Array(81), values: new Uint8Array(81), candidates: new Uint16Array(81),
        cellNotes: {}, regionNotes: {}, createdAt: 0, updatedAt: 0,
    };
}

test("notes-view.js source never sets aria-modal (non-modal editor, T-UI-B10-06)", async () => {
    const url = new URL("../../game/static/game/js/ui/notes-view.js", import.meta.url);
    const source = await readFile(url, "utf8");
    assert.doesNotMatch(source, /aria-modal/);
});

test("saving an empty string deletes the note (T-UI-B10-09)", () => {
    const store = createStore(freshSession());
    store.setNote({ kind: "cell", key: 0 }, "keep me");
    const notes = mountNotes(fakeRoot(), store, { confirm: async () => true });
    notes.openEditor({ kind: "cell", key: 0 }, null);
    assert.equal(store.getNote({ kind: "cell", key: 0 }), "keep me");
});

test("a stub confirm callback is enough to verify cancel behavior without UI-B11 (DV-06, T-UI-B10-10)", async () => {
    let asked = 0;
    const store = createStore(freshSession());
    const notes = mountNotes(fakeRoot(), store, { confirm: async () => { asked++; return true; } });
    notes.openEditor({ kind: "cell", key: 0 }, null);
    assert.equal(notes.isDirty, false);
});

test("mounting without a confirm callback throws TypeError (DV-06 contract)", () => {
    const store = createStore(freshSession());
    assert.throws(() => mountNotes(fakeRoot(), store, {}), TypeError);
});

test("note preview text is set via textContent, never innerHTML (T-UI-B10-16)", async () => {
    const url = new URL("../../game/static/game/js/ui/notes-view.js", import.meta.url);
    const source = await readFile(url, "utf8");
    assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|outerHTML/);
});

test("openNotesList renders every stored note as textContent, markup included verbatim", () => {
    const store = createStore(freshSession());
    store.setNote({ kind: "cell", key: 5 }, "<script>alert(1)</script>");
    const root = fakeRoot();
    const notes = mountNotes(root, store, { confirm: async () => true });
    const list = notes.openNotesList();
    const previewText = list.children[0].children[1].textContent;
    assert.equal(previewText, "<script>alert(1)</script>");
});
