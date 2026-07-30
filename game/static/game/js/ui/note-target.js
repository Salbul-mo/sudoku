// Where a note target's cells and label come from -- shared by the rail,
// mobile sheet, marker rendering, and the notes list, so all four can never
// disagree about what a target covers.
import { UNITS } from "../core/spec.js";

const KINDS = new Set(["cell", "row", "column", "box"]);

function validate(target) {
    if (!KINDS.has(target.kind)) throw new RangeError(`unknown note target kind: ${target.kind}`);
    const max = target.kind === "cell" ? 80 : 8;
    if (!Number.isInteger(target.key) || target.key < 0 || target.key > max) {
        throw new RangeError(`key out of range for ${target.kind}: ${target.key}`);
    }
}

export function affectedCells(target) {
    validate(target);
    if (target.kind === "cell") return [target.key];
    if (target.kind === "row") return [...UNITS[target.key]];
    if (target.kind === "column") return [...UNITS[9 + target.key]];
    return [...UNITS[18 + target.key]]; // box
}

export function targetLabel(target) {
    validate(target);
    if (target.kind === "cell") {
        const r = (target.key / 9) | 0;
        const c = target.key % 9;
        return `${r + 1}행 ${c + 1}열`;
    }
    if (target.kind === "row") return `${target.key + 1}행`;
    if (target.kind === "column") return `${target.key + 1}열`;
    return `${target.key + 1}번 박스`;
}

export function targetFromSelection(index, kind) {
    if (!Number.isInteger(index) || index < 0 || index > 80) {
        throw new RangeError(`index out of range: ${index}`);
    }
    if (!KINDS.has(kind)) throw new RangeError(`unknown note target kind: ${kind}`);
    if (kind === "cell") return { kind: "cell", key: index };
    const r = (index / 9) | 0;
    const c = index % 9;
    const b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
    if (kind === "row") return { kind: "row", key: r };
    if (kind === "column") return { kind: "column", key: c };
    return { kind: "box", key: b };
}
