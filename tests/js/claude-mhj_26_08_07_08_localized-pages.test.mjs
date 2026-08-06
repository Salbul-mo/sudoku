import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(
    new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]):/, "$1:"),
);
const BUILD = path.join(ROOT, "tools", "codex-mhj_26_08_02_05_build_pages.mjs");
const ORIGIN = "https://sudoku-bw7.pages.dev";

const PAGES = [
    { locale: "ko", url: `${ORIGIN}/`, file: ["game", "static", "index.html"], heading: "스도쿠" },
    { locale: "en", url: `${ORIGIN}/en/`, file: ["game", "static", "en", "index.html"], heading: "Sudoku" },
];

const read = (page) => readFile(path.join(ROOT, ...page.file), "utf8");

test("T-B04-01: the committed pages match what the build produces", () => {
    // Throws a non-zero exit if either page is stale, which is the whole point:
    // the pages are generated but committed, so drift has to be caught here.
    execFileSync(process.execPath, [BUILD, "--check"], { cwd: ROOT });
});

test("T-B04-02: each page declares its own language", async () => {
    for (const page of PAGES) {
        const html = await read(page);
        assert.match(html, new RegExp(`<html lang="${page.locale}">`), page.locale);
        assert.match(html, new RegExp(`<h1 class="visually-hidden">${page.heading}</h1>`), page.locale);
    }
});

test("T-B04-03: each page is canonical to itself, not to the other language", async () => {
    for (const page of PAGES) {
        const html = await read(page);
        assert.match(html, new RegExp(`<link rel="canonical" href="${page.url}">`), page.locale);
        assert.match(html, new RegExp(`<meta property="og:url" content="${page.url}">`), page.locale);
    }
});

// A page that omits itself from its own hreflang set gets the whole set
// ignored, so the self-reference is asserted explicitly rather than assumed.
test("T-B04-04: every page lists the full alternate set including itself", async () => {
    for (const page of PAGES) {
        const html = await read(page);
        for (const other of PAGES) {
            assert.match(
                html,
                new RegExp(`<link rel="alternate" hreflang="${other.locale}" href="${other.url}">`),
                `${page.locale} -> ${other.locale}`,
            );
        }
        assert.match(html, new RegExp(`hreflang="x-default" href="${ORIGIN}/">`), page.locale);
    }
});

test("T-B04-05: no build scaffolding survives into the generated pages", async () => {
    for (const page of PAGES) {
        const html = await read(page);
        assert.doesNotMatch(html, /<!-- i18n:/, page.locale);
        assert.doesNotMatch(html, /{%|%}|{{|}}/, page.locale);
    }
});

test("T-B04-06: the English page carries no leftover Korean", async () => {
    const html = await read(PAGES[1]);
    assert.doesNotMatch(html, /[가-힣]/, html.match(/.*[가-힣].*/)?.[0] ?? "");
});

test("T-B04-07: the sitemap lists both languages with their alternates", async () => {
    const xml = await readFile(path.join(ROOT, "game", "static", "sitemap.xml"), "utf8");
    assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
    for (const page of PAGES) {
        assert.match(xml, new RegExp(`<loc>${page.url}</loc>`), page.locale);
    }
    // Two <url> entries, each naming ko + en + x-default.
    assert.equal((xml.match(/<xhtml:link /g) ?? []).length, 6);
});
