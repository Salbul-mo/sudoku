// Wires a position, a lesson and the board into a practisable exercise.
//
// Two things here are worth knowing before reading the code.
//
// First, the board's candidate marks are computed, not pencilled. In the
// classic game session.candidates is whatever the player wrote down; here it is
// buildCandidates() over the position, because a pruning exercise is
// unanswerable if the candidates it prunes are not on screen.
//
// Second, a candidate is pressed directly rather than toggled through pencil
// mode. board-view already renders all nine candidate spans in every cell and
// only blanks their text, so the press can be picked up by delegation with no
// change to that module -- but it also means the empty ninths of a cell are
// live hit targets. Every press is therefore checked against the candidate
// mask in the store, never against what the DOM happens to be showing.
import { createStore } from "../core/store.js";
import { mountBoard } from "../ui/board-view.js";
import { CELLS, DIM } from "../core/spec.js";
import { TECHNIQUES, assistCells, buildCandidates } from "../rush/techniques.js";
import { moveSelection } from "../ui/board-nav.js";
import { createLesson } from "./lesson.js";
import { LearnSourceError } from "./position-source.js";
import { PuzzleSourceError } from "../rush/puzzle-source.js";
import { t } from "../i18n/messages.js";

const bit = (digit) => 1 << (digit - 1);

function sessionFrom(values, solution) {
    return {
        schemaVersion: 1,
        puzzleId: `learn-${Date.now()}`,
        dim: DIM,
        // Every filled cell is a given: nothing on this board was entered by
        // the player, and marking them otherwise would let the board offer undo
        // and conflict cues for digits nobody chose.
        givens: Uint8Array.from(values),
        values: new Uint8Array(CELLS),
        candidates: buildCandidates(values),
        solution: Uint8Array.from(solution),
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}

export function createLearnGame(deps) {
    for (const name of ["positionSource", "shell", "view", "boardHost", "announcer", "progress"]) {
        if (deps?.[name] === undefined) throw new TypeError(`createLearnGame: missing deps.${name}`);
    }

    let store = null;
    let boardView = null;
    let lesson = null;
    let technique = null;
    let unbind = null;

    function teardownBoard() {
        unbind?.();
        unbind = null;
        boardView?.destroy();
        boardView = null;
        store = null;
    }

    // Selected on data attributes rather than class names throughout: the
    // dataset entries are what board-view guarantees about its structure, while
    // .cell and .candidate are styling hooks that a stylesheet change could
    // reasonably rename.
    /** Repaints the marked candidates from the lesson, which owns the truth. */
    function paintMarks() {
        if (boardView === null || lesson === null || lesson.kind !== "elimination") return;
        for (const cell of boardView.element.querySelectorAll("[data-index]")) {
            const index = Number(cell.dataset.index);
            for (const span of cell.querySelectorAll("[data-digit]")) {
                const digit = Number(span.dataset.digit);
                span.dataset.marked = lesson.marked(index, digit) ? "1" : "0";
            }
        }
        deps.view.showMarkCount(lesson.marks().size);
    }

    function toggleMark(index, digit) {
        if (lesson === null || lesson.kind !== "elimination") return;
        if (lesson.state() === "correct") return;
        // The store is the authority on what is on the board. Reading the span's
        // textContent instead would make a render lag into a wrong answer, and
        // would accept a press on one of the blank ninths of a cell.
        if ((store.session.candidates[index] & bit(digit)) === 0) return;

        const nowMarked = lesson.toggleMark(index, digit);
        paintMarks();
        deps.announcer.announce(
            "learn-mark",
            t(nowMarked ? "learn.marked" : "learn.unmarked", { digit }),
        );
    }

    function judge(outcome) {
        const ok = outcome === "correct";
        deps.view.showResult(ok, lesson);
        deps.announcer.announce("learn-result", ok ? t("learn.correct") : t(
            lesson.kind === "elimination" ? "learn.wrongElimination" : "learn.wrongPlacement",
        ));
        // Recorded on every judgement, not only the right ones: "solved 3 of 7"
        // is the number worth showing, and counting only successes would make
        // every technique read as a perfect score.
        deps.progress.record(technique, ok);
        deps.shell.setProgress(deps.progress.all());
    }

    function answerDigit(digit) {
        if (lesson === null || lesson.state() === "correct") return;
        if (lesson.kind === "elimination") toggleMark(boardView.selection, digit);
        else judge(lesson.answer(digit));
    }

    const ARROWS = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        Home: "lineStart", End: "lineEnd",
    };

    function bindBoard() {
        const onPointerUp = (event) => {
            const span = event.target?.closest?.("[data-digit]");
            const cell = event.target?.closest?.("[data-index]");
            if (!span || !cell) return;
            toggleMark(Number(cell.dataset.index), Number(span.dataset.digit));
        };
        const onKeyDown = (event) => {
            if (event.metaKey || event.altKey) return;
            // Arrows first: without them a keyboard user is stuck on whichever
            // cell the exercise opened on, and a pruning that spans three cells
            // would be unanswerable without a pointer.
            const direction = ARROWS[event.key];
            if (direction !== undefined) {
                event.preventDefault();
                boardView.select(moveSelection(
                    boardView.selection, direction, event.ctrlKey ? "ctrl" : "none",
                ));
                return;
            }
            if (event.ctrlKey) return;
            const digit = Number(event.key);
            if (!Number.isInteger(digit) || digit < 1 || digit > DIM) return;
            event.preventDefault();
            answerDigit(digit);
        };
        boardView.element.addEventListener("pointerup", onPointerUp);
        document.addEventListener("keydown", onKeyDown);
        unbind = () => {
            boardView.element.removeEventListener("pointerup", onPointerUp);
            document.removeEventListener("keydown", onKeyDown);
        };
    }

    async function start(nextTechnique) {
        technique = nextTechnique;
        deps.shell.setActive(technique);
        deps.shell.setBusy(true);
        deps.view.showLoading();
        teardownBoard();

        let position = null;
        try {
            position = await deps.positionSource.take(technique);
        } catch (error) {
            deps.shell.setBusy(false);
            if (error instanceof LearnSourceError) return deps.view.showExhausted();
            if (error instanceof PuzzleSourceError) return deps.view.showError(error.cause);
            throw error;
        }

        store = createStore(sessionFrom(position.values, position.solution));
        boardView = mountBoard(deps.boardHost, store, {
            settings: deps.settings,
            // Without this a tap never moves the selection, and the digit keys
            // would keep acting on the cell the exercise opened on.
            onPointerUp: (index) => boardView.select(index),
        });
        lesson = createLesson(position.deduction);
        bindBoard();

        // Only what the deduction rests on. The engine has already refused any
        // candidate whose evidence does not fit inside this level, so painting
        // it is all that is left -- and it is the same "evidence" level the rush
        // mode uses, so the two pages teach the same amount of board.
        boardView.setFocus(assistCells(position.deduction, "evidence"));
        // Turns the dimming on. board-view marks the cells; this attribute is
        // what learn.css keys the rest of the board being hidden off, and
        // without it setFocus paints an attribute nothing renders.
        boardView.element.dataset.learnFocus = "1";
        if (TECHNIQUES.includes(technique)) {
            boardView.setTarget(position.deduction.index);
            boardView.select(position.deduction.index);
        } else {
            boardView.select(position.deduction.subject[0]);
        }

        deps.view.showPrompt(lesson);
        deps.shell.setBusy(false);
        paintMarks();
    }

    return {
        start,
        submit() {
            if (lesson === null || lesson.kind !== "elimination") return;
            if (lesson.state() === "correct") return;
            judge(lesson.submit());
        },
        next() {
            if (technique !== null) void start(technique);
        },
        // Exposed for the composition's keyboard wiring and for tests; the view
        // never reaches into the lesson itself.
        get lesson() { return lesson; },
        destroy() {
            teardownBoard();
            lesson = null;
        },
    };
}
