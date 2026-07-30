// The application shell: header, global actions, completion state, and the
// hint strip. Filled a gap Phase 1's component list originally missed (H1) --
// "규칙 확인", the three destructive actions, and the Share/Notes/Settings/Help
// entry points had behavior specified but no owning module until this block.
const DESTRUCTIVE_KINDS = ["newGame", "clearAll", "deleteAllNotes"];

function clearAllEntries(store) {
    const changed = new Set();
    store.history.beginGroup();
    for (let i = 0; i < 81; i++) {
        if (store.session.givens[i]) continue;
        if (store.session.values[i]) {
            store.history.record({ kind: "value", key: i, before: store.session.values[i], after: 0, groupId: 0, at: Date.now() });
            store.session.values[i] = 0;
            changed.add(i);
        }
        if (store.session.candidates[i]) {
            store.history.record({ kind: "candidates", key: i, before: store.session.candidates[i], after: 0, groupId: 0, at: Date.now() });
            store.session.candidates[i] = 0;
            changed.add(i);
        }
    }
    store.history.endGroup();
    store.notifyAll(changed);
}

function deleteAllNotesFrom(store) {
    store.history.beginGroup();
    for (const [key, before] of Object.entries(store.session.cellNotes)) {
        store.history.record({ kind: "cellNote", key, before, after: "", groupId: 0, at: Date.now() });
        delete store.session.cellNotes[key];
    }
    for (const [key, before] of Object.entries(store.session.regionNotes)) {
        store.history.record({ kind: "regionNote", key, before, after: "", groupId: 0, at: Date.now() });
        delete store.session.regionNotes[key];
    }
    store.history.endGroup();
    // A region note can cover any cell in that row/column/box, so the note
    // badge on any of the 81 cells may need to clear -- notify all of them
    // rather than re-deriving which cells each deleted region note touched.
    store.notifyAll(new Set(Array.from({ length: 81 }, (_, i) => i)));
}

export function mountShell(root, store, settings, deps) {
    for (const name of ["openShare", "openNotes", "openSettings", "openHelp"]) {
        if (typeof deps[name] !== "function") {
            throw new TypeError(`mountShell: deps.${name} must be a function`);
        }
    }

    const header = document.createElement("div");
    header.className = "app-shell-header";
    root.appendChild(header);

    const actions = {};
    const ACTION_LABELS = [
        ["check", "규칙 확인"], ["newGame", "새 게임"], ["clearAll", "전체 지우기"],
        ["deleteAllNotes", "메모 전체 삭제"], ["share", "공유"], ["notes", "메모"],
        ["settings", "설정"], ["help", "도움말"],
    ];
    for (const [id, label] of ACTION_LABELS) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.dataset.action = id;
        header.appendChild(button);
        actions[id] = button;
    }

    actions.check.addEventListener("click", () => onCheck());
    actions.share.addEventListener("click", () => deps.openShare());
    actions.notes.addEventListener("click", () => deps.openNotes());
    actions.settings.addEventListener("click", () => deps.openSettings());
    actions.help.addEventListener("click", () => deps.openHelp());
    actions.newGame.addEventListener("click", () => onDestructive("newGame"));
    actions.clearAll.addEventListener("click", () => onDestructive("clearAll"));
    actions.deleteAllNotes.addEventListener("click", () => onDestructive("deleteAllNotes"));

    let wasSolved = false;
    const unsubscribe = store.subscribe(() => {
        const solved = store.isSolved();
        if (solved && !wasSolved) deps.announcer.announce("completion", "퍼즐을 완성했습니다");
        root.dataset.state = solved ? "solved" : "playing";
        wasSolved = solved;
    });

    function onCheck() {
        const bad = store.conflicts();
        const done = store.isSolved();
        const msg = bad.size ? `규칙 위반 ${bad.size}칸`
            : done ? "퍼즐을 완성했습니다"
                : "지금까지 규칙 위반이 없습니다";
        // No solution is ever consulted -- the store has no such field, by
        // construction (V4-11), so this cannot silently start comparing to one.
        deps.announcer.announce("completion", msg);
        deps.boardView?.highlightConflicts?.(bad);
    }

    const DESTRUCTIVE = {
        newGame: { q: "새 게임을 시작할까요? 현재 진행은 사라집니다.", run: deps.startNewGame },
        clearAll: { q: "입력한 숫자와 후보를 모두 지울까요?", run: clearAllEntries },
        deleteAllNotes: { q: "메모를 모두 삭제할까요?", run: deleteAllNotesFrom },
    };

    async function onDestructive(kind) {
        if (!DESTRUCTIVE_KINDS.includes(kind)) throw new RangeError(`unknown destructive action: ${kind}`);
        const spec = DESTRUCTIVE[kind];
        if (!(await deps.dialogs.confirm(spec.q))) return; // cancel changes nothing
        spec.run(store);
    }

    function maybeShowHintStrip(isDesktopIdle) {
        const raw = settings.get().hintStripSeenCount;
        const seen = Number.isInteger(raw) ? Math.max(0, raw) : 0;
        if (seen >= 3 || !isDesktopIdle) return null;
        const strip = document.createElement("div");
        strip.className = "hint-strip";
        header.appendChild(strip);
        settings.set("hintStripSeenCount", seen + 1);
        return strip;
    }

    function destroy() {
        unsubscribe();
        header.remove();
    }

    return { actions, onCheck, onDestructive, maybeShowHintStrip, destroy };
}
