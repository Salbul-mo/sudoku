// KeyboardAdapter is always active regardless of viewport (V4-02). Digit
// entry has two equal paths -- Shift quasimode and Space sticky -- because
// RK6 (AZERTY layouts) means Shift cannot be the only way to enter a
// candidate. Everything here defers to core/board-nav.js for movement and to
// ui/key-resolve.js for physical-key interpretation; this module only wires
// the two together and owns the sticky/selection state a live keyboard
// session needs.
import { moveSelection } from "./board-nav.js";
import { resolveAction, resolveDigit } from "./key-resolve.js";

// Single source of truth for the keymap: UI-B14's help dialog reads this,
// rather than keeping a second copy of the same text.
export const KEYMAP = Object.freeze([
    { combo: "방향키", action: "moveUp/Down/Left/Right", desc: "한 칸 이동" },
    { combo: "Ctrl+방향키", action: "box jump", desc: "한 박스(3칸) 이동" },
    { combo: "Home/End", action: "lineStart/lineEnd", desc: "행 처음/끝으로 이동" },
    { combo: "Ctrl+Home/End", action: "grid start/end", desc: "격자 처음/끝으로 이동" },
    { combo: "숫자키 1-9", action: "value", desc: "값 입력, 재입력 시 지움" },
    { combo: "Shift+숫자키", action: "candidate", desc: "후보 토글 (shiftQuasimode 설정 시)" },
    { combo: "Space", action: "stickyToggle", desc: "후보 입력 모드 고정 토글" },
    { combo: "Delete / Backspace", action: "clear", desc: "칸 지우기" },
    { combo: "N", action: "note", desc: "셀 메모 열기" },
    { combo: "Shift+N", action: "regionNote", desc: "영역 메모 열기" },
    { combo: "M", action: "notesList", desc: "메모 목록 열기" },
    { combo: "Ctrl+Z", action: "undo", desc: "실행 취소" },
    { combo: "Ctrl+Shift+Z 또는 Ctrl+Y", action: "redo", desc: "다시 실행" },
    { combo: "? 또는 F1", action: "help", desc: "도움말 열기" },
]);

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
    const { gridRoot, store, settings, boardView, announcer,
        openNote, openRegionNote, openNotesList, openHelp } = deps;
    for (const [name, cb] of Object.entries({ openNote, openRegionNote, openNotesList, openHelp })) {
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
                announcer.announce("given-rejected", "고정된 칸입니다");
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
            announcer.announce("sticky-mode", sticky ? "후보 입력 모드 켜짐" : "후보 입력 모드 꺼짐");
            ev.preventDefault();
            return;
        }

        if (action === "clear") {
            if (selection !== null) store.clearCell(selection);
            ev.preventDefault();
            return;
        }

        switch (action) {
            case "note": openNote(selection); break;
            case "regionNote": openRegionNote(selection); break;
            case "notesList": openNotesList(); break;
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
