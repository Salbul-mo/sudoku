// The countdown bar and the end-of-run panel.
//
// The bar is never the only signal: it carries the remaining seconds as text
// beside it, so the state is legible without relying on width or colour. Same
// rule the board follows for conflicts and completion.
import { t } from "../i18n/messages.js";

export function mountRushView(root, deps = {}) {
    if (!root || typeof root.appendChild !== "function") {
        throw new TypeError("mountRushView: root must be an Element");
    }
    if (typeof deps.onRestart !== "function") {
        throw new TypeError("mountRushView: deps.onRestart must be a function");
    }

    const wrap = document.createElement("div");
    wrap.className = "rush-view";

    const timer = document.createElement("div");
    timer.className = "rush-timer";
    const fill = document.createElement("div");
    fill.className = "rush-timer-fill";
    const readout = document.createElement("span");
    readout.className = "rush-timer-readout";
    timer.append(fill, readout);

    const hint = document.createElement("p");
    hint.className = "rush-hint";
    hint.textContent = t("rush.howTo");

    const panel = document.createElement("div");
    panel.className = "rush-panel";

    wrap.append(timer, hint, panel);
    root.appendChild(wrap);

    // Clamped because a paused clock can report a value from before the limit
    // shrank, and a bar wider than its track looks like a rendering fault.
    function tick(remainingMs, limitMs) {
        const ratio = limitMs > 0 ? Math.min(1, Math.max(0, remainingMs / limitMs)) : 0;
        fill.style.width = `${(ratio * 100).toFixed(1)}%`;
        fill.dataset.low = ratio <= 0.25 ? "1" : "0";
        // A zero-width bar still paints its 1px border on each side, which
        // reads as a sliver of time left when there is none.
        fill.dataset.empty = ratio <= 0 ? "1" : "0";
        readout.textContent = t("rush.timeLeft", { seconds: (remainingMs / 1000).toFixed(1) });
    }

    function button(labelKey, onClick) {
        const el = document.createElement("button");
        el.type = "button";
        el.textContent = t(labelKey);
        el.addEventListener("click", onClick);
        return el;
    }

    function showStart() {
        panel.replaceChildren();
        wrap.dataset.state = "idle";
        const start = button("rush.start", () => deps.onRestart());
        panel.appendChild(start);
        return start;
    }

    function showResult(state) {
        panel.replaceChildren();
        wrap.dataset.state = "over";

        const summary = document.createElement("p");
        summary.className = "rush-summary";
        summary.textContent = t("rush.gameOver", { score: state.score, combo: state.bestCombo });
        panel.appendChild(summary);

        const record = document.createElement("p");
        record.className = "rush-record";
        if (!state.persisted) {
            record.textContent = t("rush.noRecord");
        } else if (state.score >= state.best.bestScore && state.score > 0) {
            record.textContent = t("rush.newBest", { score: state.score });
        } else {
            record.textContent = t("rush.best", { score: state.best.bestScore });
        }
        panel.appendChild(record);

        const again = button("rush.restart", () => deps.onRestart());
        panel.appendChild(again);
        again.focus();
        return { summary, record, again };
    }

    function clearPanel() {
        panel.replaceChildren();
        wrap.dataset.state = "playing";
    }

    return {
        element: wrap,
        tick,
        showStart,
        showResult,
        clearPanel,
        destroy() { wrap.remove(); },
    };
}
