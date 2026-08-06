import { test, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeDocument, fakeRoot } from "./helpers/fake-dom.mjs";

const uninstall = installFakeDocument();
const { mountBoard } = await import("../../game/static/game/js/ui/board-view.js");
const { createStore } = await import("../../game/static/game/js/core/store.js");
after(uninstall);

function freshStore() {
    return createStore({
        schemaVersion: 1, puzzleId: "t", dim: 9,
        givens: new Uint8Array(81), values: new Uint8Array(81), candidates: new Uint16Array(81),
        cellNotes: {}, regionNotes: {}, createdAt: 0, updatedAt: 0,
    });
}

function fakeSettings(values) {
    return { get: () => ({ showConflicts: true, ...values }) };
}

function cellAt(root, index) {
    // grid -> row -> cell, mirroring the structure mountBoard builds.
    const grid = root.children[0];
    return grid.children[(index / 9) | 0].children[index % 9];
}

test("the grid carries the .board class the layout sizes against", () => {
    const root = fakeRoot();
    const view = mountBoard(root, freshStore(), { settings: fakeSettings() });
    assert.equal(view.element.className, "board");
    assert.equal(view.element.getAttribute("role"), "grid");
});

test("clearing one of two duplicates clears the other cell's conflict cue too", () => {
    const root = fakeRoot();
    const store = freshStore();
    mountBoard(root, store, { settings: fakeSettings() });

    store.setValue(0, 5);
    store.setValue(1, 5); // same row -> both conflict
    assert.equal(cellAt(root, 0).dataset.conflict, "1");
    assert.equal(cellAt(root, 1).dataset.conflict, "1");

    // The store only reports cell 1 as changed, so a naive renderer would
    // leave cell 0 stuck showing a conflict that no longer exists.
    store.clearCell(1);
    assert.equal(cellAt(root, 0).dataset.conflict, "0");
    assert.equal(cellAt(root, 1).dataset.conflict, "0");
});

test("showConflicts=false hides the visual cue but keeps it in the accessible name", () => {
    const root = fakeRoot();
    const store = freshStore();
    mountBoard(root, store, { settings: fakeSettings({ showConflicts: false }) });

    store.setValue(0, 5);
    store.setValue(1, 5);
    assert.equal(cellAt(root, 0).dataset.conflict, "0");
    assert.match(cellAt(root, 0).getAttribute("aria-label"), /규칙 위반/);
});

test("highlightConflicts overrides the setting, and the next mutation clears it", () => {
    const root = fakeRoot();
    const store = freshStore();
    const view = mountBoard(root, store, { settings: fakeSettings({ showConflicts: false }) });

    store.setValue(0, 5);
    store.setValue(1, 5);
    view.highlightConflicts(store.conflicts());
    assert.equal(cellAt(root, 0).dataset.conflict, "1");

    store.setValue(80, 3); // unrelated edit supersedes the one-shot highlight
    assert.equal(cellAt(root, 0).dataset.conflict, "0");
});

test("highlightConflicts on a cell with no rule violation (정답 체크 vs. solution) still updates the accessible name", () => {
    const root = fakeRoot();
    const store = freshStore();
    const view = mountBoard(root, store, { settings: fakeSettings() });

    store.setValue(0, 5); // no peer shares this value -- not a rule conflict
    assert.equal(cellAt(root, 0).dataset.conflict, "0");
    assert.doesNotMatch(cellAt(root, 0).getAttribute("aria-label"), /규칙 위반/);

    // Force-highlight it anyway, as onCheck() does for a cell that is wrong
    // versus the known solution but violates no row/column/box rule.
    view.highlightConflicts(new Set([0]));
    assert.equal(cellAt(root, 0).dataset.conflict, "1");
    assert.match(cellAt(root, 0).getAttribute("aria-label"), /규칙 위반/);
});

test("select() marks the selection's peers and moves the marking with it", () => {
    const root = fakeRoot();
    const view = mountBoard(root, freshStore(), { settings: fakeSettings() });

    view.select(0);
    assert.equal(cellAt(root, 1).dataset.peer, "1"); // same row
    assert.equal(cellAt(root, 9).dataset.peer, "1"); // same column
    assert.equal(cellAt(root, 80).dataset.peer, undefined); // unrelated, never touched

    view.select(80);
    assert.equal(cellAt(root, 1).dataset.peer, "0"); // released
    assert.equal(cellAt(root, 79).dataset.peer, "1");
});

// board.css gives [data-candidate-mode="1"] a dashed outline and a "후보"
// badge. Flagging every cell stamped that badge across all 81 and told the
// user nothing about where the next digit would land.
test("the candidate-mode badge marks only the selected cell, and follows it", () => {
    const root = fakeRoot();
    const view = mountBoard(root, freshStore(), { settings: fakeSettings() });

    view.select(20);
    view.setCandidateMode(true);
    assert.equal(cellAt(root, 20).dataset.candidateMode, "1");
    assert.equal(
        root.children[0].children.flatMap((r) => r.children)
            .filter((c) => c.dataset.candidateMode === "1").length,
        1);

    view.select(21);
    assert.equal(cellAt(root, 20).dataset.candidateMode, "0");
    assert.equal(cellAt(root, 21).dataset.candidateMode, "1");

    view.setCandidateMode(false);
    assert.equal(cellAt(root, 21).dataset.candidateMode, "0");
});

test("pointer events on a cell reach the injected callbacks with that cell's index", () => {
    const root = fakeRoot();
    const seen = [];
    mountBoard(root, freshStore(), {
        settings: fakeSettings(),
        onPointerDown: (i) => seen.push(["down", i]),
        onPointerMove: (dx, dy) => seen.push(["move", dx, dy]),
        onPointerUp: (i) => seen.push(["up", i]),
    });

    const cell = cellAt(root, 42);
    cell.dispatch("pointerdown", { clientX: 10, clientY: 10 });
    cell.dispatch("pointermove", { clientX: 25, clientY: 10 });
    cell.dispatch("pointerup", {});

    assert.deepEqual(seen, [["down", 42], ["move", 15, 0], ["up", 42]]);
});

test("board-view.js source never uses innerHTML/insertAdjacentHTML/outerHTML", async () => {
    const { readFile } = await import("node:fs/promises");
    const url = new URL("../../game/static/game/js/ui/board-view.js", import.meta.url);
    assert.doesNotMatch(await readFile(url, "utf8"), /innerHTML|insertAdjacentHTML|outerHTML/);
});
