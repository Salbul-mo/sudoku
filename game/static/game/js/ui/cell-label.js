// Accessible name assembly, DOM-free so it can be exhaustively unit tested
// and never drift from what the board actually renders (rendering calls this
// same function -- see ui/board-view.js updateCell).
import { t } from "../i18n/claude-mhj_26_08_07_05_messages.js";

function digitsOf(mask) {
    const out = [];
    for (let d = 1; d <= 9; d++) if (mask & (1 << (d - 1))) out.push(d);
    return out;
}

export function cellLabel(state) {
    const { index, given, value, candidates, conflict } = state;
    if (!Number.isInteger(index) || index < 0 || index > 80) {
        throw new RangeError(`index out of range: ${index}`);
    }
    if (!Number.isInteger(given) || given < 0 || given > 9) {
        throw new RangeError(`given out of range: ${given}`);
    }
    if (!Number.isInteger(value) || value < 0 || value > 9) {
        throw new RangeError(`value out of range: ${value}`);
    }
    if (!Number.isInteger(candidates) || candidates < 0 || candidates > 511) {
        throw new RangeError(`candidates out of range: ${candidates}`);
    }
    if (given && value) throw new Error(`cell ${index} has both a given and a value`);

    const parts = [t("cell.position", { row: ((index / 9) | 0) + 1, col: (index % 9) + 1 })];
    if (given) parts.push(t("cell.given", { digit: given }));
    else if (value) parts.push(`${value}`);
    else parts.push(t("cell.empty"));
    if (candidates) parts.push(t("cell.candidates", { digits: digitsOf(candidates).join(", ") }));
    if (conflict) parts.push(t("cell.conflict"));
    return parts.join(", ");
}
