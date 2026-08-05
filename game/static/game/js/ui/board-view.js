// role=grid + roving tabindex, replacing the 81 <input> structure (R3). This
// is the largest structural change in the UI track; MR-U1's inoperable
// window ends once this mounts. Every mutation touches only the changed
// cell -- a full re-render would drop focus and reset the screen reader's
// position, and every string here goes through textContent only, never a
// raw-markup DOM API, so cell text can never become an injection path.
//
// Pointer events are bound per cell rather than delegated from the grid. The
// index is already in scope at build time, so delegation would only add a
// dataset->attribute lookup that buys nothing.
import { CELLS, DIM, PEERS } from "../core/spec.js";
import { cellLabel } from "./cell-label.js";

const DEFAULT_SETTINGS = { get: () => ({ showConflicts: true }) };

function buildCell(index) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-rowindex", String(((index / DIM) | 0) + 1));
    cell.setAttribute("aria-colindex", String((index % DIM) + 1));
    cell.tabIndex = -1;
    cell.dataset.index = String(index);

    const valueNode = document.createElement("span");
    valueNode.className = "cell-value";
    cell.appendChild(valueNode);

    const candidateNodes = [];
    const candidateWrap = document.createElement("span");
    candidateWrap.className = "cell-candidates";
    for (let d = 1; d <= DIM; d++) {
        const span = document.createElement("span");
        span.className = "candidate";
        span.dataset.digit = String(d);
        candidateWrap.appendChild(span);
        candidateNodes.push(span);
    }
    cell.appendChild(candidateWrap);

    return { cell, valueNode, candidateNodes };
}

export function mountBoard(root, store, deps = {}) {
    if (!root || typeof root.appendChild !== "function") {
        throw new TypeError("mountBoard: root must be an Element");
    }
    if (typeof store.subscribe !== "function") {
        throw new TypeError("mountBoard: store must expose subscribe()");
    }
    const settings = deps.settings ?? DEFAULT_SETTINGS;

    const grid = document.createElement("div");
    grid.className = "board";
    grid.setAttribute("role", "grid");
    grid.setAttribute("aria-label", `스도쿠 ${DIM}x${DIM} 퍼즐`);

    const cells = [];
    for (let r = 0; r < DIM; r++) {
        const row = document.createElement("div");
        row.setAttribute("role", "row");
        for (let c = 0; c < DIM; c++) {
            const index = r * DIM + c;
            const parts = buildCell(index);
            bindPointer(parts.cell, index);
            row.appendChild(parts.cell);
            cells.push(parts);
        }
        grid.appendChild(row);
    }
    cells[0].cell.tabIndex = 0;
    let current = 0;
    let peerOf = null;
    let candidateMode = false;

    root.appendChild(grid);

    // A "규칙 확인" press has to be able to show conflicts even when the
    // showConflicts setting keeps them hidden during normal play, so an
    // explicit highlight overrides the setting until the next mutation.
    let forced = null;
    // Two sets, because a cell can need a repaint for either reason: the
    // accessible name follows the *true* conflict set, while the data-conflict
    // cue follows the shown set, and showConflicts / highlightConflicts make
    // the two diverge.
    let lastConflicts = new Set();
    let lastShown = new Set();

    let downPoint = null;

    function bindPointer(cell, index) {
        cell.addEventListener("pointerdown", (ev) => {
            downPoint = { x: ev?.clientX ?? 0, y: ev?.clientY ?? 0 };
            deps.onPointerDown?.(index);
        });
        cell.addEventListener("pointermove", (ev) => {
            if (!downPoint) return;
            deps.onPointerMove?.((ev?.clientX ?? 0) - downPoint.x, (ev?.clientY ?? 0) - downPoint.y);
        });
        cell.addEventListener("pointerup", () => {
            downPoint = null;
            deps.onPointerUp?.(index);
        });
        cell.addEventListener("pointercancel", () => {
            downPoint = null;
            deps.onPointerCancel?.(index);
        });
    }

    function conflictShown(index, conflicts) {
        if (forced) return forced.has(index);
        return settings.get().showConflicts !== false && conflicts.has(index);
    }

    function updateCell(i, conflicts) {
        if (!Number.isInteger(i) || i < 0 || i >= CELLS) {
            throw new RangeError(`index out of range: ${i}`);
        }
        const { session } = store;
        const { cell, valueNode, candidateNodes } = cells[i];
        const given = session.givens[i];
        const value = session.values[i];
        const conflict = conflicts.has(i);

        cell.dataset.given = given ? "1" : "0";
        // The visual cue obeys the setting; the accessible name below never
        // does -- hiding a rule violation from a screen reader user because a
        // *visual* preference is off would remove information, not decoration.
        cell.dataset.conflict = conflictShown(i, conflicts) ? "1" : "0";
        valueNode.textContent = String(given || value || "");

        const mask = value ? 0 : session.candidates[i];
        for (const node of candidateNodes) {
            const d = Number(node.dataset.digit);
            node.textContent = mask & (1 << (d - 1)) ? String(d) : "";
        }

        cell.setAttribute("aria-label", cellLabel({
            index: i, given, value, candidates: mask, conflict,
        }));
    }

    // A mutation can change the conflict state of cells the store never
    // reported as changed: clearing one of two duplicate 5s resolves the
    // *other* cell too. Diffing the shown-conflict set catches those.
    function refresh(changed) {
        const conflicts = store.conflicts();
        const shown = new Set();
        for (const i of conflicts) if (conflictShown(i, conflicts)) shown.add(i);

        const pending = new Set(changed);
        const addSymmetricDiff = (now, before) => {
            for (const i of now) if (!before.has(i)) pending.add(i);
            for (const i of before) if (!now.has(i)) pending.add(i);
        };
        addSymmetricDiff(conflicts, lastConflicts);
        addSymmetricDiff(shown, lastShown);
        lastConflicts = conflicts;
        lastShown = shown;

        for (const i of pending) updateCell(i, conflicts);
    }

    function renderAll() {
        forced = null;
        lastConflicts = new Set();
        lastShown = new Set();
        refresh(Array.from({ length: CELLS }, (_, i) => i));
    }

    renderAll();

    const unsubscribe = store.subscribe(({ changed }) => {
        forced = null; // any real mutation supersedes a one-shot highlight
        refresh(changed);
    });

    function setPeerOf(index) {
        if (index !== null && (!Number.isInteger(index) || index < 0 || index >= CELLS)) {
            throw new RangeError(`index out of range: ${index}`);
        }
        if (peerOf !== null) {
            for (const p of PEERS[peerOf]) cells[p].cell.dataset.peer = "0";
        }
        peerOf = index;
        if (peerOf !== null) {
            for (const p of PEERS[peerOf]) cells[p].cell.dataset.peer = "1";
        }
    }

    function select(i) {
        if (!Number.isInteger(i) || i < 0 || i >= CELLS) {
            throw new RangeError(`index out of range: ${i}`);
        }
        cells[current].cell.tabIndex = -1;
        cells[current].cell.dataset.candidateMode = "0";
        cells[i].cell.tabIndex = 0;
        cells[i].cell.focus();
        current = i;
        setPeerOf(i);
        paintCandidateMode();
    }

    // The dashed outline and "후보" badge belong to the cell the next digit
    // would land in -- painting all 81 would stamp the badge across the whole
    // board and say nothing about where input is going.
    function paintCandidateMode() {
        cells[current].cell.dataset.candidateMode = candidateMode ? "1" : "0";
    }

    function highlightConflicts(indices) {
        forced = indices instanceof Set ? indices : new Set(indices ?? []);
        refresh([]);
    }

    function setCandidateMode(on) {
        if (typeof on !== "boolean") throw new TypeError("setCandidateMode: on must be a boolean");
        candidateMode = on;
        paintCandidateMode();
    }

    function destroy() {
        unsubscribe();
        grid.remove();
    }

    return {
        element: grid,
        select,
        setPeerOf,
        highlightConflicts,
        setCandidateMode,
        applySettings: renderAll,
        get selection() { return current; },
        destroy,
    };
}
