import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const JS_ROOT = new URL("../../game/static/game/js/", import.meta.url).pathname
    .replace(/^\/([A-Za-z]):/, "$1:");
const CSS_ROOT = new URL("../../game/static/game/css/", import.meta.url).pathname
    .replace(/^\/([A-Za-z]):/, "$1:");

// The catalogue is the one place Korean text is supposed to live.
const CATALOGUE = "messages.js";

const HANGUL = /[가-힣]/;
const QUOTED_HANGUL = /(["'`])[^"'`\n]*[가-힣][^"'`\n]*\1/;

async function jsFiles(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...await jsFiles(full));
        else if (entry.name.endsWith(".js") && entry.name !== CATALOGUE) out.push(full);
    }
    return out;
}

// Comments are exempt: the code is commented in Korean on purpose, and only
// strings the user can actually see need translating.
function strippedLines(source) {
    let inBlock = false;
    return source.split("\n").map((line) => {
        const trimmed = line.trim();
        if (inBlock) {
            if (trimmed.includes("*/")) inBlock = false;
            return "";
        }
        if (trimmed.startsWith("/*")) {
            if (!trimmed.includes("*/")) inBlock = true;
            return "";
        }
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return "";
        return line.replace(/\/\/.*$/, "");
    });
}

test("T-B03-01: no user-facing Korean string is left hardcoded in the app", async () => {
    const offenders = [];
    for (const file of await jsFiles(JS_ROOT)) {
        const source = await readFile(file, "utf8");
        strippedLines(source).forEach((line, i) => {
            if (QUOTED_HANGUL.test(line)) {
                offenders.push(`${path.relative(JS_ROOT, file)}:${i + 1}  ${line.trim()}`);
            }
        });
    }
    assert.deepEqual(offenders, [], `move these into the message catalogue:\n${offenders.join("\n")}`);
});

test("T-B03-02: no CSS rule carries display text of its own", async () => {
    const offenders = [];
    for (const name of await readdir(CSS_ROOT)) {
        if (!name.endsWith(".css")) continue;
        const source = await readFile(path.join(CSS_ROOT, name), "utf8");
        source.split("\n").forEach((line, i) => {
            if (/content\s*:/.test(line) && HANGUL.test(line)) {
                offenders.push(`${name}:${i + 1}  ${line.trim()}`);
            }
        });
    }
    assert.deepEqual(offenders, [], `use var(--i18n-*) instead:\n${offenders.join("\n")}`);
});
