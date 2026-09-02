// What a finished puzzle is worth telling someone.
//
// Built as a Node and handed to the existing dialog host rather than painted
// into the page: a completed board should not be covered by a panel the reader
// has no way to dismiss, and the host already owns focus capture, Escape, and
// making the background inert.
//
// Deliberately not a scoreboard. Four lines, no ranking, no streak nagging,
// and a single button that starts the next puzzle -- the reward for finishing
// is being told how it went and being handed another one.
import { t } from "../i18n/messages.js";
import { formatDuration } from "../state/play-timer.js";

function row(label, value, modifier) {
    const wrap = document.createElement("div");
    wrap.className = modifier ? `completion-row ${modifier}` : "completion-row";
    const term = document.createElement("span");
    term.className = "completion-label";
    term.textContent = label;
    const detail = document.createElement("span");
    detail.className = "completion-value";
    detail.textContent = value;
    wrap.append(term, detail);
    return wrap;
}

/**
 * @param summary.difficulty  difficulty id of the puzzle just finished
 * @param summary.elapsedMs   played time, or 0 when it was never measured
 * @param summary.mistakes    distinct cells "정답 체크" ever reported wrong
 * @param summary.bestMs      best time now standing for this difficulty
 * @param summary.isBest      whether this solve is the one that set it
 * @param summary.solved      total completions at this difficulty
 * @param summary.persisted   false when records could not be stored at all
 */
export function buildCompletionBody(summary) {
    const body = document.createElement("div");
    body.className = "completion-card";

    const heading = document.createElement("p");
    heading.className = "completion-heading";
    heading.textContent = summary.isBest ? t("completion.newBest") : t("completion.solved");
    body.appendChild(heading);

    body.appendChild(row(t("completion.difficulty"), t(`difficulty.${summary.difficulty}`)));

    // A restored save from before the timer existed reports zero, and "0:00"
    // would be a lie about how long it took rather than an absence of data.
    body.appendChild(row(
        t("completion.time"),
        summary.elapsedMs > 0 ? formatDuration(summary.elapsedMs) : t("completion.untimed"),
    ));

    // "정답 체크" is the only thing that ever judges a board here, so this
    // counts cells it reported wrong -- distinct cells, because pressing check
    // twice on the same wrong 5 is one mistake, not two. Someone who never
    // presses it finishes with zero, which is the honest answer to "how many
    // mistakes did the game catch".
    body.appendChild(row(t("completion.mistakes"), String(summary.mistakes)));

    if (summary.persisted) {
        body.appendChild(row(
            t("completion.best"),
            summary.bestMs ? formatDuration(summary.bestMs) : t("completion.untimed"),
            summary.isBest ? "completion-row-best" : "",
        ));
        body.appendChild(row(t("completion.totalSolved"), String(summary.solved)));
    } else {
        const note = document.createElement("p");
        note.className = "completion-note";
        note.textContent = t("completion.noRecord");
        body.appendChild(note);
    }

    return body;
}

/**
 * Shows the card. Resolves to the dialog host's answer -- "newGame" when the
 * reader wants another puzzle, anything else (the close button, Escape) when
 * they would rather look at the finished board.
 */
export function showCompletionCard(dialogs, summary) {
    return dialogs.open({
        kind: "completion",
        title: t("completion.title"),
        body: buildCompletionBody(summary),
        actions: [
            { id: "close", label: t("completion.close") },
            { id: "newGame", label: t("action.newGame"), initialFocus: true },
        ],
    });
}
