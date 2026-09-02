// One exercise: what is being asked, what the player has answered, and whether
// that answer is right. No DOM, no storage, no clock.
//
// The two kinds of deduction are answered in genuinely different ways -- a
// placement takes one digit, a pruning takes a set of (cell, digit) marks -- so
// the wrong-kind calls throw rather than quietly doing nothing. A view that
// wires up the pruning controls for a placement exercise has a bug, and a
// silent no-op would hide it behind a step that simply never completes.
//
// Nothing here mutates the deduction it was handed; the view paints from the
// same object.
import { CELLS, DIM } from "../core/spec.js";

const markKey = (index, digit) => `${index}:${digit}`;

function assertCell(index) {
    if (!Number.isInteger(index) || index < 0 || index >= CELLS) {
        throw new RangeError(`index must be an integer in 0..${CELLS - 1}, got ${index}`);
    }
}

function assertDigit(digit) {
    if (!Number.isInteger(digit) || digit < 1 || digit > DIM) {
        throw new RangeError(`digit must be an integer in 1..${DIM}, got ${digit}`);
    }
}

export function createLesson(deduction) {
    if (deduction?.kind !== "placement" && deduction?.kind !== "elimination") {
        throw new RangeError(`unknown deduction kind: ${deduction?.kind}`);
    }
    if (!Array.isArray(deduction.units) || deduction.units.length === 0) {
        throw new RangeError("a deduction with no evidence cannot be asked about");
    }

    const { kind } = deduction;
    const expected = kind === "elimination"
        ? new Set(deduction.eliminations.map((e) => markKey(e.index, e.digit)))
        : null;

    let state = "asking";
    let marks = new Set();

    function assertOpen() {
        if (state === "correct") throw new Error("this lesson is already answered");
    }

    function assertKind(wanted, name) {
        if (kind === wanted) return;
        const article = kind === "elimination" ? "an" : "a";
        throw new Error(`${name} is not valid for ${article} ${kind} lesson`);
    }

    function retry() {
        state = "retry";
        return "retry";
    }

    return {
        kind,
        deduction,
        state: () => state,

        /** The units the board should paint. */
        evidenceUnits: () => [...deduction.units],

        /** A placement answer. */
        answer(digit) {
            assertKind("placement", "answer");
            assertOpen();
            assertDigit(digit);
            if (digit !== deduction.digit) return retry();
            state = "correct";
            return "correct";
        },

        /** Marks or unmarks one candidate for elimination. */
        toggleMark(index, digit) {
            assertKind("elimination", "toggleMark");
            assertOpen();
            assertCell(index);
            assertDigit(digit);
            const key = markKey(index, digit);
            const wasMarked = marks.has(key);
            if (wasMarked) marks.delete(key);
            else marks.add(key);
            // Answering resets `retry` so a second attempt is not pre-judged by
            // the first; the state means "the last submission was wrong", not
            // "this player was wrong once".
            if (state === "retry") state = "asking";
            return !wasMarked;
        },

        marked: (index, digit) => marks.has(markKey(index, digit)),
        marks: () => new Set(marks),

        /**
         * Judges the marked set.
         *
         * Exact equality, so marking a candidate the deduction does not remove
         * is as wrong as missing one. A superset would mean the player pruned
         * something this reasoning cannot justify -- which on a real board is
         * how a solve goes irrecoverably wrong, and is the more valuable half
         * of the lesson.
         */
        submit() {
            assertKind("elimination", "submit");
            assertOpen();
            if (marks.size !== expected.size) return retry();
            for (const key of marks) if (!expected.has(key)) return retry();
            state = "correct";
            return "correct";
        },

        reset() {
            state = "asking";
            marks = new Set();
        },
    };
}
