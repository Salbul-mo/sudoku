import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("layout.css never uses 100vh (T-UI-B08-11)", async () => {
    const url = new URL("../../game/static/game/css/layout.css", import.meta.url);
    const source = await readFile(url, "utf8");
    assert.doesNotMatch(source, /100vh/);
});
