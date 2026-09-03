// The learn page's logic with no DOM in sight: finding a position to ask about,
// judging an answer, and remembering what has been practised.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPositionSource, LearnSourceError } from "../../game/static/game/js/learn/position-source.js";
import { createLesson } from "../../game/static/game/js/learn/lesson.js";
import { createProgress } from "../../game/static/game/js/learn/progress.js";
import {
    ALL_TECHNIQUES, ELIMINATION_TECHNIQUES, findAll, findEliminations,
} from "../../game/static/game/js/rush/techniques.js";
import { generatePuzzle } from "../../functions/_lib/sudoku/generator.js";

function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// A source that hands out boards from a fixed list, then reports how many were
// taken -- which is how the "did it move on to the next board?" checks work
// without any network or timing.
function sourceOf(boards) {
    let taken = 0;
    return {
        take: async () => {
            if (taken >= boards.length) throw new Error("test source exhausted");
            return boards[taken++];
        },
        get taken() { return taken; },
    };
}

function boardAt(seed, givens = 50) {
    return generatePuzzle({ givens, rng: seeded(seed) });
}

// ------------------------------------------------------------ B-03

test("T-E03-01: the position it returns really does contain the technique", async () => {
    for (const technique of ALL_TECHNIQUES) {
        const source = createPositionSource({
            puzzleSource: sourceOf([boardAt(11), boardAt(22), boardAt(33)]),
            rng: seeded(7),
        });
        const { values, solution, deduction } = await source.take(technique);

        assert.equal(deduction.technique, technique);
        assert.equal(values.length, 81);
        assert.equal(solution.length, 81);

        // Re-derived from the returned board rather than trusted: the walk
        // mutates as it goes, and returning a deduction found one step earlier
        // would be the natural way to get this wrong.
        const find = ELIMINATION_TECHNIQUES.includes(technique) ? findEliminations : findAll;
        const available = find(values).filter((d) => d.technique === technique);
        assert.ok(available.length > 0, `${technique} is not available in the returned position`);
        assert.ok(
            available.some((d) => JSON.stringify(d) === JSON.stringify(deduction)),
            `${technique}: the returned deduction is not one of the position's own`,
        );
    }
});

test("T-E03-02: a board that never offers the technique is abandoned for the next", async () => {
    // A solved board can offer nothing at all, so the source must move past it.
    const { solution } = boardAt(5);
    const solved = { puzzle: solution, solution };
    const source = sourceOf([solved, solved, boardAt(41)]);
    const positions = createPositionSource({ puzzleSource: source, rng: seeded(3) });

    const { deduction } = await positions.take("naked-single");
    assert.equal(deduction.technique, "naked-single");
    assert.equal(source.taken, 3, "the two solved boards should both have been passed over");
});

test("T-E03-03: running out of boards is an explicit failure, not a hang", async () => {
    const { solution } = boardAt(9);
    const solved = { puzzle: solution, solution };
    const positions = createPositionSource({
        puzzleSource: sourceOf([solved, solved]),
        maxBoards: 2,
    });
    await assert.rejects(() => positions.take("hidden-pair"), (error) => {
        assert.ok(error instanceof LearnSourceError);
        assert.equal(error.cause, "exhausted");
        assert.equal(error.technique, "hidden-pair");
        return true;
    });
});

test("T-E03-04: a puzzle-source failure propagates untouched", async () => {
    const failure = new Error("network is down");
    const positions = createPositionSource({ puzzleSource: { take: async () => { throw failure; } } });
    await assert.rejects(() => positions.take("pointing"), (error) => error === failure);
});

test("T-E03-05: the constructor and take() reject nonsense", async () => {
    assert.throws(() => createPositionSource({}), TypeError);
    assert.throws(() => createPositionSource({ puzzleSource: {} }), TypeError);
    assert.throws(
        () => createPositionSource({ puzzleSource: sourceOf([]), maxBoards: 0 }),
        RangeError,
    );
    const positions = createPositionSource({ puzzleSource: sourceOf([boardAt(1)]) });
    await assert.rejects(() => positions.take("x-wing"), RangeError);
});

// ------------------------------------------------------------ B-04

const placement = () => ({
    kind: "placement", technique: "naked-single",
    index: 40, digit: 7, unit: null, units: [4],
});

const elimination = () => ({
    kind: "elimination", technique: "pointing", unit: 20, digits: [3],
    subject: [30, 31],
    eliminations: [{ index: 33, digit: 3 }, { index: 34, digit: 3 }],
    units: [3, 20],
});

test("T-E04-01/02/03: a placement is judged on its digit and stays answerable until right", () => {
    const lesson = createLesson(placement());
    assert.equal(lesson.state(), "asking");
    assert.equal(lesson.answer(4), "retry");
    assert.equal(lesson.state(), "retry");
    assert.equal(lesson.answer(7), "correct");
    assert.equal(lesson.state(), "correct");
    assert.throws(() => lesson.answer(7), /already answered/);
});

test("T-E04-04: judging never mutates the deduction it was handed", () => {
    const original = placement();
    const copy = structuredClone(original);
    const lesson = createLesson(original);
    lesson.answer(1);
    lesson.answer(7);
    assert.deepEqual(original, copy);
    assert.deepEqual(lesson.evidenceUnits(), [4]);
});

test("T-E04-05: an exact match is the only pass", () => {
    const lesson = createLesson(elimination());
    lesson.toggleMark(33, 3);
    lesson.toggleMark(34, 3);
    assert.equal(lesson.submit(), "correct");
});

test("T-E04-06: marking one candidate too many is wrong", () => {
    const lesson = createLesson(elimination());
    lesson.toggleMark(33, 3);
    lesson.toggleMark(34, 3);
    lesson.toggleMark(35, 3); // not part of the deduction
    assert.equal(lesson.submit(), "retry");
    assert.equal(lesson.state(), "retry");
});

test("T-E04-07/08: a partial or empty answer is wrong", () => {
    const partial = createLesson(elimination());
    partial.toggleMark(33, 3);
    assert.equal(partial.submit(), "retry");

    assert.equal(createLesson(elimination()).submit(), "retry");
});

test("T-E04-09: marks toggle off, and a retry does not stick", () => {
    const lesson = createLesson(elimination());
    lesson.toggleMark(33, 3);
    assert.equal(lesson.marked(33, 3), true);
    assert.equal(lesson.toggleMark(33, 3), false);
    assert.equal(lesson.marked(33, 3), false);
    assert.equal(lesson.marks().size, 0);

    lesson.toggleMark(35, 3);
    assert.equal(lesson.submit(), "retry");
    lesson.toggleMark(35, 3); // correcting the mistake clears the retry state
    assert.equal(lesson.state(), "asking");
});

test("T-E04-10: the wrong kind of answer throws instead of silently doing nothing", () => {
    const place = createLesson(placement());
    assert.throws(() => place.toggleMark(0, 1), /not valid for a placement/);
    assert.throws(() => place.submit(), /not valid for a placement/);

    const elim = createLesson(elimination());
    assert.throws(() => elim.answer(3), /not valid for an elimination/);
});

test("T-E04-11: out-of-range marks and malformed deductions are rejected", () => {
    const lesson = createLesson(elimination());
    assert.throws(() => lesson.toggleMark(81, 3), RangeError);
    assert.throws(() => lesson.toggleMark(0, 10), RangeError);
    assert.throws(() => createLesson({ kind: "nope" }), RangeError);
    assert.throws(() => createLesson({ ...placement(), units: [] }), RangeError);
});

// ------------------------------------------------------------ B-05

// Keyed, like the real thing. A single-value double would let a module that
// wrote to the wrong key pass a test it should fail.
function fakeStorage(initial = null) {
    const map = new Map();
    if (initial !== null) map.set("sudoku.learn.progress", initial);
    return {
        getItem: (key) => (map.has(key) ? map.get(key) : null),
        setItem: (key, next) => { map.set(key, String(next)); },
        removeItem: (key) => { map.delete(key); },
    };
}

test("T-E05-01: counts round-trip through storage", () => {
    const storage = fakeStorage();
    const first = createProgress(storage);
    first.record("pointing", true);
    first.record("pointing", false);
    first.record("naked-pair", true);

    const second = createProgress(storage);
    assert.deepEqual(second.all(), {
        pointing: { tried: 2, solved: 1 },
        "naked-pair": { tried: 1, solved: 1 },
    });
});

test("T-E05-02: no storage at all is a working page", () => {
    const progress = createProgress(null);
    progress.record("claiming", true);
    assert.deepEqual(progress.all(), { claiming: { tried: 1, solved: 1 } });
});

test("T-E05-03: corrupt or hostile stored values are discarded, not trusted", () => {
    for (const raw of [
        "not json",
        "[1,2,3]",
        "null",
        '{"pointing":"lots"}',
        '{"pointing":{"tried":-1,"solved":0}}',
        '{"pointing":{"tried":1.5,"solved":0}}',
        '{"pointing":{"tried":1,"solved":9}}', // more solved than tried
    ]) {
        assert.deepEqual(createProgress(fakeStorage(raw)).all(), {}, raw);
    }
});

test("T-E05-04: keys that are not techniques are ignored", () => {
    const progress = createProgress(fakeStorage(
        '{"x-wing":{"tried":3,"solved":3},"claiming":{"tried":2,"solved":1}}',
    ));
    assert.deepEqual(progress.all(), { claiming: { tried: 2, solved: 1 } });
    assert.throws(() => progress.record("x-wing", true), RangeError);
    assert.throws(() => progress.record("claiming", "yes"), TypeError);
});

test("T-E05-05: a storage that throws on read or write is survivable", () => {
    const hostile = {
        getItem() { throw new Error("denied"); },
        setItem() { throw new Error("quota"); },
    };
    const progress = createProgress(hostile);
    assert.deepEqual(progress.all(), {});
    progress.record("hidden-pair", true); // must not throw
    assert.deepEqual(progress.all(), { "hidden-pair": { tried: 1, solved: 1 } });
});

test("T-E05-06: all() hands out a copy, not the live counts", () => {
    const progress = createProgress(null);
    progress.record("pointing", true);
    const snapshot = progress.all();
    progress.record("pointing", true);
    assert.equal(snapshot.pointing.tried, 1, "an earlier read must not change under the caller");
});
