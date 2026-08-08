// The rush header: score, combo, lives, and the language switch.
//
// Deliberately not ui/app-shell.js. That module is the classic game's header --
// check answer, new game, clear all, share, settings, help -- and none of it
// applies to a run against a clock.
import { t, resolveLocale } from "../i18n/claude-mhj_26_08_07_05_messages.js";
import { RUSH } from "./claude-mhj_26_08_07_11_config.js";

// Duplicated from ui/app-shell.js on purpose and only until the cross-game
// links land: extracting it now would mean editing the classic game's shell,
// which this work is staying out of until that block. The extraction into
// ui/lang-switch.js is the first thing that block does.
function buildLangSwitch() {
    const other = resolveLocale(document.documentElement.lang) === "en" ? "ko" : "en";
    const link = document.createElement("a");
    link.className = "lang-switch";
    link.href = other === "en" ? "/en/rush/" : "/rush/";
    link.textContent = t("nav.otherLanguage");
    link.setAttribute("hreflang", other);
    link.setAttribute("rel", "alternate");
    return link;
}

function statBlock(labelKey) {
    const wrap = document.createElement("div");
    wrap.className = "rush-stat";
    const label = document.createElement("span");
    label.className = "rush-stat-label";
    label.textContent = t(labelKey);
    const value = document.createElement("span");
    value.className = "rush-stat-value";
    wrap.append(label, value);
    return { wrap, value };
}

export function mountRushShell(root, deps = {}) {
    if (!root || typeof root.appendChild !== "function") {
        throw new TypeError("mountRushShell: root must be an Element");
    }

    const header = document.createElement("div");
    header.className = "rush-header";

    const score = statBlock("rush.score");
    const combo = statBlock("rush.combo");
    const lives = statBlock("rush.lives");
    header.append(score.wrap, combo.wrap, lives.wrap, buildLangSwitch());
    root.appendChild(header);

    function setStats(state) {
        score.value.textContent = String(state.score);
        combo.value.textContent = String(state.combo);
        // Spelled out rather than drawn as hearts: a count reads the same to a
        // screen reader as it does on screen, and never relies on shape alone.
        lives.value.textContent = `${state.lives} / ${RUSH.LIVES}`;
        header.dataset.lives = String(state.lives);
    }

    return {
        element: header,
        setStats,
        destroy() { header.remove(); },
    };
}
