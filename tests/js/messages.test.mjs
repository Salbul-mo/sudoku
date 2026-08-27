import { test } from "node:test";
import assert from "node:assert/strict";
import {
    MESSAGES, LOCALES, CSS_STRING_KEYS, resolveLocale, t,
} from "../../game/static/game/js/i18n/messages.js";

const tokensOf = (s) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));

// t() reads document.documentElement.lang, which node:test has no DOM for.
function withLang(lang, fn) {
    const previous = globalThis.document;
    globalThis.document = { documentElement: { lang } };
    try { return fn(); } finally { globalThis.document = previous; }
}

test("T-B01-01: both languages define exactly the same keys", () => {
    const [ko, en] = LOCALES.map((l) => new Set(Object.keys(MESSAGES[l])));
    const missingInEn = [...ko].filter((k) => !en.has(k));
    const missingInKo = [...en].filter((k) => !ko.has(k));
    assert.deepEqual(missingInEn, [], "keys present in ko but not en");
    assert.deepEqual(missingInKo, [], "keys present in en but not ko");
});

test("T-B01-02: no message is empty or blank", () => {
    for (const locale of LOCALES) {
        for (const [key, value] of Object.entries(MESSAGES[locale])) {
            assert.equal(typeof value, "string", `${locale}.${key}`);
            assert.ok(value.trim().length > 0, `${locale}.${key} is blank`);
        }
    }
});

test("T-B01-03: a key's placeholders match across languages", () => {
    // A placeholder present in one language but not the other throws at
    // runtime the moment that language is served, which is exactly the kind
    // of break that would only ever show up in production.
    for (const key of Object.keys(MESSAGES.ko)) {
        assert.deepEqual(
            [...tokensOf(MESSAGES.en[key])].sort(),
            [...tokensOf(MESSAGES.ko[key])].sort(),
            `placeholders differ for ${key}`
        );
    }
});

test("T-B01-04: an unknown key throws instead of returning something plausible", () => {
    withLang("ko", () => {
        assert.throws(() => t("no.such.key"), /unknown message key/);
    });
});

test("T-B01-05: a missing placeholder argument throws", () => {
    withLang("ko", () => {
        assert.throws(() => t("check.wrongCount"), /missing parameter/);
        assert.throws(() => t("check.wrongCount", {}), /missing parameter/);
        assert.equal(t("check.wrongCount", { count: 3 }), "정답과 다른 칸 3개");
    });
});

test("T-B01-06: the locale comes from the lang attribute, defaulting to Korean", () => {
    for (const lang of ["en", "en-US", "EN"]) assert.equal(resolveLocale(lang), "en", lang);
    for (const lang of ["ko", "ko-KR", "", null, undefined, "fr"]) {
        assert.equal(resolveLocale(lang), "ko", String(lang));
    }
    assert.equal(withLang("en", () => t("action.newGame")), "New game");
    assert.equal(withLang("ko", () => t("action.newGame")), "새 게임");
});

test("T-B01-07: every CSS-injected key exists in both languages", () => {
    for (const [cssVar, key] of CSS_STRING_KEYS) {
        assert.match(cssVar, /^--i18n-/, cssVar);
        for (const locale of LOCALES) {
            assert.ok(key in MESSAGES[locale], `${locale} is missing ${key}`);
        }
    }
});
