// TouchAdapter: additive on top of the keyboard path (V4-02), never a
// replacement. Hard invariant: nothing here is an <input>, <textarea>, or
// contenteditable element -- every control is a plain <button>, because a
// focusable text-entry element would pop the on-screen keyboard the moment
// it is tapped, which this design can never allow.
const DIM = 9;
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
    const { root, store, settings, boardView, announcer, openNoteEditor, openNotesList } = deps;
    for (const [name, cb] of Object.entries({ openNoteEditor, openNotesList })) {
        if (typeof cb !== "function") {
            throw new TypeError(`createTouchAdapter: deps.${name} must be a function`);
        }
    }

    let activeDigit = null;
    let sticky = false;
    let selection = null;
    let longPressTimer = null;
    let longPressFired = false;
    let pointerDownAt = null;

    function onDigitTap(d) {
        if (!Number.isInteger(d) || d < 1 || d > DIM) throw new RangeError(`digit out of range: ${d}`);
        activeDigit = activeDigit === d ? null : d;
        return activeDigit;
    }

    function onCellTap(index) {
        if (!Number.isInteger(index) || index < 0 || index >= DIM * DIM) {
            throw new RangeError(`index out of range: ${index}`);
        }
        if (store.session.givens[index]) {
            announcer.announce("given-rejected", "고정된 칸입니다");
            return { ok: false, reason: "given" };
        }
        if (activeDigit === null) {
            boardView.select(index);
            selection = index;
            return { ok: true, reason: "selected" };
        }
        const result = sticky
            ? store.toggleCandidate(index, activeDigit)
            : store.setValue(index, activeDigit, { autoRemoveCandidates: settings.get().autoRemoveCandidates });
        selection = index;
        return result;
    }

    function onPencilTap() {
        sticky = !sticky;
        announcer.announce("sticky-mode", sticky ? "후보 입력 모드 켜짐" : "후보 입력 모드 꺼짐");
        return sticky;
    }

    function onMemoTap() {
        if (selection === null) return openNotesList();
        return openNoteEditor({ kind: "cell", key: selection });
    }

    function onPointerDown(index) {
        longPressFired = false;
        pointerDownAt = { x: 0, y: 0 };
        longPressTimer = setTimeout(() => {
            longPressFired = true;
            navigator.vibrate?.(10);
            openNoteEditor({ kind: "cell", key: index });
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
        onMemoTap,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        get activeDigit() { return activeDigit; },
        get sticky() { return sticky; },
    };
}
