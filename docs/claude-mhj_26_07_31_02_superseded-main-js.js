// ===========================================================================
// SUPERSEDED -- ARCHIVE COPY. NOT LOADED, NOT TESTED, DO NOT IMPORT.
//
// This was an alternative composition root written directly into
// game/static/game/js/main.js on 2026-07-31 ~00:33. It was replaced the same
// day by the split that ships today:
//
//     game/static/game/js/main.js   thin entry point (first paint + import)
//     game/static/game/js/app.js    the composition root
//
// Kept only because it was never committed -- the file was untracked when it
// was overwritten, so git history has no copy of it. Rationale for the
// replacement, and the known defect in this version (startNewGame() passes a
// session to mountApp(), which expects a store), are recorded in
// docs/claude-mhj_26_07_31_01_session-summary.md.
//
// The .js extension is kept for readability only; nothing loads this path.
// ===========================================================================

// Entry point: wires every already-built, already-tested module (bootstrap,
// board, shell, adapters, dialogs) into the running page. Nothing here has
// its own business logic -- it only assembles what each module already
// specifies as its dependency contract.
import { bootstrap, createNewSession } from "./bootstrap.js";
import { mountBoard } from "./ui/board-view.js";
import { mountShell } from "./ui/app-shell.js";
import { mountNotes } from "./ui/notes-view.js";
import { createDialogHost } from "./ui/dialog-host.js";
import { createAnnouncer } from "./ui/announcer.js";
import { createKeyboardAdapter } from "./ui/keyboard-adapter.js";
import { createTouchAdapter, resolveVisibility } from "./ui/touch-adapter.js";
import { createShareView } from "./ui/share-view.js";
import { renderSettings, renderHelp } from "./ui/settings-view.js";
import { createPersistence } from "./state/persistence.js";
import { createSettings } from "./state/settings.js";
import { encode, decode } from "./url/codec.js";

function readSharedFragment() {
    const match = /^#s=(.+)$/.exec(window.location.hash);
    return match ? match[1] : "";
}

function cellIndexOf(ev) {
    const el = ev.target.closest?.('[role="gridcell"]');
    return el ? Number(el.dataset.index) : null;
}

async function run(root) {
    const announcerHost = document.createElement("div");
    document.body.appendChild(announcerHost);
    const announcer = createAnnouncer(announcerHost);

    const settings = createSettings(window.localStorage);
    const persistence = createPersistence({
        storage: window.localStorage,
        now: () => Date.now(),
        setTimeout: (fn, ms) => window.setTimeout(fn, ms),
        clearTimeout: (id) => window.clearTimeout(id),
        onWarning: () => announcer.announce("storage-warning", "저장 공간이 부족하여 진행 상황이 임시로만 유지됩니다"),
    });

    const backgroundEls = [];
    const dialogs = createDialogHost(root, backgroundEls);

    const bootDeps = {
        root,
        hash: readSharedFragment(),
        persistence,
        settings,
        codec: { decode: (fragment) => decode(fragment) },
        dialogs,
        announcer,
        fetchPuzzle: (opts) => fetch("/api/new-puzzle/", opts),
        history: { replaceState: (url) => window.history.replaceState(null, "", url) },
    };

    const result = await bootstrap(bootDeps);
    if (!result.ok) return; // bootstrap already rendered a retry panel; never a blank page

    root.querySelector('[data-state="loading"]')?.remove();
    mountApp(result.store);

    function mountApp(store) {
        store.subscribe(() => persistence.schedule(store.session));

        const appRoot = document.createElement("div");
        appRoot.className = "app-shell";
        root.appendChild(appRoot);
        backgroundEls.length = 0;
        backgroundEls.push(appRoot);

        const headerWrap = document.createElement("div");
        appRoot.appendChild(headerWrap);

        const mainArea = document.createElement("div");
        mainArea.className = "main-area";
        appRoot.appendChild(mainArea);

        const boardWrap = document.createElement("div");
        boardWrap.className = "board";
        mainArea.appendChild(boardWrap);

        const digitBar = document.createElement("div");
        digitBar.className = "digit-bar";
        mainArea.appendChild(digitBar);

        const notesWrap = document.createElement("div");
        notesWrap.className = "notes-rail";
        appRoot.appendChild(notesWrap);

        const boardView = mountBoard(boardWrap, store, announcer);
        const notesView = mountNotes(notesWrap, store, { confirm: dialogs.confirm, announcer });

        async function openShareDialog() {
            const shareView = createShareView({
                location: window.location,
                session: store.session,
                get savedAt() { return store.session.updatedAt; },
                encode: (session, scope, savedAt) => encode(session, scope, savedAt),
                announcer,
                showSelectableInput: (link) => { input.value = link; input.select(); },
            });
            const build = await shareView.build("SC2");

            const body = document.createElement("div");
            const message = document.createElement("p");
            const input = document.createElement("input");
            input.type = "text";
            input.readOnly = true;
            body.appendChild(message);
            body.appendChild(input);

            if (!build.ok) {
                message.textContent = "링크가 너무 깁니다. 메모 없이 공유해 주세요.";
            } else {
                message.textContent = build.warn ? "링크가 깁니다 (설정에서 자동 저장 범위를 조정할 수 있습니다):" : "공유 링크:";
                input.value = build.link;
            }

            const choice = await dialogs.open({
                kind: "share", title: "공유", body,
                actions: build.ok
                    ? [{ id: "copy", label: "복사", initialFocus: true }, { id: "close", label: "닫기" }]
                    : [{ id: "close", label: "닫기", initialFocus: true }],
            });
            if (choice === "copy") await shareView.copy();
        }

        async function openSettingsDialog() {
            await dialogs.open({
                kind: "settings", title: "설정", body: renderSettings(settings),
                actions: [{ id: "close", label: "닫기", initialFocus: true }],
            });
        }

        async function openHelpDialog() {
            await dialogs.open({
                kind: "help", title: "도움말", body: renderHelp(),
                actions: [{ id: "close", label: "닫기", initialFocus: true }],
            });
        }

        async function startNewGame() {
            const session = await createNewSession(bootDeps);
            if (!session) return; // createNewSession already rendered a retry panel
            teardown();
            mountApp(session);
        }

        const shell = mountShell(headerWrap, store, settings, {
            dialogs, announcer, boardView,
            openShare: () => openShareDialog(),
            openNotes: () => notesView.openNotesList(),
            openSettings: () => openSettingsDialog(),
            openHelp: () => openHelpDialog(),
            startNewGame: () => startNewGame(),
        });

        const grid = boardWrap.querySelector('[role="grid"]');
        const keyboardAdapter = createKeyboardAdapter({
            gridRoot: grid, store, settings, boardView, announcer,
            openNote: (index) => notesView.openEditor({ kind: "cell", key: index }, document.activeElement),
            openRegionNote: (index) => notesView.openTargetSelector(index, document.activeElement),
            openNotesList: () => notesView.openNotesList(),
            openHelp: () => openHelpDialog(),
        });
        document.addEventListener("keydown", keyboardAdapter.onKeyDown);

        const touchAdapter = createTouchAdapter({
            root: mainArea, store, settings, boardView, announcer,
            openNoteEditor: (target) => notesView.openEditor(target, document.activeElement),
            openNotesList: () => notesView.openNotesList(),
        });

        const digitButtons = [];
        for (let d = 1; d <= 9; d++) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "control";
            button.textContent = String(d);
            button.addEventListener("click", () => {
                const active = touchAdapter.onDigitTap(d);
                for (const b of digitButtons) b.dataset.active = "0";
                if (active === d) button.dataset.active = "1";
            });
            digitBar.appendChild(button);
            digitButtons.push(button);
        }
        const pencilButton = document.createElement("button");
        pencilButton.type = "button";
        pencilButton.className = "control";
        pencilButton.textContent = "연필";
        pencilButton.addEventListener("click", () => {
            pencilButton.dataset.active = touchAdapter.onPencilTap() ? "1" : "0";
        });
        digitBar.appendChild(pencilButton);
        const memoButton = document.createElement("button");
        memoButton.type = "button";
        memoButton.className = "control";
        memoButton.textContent = "메모";
        memoButton.addEventListener("click", () => touchAdapter.onMemoTap());
        digitBar.appendChild(memoButton);

        const onPointerDown = (ev) => {
            const index = cellIndexOf(ev);
            if (index !== null) touchAdapter.onPointerDown(index);
        };
        const onPointerMove = (ev) => touchAdapter.onPointerMove(ev.movementX ?? 0, ev.movementY ?? 0);
        const onPointerUp = (ev) => {
            const index = cellIndexOf(ev);
            if (index !== null) touchAdapter.onPointerUp(index);
        };
        grid.addEventListener("pointerdown", onPointerDown);
        grid.addEventListener("pointermove", onPointerMove);
        grid.addEventListener("pointerup", onPointerUp);

        const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
        const applyTouchVisibility = () => {
            digitBar.hidden = resolveVisibility(settings.get().touchControls, coarsePointer) !== "visible";
        };
        applyTouchVisibility();
        const unsubscribeSettings = settings.subscribe(applyTouchVisibility);

        function teardown() {
            unsubscribeSettings();
            document.removeEventListener("keydown", keyboardAdapter.onKeyDown);
            grid.removeEventListener("pointerdown", onPointerDown);
            grid.removeEventListener("pointermove", onPointerMove);
            grid.removeEventListener("pointerup", onPointerUp);
            boardView.destroy();
            shell.destroy();
            appRoot.remove();
        }
    }
}

export function init(root) {
    if (!root || typeof root.appendChild !== "function") {
        throw new TypeError("init(root): root must be an Element");
    }
    if (root.dataset.appBooted === "1") return;
    root.dataset.appBooted = "1";
    void run(root);
}

// Browser only.  Keeps the module importable from node:test without side effects.
if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
        const root = document.getElementById("app");
        if (root) init(root);
    });
}
