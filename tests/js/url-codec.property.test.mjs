import { test } from "node:test";
import assert from "node:assert/strict";
import { encode, decode } from "../../game/static/game/js/url/codec.js";
import { project, checkInvariants } from "../../game/static/game/js/url/canonical.js";

// Deterministic PRNG (mulberry32) -- no external dependency, seed fixed so the
// same 1,000-state run is reproducible across machines and CI.
function mulberry32(seed) {
    let a = seed;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pick(list, rng) {
    return list[Math.floor(rng() * list.length)];
}

function randomValidGivens(rng) {
    // A guaranteed-contradiction-free givens layout: a full solved grid via
    // the standard base pattern, with a random subset erased to 0.
    function pattern(r, c) { return (3 * (r % 3) + Math.floor(r / 3) + c) % 9; }
    const full = Array.from({ length: 81 }, (_, i) => pattern((i / 9) | 0, i % 9) + 1);
    const keepCount = 20 + Math.floor(rng() * 40);
    const indices = Array.from({ length: 81 }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const keep = new Set(indices.slice(0, keepCount));
    return Uint8Array.from(full.map((v, i) => (keep.has(i) ? v : 0)));
}

function randomCandidateCount(rng, boundaryPool) {
    if (boundaryPool.length) return boundaryPool.pop();
    return Math.floor(rng() * 82);
}

function randomSession(rng, candidateBoundaries) {
    const givens = randomValidGivens(rng);
    const values = new Uint8Array(81);
    const candidates = new Uint16Array(81);
    const emptyCells = [];
    for (let i = 0; i < 81; i++) if (!givens[i]) emptyCells.push(i);

    const candidateCells = randomCandidateCount(rng, candidateBoundaries);
    for (let k = 0; k < Math.min(candidateCells, emptyCells.length); k++) {
        const i = emptyCells[k];
        let mask = 0;
        while (mask === 0) mask = Math.floor(rng() * 512);
        candidates[i] = mask;
    }

    return { givens, values, candidates };
}

test("1,000 seeded random states round-trip through encode/decode", async () => {
    const rng = mulberry32(0xc0ffee);
    const candidateBoundaries = [0, 1, 80, 81];
    let checked = 0;
    for (let i = 0; i < 1000; i++) {
        const scope = pick(["SC1", "SC2"], rng);
        const session = randomSession(rng, candidateBoundaries);
        const savedAt = Math.floor(rng() * 2 ** 31);
        const state = project(session, scope, savedAt);
        assert.equal(checkInvariants(state).ok, true, `generator produced an invalid state at i=${i}`);

        const link = await encode(session, scope, savedAt);
        const back = await decode(link);
        assert.equal(back.ok, true, `decode failed at i=${i}: ${JSON.stringify(back)}`);
        assert.deepEqual(Array.from(back.state.givens), Array.from(state.givens));
        if (state.values) assert.deepEqual(Array.from(back.state.values), Array.from(state.values));
        if (state.candidates) assert.deepEqual(Array.from(back.state.candidates), Array.from(state.candidates));
        assert.equal(back.state.savedAt, state.savedAt);

        // determinism: re-encoding the same input yields the same byte sequence
        const again = await encode(session, scope, savedAt);
        assert.equal(again, link);
        checked++;
    }
    assert.equal(checked, 1000);
});

test("decoding a near-maximal payload completes in under 100ms (V-UI-B05-07)", async () => {
    // Build a large legal SC2 payload: all 81 cells carrying a candidate mask.
    const rng = mulberry32(1);
    const session = randomSession(rng, [81]);
    const noCompression = { CompressionStream: undefined, DecompressionStream: undefined };
    const link = await encode(session, "SC2", Date.now(), noCompression);
    assert.ok(link.length > 0 && link.length <= 8000,
        `expected a large-but-legal payload, got ${link.length} chars`);

    const start = performance.now();
    const result = await decode(link, noCompression);
    const elapsed = performance.now() - start;
    assert.equal(result.ok, true);
    assert.ok(elapsed < 100, `decode took ${elapsed}ms`);
});
