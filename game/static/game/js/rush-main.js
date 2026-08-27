// Entry point for /rush/, mirroring main.js: paint immediately, then hand off.
//
// The composition module is imported dynamically for the same reason main.js
// does it -- a static import would drag the whole view layer, and its
// document.createElement calls, into any test that merely imports this file.
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

if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
        const root = document.getElementById("app");
        if (!root) return;
        init(root);
        import("./rush/rush-app.js")
            .then(({ start }) => start(root))
            .catch((cause) => renderLoadFailure(root, cause));
    });
}
