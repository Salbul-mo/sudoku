// Composition for the practice page: builds the layout, hands the pieces to
// createLearnGame, and owns the browser-level wiring the game does not need to
// know about.
import { applyCssStrings } from "../i18n/messages.js";
import { createSettings } from "../state/settings.js";
import { createAnnouncer } from "../ui/announcer.js";
import { createPuzzleSource } from "../rush/puzzle-source.js";
import { createPositionSource } from "./position-source.js";
import { createProgress } from "./progress.js";
import { mountLearnShell } from "./learn-shell.js";
import { mountLearnView } from "./learn-view.js";
import { createLearnGame } from "./learn-game.js";

// The board this page practises on. Denser than the rush board on purpose: a
// pruning needs candidates to prune, and a sparse grid gives every cell so many
// that the deduction is buried in noise.
const LEARN_GIVENS = 50;

// What the page opens on. The easiest deduction, so the first thing a visitor
// sees is one they can answer rather than the hardest thing on offer.
const FIRST_TECHNIQUE = "naked-single";

function section(className) {
    const el = document.createElement("div");
    el.className = className;
    return el;
}

function safeStorage() {
    // Reading localStorage throws outright in some privacy modes, so the access
    // has to be attempted rather than feature-detected.
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

    const shellHost = section("learn-shell-host");
    const viewHost = section("learn-view-host");
    root.append(shellHost, viewHost);

    const settings = createSettings(safeStorage());
    const progress = createProgress(safeStorage());
    const announcer = createAnnouncer(root);

    const positionSource = createPositionSource({
        puzzleSource: createPuzzleSource({ givens: LEARN_GIVENS }),
    });

    // `game` is created below; these only ever fire after that, and naming it
    // here is what keeps the controls from needing a second wiring pass.
    const shell = mountLearnShell(shellHost, {
        onSelectTechnique: (technique) => { void game.start(technique); },
    });
    const view = mountLearnView(viewHost, {
        onDigit: (digit) => game.answerDigit(digit),
        onSubmit: () => game.submit(),
        onNext: () => game.next(),
    });

    const game = createLearnGame({
        positionSource, shell, view, boardHost: view.boardHost, announcer, settings, progress,
    });

    shell.setProgress(progress.all());
    void game.start(FIRST_TECHNIQUE);

    return {
        game,
        teardown() {
            game.destroy();
            view.destroy();
            shell.destroy();
        },
    };
}
