import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32 } from "../../game/static/game/js/url/crc32.js";

test("matches the standard check value for '123456789'", () => {
    const bytes = new TextEncoder().encode("123456789");
    assert.equal(crc32(bytes), 0xcbf43926);
});

test("empty input is 0", () => {
    assert.equal(crc32(new Uint8Array(0)), 0);
});

test("return value is always unsigned", () => {
    for (let i = 0; i < 50; i++) {
        const bytes = Uint8Array.from({ length: 10 }, () => Math.floor(Math.random() * 256));
        assert.ok(crc32(bytes) >= 0);
    }
});
