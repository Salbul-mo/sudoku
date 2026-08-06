import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);
const TOOL = new URL("../../tools/check-contrast.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]):/, "$1:");
const TOKENS_PATH = new URL("../../game/static/game/css/tokens.css", import.meta.url).pathname.replace(/^\/([A-Za-z]):/, "$1:");

// The low-saturation gray-paper palette -- see tokens.css's own header comment.
const EXPECTED = {
    light: {
        "bg-page": "#E8E7E3", "bg-cell": "#F6F5F2", "bg-cell-given": "#E4E3DE",
        "bg-cell-selected": "#B4C2D2", "bg-cell-peer": "#D6DBE0", "bg-cell-digit": "#CFD6DE",
        "bg-cell-conflict": "#E6D2CE", "fg-body": "#34332F", "fg-given": "#1E1D1A",
        "fg-user": "#2F4E70", "fg-candidate": "#4D4C46", "fg-conflict": "#7C2E24",
        "line": "#3A3935", "focus": "#3C5A7A",
    },
    dark: {
        "bg-page": "#17181A", "bg-cell": "#232528", "bg-cell-given": "#2E3033",
        "bg-cell-selected": "#3B4E68", "bg-cell-peer": "#333940", "bg-cell-digit": "#343A42",
        "bg-cell-conflict": "#43292A", "fg-body": "#E4E3DF", "fg-given": "#F4F3EF",
        "fg-user": "#BBD0E6", "fg-candidate": "#D0CFC9", "fg-conflict": "#F5C2B6",
        "line": "#B0AFA9", "focus": "#A6C0DC",
    },
};

function extractTokens(css, blockRe) {
    const m = blockRe.exec(css);
    const block = m ? m[1] : "";
    const out = {};
    for (const name of Object.keys(EXPECTED.light)) {
        const re = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})\\s*;`);
        const found = re.exec(block);
        if (found) out[name] = found[1].toUpperCase();
    }
    return out;
}

test("tokens.css defines all 14 tokens in both themes (T-UI-B08-01)", async () => {
    const css = await readFile(TOKENS_PATH, "utf8");
    const light = extractTokens(css, /:root\s*\{([^}]*)\}/);
    const dark = extractTokens(css, /prefers-color-scheme:\s*dark\s*\)\s*\{\s*:root\s*\{([^}]*)\}/);
    assert.equal(Object.keys(light).length, 14);
    assert.equal(Object.keys(dark).length, 14);
});

test("token values match the Phase 1 table exactly (T-UI-B08-02)", async () => {
    const css = await readFile(TOKENS_PATH, "utf8");
    const light = extractTokens(css, /:root\s*\{([^}]*)\}/);
    const dark = extractTokens(css, /prefers-color-scheme:\s*dark\s*\)\s*\{\s*:root\s*\{([^}]*)\}/);
    assert.deepEqual(light, EXPECTED.light);
    assert.deepEqual(dark, EXPECTED.dark);
});

test("check-contrast.mjs passes with 0 failures and reproduces the expected worst ratios (V-UI-B08-02)", async () => {
    const { stdout } = await execFileAsync(process.execPath, [TOOL, TOKENS_PATH]);
    assert.match(stdout, /76 pairs checked, 0 failing/);
    assert.match(stdout, /\[light\] worst pair: focus on bg-cell-selected = 3\.95:1/);
    assert.match(stdout, /\[dark\] fg-conflict on bg-cell-selected \(text\): 5\.36:1 PASS/);
    assert.match(stdout, /\[dark\] worst pair: line on bg-cell-selected = 3\.86:1/);
});

test("degrading one token's contrast makes the tool exit 1 and report the pair (negative)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "contrast-"));
    const original = await readFile(TOKENS_PATH, "utf8");
    const degraded = original.replace("--fg-candidate: #4D4C46;", "--fg-candidate: #BDBCB6;");
    const badPath = path.join(dir, "bad-tokens.css");
    await writeFile(badPath, degraded, "utf8");
    try {
        await assert.rejects(execFileAsync(process.execPath, [TOOL, badPath]));
        const { stdout } = await execFileAsync(process.execPath, [TOOL, badPath]).catch((e) => e);
        assert.match(stdout, /FAIL/);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("a missing tokens file exits 2 (negative)", async () => {
    await assert.rejects(
        execFileAsync(process.execPath, [TOOL, "/no/such/tokens.css"]),
        (err) => err.code === 2
    );
});
