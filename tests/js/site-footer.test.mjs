// The footer every page carries, and the header switch it deliberately did not
// become.
//
// This is the only route to /learn/ from anywhere on the site, so "the link is
// present on all six pages and points at the right locale" is not a cosmetic
// check -- it is whether the page is reachable at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(
    new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]):/, "$1:"),
);

const PAGES = [
    { page: "classic", locale: "ko", file: ["index.html"] },
    { page: "classic", locale: "en", file: ["en", "index.html"] },
    { page: "rush", locale: "ko", file: ["rush", "index.html"] },
    { page: "rush", locale: "en", file: ["en", "rush", "index.html"] },
    { page: "learn", locale: "ko", file: ["learn", "index.html"] },
    { page: "learn", locale: "en", file: ["en", "learn", "index.html"] },
];

const PATHS = { classic: "/", rush: "/rush/", learn: "/learn/" };
const localised = (page, locale) => (locale === "en" ? `/en${PATHS[page]}` : PATHS[page]);

const read = (page) => readFile(path.join(ROOT, "game", "static", ...page.file), "utf8");

const footerOf = (html) => html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0] ?? "";

test("T-E07-04: every page carries a footer linking the other two", async () => {
    for (const page of PAGES) {
        const footer = footerOf(await read(page));
        const where = `${page.page}/${page.locale}`;
        assert.notEqual(footer, "", `${where} has no footer`);
        for (const other of Object.keys(PATHS)) {
            if (other === page.page) continue;
            assert.match(
                footer,
                new RegExp(`<a href="${localised(other, page.locale)}">`),
                `${where} does not link ${other}`,
            );
        }
    }
});

// A link to the page you are already on is a dead control for anyone tabbing
// through, and aria-current is what actually tells a screen reader where it is.
test("T-E07-05: a page never links to itself, and says so with aria-current", async () => {
    for (const page of PAGES) {
        const footer = footerOf(await read(page));
        const where = `${page.page}/${page.locale}`;
        assert.equal(
            (footer.match(/aria-current="page"/g) ?? []).length, 1,
            `${where} must mark exactly one current page`,
        );
        assert.doesNotMatch(
            footer,
            new RegExp(`<a href="${localised(page.page, page.locale)}">`),
            `${where} links to itself`,
        );
    }
});

test("T-E07-06: footer links stay inside their own language", async () => {
    for (const page of PAGES) {
        const footer = footerOf(await read(page));
        const hrefs = [...footer.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
        assert.ok(hrefs.length === 2, `${page.page}/${page.locale}: expected two links`);
        for (const href of hrefs) {
            assert.equal(
                href.startsWith("/en/"), page.locale === "en",
                `${page.page}/${page.locale} crosses languages with ${href}`,
            );
        }
    }
});

test("T-E07-09: the footer sits outside #app, which the entry points empty on boot", async () => {
    for (const page of PAGES) {
        const html = await read(page);
        const app = html.indexOf('id="app"');
        const footer = html.indexOf('<footer class="site-footer">');
        assert.ok(app !== -1 && footer !== -1, `${page.page}/${page.locale}`);
        assert.ok(
            footer > html.indexOf("</main>"),
            `${page.page}/${page.locale}: the footer must not be inside #app`,
        );
    }
});

// ------------------------------------------------------------ page-links

const { createGameSwitch, createLangSwitch, PAGE_PATHS } =
    await import("../../game/static/game/js/ui/page-links.js");

function withDom(lang, fn) {
    const previousDocument = globalThis.document;
    const created = [];
    globalThis.document = {
        documentElement: { lang },
        createElement: () => {
            const node = {
                className: "", href: "", textContent: "", attrs: {},
                setAttribute(name, value) { this.attrs[name] = value; },
            };
            created.push(node);
            return node;
        },
    };
    try { return fn(); } finally { globalThis.document = previousDocument; }
}

test("T-E07-01: the language switch knows the practice page", () => {
    assert.equal(PAGE_PATHS.learn, "/learn/");
    assert.equal(withDom("ko", () => createLangSwitch("learn")).href, "/en/learn/");
    assert.equal(withDom("en", () => createLangSwitch("learn")).href, "/learn/");
});

// The header switch is a two-way toggle between the games. Once a third page
// exists, asking it about that page has no answer, so it says so.
test("T-E07-02: the game switch refuses the practice page", () => {
    withDom("ko", () => {
        assert.throws(() => createGameSwitch("learn"), RangeError);
        assert.throws(() => createGameSwitch("nope"), RangeError);
        assert.equal(createGameSwitch("classic").href, "/rush/");
        assert.equal(createGameSwitch("rush").href, "/");
    });
});
