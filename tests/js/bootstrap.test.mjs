import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { installFakeDocument, fakeRoot } from "./helpers/fake-dom.mjs";

const uninstall = installFakeDocument();
const { bootstrap, resolveConflict, createNewSession } =
    await import("../../game/static/game/js/bootstrap.js");
after(uninstall);

function freshSession(overrides = {}) {
    return {
        schemaVersion: 1, puzzleId: "local", dim: 9,
        givens: new Uint8Array(81), values: new Uint8Array(81), candidates: new Uint16Array(81),
        cellNotes: {}, regionNotes: {}, createdAt: 0, updatedAt: 0,
        ...overrides,
    };
}

function baseDeps(overrides = {}) {
    return {
        root: fakeRoot(),
        hash: "",
        persistence: { restore: () => ({ ok: false, code: "empty" }), flushNow() {} },
        settings: { get: () => ({}) },
        codec: { decode: async () => ({ ok: false, code: "empty" }) },
        dialogs: { open: async () => "local", confirm: async () => true },
        announcer: { announce() {} },
        fetchPuzzle: async () => { throw new Error("fetchPuzzle should not be called"); },
        history: { replaceState() {} },
        ...overrides,
    };
}

test("bootstrap throws TypeError when a dependency is missing (T-UI-B12-03)", async () => {
    const deps = baseDeps();
    delete deps.announcer;
    await assert.rejects(bootstrap(deps), TypeError);
});

test("a restorable local session skips the network entirely (V-UI-B12-01, T-UI-B12-01)", async () => {
    let fetchCalled = false;
    const deps = baseDeps({
        persistence: { restore: () => ({ ok: true, session: freshSession() }), flushNow() {} },
        fetchPuzzle: async () => { fetchCalled = true; return { ok: true, json: async () => ({}) }; },
    });
    const result = await bootstrap(deps);
    assert.equal(result.ok, true);
    assert.equal(fetchCalled, false);
});

test("no local session and no URL falls through to createNewSession (step order, T-UI-B12-02)", async () => {
    const calls = [];
    const deps = baseDeps({
        fetchPuzzle: async () => {
            calls.push("fetch");
            return { ok: true, json: async () => ({ puzzle: new Array(81).fill(0), solution: new Array(81).fill(1) }) };
        },
    });
    const result = await bootstrap(deps);
    assert.equal(result.ok, true);
    assert.deepEqual(calls, ["fetch"]);
});

test("CR5: a failing decode does not adopt the URL and still falls back to local (V-UI-B12-02)", async () => {
    const local = { ok: true, session: freshSession({ puzzleId: "kept" }) };
    const result = await resolveConflict({ ok: false, code: "crc-mismatch" }, local, baseDeps());
    assert.equal(result.session.puzzleId, "kept");
    assert.equal(result.consumedFragment, true);
});

test("CR1: different givens archives the local session and adopts the URL", async () => {
    let archived = null;
    const urlGivens = new Uint8Array(81);
    urlGivens[0] = 5;
    const local = { ok: true, session: freshSession({ puzzleId: "old" }) };
    const url = { ok: true, state: { givens: urlGivens, values: null, candidates: null, notes: null, savedAt: null } };
    const deps = baseDeps({ archive: (s) => { archived = s; } });
    const result = await resolveConflict(url, local, deps);
    assert.equal(archived.puzzleId, "old");
    assert.notEqual(result.session.puzzleId, "old");
});

// Regression: this branch returns before the CR4 note merge below it, and
// sessionFromDecoded() builds an empty note bag, so an SC3 link handed to
// someone with no saved session arrived with every note stripped -- which is
// both the only scope that carries notes and the only audience for a link.
test("no local session: an SC3 link's notes are adopted, not dropped", async () => {
    const url = {
        ok: true,
        state: {
            givens: new Uint8Array(81), values: null, candidates: null, savedAt: null,
            notes: [
                { kind: 0, key: 12, text: "셀 메모" },
                { kind: 1, key: 3, text: "행 메모" },
                { kind: 3, key: 7, text: "박스 메모" },
            ],
        },
    };
    const result = await resolveConflict(url, { ok: false, code: "empty" }, baseDeps());
    assert.equal(result.session.cellNotes["12"], "셀 메모");
    assert.equal(result.session.regionNotes.r3, "행 메모");
    assert.equal(result.session.regionNotes.b7, "박스 메모");
    assert.equal(result.consumedFragment, true);
});

test("no local session and no notes in the URL leaves empty note bags", async () => {
    const url = {
        ok: true,
        state: { givens: new Uint8Array(81), values: null, candidates: null, notes: null, savedAt: null },
    };
    const result = await resolveConflict(url, { ok: false, code: "empty" }, baseDeps());
    assert.deepEqual(result.session.cellNotes, {});
    assert.deepEqual(result.session.regionNotes, {});
});

test("CR3: identical givens and core, no notes in URL -- local notes are preserved (V-UI-B12-03)", async () => {
    const local = { ok: true, session: freshSession({ cellNotes: { "0": "kept note" } }) };
    const url = { ok: true, state: { givens: local.session.givens, values: null, candidates: null, notes: null, savedAt: null } };
    const result = await resolveConflict(url, local, baseDeps());
    assert.equal(result.session.cellNotes["0"], "kept note");
});

test("CR4: URL notes disjoint from local notes are unioned automatically", async () => {
    const local = { ok: true, session: freshSession({ cellNotes: { "0": "local note" } }) };
    const url = {
        ok: true,
        state: {
            givens: local.session.givens, values: null, candidates: null, savedAt: null,
            notes: [{ kind: 0, key: 5, text: "url note" }],
        },
    };
    const result = await resolveConflict(url, local, baseDeps());
    assert.equal(result.session.cellNotes["0"], "local note");
    assert.equal(result.session.cellNotes["5"], "url note");
});

test("CR4: a same-target note conflict opens exactly one dialog and defaults are respected", async () => {
    let opens = 0;
    const local = { ok: true, session: freshSession({ cellNotes: { "0": "local note" } }) };
    const url = {
        ok: true,
        state: {
            givens: local.session.givens, values: null, candidates: null, savedAt: null,
            notes: [{ kind: 0, key: 0, text: "url note" }],
        },
    };
    const deps = baseDeps({ dialogs: { open: async () => { opens++; return "url"; }, confirm: async () => true } });
    const result = await resolveConflict(url, local, deps);
    assert.equal(opens, 1);
    assert.equal(result.session.cellNotes["0"], "url note");
});

test("CR2 and CR4 together open exactly two dialogs, sequentially (V-UI-B12-07)", async () => {
    const opened = [];
    const local = { ok: true, session: freshSession({ cellNotes: { "0": "local note" }, values: new Uint8Array(81) }) };
    const values = new Uint8Array(81);
    values[1] = 7; // differs from local's all-zero values -> CR2
    const url = {
        ok: true,
        state: {
            givens: local.session.givens, values, candidates: null, savedAt: 123,
            notes: [{ kind: 0, key: 0, text: "url note" }], // same target as local -> CR4
        },
    };
    const deps = baseDeps({
        dialogs: {
            open: async (spec) => { opened.push(spec.kind); return spec.kind === "conflict" ? "local" : "cancel"; },
            confirm: async () => true,
        },
    });
    await resolveConflict(url, local, deps);
    assert.equal(opened.length, 2);
});

test("createNewSession retries once on a 500, then reaches a terminal state (T-UI-B12-08)", async () => {
    let attempts = 0;
    const deps = baseDeps({
        fetchPuzzle: async () => { attempts++; return { status: 500, ok: false, json: async () => ({}) }; },
    });
    const session = await createNewSession(deps);
    assert.equal(session, null);
    assert.equal(attempts, 2);
});

test("a 4xx response does not retry (T-UI-B12-09)", async () => {
    let attempts = 0;
    const deps = baseDeps({
        fetchPuzzle: async () => { attempts++; return { status: 404, ok: false, json: async () => ({}) }; },
    });
    await createNewSession(deps);
    assert.equal(attempts, 1);
});

test("the fetched solution is never stored on the session (V4-13, T-UI-B12-10)", async () => {
    const deps = baseDeps({
        fetchPuzzle: async () => ({
            ok: true, status: 200,
            json: async () => ({ puzzle: new Array(81).fill(0), solution: new Array(81).fill(5) }),
        }),
    });
    const session = await createNewSession(deps);
    assert.ok(!("solution" in session));
});

test("offline skips the network call entirely", async () => {
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });
    let called = false;
    try {
        const deps = baseDeps({ fetchPuzzle: async () => { called = true; return { ok: true, json: async () => ({}) }; } });
        const session = await createNewSession(deps);
        assert.equal(session, null);
        assert.equal(called, false);
    } finally {
        Object.defineProperty(globalThis, "navigator", originalNavigator);
    }
});

test("bootstrap.js source has no pushState and no beforeunload (T-UI-B12-16)", async () => {
    const url = new URL("../../game/static/game/js/bootstrap.js", import.meta.url);
    const source = await readFile(url, "utf8");
    assert.doesNotMatch(source, /pushState/);
    assert.doesNotMatch(source, /beforeunload/);
});
