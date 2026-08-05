import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequest, createPuzzleResponse } from "../../functions/api/new-puzzle.js";
import { hasUniqueSolution } from "../../functions/_lib/sudoku/claude-mhj_26_08_05_03_solver.js";

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
