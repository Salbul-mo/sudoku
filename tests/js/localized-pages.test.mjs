import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(
    new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]):/, "$1:"),
);
const BUILD = path.join(ROOT, "tools", "build_pages.mjs");
const ORIGIN = "https://sudoku-bw7.pages.dev";

// `group` is what hreflang may link across. The two games are separate content,
// not translations, so a link between groups is a bug rather than a nicety.
const PAGES = [
    { group: "classic", locale: "ko", url: `${ORIGIN}/`, file: ["game", "static", "index.html"], heading: "스도쿠" },
    { group: "classic", locale: "en", url: `${ORIGIN}/en/`, file: ["game", "static", "en", "index.html"], heading: "Sudoku" },
    { group: "rush", locale: "ko", url: `${ORIGIN}/rush/`, file: ["game", "static", "rush", "index.html"], heading: "스도쿠 러시" },
    { group: "rush", locale: "en", url: `${ORIGIN}/en/rush/`, file: ["game", "static", "en", "rush", "index.html"], heading: "Sudoku Rush" },
];

const groupOf = (page) => PAGES.filter((p) => p.group === page.group);
const xDefaultOf = (page) => groupOf(page).find((p) => p.locale === "ko");

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
        for (const other of groupOf(page)) {
            assert.match(
                html,
                new RegExp(`<link rel="alternate" hreflang="${other.locale}" href="${other.url}">`),
                `${page.group}/${page.locale} -> ${other.locale}`,
            );
        }
        const fallback = xDefaultOf(page).url;
        assert.match(html, new RegExp(`hreflang="x-default" href="${fallback}">`), page.group);
    }
});

// Naming the other game as an alternate language would tell a crawler the two
// are the same page in two languages, and it would pick one and drop the other.
test("T-B05-02: hreflang never crosses from one game to the other", async () => {
    for (const page of PAGES) {
        const html = await read(page);
        for (const stranger of PAGES.filter((p) => p.group !== page.group)) {
            assert.doesNotMatch(
                html,
                new RegExp(`rel="alternate" hreflang="[a-z-]+" href="${stranger.url}"`),
                `${page.group}/${page.locale} must not name ${stranger.url}`,
            );
        }
    }
});

test("T-B04-05: no build scaffolding survives into the generated pages", async () => {
    for (const page of PAGES) {
        const html = await read(page);
        assert.doesNotMatch(html, /<!-- i18n:/, page.locale);
        assert.doesNotMatch(html, /{%|%}|{{|}}/, page.locale);
    }
});

test("T-B04-06: the English pages carry no leftover Korean", async () => {
    for (const page of PAGES.filter((p) => p.locale === "en")) {
        const html = await read(page);
        assert.doesNotMatch(html, /[가-힣]/, `${page.group}: ${html.match(/.*[가-힣].*/)?.[0] ?? ""}`);
    }
});

test("T-B04-07: the sitemap lists both languages with their alternates", async () => {
    const xml = await readFile(path.join(ROOT, "game", "static", "sitemap.xml"), "utf8");
    assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
    for (const page of PAGES) {
        assert.match(xml, new RegExp(`<loc>${page.url}</loc>`), page.locale);
    }
    // Four <url> entries, each naming ko + en + x-default of its own group.
    assert.equal((xml.match(/<xhtml:link /g) ?? []).length, PAGES.length * 3);
    for (const page of PAGES) {
        for (const stranger of PAGES.filter((p) => p.group !== page.group)) {
            assert.doesNotMatch(
                xml,
                new RegExp(`<loc>${page.url}</loc>[\s\S]*?href="${stranger.url}"[\s\S]*?</url>`),
                `${page.url} must not list ${stranger.url}`,
            );
        }
    }
});
