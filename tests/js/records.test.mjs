// The play timer, the personal-best store, and the card built from them.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeDocument } from "./helpers/fake-dom.mjs";
import { createPlayTimer, formatDuration } from "../../game/static/game/js/state/play-timer.js";
import { createRecords } from "../../game/static/game/js/state/records.js";

// A clock the test moves by hand, so none of this depends on wall time.
function fakeClock(start = 0) {
    let now = start;
    return { now: () => now, advance: (ms) => { now += ms; } };
}

function fakeStorage(initial = null) {
    let value = initial;
    return { getItem: () => value, setItem: (_k, v) => { value = v; } };
}

// ------------------------------------------------------------ play timer

test("T-C01-01: only running time is accumulated", () => {
    const clock = fakeClock();
    const timer = createPlayTimer(0, clock.now);

    clock.advance(5000);            // before start: not played
    assert.equal(timer.elapsed(), 0);

    timer.start();
    clock.advance(3000);
    assert.equal(timer.elapsed(), 3000);

    timer.stop();
    clock.advance(60_000);          // the tab was hidden for a minute
    assert.equal(timer.elapsed(), 3000, "a hidden tab must not accumulate time");

    timer.start();
    clock.advance(2000);
    assert.equal(timer.elapsed(), 5000);
});

test("T-C01-02: a timer resumes from a stored total", () => {
    const clock = fakeClock();
    const timer = createPlayTimer(90_000, clock.now);
    assert.equal(timer.elapsed(), 90_000);
    timer.start();
    clock.advance(1000);
    assert.equal(timer.elapsed(), 91_000);
});

// An NTP correction or a manual clock change can step time backwards, and a
// total that is only ever supposed to grow must not shrink.
test("T-C01-03: a clock that steps backwards never subtracts time", () => {
    let now = 10_000;
    const timer = createPlayTimer(0, () => now);
    timer.start();
    now = 4000;
    assert.equal(timer.elapsed(), 0);
    timer.stop();
    assert.equal(timer.elapsed(), 0);
});

test("T-C01-04: start is idempotent and stop before start is harmless", () => {
    const clock = fakeClock();
    const timer = createPlayTimer(0, clock.now);
    timer.stop(); // never started
    timer.start();
    clock.advance(1000);
    timer.start(); // must not reset the running stretch
    clock.advance(1000);
    assert.equal(timer.elapsed(), 2000);
    assert.equal(timer.running, true);
});

test("T-C01-05: durations read as m:ss, and h:mm:ss past an hour", () => {
    assert.equal(formatDuration(0), "0:00");
    assert.equal(formatDuration(9000), "0:09");
    assert.equal(formatDuration(61_000), "1:01");
    assert.equal(formatDuration(599_000), "9:59");
    assert.equal(formatDuration(3_600_000), "1:00:00");
    assert.equal(formatDuration(3_661_000), "1:01:01");
    assert.throws(() => formatDuration(-1), RangeError);
    assert.throws(() => createPlayTimer(-1), RangeError);
});

// ------------------------------------------------------------ records

test("T-C02-01: a first solve sets the best, and a slower one does not beat it", () => {
    const records = createRecords(fakeStorage());
    let out = records.record("medium", 120_000);
    assert.deepEqual(out, { isBest: true, bestMs: 120_000, solved: 1 });

    out = records.record("medium", 200_000);
    assert.deepEqual(out, { isBest: false, bestMs: 120_000, solved: 2 });

    out = records.record("medium", 90_000);
    assert.deepEqual(out, { isBest: true, bestMs: 90_000, solved: 3 });
});

test("T-C02-02: difficulties keep separate records", () => {
    const records = createRecords(fakeStorage());
    records.record("easy", 60_000);
    records.record("expert", 600_000);
    assert.deepEqual(records.get("easy"), { solved: 1, bestMs: 60_000 });
    assert.deepEqual(records.get("expert"), { solved: 1, bestMs: 600_000 });
    assert.deepEqual(records.get("hard"), { solved: 0, bestMs: null });
});

// A save written before the timer existed reports zero. Letting that count as
// a best would put an unbeatable record on the board.
test("T-C02-03: an untimed solve counts as a completion but never as a best", () => {
    const records = createRecords(fakeStorage());
    const out = records.record("hard", 0);
    assert.deepEqual(out, { isBest: false, bestMs: null, solved: 1 });

    const timed = records.record("hard", 300_000);
    assert.deepEqual(timed, { isBest: true, bestMs: 300_000, solved: 2 });
});

test("T-C02-04: records round-trip through storage", () => {
    const storage = fakeStorage();
    createRecords(storage).record("beginner", 45_000);
    assert.deepEqual(createRecords(storage).get("beginner"), { solved: 1, bestMs: 45_000 });
});

test("T-C02-05: corrupt or hostile stored values are discarded", () => {
    for (const raw of [
        "not json", "[]", "null",
        '{"medium":"fast"}',
        '{"medium":{"solved":-1}}',
        '{"medium":{"solved":1,"bestMs":-5}}',
        '{"medium":{"solved":1,"bestMs":0}}',
    ]) {
        assert.deepEqual(createRecords(fakeStorage(raw)).all(), {}, raw);
    }
    // A difficulty that is not one of ours is ignored, and the valid sibling
    // beside it still loads.
    assert.deepEqual(
        createRecords(fakeStorage('{"x":{"solved":9},"easy":{"solved":2,"bestMs":10}}')).all(),
        { easy: { solved: 2, bestMs: 10 } },
    );
});

test("T-C02-06: a storage that throws is survivable, and unknown ids are rejected", () => {
    const hostile = {
        getItem() { throw new Error("denied"); },
        setItem() { throw new Error("quota"); },
    };
    const records = createRecords(hostile);
    assert.deepEqual(records.all(), {});
    records.record("easy", 1000); // must not throw
    assert.deepEqual(records.get("easy"), { solved: 1, bestMs: 1000 });

    assert.throws(() => records.record("impossible", 1), RangeError);
    assert.throws(() => records.get("impossible"), RangeError);
});

test("T-C02-07: all() and get() hand out copies", () => {
    const records = createRecords(null);
    records.record("easy", 5000);
    const snapshot = records.all();
    records.record("easy", 4000);
    assert.equal(snapshot.easy.bestMs, 5000);
    assert.equal(snapshot.easy.solved, 1);
});

// ------------------------------------------------------------ the card

const uninstall = installFakeDocument();
const { buildCompletionBody } =
    await import("../../game/static/game/js/ui/completion-card.js");
after(uninstall);

const textOf = (node) => {
    let out = node.textContent ?? "";
    for (const child of node.children ?? []) out += " " + textOf(child);
    return out;
};

test("T-C03-01: the card reports difficulty, time, mistakes and the best", () => {
    const body = buildCompletionBody({
        difficulty: "medium", elapsedMs: 754_000, mistakes: 2,
        bestMs: 581_000, isBest: false, solved: 17, persisted: true,
    });
    const text = textOf(body);
    assert.match(text, /보통/);
    assert.match(text, /12:34/, "754s is 12:34");
    assert.match(text, /9:41/, "the standing best");
    assert.match(text, /17/);
    assert.match(text, /2/);
});

test("T-C03-02: a new best says so in words, not only in colour", () => {
    const body = buildCompletionBody({
        difficulty: "easy", elapsedMs: 60_000, mistakes: 0,
        bestMs: 60_000, isBest: true, solved: 1, persisted: true,
    });
    assert.match(textOf(body), /최고 기록 경신/);
    const best = body.children.find((c) => c.className.includes("completion-row-best"));
    assert.ok(best, "the changed row is marked");
});

// A restored save reports zero. "0:00" would claim an instant solve.
test("T-C03-03: an unmeasured solve says so rather than showing 0:00", () => {
    const body = buildCompletionBody({
        difficulty: "hard", elapsedMs: 0, mistakes: 0,
        bestMs: null, isBest: false, solved: 1, persisted: true,
    });
    const text = textOf(body);
    assert.doesNotMatch(text, /0:00/);
    assert.match(text, /기록 없음/);
});

test("T-C03-04: a browser that cannot store says so instead of showing a best", () => {
    const body = buildCompletionBody({
        difficulty: "expert", elapsedMs: 1000, mistakes: 3,
        bestMs: null, isBest: false, solved: 0, persisted: false,
    });
    const text = textOf(body);
    assert.match(text, /기록이 저장되지 않습니다/);
    assert.ok(!body.children.some((c) => c.className.includes("completion-row-best")));
});
