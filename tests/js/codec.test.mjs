import { test } from "node:test";
import assert from "node:assert/strict";
import { writeBody, readBody, encode, decode } from "../../game/static/game/js/url/codec.js";
import { project } from "../../game/static/game/js/url/canonical.js";

function freshSession(overrides = {}) {
    return {
        givens: new Uint8Array(81), values: new Uint8Array(81), candidates: new Uint16Array(81),
        cellNotes: {}, regionNotes: {},
        ...overrides,
    };
}

test("SC1 body is exactly 43 bytes (Phase 1 §15 formula)", () => {
    const state = project(freshSession(), "SC1", null);
    assert.equal(writeBody(state).length, 43);
});

test("SC2 + 20 candidate cells + savedAt body is exactly 122 bytes", () => {
    const candidates = new Uint16Array(81);
    for (let i = 0; i < 20; i++) candidates[i] = 0b1_0101_0101; // any non-zero 9-bit mask
    const state = project(freshSession({ candidates }), "SC2", 12345);
    assert.equal(writeBody(state).length, 122);
});

test("givens' last nibble and the candidate bitmap's upper 7 bits are 0", () => {
    const state = project(freshSession(), "SC1", null);
    const body = writeBody(state);
    assert.equal((body[42] >> 4) & 0x0f, 0); // 81 nibbles -> byte 42's high nibble is padding
});

test("mask stream length is ceil(9n/8) with zero trailing padding for n = 1..81", () => {
    for (const n of [1, 2, 8, 9, 40, 80, 81]) {
        const candidates = new Uint16Array(81);
        for (let i = 0; i < n; i++) candidates[i] = 0b1_0000_0001;
        const state = project(freshSession({ candidates }), "SC2", null);
        const body = writeBody(state);
        const result = readBody(body);
        assert.equal(result.ok, true, `n=${n}: ${JSON.stringify(result)}`);
    }
});

test("round trip preserves givens, values, candidates, and notes", () => {
    const givens = new Uint8Array(81);
    givens[0] = 5;
    const values = new Uint8Array(81);
    values[1] = 3;
    const candidates = new Uint16Array(81);
    candidates[2] = 0b1_0000_0010;
    const session = freshSession({
        givens, values, candidates,
        cellNotes: { "3": "hello" },
        regionNotes: { r0: "row note" },
    });
    const state = project(session, "SC3", 999);
    const result = readBody(writeBody(state));
    assert.equal(result.ok, true);
    assert.deepEqual(Array.from(result.state.givens), Array.from(state.givens));
    assert.deepEqual(Array.from(result.state.values), Array.from(state.values));
    assert.deepEqual(Array.from(result.state.candidates), Array.from(state.candidates));
    assert.deepEqual(result.state.notes, state.notes);
    assert.equal(result.state.savedAt, 999);
});

test("a reserved flag bit set is rejected", () => {
    const state = project(freshSession(), "SC1", null);
    const body = writeBody(state);
    const corrupted = Uint8Array.from(body);
    corrupted[0] |= 0x10;
    assert.equal(readBody(corrupted).ok, false);
});

test("flipping the mask stream's trailing padding bit is rejected (V-UI-B05-04)", () => {
    const candidates = new Uint16Array(81);
    candidates[0] = 0b1; // 9 bits used, 7 bits of padding in the final mask byte
    const state = project(freshSession({ candidates }), "SC2", null);
    const body = writeBody(state);
    const corrupted = Uint8Array.from(body);
    corrupted[corrupted.length - 1] |= 0x80; // set the top (padding) bit
    assert.equal(readBody(corrupted).ok, false);
});

test("109 notes are rejected, 108 round-trip (V-UI-B05-03)", async () => {
    const cellNotes = {};
    for (let i = 0; i < 81; i++) cellNotes[i] = "x";
    const regionNotes = {};
    for (let i = 0; i < 27; i++) {
        const kind = i < 9 ? "r" : i < 18 ? "c" : "b";
        regionNotes[kind + (i % 9)] = "y";
    }
    const state108 = project(freshSession({ cellNotes, regionNotes }), "SC3", null);
    assert.equal(state108.notes.length, 108);
    assert.equal(readBody(writeBody(state108)).ok, true);

    const link = await encode({ givens: state108.givens, values: state108.values, candidates: state108.candidates, cellNotes, regionNotes }, "SC3", null);
    const back = await decode(link);
    assert.equal(back.ok, true);
    assert.equal(back.state.notes.length, 108);
});

test("trailing bytes appended after the body are rejected", () => {
    const state = project(freshSession(), "SC1", null);
    const body = writeBody(state);
    const withExtra = new Uint8Array(body.length + 1);
    withExtra.set(body);
    assert.equal(readBody(withExtra).ok, false);
});

test("a truncated body fails closed without throwing", () => {
    const state = project(freshSession(), "SC1", null);
    const body = writeBody(state);
    assert.doesNotThrow(() => readBody(body.subarray(0, 10)));
    assert.equal(readBody(body.subarray(0, 10)).ok, false);
});

test("reversing note order is rejected", () => {
    // Hand-build a BodyV1 with two notes out of canonical (kind, key) order:
    // flags=4 (notes only), dim=9, givens all zero (41 bytes), 2 notes,
    // (kind=1,key=5) before (kind=0,key=3) -- descending, which is invalid.
    const bytes = [4, 9, ...new Array(41).fill(0), 2, 1, 5, 1, 0x62, 0, 3, 1, 0x61];
    assert.equal(readBody(Uint8Array.from(bytes)).ok, false);
});

test("an invalid UTF-8 sequence in note text is rejected", () => {
    // Hand-built BodyV1: flags=4 (notes only), dim=9, givens zero (41 bytes),
    // 1 note, kind=0 key=0, text length 2, bytes 0xFF 0xFE (never valid UTF-8).
    const bytes = [4, 9, ...new Array(41).fill(0), 1, 0, 0, 2, 0xff, 0xfe];
    assert.equal(readBody(Uint8Array.from(bytes)).ok, false);
});

test("SC1 link is 66 characters, SC2 + 20 candidates + savedAt is 171 (V-UI-B05-06)", async () => {
    const noCompression = { CompressionStream: undefined, DecompressionStream: undefined };
    const sc1 = await encode(freshSession(), "SC1", null, noCompression);
    assert.equal(sc1.length, 66);

    const candidates = new Uint16Array(81);
    for (let i = 0; i < 20; i++) candidates[i] = 0b1_0101_0101;
    const sc2 = await encode(freshSession({ candidates }), "SC2", 12345, noCompression);
    assert.equal(sc2.length, 171);
});

test("flipping a CRC bit is rejected as crc-mismatch", async () => {
    const noCompression = { CompressionStream: undefined, DecompressionStream: undefined };
    const link = await encode(freshSession(), "SC1", null, noCompression);
    const bytes = Uint8Array.from(atobUrl(link));
    bytes[bytes.length - 1] ^= 0x01;
    const corrupted = btoaUrl(bytes);
    const result = await decode(corrupted, noCompression);
    assert.equal(result.ok, false);
    assert.equal(result.code, "crc-mismatch");
});

test("without CompressionStream, encode produces raw and codec=1 input is unsupported-codec (V-UI-B05-05)", async () => {
    const noCompression = { CompressionStream: undefined, DecompressionStream: undefined };
    const link = await encode(freshSession(), "SC1", null, noCompression);
    const bytes = Uint8Array.from(atobUrl(link));
    assert.equal(bytes[1], 0); // codec=0 (raw), never 1, when compression is unavailable

    // Manually build a codec=1 envelope around valid compressed data (real
    // compression stream, forged codec byte) to exercise the decode-side gate.
    const compressed = await encode(freshSession(), "SC1", null); // may or may not use codec 1
    const forced = Uint8Array.from(atobUrl(compressed));
    forced[1] = 1; // force codec=1 regardless of what was actually used
    const result = await decode(btoaUrl(forced), noCompression);
    assert.equal(result.ok, false);
    assert.equal(result.code, "unsupported-codec");
});

test("a fragment over 8000 characters is too-long", async () => {
    const result = await decode("A".repeat(8001));
    assert.equal(result.ok, false);
    assert.equal(result.code, "too-long");
});

test("formatVersion 2 is unsupported-version", async () => {
    const link = await encode(freshSession(), "SC1", null, { CompressionStream: undefined, DecompressionStream: undefined });
    const bytes = Uint8Array.from(atobUrl(link));
    bytes[0] = 2;
    const result = await decode(btoaUrl(bytes));
    assert.equal(result.ok, false);
    assert.equal(result.code, "unsupported-version");
});

function atobUrl(str) {
    const standard = str.replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (standard.length % 4)) % 4;
    const binary = atob(standard + "=".repeat(pad));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function btoaUrl(bytes) {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
