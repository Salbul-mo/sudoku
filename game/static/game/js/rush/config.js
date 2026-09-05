// Every number that decides how the game feels, in one place, because these
// are the values that get changed after playing on a real phone rather than
// reasoned out from the code.
export const RUSH_MODES = Object.freeze([
    Object.freeze({ id: "beginner", limitMs: 20_000 }),
    Object.freeze({ id: "intermediate", limitMs: 15_000 }),
    Object.freeze({ id: "advanced", limitMs: 10_000 }),
    Object.freeze({ id: "challenge", limitMs: 7_000 }),
]);

// The existing rush mode started at ten seconds, so keep that behavior as the
// default until the player explicitly chooses another mode.
export const DEFAULT_RUSH_MODE = "advanced";

export function rushModeForId(id) {
    return RUSH_MODES.find((mode) => mode.id === id) ?? null;
}

export const RUSH = Object.freeze({
    LIVES: 3,

    // The selected mode supplies the opening limit. It then decays toward
    // FLOOR by DECAY per step, preserving the existing rush pacing.
    LIMIT_INITIAL_MS: 10000,
    LIMIT_FLOOR_MS: 4000,
    LIMIT_DECAY_MS: 120,

    // Measured, not guessed: below about 40 clues the engine starts having to
    // give cells away because no naked single exists (0.03 reveals per board at
    // 38, 1.85 at 32, 5.17 at 26). At 50 it never had to across 180 boards, and
    // a board lasts ~31 steps. Do not lower this past 40 without re-running
    // T-B01-02 -- the giveaways are what make a run feel unearned.
    BOARD_GIVENS: 50,

    // Score per correct cell is multiplied by the combo, capped so a long run
    // does not run away with the scoreboard. POINTS_PER_HIT remains the price
    // of a step whose technique is unknown; TECHNIQUE_POINTS below prices the
    // ones that are.
    POINTS_PER_HIT: 10,
    COMBO_CAP: 10,

    // Points by technique and by how many units the deduction had to scan --
    // the same two axes the time allowance uses. Integers, not multipliers,
    // because the stored best score is validated as an integer and a rounded
    // multiplier would make the table hard to reason about. Index = evidence
    // units - 1, clamped to the last entry.
    //
    // Rarity was tried as the basis and rejected: a hidden single with one
    // crosshatch line is rarer than a two-unit naked single but far easier, so
    // frequency is not a proxy for difficulty here.
    TECHNIQUE_POINTS: {
        "naked-single": [10, 13, 16],
        "hidden-single-box": [20, 25, 30, 35],
        "hidden-single-line": [30, 38, 45, 53, 60],
    },

    // Extra time for a harder deduction, on the same axes as the points. The
    // step limit still decays; this rides on top of it, so it matters most at
    // the floor -- where a run actually runs out of time. Measured effect at
    // the floor: 4.0s for a one-unit naked single, 8.9s for a three-unit
    // hidden single on a line.
    TIME_BONUS_MS: {
        "naked-single": 0,
        "hidden-single-box": 2000,
        "hidden-single-line": 3500,
    },
    EVIDENCE_TIME_BONUS_MS: 700,

    // How far the evidence may spread before a candidate is dropped. Three
    // units is the questioned unit plus two crosshatch lines; past that the
    // focus view opens to more than half the board and stops being a focus.
    // Verified: this cap never starves the engine (2,400 steps, 0 giveaways).
    MAX_EVIDENCE_UNITS: 3,

    // Below this many empty cells a board offers almost nothing but one-unit
    // naked singles -- measured 96-99% of them, worth the minimum score. The
    // swap is free there so a player is not taxed for leaving a spent board.
    FREE_SWAP_AT_EMPTIES: 12,

    // Which deductions may be asked for, and how much of the board is shown,
    // as the run goes on. A new technique arrives with the assist widened back
    // to "evidence" so it can be learned, then the assist tightens again.
    //
    // "the target cell's own row, column and box" is deliberately not an
    // assist level: measurement showed it hides the crosshatch every hidden
    // single depends on, which would make 100% of them unanswerable.
    TECHNIQUE_SCHEDULE: [
        { fromStep: 0, allow: ["naked-single"], assist: "evidence" },
        { fromStep: 6, allow: ["naked-single"], assist: "band" },
        { fromStep: 12, allow: ["naked-single", "hidden-single-box"], assist: "evidence" },
        { fromStep: 20, allow: ["naked-single", "hidden-single-box"], assist: "band" },
        { fromStep: 30, allow: ["naked-single", "hidden-single-box", "hidden-single-line"], assist: "band" },
        { fromStep: 45, allow: ["naked-single", "hidden-single-box", "hidden-single-line"], assist: "off" },
    ],
});

/**
 * What the run may ask for at this step, and how much it will show.
 *
 * The returned `allow` is a fresh array: the caller passes it straight into
 * the engine, and a shared array would let one call's bookkeeping edit the
 * schedule for every run afterwards.
 */
export function difficultyFor(step) {
    if (!Number.isInteger(step) || step < 0) {
        throw new RangeError(`step must be a non-negative integer, got ${step}`);
    }
    let row = RUSH.TECHNIQUE_SCHEDULE[0];
    for (const candidate of RUSH.TECHNIQUE_SCHEDULE) {
        if (step >= candidate.fromStep) row = candidate;
    }
    return { allow: [...row.allow], assist: row.assist };
}

/** Points for one correct cell, before the combo multiplier. */
export function pointsFor(technique, units = 1) {
    if (technique == null) return RUSH.POINTS_PER_HIT;
    const row = RUSH.TECHNIQUE_POINTS[technique];
    if (row === undefined) throw new RangeError(`unknown technique: ${technique}`);
    const rank = Number.isInteger(units) && units >= 1 ? units : 1;
    return row[Math.min(rank, row.length) - 1];
}

export const RUSH_STORAGE_KEY = "sudoku:v1:rush";
