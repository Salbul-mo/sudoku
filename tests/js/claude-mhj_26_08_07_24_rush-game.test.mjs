import { test, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeDocument, fakeRoot } from "./helpers/fake-dom.mjs";

const uninstall = installFakeDocument();
const { createRushGame } = await import("../../game/static/game/js/rush/claude-mhj_26_08_07_17_rush-game.js");
const { mountRushShell } = await import("../../game/static/game/js/rush/claude-mhj_26_08_07_15_rush-shell.js");
const { mountRushView } = await import("../../game/static/game/js/rush/claude-mhj_26_08_07_16_rush-view.js");
const { RUSH } = await import("../../game/static/game/js/rush/claude-mhj_26_08_07_11_config.js");
const { generatePuzzle } = await import("../../functions/_lib/sudoku/claude-mhj_26_08_05_04_generator.js");
after(uninstall);

// Hand-driven time: a whole run finishes in microseconds and every expiry is
// exact rather than raced.
function harness(overrides = {}) {
    let now = 0;
    let seq = 0;
    const timeouts = new Map();
    const intervals = new Map();
    const announced = [];
    const failures = [];

    const boards = [];
    const source = {
        take: async () => {
            const { puzzle, solution } = generatePuzzle({ givens: RUSH.BOARD_GIVENS });
            const board = { puzzle: Uint8Array.from(puzzle), solution: Uint8Array.from(solution) };
            boards.push(board);
            return board;
        },
        ...overrides.source,
    };

    const root = fakeRoot();
    const shell = mountRushShell(root, {});
    const view = mountRushView(root, { onRestart() {} });

    const game = createRushGame({
        source,
        shell,
        view,
        boardHost: fakeRoot(),
        controlsHost: fakeRoot(),
        announcer: { announce: (kind, message) => announced.push([kind, message]) },
        settings: { get: () => ({ touchControls: "show", autoRemoveCandidates: true }) },
        storage: null, // exercised separately; here it keeps runs independent
        rng: () => 0, // always the first naked single, so tests are deterministic
        now: () => now,
        setTimeout: (fn, ms) => { const id = ++seq; timeouts.set(id, { fn, at: now + ms }); return id; },
        clearTimeout: (id) => timeouts.delete(id),
        timer: {
            setInterval: (fn, ms) => { const id = ++seq; intervals.set(id, { fn, ms }); return id; },
            clearInterval: (id) => intervals.delete(id),
        },
        onFailure: (e) => failures.push(e),
        ...overrides.game,
    });

    return {
        game, shell, view, announced, failures, boards, root,
        advance(ms) {
            now += ms;
            for (const [id, timer] of [...timeouts]) {
                if (timer.at <= now) { timeouts.delete(id); timer.fn(); }
            }
        },
        tickIntervals() { for (const i of intervals.values()) i.fn(); },
        get intervalCount() { return intervals.size; },
    };
}

test("T-B04-01: the right digit in the marked cell scores, a wrong one costs a life", async () => {
    let handle = null;
    // The store is reached through the board-mounted callback, so the test
    // writes through exactly the surface the keyboard and digit bar use.
    const h2 = harness({ game: { onBoardMounted: (parts) => { handle = parts; } } });
    await h2.game.start();

    const first = h2.game.target;
    handle.store.setValue(first.index, first.digit);
    assert.equal(h2.game.state().score, RUSH.POINTS_PER_HIT, "a correct digit scores");
    assert.equal(h2.game.state().lives, RUSH.LIVES);

    const second = h2.game.target;
    const wrong = (second.digit % 9) + 1;
    handle.store.setValue(second.index, wrong);
    assert.equal(h2.game.state().lives, RUSH.LIVES - 1, "a wrong digit costs a life");
    assert.equal(h2.game.state().combo, 0, "and breaks the combo");
    h2.game.destroy();
});

test("T-B04-02: running out of time costs a life and moves on", async () => {
    const h = harness();
    await h.game.start();
    h.advance(RUSH.LIMIT_INITIAL_MS);
    assert.equal(h.game.state().lives, RUSH.LIVES - 1);
    assert.notEqual(h.game.target, null, "the run continues rather than ending");
    assert.equal(h.game.running, true);
    // The board is unchanged, so the same cell is still the deduction on
    // offer. Timing out does not skip it.
    h.game.destroy();
});

test("T-B04-03: the run ends when lives run out, and the result is announced", async () => {
    const h = harness();
    await h.game.start();
    for (let i = 0; i < RUSH.LIVES; i++) h.advance(RUSH.LIMIT_INITIAL_MS);

    assert.equal(h.game.state().lives, 0);
    assert.equal(h.game.state().over, true);
    assert.equal(h.game.running, false, "the game stops rather than continuing to tick");
    assert.equal(h.intervalCount, 0, "and stops repainting the timer bar");
    assert.ok(
        h.announced.some(([kind]) => kind === "completion"),
        "the end of a run is announced",
    );
    h.game.destroy();
});

test("T-B04-04: finishing a board rolls straight into the next one", async () => {
    let handle = null;
    const h = harness({ game: { onBoardMounted: (parts) => { handle = parts; } } });
    await h.game.start();

    // Play the board out correctly. The engine guarantees this terminates.
    for (let step = 0; step < 200 && h.game.running; step++) {
        const target = h.game.target;
        if (target === null) break;
        handle.store.setValue(target.index, target.digit);
        if (h.boards.length > 1) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 0)); // let newBoard settle

    assert.equal(h.game.state().lives, RUSH.LIVES, "a clean board costs nothing");
    assert.ok(h.boards.length > 1, "a second board was fetched");
    assert.ok(
        h.announced.some(([kind, msg]) => kind === "session" && msg.length > 0),
        "the board change is announced",
    );
    h.game.destroy();
});

test("T-B04-05: the countdown is readable as text, not only as a bar", async () => {
    const h = harness();
    await h.game.start();
    h.tickIntervals();
    const readout = h.view.element.children
        .find((c) => c.className === "rush-timer")
        .children.find((c) => c.className === "rush-timer-readout");
    assert.ok(readout, "the timer has a text readout");
    assert.match(readout.textContent, /\d/, "and it shows a number");
    h.game.destroy();
});

test("T-B04-06: a puzzle that never arrives is reported instead of hanging", async () => {
    const boom = new Error("no puzzle");
    const h = harness({ source: { take: async () => { throw boom; } } });
    await h.game.start();
    assert.deepEqual(h.failures, [boom]);
    assert.equal(h.game.running, false);
    h.game.destroy();
});

test("T-B04-07: pausing stops the clock and the repaint loop", async () => {
    const h = harness();
    await h.game.start();
    assert.ok(h.intervalCount > 0);

    h.game.pause();
    assert.equal(h.intervalCount, 0, "no repainting while backgrounded");
    h.advance(RUSH.LIMIT_INITIAL_MS * 3);
    assert.equal(h.game.state().lives, RUSH.LIVES, "a backgrounded tab costs no lives");

    h.game.resume();
    assert.ok(h.intervalCount > 0, "repainting resumes");
    h.game.destroy();
});

test("T-B04-08: createRushGame rejects a half-built dependency set", () => {
    assert.throws(() => createRushGame({}), TypeError);
    assert.throws(() => createRushGame({ source: {}, shell: {}, view: {} }), TypeError);
});
