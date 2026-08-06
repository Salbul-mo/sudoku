import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { installFakeDocument, fakeRoot } from "./helpers/fake-dom.mjs";

const uninstall = installFakeDocument();
const { start } = await import("../../game/static/game/js/app.js");
const { stripFragmentPrefix } = await import("../../game/static/game/js/bootstrap.js");
const { GIVENS_DEFAULT } = await import("../../game/static/game/js/core/claude-mhj_26_08_07_01_givens.js");
after(uninstall);

const SESSION_KEY = "sudoku:v1:session";

function fakeStorage(seed = {}) {
    const map = new Map(Object.entries(seed));
    return {
        map,
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => { map.set(k, String(v)); },
        removeItem: (k) => { map.delete(k); },
    };
}

function puzzleResponse() {
    const puzzle = new Array(81).fill(0);
    puzzle[8] = 4; // one given, so there is a non-empty board to render.
    // Cell 0 is deliberately left empty: it is where mounting seeds the
    // selection, and a given there would mask the seeding tests below.
    return { ok: true, status: 200, json: async () => ({ puzzle, solution: new Array(81).fill(1) }) };
}

// Timers run inline so the persistence debounce resolves without fake clocks.
function env(overrides = {}) {
    return {
        storage: fakeStorage(),
        location: { origin: "https://example.test", pathname: "/", search: "", hash: "" },
        history: { replaceState() {} },
        matchMedia: () => ({ matches: false }),
        fetch: async () => puzzleResponse(),
        setTimeout: (fn) => { fn(); return 1; },
        clearTimeout: () => {},
        now: () => 0,
        ...overrides,
    };
}

test("start() rejects a root that is not an element", async () => {
    await assert.rejects(() => start(null), TypeError);
    await assert.rejects(() => start({}), TypeError);
});

test("a fresh boot mounts the board, the shell, and the digit bar", async () => {
    const root = fakeRoot();
    const result = await start(root, env());
    assert.equal(result.ok, true);

    const grids = root.querySelectorAll('[role="grid"]');
    assert.equal(grids.length, 1);
    assert.equal(grids[0].children.length, 9); // nine rows

    assert.equal(root.querySelectorAll('[role="toolbar"]').length, 1);
    assert.ok(root.querySelectorAll("button").length > 9); // shell actions + digits
    result.teardown();
});

test("main.js's first-paint skeleton is replaced, not left stacked under the app", async () => {
    const root = fakeRoot();
    const skeleton = document.createElement("div");
    skeleton.dataset.state = "skeleton";
    root.appendChild(skeleton);

    const result = await start(root, env());
    assert.equal(root.children.includes(skeleton), false);
    result.teardown();
});

// The regression this whole change exists to prevent: persistence.schedule()
// had no caller anywhere in the codebase, so flushNow() always found `pending`
// null and every edit was lost on reload.
test("a store mutation is written through to storage (save wiring)", async () => {
    const storage = fakeStorage();
    const root = fakeRoot();
    const result = await start(root, env({ storage }));

    assert.equal(storage.map.has(SESSION_KEY), true, "the initial session is durable immediately");

    result.store.setValue(40, 7);
    const saved = JSON.parse(storage.map.get(SESSION_KEY));
    assert.equal(saved.values[40], 7);
    result.teardown();
});

// The keyboard adapter tracks its own selection and silently drops every
// digit press while that is null. Mounting used to seed only the board's
// roving tabindex, so the board looked focused but the first digit typed
// after load went nowhere -- and clicking a cell had the same effect,
// because pointer input moved the touch adapter's selection only.
function digitKey(d) {
    return { code: `Digit${d}`, key: String(d), preventDefault() {} };
}

test("a digit typed right after load lands in the seeded selection", async () => {
    const root = fakeRoot();
    const result = await start(root, env());
    document.dispatch("keydown", digitKey(5));
    assert.equal(result.store.session.values[0], 5);
    result.teardown();
});

test("clicking a cell moves the keyboard selection, so typing then works there", async () => {
    const root = fakeRoot();
    const result = await start(root, env());
    const grid = root.querySelectorAll('[role="grid"]')[0];
    const target = grid.children[4].children[3]; // row 4, column 3 -> index 39

    target.dispatch("pointerdown", { clientX: 0, clientY: 0 });
    target.dispatch("pointerup", {});
    document.dispatch("keydown", digitKey(6));

    assert.equal(result.store.session.values[39], 6);
    assert.equal(result.store.session.values[0], 0, "the seeded cell must not receive it");
    result.teardown();
});

test("a saved session is restored without touching the network", async () => {
    const first = fakeRoot();
    const storage = fakeStorage();
    const opened = await start(first, env({ storage }));
    opened.store.setValue(40, 7);
    opened.teardown();

    let fetched = false;
    const second = fakeRoot();
    const restored = await start(second, env({
        storage,
        fetch: async () => { fetched = true; return puzzleResponse(); },
    }));
    assert.equal(fetched, false);
    assert.equal(restored.store.session.values[40], 7);
    restored.teardown();
});

test("teardown removes the keydown listener and stops persisting", async () => {
    const storage = fakeStorage();
    const root = fakeRoot();
    const result = await start(root, env({ storage }));
    result.teardown();

    const before = storage.map.get(SESSION_KEY);
    result.store.setValue(40, 9); // the store still works; the UI is just detached
    assert.equal(storage.map.get(SESSION_KEY), before, "a torn-down app must not keep writing");

    // Idempotent: a second teardown (restart path calls one too) must not throw.
    result.teardown();
});

test("a shared #s= fragment is decoded rather than passed through with its prefix", () => {
    assert.equal(stripFragmentPrefix("#s=AAAA"), "AAAA");
    assert.equal(stripFragmentPrefix("s=AAAA"), "AAAA");
    assert.equal(stripFragmentPrefix(""), "");
    // Not our fragment: leave it alone instead of feeding it to the codec.
    assert.equal(stripFragmentPrefix("#section-2"), "");
    assert.throws(() => stripFragmentPrefix(null), TypeError);
});

test("a failed puzzle fetch still ends somewhere the user can act on (never blank)", async () => {
    const root = fakeRoot();
    const result = await start(root, env({
        fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    }));
    assert.equal(result.ok, false);
    assert.ok(root.querySelectorAll("button").length > 0, "a retry control must be reachable");
});

test("T-B04-06: the puzzle request carries the saved clue count", async () => {
    const requested = [];
    const storage = fakeStorage();
    storage.setItem("sudoku:v1:settings", JSON.stringify({ schemaVersion: 1, newGameGivens: 26 }));
    const result = await start(fakeRoot(), env({
        storage,
        fetch: async (url) => { requested.push(url); return puzzleResponse(); },
    }));
    assert.equal(result.ok, true);
    assert.equal(requested.length, 1);
    assert.match(requested[0], /\/api\/new-puzzle\/\?givens=26$/);
});

test("T-B04-06b: with no saved preference the request still names the default count", async () => {
    const requested = [];
    await start(fakeRoot(), env({
        fetch: async (url) => { requested.push(url); return puzzleResponse(); },
    }));
    assert.match(requested[0], new RegExp(`\\?givens=${GIVENS_DEFAULT}$`));
});

test("T-B04-07: a board that lands on a different clue count says so", async () => {
    const root = fakeRoot();
    // The stub always answers with a 1-clue board, so whatever count is
    // requested the result cannot match it -- exactly the shortfall the
    // announcement exists for.
    await start(root, env());

    const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
    // The fake DOM keeps `dataset` off the attribute map and has no class
    // selectors, so buttons are located by their label and the live region by
    // the aria-live attribute it really sets.
    const buttonLabelled = (label) =>
        root.querySelectorAll("button").find((b) => b.textContent === label);

    buttonLabelled("새 게임").dispatch("click");
    await flush();

    const preset = buttonLabelled(`${GIVENS_DEFAULT}개`);
    assert.ok(preset, "the new-game dialog should offer the default clue count");
    preset.dispatch("click");
    await flush();

    const live = root.querySelectorAll('[aria-live="polite"]')[0].textContent;
    assert.match(live, new RegExp(`힌트 ${GIVENS_DEFAULT}개로 요청했지만 1개로 만들었습니다`));
});

test("app.js and main.js never use raw-markup DOM APIs", async () => {
    for (const name of ["app.js", "main.js"]) {
        const url = new URL(`../../game/static/game/js/${name}`, import.meta.url);
        assert.doesNotMatch(await readFile(url, "utf8"), /innerHTML|insertAdjacentHTML|outerHTML/, name);
    }
});
