// Every number that decides how the game feels, in one place, because these
// are the values that get changed after playing on a real phone rather than
// reasoned out from the code.
export const RUSH = Object.freeze({
    LIVES: 3,

    // The step limit decays from INITIAL toward FLOOR, DECAY per step. At 100ms
    // a step the floor arrives at step 32 -- about when the first board runs
    // out, so the difficulty curve and the board change land together.
    LIMIT_INITIAL_MS: 5000,
    LIMIT_FLOOR_MS: 1800,
    LIMIT_DECAY_MS: 100,

    // Measured, not guessed: below about 40 clues the engine starts having to
    // give cells away because no naked single exists (0.03 reveals per board at
    // 38, 1.85 at 32, 5.17 at 26). At 50 it never had to across 180 boards, and
    // a board lasts ~31 steps. Do not lower this past 40 without re-running
    // T-B01-02 -- the giveaways are what make a run feel unearned.
    BOARD_GIVENS: 50,

    // Score per correct cell is multiplied by the combo, capped so a long run
    // does not run away with the scoreboard.
    POINTS_PER_HIT: 10,
    COMBO_CAP: 10,
});

export const RUSH_STORAGE_KEY = "sudoku:v1:rush";
