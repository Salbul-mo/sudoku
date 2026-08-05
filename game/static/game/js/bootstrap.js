// Wires every other module into one running app. V4-07's whole point is
// "restore before network": a returning user with a saved session never
// waits on a fetch. This is also the only place CR1..CR5 (URL vs. local
// session conflicts) get evaluated, and the only place a failed new-puzzle
// fetch has to end somewhere other than a blank page (M1).
import { createStore } from "./core/store.js";

const NEW_PUZZLE_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 1000;
const UNDO_TOAST_MS = 8000;

class RetryableError extends Error {}

function isValidPuzzle(puzzle) {
    return Array.isArray(puzzle) && puzzle.length === 81
        && puzzle.every((v) => Number.isInteger(v) && v >= 0 && v <= 9);
}

function sessionFromPuzzle(puzzle) {
    const givens = Uint8Array.from(puzzle);
    return {
        schemaVersion: 1,
        puzzleId: String(Date.now()),
        dim: 9,
        givens,
        values: new Uint8Array(81),
        candidates: new Uint16Array(81),
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}

function sameGivens(a, b) {
    for (let i = 0; i < 81; i++) if (a[i] !== b[i]) return false;
    return true;
}

function coreSignature(session) {
    let filled = 0;
    for (const v of session.values) if (v) filled++;
    let candidates = 0;
    for (const c of session.candidates) if (c) candidates++;
    return { filled, candidates, updatedAt: session.updatedAt };
}

function differentCore(urlState, localSession) {
    const a = coreSignature({ values: urlState.values ?? new Uint8Array(81), candidates: urlState.candidates ?? new Uint16Array(81), updatedAt: urlState.savedAt ?? 0 });
    const b = coreSignature(localSession);
    return a.filled !== b.filled || a.candidates !== b.candidates;
}

function sessionFromDecoded(state) {
    return {
        schemaVersion: 1,
        puzzleId: "shared",
        dim: 9,
        givens: Uint8Array.from(state.givens),
        values: state.values ? Uint8Array.from(state.values) : new Uint8Array(81),
        candidates: state.candidates ? Uint16Array.from(state.candidates) : new Uint16Array(81),
        createdAt: Date.now(),
        updatedAt: state.savedAt ?? Date.now(),
    };
}

export async function resolveConflict(url, local, deps) {
    if (!url || !url.ok) {
        if (url) await deps.dialogs.confirm(`공유 링크를 해석하지 못했습니다 (${url.code}). 무시하고 계속할까요?`);
        return { session: local.ok ? local.session : null, consumedFragment: Boolean(url) };
    }
    // No local session: the URL is the only source of state, so it is adopted whole.
    if (!local.ok) {
        return { session: sessionFromDecoded(url.state), consumedFragment: true };
    }

    // CR1: different puzzle entirely -- the local session is archived, not lost.
    if (!sameGivens(url.state.givens, local.session.givens)) {
        deps.archive?.(local.session);
        deps.announcer?.announce("session", "이전 진행을 보관함으로 옮기고 8초 안에 되돌릴 수 있습니다");
        deps.toastUndo?.(UNDO_TOAST_MS);
        return { session: sessionFromDecoded(url.state), consumedFragment: true };
    }

    // CR2/CR3: same puzzle, core (values/candidates) may differ.
    let coreSession = local.session;
    if (url.state.values && differentCore(url.state, local.session)) {
        const choice = await deps.dialogs.open({
            kind: "conflict", title: "진행 상태 선택",
            body: deps.buildCoreSummary?.(url.state, local.session) ?? document.createTextNode("어느 진행을 쓸까요?"),
            actions: [{ id: "local", label: "이 기기" }, { id: "url", label: "공유된 진행" }],
        });
        if (choice === "url") coreSession = sessionFromDecoded(url.state);
    }

    return {
        session: { ...coreSession },
        consumedFragment: true,
    };
}

function renderInertSkeleton(root) {
    const shell = document.createElement("div");
    shell.dataset.state = "loading";
    shell.setAttribute("aria-busy", "true");
    root.appendChild(shell);
    return shell;
}

const RETRY_MESSAGES = {
    offline: "오프라인 상태입니다. 연결 후 다시 시도하세요.",
    server: "서버에 문제가 있습니다. 잠시 후 다시 시도하세요.",
    network: "네트워크에 연결할 수 없습니다. 다시 시도하세요.",
};

function showRetryPanel(deps, cause) {
    if (!(cause in RETRY_MESSAGES)) throw new RangeError(`unknown retry cause: ${cause}`);
    const panel = document.createElement("div");
    panel.className = "retry-panel";
    const message = document.createElement("p");
    message.textContent = RETRY_MESSAGES[cause];
    panel.appendChild(message);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "다시 시도";
    panel.appendChild(button);
    deps.root.appendChild(panel);
    button.focus();
    globalThis.window?.addEventListener?.("online", () => { button.dataset.highlight = "1"; }, { once: true });
    deps.announcer?.announce("session", RETRY_MESSAGES[cause]);
    return null; // never a blank page
}

export async function createNewSession(deps) {
    if (globalThis.navigator?.onLine === false) return showRetryPanel(deps, "offline");
    for (let attempt = 1; attempt <= 2; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), NEW_PUZZLE_TIMEOUT_MS);
        try {
            const res = await deps.fetchPuzzle({ signal: controller.signal });
            if (res.status >= 500) throw new RetryableError();
            if (!res.ok) return showRetryPanel(deps, "server"); // 4xx: no retry
            const data = await res.json();
            if (!isValidPuzzle(data.puzzle)) return showRetryPanel(deps, "server");
            return sessionFromPuzzle(data.puzzle); // solution is read and discarded (V4-13)
        } catch {
            if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            else return showRetryPanel(deps, "network");
        } finally {
            clearTimeout(timer);
        }
    }
    return null;
}

export function wireLifecycle(persistence) {
    if (typeof persistence.flushNow !== "function") {
        throw new TypeError("wireLifecycle: persistence.flushNow must be a function");
    }
    const flush = () => persistence.flushNow();
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") flush(); };
    globalThis.window?.addEventListener?.("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    // Deliberately no unload-time event (it is unreliable and can block the
    // page from closing, V4-08); pagehide and hidden visibilitychange cover it.
    return function unwire() {
        globalThis.window?.removeEventListener?.("pagehide", flush);
        document.removeEventListener("visibilitychange", onVisibilityChange);
    };
}

function cleanUrl() {
    return location.pathname + location.search; // drops the fragment; the address bar is never otherwise touched
}

// ShareView builds links as `#s=<fragment>`, but codec.decode() is handed the
// raw payload -- it validates base64url, so leaving the `s=` prefix on would
// make every shared link fail as invalid-base64. Anything that is not our
// `s=` fragment (a plain anchor, another app's fragment) is not ours to
// decode, so it yields "" and the boot continues as if there were no hash.
export function stripFragmentPrefix(hash) {
    if (typeof hash !== "string") {
        throw new TypeError("stripFragmentPrefix: hash must be a string");
    }
    const raw = hash.startsWith("#") ? hash.slice(1) : hash;
    return raw.startsWith("s=") ? raw.slice(2) : "";
}

export async function bootstrap(deps) {
    for (const name of ["root", "persistence", "settings", "codec", "dialogs", "announcer", "fetchPuzzle", "history"]) {
        if (deps[name] === undefined) throw new TypeError(`bootstrap: missing deps.${name}`);
    }
    // Step 8 is optional so a caller that mounts the UI itself after bootstrap
    // returns stays valid; callers that hand the mounting back to bootstrap
    // pass enableAdapters and get its teardown threaded into the result.
    if (deps.enableAdapters !== undefined && typeof deps.enableAdapters !== "function") {
        throw new TypeError("bootstrap: deps.enableAdapters must be a function");
    }

    renderInertSkeleton(deps.root); // step 1

    const fragment = stripFragmentPrefix(deps.hash ?? ""); // step 2
    const url = fragment ? await deps.codec.decode(fragment) : null; // step 3
    const local = deps.persistence.restore(); // step 4
    const decision = await resolveConflict(url, local, deps); // step 5, evaluated once

    let session = decision.session;
    if (!session) session = await createNewSession(deps); // step 7 (only if no adopted session)
    if (!session) return { ok: false, reason: "no-session" };

    const store = createStore(session); // step 6
    const teardownAdapters = deps.enableAdapters?.(store); // step 8
    const unwireLifecycle = wireLifecycle(deps.persistence);

    if (decision.consumedFragment) deps.history.replaceState(cleanUrl()); // step 9

    return {
        ok: true,
        store,
        teardown() {
            unwireLifecycle();
            if (typeof teardownAdapters === "function") teardownAdapters();
        },
    };
}
