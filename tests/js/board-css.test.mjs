import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("board.css sets transition-duration to 0ms under prefers-reduced-motion (V-UI-B08-03)", async () => {
    const url = new URL("../../game/static/game/css/board.css", import.meta.url);
    const source = await readFile(url, "utf8");
    const block = /prefers-reduced-motion:\s*reduce\s*\)\s*\{([^}]*\{[^}]*\})/.exec(source);
    assert.ok(block, "no prefers-reduced-motion block found");
    assert.match(block[1], /transition-duration:\s*0ms/);
});

test("normal transition durations stay at or under the 180ms ceiling", async () => {
    const url = new URL("../../game/static/game/css/board.css", import.meta.url);
    const source = await readFile(url, "utf8");
    const durations = [...source.matchAll(/transition-duration:\s*(\d+)ms/g)]
        .map((m) => Number(m[1]))
        .filter((ms) => ms > 0); // exclude the reduced-motion 0ms override itself
    assert.ok(durations.length > 0, "no non-zero transition-duration declarations found");
    for (const ms of durations) assert.ok(ms <= 180, `${ms}ms exceeds the 180ms ceiling`);
});
