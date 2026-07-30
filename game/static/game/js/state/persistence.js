// Debounced, quota-aware session persistence. Every external dependency is
// injected (CV1) -- this is what makes fake-timer tests possible and keeps
// the module from ever touching window/document itself. Real pagehide and
// visibilitychange listeners are registered by bootstrap.js (UI-B12), not
// here (DV-07): this module only exposes flushNow() for that DOM layer to call.
import { serializeSession, deserializeSession } from "./serialize.js";

const KEY = "sudoku:v1:session";

export function createPersistence(deps) {
    for (const name of ["storage", "now", "setTimeout", "clearTimeout", "onWarning"]) {
        if (deps[name] === undefined) throw new TypeError(`createPersistence: missing deps.${name}`);
    }
    const { storage, setTimeout: schedule, clearTimeout: cancel, onWarning } = deps;

    let mode = "storage";
    let timer = null;
    let pending = null;
    let warned = false;

    function write(session) {
        if (mode === "memory") return;
        try {
            storage.setItem(KEY, JSON.stringify(serializeSession(session)));
            pending = null;
        } catch {
            mode = "memory";
            if (!warned) { warned = true; onWarning("storage-unavailable"); }
        }
    }

    return {
        get mode() { return mode; },

        schedule(session) {
            pending = session;
            if (timer !== null) cancel(timer);
            timer = schedule(() => { timer = null; write(pending); }, 300);
        },

        flushNow() {
            if (timer !== null) { cancel(timer); timer = null; }
            if (pending) write(pending);
        },

        restore() {
            let raw;
            try {
                raw = storage.getItem(KEY);
            } catch {
                return { ok: false, code: "empty", message: "storage unavailable" };
            }
            return raw ? deserializeSession(raw) : { ok: false, code: "empty", message: "no saved session" };
        },
    };
}
