// Swapping the board, and the two things a swap must not break: the clock's
// idea of how long the current step gets, and the keyboard's idea of which
// cell is selected.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeDocument, fakeRoot } from "./helpers/fake-dom.mjs";

const uninstall = installFakeDocument();
const { createRushGame } = await import("../../game/static/game/js/rush/rush-game.js");
const { mountRushShell } = await import("../../game/static/game/js/rush/rush-shell.js");
const { mountRushView } = await import("../../game/static/game/js/rush/rush-view.js");
const { RUSH, difficultyFor } = await import("../../game/static/game/js/rush/config.js");
const { assistCells } = await import("../../game/static/game/js/rush/techniques.js");
const { generatePuzzle } = await import("../../functions/_lib/sudoku/generator.js");
after(uninstall);

function harness(overrides = {}) {
    let now = 0;
    let seq = 0;
    const timeouts = new Map();
    const intervals = new Map();
    const announced = [];
    const failures = [];
    const selected = [];
    const swapState = { enabled: null, free: null };
    let takes = 0;

    const source = {
        take: async () => {
            takes++;
            const { puzzle, solution } = generatePuzzle({ givens: RUSH.BOARD_GIVENS });
            return { puzzle: Uint8Array.from(puzzle), solution: Uint8Array.from(solution) };
        },
        ...overrides.source,
    };

    const root = fakeRoot();
    const shell = mountRushShell(root, {});
    shell.setSwapEnabled = (on) => { swapState.enabled = on; };
    shell.setSwapFree = (free) => { swapState.free = free; };
    const view = mountRushView(root, { onRestart() {} });
    const ticks = [];
    const tick = view.tick;
    view.tick = (remaining, limit) => { ticks.push({ remaining, limit }); tick(remaining, limit); };

    let handle = null;
    const game = createRushGame({
        source,
        shell,
        view,
        boardHost: fakeRoot(),
        controlsHost: fakeRoot(),
        announcer: { announce: (kind, message) => announced.push([kind, message]) },
        settings: { get: () => ({ touchControls: "show", autoRemoveCandidates: true }) },
        storage: null,
        rng: () => 0,
        now: () => now,
        setTimeout: (fn, ms) => { const id = ++seq; timeouts.set(id, { fn, at: now + ms }); return id; },
        clearTimeout: (id) => timeouts.delete(id),
        timer: {
            setInterval: (fn, ms) => { const id = ++seq; intervals.set(id, { fn, ms }); return id; },
            clearInterval: (id) => intervals.delete(id),
        },
        onFailure: (e) => failures.push(e),
        onSelect: (index) => selected.push(index),
        onBoardMounted: (parts) => { handle = parts; },
        ...overrides.game,
    });

    return {
        game, shell, view, announced, failures, selected, swapState, ticks,
        get handle() { return handle; },
        get takes() { return takes; },
        advance(ms) {
            now += ms;
            for (const [id, timer] of [...timeouts]) {
                if (timer.at <= now) { timeouts.delete(id); timer.fn(); }
            }
        },
        tickIntervals() { for (const i of intervals.values()) i.fn(); },
        get intervalCount() { return intervals.size; },
        answer() {
            const t = game.target;
            handle.store.setValue(t.index, t.digit);
            return t;
        },
        empties() {
            const { givens, values } = handle.store.session;
            let n = 0;
            for (let i = 0; i < givens.length; i++) if (!(givens[i] || values[i])) n++;
            return n;
        },
    };
}

test("T-B09-01: a paid swap costs the combo and nothing else", async () => {
    const h = harness();
    await h.game.start();
    h.answer();
    h.answer();
    const before = h.game.state();
    assert.equal(before.combo, 2, "two in a row");
    assert.ok(!h.game.swapFree, "a fresh board is not a spent one");

    const boardsBefore = h.takes;
    await h.game.swapBoard();

    const after = h.game.state();
    assert.equal(after.combo, 0, "the combo is the price");
    assert.equal(after.score, before.score, "the score already earned is kept");
    assert.equal(after.lives, before.lives, "a swap is not a mistake");
    assert.equal(h.takes, boardsBefore + 1, "a new board was fetched");
    assert.notEqual(h.game.target, null, "the run continues on the new board");
    assert.ok(h.announced.some(([, m]) => /콤보가 초기화|combo is reset/.test(m)), "the cost is announced");
    h.game.destroy();
});

test("T-B09-07: a swap costs nothing once the board is nearly spent", async () => {
    const h = harness();
    await h.game.start();
    // Play the board down to where it offers nothing but the cheapest
    // deduction there is. That is the state the free swap exists for.
    let guard = 0;
    while (h.empties() > RUSH.FREE_SWAP_AT_EMPTIES && guard++ < 60) h.answer();
    assert.ok(h.empties() <= RUSH.FREE_SWAP_AT_EMPTIES, `stuck at ${h.empties()} empties`);
    assert.ok(h.game.swapFree, "the swap should be free here");
    assert.equal(h.swapState.free, true, "and the button should say so");

    const before = h.game.state();
    assert.ok(before.combo > 0, "there is a combo to lose");
    await h.game.swapBoard();

    assert.equal(h.game.state().combo, before.combo, "the combo survives a free swap");
    assert.equal(h.game.state().lives, before.lives);
    h.game.destroy();
});

test("T-B09-03: pressing swap twice while the board loads fetches one board", async () => {
    let release = null;
    const pending = new Promise((resolve) => { release = resolve; });
    let takes = 0;
    const h = harness({
        source: {
            take: async () => {
                takes++;
                if (takes > 1) await pending;   // hold the second fetch open
                const { puzzle, solution } = generatePuzzle({ givens: RUSH.BOARD_GIVENS });
                return { puzzle: Uint8Array.from(puzzle), solution: Uint8Array.from(solution) };
            },
        },
    });
    await h.game.start();
    const first = h.game.swapBoard();
    const second = h.game.swapBoard();       // ignored: one is already in flight
    assert.equal(h.swapState.enabled, false, "the button is disabled while loading");
    release();
    await Promise.all([first, second]);
    assert.equal(takes, 2, "one board at start, one from the single swap");
    assert.equal(h.swapState.enabled, true, "and it comes back afterwards");
    h.game.destroy();
});

test("T-B09-04: swapping does nothing before a run starts or after it ends", async () => {
    const h = harness();
    await h.game.swapBoard();
    assert.equal(h.takes, 0, "no board is fetched before the run starts");

    await h.game.start();
    for (let i = 0; i < RUSH.LIVES; i++) h.advance(RUSH.LIMIT_INITIAL_MS);
    assert.equal(h.game.state().over, true);
    assert.equal(h.swapState.enabled, false, "the button is disabled once the run is over");

    const takesAtEnd = h.takes;
    await h.game.swapBoard();
    assert.equal(h.takes, takesAtEnd, "and pressing it anyway changes nothing");
    h.game.destroy();
});

test("T-B09-05: the keyboard can type straight after a swap", async () => {
    const h = harness();
    await h.game.start();
    const before = h.selected.length;
    await h.game.swapBoard();
    assert.equal(h.selected.length, before + 1, "the new target was reported to the composition");
    assert.equal(h.selected.at(-1), h.game.target.index);

    // And the digit actually lands, through the same surface the keyboard uses.
    const target = h.answer();
    assert.equal(h.game.state().combo, 1, `typing ${target.digit} scored`);
    h.game.destroy();
});

test("T-B04-13: the board shows exactly the cells the deduction rests on", async () => {
    const h = harness();
    await h.game.start();
    const grid = h.handle.boardView.element;
    const cellByIndex = new Map();
    for (const row of grid.children) {
        for (const cell of row.children) cellByIndex.set(Number(cell.dataset.index), cell);
    }

    for (let step = 0; step < 6; step++) {
        const target = h.game.target;
        const { assist } = difficultyFor(h.game.state().step);
        const expected = assistCells(target, assist);
        if (expected === null) {
            assert.equal(grid.dataset.rushFocus, "0", "assist off means the whole board");
        } else {
            assert.equal(grid.dataset.rushFocus, "1");
            for (const [index, cell] of cellByIndex) {
                // A cell that has never been in a focus set carries no
                // attribute at all, which the stylesheet reads the same way as
                // "0" -- both fail :not([data-focus="1"]).
                assert.equal(
                    cell.dataset.focus === "1", expected.has(index),
                    `cell ${index} at step ${step}`,
                );
            }
        }
        h.answer();
    }
    h.game.destroy();
});

test("T-B04-15: pausing and resuming keeps the step's own time allowance", async () => {
    const h = harness();
    await h.game.start();
    const limit = h.ticks.at(-1).limit;
    assert.ok(limit >= RUSH.LIMIT_FLOOR_MS);

    h.advance(1000);
    h.game.pause();
    assert.equal(h.intervalCount, 0, "the repaint loop stops while paused");
    h.game.resume();
    h.tickIntervals();

    const painted = h.ticks.at(-1);
    assert.equal(painted.limit, limit, "the bar is still scaled to this step's limit");
    assert.ok(painted.remaining <= limit, "and the remainder fits inside it");
    h.game.destroy();
});

test("T-B07-01: how long each answer took is recorded for tuning", async () => {
    const h = harness();
    await h.game.start();
    h.advance(1500);
    const answered = h.answer();
    const timings = h.game.timings();

    assert.equal(timings.length, 1);
    assert.equal(timings[0].technique, answered.technique);
    assert.equal(timings[0].units, answered.units.length);
    assert.equal(timings[0].ms, 1500, "measured from the clock, not from wall time");
    assert.ok(timings[0].limit >= timings[0].ms);

    // A timed-out step is not an answer, so it is not timed.
    h.advance(RUSH.LIMIT_INITIAL_MS);
    assert.equal(h.game.timings().length, 1);
    h.game.destroy();
});

test("T-B04-16: the marked cell reads as a request, not as a mistake", async () => {
    const h = harness();
    await h.game.start();
    const grid = h.handle.boardView.element;
    const cellOf = (index) => {
        for (const row of grid.children) {
            for (const cell of row.children) if (Number(cell.dataset.index) === index) return cell;
        }
        return null;
    };

    const first = h.game.target.index;
    assert.equal(cellOf(first).dataset.target, "1");
    assert.equal(cellOf(first).dataset.conflict, "0", "an empty cell nobody touched is not a violation");
    assert.match(cellOf(first).getAttribute("aria-label"), /채워야 하는 칸|the cell to fill/);

    h.answer();
    assert.equal(cellOf(first).dataset.target, "0", "the mark moves on with the run");
    assert.equal(cellOf(h.game.target.index).dataset.target, "1");

    for (let i = 0; i < RUSH.LIVES; i++) h.advance(RUSH.LIMIT_INITIAL_MS);
    assert.equal(h.game.state().over, true);
    const marked = [...grid.children].flatMap((row) => [...row.children]).filter((c) => c.dataset.target === "1");
    assert.equal(marked.length, 0, "a finished run asks for nothing");
    h.game.destroy();
});
