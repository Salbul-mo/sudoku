// What is being asked, how it went, and why.
//
// The explanation only ever appears after a correct answer. Showing the
// reasoning up front would turn every exercise into reading comprehension --
// the point is to find the deduction on the board and then have it named, not
// to be told it and go looking for the match.
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
    for (const name of ["onSubmit", "onNext"]) {
        if (typeof deps[name] !== "function") {
            throw new TypeError(`mountLearnView: deps.${name} must be a function`);
        }
    }

    const wrap = document.createElement("div");
    wrap.className = "learn-view";

    const prompt = document.createElement("p");
    prompt.className = "learn-prompt";

    // The count of marked candidates. Not a live region: it changes on every
    // press, and a screen reader repeating it each time would bury the
    // announcement that actually matters.
    const tally = document.createElement("p");
    tally.className = "learn-tally";

    const result = document.createElement("p");
    result.className = "learn-result";

    const explanation = document.createElement("p");
    explanation.className = "learn-explanation";

    const actions = document.createElement("div");
    actions.className = "learn-actions";

    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "learn-submit control";
    submit.textContent = t("learn.submit");
    submit.addEventListener("click", () => deps.onSubmit());

    const next = document.createElement("button");
    next.type = "button";
    next.className = "learn-next control";
    next.textContent = t("learn.next");
    next.addEventListener("click", () => deps.onNext());

    actions.append(submit, next);
    wrap.append(prompt, tally, result, explanation, actions);
    root.appendChild(wrap);

    function clear() {
        result.textContent = "";
        result.dataset.state = "";
        explanation.textContent = "";
        tally.textContent = "";
    }

    return {
        element: wrap,

        showLoading() {
            clear();
            prompt.textContent = t("learn.loading");
            submit.hidden = true;
            next.hidden = true;
        },

        showPrompt(lesson) {
            clear();
            prompt.textContent = t(PROMPTS[lesson.kind]);
            // Submit belongs to the pruning exercises alone: a placement is
            // judged the moment a digit is pressed, so a button that only ever
            // repeated that judgement would be a control with nothing to do.
            submit.hidden = lesson.kind !== "elimination";
            next.hidden = true;
            if (lesson.kind === "elimination") tally.textContent = t("learn.markCount", { count: 0 });
        },

        showMarkCount(count) {
            tally.textContent = t("learn.markCount", { count });
        },

        showResult(ok, lesson) {
            result.dataset.state = ok ? "correct" : "retry";
            if (ok) {
                result.textContent = t("learn.correct");
                explanation.textContent = t(EXPLANATIONS[lesson.deduction.technique]);
                submit.hidden = true;
                next.hidden = false;
                next.focus();
                return;
            }
            result.textContent = lesson.kind === "elimination"
                ? t("learn.wrongElimination")
                : t("learn.wrongPlacement");
            explanation.textContent = "";
        },

        showExhausted() {
            clear();
            prompt.textContent = t("learn.exhausted");
            submit.hidden = true;
            next.hidden = true;
        },

        // Reuses the retry panel the two games already show for a dropped
        // connection, so the same failure looks the same everywhere.
        showError(cause) {
            clear();
            prompt.textContent = "";
            submit.hidden = true;
            next.hidden = true;
            const panel = document.createElement("div");
            panel.className = "retry-panel";
            const message = document.createElement("p");
            message.textContent = t(`retry.${cause === "offline" ? "offline" : "network"}`);
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = t("retry.button");
            button.addEventListener("click", () => {
                panel.remove();
                deps.onNext();
            });
            panel.append(message, button);
            wrap.appendChild(panel);
            button.focus();
        },

        destroy() {
            wrap.remove();
        },
    };
}
