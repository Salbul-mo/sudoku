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
import {
    cryptoRng,
    difficultyForGivens,
    randomGivensForDifficulty,
} from "./core/difficulty.js";
import { createPersistence } from "./state/persistence.js";
import { createSettings } from "./state/settings.js";
import { createRecords } from "./state/records.js";
import { createPlayTimer } from "./state/play-timer.js";
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
import { t, applyCssStrings } from "./i18n/messages.js";

const NEW_PUZZLE_URL = "/api/new-puzzle/";
const COARSE_POINTER = "(pointer: coarse)";

// Built per call, not once at import: a constant would capture whichever
// language was active when this module first loaded.
function shareScopes() {
    return [
        ["SC1", t("share.sc1Label"), t("share.sc1Desc")],
        ["SC2", t("share.sc2Label"), t("share.sc2Desc")],
    ];
}

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
        random = cryptoRng,
        newPuzzleUrl = NEW_PUZZLE_URL,
    } = env;

    const storage = resolveStorage(rawStorage ?? memoryStorage());
    // Before anything paints: these feed ::before/::after content, which
    // renders as nothing at all while the variables are unset.
    applyCssStrings(document.documentElement);
    clear(root); // drops main.js's first-paint skeleton before the real UI mounts

    // The announcer must exist before persistence can report a storage
    // failure, but it needs a mounted container; a holder keeps the wiring
    // one-directional instead of making persistence construction lazy.
    let announcer = null;
    const announce = (kind, message) => announcer?.announce(kind, message);

    const settings = createSettings(storage);
    const records = createRecords(storage);

    // Everything the completion card reports, gathered at the moment the board
    // is finished.
    //
    // The difficulty comes from the board itself rather than from settings:
    // settings hold what the *next* puzzle will be, and someone who changes it
    // mid-game would otherwise file this solve under the wrong heading.
    function summariseCompletion(store, timer) {
        timer.stop();
        store.session.elapsedMs = timer.elapsed();

        let clues = 0;
        for (const given of store.session.givens) if (given) clues++;
        const difficulty = difficultyForGivens(clues).id;

        const outcome = records.record(difficulty, store.session.elapsedMs);
        return {
            difficulty,
            elapsedMs: store.session.elapsedMs,
            mistakes: store.session.mistakeCells?.size ?? 0,
            bestMs: outcome.bestMs,
            isBest: outcome.isBest,
            solved: outcome.solved,
            // storage is a memoryStorage() stand-in when the real one throws,
            // so a record written there is gone on reload and must not be
            // presented as a saved best.
            persisted: storage === globalThis.localStorage,
        };
    }
    function prepareNewPuzzleRequest() {
        const requested = randomGivensForDifficulty(
            settings.get().newGameDifficulty,
            random,
        );
        // Keep the established numeric setting as the exact request contract.
        // Retry calls then reuse the same value instead of silently rerolling.
        settings.set("newGameGivens", requested);
        return requested;
    }
    const persistence = createPersistence({
        storage,
        now,
        setTimeout: schedule,
        clearTimeout: cancel,
        onWarning: () => announce(
            "storage-warning",
            t("session.storageWarning")
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
            title: t("action.help"),
            body: renderHelp(),
            actions: [{ id: "close", label: t("dialog.close"), initialFocus: true }],
        });
    }

    async function openSettings() {
        await dialogs.open({
            kind: "settings",
            title: t("action.settings"),
            body: renderSettings(settings),
            actions: [{ id: "close", label: t("dialog.close"), initialFocus: true }],
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
        const scopes = shareScopes();
        const intro = document.createElement("p");
        intro.textContent = t("share.scopePrompt");
        const list = document.createElement("ul");
        for (const [, label, description] of scopes) {
            const item = document.createElement("li");
            item.textContent = `${label} — ${description}`;
            list.appendChild(item);
        }
        const body = document.createElement("div");
        body.appendChild(intro);
        body.appendChild(list);

        const scope = await dialogs.open({
            kind: "share-scope",
            title: t("action.share"),
            body,
            actions: [
                ...scopes.map(([id, label]) => ({ id, label })),
                { id: "cancel", label: t("dialog.cancel"), initialFocus: true },
            ],
        });
        if (!scopes.some(([id]) => id === scope)) return;

        const result = await shareView.build(scope);
        const message = document.createElement("p");
        message.textContent = result.warn
            ? t("share.readyLong", { length: result.length })
            : t("share.ready", { length: result.length });
        const choice = await dialogs.open({
            kind: "share-result",
            title: t("share.resultTitle"),
            body: message,
            actions: [
                { id: "copy", label: t("share.copy"), initialFocus: true },
                { id: "close", label: t("dialog.close") },
            ],
        });
        if (choice === "copy") await shareView.copy();
    }

    // ------------------------------------------------------- adapter wiring
    let activeTeardown = null;

    function enableAdapters(store) {
        const disposers = [];

        // Play time, not wall time: a board left open in a background tab must
        // not accumulate hours. Started here and stopped whenever the tab goes
        // away or the puzzle is finished.
        const timer = createPlayTimer(store.session.elapsedMs ?? 0);
        timer.start();
        const persistElapsed = () => {
            store.session.elapsedMs = timer.elapsed();
        };
        const onTimerVisibility = () => {
            if (document.visibilityState === "hidden") {
                timer.stop();
                persistElapsed();
            } else if (!store.isSolved()) {
                timer.start();
            }
        };
        document.addEventListener("visibilitychange", onTimerVisibility);
        disposers.push(() => {
            document.removeEventListener("visibilitychange", onTimerVisibility);
            timer.stop();
            persistElapsed();
        });

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
            onCompletion: () => summariseCompletion(store, timer),
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
        const requested = prepareNewPuzzleRequest();
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
            ? t("newGame.started")
            : t("newGame.givensShortfall", { requested, actual }));
    }

    let result;
    try {
        // If bootstrap restores a local/shared session this value is unused;
        // otherwise it is the one random roll for the initial puzzle request.
        prepareNewPuzzleRequest();
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
    message.textContent = t("fatal.mount");
    panel.appendChild(message);
    const detail = document.createElement("p");
    detail.className = "retry-detail";
    detail.textContent = String(cause?.message ?? cause);
    panel.appendChild(detail);
    root.appendChild(panel);
    return { ok: false, reason: "mount-failed", cause };
}
