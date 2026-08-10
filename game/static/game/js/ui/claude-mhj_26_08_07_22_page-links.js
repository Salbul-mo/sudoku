// The two header links every page carries: the same page in the other
// language, and the other game in the same language.
//
// Both are real anchors rather than buttons with click handlers. Each target is
// an indexed URL, so a crawler has to be able to follow it and a reader has to
// be able to bookmark or middle-click it. A button would look identical and do
// neither.
//
// The page is passed in rather than read off location, so a caller states which
// page it is building for instead of the module guessing from an address that
// tests do not have.
import { t, resolveLocale } from "../i18n/claude-mhj_26_08_07_05_messages.js";

export const PAGE_PATHS = Object.freeze({ classic: "/", rush: "/rush/" });

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
    assertPage(page);
    const target = page === "rush" ? "classic" : "rush";
    const label = target === "rush" ? "nav.playRush" : "nav.playClassic";
    return anchor("game-switch", withLocale(PAGE_PATHS[target], currentLocale()), t(label));
}
