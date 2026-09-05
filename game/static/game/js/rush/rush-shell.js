// The rush header: score, combo, lives, and the language switch.
//
// Deliberately not ui/app-shell.js. That module is the classic game's header --
// check answer, new game, clear all, share, settings, help -- and none of it
// applies to a run against a clock.
import { t } from "../i18n/messages.js";
import { createLangSwitch } from "../ui/page-links.js";
import { RUSH } from "./config.js";

// A card: a quiet label over the number. `extra` rides on the same line as the
// number rather than under it -- the lives pips are a second reading of that
// very number, not a separate fact.
function statBlock(labelKey, { modifier = "", extra = null } = {}) {
    const wrap = document.createElement("div");
    wrap.className = modifier ? `rush-stat ${modifier}` : "rush-stat";
    const label = document.createElement("span");
    label.className = "rush-stat-label";
    label.textContent = t(labelKey);
    const line = document.createElement("div");
    line.className = "rush-stat-line";
    const value = document.createElement("span");
    value.className = "rush-stat-value";
    line.appendChild(value);
    if (extra) line.appendChild(extra);
    wrap.append(label, line);
    return { wrap, value };
}

// One marker per life, filled or spent. Purely a second reading of the count
// beside it -- aria-hidden because a screen reader already gets "3 / 3" from
// the value, and nine repetitions of a bullet would only be noise. Kept as
// separate spans rather than one string so the spent ones can be dimmed.
function livesPips() {
    const wrap = document.createElement("span");
    wrap.className = "rush-lives-pips";
    wrap.setAttribute("aria-hidden", "true");
    const pips = [];
    for (let i = 0; i < RUSH.LIVES; i++) {
        const pip = document.createElement("span");
        pip.className = "rush-life";
        pip.textContent = "●"; // filled circle; spent ones are hollowed in CSS
        wrap.appendChild(pip);
        pips.push(pip);
    }
    return { wrap, pips };
}

export function mountRushShell(root, deps = {}) {
    if (!root || typeof root.appendChild !== "function") {
        throw new TypeError("mountRushShell: root must be an Element");
    }

    const header = document.createElement("div");
    header.className = "rush-header";

    const score = statBlock("rush.score");
    const combo = statBlock("rush.combo");
    const pips = livesPips();
    const lives = statBlock("rush.lives", { modifier: "rush-stat-lives", extra: pips.wrap });

    // The three numbers are one group, so they get one container: it keeps
    // them on an even grid instead of letting flex wrap them at whatever width
    // their text happens to be, and gives the page links something to sit
    // beside rather than between.
    const stats = document.createElement("div");
    stats.className = "rush-stats";
    stats.append(score.wrap, combo.wrap, lives.wrap);

    // Header navigation only carries the language switch. Game modes are
    // linked from the footer, so the game switch is intentionally not mounted
    // here.
    const links = document.createElement("div");
    links.className = "rush-header-links";

    // Built only when the composition has something for it to do, so the tests
    // that mount a bare shell -- and any future page that reuses this header --
    // do not get a button that leads nowhere.
    let swap = null;
    if (typeof deps.onSwap === "function") {
        swap = document.createElement("button");
        swap.type = "button";
        swap.className = "rush-swap";
        swap.textContent = t("rush.swap");
        swap.disabled = true; // nothing to swap until a run is on
        swap.addEventListener("click", () => deps.onSwap());
        links.appendChild(swap);
    }

    links.append(createLangSwitch("rush"));

    header.append(stats, links);
    root.appendChild(header);

    function setStats(state) {
        score.value.textContent = String(state.score);
        combo.value.textContent = String(state.combo);
        // Spelled out rather than drawn as hearts: a count reads the same to a
        // screen reader as it does on screen, and never relies on shape alone.
        // The pips below repeat the same number visually, so how many lives
        // are left can be taken in without reading the fraction.
        // No spaces around the slash: three cards share a phone's width and the
        // padded form is what pushed the pips out of this one.
        lives.value.textContent = `${state.lives}/${RUSH.LIVES}`;
        for (let i = 0; i < pips.pips.length; i++) {
            pips.pips[i].dataset.spent = i < state.lives ? "0" : "1";
        }
        header.dataset.lives = String(state.lives);
    }

    // Without this the header sits blank until the first step lands, so the
    // start screen never says how many lives a run gets.
    setStats({ score: 0, combo: 0, lives: RUSH.LIVES });

    function setSwapEnabled(on) {
        if (swap) swap.disabled = !on;
    }

    // Whether the swap currently costs the combo is the whole basis for
    // deciding to press it, so it is said in the label rather than signalled
    // by colour -- the same rule the lives count follows.
    function setSwapFree(free) {
        if (swap) swap.textContent = t(free ? "rush.swapFree" : "rush.swap");
    }

    return {
        element: header,
        setStats,
        setSwapEnabled,
        setSwapFree,
        destroy() { header.remove(); },
    };
}
