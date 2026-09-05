// Shared page-link helpers. Language switches live in page headers; game-mode
// navigation is rendered by the footer.
//
// Both are real anchors rather than buttons with click handlers. Each target is
// an indexed URL, so a crawler has to be able to follow it and a reader has to
// be able to bookmark or middle-click it. A button would look identical and do
// neither.
//
// The page is passed in rather than read off location, so a caller states which
// page it is building for instead of the module guessing from an address that
// tests do not have.
import { t, resolveLocale } from "../i18n/messages.js";

export const PAGE_PATHS = Object.freeze({ classic: "/", rush: "/rush/", learn: "/learn/" });

// The two pages the header's game switch toggles between. Deliberately not
// Object.keys(PAGE_PATHS): the practice page is reached from the footer, and a
// two-way toggle has no meaning once a third page exists -- asking it about
// "learn" is a caller bug, so it throws rather than guessing a direction.
const GAME_PAGES = Object.freeze(["classic", "rush"]);

function currentLocale() {
    return resolveLocale(globalThis.document?.documentElement?.lang);
}

function withLocale(path, locale) {
    return locale === "en" ? `/en${path}` : path;
}

function assertPage(page) {
    if (!Object.hasOwn(PAGE_PATHS, page)) {
        throw new RangeError(`unknown page: ${page}`);
    }
}

function assertGamePage(page) {
    if (!GAME_PAGES.includes(page)) {
        throw new RangeError(`not a game page: ${page}`);
    }
}

function anchor(className, href, text) {
    const link = document.createElement("a");
    link.className = className;
    link.href = href;
    link.textContent = text;
    return link;
}

/**
 * This page in the other language. Marked rel="alternate": it is the same
 * content, which is exactly what hreflang says about it.
 */
export function createLangSwitch(page) {
    assertPage(page);
    const other = currentLocale() === "en" ? "ko" : "en";
    const link = anchor("lang-switch", withLocale(PAGE_PATHS[page], other), t("nav.otherLanguage"));
    link.setAttribute("hreflang", other);
    link.setAttribute("rel", "alternate");
    return link;
}

/**
 * The other game, in the language the reader is already using. Deliberately not
 * rel="alternate" -- the two games are different content, and telling a crawler
 * otherwise would have it treat one as a duplicate of the other and drop it.
 */
export function createGameSwitch(page) {
    assertGamePage(page);
    const target = page === "rush" ? "classic" : "rush";
    const label = target === "rush" ? "nav.playRush" : "nav.playClassic";
    return anchor("game-switch", withLocale(PAGE_PATHS[target], currentLocale()), t(label));
}
