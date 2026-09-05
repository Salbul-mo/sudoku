import { test, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeDocument, fakeRoot } from "./helpers/fake-dom.mjs";

const uninstall = installFakeDocument();
const { createRushGame } = await import("../../game/static/game/js/rush/rush-game.js");
const { mountRushShell } = await import("../../game/static/game/js/rush/rush-shell.js");
const { mountRushView } = await import("../../game/static/game/js/rush/rush-view.js");
const { RUSH, RUSH_MODES, modePointsFor } = await import("../../game/static/game/js/rush/config.js");
const { generatePuzzle } = await import("../../functions/_lib/sudoku/generator.js");
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
    const ticks = [];
    const tick = view.tick;
    view.tick = (remaining, limit) => { ticks.push({ remaining, limit }); tick(remaining, limit); };

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
        game, shell, view, announced, failures, boards, root, ticks,
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
    // Priced by the deduction, not by a flat rate: a naked single backed by
    // two units is worth more than one backed by one, so the expectation has
    // to come from the same table the game scores against.
    const expected = modePointsFor(first.technique, first.units.length, h2.game.mode);
    handle.store.setValue(first.index, first.digit);
    assert.equal(h2.game.state().score, expected, "a correct digit scores its technique's points");
    assert.equal(h2.game.state().lives, RUSH.LIVES);

    const second = h2.game.target;
    const wrong = (second.digit % 9) + 1;
    handle.store.setValue(second.index, wrong);
    assert.equal(h2.game.state().lives, RUSH.LIVES - 1, "a wrong digit costs a life");
    assert.equal(h2.game.state().combo, 0, "and breaks the combo");
    h2.game.destroy();
});

test("T-B10-05: the selected Rush mode changes the points earned by a correct hit", async () => {
    for (const mode of RUSH_MODES) {
        let handle = null;
        const h = harness({ game: { onBoardMounted: (parts) => { handle = parts; } } });
        await h.game.start(mode.id);
        const target = h.game.target;
        handle.store.setValue(target.index, target.digit);
        assert.equal(
            h.game.state().score,
            modePointsFor(target.technique, target.units.length, mode.id),
            `${mode.id} applies its score multiplier`,
        );
        h.game.destroy();
    }
});

test("T-B10-02: starting a run with a mode uses that mode's opening limit", async () => {
    for (const { id, limitMs } of RUSH_MODES) {
        const h = harness();
        await h.game.start(id);
        assert.equal(h.ticks.at(-1).limit, limitMs, `${id} opening limit`);
        assert.equal(h.game.mode, id);
        h.game.destroy();
    }
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

test("T-B04-09: the board runs in focus view while a run is on, and opens up when it ends", async () => {
    let handle = null;
    const h = harness({ game: { onBoardMounted: (parts) => { handle = parts; } } });
    await h.game.start();

    assert.equal(handle.boardView.element.dataset.rushFocus, "1", "a live run narrows the grid");
    // The marked cell's box, row and column are the cells board-view marks as
    // peers -- the CSS keys off exactly that, so the target must be selected.
    assert.equal(handle.boardView.selection, h.game.target.index);

    for (let i = 0; i < RUSH.LIVES; i++) h.advance(RUSH.LIMIT_INITIAL_MS);
    assert.equal(h.game.state().over, true);
    assert.equal(handle.boardView.element.dataset.rushFocus, "0", "the finished board is shown whole");
    h.game.destroy();
});

test("T-B04-10: every marked cell is reported to the composition, not just to the board", async () => {
    // The keyboard adapter keeps its own selection and ignores digits while it
    // is null, so a step that moved only boardView's selection left a desktop
    // player unable to type anything.
    const selected = [];
    let handle = null;
    const h = harness({ game: {
        onSelect: (index) => selected.push(index),
        onBoardMounted: (parts) => { handle = parts; },
    } });
    await h.game.start();

    assert.deepEqual(selected, [h.game.target.index], "the first target is reported");

    const first = h.game.target;
    handle.store.setValue(first.index, first.digit);
    assert.equal(selected.length, 2, "and so is the next one");
    assert.equal(selected[1], h.game.target.index);
    h.game.destroy();
});
