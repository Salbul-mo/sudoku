// Selection movement as pure functions (DV-05): the geometry belongs here,
// with UI-B06's other grid-layout knowledge; UI-B07 only wires physical keys
// to moveSelection, so key-resolution and grid geometry stay separable.
const DIRECTIONS = new Set(["up", "down", "left", "right", "lineStart", "lineEnd"]);
const MODIFIERS = new Set(["none", "ctrl"]);
const STEP = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

export function moveSelection(from, direction, modifier) {
    if (!Number.isInteger(from) || from < 0 || from > 80) {
        throw new RangeError(`from out of range: ${from}`);
    }
    if (!DIRECTIONS.has(direction)) throw new RangeError(`unknown direction: ${direction}`);
    if (!MODIFIERS.has(modifier)) throw new RangeError(`unknown modifier: ${modifier}`);

    const r = (from / 9) | 0;
    const c = from % 9;

    if (direction === "lineStart") return modifier === "ctrl" ? 0 : r * 9;
    if (direction === "lineEnd") return modifier === "ctrl" ? 80 : r * 9 + 8;

    const [dr, dc] = STEP[direction];
    const n = modifier === "ctrl" ? 3 : 1;
    const nr = clamp(r + dr * n, 0, 8);
    const nc = clamp(c + dc * n, 0, 8);
    return nr * 9 + nc;
}
