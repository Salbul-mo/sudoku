// The practice page's instruction, board slot, input controls and feedback.
//
// The DOM order follows the task a player is trying to complete: understand
// the question, inspect the board, provide an answer, then read the result.
// This view owns no lesson logic. Digit buttons only call onDigit, while the
// game decides whether that digit is a placement answer or a candidate mark.
//
// Every string goes through textContent. Nothing here builds markup from a
// message, so a translation can never become an injection path.
import { t } from "../i18n/messages.js";

const PROMPTS = { placement: "learn.askPlacement", elimination: "learn.askElimination" };

// The placement explanations already exist -- the rush mode says the same three
// sentences when it teaches the same three deductions -- so they are reused
// rather than restated under a second key that could drift out of step.
const EXPLANATIONS = {
    "naked-single": "rush.technique.naked-single",
    "hidden-single-box": "rush.technique.hidden-single-box",
    "hidden-single-line": "rush.technique.hidden-single-line",
    pointing: "learn.technique.pointing",
    claiming: "learn.technique.claiming",
    "naked-pair": "learn.technique.naked-pair",
    "hidden-pair": "learn.technique.hidden-pair",
};

export function mountLearnView(root, deps = {}) {
    if (!root || typeof root.appendChild !== "function") {
        throw new TypeError("mountLearnView: root must be an Element");
    }
    for (const name of ["onDigit", "onSubmit", "onNext"]) {
        if (typeof deps[name] !== "function") {
            throw new TypeError(`mountLearnView: deps.${name} must be a function`);
        }
    }

    const wrap = document.createElement("div");
    wrap.className = "learn-view";

    const instruction = document.createElement("section");
    instruction.className = "learn-instruction";

    const prompt = document.createElement("p");
    prompt.className = "learn-prompt";
    instruction.appendChild(prompt);

    // The board is mounted by learn-game.js, but the view places its host in
    // the same semantic sequence as the surrounding instructions and controls.
    const boardHost = document.createElement("div");
    boardHost.className = "board-area learn-board-area";

    const controls = document.createElement("section");
    controls.className = "learn-controls";

    const digitPrompt = document.createElement("p");
    digitPrompt.className = "learn-digit-prompt";
    digitPrompt.textContent = t("learn.pickDigit");
    digitPrompt.id = "learn-digit-prompt";

    const digitPad = document.createElement("div");
    digitPad.className = "learn-digit-pad";
    digitPad.setAttribute("role", "group");
    digitPad.setAttribute("aria-label", t("learn.pickDigit"));

    const digitButtons = [];
    for (let digit = 1; digit <= 9; digit++) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "learn-digit control";
        button.dataset.digit = String(digit);
        button.textContent = String(digit);
        button.setAttribute("aria-label", t("learn.digitLabel", { digit }));
        button.addEventListener("click", () => deps.onDigit(digit));
        digitPad.appendChild(button);
        digitButtons.push(button);
    }
    controls.append(digitPrompt, digitPad);

    // The count is useful only for elimination exercises. It lives with the
    // input control rather than below the result so the current answer is
    // visible while the player is composing it.
    const tally = document.createElement("p");
    tally.className = "learn-tally";
    controls.appendChild(tally);

    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "learn-submit control";
    submit.textContent = t("learn.submit");
    submit.addEventListener("click", () => deps.onSubmit());
    controls.appendChild(submit);

    const feedback = document.createElement("section");
    feedback.className = "learn-feedback";

    const result = document.createElement("p");
    result.className = "learn-result";

    const explanation = document.createElement("p");
    explanation.className = "learn-explanation";

    const actions = document.createElement("div");
    actions.className = "learn-actions";

    const next = document.createElement("button");
    next.type = "button";
    next.className = "learn-next control";
    next.textContent = t("learn.next");
    next.addEventListener("click", () => deps.onNext());

    actions.appendChild(next);
    feedback.append(result, explanation, actions);
    wrap.append(instruction, boardHost, controls, feedback);
    root.appendChild(wrap);

    let retryPanel = null;

    function setDigitPadDisabled(disabled) {
        for (const button of digitButtons) button.disabled = disabled;
    }

    function clear() {
        retryPanel?.remove();
        retryPanel = null;
        result.textContent = "";
        result.dataset.state = "";
        result.hidden = true;
        explanation.textContent = "";
        explanation.hidden = true;
        tally.textContent = "";
        tally.hidden = true;
        digitPrompt.hidden = true;
        digitPad.hidden = true;
        setDigitPadDisabled(false);
        submit.hidden = true;
        next.hidden = true;
    }

    return {
        element: wrap,
        boardHost,

        showLoading() {
            clear();
            prompt.textContent = t("learn.loading");
        },

        showPrompt(lesson) {
            clear();
            const placement = lesson.kind === "placement";
            prompt.textContent = t(PROMPTS[lesson.kind]);
            digitPrompt.hidden = !placement;
            digitPad.hidden = !placement;
            tally.hidden = placement;
            submit.hidden = placement;
        },

        showMarkCount(count) {
            tally.textContent = t("learn.markCount", { count });
            tally.hidden = false;
        },

        showResult(ok, lesson) {
            result.dataset.state = ok ? "correct" : "retry";
            result.hidden = false;
            if (ok) {
                result.textContent = t("learn.correct");
                explanation.textContent = t(EXPLANATIONS[lesson.deduction.technique]);
                explanation.hidden = false;
                submit.hidden = true;
                digitPrompt.hidden = true;
                digitPad.hidden = true;
                setDigitPadDisabled(true);
                next.hidden = false;
                next.focus();
                return;
            }
            result.textContent = lesson.kind === "elimination"
                ? t("learn.wrongElimination")
                : t("learn.wrongPlacement");
            explanation.textContent = "";
            explanation.hidden = true;
            if (lesson.kind === "elimination") {
                tally.hidden = false;
                submit.hidden = false;
            } else {
                digitPrompt.hidden = false;
                digitPad.hidden = false;
                setDigitPadDisabled(false);
            }
            next.hidden = true;
        },

        showExhausted() {
            clear();
            prompt.textContent = t("learn.exhausted");
        },

        // Reuses the retry panel the two games already show for a dropped
        // connection, so the same failure looks the same everywhere.
        showError(cause) {
            clear();
            prompt.textContent = "";
            const panel = document.createElement("div");
            panel.className = "retry-panel";
            const message = document.createElement("p");
            message.textContent = t(`retry.${cause === "offline" ? "offline" : "network"}`);
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = t("retry.button");
            button.addEventListener("click", () => {
                retryPanel = null;
                panel.remove();
                deps.onNext();
            });
            panel.append(message, button);
            feedback.appendChild(panel);
            retryPanel = panel;
            button.focus();
        },

        destroy() {
            wrap.remove();
        },
    };
}
