import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeULEB128, decodeULEB128 } from "../../game/static/game/js/url/leb128.js";

test("0, 127, 128, 16383, and 2^32-1 round-trip", () => {
    for (const v of [0, 127, 128, 16383, 0xffffffff]) {
        const out = [];
        encodeULEB128(v, out);
        const result = decodeULEB128(Uint8Array.from(out), 0);
        assert.ok(result);
        assert.equal(result.value, v);
        assert.equal(result.next, out.length);
    }
});

test("a non-minimal encoding like 0x80 0x00 is rejected", () => {
    assert.equal(decodeULEB128(Uint8Array.from([0x80, 0x00]), 0), null);
});

test("6 continuation bytes in a row is rejected", () => {
    assert.equal(decodeULEB128(Uint8Array.from([0x80, 0x80, 0x80, 0x80, 0x80, 0x01]), 0), null);
});

test("a truncated buffer is rejected", () => {
    assert.equal(decodeULEB128(Uint8Array.from([0x80]), 0), null);
});
