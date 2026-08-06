// The application shell: header, global actions, completion state, and the
// hint strip. Filled a gap Phase 1's component list originally missed (H1) --
// "정답 체크", the destructive actions, and the Share/Settings/Help
// entry points had behavior specified but no owning module until this block.
import { GIVENS_PRESETS } from "../core/claude-mhj_26_08_07_01_givens.js";

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
        ["check", "정답 체크"], ["newGame", "새 게임"], ["clearAll", "전체 지우기"],
        ["share", "공유"],
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
    actions.settings.addEventListener("click", () => deps.openSettings());
    actions.help.addEventListener("click", () => deps.openHelp());
    actions.newGame.addEventListener("click", () => { void onNewGame(); });
    actions.clearAll.addEventListener("click", () => onDestructive("clearAll"));

    let wasSolved = false;
    const unsubscribe = store.subscribe(() => {
        const solved = store.isSolved();
        if (solved && !wasSolved) deps.announcer.announce("completion", "퍼즐을 완성했습니다");
        root.dataset.state = solved ? "solved" : "playing";
        wasSolved = solved;
    });

    function onCheck() {
        const done = store.isSolved();
        const wrong = store.checkAnswer();
        if (wrong) {
            const msg = wrong.size ? `정답과 다른 칸 ${wrong.size}개`
                : done ? "퍼즐을 완성했습니다"
                    : "지금까지 입력한 답이 모두 맞습니다";
            deps.announcer.announce("completion", msg);
            deps.boardView?.highlightConflicts?.(wrong);
            return;
        }
        // No solution is available (a session adopted from a shared link,
        // or restored from a save written before this field existed) --
        // fall back to a rule-violation check instead of doing nothing.
        const bad = store.conflicts();
        const msg = bad.size ? `규칙 위반 ${bad.size}칸`
            : done ? "퍼즐을 완성했습니다"
                : "지금까지 규칙 위반이 없습니다";
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
        body.textContent = "힌트 갯수를 고르세요. 지금 진행 중인 퍼즐은 사라집니다.";
        const choice = await deps.dialogs.open({
            kind: "new-game",
            title: "새 게임",
            body,
            actions: [
                ...GIVENS_PRESETS.map((n) => ({
                    id: String(n),
                    label: `${n}개`,
                    initialFocus: n === currentGivens,
                })),
                { id: "cancel", label: "취소" },
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
        clearAll: { q: "입력한 숫자와 후보를 모두 지울까요?", run: clearAllEntries },
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
