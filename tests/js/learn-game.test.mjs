// The practice page's wiring, against the in-repo fake DOM.
//
// The checks that matter here are the two the design flagged as risky: a press
// on one of a cell's blank ninths must do nothing, and the keyboard must reach
// the same answer the pointer does. Everything else in this module is
// bookkeeping around those.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeDocument, fakeRoot } from "./helpers/fake-dom.mjs";

const uninstall = installFakeDocument();
const { createLearnGame } = await import("../../game/static/game/js/learn/learn-game.js");
const { createProgress } = await import("../../game/static/game/js/learn/progress.js");
const { buildCandidates, findEliminations, findAll } =
    await import("../../game/static/game/js/rush/techniques.js");
const { generatePuzzle } = await import("../../functions/_lib/sudoku/generator.js");
after(uninstall);

function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// A position carrying the requested technique, found the same way
// position-source finds one -- but synchronously, so these tests need no
// network double and no timing.
function positionWith(technique, seed = 17) {
    const isPlacement = ["naked-single", "hidden-single-box", "hidden-single-line"]
        .includes(technique);
    const { puzzle, solution } = generatePuzzle({ givens: 50, rng: seeded(seed) });
    const values = Uint8Array.from(puzzle);
    for (let step = 0; step < 81; step++) {
        const pool = (isPlacement ? findAll : findEliminations)(values)
            .filter((d) => d.technique === technique);
        if (pool.length > 0) {
            return { values, solution: Uint8Array.from(solution), deduction: pool[0] };
        }
        const empty = values.indexOf(0);
        if (empty === -1) break;
        const placements = findAll(values);
        const index = placements.length > 0 ? placements[0].index : empty;
        values[index] = solution[index];
    }
    throw new Error(`no ${technique} found for seed ${seed}`);
}

function harness(technique, seed) {
    const position = positionWith(technique, seed);
    const announced = [];
    const shellCalls = { progress: [], active: [], busy: [] };
    const viewCalls = { results: [], markCounts: [], prompts: [], exhausted: 0, errors: [] };

    const game = createLearnGame({
        positionSource: { take: async () => position },
        shell: {
            setProgress: (all) => shellCalls.progress.push(all),
            setActive: (t) => shellCalls.active.push(t),
            setBusy: (b) => shellCalls.busy.push(b),
        },
        view: {
            showLoading() {},
            showPrompt: (lesson) => viewCalls.prompts.push(lesson.kind),
            showMarkCount: (n) => viewCalls.markCounts.push(n),
            showResult: (ok) => viewCalls.results.push(ok),
            showExhausted: () => { viewCalls.exhausted++; },
            showError: (cause) => viewCalls.errors.push(cause),
        },
        boardHost: fakeRoot(),
        announcer: { announce: (kind, message) => announced.push({ kind, message }) },
        settings: { get: () => ({ showConflicts: true }) },
        progress: createProgress(null),
    });

    return { game, position, announced, shellCalls, viewCalls };
}

function boardCells(host) {
    // host -> grid -> row -> cell, mirroring what mountBoard builds.
    return host.children[0].children.flatMap((row) => row.children);
}

// cell -> [valueNode, candidateWrap] -> nine spans, one per digit.
function candidateSpan(host, index, digit) {
    const cell = boardCells(host).find((c) => Number(c.dataset.index) === index);
    return cell.children[1].children.find((span) => Number(span.dataset.digit) === digit);
}

// Delegation listens on the grid, so a press is dispatched there with the span
// as its target -- exactly the shape a real pointerup arrives in.
function pressCandidate(host, index, digit) {
    host.children[0].dispatch("pointerup", { target: candidateSpan(host, index, digit) });
}

test("T-E08-10: the board shows exactly the cells the deduction rests on", async () => {
    const host = fakeRoot();
    const position = positionWith("pointing");
    const game = createLearnGame({
        positionSource: { take: async () => position },
        shell: { setProgress() {}, setActive() {}, setBusy() {} },
        view: {
            showLoading() {}, showPrompt() {}, showMarkCount() {},
            showResult() {}, showExhausted() {}, showError() {},
        },
        boardHost: host,
        announcer: { announce() {} },
        settings: { get: () => ({ showConflicts: true }) },
        progress: createProgress(null),
    });
    await game.start("pointing");

    const { assistCells } = await import("../../game/static/game/js/rush/techniques.js");
    const expected = assistCells(position.deduction, "evidence");
    const focused = new Set(
        boardCells(host)
            .filter((cell) => cell.dataset.focus === "1")
            .map((cell) => Number(cell.dataset.index)),
    );
    assert.deepEqual(focused, expected);
});

test("T-E08-08: a press on a cell's blank ninth does nothing", async () => {
    const host = fakeRoot();
    const position = positionWith("naked-pair");
    const announced = [];
    const game = createLearnGame({
        positionSource: { take: async () => position },
        shell: { setProgress() {}, setActive() {}, setBusy() {} },
        view: {
            showLoading() {}, showPrompt() {}, showMarkCount() {},
            showResult() {}, showExhausted() {}, showError() {},
        },
        boardHost: host,
        announcer: { announce: (kind, message) => announced.push({ kind, message }) },
        settings: { get: () => ({ showConflicts: true }) },
        progress: createProgress(null),
    });
    await game.start("naked-pair");

    const candidates = buildCandidates(position.values);
    let blank = null;
    for (let index = 0; index < 81 && blank === null; index++) {
        if (position.values[index] !== 0) continue;
        for (let digit = 1; digit <= 9; digit++) {
            if ((candidates[index] & (1 << (digit - 1))) === 0) { blank = { index, digit }; break; }
        }
    }
    assert.ok(blank, "the fixture should have an empty cell with a missing candidate");

    // The span exists and is a live hit target; the digit behind it does not.
    assert.ok(candidateSpan(host, blank.index, blank.digit), "the blank span is still in the DOM");
    pressCandidate(host, blank.index, blank.digit);
    assert.equal(game.lesson.marks().size, 0, "a blank ninth must not become an answer");
    assert.equal(announced.length, 0, "and must not be announced either");

    // A real candidate through the same path does land, so the press is being
    // filtered on the mask rather than simply not wired up.
    const real = position.deduction.eliminations[0];
    pressCandidate(host, real.index, real.digit);
    assert.equal(game.lesson.marked(real.index, real.digit), true);
    assert.equal(announced.at(-1).kind, "learn-mark");
});

test("T-E08-09: pointer and keyboard reach the same mark", async () => {
    const host = fakeRoot();
    const position = positionWith("naked-pair");
    const game = createLearnGame({
        positionSource: { take: async () => position },
        shell: { setProgress() {}, setActive() {}, setBusy() {} },
        view: {
            showLoading() {}, showPrompt() {}, showMarkCount() {},
            showResult() {}, showExhausted() {}, showError() {},
        },
        boardHost: host,
        announcer: { announce() {} },
        settings: { get: () => ({ showConflicts: true }) },
        progress: createProgress(null),
    });
    await game.start("naked-pair");
    const target = position.deduction.eliminations[0];

    pressCandidate(host, target.index, target.digit);
    assert.equal(game.lesson.marked(target.index, target.digit), true);
    pressCandidate(host, target.index, target.digit);
    assert.equal(game.lesson.marked(target.index, target.digit), false, "the press toggles");

    // The keyboard path selects a cell and presses a digit. Same toggleMark,
    // so the two paths have to agree on what a mark is.
    const board = host.children[0];
    const cell = boardCells(host).find((c) => Number(c.dataset.index) === target.index);
    cell.dispatch("pointerdown", { clientX: 0, clientY: 0 });
    cell.dispatch("pointerup", { target: cell });
    globalThis.document.dispatch("keydown", {
        key: String(target.digit), preventDefault() {},
    });
    assert.equal(
        game.lesson.marked(target.index, target.digit), true,
        "the keyboard must reach the same mark the pointer does",
    );
    assert.ok(board, "the grid is where delegation listens");
});

test("T-E08-11: a judgement is recorded whether it was right or wrong", async () => {
    const { game, position, shellCalls } = harness("pointing");
    await game.start("pointing");

    // Wrong first: submit nothing.
    game.submit();
    let latest = shellCalls.progress.at(-1);
    assert.deepEqual(latest.pointing, { tried: 1, solved: 0 });

    for (const { index, digit } of position.deduction.eliminations) {
        game.lesson.toggleMark(index, digit);
    }
    game.submit();
    latest = shellCalls.progress.at(-1);
    assert.deepEqual(latest.pointing, { tried: 2, solved: 1 });
});

test("T-E08-12: a placement is judged on the digit, with no submit step", async () => {
    const { game, position, viewCalls } = harness("naked-single");
    await game.start("naked-single");
    assert.deepEqual(viewCalls.prompts, ["placement"]);

    game.submit(); // meaningless for a placement, and must not throw
    assert.deepEqual(viewCalls.results, []);

    const wrong = position.deduction.digit === 9 ? 1 : position.deduction.digit + 1;
    game.lesson.answer(wrong);
    game.lesson.answer(position.deduction.digit);
    assert.equal(game.lesson.state(), "correct");
});

test("T-E08-13: missing dependencies are named, not discovered later", () => {
    assert.throws(() => createLearnGame({}), /missing deps\.positionSource/);
    assert.throws(
        () => createLearnGame({ positionSource: {}, shell: {}, view: {}, boardHost: {} }),
        /missing deps\.announcer/,
    );
});

test("T-E08-14: an exhausted technique is reported, not thrown at the page", async () => {
    const { LearnSourceError } = await import("../../game/static/game/js/learn/position-source.js");
    const viewCalls = { exhausted: 0 };
    const game = createLearnGame({
        positionSource: { take: async () => { throw new LearnSourceError("exhausted", "hidden-pair"); } },
        shell: { setProgress() {}, setActive() {}, setBusy() {} },
        view: {
            showLoading() {}, showPrompt() {}, showMarkCount() {}, showResult() {},
            showExhausted: () => { viewCalls.exhausted++; },
            showError() {},
        },
        boardHost: fakeRoot(),
        announcer: { announce() {} },
        settings: { get: () => ({}) },
        progress: createProgress(null),
    });
    await game.start("hidden-pair");
    assert.equal(viewCalls.exhausted, 1);
});

test("T-E08-15: a dropped connection shows the shared retry panel's cause", async () => {
    const { PuzzleSourceError } = await import("../../game/static/game/js/rush/puzzle-source.js");
    const errors = [];
    const game = createLearnGame({
        positionSource: { take: async () => { throw new PuzzleSourceError("offline"); } },
        shell: { setProgress() {}, setActive() {}, setBusy() {} },
        view: {
            showLoading() {}, showPrompt() {}, showMarkCount() {}, showResult() {},
            showExhausted() {}, showError: (cause) => errors.push(cause),
        },
        boardHost: fakeRoot(),
        announcer: { announce() {} },
        settings: { get: () => ({}) },
        progress: createProgress(null),
    });
    await game.start("claiming");
    assert.deepEqual(errors, ["offline"]);
});
