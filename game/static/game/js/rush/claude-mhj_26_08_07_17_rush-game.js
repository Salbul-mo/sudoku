// Wires the engine, the clock and the board into a playable run.
//
// Judging happens at store.setValue rather than on a store subscription: the
// keyboard and the touch bar both write through it, so one override covers
// both inputs and sees the exact (cell, digit) a subscriber would have to
// reconstruct from a changed-set.
//
// Any filled cell is judged, not just the marked one. Filling the wrong cell
// costs a life like a wrong digit does. The alternative -- silently undoing
// stray writes -- needs undo machinery to stay in step with history, and the
// marked cell is already selected when the step begins, so the natural action
// is simply to press a digit.
import { createStore } from "../core/store.js";
import { mountBoard } from "../ui/board-view.js";
import { mountTouchControls } from "../ui/touch-controls.js";
import { createTouchAdapter, resolveVisibility } from "../ui/touch-adapter.js";
import { t } from "../i18n/claude-mhj_26_08_07_05_messages.js";
import { CELLS } from "../core/spec.js";
import { nextTarget } from "./claude-mhj_26_08_07_10_engine.js";
import { createClock, limitFor } from "./claude-mhj_26_08_07_12_clock.js";
import { createScore } from "./claude-mhj_26_08_07_13_score.js";
import { RUSH } from "./claude-mhj_26_08_07_11_config.js";

const TICK_MS = 100;

function sessionFrom(puzzle, solution) {
    return {
        schemaVersion: 1,
        puzzleId: `rush-${Date.now()}`,
        dim: 9,
        givens: Uint8Array.from(puzzle),
        values: new Uint8Array(CELLS),
        candidates: new Uint16Array(CELLS),
        solution: Uint8Array.from(solution),
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}

/**
 * @param deps.source     puzzle source with take()
 * @param deps.shell      mountRushShell result
 * @param deps.view       mountRushView result
 * @param deps.boardHost  element the board mounts into
 * @param deps.controlsHost element the digit bar mounts into
 * @param deps.announcer  createAnnouncer result
 * @param deps.settings   settings store (shared with the classic game)
 * @param deps.timer      { setInterval, clearInterval } -- injected for tests
 */
export function createRushGame(deps) {
    for (const name of ["source", "shell", "view", "boardHost", "controlsHost", "announcer", "settings"]) {
        if (deps?.[name] === undefined) throw new TypeError(`createRushGame: missing deps.${name}`);
    }
    const timer = deps.timer ?? { setInterval, clearInterval };
    const rng = deps.rng ?? Math.random;

    const score = createScore({ storage: deps.storage });
    const clock = createClock({
        now: deps.now ?? (() => Date.now()),
        setTimeout: deps.setTimeout ?? setTimeout,
        clearTimeout: deps.clearTimeout ?? clearTimeout,
        onExpire: () => judge(null, null),
    });

    let store = null;
    let boardView = null;
    let controls = null;
    let solution = null;
    let target = null;
    let ticker = null;
    let running = false;
    let applying = false; // true while the engine's giveaways are being written

    // The engine needs the board as it looks, which is the clues and the
    // filled-in cells together. session.values alone is every cell the player
    // has entered and nothing else -- feeding that in makes the engine see an
    // empty grid, hand out cells that are already clues, and mark a target the
    // store then refuses as a given.
    function boardNow() {
        const { givens, values } = store.session;
        const board = new Uint8Array(CELLS);
        for (let i = 0; i < CELLS; i++) board[i] = givens[i] || values[i];
        return board;
    }

    function teardownBoard() {
        controls?.destroy?.();
        boardView?.destroy?.();
        controls = null;
        boardView = null;
        store = null;
    }

    function stopTicking() {
        if (ticker !== null) {
            timer.clearInterval(ticker);
            ticker = null;
        }
    }

    // Object.create rather than a spread so the store's getters keep working;
    // only setValue is replaced.
    function judgedStore(base) {
        const wrapper = Object.create(base);
        wrapper.setValue = (index, digit, opts) => {
            const result = base.setValue(index, digit, opts);
            // A repeat digit routes to clearCell, which is an erase, not an
            // answer -- judging it would cost a life for undoing a mistake.
            if (running && !applying && result.ok && base.session.values[index] !== 0) {
                judge(index, digit);
            }
            return result;
        };
        return wrapper;
    }

    function judge(index, digit) {
        if (!running) return;
        clock.stop();
        stopTicking();
        const correct = target !== null && index === target.index && digit === target.digit;
        // A wrong digit cannot be left on the board. The engine requires the
        // board to agree with the solution and would throw on the next step,
        // and the cell would otherwise be stuck holding an answer nobody can
        // correct -- the run only ever moves forward.
        if (!correct && index !== null) store.clearCell(index);
        const state = correct ? score.hit() : score.miss();
        deps.shell.setStats(state);
        if (state.over) return gameOver();
        nextStep();
    }

    function gameOver() {
        running = false;
        clock.stop();
        stopTicking();
        const state = score.commit();
        deps.view.tick(0, 1);
        deps.view.showResult(state);
        deps.announcer.announce("completion", t("rush.gameOver", {
            score: state.score, combo: state.bestCombo,
        }));
    }

    async function newBoard() {
        const board = await deps.source.take();
        teardownBoard();
        solution = board.solution;
        const base = createStore(sessionFrom(board.puzzle, board.solution));
        store = judgedStore(base);

        boardView = mountBoard(deps.boardHost, base, { settings: deps.settings });
        const adapter = createTouchAdapter({
            root: boardView.element, store, settings: deps.settings,
            boardView, announcer: deps.announcer,
        });
        controls = mountTouchControls(deps.controlsHost, adapter, {});
        controls.setVisibility(resolveVisibility(
            deps.settings.get().touchControls,
            deps.coarsePointer ?? false,
        ));
        deps.onBoardMounted?.({ store, base, boardView, adapter });
    }

    function nextStep() {
        target = nextTarget(boardNow(), solution, rng);
        if (target === null) {
            deps.announcer.announce("session", t("rush.boardCleared"));
            void newBoard().then(() => { if (running) nextStep(); }).catch(reportFailure);
            return;
        }
        // Giveaways are the engine's doing, not the player's, so they must not
        // be judged -- each one would otherwise land as a wrong cell and cost a
        // life the player never lost.
        applying = true;
        try {
            for (const index of target.revealed) store.setValue(index, solution[index]);
        } finally {
            applying = false;
        }
        boardView.select(target.index);
        boardView.highlightConflicts(new Set([target.index]));

        const limit = limitFor(score.state().step);
        clock.start(limit);
        stopTicking();
        deps.view.tick(limit, limit);
        ticker = timer.setInterval(() => deps.view.tick(clock.remaining(), limit), TICK_MS);
    }

    function reportFailure(error) {
        running = false;
        stopTicking();
        deps.onFailure?.(error);
    }

    async function start() {
        score.reset();
        deps.shell.setStats(score.state());
        deps.view.clearPanel();
        running = true;
        try {
            await newBoard();
        } catch (error) {
            return reportFailure(error);
        }
        nextStep();
    }

    // Backgrounding must not burn a life while the screen is off.
    function pause() { if (running) { clock.pause(); stopTicking(); } }
    function resume() {
        if (!running || target === null) return;
        clock.resume();
        const limit = limitFor(Math.max(0, score.state().step));
        ticker = timer.setInterval(() => deps.view.tick(clock.remaining(), limit), TICK_MS);
    }

    function destroy() {
        running = false;
        clock.stop();
        stopTicking();
        teardownBoard();
    }

    return {
        start, pause, resume, destroy,
        get running() { return running; },
        get target() { return target; },
        state: () => score.state(),
    };
}
