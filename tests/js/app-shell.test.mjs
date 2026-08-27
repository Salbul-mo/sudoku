import { test, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeDocument, fakeRoot } from "./helpers/fake-dom.mjs";

const uninstall = installFakeDocument();
const { mountShell } = await import("../../game/static/game/js/ui/app-shell.js");
const { createStore } = await import("../../game/static/game/js/core/store.js");
const { GIVENS_DEFAULT } =
    await import("../../game/static/game/js/core/givens.js");
const { DIFFICULTIES, DEFAULT_DIFFICULTY } =
    await import("../../game/static/game/js/core/difficulty.js");
after(uninstall);

// Records what the shell writes, so a test can tell "chose 26" apart from
// "did nothing".
function fakeSettings(initial = {}) {
    const values = {
        newGameGivens: GIVENS_DEFAULT,
        newGameDifficulty: DEFAULT_DIFFICULTY,
        hintStripSeenCount: 0,
        ...initial,
    };
    const writes = [];
    return {
        writes,
        get: () => ({ ...values }),
        set(key, value) { values[key] = value; writes.push([key, value]); },
    };
}

function freshSession(overrides = {}) {
    return {
        schemaVersion: 1, puzzleId: "t", dim: 9,
        givens: new Uint8Array(81), values: new Uint8Array(81), candidates: new Uint16Array(81),
        createdAt: 0, updatedAt: 0,
        ...overrides,
    };
}

function noopDeps(overrides = {}) {
    return {
        dialogs: { confirm: async () => true },
        announcer: { announce() {} },
        openShare() {}, openSettings() {}, openHelp() {},
        startNewGame() {},
        ...overrides,
    };
}

test("mounting without a required callback throws TypeError", () => {
    const store = createStore(freshSession());
    const deps = noopDeps();
    delete deps.openHelp;
    assert.throws(() => mountShell(fakeRoot(), store, { get: () => ({}) }, deps), TypeError);
});

test("all 6 header actions are rendered", () => {
    const store = createStore(freshSession());
    const shell = mountShell(fakeRoot(), store, { get: () => ({}) }, noopDeps());
    assert.equal(Object.keys(shell.actions).length, 6);
});

test("an unknown destructive action throws RangeError", async () => {
    const store = createStore(freshSession());
    const shell = mountShell(fakeRoot(), store, { get: () => ({}) }, noopDeps());
    await assert.rejects(shell.onDestructive("wipeEverything"), RangeError);
});

test("clearAll removes user values and candidates but leaves givens intact (T-UI-B14-08)", async () => {
    const givens = new Uint8Array(81);
    givens[0] = 7;
    const store = createStore(freshSession({ givens }));
    store.setValue(1, 5);
    store.toggleCandidate(2, 3);
    const shell = mountShell(fakeRoot(), store, { get: () => ({}) }, noopDeps());
    await shell.onDestructive("clearAll");
    assert.equal(store.session.givens[0], 7);
    assert.equal(store.session.values[1], 0);
    assert.equal(store.session.candidates[2], 0);
});

test("cancelling a destructive action leaves the store untouched", async () => {
    const store = createStore(freshSession());
    store.setValue(0, 5);
    const shell = mountShell(fakeRoot(), store, { get: () => ({}) },
        noopDeps({ dialogs: { confirm: async () => false } }));
    await shell.onDestructive("clearAll");
    assert.equal(store.session.values[0], 5);
});

test("a corrupted hintStripSeenCount is treated as 0 (T-UI-B14-11)", () => {
    const store = createStore(freshSession());
    let savedTo = null;
    const settings = { get: () => ({ hintStripSeenCount: "not-a-number" }), set: (k, v) => { savedTo = v; } };
    const shell = mountShell(fakeRoot(), store, settings, noopDeps());
    shell.maybeShowHintStrip(true);
    assert.equal(savedTo, 1);
});

test("the hint strip does not show once the seen count reaches 3", () => {
    const store = createStore(freshSession());
    const settings = { get: () => ({ hintStripSeenCount: 3 }), set() { throw new Error("should not save"); } };
    const shell = mountShell(fakeRoot(), store, settings, noopDeps());
    assert.equal(shell.maybeShowHintStrip(true), null);
});

test("onCheck with a known solution reports wrong cells and highlights them, not the rule-conflict set", () => {
    const solution = Uint8Array.from({ length: 81 }, (_, i) => (i % 9) + 1);
    const store = createStore(freshSession({ solution }));
    store.setValue(0, solution[0] === 9 ? 1 : solution[0] + 1); // wrong vs. solution, but not a rule conflict
    const messages = [];
    let highlighted = null;
    const shell = mountShell(fakeRoot(), store, { get: () => ({}) }, noopDeps({
        announcer: { announce: (kind, msg) => messages.push(msg) },
        boardView: { highlightConflicts: (set) => { highlighted = set; } },
    }));
    shell.onCheck();
    assert.equal(messages.at(-1), "정답과 다른 칸 1개");
    assert.deepEqual([...highlighted], [0]);
});

test("onCheck with a known solution and all-correct entries reports success", () => {
    const solution = Uint8Array.from({ length: 81 }, (_, i) => (i % 9) + 1);
    const store = createStore(freshSession({ solution }));
    store.setValue(0, solution[0]);
    const messages = [];
    const shell = mountShell(fakeRoot(), store, { get: () => ({}) }, noopDeps({
        announcer: { announce: (kind, msg) => messages.push(msg) },
        boardView: { highlightConflicts() {} },
    }));
    shell.onCheck();
    assert.equal(messages.at(-1), "지금까지 입력한 답이 모두 맞습니다");
});

test("onCheck without a known solution falls back to a rule-violation check", () => {
    const store = createStore(freshSession({ solution: null }));
    store.setValue(0, 5);
    store.setValue(1, 5); // rule conflict (same row)
    const messages = [];
    let highlighted = null;
    const shell = mountShell(fakeRoot(), store, { get: () => ({}) }, noopDeps({
        announcer: { announce: (kind, msg) => messages.push(msg) },
        boardView: { highlightConflicts: (set) => { highlighted = set; } },
    }));
    shell.onCheck();
    assert.equal(messages.at(-1), "규칙 위반 2칸");
    assert.deepEqual([...highlighted].sort(), [0, 1]);
});

test("T-B04-01: choosing a difficulty records it and starts the game", async () => {
    const settings = fakeSettings();
    let started = 0;
    const shell = mountShell(fakeRoot(), createStore(freshSession()), settings, noopDeps({
        dialogs: { open: async () => "hard", confirm: async () => true },
        startNewGame: () => { started++; },
    }));
    await shell.onNewGame();
    assert.deepEqual(settings.writes, [["newGameDifficulty", "hard"]]);
    assert.equal(started, 1);
});

test("T-B04-02/03: cancelling, dismissing, or any unrecognised answer starts nothing", async () => {
    // "cancel" is what DialogHost returns for both the cancel button and
    // Escape; the others stand in for a dismissal path that does not exist
    // yet, which must never be read as a clue count.
    for (const answer of ["cancel", undefined, null, "", "99", "abc"]) {
        const settings = fakeSettings();
        let started = 0;
        const shell = mountShell(fakeRoot(), createStore(freshSession()), settings, noopDeps({
            dialogs: { open: async () => answer, confirm: async () => true },
            startNewGame: () => { started++; },
        }));
        await shell.onNewGame();
        assert.deepEqual(settings.writes, [], `answer ${JSON.stringify(answer)} wrote a setting`);
        assert.equal(started, 0, `answer ${JSON.stringify(answer)} started a game`);
    }
});

test("T-B04-04: the dialog offers every difficulty plus cancel, and preselects the saved level", async () => {
    const settings = fakeSettings({ newGameDifficulty: "easy" });
    let spec = null;
    const shell = mountShell(fakeRoot(), createStore(freshSession()), settings, noopDeps({
        dialogs: { open: async (s) => { spec = s; return "cancel"; }, confirm: async () => true },
    }));
    await shell.onNewGame();

    const ids = spec.actions.map((a) => a.id);
    assert.deepEqual(ids, [...DIFFICULTIES.map(({ id }) => id), "cancel"]);
    assert.deepEqual(
        spec.actions.slice(0, -1).map((action) => action.label),
        ["입문", "쉬움", "보통", "어려움", "전문가"],
    );
    const focused = spec.actions.filter((a) => a.initialFocus);
    assert.equal(focused.length, 1);
    assert.equal(focused[0].id, "easy");
});

test("T-B04-05: the clearAll confirmation still behaves as before", async () => {
    const store = createStore(freshSession());
    store.setValue(0, 5);
    const shell = mountShell(fakeRoot(), store, fakeSettings(), noopDeps({
        dialogs: { confirm: async () => false, open: async () => "cancel" },
    }));
    await shell.onDestructive("clearAll");
    assert.equal(store.session.values[0], 5);
});

test("completion announces exactly once when the puzzle becomes solved", () => {
    function pattern(r, c) { return (3 * (r % 3) + Math.floor(r / 3) + c) % 9; }
    const solved = Array.from({ length: 81 }, (_, i) => pattern((i / 9) | 0, i % 9) + 1);
    const almost = Uint8Array.from(solved);
    almost[0] = 0; // one cell left empty
    const store = createStore(freshSession({ givens: new Uint8Array(81), values: almost }));
    let completions = 0;
    mountShell(fakeRoot(), store, { get: () => ({}) },
        noopDeps({ announcer: { announce: (kind) => { if (kind === "completion") completions++; } } }));
    store.setValue(0, solved[0]); // fills the last cell with the correct digit
    assert.equal(completions, 1);
});
