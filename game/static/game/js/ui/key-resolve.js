// Physical key resolution (RK6): event.code is the layout-independent source
// of truth, with event.key as a fallback for the rare input method that
// never fires a recognizable code. Plain objects are accepted, not just real
// DOM Events, so this is testable in node (CV1).
const CODE_DIGIT = /^(Digit|Numpad)([1-9])$/;

export function resolveDigit(ev) {
    if (typeof ev?.code !== "string" || typeof ev?.key !== "string") {
        throw new TypeError("resolveDigit: expected an object with code and key strings");
    }
    const m = CODE_DIGIT.exec(ev.code);
    if (m) return Number(m[2]);
    return /^[1-9]$/.test(ev.key) ? Number(ev.key) : null;
}

const CLEAR_CODES = new Set(["Digit0", "Numpad0", "Backspace", "Delete"]);

// Ctrl is a *modifier* on movement, not a separate shortcut: KEYMAP documents
// Ctrl+Arrow as a one-box jump and Ctrl+Home/End as grid start/end, and
// moveSelection() implements both. These codes therefore have to fall through
// the ctrl branch to the movement switch below; every other code with Ctrl
// held stays unclaimed so browser and OS shortcuts keep working.
const CTRL_NAV_CODES = new Set([
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End",
]);

export function resolveAction(ev) {
    if (typeof ev?.code !== "string" || typeof ev?.key !== "string") {
        throw new TypeError("resolveAction: expected an object with code and key strings");
    }
    if (ev.metaKey) return null; // never claim an OS-level shortcut

    if (ev.ctrlKey) {
        if (ev.code === "KeyZ") return ev.shiftKey ? "redo" : "undo";
        if (ev.code === "KeyY") return "redo";
        if (!CTRL_NAV_CODES.has(ev.code)) return null;
    }

    if (CLEAR_CODES.has(ev.code)) return "clear";

    switch (ev.code) {
        case "ArrowUp": return "moveUp";
        case "ArrowDown": return "moveDown";
        case "ArrowLeft": return "moveLeft";
        case "ArrowRight": return "moveRight";
        case "Home": return "lineStart";
        case "End": return "lineEnd";
        case "Space": return "stickyToggle";
        case "F1": return "help";
        default:
            return ev.key === "?" ? "help" : null;
    }
}
