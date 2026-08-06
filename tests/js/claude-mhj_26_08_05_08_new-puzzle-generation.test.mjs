import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequest, createPuzzleResponse, parseGivens } from "../../functions/api/new-puzzle.js";
import { hasUniqueSolution } from "../../functions/_lib/sudoku/claude-mhj_26_08_05_03_solver.js";
import { clueCount, GIVENS_MIN, GIVENS_MAX, GIVENS_DEFAULT } from "../../functions/_lib/sudoku/claude-mhj_26_08_05_04_generator.js";

const get = (query = "") =>
    onRequest({ request: new Request(`https://example.com/api/new-puzzle/${query}`, { method: "GET" }) });

test("GET returns a schema-valid, uniquely-solvable puzzle", async () => {
    const response = onRequest({ request: new Request("https://example.com/api/new-puzzle/", { method: "GET" }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.puzzle.length, 81);
    assert.equal(body.solution.length, 81);
    for (let i = 0; i < 81; i++) {
        if (body.puzzle[i]) assert.equal(body.puzzle[i], body.solution[i]);
    }
    assert.equal(hasUniqueSolution(body.puzzle), true);
});

test("two consecutive GET calls return different puzzles", async () => {
    const a = await onRequest({ request: new Request("https://example.com/api/new-puzzle/", { method: "GET" }) }).json();
    const b = await onRequest({ request: new Request("https://example.com/api/new-puzzle/", { method: "GET" }) }).json();
    assert.notDeepEqual(a.puzzle, b.puzzle);
});

test("GET response carries the expected cache/content-type headers", () => {
    const response = onRequest({ request: new Request("https://example.com/api/new-puzzle/", { method: "GET" }) });
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");
    assert.equal(response.headers.get("Pragma"), "no-cache");
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
});

test("POST is rejected with 405 and an Allow header", () => {
    const response = onRequest({ request: new Request("https://example.com/api/new-puzzle/", { method: "POST" }) });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("Allow"), "GET");
});

test("a generator failure is reported as 500 without throwing", async () => {
    const response = createPuzzleResponse(() => { throw new Error("boom"); });
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.error, "puzzle generation failed");
});

test("T-B02-01: ?givens= is honoured by the generated board", async () => {
    for (const givens of [26, GIVENS_DEFAULT, 40]) {
        const body = await get(`?givens=${givens}`).json();
        assert.equal(clueCount(body.puzzle), givens, `?givens=${givens}`);
        assert.equal(hasUniqueSolution(body.puzzle), true);
    }
});

test("T-B02-02: omitting the parameter keeps the previous default", async () => {
    const body = await get().json();
    assert.equal(clueCount(body.puzzle), GIVENS_DEFAULT);
});

test("T-B02-03: an unusable givens value is refused with 400, never silently clamped", async () => {
    const rejected = [
        String(GIVENS_MIN - 1), String(GIVENS_MAX + 1), "0", "99",
        "abc", "26.5", "+26", "-26", "%2026", "", "26abc",
    ];
    for (const raw of rejected) {
        const response = get(`?givens=${raw}`);
        assert.equal(response.status, 400, `?givens=${raw} was not refused`);
        assert.deepEqual(await response.json(), { error: "invalid givens" });
    }
});

test("T-B02-03b: parseGivens maps raw strings to a number or null", () => {
    assert.equal(parseGivens(null), GIVENS_DEFAULT);
    assert.equal(parseGivens(undefined), GIVENS_DEFAULT);
    assert.equal(parseGivens("26"), 26);
    assert.equal(parseGivens(String(GIVENS_MIN)), GIVENS_MIN);
    assert.equal(parseGivens(String(GIVENS_MAX)), GIVENS_MAX);
    for (const raw of ["21", "61", "26.0", " 26", "26 ", "abc", ""]) {
        assert.equal(parseGivens(raw), null, `parseGivens(${JSON.stringify(raw)})`);
    }
});

test("T-B02-04: a valid givens request keeps the established response contract", async () => {
    const response = get(`?givens=${GIVENS_MIN}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");
    const body = await response.json();
    assert.deepEqual(Object.keys(body), ["puzzle", "solution"]);
    assert.equal(body.puzzle.length, 81);
    assert.equal(body.solution.length, 81);
});
