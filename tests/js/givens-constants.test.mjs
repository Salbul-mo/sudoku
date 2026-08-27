import { test } from "node:test";
import assert from "node:assert/strict";
import * as worker from "../../functions/_lib/sudoku/generator.js";
import * as frontend from "../../game/static/game/js/core/givens.js";

// The clue range is stated twice -- once in the Worker's generator, once in a
// front-end module -- because Pages serves `game/static/` to the browser but
// never `functions/`, so the page has no way to import the Worker's copy. The
// duplication is forced; the drift it invites is not, and this file is what
// stops it. Node can reach both files even though a browser cannot.
test("T-B03-05: the front end and the Worker agree on the clue range", () => {
    assert.equal(frontend.GIVENS_MIN, worker.GIVENS_MIN);
    assert.equal(frontend.GIVENS_MAX, worker.GIVENS_MAX);
    assert.equal(frontend.GIVENS_DEFAULT, worker.GIVENS_DEFAULT);
});

test("T-B03-06: every offered preset is a count the API will accept", () => {
    assert.ok(frontend.GIVENS_PRESETS.length > 0);
    for (const preset of frontend.GIVENS_PRESETS) {
        assert.ok(Number.isInteger(preset), `${preset} is not an integer`);
        assert.ok(
            preset >= worker.GIVENS_MIN && preset <= worker.GIVENS_MAX,
            `preset ${preset} is outside ${worker.GIVENS_MIN}..${worker.GIVENS_MAX}`
        );
    }
});

test("the default clue count is itself one of the presets", () => {
    // Otherwise the dialog would open with nothing marked as the current
    // choice on a first run.
    assert.ok(frontend.GIVENS_PRESETS.includes(frontend.GIVENS_DEFAULT));
});
