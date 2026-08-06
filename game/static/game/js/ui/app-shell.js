// The application shell: header, global actions, completion state, and the
// hint strip. Filled a gap Phase 1's component list originally missed (H1) --
// "정답 체크", the destructive actions, and the Share/Settings/Help
// entry points had behavior specified but no owning module until this block.
import { GIVENS_PRESETS } from "../core/claude-mhj_26_08_07_01_givens.js";
import { t, resolveLocale } from "../i18n/claude-mhj_26_08_07_05_messages.js";

// "새 게임" is destructive too, but it no longer goes through onDestructive:
// it asks which clue count to use rather than for a yes/no, and the choice
// doubles as the confirmation.
const DESTRUCTIVE_KINDS = ["clearAll"];

function clearAllEntries(store) {
    store.history.beginGroup();
    for (let i = 0; i < 81; i++) {
        if (store.session.givens[i]) continue;
        if (store.session.values[i]) {
            store.history.record({ kind: "value", key: i, before: store.session.values[i], after: 0, groupId: 0, at: Date.now() });
            store.session.values[i] = 0;
        }
        if (store.session.candidates[i]) {
            store.history.record({ kind: "candidates", key: i, before: store.session.candidates[i], after: 0, groupId: 0, at: Date.now() });
            store.session.candidates[i] = 0;
        }
    }
    store.history.endGroup();
    // Clearing a duplicate can resolve the conflict cue on a *given* cell it
    // clashed with, which this loop skips mutating -- notify every cell
    // rather than only the ones this loop actually touched.
    store.notifyAll(new Set(Array.from({ length: 81 }, (_, i) => i)));
}

export function mountShell(root, store, settings, deps) {
    for (const name of ["openShare", "openSettings", "openHelp"]) {
        if (typeof deps[name] !== "function") {
            throw new TypeError(`mountShell: deps.${name} must be a function`);
        }
    }

    const header = document.createElement("div");
    header.className = "app-shell-header";
    root.appendChild(header);

    const actions = {};
    const ACTION_LABELS = [
        ["check", t("action.check")], ["newGame", t("action.newGame")], ["clearAll", t("action.clearAll")],
        ["share", t("action.share")],
        ["settings", t("action.settings")], ["help", t("action.help")],
    ];
    for (const [id, label] of ACTION_LABELS) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.dataset.action = id;
        header.appendChild(button);
        actions[id] = button;
    }

    // Deliberately an <a href> and not a button with a click handler: the two
    // languages are two indexed URLs, so the switch has to be a link a crawler
    // can follow and a user can middle-click. The in-progress game survives the
    // navigation because it lives in localStorage, not in this page's memory.
    const otherLocale = resolveLocale(document.documentElement.lang) === "en" ? "ko" : "en";
    const langSwitch = document.createElement("a");
    langSwitch.className = "lang-switch";
    langSwitch.href = otherLocale === "en" ? "/en/" : "/";
    langSwitch.textContent = t("nav.otherLanguage");
    langSwitch.setAttribute("hreflang", otherLocale);
    langSwitch.setAttribute("rel", "alternate");
    header.appendChild(langSwitch);

    actions.check.addEventListener("click", () => onCheck());
    actions.share.addEventListener("click", () => deps.openShare());
    actions.settings.addEventListener("click", () => deps.openSettings());
    actions.help.addEventListener("click", () => deps.openHelp());
    actions.newGame.addEventListener("click", () => { void onNewGame(); });
    actions.clearAll.addEventListener("click", () => onDestructive("clearAll"));

    let wasSolved = false;
    const unsubscribe = store.subscribe(() => {
        const solved = store.isSolved();
        if (solved && !wasSolved) deps.announcer.announce("completion", t("check.solved"));
        root.dataset.state = solved ? "solved" : "playing";
        wasSolved = solved;
    });

    function onCheck() {
        const done = store.isSolved();
        const wrong = store.checkAnswer();
        if (wrong) {
            const msg = wrong.size ? t("check.wrongCount", { count: wrong.size })
                : done ? t("check.solved")
                    : t("check.allCorrect");
            deps.announcer.announce("completion", msg);
            deps.boardView?.highlightConflicts?.(wrong);
            return;
        }
        // No solution is available (a session adopted from a shared link,
        // or restored from a save written before this field existed) --
        // fall back to a rule-violation check instead of doing nothing.
        const bad = store.conflicts();
        const msg = bad.size ? t("check.violationCount", { count: bad.size })
            : done ? t("check.solved")
                : t("check.noViolations");
        deps.announcer.announce("completion", msg);
        deps.boardView?.highlightConflicts?.(bad);
    }

    // Picking a clue count both starts the game and confirms discarding the
    // current one, so there is no separate yes/no step. Anything that is not
    // one of the presets counts as backing out: DialogHost answers "cancel"
    // for both the cancel button and Escape, and treating every unrecognised
    // answer the same way means a future dismissal path cannot accidentally
    // wipe a board in progress.
    async function onNewGame() {
        const currentGivens = settings.get().newGameGivens;
        const body = document.createElement("p");
        body.textContent = t("newGame.body");
        const choice = await deps.dialogs.open({
            kind: "new-game",
            title: t("action.newGame"),
            body,
            actions: [
                ...GIVENS_PRESETS.map((n) => ({
                    id: String(n),
                    label: t("newGame.preset", { count: n }),
                    initialFocus: n === currentGivens,
                })),
                { id: "cancel", label: t("dialog.cancel") },
            ],
        });

        const givens = Number(choice);
        if (!GIVENS_PRESETS.includes(givens)) return; // cancelled, dismissed, or unknown

        // Written before starting: the setting is what app.js reads when it
        // builds the request, so this *is* how the choice reaches the API.
        settings.set("newGameGivens", givens);
        deps.startNewGame();
    }

    const DESTRUCTIVE = {
        clearAll: { q: t("clearAll.question"), run: clearAllEntries },
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

    return { actions, onCheck, onNewGame, onDestructive, maybeShowHintStrip, destroy };
}
