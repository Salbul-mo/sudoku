// The favicon set, the link-preview cards, the web manifests, and the
// structured data -- everything a page points at that is not HTML.
//
// The recurring failure these guard against is a page that advertises an asset
// it does not have. A stale <link rel="icon"> or an og:image that 404s is
// invisible in a browser and only shows up as a blank card weeks later in
// someone else's timeline, so every reference is followed to a real file here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(
    new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]):/, "$1:"),
);
const STATIC = path.join(ROOT, "game", "static");
const ORIGIN = "https://sudoku-bw7.pages.dev";

const PAGES = [
    { group: "classic", locale: "ko", url: `${ORIGIN}/`, file: ["index.html"], manifest: "/site.webmanifest" },
    { group: "classic", locale: "en", url: `${ORIGIN}/en/`, file: ["en", "index.html"], manifest: "/en/site.webmanifest" },
    { group: "rush", locale: "ko", url: `${ORIGIN}/rush/`, file: ["rush", "index.html"], manifest: "/site.webmanifest" },
    { group: "rush", locale: "en", url: `${ORIGIN}/en/rush/`, file: ["en", "rush", "index.html"], manifest: "/en/site.webmanifest" },
    { group: "learn", locale: "ko", url: `${ORIGIN}/learn/`, file: ["learn", "index.html"], manifest: "/site.webmanifest" },
    { group: "learn", locale: "en", url: `${ORIGIN}/en/learn/`, file: ["en", "learn", "index.html"], manifest: "/en/site.webmanifest" },
];

const read = (page) => readFile(path.join(STATIC, ...page.file), "utf8");

// Resolves a site-absolute URL, with or without the origin, to a path on disk.
const onDisk = (url) => path.join(STATIC, url.replace(ORIGIN, "").replace(/^\//, ""));

/** Width and height out of a PNG's IHDR, which is always the first chunk. */
function pngSize(buffer) {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.ok(buffer.subarray(0, 8).equals(signature), "not a PNG");
    assert.equal(buffer.subarray(12, 16).toString("latin1"), "IHDR");
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test("T-BA-01: the committed icons match what the generator produces", () => {
    // Byte-exact, which is only assertable because build_icons.mjs draws
    // rectangles itself instead of shelling out to a rasterizer.
    execFileSync(process.execPath, [path.join(ROOT, "tools", "build_icons.mjs"), "--check"], { cwd: ROOT });
});

test("T-BA-02: every page links the icon set and its own manifest", async () => {
    for (const page of PAGES) {
        const html = await read(page);
        const where = `${page.group}/${page.locale}`;
        assert.match(html, /<link rel="icon" href="\/favicon\.ico" sizes="48x48">/, where);
        assert.match(html, /<link rel="icon" href="\/icon\.svg" type="image\/svg\+xml" sizes="any">/, where);
        assert.match(html, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png">/, where);
        assert.match(html, new RegExp(`<link rel="manifest" href="${page.manifest}">`), where);
    }
});

test("T-BA-03: every asset a page names exists on disk", async () => {
    for (const page of PAGES) {
        const html = await read(page);
        const referenced = [...html.matchAll(/(?:href|content)="((?:\/|https:\/\/[^"]*\/)[^"]*\.(?:png|ico|svg|webmanifest))"/g)]
            .map((m) => m[1]);
        assert.ok(referenced.length >= 5, `${page.group}/${page.locale} names too few assets`);
        for (const url of referenced) {
            assert.ok(existsSync(onDisk(url)), `${page.group}/${page.locale} names a missing asset: ${url}`);
        }
    }
});

// A relative og:image is the single most common reason a card renders blank:
// the scrapers do not resolve it against the page.
test("T-BA-04: the link-preview card is absolute, sized, and 1200x630", async () => {
    for (const page of PAGES) {
        const html = await read(page);
        const where = `${page.group}/${page.locale}`;
        const expected = `${ORIGIN}/og-${page.group}-${page.locale}.png`;
        assert.match(html, new RegExp(`<meta property="og:image" content="${expected}">`), where);
        assert.match(html, new RegExp(`<meta name="twitter:image" content="${expected}">`), where);
        assert.match(html, /<meta name="twitter:card" content="summary_large_image">/, where);
        assert.match(html, /<meta property="og:image:width" content="1200">/, where);
        assert.match(html, /<meta property="og:image:height" content="630">/, where);
        assert.match(html, /<meta property="og:image:alt" content="[^"]+">/, where);
        assert.deepEqual(pngSize(readFileSync(onDisk(expected))), { width: 1200, height: 630 }, where);
    }
});

test("T-BA-05: favicon.ico carries 16, 32 and 48px PNG entries", () => {
    const ico = readFileSync(path.join(STATIC, "favicon.ico"));
    assert.equal(ico.readUInt16LE(0), 0, "reserved");
    assert.equal(ico.readUInt16LE(2), 1, "type must be icon");
    const count = ico.readUInt16LE(4);
    const sizes = [];
    for (let i = 0; i < count; i++) {
        const at = 6 + i * 16;
        const length = ico.readUInt32LE(at + 8);
        const offset = ico.readUInt32LE(at + 12);
        const image = ico.subarray(offset, offset + length);
        const { width, height } = pngSize(image);
        assert.equal(width, ico[at], "directory width disagrees with the PNG");
        assert.equal(height, ico[at + 1], "directory height disagrees with the PNG");
        sizes.push(width);
    }
    assert.deepEqual(sizes, [16, 32, 48]);
});

test("T-BA-06: each manifest describes its own language and only real icons", () => {
    for (const [locale, file, root] of [["ko", "site.webmanifest", "/"], ["en", "en/site.webmanifest", "/en/"]]) {
        const manifest = JSON.parse(readFileSync(path.join(STATIC, file), "utf8"));
        assert.equal(manifest.lang, locale);
        assert.equal(manifest.start_url, root);
        // Pinned separately from start_url on purpose: id is the installed-app
        // identity, and letting it default would tie it to start_url.
        assert.equal(manifest.id, root);
        assert.equal(manifest.scope, "/");
        assert.ok(manifest.name.trim().length > 0, `${locale} name`);
        assert.ok(manifest.short_name.trim().length > 0, `${locale} short_name`);
        const declared = manifest.icons.map((icon) => icon.sizes);
        assert.ok(declared.includes("192x192") && declared.includes("512x512"), `${locale} icon sizes`);
        for (const icon of manifest.icons) {
            assert.ok(existsSync(onDisk(icon.src)), `${locale} manifest names a missing icon: ${icon.src}`);
            // Claiming `maskable` would have Android crop the grid off the mark,
            // which runs to the edge of the square.
            assert.ok(!(icon.purpose ?? "").includes("maskable"), `${locale}: ${icon.src} must not claim maskable`);
        }
    }
});

test("T-BA-07: the English manifest carries no leftover Korean", () => {
    const raw = readFileSync(path.join(STATIC, "en", "site.webmanifest"), "utf8");
    assert.doesNotMatch(raw, /[가-힣]/, raw.match(/.*[가-힣].*/)?.[0] ?? "");
});

test("T-BA-08: structured data parses and describes this page", async () => {
    for (const page of PAGES) {
        const html = await read(page);
        const where = `${page.group}/${page.locale}`;
        const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
            .map((m) => JSON.parse(m[1]));
        const game = blocks.find((b) => b["@type"] === "VideoGame");
        assert.ok(game, `${where} has no VideoGame`);
        assert.equal(game.url, page.url, where);
        assert.equal(game.inLanguage, page.locale, where);
        assert.equal(game.image, `${ORIGIN}/og-${page.group}-${page.locale}.png`, where);
        assert.equal(game.isAccessibleForFree, true, where);

        // WebSite belongs on the locale roots only. Naming /rush/ as the
        // website would simply be false.
        const site = blocks.find((b) => b["@type"] === "WebSite");
        if (page.group === "classic") {
            assert.ok(site, `${where} should declare WebSite`);
            assert.equal(site.url, `${ORIGIN}${page.locale === "en" ? "/en/" : "/"}`, where);
            assert.equal(site.inLanguage, page.locale, where);
        } else {
            assert.equal(site, undefined, `${where} must not declare WebSite`);
        }
    }
});

// Structured data describing things the site does not provide is what gets
// rich results revoked, and this site has no prices, ratings or reviews.
test("T-BA-09: structured data claims no price, rating or review", async () => {
    for (const page of PAGES) {
        const html = await read(page);
        const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
            .map((m) => m[1]);
        for (const raw of blocks) {
            for (const forbidden of ["offers", "price", "aggregateRating", "review", "ratingValue"]) {
                assert.doesNotMatch(raw, new RegExp(`"${forbidden}"`), `${page.group}/${page.locale}: ${forbidden}`);
            }
        }
    }
});
