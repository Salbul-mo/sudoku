import { test } from "node:test";
import assert from "node:assert/strict";
import {
    createPuzzleSource, PuzzleSourceError,
} from "../../game/static/game/js/rush/puzzle-source.js";
import { generatePuzzle } from "../../functions/_lib/sudoku/generator.js";

const GIVENS = 50;

function validBody() {
    const { puzzle, solution } = generatePuzzle({ givens: GIVENS });
    return { puzzle: [...puzzle], solution: [...solution] };
}

// Records every call so a test can assert on ordering, which is the only way
// to prove a prefetch actually happened before it was needed.
function fakeFetch(responses) {
    const calls = [];
    const queue = [...responses];
    return {
        calls,
        fn: async (url) => {
            calls.push(url);
            const next = queue.length > 1 ? queue.shift() : queue[0];
            if (typeof next === "function") return next();
            return next;
        },
    };
}

const ok = (body = validBody()) => ({ ok: true, status: 200, json: async () => body });
const status = (code) => ({ ok: false, status: code, json: async () => ({ error: "x" }) });

const noDelay = { delay: async () => {} };

test("T-B03-01: the second board is already in hand when it is asked for", async () => {
    const fetch = fakeFetch([ok()]);
    const source = createPuzzleSource({ fetch: fetch.fn, givens: GIVENS, ...noDelay });

    await source.take();
    // take() primes the next board, so exactly one extra request has gone out
    // before anybody asks for it.
    await Promise.resolve();
    assert.equal(fetch.calls.length, 2, "the next board should already be in flight");

    const before = fetch.calls.length;
    const second = await source.take();
    assert.ok(second.puzzle instanceof Uint8Array);
    assert.equal(fetch.calls.length, before + 1, "taking the queued board costs no extra wait, only the next prime");
});

test("T-B03-01b: the request carries the requested clue count", async () => {
    const fetch = fakeFetch([ok()]);
    const source = createPuzzleSource({ fetch: fetch.fn, givens: 45, ...noDelay });
    await source.take();
    assert.match(fetch.calls[0], /\/api\/new-puzzle\?givens=45$/);
});

test("T-B03-02: a 5xx is retried once, then reported as a network failure", async () => {
    const fetch = fakeFetch([status(500), status(500), ok()]);
    const source = createPuzzleSource({ fetch: fetch.fn, givens: GIVENS, ...noDelay });
    await assert.rejects(() => source.take(), (e) => e instanceof PuzzleSourceError && e.cause === "network");
    assert.equal(fetch.calls.length, 2, "one retry, not more");
});

test("T-B03-02b: a 5xx that clears on the retry succeeds", async () => {
    const fetch = fakeFetch([status(503), ok()]);
    const source = createPuzzleSource({ fetch: fetch.fn, givens: GIVENS, ...noDelay });
    const board = await source.take();
    assert.equal(board.puzzle.length, 81);
});

test("T-B03-03: a 4xx is not retried -- asking again changes nothing", async () => {
    const fetch = fakeFetch([status(400)]);
    const source = createPuzzleSource({ fetch: fetch.fn, givens: GIVENS, ...noDelay });
    await assert.rejects(() => source.take(), (e) => e instanceof PuzzleSourceError && e.cause === "server");
    assert.equal(fetch.calls.length, 1);
});

test("T-B03-04: being offline fails immediately, without a request", async () => {
    const fetch = fakeFetch([ok()]);
    const source = createPuzzleSource({
        fetch: fetch.fn, givens: GIVENS, isOnline: () => false, ...noDelay,
    });
    await assert.rejects(() => source.take(), (e) => e instanceof PuzzleSourceError && e.cause === "offline");
    assert.equal(fetch.calls.length, 0);
});

test("T-B03-05: a body that is not a puzzle with its own solution is rejected", async () => {
    const good = validBody();
    const wrongDigit = { puzzle: [...good.puzzle], solution: [...good.solution] };
    const clue = wrongDigit.puzzle.findIndex((v) => v !== 0);
    wrongDigit.puzzle[clue] = (wrongDigit.solution[clue] % 9) + 1; // clue contradicts the solution

    const bodies = [
        {},
        { puzzle: [1, 2, 3], solution: good.solution },
        { puzzle: good.puzzle, solution: good.puzzle }, // solution still has holes
        wrongDigit,
    ];
    for (const body of bodies) {
        const fetch = fakeFetch([{ ok: true, status: 200, json: async () => body }]);
        const source = createPuzzleSource({ fetch: fetch.fn, givens: GIVENS, ...noDelay });
        await assert.rejects(
            () => source.take(),
            (e) => e instanceof PuzzleSourceError && e.cause === "server",
            JSON.stringify(body).slice(0, 40),
        );
    }
});

test("T-B03-06: a failed prefetch does not poison the next take", async () => {
    let call = 0;
    const fetch = fakeFetch([() => {
        call++;
        // First take succeeds; its prefetch (calls 2-3, with the retry) fails;
        // the next take must recover on its own.
        return call === 1 ? ok() : call <= 3 ? status(500) : ok();
    }]);
    const source = createPuzzleSource({ fetch: fetch.fn, givens: GIVENS, ...noDelay });

    await source.take();
    await new Promise((resolve) => setTimeout(resolve, 0)); // let the prefetch fail
    const board = await source.take();
    assert.equal(board.solution.length, 81);
});

test("T-B03-07: an out-of-range clue count is caught before any request", () => {
    const fetch = fakeFetch([ok()]);
    for (const givens of [0, 21, 61, 32.5, "40", undefined]) {
        assert.throws(() => createPuzzleSource({ fetch: fetch.fn, givens }), RangeError, String(givens));
    }
    assert.equal(fetch.calls.length, 0);
});

test("T-B03-07b: a missing fetch is a programming error, not a runtime surprise", () => {
    assert.throws(() => createPuzzleSource({ fetch: null, givens: GIVENS }), TypeError);
});

// A caller that takes one board and drops the source -- building a sheet of
// printable puzzles asks for a different clue count each time, so it needs a
// source each time -- must not be charged for a board it will never see.
test("T-B03-09: prefetch: false costs exactly one request per board", async () => {
    const eagerFetch = fakeFetch([ok()]);
    const eager = createPuzzleSource({ fetch: eagerFetch.fn, givens: GIVENS, ...noDelay });
    await eager.take();
    await Promise.resolve();
    assert.equal(eagerFetch.calls.length, 2, "the default primes the next board");

    const lazyFetch = fakeFetch([ok()]);
    const lazy = createPuzzleSource({
        fetch: lazyFetch.fn, givens: GIVENS, prefetch: false, ...noDelay,
    });
    await lazy.take();
    await Promise.resolve();
    assert.equal(lazyFetch.calls.length, 1, "prefetch: false must not prime anything");

    // Still usable more than once; it just fetches in the foreground each time.
    await lazy.take();
    assert.equal(lazyFetch.calls.length, 2);
});
