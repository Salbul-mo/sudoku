import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Regression guard for a whole class of defect this project actually shipped:
// CSS was written against selectors no module ever produced (.board,
// .app-shell, .digit-bar, .control, [data-peer]) while a class the announcer
// *did* set (.visually-hidden) was never defined anywhere, which left the
// screen-reader live region rendering as visible text on the page.
//
// These are string-level checks on purpose -- they cannot prove the styling is
// right, only that neither side of the contract has silently lost its partner.
const CSS_FILES = ["tokens.css", "layout.css", "board.css", "chrome.css"];
const JS_FILES = [
    "app.js", "main.js",
    "ui/announcer.js", "ui/app-shell.js", "ui/board-view.js",
    "ui/touch-controls.js", "ui/settings-view.js",
    "bootstrap.js",
];

async function readAll(dir, names) {
    const parts = await Promise.all(names.map((name) =>
        readFile(new URL(`../../game/static/game/${dir}/${name}`, import.meta.url), "utf8")));
    return parts.join("\n");
}

const css = await readAll("css", CSS_FILES);
const js = await readAll("js", JS_FILES);

const PAIRS = [
    // [what the CSS styles, how the JS produces it]
    [".visually-hidden", 'className = "visually-hidden"'],
    [".board", 'className = "board"'],
    [".digit-bar", 'className = "digit-bar"'],
    [".app-shell", '"app-shell"'],
    [".settings-form", '"settings-form"'],
    [".hint-strip", '"hint-strip"'],
    [".retry-panel", '"retry-panel"'],
];

for (const [selector, marker] of PAIRS) {
    test(`${selector} is both styled and produced by a module`, () => {
        assert.ok(css.includes(selector), `${selector} is not defined in any stylesheet`);
        assert.ok(js.includes(marker), `no module produces ${selector}`);
    });
}

test("state attributes the board stylesheet targets are actually set by board-view", async () => {
    const boardView = await readFile(
        new URL("../../game/static/game/js/ui/board-view.js", import.meta.url), "utf8");
    for (const [attribute, assignment] of [
        ["data-conflict", "dataset.conflict"],
        ["data-given", "dataset.given"],
        ["data-peer", "dataset.peer"],
        ["data-candidate-mode", "dataset.candidateMode"],
    ]) {
        assert.ok(css.includes(attribute), `${attribute} is not styled`);
        assert.ok(boardView.includes(assignment), `board-view.js never sets ${attribute}`);
    }
});

test("the 48px control floor reaches the buttons the modules actually build", () => {
    assert.ok(css.includes("--control-floor: 48px"), "the control floor token is missing");
    for (const host of [".app-shell-header button", ".digit-bar button", "[role=\"dialog\"] button"]) {
        assert.ok(css.includes(host), `${host} never receives the control floor`);
    }
});

test("every stylesheet the template loads exists and is non-empty", async () => {
    const template = await readFile(
        new URL("../../game/templates/game/index.html", import.meta.url), "utf8");
    for (const name of CSS_FILES) {
        assert.ok(template.includes(`game/css/${name}`), `${name} is not linked from index.html`);
        const source = await readFile(
            new URL(`../../game/static/game/css/${name}`, import.meta.url), "utf8");
        assert.ok(source.trim().length > 0, `${name} is empty`);
    }
});
