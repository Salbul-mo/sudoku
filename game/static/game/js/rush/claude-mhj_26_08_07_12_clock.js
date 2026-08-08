// The per-step countdown.
//
// Time comes in through deps rather than off the global, so a test can run a
// whole game in a millisecond and assert on exact boundaries instead of
// sleeping and hoping.
import { RUSH } from "./claude-mhj_26_08_07_11_config.js";

// How long the player gets on a given step. Clamped at the floor, so the game
// stops getting harder rather than becoming impossible.
export function limitFor(step) {
    if (!Number.isInteger(step) || step < 0) {
        throw new RangeError(`step must be a non-negative integer, got ${step}`);
    }
    return Math.max(RUSH.LIMIT_FLOOR_MS, RUSH.LIMIT_INITIAL_MS - step * RUSH.LIMIT_DECAY_MS);
}

export function createClock(deps) {
    for (const name of ["now", "setTimeout", "clearTimeout", "onExpire"]) {
        if (typeof deps?.[name] !== "function") {
            throw new TypeError(`createClock: deps.${name} must be a function`);
        }
    }

    let timer = null;
    let deadline = 0;
    let frozen = null; // ms left when paused; null while running

    function clear() {
        if (timer !== null) {
            deps.clearTimeout(timer);
            timer = null;
        }
    }

    function arm(ms) {
        clear();
        deadline = deps.now() + ms;
        frozen = null;
        timer = deps.setTimeout(() => {
            timer = null;
            deps.onExpire();
        }, ms);
    }

    function start(ms) {
        if (!Number.isFinite(ms) || ms <= 0) {
            throw new RangeError(`start: ms must be a positive number, got ${ms}`);
        }
        arm(ms);
    }

    function stop() {
        clear();
        deadline = 0;
        frozen = null;
    }

    // Backgrounding the tab must not burn a life: without this, a player who
    // takes a call comes back to a run that ended while the screen was off.
    function pause() {
        if (timer === null && frozen === null) return;
        frozen = remaining();
        clear();
    }

    function resume() {
        if (frozen === null) return;
        const ms = frozen;
        frozen = null;
        if (ms > 0) arm(ms);
        else deps.onExpire();
    }

    function remaining() {
        if (frozen !== null) return frozen;
        if (timer === null) return 0;
        return Math.max(0, deadline - deps.now());
    }

    return { start, stop, pause, resume, remaining, limitFor, get running() { return timer !== null; } };
}
