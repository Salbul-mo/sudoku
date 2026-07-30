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

// Phase 1 V4-17's fixed values -- see tokens.css's own header comment.
const EXPECTED = {
    light: {
        "bg-page": "#F8FAFC", "bg-cell": "#FFFFFF", "bg-cell-given": "#E8EDF3",
        "bg-cell-selected": "#CFE3FB", "bg-cell-peer": "#EFF4FA", "bg-cell-digit": "#DDE7FA",
        "bg-cell-conflict": "#FBE4E4", "fg-body": "#1E293B", "fg-given": "#0F172A",
        "fg-user": "#1B4FA8", "fg-candidate": "#4A5568", "fg-conflict": "#A32020",
        "line": "#334155", "focus": "#1B4FA8",
    },
    dark: {
        "bg-page": "#0B1220", "bg-cell": "#161F2E", "bg-cell-given": "#243044",
        "bg-cell-selected": "#20406E", "bg-cell-peer": "#1C2739", "bg-cell-digit": "#2A2F5C",
        "bg-cell-conflict": "#4A1F22", "fg-body": "#E2E8F0", "fg-given": "#F1F5F9",
        "fg-user": "#9EC5FF", "fg-candidate": "#B3C0D1", "fg-conflict": "#FF9E9E",
        "line": "#94A3B8", "focus": "#9EC5FF",
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
    assert.match(stdout, /\[light\] worst pair: fg-candidate on bg-cell-selected = 5\.75:1/);
    assert.match(stdout, /\[dark\] fg-conflict on bg-cell-selected \(text\): 5\.2[67]:1 PASS/);
    assert.match(stdout, /\[dark\] worst pair: line on bg-cell-selected = 4\.05:1/);
});

test("degrading one token's contrast makes the tool exit 1 and report the pair (negative)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "contrast-"));
    const original = await readFile(TOKENS_PATH, "utf8");
    const degraded = original.replace("--fg-candidate: #4A5568;", "--fg-candidate: #A8B0C0;");
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
