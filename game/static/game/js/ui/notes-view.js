// Non-modal note editor (V4-04) plus the rail/sheet/selector/notes-list
// chrome around it. The editor deliberately skips every modal-dialog signal
// (the ARIA state that announces focus containment, Tab cycling, an inert
// background) -- applying those is UI-B11 DialogHost's job for real modals.
// Cancel confirmation is expressed only as an injected
// confirm(question) -> Promise<boolean> callback (DV-06): this module never
// imports DialogHost, so it stays independently testable and keeps its W4
// parallel placement with UI-B11.
import { affectedCells, targetFromSelection, targetLabel } from "./note-target.js";

const TARGET_KINDS = ["cell", "row", "column", "box"];

export function mountNotes(root, store, deps) {
    if (typeof deps?.confirm !== "function") {
        throw new TypeError("mountNotes: deps.confirm must be a function");
    }
    const { confirm, announcer } = deps;

    let target = null;
    let originEl = null;
    let savedValue = "";
    let draft = "";
    let container = null;
    let textarea = null;

    function isDirty() {
        return draft !== savedValue;
    }

    function render() {
        container = document.createElement("div");
        container.className = "note-editor";
        // Deliberately no focus-containment ARIA state, no focus trap, no
        // inert background: this is a non-modal editor (V4-04).

        textarea = document.createElement("textarea");
        textarea.value = draft;
        textarea.maxLength = 512;
        container.appendChild(textarea);

        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.textContent = "저장";
        saveBtn.addEventListener("click", () => save());
        container.appendChild(saveBtn);

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.textContent = "취소";
        cancelBtn.addEventListener("click", () => cancel());
        container.appendChild(cancelBtn);

        root.appendChild(container);
    }

    function close() {
        if (container) container.remove();
        container = null;
        textarea = null;
        originEl?.focus();
        target = null;
    }

    function openEditor(noteTarget, origin) {
        target = noteTarget;
        originEl = origin ?? null;
        savedValue = store.getNote(noteTarget);
        draft = savedValue;
        render();
        textarea.focus(); // initial focus only -- no trap, Tab leaves naturally
    }

    function save() {
        draft = textarea.value;
        store.setNote(target, draft);
        announcer?.announce("note", "메모가 저장되었습니다");
        close();
    }

    async function cancel() {
        draft = textarea.value;
        if (isDirty() && !(await confirm("작성 중인 메모를 버릴까요?"))) return;
        close();
    }

    function onEscape() {
        return cancel();
    }
    // No blur or visibilitychange handler: dismissing a software keyboard is
    // not a cancel intent, so the draft must survive it untouched.

    function openTargetSelector(selection, origin) {
        if (selection === null) return openNotesList();
        const selector = document.createElement("div");
        selector.className = "note-target-selector";
        for (const kind of TARGET_KINDS) {
            const t = targetFromSelection(selection, kind);
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = targetLabel(t);
            button.addEventListener("click", () => {
                selector.remove();
                openEditor(t, origin);
            });
            selector.appendChild(button);
        }
        root.appendChild(selector);
        return selector;
    }

    function openNotesList() {
        const list = document.createElement("div");
        list.className = "notes-list";
        const entries = [
            ...Object.entries(store.session.cellNotes).map(([key, text]) => ({
                target: { kind: "cell", key: Number(key) }, text,
            })),
            ...Object.entries(store.session.regionNotes).map(([key, text]) => {
                const kindMap = { r: "row", c: "column", b: "box" };
                return { target: { kind: kindMap[key[0]], key: Number(key.slice(1)) }, text };
            }),
        ];
        for (const entry of entries) {
            const row = document.createElement("button");
            row.type = "button";
            const label = document.createElement("span");
            label.textContent = targetLabel(entry.target);
            const preview = document.createElement("span");
            preview.textContent = entry.text; // rendered as text only, never as raw markup
            row.appendChild(label);
            row.appendChild(preview);
            row.dataset.affectedCells = affectedCells(entry.target).join(",");
            row.addEventListener("click", () => {
                list.remove();
                openEditor(entry.target, null);
            });
            list.appendChild(row);
        }
        root.appendChild(list);
        return list;
    }

    return {
        openEditor,
        openTargetSelector,
        openNotesList,
        onEscape,
        get isDirty() { return isDirty(); },
    };
}
