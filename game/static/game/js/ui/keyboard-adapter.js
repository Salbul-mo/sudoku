// KeyboardAdapter is always active regardless of viewport (V4-02). Digit
// entry has two equal paths -- Shift quasimode and Space sticky -- because
// RK6 (AZERTY layouts) means Shift cannot be the only way to enter a
// candidate. Everything here defers to core/board-nav.js for movement and to
// ui/key-resolve.js for physical-key interpretation; this module only wires
// the two together and owns the sticky/selection state a live keyboard
// session needs.
import { moveSelection } from "./board-nav.js";
import { resolveAction, resolveDigit } from "./key-resolve.js";
import { t } from "../i18n/claude-mhj_26_08_07_05_messages.js";

// Single source of truth for the keymap: UI-B14's help dialog reads this,
// rather than keeping a second copy of the same text.
//
// A function rather than a frozen constant, because the labels come from the
// message catalogue: a constant built at import time would bake in whichever
// language happened to be active when the module first loaded.
const KEYMAP_IDS = Object.freeze([
    ["arrows", "moveUp/Down/Left/Right"],
    ["ctrlArrows", "box jump"],
    ["homeEnd", "lineStart/lineEnd"],
    ["ctrlHomeEnd", "grid start/end"],
    ["digits", "value"],
    ["shiftDigits", "candidate"],
    ["space", "stickyToggle"],
    ["delete", "clear"],
    ["undo", "undo"],
    ["redo", "redo"],
    ["help", "help"],
]);

export function getKeymap() {
    return KEYMAP_IDS.map(([id, action]) => ({
        combo: t(`keymap.${id}.combo`),
        action,
        desc: t(`keymap.${id}.desc`),
    }));
}

const NAV = Object.freeze({
    moveUp: "up", moveDown: "down", moveLeft: "left", moveRight: "right",
    lineStart: "lineStart", lineEnd: "lineEnd",
});

export function boardHasFocus(active, gridRoot) {
    if (!(gridRoot instanceof Element)) {
        throw new TypeError("boardHasFocus: gridRoot must be an Element");
    }
    if (!active || active === document.body) return false;
    if (active.closest?.('[role="dialog"]')) return false;
    if (active.matches?.('textarea, input, select, [contenteditable="true"]')) return false;
    return gridRoot.contains(active) && active.getAttribute("role") === "gridcell";
}

export function createKeyboardAdapter(deps) {
    const { gridRoot, store, settings, boardView, announcer, openHelp } = deps;
    for (const [name, cb] of Object.entries({ openHelp })) {
        if (typeof cb !== "function") {
            throw new TypeError(`createKeyboardAdapter: deps.${name} must be a function`);
        }
    }

    let selection = null;
    let sticky = false;

    function onKeyDown(ev) {
        if (!boardHasFocus(document.activeElement, gridRoot)) return;

        const digit = resolveDigit(ev);
        if (digit !== null) {
            if (selection === null) return;
            const asCandidate = (ev.shiftKey && settings.get().shiftQuasimode) || sticky;
            const result = asCandidate
                ? store.toggleCandidate(selection, digit)
                : store.setValue(selection, digit, { autoRemoveCandidates: settings.get().autoRemoveCandidates });
            if (!result.ok && result.reason === "given") {
                announcer.announce("given-rejected", t("cell.givenRejected"));
            }
            ev.preventDefault();
            return;
        }

        const action = resolveAction(ev);
        if (action === null) return;

        if (action in NAV) {
            const from = selection ?? 0;
            const to = moveSelection(from, NAV[action], ev.ctrlKey ? "ctrl" : "none");
            if (to !== from || selection === null) {
                boardView.select(to);
                selection = to;
            }
            ev.preventDefault();
            return;
        }

        if (action === "stickyToggle") {
            // boardHasFocus already required role=gridcell to reach this point,
            // so Space here can never be a button activation (V-UI-B07-05).
            sticky = !sticky;
            announcer.announce("sticky-mode", sticky ? t("touch.stickyOn") : t("touch.stickyOff"));
            ev.preventDefault();
            return;
        }

        if (action === "clear") {
            if (selection !== null) store.clearCell(selection);
            ev.preventDefault();
            return;
        }

        switch (action) {
            case "help": openHelp(); break;
            case "undo": store.undo(); break;
            case "redo": store.redo(); break;
        }
    }

    return {
        onKeyDown,
        get sticky() { return sticky; },
        get selection() { return selection; },
        select(index) { boardView.select(index); selection = index; },
    };
}
