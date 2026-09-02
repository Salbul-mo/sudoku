// Builds a sheet of puzzles for paper.
//
// The whole page is one idea: fetch N puzzles, lay them out at a size that
// survives printing, and put the answers on the last sheet. No board view, no
// store, no input handling -- nothing here is meant to be played on screen.
//
// Reuses the existing puzzle source rather than a second fetch path, so a
// dropped connection and a 4xx behave the way they do in the two games.
import { applyCssStrings, t } from "../i18n/messages.js";
import { DIFFICULTY_IDS, DEFAULT_DIFFICULTY, difficultyForId, cryptoRng } from "../core/difficulty.js";
import { createPuzzleSource, PuzzleSourceError } from "../rush/puzzle-source.js";
import { DIM } from "../core/spec.js";

// Six to a sheet at the CSS grid below, so the presets are whole sheets. A
// free-text number would let someone ask for 200 and spend four minutes on
// requests they will not print.
const COUNTS = [2, 4, 6, 12];
const DEFAULT_COUNT = 6;

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function labelled(labelText, control) {
    const wrap = element("label", "printable-field");
    wrap.append(element("span", "printable-field-label", labelText), control);
    return wrap;
}

function select(options, selected, format) {
    const node = document.createElement("select");
    node.className = "control";
    for (const value of options) {
        const option = document.createElement("option");
        option.value = String(value);
        option.textContent = format(value);
        if (String(value) === String(selected)) option.selected = true;
        node.appendChild(option);
    }
    return node;
}

/**
 * One puzzle, drawn as a 9x9 table.
 *
 * A table rather than the game's grid of divs: this is a static picture of a
 * puzzle, printed borders are what a solver needs, and a table prints with its
 * rules intact in every browser without a single grid-layout workaround.
 */
function puzzleGrid(values, className) {
    const table = element("table", className);
    // Purely presentational here -- nobody navigates a printed grid with a
    // screen reader, and announcing 81 cells would be noise on a page whose
    // point is the paper.
    table.setAttribute("role", "presentation");
    for (let r = 0; r < DIM; r++) {
        const row = document.createElement("tr");
        for (let c = 0; c < DIM; c++) {
            const cell = document.createElement("td");
            const value = values[r * DIM + c];
            cell.textContent = value ? String(value) : "";
            // Box edges come from these, so the 3x3 structure survives at any
            // print scale without depending on nth-child arithmetic in print CSS.
            if (c % 3 === 0 && c > 0) cell.dataset.boxLeft = "1";
            if (r % 3 === 0 && r > 0) cell.dataset.boxTop = "1";
            row.appendChild(cell);
        }
        table.appendChild(row);
    }
    return table;
}

export function start(root) {
    if (!root || typeof root.appendChild !== "function") {
        throw new TypeError("start(root): root must be an Element");
    }
    applyCssStrings(document.documentElement);
    root.replaceChildren();

    const controls = element("div", "printable-controls");
    const intro = element("p", "printable-intro", t("printable.intro"));

    const difficulty = select(DIFFICULTY_IDS, DEFAULT_DIFFICULTY, (id) => t(`difficulty.${id}`));
    const count = select(COUNTS, DEFAULT_COUNT, String);
    const build = element("button", "control printable-build", t("printable.build"));
    build.type = "button";
    const print = element("button", "control printable-print", t("printable.print"));
    print.type = "button";
    print.hidden = true;

    controls.append(
        labelled(t("printable.difficulty"), difficulty),
        labelled(t("printable.count"), count),
        build,
        print,
    );

    // aria-live so the progress of a build that takes several seconds reaches
    // someone who cannot see the sheet filling in.
    const status = element("p", "printable-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const sheet = element("div", "printable-sheet");
    const answers = element("section", "printable-answers");

    root.append(intro, controls, status, sheet, answers);

    let building = false;

    async function onBuild() {
        if (building) return;
        building = true;
        build.disabled = true;
        print.hidden = true;
        sheet.replaceChildren();
        answers.replaceChildren();

        const wanted = Number(count.value);
        const chosen = difficulty.value;
        const band = difficultyForId(chosen);
        status.textContent = t("printable.building", { done: 0, total: wanted });

        try {
            for (let i = 0; i < wanted; i++) {
                // A fresh clue count per puzzle, inside the difficulty's band,
                // so a sheet of six is not six puzzles with identical density.
                const givens = band.minGivens
                    + Math.floor(cryptoRng() * (band.maxGivens - band.minGivens + 1));
                const source = createPuzzleSource({ givens });
                const board = await source.take();

                const figure = element("figure", "printable-puzzle");
                figure.append(
                    puzzleGrid(board.puzzle, "printable-grid"),
                    element("figcaption", "", t("printable.puzzleLabel", {
                        n: i + 1, difficulty: t(`difficulty.${chosen}`),
                    })),
                );
                sheet.appendChild(figure);

                const answer = element("figure", "printable-answer");
                answer.append(
                    puzzleGrid(board.solution, "printable-grid printable-grid-answer"),
                    element("figcaption", "", t("printable.answerLabel", { n: i + 1 })),
                );
                answers.appendChild(answer);

                status.textContent = t("printable.building", { done: i + 1, total: wanted });
            }

            answers.prepend(element("h2", "printable-answers-heading", t("printable.answers")));
            status.textContent = t("printable.ready", { count: wanted });
            print.hidden = false;
        } catch (error) {
            const cause = error instanceof PuzzleSourceError ? error.cause : "network";
            status.textContent = t(`retry.${cause === "offline" ? "offline" : "network"}`);
            sheet.replaceChildren();
            answers.replaceChildren();
        } finally {
            building = false;
            build.disabled = false;
        }
    }

    build.addEventListener("click", () => { void onBuild(); });
    print.addEventListener("click", () => globalThis.print?.());

    return {
        teardown() {
            root.replaceChildren();
        },
    };
}
