// Entry point for /printable-sudoku/, mirroring the other three: paint
// immediately, then hand off.
import { t } from "./i18n/messages.js";

export function init(root) {
    if (!root || typeof root.appendChild !== "function") {
        throw new TypeError("init(root): root must be an Element");
    }
    if (root.querySelector('[data-state="skeleton"]')) return;
    const shell = document.createElement("div");
    shell.dataset.state = "skeleton";
    shell.setAttribute("aria-busy", "true");
    root.appendChild(shell);
}

function renderLoadFailure(root, cause) {
    const panel = document.createElement("div");
    panel.className = "retry-panel";
    const message = document.createElement("p");
    message.textContent = t("fatal.load");
    const detail = document.createElement("p");
    detail.className = "retry-detail";
    detail.textContent = String(cause?.message ?? cause);
    panel.append(message, detail);
    root.appendChild(panel);
}

// Browser only. Keeps the module importable from node:test without side effects.
if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
        const root = document.getElementById("app");
        if (!root) return;
        init(root);
        import("./printable/printable-app.js")
            .then(({ start }) => start(root))
            .catch((cause) => renderLoadFailure(root, cause));
    });
}
