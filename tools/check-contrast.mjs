#!/usr/bin/env node
// Contrast gate for game/static/game/css/tokens.css (M3 regression guard).
// No dependency: parses the two token blocks with a small regex reader and
// computes WCAG contrast ratios directly. Exit codes: 0 pass, 1 contrast
// failure, 2 input error (missing file, fewer than 14 tokens per theme).
import { readFileSync } from "node:fs";

const TOKEN_NAMES = [
    "bg-page", "bg-cell", "bg-cell-given", "bg-cell-selected", "bg-cell-peer",
    "bg-cell-digit", "bg-cell-conflict", "fg-body", "fg-given", "fg-user",
    "fg-candidate", "fg-conflict", "line", "focus",
];

const CELL_BACKGROUNDS = [
    "bg-cell", "bg-cell-given", "bg-cell-selected", "bg-cell-peer",
    "bg-cell-digit", "bg-cell-conflict",
];
const TEXT_COLORS = ["fg-body", "fg-given", "fg-user", "fg-candidate", "fg-conflict"];
const NON_TEXT_COLORS = ["line", "focus"];
const NON_TEXT_BACKGROUNDS = ["bg-page", "bg-cell", "bg-cell-selected", "bg-cell-peer"];

const TEXT_MIN = 4.5;
const NON_TEXT_MIN = 3.0;

function parseThemeBlock(source, blockText) {
    const tokens = {};
    for (const name of TOKEN_NAMES) {
        const re = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})\\s*;`);
        const m = re.exec(blockText);
        if (m) tokens[name] = m[1];
    }
    return tokens;
}

function parseTokens(source) {
    const rootMatch = /:root\s*\{([^}]*)\}/.exec(source);
    if (!rootMatch) return { light: {}, dark: {} };
    const light = parseThemeBlock(source, rootMatch[1]);

    const darkBlockMatch = /prefers-color-scheme:\s*dark\s*\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(source);
    const dark = darkBlockMatch ? parseThemeBlock(source, darkBlockMatch[1]) : {};
    return { light, dark };
}

function srgbToLinear(c8) {
    const c = c8 / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(hexA, hexB) {
    const a = relativeLuminance(hexA);
    const b = relativeLuminance(hexB);
    const [hi, lo] = a > b ? [a, b] : [b, a];
    return (hi + 0.05) / (lo + 0.05);
}

function buildPairs() {
    const pairs = [];
    for (const fg of TEXT_COLORS) {
        for (const bg of CELL_BACKGROUNDS) pairs.push({ fg, bg, min: TEXT_MIN, kind: "text" });
    }
    for (const fg of NON_TEXT_COLORS) {
        for (const bg of NON_TEXT_BACKGROUNDS) pairs.push({ fg, bg, min: NON_TEXT_MIN, kind: "non-text" });
    }
    return pairs;
}

function checkTheme(themeName, tokens, pairs) {
    let failures = 0;
    let worst = null;
    for (const { fg, bg, min, kind } of pairs) {
        if (!tokens[fg] || !tokens[bg]) {
            console.error(`error: theme ${themeName} is missing token --${!tokens[fg] ? fg : bg}`);
            process.exitCode = 2;
            continue;
        }
        const ratio = contrastRatio(tokens[fg], tokens[bg]);
        const ok = ratio >= min;
        if (!ok) failures++;
        if (!worst || ratio < worst.ratio) worst = { ratio, fg, bg, kind };
        console.log(
            `[${themeName}] ${fg} on ${bg} (${kind}): ${ratio.toFixed(2)}:1 `
            + `${ok ? "PASS" : `FAIL (needs ${min}:1)`}`
        );
    }
    console.log(`[${themeName}] worst pair: ${worst.fg} on ${worst.bg} = ${worst.ratio.toFixed(2)}:1`);
    return failures;
}

function main() {
    const path = process.argv[2] ?? "game/static/game/css/tokens.css";
    let source;
    try {
        source = readFileSync(path, "utf8");
    } catch {
        console.error(`error: cannot read ${path}`);
        process.exitCode = 2;
        return;
    }

    const { light, dark } = parseTokens(source);
    for (const [name, tokens] of [["light", light], ["dark", dark]]) {
        if (Object.keys(tokens).length < TOKEN_NAMES.length) {
            console.error(`error: theme ${name} has ${Object.keys(tokens).length} tokens, expected ${TOKEN_NAMES.length}`);
            process.exitCode = 2;
        }
    }
    if (process.exitCode === 2) return;

    const pairs = buildPairs();
    const lightFailures = checkTheme("light", light, pairs);
    const darkFailures = checkTheme("dark", dark, pairs);
    const total = lightFailures + darkFailures;
    console.log(`\n${pairs.length * 2} pairs checked, ${total} failing`);
    process.exitCode = total > 0 ? 1 : 0;
}

main();
