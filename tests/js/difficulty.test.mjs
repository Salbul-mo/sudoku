import { test } from "node:test";
import assert from "node:assert/strict";
import {
    DEFAULT_DIFFICULTY,
    DIFFICULTIES,
    DIFFICULTY_IDS,
    difficultyForGivens,
    difficultyForId,
    randomGivensForDifficulty,
} from "../../game/static/game/js/core/difficulty.js";

test("the five difficulty ranges cover 22..50 exactly once", () => {
    const covered = new Map();
    for (const difficulty of DIFFICULTIES) {
        assert.ok(Object.isFrozen(difficulty));
        for (let givens = difficulty.minGivens; givens <= difficulty.maxGivens; givens++) {
            covered.set(givens, (covered.get(givens) ?? 0) + 1);
        }
    }
    for (let givens = 22; givens <= 50; givens++) {
        assert.equal(covered.get(givens), 1, `givens=${givens}`);
    }
    assert.deepEqual(DIFFICULTY_IDS, ["beginner", "easy", "medium", "hard", "expert"]);
    assert.equal(DEFAULT_DIFFICULTY, "medium");
});

test("random selection includes both ends of every range", () => {
    for (const difficulty of DIFFICULTIES) {
        assert.equal(randomGivensForDifficulty(difficulty.id, () => 0), difficulty.minGivens);
        assert.equal(
            randomGivensForDifficulty(difficulty.id, () => 1 - Number.EPSILON),
            difficulty.maxGivens,
        );
    }
});

test("10,000 deterministic samples per difficulty stay inside their range", () => {
    for (const difficulty of DIFFICULTIES) {
        for (let i = 0; i < 10_000; i++) {
            const random = i / 10_000;
            const givens = randomGivensForDifficulty(difficulty.id, () => random);
            assert.ok(givens >= difficulty.minGivens && givens <= difficulty.maxGivens);
        }
    }
});

test("legacy clue counts map to the expected named difficulty", () => {
    for (const [givens, expected] of [[60, "beginner"], [45, "beginner"], [44, "easy"], [38, "easy"], [37, "medium"], [32, "medium"], [31, "hard"], [26, "hard"], [25, "expert"], [22, "expert"]]) {
        assert.equal(difficultyForGivens(givens).id, expected, `givens=${givens}`);
    }
});

test("invalid difficulty, clue count, or rng output is rejected", () => {
    assert.equal(difficultyForId("missing"), null);
    for (const givens of [21, 61, 22.5, "32", null]) {
        assert.throws(() => difficultyForGivens(givens), RangeError);
    }
    assert.throws(() => randomGivensForDifficulty("missing", () => 0), RangeError);
    assert.throws(() => randomGivensForDifficulty("medium", null), TypeError);
    for (const random of [-0.1, 1, NaN, Infinity, "0.5"]) {
        assert.throws(() => randomGivensForDifficulty("medium", () => random), RangeError);
    }
});
