// How many clues a new puzzle may be asked for, plus the counts the new-game
// dialog offers.
//
// These values are a deliberate copy of the ones in
// functions/_lib/sudoku/generator.js, and they have to
// be: `functions/` is Worker code that Pages never serves to the browser, so
// the front end cannot import from it. A copy can drift, so
// tests/js/givens-constants.test.mjs imports both
// modules and asserts they still agree.
//
// See the generator's own comment for why the range is 22..60 -- both bounds
// come from measuring what the digger can actually reach, not from taste.
export const GIVENS_MIN = 22;
export const GIVENS_MAX = 60;
export const GIVENS_DEFAULT = 32;

// The dialog's buttons. A subset of the range rather than all 39 values: this
// is a touch target list, not a spinner. GIVENS_MAX is left off deliberately
// -- a 60-clue board is barely a puzzle, so it stays reachable through the
// API without being offered as a one-tap choice.
export const GIVENS_PRESETS = Object.freeze([22, 26, 32, 40, 50]);
