import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// The rest of board-view.js is DOM-mount behavior that this project verifies
// manually against a real browser (T-UI-B06-13..18), per wave2b's own
// verification-note: UI-B06 mixes DOM contact that node:test cannot exercise
// without adding a dependency (jsdom), which DEC-UI-02 forbids. This is the
// one part the plan itself marks "kind=unit": T-UI-B06-19.
test("board-view.js source never uses innerHTML/insertAdjacentHTML/outerHTML (V-UI-B06-06)", async () => {
    const url = new URL("../../game/static/game/js/ui/board-view.js", import.meta.url);
    const source = await readFile(url, "utf8");
    assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|outerHTML/);
});
