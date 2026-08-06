// Composition root. Every other module is written against injected
// dependencies and mounts nothing on its own; this is the single place that
// builds the real ones, mounts the views, attaches the DOM listeners, and
// hands bootstrap.js the `enableAdapters` it calls at step 8.
//
// It lives apart from bootstrap.js on purpose: bootstrap.js is unit-tested
// end to end with stubs and stays free of view imports, so the orchestration
// order can be verified without a DOM. Everything that genuinely needs a DOM
// is here instead.
import { bootstrap, createNewSession } from "./bootstrap.js";
import { createStore } from "./core/store.js";
import { createPersistence } from "./state/persistence.js";
import { createSettings } from "./state/settings.js";
import { createAnnouncer } from "./ui/announcer.js";
import { createDialogHost } from "./ui/dialog-host.js";
import { mountShell } from "./ui/app-shell.js";
import { mountBoard } from "./ui/board-view.js";
import { mountTouchControls } from "./ui/touch-controls.js";
import { createKeyboardAdapter } from "./ui/keyboard-adapter.js";
import { createTouchAdapter, resolveVisibility } from "./ui/touch-adapter.js";
import { renderHelp, renderSettings } from "./ui/settings-view.js";
import { createShareView } from "./ui/share-view.js";
import { decode, encode } from "./url/codec.js";

const NEW_PUZZLE_URL = "/api/new-puzzle/";
const COARSE_POINTER = "(pointer: coarse)";

const SHARE_SCOPES = [
    ["SC1", "문제만", "빈 퍼즐만 공유합니다."],
    ["SC2", "진행 포함", "입력한 숫자와 후보까지 공유합니다."],
];

// localStorage throws on access in some privacy modes rather than merely
// failing to persist, so the fallback has to stand in for the whole object.
function memoryStorage() {
    const map = new Map();
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => { map.set(k, String(v)); },
        removeItem: (k) => { map.delete(k); },
    };
}

function resolveStorage(candidate) {
    try {
        const probe = "sudoku:v1:probe";
        candidate.setItem(probe, "1");
        candidate.removeItem(probe);
        return candidate;
    } catch {
        return memoryStorage();
    }
}

function element(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
}

function clear(root) {
    while (root.children.length) root.children[0].remove();
}

export async function start(root, env = {}) {
    if (!root || typeof root.appendChild !== "function") {
        throw new TypeError("start: root must be an Element");
    }

    const {
        storage: rawStorage = globalThis.localStorage,
        location: loc = globalThis.location,
        history: hist = globalThis.history,
        navigator: nav = globalThis.navigator,
        matchMedia = globalThis.matchMedia?.bind(globalThis),
        fetch: fetchImpl = globalThis.fetch?.bind(globalThis),
        setTimeout: schedule = globalThis.setTimeout.bind(globalThis),
        clearTimeout: cancel = globalThis.clearTimeout.bind(globalThis),
        now = Date.now,
        newPuzzleUrl = NEW_PUZZLE_URL,
    } = env;

    const storage = resolveStorage(rawStorage ?? memoryStorage());
    clear(root); // drops main.js's first-paint skeleton before the real UI mounts

    // The announcer must exist before persistence can report a storage
    // failure, but it needs a mounted container; a holder keeps the wiring
    // one-directional instead of making persistence construction lazy.
    let announcer = null;
    const announce = (kind, message) => announcer?.announce(kind, message);

    const settings = createSettings(storage);
    const persistence = createPersistence({
        storage,
        now,
        setTimeout: schedule,
        clearTimeout: cancel,
        onWarning: () => announce(
            "storage-warning",
            "저장 공간을 사용할 수 없어 이번 진행은 기기에 저장되지 않습니다"
        ),
    });

    const announcerHost = element("div", "announcer-host");
    const shell = element("div", "app-shell");
    const headerHost = element("div", "app-shell-header-host");
    const boardArea = element("div", "board-area");
    const controlsArea = element("div", "controls-area");
    const dialogHost = element("div", "dialog-host");

    shell.appendChild(headerHost);
    shell.appendChild(boardArea);
    shell.appendChild(controlsArea);
    root.appendChild(announcerHost);
    root.appendChild(shell);
    root.appendChild(dialogHost);

    announcer = createAnnouncer(announcerHost);
    const dialogs = createDialogHost(dialogHost, [shell]);

    // The clue count rides on the settings rather than on an argument, so
    // both paths that ask for a puzzle -- the first boot inside bootstrap and
    // "새 게임" -- request the same count without bootstrap needing to know
    // the feature exists. ui/app-shell.js writes the setting when the player
    // picks, so by the time this runs it already holds their choice.
    function fetchPuzzle({ signal, givens } = {}) {
        if (typeof fetchImpl !== "function") {
            return Promise.reject(new Error("fetch is unavailable in this environment"));
        }
        const requested = Number.isInteger(givens) ? givens : settings.get().newGameGivens;
        const url = `${newPuzzleUrl}?givens=${requested}`;
        return fetchImpl(url, { signal, headers: { Accept: "application/json" } });
    }

    const bootDeps = {
        root,
        hash: loc?.hash ?? "",
        persistence,
        settings,
        codec: { encode, decode },
        dialogs,
        announcer,
        fetchPuzzle,
        history: { replaceState: (url) => hist?.replaceState?.(null, "", url) },
        enableAdapters,
    };

    // ------------------------------------------------------------ dialogs
    async function openHelp() {
        await dialogs.open({
            kind: "help",
            title: "도움말",
            body: renderHelp(),
            actions: [{ id: "close", label: "닫기", initialFocus: true }],
        });
    }

    async function openSettings() {
        await dialogs.open({
            kind: "settings",
            title: "설정",
            body: renderSettings(settings),
            actions: [{ id: "close", label: "닫기", initialFocus: true }],
        });
    }

    let shareFallback = null;

    function showSelectableLink(link) {
        shareFallback?.remove();
        const wrap = element("div", "share-fallback");
        shareFallback = wrap;
        const input = document.createElement("input");
        input.type = "text";
        input.readOnly = true;
        input.value = link;
        wrap.appendChild(input);
        dialogHost.appendChild(wrap);
        input.focus();
    }

    async function openShare(shareView) {
        const intro = document.createElement("p");
        intro.textContent = "공유 범위를 선택하세요.";
        const list = document.createElement("ul");
        for (const [, label, description] of SHARE_SCOPES) {
            const item = document.createElement("li");
            item.textContent = `${label} — ${description}`;
            list.appendChild(item);
        }
        const body = document.createElement("div");
        body.appendChild(intro);
        body.appendChild(list);

        const scope = await dialogs.open({
            kind: "share-scope",
            title: "공유",
            body,
            actions: [
                ...SHARE_SCOPES.map(([id, label]) => ({ id, label })),
                { id: "cancel", label: "취소", initialFocus: true },
            ],
        });
        if (!SHARE_SCOPES.some(([id]) => id === scope)) return;

        const result = await shareView.build(scope);
        const message = document.createElement("p");
        message.textContent = result.warn
            ? `링크가 준비되었습니다 (${result.length}자). 일부 앱에서 잘릴 수 있습니다.`
            : `링크가 준비되었습니다 (${result.length}자).`;
        const choice = await dialogs.open({
            kind: "share-result",
            title: "공유 링크",
            body: message,
            actions: [
                { id: "copy", label: "복사", initialFocus: true },
                { id: "close", label: "닫기" },
            ],
        });
        if (choice === "copy") await shareView.copy();
    }

    // ------------------------------------------------------- adapter wiring
    let activeTeardown = null;

    function enableAdapters(store) {
        const disposers = [];

        const shareView = createShareView({
            location: loc,
            session: store.session,
            encode,
            announcer,
            showSelectableInput: showSelectableLink,
            get savedAt() { return store.session.updatedAt; },
        });

        const boardView = mountBoard(boardArea, store, {
            settings,
            onPointerDown: (index) => touch.onPointerDown(index),
            onPointerMove: (dx, dy) => touch.onPointerMove(dx, dy),
            onPointerUp: (index) => {
                touch.onPointerUp(index);
                // Pointer input has to move the *keyboard* adapter's selection
                // as well. It keeps its own and drops every digit press while
                // that is null, so without this a user who clicks a cell and
                // then types would see nothing happen.
                keyboard.select(index);
                touchControls.sync();
            },
            onPointerCancel: () => touch.onPointerMove(Infinity, Infinity),
        });

        const touch = createTouchAdapter({
            root: boardArea,
            store,
            settings,
            boardView,
            announcer,
        });

        const touchControls = mountTouchControls(controlsArea, touch, {
            onStickyChange: (on) => boardView.setCandidateMode(on),
        });

        const keyboard = createKeyboardAdapter({
            gridRoot: boardView.element,
            store,
            settings,
            boardView,
            announcer,
            openHelp,
        });

        const shellView = mountShell(headerHost, store, settings, {
            dialogs,
            announcer,
            boardView,
            startNewGame: () => { void restart(); },
            openShare: () => { void openShare(shareView); },
            openSettings: () => { void openSettings(); },
            openHelp: () => { void openHelp(); },
        });

        const onKeyDown = (ev) => {
            keyboard.onKeyDown(ev);
            boardView.setCandidateMode(keyboard.sticky);
        };
        document.addEventListener("keydown", onKeyDown);
        disposers.push(() => document.removeEventListener("keydown", onKeyDown));

        // The save path: nothing else in the app calls persistence.schedule(),
        // so without this subscription every mutation would be lost on reload.
        const unsubscribeStore = store.subscribe(() => persistence.schedule(store.session));
        disposers.push(unsubscribeStore);

        function applyTouchVisibility() {
            const coarse = matchMedia ? matchMedia(COARSE_POINTER).matches === true : false;
            touchControls.setVisibility(resolveVisibility(settings.get().touchControls, coarse));
        }
        applyTouchVisibility();

        const unsubscribeSettings = settings.subscribe(() => {
            boardView.applySettings();
            applyTouchVisibility();
        });
        disposers.push(unsubscribeSettings);

        shellView.maybeShowHintStrip(matchMedia ? matchMedia(COARSE_POINTER).matches !== true : true);
        // Seeds the roving tabindex *and* the keyboard adapter's selection.
        // boardView.select() alone would leave the adapter at null, so the
        // very first digit press after load would be discarded.
        keyboard.select(0);
        persistence.schedule(store.session); // durable from the first frame, not the first edit

        disposers.push(() => {
            shellView.destroy();
            touchControls.destroy();
            boardView.destroy();
        });

        // Draining the array makes teardown idempotent, which restart() and
        // the caller's teardown() both rely on: whichever runs second is a
        // no-op rather than a double-unsubscribe.
        const teardown = function teardown() {
            while (disposers.length) disposers.pop()();
        };
        activeTeardown = teardown;
        return teardown;
    }

    async function restart() {
        const requested = settings.get().newGameGivens;
        const session = await createNewSession(bootDeps);
        if (!session) return; // createNewSession already rendered a retry panel
        activeTeardown?.();
        const store = createStore(session);
        enableAdapters(store); // reassigns activeTeardown to the new adapter set
        persistence.flushNow();

        // A clue count is a target, not a promise: the digger stops when it
        // runs out of removable cells, which at the low end can leave a few
        // more clues than asked for. Saying so keeps that from looking like
        // the choice was ignored.
        let actual = 0;
        for (const v of session.givens) if (v) actual++;
        announce("session", actual === requested
            ? "새 게임을 시작했습니다"
            : `힌트 ${requested}개로 요청했지만 ${actual}개로 만들었습니다`);
    }

    let result;
    try {
        result = await bootstrap(bootDeps);
    } catch (cause) {
        return renderFatal(root, cause);
    }
    if (!result.ok) return result;

    return {
        ok: true,
        store: result.store,
        teardown() {
            activeTeardown?.(); // the currently mounted set, which restart() may have replaced
            result.teardown();  // lifecycle listeners, plus the original set if still mounted
            activeTeardown = null;
        },
    };
}

// A failure while composing the UI must still end somewhere the user can act
// on. A blank page is the one outcome this app never produces (M1).
function renderFatal(root, cause) {
    const panel = element("div", "retry-panel");
    const message = document.createElement("p");
    message.textContent = "화면을 준비하지 못했습니다. 페이지를 새로고침해 주세요.";
    panel.appendChild(message);
    const detail = document.createElement("p");
    detail.className = "retry-detail";
    detail.textContent = String(cause?.message ?? cause);
    panel.appendChild(detail);
    root.appendChild(panel);
    return { ok: false, reason: "mount-failed", cause };
}
