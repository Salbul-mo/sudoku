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
import { t } from "../i18n/messages.js";
import { CELLS } from "../core/spec.js";
import { nextTarget } from "./engine.js";
import { createClock, limitFor } from "./clock.js";
import { createScore } from "./score.js";
import { RUSH, difficultyFor } from "./config.js";
import { assistCells } from "./techniques.js";

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
    // Wrapped rather than passed by reference: called as deps.setTimeout(...)
    // a bare browser timer sees `this` as the deps object and throws "Illegal
    // invocation". Node does not care, so only a real browser catches it.
    const timer = deps.timer ?? {
        setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
        clearInterval: (id) => globalThis.clearInterval(id),
    };
    const rng = deps.rng ?? Math.random;

    const score = createScore({ storage: deps.storage });
    const clock = createClock({
        now: deps.now ?? (() => Date.now()),
        setTimeout: deps.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms)),
        clearTimeout: deps.clearTimeout ?? ((id) => globalThis.clearTimeout(id)),
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
    let swapping = false; // true while a swapped-in board is being fetched
    // The step's time allowance depends on the deduction, so it cannot be
    // recomputed from the step number alone -- resume() and the repaint loop
    // have to use the value the step actually started with or the bar jumps.
    let currentLimit = 0;
    // What each answered step actually took. Kept in memory so the schedule
    // can be tuned against real play rather than against a guess about it.
    const timings = [];

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

    // Kept here rather than in board-view because the classic game shows the
    // whole grid; only a rush run narrows it.
    function setFocusView(on) {
        if (boardView) boardView.element.dataset.rushFocus = on ? "1" : "0";
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
        // Read the clock before stopping it: what is left on it is what says
        // how long the answer took.
        const remaining = clock.remaining();
        clock.stop();
        stopTicking();
        const correct = target !== null && index === target.index && digit === target.digit;
        // A wrong digit cannot be left on the board. The engine requires the
        // board to agree with the solution and would throw on the next step,
        // and the cell would otherwise be stuck holding an answer nobody can
        // correct -- the run only ever moves forward.
        if (!correct && index !== null) store.clearCell(index);
        if (correct && target !== null) recordTiming(remaining);
        const state = correct
            ? score.hit(target?.technique ?? null, target?.units?.length ?? 1)
            : score.miss();
        deps.shell.setStats(state);
        if (state.over) return gameOver();
        nextStep();
    }

    function gameOver() {
        running = false;
        clock.stop();
        stopTicking();
        deps.shell.setSwapEnabled?.(false);
        boardView?.setTarget(null);   // nothing is being asked for any more
        const state = score.commit();
        // The run is over, so there is no single cell to concentrate on any
        // more -- give the whole board back before the result panel appears.
        setFocusView(false);
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
        // Focus view: rush only ever asks for one cell, so the grid dims
        // everything outside that cell's box, row and column (rush.css keys
        // off this attribute and the peer marks board-view already paints).
        // The digits stay in the DOM with their labels intact -- this hides
        // them visually, it does not remove them from a screen reader.
        setFocusView(true);
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
        const { allow, assist } = difficultyFor(score.state().step);
        target = nextTarget(boardNow(), solution, rng, {
            allow, assist, maxEvidenceUnits: RUSH.MAX_EVIDENCE_UNITS,
        });
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
        selectTarget(target.index);
        boardView.setTarget(target.index);
        applyAssist(target, assist);
        deps.announcer.announce("session", t("rush.technique." + target.technique));

        currentLimit = limitFor(score.state().step, target.technique, target.units.length);
        clock.start(currentLimit);
        stopTicking();
        deps.view.tick(currentLimit, currentLimit);
        startTicking();
        deps.shell.setSwapFree?.(swapIsFree());
    }

    function startTicking() {
        ticker = timer.setInterval(() => deps.view.tick(clock.remaining(), currentLimit), TICK_MS);
    }

    // The board shows exactly what the deduction rests on -- no more, so the
    // step stays a puzzle, and no less, or it would be unanswerable. The
    // engine has already refused any candidate whose evidence does not fit
    // inside this level, so painting it is all that is left to do.
    function applyAssist(candidate, assist) {
        const cells = assistCells(candidate, assist);
        boardView.setFocus(cells);
        setFocusView(cells !== null);
    }

    // boardView.selection is what the digit bar reads, but the keyboard adapter
    // keeps a selection of its own and drops every digit press while that is
    // null (ui/keyboard-adapter.js). Marking a cell the player never clicked
    // therefore has to move both, or a desktop run takes no typed digits at
    // all until an arrow key happens to seed the adapter.
    function selectTarget(index) {
        boardView.select(index);
        deps.onSelect?.(index);
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
        swapping = false;
        timings.length = 0;
        deps.shell.setSwapEnabled?.(true);
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
        // currentLimit, not a fresh limitFor(step): the allowance depends on
        // the deduction this step asked for, and score.state().step has
        // already moved past it. Recomputing rescales the bar mid-step.
        startTicking();
    }

    function destroy() {
        running = false;
        clock.stop();
        stopTicking();
        deps.shell.setSwapEnabled?.(false);
        teardownBoard();
    }

    function recordTiming(remaining) {
        timings.push({
            technique: target.technique,
            units: target.units.length,
            ms: Math.max(0, currentLimit - remaining),
            limit: currentLimit,
        });
    }

    function emptiesLeft() {
        if (store === null) return 0;
        const board = boardNow();
        let empty = 0;
        for (let i = 0; i < CELLS; i++) if (board[i] === 0) empty++;
        return empty;
    }

    // A board with almost nothing left on it offers almost nothing but the
    // cheapest deduction there is, so leaving it costs nothing. Anywhere else
    // the swap is a real choice: a way out of a step at the price of the combo.
    function swapIsFree() {
        return running && store !== null && emptiesLeft() <= RUSH.FREE_SWAP_AT_EMPTIES;
    }

    async function swapBoard() {
        if (!running || swapping) return;
        swapping = true;
        deps.shell.setSwapEnabled?.(false);
        const free = swapIsFree();
        clock.stop();
        stopTicking();
        if (!free) deps.shell.setStats(score.breakCombo());
        deps.announcer.announce("session", t(free ? "rush.boardSwappedFree" : "rush.boardSwapped"));
        try {
            await newBoard();
        } catch (error) {
            swapping = false;
            return reportFailure(error);
        }
        swapping = false;
        deps.shell.setSwapEnabled?.(true);
        nextStep();
    }

    return {
        start, pause, resume, destroy, swapBoard,
        get running() { return running; },
        get target() { return target; },
        get swapFree() { return swapIsFree(); },
        state: () => score.state(),
        timings: () => timings.slice(),
    };
}
