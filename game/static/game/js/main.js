// Entry point, deliberately thin. Its only jobs are to paint something
// immediately and to hand off to app.js, which owns the actual composition.
//
// app.js is imported dynamically rather than statically so this module stays
// side-effect-free under `import` in node: a static import would pull the whole
// view layer, and its document.createElement calls, into any test that merely
// imports the entry point.
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

// A failed module fetch is the one path app.js cannot report on, because it
// never runs. Handling it here keeps the "never a blank page" rule (M1) true
// even when the network drops between the HTML and the JavaScript.
function renderLoadFailure(root, cause) {
    const panel = document.createElement("div");
    panel.className = "retry-panel";
    const message = document.createElement("p");
    message.textContent = "앱을 불러오지 못했습니다. 페이지를 새로고침해 주세요.";
    panel.appendChild(message);
    const detail = document.createElement("p");
    detail.className = "retry-detail";
    detail.textContent = String(cause?.message ?? cause);
    panel.appendChild(detail);
    root.appendChild(panel);
}

// Browser only.  Keeps the module importable from node:test without side effects.
if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
        const root = document.getElementById("app");
        if (!root) return;
        init(root); // first paint, before app.js has even been fetched
        import("./app.js")
            .then(({ start }) => start(root))
            .catch((cause) => renderLoadFailure(root, cause));
    });
}
