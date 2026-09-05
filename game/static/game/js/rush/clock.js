// The per-step countdown.
//
// Time comes in through deps rather than off the global, so a test can run a
// whole game in a millisecond and assert on exact boundaries instead of
// sleeping and hoping.
import { DEFAULT_RUSH_MODE, RUSH, rushModeForId } from "./config.js";

// How long the player gets on a given step. Clamped at the floor, so the game
// stops getting harder rather than becoming impossible.
//
// A harder deduction gets more time, on the same two axes the score uses: the
// technique and how many units its evidence spans. The allowance is added to
// the decaying base rather than multiplied by it, so it barely shows early --
// where ten seconds is already plenty -- and does the work at the floor, where
// a run actually runs out of time.
//
// The cap is what keeps that from inverting the run: without it, unlocking a
// harder technique hands the player more time than the run opened with (12.0s
// against 10.0s, measured at step 12). Capped, no step is ever more generous
// than the first one.
//
// Called with a step alone -- the whole game did until techniques arrived --
// it returns exactly what it always returned: the advanced mode's ten-second
// opening limit.
export function limitFor(step, technique = null, units = 1, modeId = DEFAULT_RUSH_MODE) {
    if (!Number.isInteger(step) || step < 0) {
        throw new RangeError(`step must be a non-negative integer, got ${step}`);
    }
    const mode = rushModeForId(modeId);
    if (mode === null) throw new RangeError(`unknown rush mode: ${modeId}`);
    const initial = mode.limitMs;
    const floor = Math.min(RUSH.LIMIT_FLOOR_MS, initial);
    const base = Math.max(floor, initial - step * RUSH.LIMIT_DECAY_MS);
    if (technique == null) return base;

    const bonus = RUSH.TIME_BONUS_MS[technique];
    if (bonus === undefined) throw new RangeError(`unknown technique: ${technique}`);
    const rank = Number.isInteger(units) && units >= 1 ? units : 1;
    const allowance = bonus + RUSH.EVIDENCE_TIME_BONUS_MS * (rank - 1);
    return Math.min(initial, base + allowance);
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
