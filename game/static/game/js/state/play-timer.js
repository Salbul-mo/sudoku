// How long this puzzle has actually been played.
//
// Not `updatedAt - createdAt`: a board left open in a background tab overnight
// would report fourteen hours, and a personal best is worthless if it measures
// how long a tab was open rather than how long someone was solving. This
// accumulates only while the timer is running, and the page stops it when the
// tab is hidden and when the puzzle is finished.
//
// The accumulated total lives on the session, so it survives a reload the same
// way the board does. `now` is injected, which is what makes the tests
// deterministic rather than dependent on wall-clock timing.
export function createPlayTimer(initialMs = 0, now = () => Date.now()) {
    if (!Number.isFinite(initialMs) || initialMs < 0) {
        throw new RangeError(`initialMs must be a non-negative number, got ${initialMs}`);
    }
    if (typeof now !== "function") throw new TypeError("createPlayTimer: now must be a function");

    let accumulated = initialMs;
    let startedAt = null;

    return {
        start() {
            if (startedAt === null) startedAt = now();
        },

        stop() {
            if (startedAt === null) return;
            // Clamped at zero because a system clock that steps backwards --
            // an NTP correction, a manual change -- would otherwise subtract
            // time from a total that is only ever supposed to grow.
            accumulated += Math.max(0, now() - startedAt);
            startedAt = null;
        },

        get running() { return startedAt !== null; },

        /** Total played time, including the stretch currently in progress. */
        elapsed() {
            if (startedAt === null) return accumulated;
            return accumulated + Math.max(0, now() - startedAt);
        },

        reset(ms = 0) {
            accumulated = ms;
            startedAt = null;
        },
    };
}

/**
 * `m:ss`, or `h:mm:ss` once it runs past an hour.
 *
 * Not localised: the digits and colons read the same in both languages, and a
 * duration written any other way would need a message key per magnitude.
 */
export function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) {
        throw new RangeError(`ms must be a non-negative number, got ${ms}`);
    }
    const total = Math.floor(ms / 1000);
    const seconds = total % 60;
    const minutes = Math.floor(total / 60) % 60;
    const hours = Math.floor(total / 3600);
    const pad = (n) => String(n).padStart(2, "0");
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
