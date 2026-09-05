// Composition for the rush page: builds the layout, hands the pieces to
// createRushGame, and connects the browser-level wiring the game itself has no
// business knowing about.
import { applyCssStrings } from "../i18n/messages.js";
import { createSettings } from "../state/settings.js";
import { createAnnouncer } from "../ui/announcer.js";
import { createKeyboardAdapter } from "../ui/keyboard-adapter.js";
import { t } from "../i18n/messages.js";
import { createPuzzleSource } from "./puzzle-source.js";
import { mountRushShell } from "./rush-shell.js";
import { mountRushView } from "./rush-view.js";
import { createRushGame } from "./rush-game.js";
import { RUSH } from "./config.js";

function section(className) {
    const el = document.createElement("div");
    el.className = className;
    return el;
}

function safeStorage() {
    // Reading localStorage throws outright in some privacy modes, so the
    // access has to be attempted rather than feature-detected.
    try {
        globalThis.localStorage?.getItem("probe");
        return globalThis.localStorage;
    } catch {
        return null;
    }
}

export function start(root) {
    if (!root || typeof root.appendChild !== "function") {
        throw new TypeError("start(root): root must be an Element");
    }
    applyCssStrings(document.documentElement); // before first paint
    root.replaceChildren();

    const shellHost = section("rush-shell-host");
    const boardHost = section("board-area");
    const controlsHost = section("controls-area");
    const viewHost = section("rush-view-host");
    root.append(shellHost, boardHost, viewHost, controlsHost);

    const storage = safeStorage();
    const settings = createSettings(storage);
    const announcer = createAnnouncer(root);
    // `game` is created below; the callback only ever fires after that, and
    // referring to it here is what keeps the button from having to be wired in
    // a second pass.
    const shell = mountRushShell(shellHost, { onSwap: () => { void game.swapBoard(); } });

    const coarsePointer = globalThis.matchMedia?.("(pointer: coarse)")?.matches ?? false;
    const source = createPuzzleSource({ givens: RUSH.BOARD_GIVENS });

    const view = mountRushView(viewHost, { onRestart: (mode) => { void game.start(mode); } });

    const game = createRushGame({
        source, shell, view, boardHost, controlsHost, announcer, settings,
        storage, coarsePointer,
        onFailure: (error) => showFailure(error),
        onBoardMounted: ({ store, boardView }) => wireKeyboard(store, boardView),
        // Each step marks its cell without any pointer event, so the keyboard
        // adapter has to be told; it ignores digits while its own selection is
        // null.
        onSelect: (index) => keyboard?.select(index),
    });

    let unwireKeyboard = null;
    let keyboard = null;
    function wireKeyboard(store, boardView) {
        unwireKeyboard?.();
        const adapter = createKeyboardAdapter({
            gridRoot: boardView.element, store, settings, boardView, announcer,
            // The rush page has no help dialog; the how-to sits permanently
            // under the timer, so `?` has nothing to open.
            openHelp: () => {},
        });
        keyboard = adapter;
        const onKeyDown = (ev) => adapter.onKeyDown(ev);
        document.addEventListener("keydown", onKeyDown);
        unwireKeyboard = () => {
            document.removeEventListener("keydown", onKeyDown);
            if (keyboard === adapter) keyboard = null;
        };
    }

    function showFailure(error) {
        const panel = section("retry-panel");
        const message = document.createElement("p");
        message.textContent = t(`retry.${error?.cause === "offline" ? "offline" : "network"}`);
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = t("retry.button");
        button.addEventListener("click", () => { panel.remove(); void game.start(view.mode()); });
        panel.append(message, button);
        viewHost.appendChild(panel);
        button.focus();
    }

    // A backgrounded tab must not run the clock down. pagehide is not enough --
    // switching apps on a phone fires visibilitychange without unloading.
    const onVisibility = () => {
        if (document.visibilityState === "hidden") game.pause();
        else game.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);

    view.showStart();
    source.prime(); // the first board is fetched while the start screen is up

    return {
        game,
        teardown() {
            document.removeEventListener("visibilitychange", onVisibility);
            unwireKeyboard?.();
            game.destroy();
        },
    };
}
