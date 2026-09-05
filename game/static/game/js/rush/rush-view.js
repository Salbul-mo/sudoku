// The countdown bar and the end-of-run panel.
//
// The bar is never the only signal: it carries the remaining seconds as text
// beside it, so the state is legible without relying on width or colour. Same
// rule the board follows for conflicts and completion.
import { t } from "../i18n/messages.js";
import { DEFAULT_RUSH_MODE, RUSH_MODES, rushModeForId } from "./config.js";

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

    let selectedMode = DEFAULT_RUSH_MODE;
    let lastResult = null;

    function setMode(modeId) {
        const mode = rushModeForId(modeId);
        if (mode === null) throw new RangeError(`unknown rush mode: ${modeId}`);
        selectedMode = mode.id;
        wrap.dataset.mode = selectedMode;
        return mode;
    }

    function modeText(modeId = selectedMode) {
        const mode = rushModeForId(modeId);
        if (mode === null) throw new RangeError(`unknown rush mode: ${modeId}`);
        return t("rush.modeValue", {
            mode: t(`rush.mode.${mode.id}`),
            seconds: mode.limitMs / 1000,
        });
    }

    setMode(selectedMode);

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

    function actionRow() {
        const row = document.createElement("div");
        row.className = "rush-actions";
        return row;
    }

    function changeModeButton(onClick) {
        return button("rush.changeMode", onClick);
    }

    function showModePicker(fromResult) {
        panel.replaceChildren();
        wrap.dataset.state = "mode-select";

        const title = document.createElement("p");
        title.className = "rush-mode-title";
        title.textContent = t("rush.modeTitle");

        const options = document.createElement("div");
        options.className = "rush-mode-options";
        let draftMode = selectedMode;
        const optionButtons = [];

        function paintOptions() {
            for (const { button: option, mode } of optionButtons) {
                option.setAttribute("aria-pressed", String(mode.id === draftMode));
            }
        }

        for (const mode of RUSH_MODES) {
            const option = document.createElement("button");
            option.type = "button";
            option.className = "rush-mode-option";
            option.dataset.mode = mode.id;
            option.textContent = t("rush.modeOption", {
                mode: t(`rush.mode.${mode.id}`),
                seconds: mode.limitMs / 1000,
            });
            option.addEventListener("click", () => {
                draftMode = mode.id;
                paintOptions();
            });
            options.appendChild(option);
            optionButtons.push({ button: option, mode });
        }
        paintOptions();

        const actions = actionRow();
        const apply = button("rush.modeApply", () => {
            setMode(draftMode);
            deps.onRestart(selectedMode);
        });
        const cancel = button("rush.modeCancel", () => {
            if (fromResult && lastResult !== null) showResult(lastResult);
            else showStart();
        });
        actions.append(apply, cancel);
        panel.append(title, options, actions);
        optionButtons.find(({ mode }) => mode.id === draftMode)?.button.focus();
        return { title, options, apply, cancel };
    }

    function showStart() {
        panel.replaceChildren();
        wrap.dataset.state = "idle";
        lastResult = null;

        const current = document.createElement("p");
        current.className = "rush-mode-current";
        current.textContent = t("rush.modeCurrent", { value: modeText() });

        const actions = actionRow();
        const start = button("rush.start", () => deps.onRestart(selectedMode));
        const change = changeModeButton(() => showModePicker(false));
        actions.append(start, change);
        panel.append(current, actions);
        return start;
    }

    function showResult(state, modeId = selectedMode) {
        setMode(modeId);
        lastResult = state;
        panel.replaceChildren();
        wrap.dataset.state = "over";

        const summary = document.createElement("p");
        summary.className = "rush-summary";
        summary.textContent = t("rush.gameOver", { score: state.score, combo: state.bestCombo });
        panel.appendChild(summary);

        const mode = document.createElement("p");
        mode.className = "rush-mode-result";
        mode.textContent = t("rush.modeCurrent", { value: modeText() });
        panel.appendChild(mode);

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

        const actions = actionRow();
        const again = button("rush.restart", () => deps.onRestart(selectedMode));
        const change = changeModeButton(() => showModePicker(true));
        actions.append(again, change);
        panel.appendChild(actions);
        again.focus();
        return { summary, mode, record, again, change };
    }

    function clearPanel() {
        panel.replaceChildren();
        wrap.dataset.state = "playing";
        lastResult = null;
    }

    return {
        element: wrap,
        tick,
        showStart,
        showResult,
        setMode,
        mode: () => selectedMode,
        clearPanel,
        destroy() { wrap.remove(); },
    };
}
