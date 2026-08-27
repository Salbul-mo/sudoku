import { test } from "node:test";
import assert from "node:assert/strict";
import { createClock, limitFor } from "../../game/static/game/js/rush/clock.js";
import { createScore } from "../../game/static/game/js/rush/score.js";
import { RUSH, RUSH_STORAGE_KEY, difficultyFor, pointsFor } from "../../game/static/game/js/rush/config.js";

// A clock the test drives by hand, so timing assertions are exact instead of
// racing a real timer.
function fakeTime() {
    let t = 0;
    let seq = 0;
    const timers = new Map();
    return {
        expired: 0,
        now: () => t,
        setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: t + ms }); return id; },
        clearTimeout: (id) => { timers.delete(id); },
        advance(ms) {
            t += ms;
            for (const [id, timer] of [...timers]) {
                if (timer.at <= t) { timers.delete(id); timer.fn(); }
            }
        },
        get pending() { return timers.size; },
    };
}

function memoryStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, v),
        get size() { return map.size; },
        raw: map,
    };
}

test("T-B02-01: the step limit decays to the floor and never below it", () => {
    assert.equal(limitFor(0), RUSH.LIMIT_INITIAL_MS);
    const stepsToFloor = (RUSH.LIMIT_INITIAL_MS - RUSH.LIMIT_FLOOR_MS) / RUSH.LIMIT_DECAY_MS;
    assert.equal(limitFor(stepsToFloor), RUSH.LIMIT_FLOOR_MS);
    for (let step = 0; step <= 500; step++) {
        assert.ok(limitFor(step) >= RUSH.LIMIT_FLOOR_MS, `step ${step}`);
    }
    assert.throws(() => limitFor(-1), RangeError);
    assert.throws(() => limitFor(1.5), RangeError);
});

test("T-B02-02: pausing preserves the remaining time instead of burning a life", () => {
    const time = fakeTime();
    let expired = 0;
    const clock = createClock({ ...time, onExpire: () => { expired++; } });

    clock.start(5000);
    time.advance(2000);
    assert.equal(clock.remaining(), 3000);

    clock.pause();
    time.advance(60_000); // the tab was backgrounded for a minute
    assert.equal(expired, 0, "a paused clock must not expire");
    assert.equal(clock.remaining(), 3000);

    clock.resume();
    time.advance(2999);
    assert.equal(expired, 0);
    time.advance(1);
    assert.equal(expired, 1);
});

test("T-B02-02b: stop cancels, and resume without a pause does nothing", () => {
    const time = fakeTime();
    let expired = 0;
    const clock = createClock({ ...time, onExpire: () => { expired++; } });
    clock.start(1000);
    clock.stop();
    time.advance(5000);
    assert.equal(expired, 0);
    assert.equal(clock.remaining(), 0);
    clock.resume();
    assert.equal(time.pending, 0);
});

test("T-B02-02c: createClock rejects a missing time source", () => {
    assert.throws(() => createClock({}), TypeError);
    assert.throws(() => createClock({ now: () => 0, setTimeout, clearTimeout }), TypeError);
});

test("T-B02-03: hits build a combo, misses reset it and cost a life", () => {
    const score = createScore({ storage: memoryStorage() });
    assert.equal(score.state().lives, RUSH.LIVES);

    score.hit();
    score.hit();
    const after = score.state();
    assert.equal(after.combo, 2);
    assert.equal(after.score, RUSH.POINTS_PER_HIT * 1 + RUSH.POINTS_PER_HIT * 2);
    assert.equal(after.step, 2);

    const missed = score.miss();
    assert.equal(missed.combo, 0);
    assert.equal(missed.lives, RUSH.LIVES - 1);
    assert.equal(missed.bestCombo, 2, "the best combo survives a miss");

    score.miss();
    const dead = score.miss();
    assert.equal(dead.lives, 0);
    assert.equal(dead.over, true);
    assert.equal(score.miss().lives, 0, "lives never go negative");
});

test("T-B02-03b: the combo multiplier is capped", () => {
    const score = createScore({ storage: memoryStorage() });
    for (let i = 0; i < RUSH.COMBO_CAP + 5; i++) score.hit();
    const perHit = RUSH.POINTS_PER_HIT * RUSH.COMBO_CAP;
    // The last five hits were all at the cap.
    const capped = score.state().score;
    score.hit();
    assert.equal(score.state().score - capped, perHit);
});

test("T-B02-04: a best score round-trips, and a worse run does not overwrite it", () => {
    const storage = memoryStorage();
    const first = createScore({ storage });
    for (let i = 0; i < 5; i++) first.hit();
    const earned = first.state().score;
    first.commit();

    const reloaded = createScore({ storage });
    assert.equal(reloaded.state().best.bestScore, earned);
    assert.equal(reloaded.state().persisted, true);

    reloaded.hit(); // a single hit is worth less than five
    reloaded.commit();
    assert.equal(createScore({ storage }).state().best.bestScore, earned);
});

test("T-B02-05: a storage that throws still lets the game be played", () => {
    const hostile = {
        getItem() { throw new Error("blocked"); },
        setItem() { throw new Error("blocked"); },
    };
    const score = createScore({ storage: hostile });
    assert.equal(score.state().persisted, false);
    assert.equal(score.state().best.bestScore, 0);
    score.hit();
    assert.doesNotThrow(() => score.commit());
    assert.equal(score.state().score, RUSH.POINTS_PER_HIT);
});

test("T-B02-05b: an absent storage is handled like a hostile one", () => {
    const score = createScore({ storage: null });
    assert.equal(score.state().persisted, false);
    assert.doesNotThrow(() => score.commit());
});

test("T-B02-06: a corrupt saved best falls back to zero rather than throwing", () => {
    for (const junk of ["not json", "null", '{"bestScore":-4}', '{"bestScore":"nine"}', "[]"]) {
        const score = createScore({ storage: memoryStorage({ [RUSH_STORAGE_KEY]: junk }) });
        assert.equal(score.state().best.bestScore, 0, junk);
        assert.equal(score.state().persisted, true, junk);
    }
});

test("T-B02-07: reset returns a fresh run without touching the stored best", () => {
    const storage = memoryStorage();
    const score = createScore({ storage });
    for (let i = 0; i < 3; i++) score.hit();
    score.miss();
    score.commit();
    const best = score.state().best.bestScore;

    const fresh = score.reset();
    assert.equal(fresh.score, 0);
    assert.equal(fresh.combo, 0);
    assert.equal(fresh.lives, RUSH.LIVES);
    assert.equal(fresh.step, 0);
    assert.equal(fresh.best.bestScore, best);
});

test("T-B03-05: limitFor called with a step alone is unchanged by the difficulty axes", () => {
    for (let step = 0; step <= 120; step++) {
        const base = Math.max(RUSH.LIMIT_FLOOR_MS, RUSH.LIMIT_INITIAL_MS - step * RUSH.LIMIT_DECAY_MS);
        assert.equal(limitFor(step), base);
        assert.equal(limitFor(step, null), base, "an unknown technique scores and times as it always did");
    }
});

test("T-B03-06: a harder deduction gets more time, and more evidence gets more still", () => {
    // Non-strict in general: early on the cap saturates and two difficulties
    // can share the opening limit, which is fine -- ten seconds is already
    // enough for either.
    for (let step = 0; step <= 120; step++) {
        const naked = limitFor(step, "naked-single", 1);
        const box = limitFor(step, "hidden-single-box", 1);
        const line = limitFor(step, "hidden-single-line", 1);
        assert.ok(naked <= box && box <= line, `ordering broken at step ${step}`);
        assert.ok(limitFor(step, "hidden-single-line", 2) <= limitFor(step, "hidden-single-line", 3));
    }
    // Strict where it matters: at the floor, which is where a run runs out of
    // time in the first place.
    const floorStep = 120;
    assert.ok(limitFor(floorStep, "naked-single", 1) < limitFor(floorStep, "hidden-single-box", 1));
    assert.ok(limitFor(floorStep, "hidden-single-box", 1) < limitFor(floorStep, "hidden-single-line", 1));
    assert.ok(limitFor(floorStep, "hidden-single-line", 2) < limitFor(floorStep, "hidden-single-line", 3));
    assert.ok(
        limitFor(floorStep, "hidden-single-line", 3) - limitFor(floorStep, "naked-single", 1) >= 3000,
        "the hardest deduction should get seconds more, not milliseconds",
    );
    assert.throws(() => limitFor(0, "x-wing", 1), RangeError);
});

test("T-B03-07: no step is more generous than the run's first, and none is below the floor", () => {
    const opening = limitFor(0);
    for (let step = 0; step <= 120; step++) {
        for (const technique of ["naked-single", "hidden-single-box", "hidden-single-line"]) {
            for (let units = 1; units <= 5; units++) {
                const limit = limitFor(step, technique, units);
                assert.ok(limit >= RUSH.LIMIT_FLOOR_MS, `below floor at step ${step}`);
                // Without this cap, unlocking a technique hands the player
                // more time than the run started with, and the run gets easier
                // as it goes.
                assert.ok(limit <= opening, `step ${step} ${technique} u${units} beats the opening`);
            }
        }
    }
});

test("T-B03-08: the schedule is ordered, never withdraws a technique, and hands out copies", () => {
    let previousStep = -1;
    let previousAllow = [];
    for (const row of RUSH.TECHNIQUE_SCHEDULE) {
        assert.ok(row.fromStep > previousStep, `fromStep out of order at ${row.fromStep}`);
        for (const technique of previousAllow) {
            assert.ok(row.allow.includes(technique), `${technique} withdrawn at step ${row.fromStep}`);
        }
        previousStep = row.fromStep;
        previousAllow = row.allow;
    }
    assert.throws(() => difficultyFor(-1), RangeError);
    assert.throws(() => difficultyFor(1.5), RangeError);

    const first = difficultyFor(0);
    first.allow.push("x-wing");
    assert.deepEqual(difficultyFor(0).allow, ["naked-single"], "the schedule must not be editable through its callers");
});

test("T-B02-05: a cell is priced by its technique and by how far its evidence spread", () => {
    const score = createScore({ storage: null });
    score.hit("naked-single", 1);
    assert.equal(score.state().score, pointsFor("naked-single", 1), "combo 1 on the first hit");

    const second = score.hit("hidden-single-line", 3);
    assert.equal(second.score, pointsFor("naked-single", 1) + pointsFor("hidden-single-line", 3) * 2);
    assert.ok(pointsFor("hidden-single-line", 3) > pointsFor("hidden-single-box", 3));
    assert.ok(pointsFor("hidden-single-box", 3) > pointsFor("hidden-single-box", 1));
    // Past the end of the table the last price stands rather than throwing:
    // a rare six-unit deduction is worth the most, not nothing.
    assert.equal(pointsFor("naked-single", 9), pointsFor("naked-single", 3));
    assert.throws(() => pointsFor("x-wing", 1), RangeError);
});

test("T-B02-06: hit() with no arguments scores what it always scored", () => {
    const score = createScore({ storage: null });
    score.hit();
    score.hit();
    assert.equal(score.state().score, RUSH.POINTS_PER_HIT * 1 + RUSH.POINTS_PER_HIT * 2);
});

test("T-B09-06: breaking the combo costs the combo and nothing else", () => {
    const score = createScore({ storage: null });
    score.hit("hidden-single-box", 2);
    score.hit("hidden-single-box", 2);
    const before = score.state();

    const after = score.breakCombo();
    assert.equal(after.combo, 0);
    assert.equal(after.score, before.score, "points already earned stay earned");
    assert.equal(after.lives, before.lives, "a swap is not a mistake");
    assert.equal(after.step, before.step, "and it is not a step either");
    assert.equal(after.bestCombo, before.bestCombo, "the best combo of the run is history, not state");
});
