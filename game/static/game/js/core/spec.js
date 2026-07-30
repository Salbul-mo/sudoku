// dim=9 coordinate tables for the client. This is not a port of the server's
// game/sudoku/spec.py (DV-04) -- the client only ever handles dim=9 and needs
// no exact-cover constraint columns, just peer/unit lookups for rule checks.

export const DIM = 9;
export const CELLS = 81;

function rowOf(i) { return (i / DIM) | 0; }
function colOf(i) { return i % DIM; }
function boxOf(i) { return ((rowOf(i) / 3) | 0) * 3 + ((colOf(i) / 3) | 0); }

const ROW_OF = Object.freeze(Array.from({ length: CELLS }, (_, i) => rowOf(i)));
const COL_OF = Object.freeze(Array.from({ length: CELLS }, (_, i) => colOf(i)));
const BOX_OF = Object.freeze(Array.from({ length: CELLS }, (_, i) => boxOf(i)));

function buildPeers() {
    const peers = [];
    for (let i = 0; i < CELLS; i++) {
        const set = new Set();
        for (let j = 0; j < CELLS; j++) {
            if (j === i) continue;
            if (ROW_OF[j] === ROW_OF[i] || COL_OF[j] === COL_OF[i] || BOX_OF[j] === BOX_OF[i]) {
                set.add(j);
            }
        }
        peers.push(Object.freeze([...set]));
    }
    return Object.freeze(peers);
}

function buildUnits() {
    const units = [];
    for (let r = 0; r < DIM; r++) {
        units.push(Object.freeze(Array.from({ length: DIM }, (_, c) => r * DIM + c)));
    }
    for (let c = 0; c < DIM; c++) {
        units.push(Object.freeze(Array.from({ length: DIM }, (_, r) => r * DIM + c)));
    }
    for (let b = 0; b < DIM; b++) {
        const cells = [];
        for (let i = 0; i < CELLS; i++) if (BOX_OF[i] === b) cells.push(i);
        units.push(Object.freeze(cells));
    }
    return Object.freeze(units);
}

export const PEERS = buildPeers();
export const UNITS = buildUnits();

export { ROW_OF, COL_OF, BOX_OF };
