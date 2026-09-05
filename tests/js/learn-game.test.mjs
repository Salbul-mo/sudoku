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
const { mountLearnShell } = await import("../../game/static/game/js/learn/learn-shell.js");
const { mountLearnView } = await import("../../game/static/game/js/learn/learn-view.js");
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

function viewParts(root) {
    const wrap = root.children[0];
    return {
        wrap,
        instruction: wrap.children[0],
        boardHost: wrap.children[1],
        controls: wrap.children[2],
        feedback: wrap.children[3],
    };
}

test("T-E08-16: practice view puts instructions, board, controls and feedback in order", () => {
    const root = fakeRoot();
    const digits = [];
    const view = mountLearnView(root, {
        onDigit: (digit) => digits.push(digit),
        onSubmit() {},
        onNext() {},
    });
    const { wrap, instruction, boardHost, controls, feedback } = viewParts(root);

    assert.deepEqual(wrap.children, [instruction, boardHost, controls, feedback]);
    assert.equal(instruction.className, "learn-instruction");
    assert.equal(boardHost.className, "board-area learn-board-area");
    assert.equal(controls.className, "learn-controls");
    assert.equal(feedback.className, "learn-feedback");
    view.destroy();
});

test("T-E08-17: placement digit pad is touch-ready and delegates every digit", () => {
    const root = fakeRoot();
    const digits = [];
    let nextCalls = 0;
    const view = mountLearnView(root, {
        onDigit: (digit) => digits.push(digit),
        onSubmit() {},
        onNext: () => { nextCalls++; },
    });
    const { instruction, controls, feedback } = viewParts(root);
    const prompt = instruction.children[0];
    const digitPrompt = controls.children[0];
    const digitPad = controls.children[1];
    const submit = controls.children[3];
    const result = feedback.children[0];
    const explanation = feedback.children[1];
    const next = feedback.children[2].children[0];
    const lesson = { kind: "placement", deduction: { technique: "naked-single" } };

    view.showPrompt(lesson);
    assert.equal(prompt.textContent, "강조된 칸에 들어갈 숫자를 아래에서 선택하세요.");
    assert.equal(digitPrompt.textContent, "숫자를 선택하세요.");
    assert.equal(digitPad.hidden, false);
    assert.equal(digitPad.children.length, 9);
    assert.ok(digitPad.children.every((button) => button.type === "button"));
    assert.equal(submit.hidden, true);

    digitPad.children[4].dispatch("click");
    assert.deepEqual(digits, [5]);

    view.showResult(false, lesson);
    assert.equal(result.hidden, false);
    assert.match(result.textContent, /아직 아닙니다/);
    assert.equal(digitPad.hidden, false);
    assert.ok(digitPad.children.every((button) => button.disabled !== true));

    view.showResult(true, lesson);
    assert.equal(digitPad.hidden, true);
    assert.ok(digitPad.children.every((button) => button.disabled === true));
    assert.equal(explanation.hidden, false);
    assert.equal(next.hidden, false);
    next.dispatch("click");
    assert.equal(nextCalls, 1);
    view.destroy();
});

test("T-E08-18: elimination keeps candidate controls and hides the digit pad", () => {
    const root = fakeRoot();
    let digitCalls = 0;
    let submitCalls = 0;
    const view = mountLearnView(root, {
        onDigit: () => { digitCalls++; },
        onSubmit: () => { submitCalls++; },
        onNext() {},
    });
    const { controls, feedback } = viewParts(root);
    const digitPad = controls.children[1];
    const tally = controls.children[2];
    const submit = controls.children[3];
    const next = feedback.children[2].children[0];
    const lesson = { kind: "elimination", deduction: { technique: "pointing" } };

    view.showPrompt(lesson);
    assert.equal(digitPad.hidden, true);
    assert.equal(submit.hidden, false);
    assert.equal(tally.hidden, false);
    assert.equal(digitCalls, 0);

    view.showMarkCount(2);
    assert.equal(tally.textContent, "선택한 후보 2개");
    submit.dispatch("click");
    assert.equal(submitCalls, 1);

    view.showResult(false, lesson);
    assert.equal(submit.hidden, false);
    assert.equal(next.hidden, true);
    view.showResult(true, lesson);
    assert.equal(submit.hidden, true);
    assert.equal(next.hidden, false);
    view.destroy();
});

test("T-E08-19: the practice shell has one visible page purpose before technique choices", () => {
    const root = fakeRoot();
    const shell = mountLearnShell(root, { onSelectTechnique() {} });
    const header = root.children[0];
    assert.equal(header.children[0].tagName, "h2");
    assert.equal(header.children[0].textContent, "풀이 연습");
    assert.equal(header.children[1].textContent, "기법별로 한 문제씩 풀어보세요.");
    assert.equal(header.children[2].tagName, "h3");
    shell.destroy();
});

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

test("T-E08-20: the public answerDigit path retries wrong placement answers and locks after correct", async () => {
    const { game, position, viewCalls } = harness("naked-single");
    await game.start("naked-single");
    assert.equal(typeof game.answerDigit, "function");

    const wrong = position.deduction.digit === 9 ? 1 : position.deduction.digit + 1;
    game.answerDigit(wrong);
    assert.equal(viewCalls.results.at(-1), false);

    game.answerDigit(position.deduction.digit);
    assert.equal(viewCalls.results.at(-1), true);
    const judgements = viewCalls.results.length;

    game.answerDigit(wrong);
    assert.equal(viewCalls.results.length, judgements, "a correct lesson ignores later input");
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
