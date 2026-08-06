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

// The warm cream-paper palette -- see tokens.css's own header comment.
const EXPECTED = {
    light: {
        "bg-page": "#EFE7D3", "bg-cell": "#FAF6EA", "bg-cell-given": "#EDE3C7",
        "bg-cell-selected": "#E3C468", "bg-cell-peer": "#EBDFB8", "bg-cell-digit": "#E6D9A8",
        "bg-cell-conflict": "#EAC8BC", "fg-body": "#3A3226", "fg-given": "#221D14",
        "fg-user": "#3E5372", "fg-candidate": "#544D3D", "fg-conflict": "#7A2A1E",
        "line": "#3B362B", "focus": "#8A5A12",
    },
    dark: {
        "bg-page": "#1C1712", "bg-cell": "#2A2318", "bg-cell-given": "#362D1E",
        "bg-cell-selected": "#5A4118", "bg-cell-peer": "#3C321F", "bg-cell-digit": "#4A3B20",
        "bg-cell-conflict": "#4A231D", "fg-body": "#E8DFC8", "fg-given": "#F5EFDD",
        "fg-user": "#BFCCE0", "fg-candidate": "#CFC3A6", "fg-conflict": "#F3B6A5",
        "line": "#B3A483", "focus": "#E8C572",
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
    assert.match(stdout, /\[light\] worst pair: focus on bg-cell-selected = 3\.48:1/);
    assert.match(stdout, /\[dark\] fg-conflict on bg-cell-selected \(text\): 5\.47:1 PASS/);
    assert.match(stdout, /\[dark\] worst pair: line on bg-cell-selected = 3\.88:1/);
});

test("degrading one token's contrast makes the tool exit 1 and report the pair (negative)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "contrast-"));
    const original = await readFile(TOKENS_PATH, "utf8");
    const degraded = original.replace("--fg-candidate: #544D3D;", "--fg-candidate: #C8BFA0;");
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
