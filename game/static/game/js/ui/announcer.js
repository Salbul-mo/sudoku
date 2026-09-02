// §11's live region policy is mostly about what NOT to announce: announcing
// every digit entry would be noise to a screen reader user. Gating the
// allowed event kinds in one module stops later blocks from adding ad hoc
// announcements.
const KINDS = new Set([
    "sticky-mode", "undo-redo", "given-rejected",
    "completion", "link-copied", "session", "storage-warning",
    // The practice page. "learn-mark" fires on every candidate press, which is
    // the one place this policy is deliberately relaxed: marking a candidate is
    // the answer being composed, not incidental input, and without it a screen
    // reader user gets no confirmation that a press landed.
    "learn-mark", "learn-result",
]);

export function createAnnouncer(container) {
    const region = document.createElement("div");
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-atomic", "true");
    region.className = "visually-hidden";
    container.appendChild(region);

    let last = "";

    return {
        announce(kind, message) {
            if (!KINDS.has(kind)) throw new RangeError(`unknown announce kind: ${kind}`);
            if (typeof message !== "string") throw new TypeError("announce: message must be a string");
            // A screen reader will not re-read an unchanged live region, so a
            // zero-width space is appended to force a re-read of the same text.
            region.textContent = message === last ? message + "​" : message;
            last = message;
        },
    };
}
