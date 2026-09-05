// The practice header: which technique is being drilled, and how it has gone.
//
// Deliberately not ui/app-shell.js or rush-shell.js. The classic header is
// check / new game / clear / share / settings / help, and the rush header is
// score / combo / lives; a page whose only choice is "which deduction do I want
// to see" shares nothing with either but the language switch.
//
// The techniques are buttons rather than a <select>. There are seven of them,
// the set never grows at runtime, and a picker that takes one press beats one
// that takes a press, a scroll and a second press -- especially on a phone,
// where this page is mostly used one-handed.
import { t } from "../i18n/messages.js";
import { ALL_TECHNIQUES } from "../rush/techniques.js";
import { createLangSwitch } from "../ui/page-links.js";

export function mountLearnShell(root, deps = {}) {
    if (!root || typeof root.appendChild !== "function") {
        throw new TypeError("mountLearnShell: root must be an Element");
    }
    if (typeof deps.onSelectTechnique !== "function") {
        throw new TypeError("mountLearnShell: deps.onSelectTechnique must be a function");
    }

    const header = document.createElement("div");
    header.className = "learn-header";

    const title = document.createElement("h2");
    title.className = "learn-page-title";
    title.textContent = t("learn.pageTitle");

    const subtitle = document.createElement("p");
    subtitle.className = "learn-page-subtitle";
    subtitle.textContent = t("learn.pageSubtitle");

    const label = document.createElement("h3");
    label.className = "learn-picker-label";
    label.textContent = t("learn.pickTechnique");

    const picker = document.createElement("div");
    picker.className = "learn-picker";
    // A group rather than a toolbar: these choose what the page is showing, so
    // a screen reader should hear them as one labelled set.
    picker.setAttribute("role", "group");
    picker.setAttribute("aria-labelledby", "learn-picker-label");
    label.id = "learn-picker-label";

    const buttons = new Map();
    for (const technique of ALL_TECHNIQUES) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "learn-technique control";
        button.dataset.technique = technique;
        // aria-pressed rather than a class alone: which technique is active is
        // information, and a colour change does not carry it.
        button.setAttribute("aria-pressed", "false");

        const name = document.createElement("span");
        name.className = "learn-technique-name";
        name.textContent = t(`learn.name.${technique}`);

        const score = document.createElement("span");
        score.className = "learn-technique-score";
        score.textContent = t("learn.noProgress");

        button.append(name, score);
        button.addEventListener("click", () => deps.onSelectTechnique(technique));
        picker.appendChild(button);
        buttons.set(technique, { button, score });
    }

    const links = document.createElement("div");
    links.className = "learn-header-links";
    links.appendChild(createLangSwitch("learn"));

    header.append(title, subtitle, label, picker, links);
    root.appendChild(header);

    return {
        element: header,

        setProgress(all) {
            for (const [technique, { score }] of buttons) {
                const entry = all?.[technique];
                score.textContent = entry
                    ? t("learn.progress", { solved: entry.solved, tried: entry.tried })
                    : t("learn.noProgress");
            }
        },

        setActive(technique) {
            for (const [name, { button }] of buttons) {
                button.setAttribute("aria-pressed", name === technique ? "true" : "false");
            }
        },

        setBusy(busy) {
            for (const { button } of buttons.values()) button.disabled = busy;
        },

        destroy() {
            header.remove();
        },
    };
}
