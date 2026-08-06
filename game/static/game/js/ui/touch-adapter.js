// TouchAdapter: additive on top of the keyboard path (V4-02), never a
// replacement. Hard invariant: nothing here is an <input>, <textarea>, or
// contenteditable element -- every control is a plain <button>, because a
// focusable text-entry element would pop the on-screen keyboard the moment
// it is tapped, which this design can never allow.
const DIM = 9;
import { t } from "../i18n/claude-mhj_26_08_07_05_messages.js";
const LONG_PRESS_MS = 400;
const POINTERMOVE_SLOP = 10;

export function resolveVisibility(setting, coarseMatches) {
    if (!["auto", "show", "hide"].includes(setting)) {
        throw new RangeError(`unknown touchControls setting: ${setting}`);
    }
    if (typeof coarseMatches !== "boolean") {
        throw new TypeError("resolveVisibility: coarseMatches must be a boolean");
    }
    if (setting === "show") return "visible";
    if (setting === "hide") return "collapsed";
    return coarseMatches ? "visible" : "collapsed";
}

export function createTouchAdapter(deps) {
    const { root, store, settings, boardView, announcer } = deps;

    let sticky = false;
    let longPressTimer = null;
    let longPressFired = false;
    let pointerDownAt = null;

    // Cell First: tapping a cell selects it, and tapping a digit fills
    // whatever is currently selected. boardView.selection is the single
    // source of truth for that selection rather than a copy kept here, so
    // the digit bar and the keyboard can never disagree about which cell the
    // next digit lands in -- the board seeds a selection when it mounts, and
    // both adapters move it through the same boardView.select().
    function onDigitTap(d) {
        if (!Number.isInteger(d) || d < 1 || d > DIM) throw new RangeError(`digit out of range: ${d}`);
        const index = boardView.selection;
        if (!Number.isInteger(index)) return { ok: false, reason: "no-selection" };
        // Tapping the digit a cell already holds clears it (store.setValue
        // routes that to clearCell) -- the only way to erase by touch alone.
        const result = sticky
            ? store.toggleCandidate(index, d)
            : store.setValue(index, d, { autoRemoveCandidates: settings.get().autoRemoveCandidates });
        if (!result.ok && result.reason === "given") {
            announcer.announce("given-rejected", t("cell.givenRejected"));
        }
        return result;
    }

    function onCellTap(index) {
        if (!Number.isInteger(index) || index < 0 || index >= DIM * DIM) {
            throw new RangeError(`index out of range: ${index}`);
        }
        // Givens are selectable: arrow keys already let the keyboard land on
        // one, so refusing here would make the two input paths disagree about
        // where the selection can be. Entering a digit is what gets rejected,
        // in onDigitTap above.
        boardView.select(index);
        return { ok: true, reason: "selected" };
    }

    function onPencilTap() {
        sticky = !sticky;
        announcer.announce("sticky-mode", sticky ? t("touch.stickyOn") : t("touch.stickyOff"));
        return sticky;
    }

    // Re-tapping the digit already in a cell also clears it, but that is only
    // reachable once the user knows which digit is there and is impossible for
    // a cell holding only candidates -- store.clearCell wipes value and
    // candidates together, so this is the one erase that always works.
    function onEraseTap() {
        const index = boardView.selection;
        if (!Number.isInteger(index)) return { ok: false, reason: "no-selection" };
        const result = store.clearCell(index);
        if (!result.ok && result.reason === "given") {
            announcer.announce("given-rejected", t("cell.givenRejected"));
        }
        return result;
    }

    function onPointerDown(index) {
        longPressFired = false;
        pointerDownAt = { x: 0, y: 0 };
        longPressTimer = setTimeout(() => {
            longPressFired = true;
        }, LONG_PRESS_MS);
    }

    function onPointerMove(dx, dy) {
        if (longPressTimer === null) return;
        if (Math.hypot(dx, dy) > POINTERMOVE_SLOP) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }

    function onPointerUp(index) {
        if (longPressTimer !== null) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        if (!longPressFired) onCellTap(index);
        longPressFired = false;
    }

    return {
        onDigitTap,
        onCellTap,
        onPencilTap,
        onEraseTap,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        get sticky() { return sticky; },
    };
}
