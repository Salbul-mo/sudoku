#!/usr/bin/env node
// Smoke-drives the running app in a real browser over the DevTools Protocol:
// render, keyboard entry, Ctrl+Arrow navigation, pointer selection, dialogs,
// persistence, and the conflict cue. Covers what tests/js cannot -- layout,
// computed style, real focus, and trusted input events -- without adding a
// dependency: node's built-in WebSocket speaks CDP directly.
//
// Prerequisites (two background processes, then this script):
//
//   python manage.py runserver 8731 --noreload
//   chrome --headless=new --disable-gpu --remote-debugging-port=9222 \
//          --user-data-dir=<scratch> about:blank
//   node tools/browser-smoke.mjs
//
// Exits non-zero on any failed check, console error, or uncaught exception.
// Env: APP_URL (default http://127.0.0.1:8731/), CDP_URL (default
// http://127.0.0.1:9222). The first positional argument also sets APP_URL.
const BASE = process.env.CDP_URL ?? "http://127.0.0.1:9222";
const PAGE = process.argv[2] ?? process.env.APP_URL ?? "http://127.0.0.1:8731/";

const targets = await (await fetch(`${BASE}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });

let id = 0;
const pending = new Map();
const consoleErrors = [];
const exceptions = [];

ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id !== undefined) {
        pending.get(msg.id)?.(msg);
        pending.delete(msg.id);
        return;
    }
    if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails;
        exceptions.push(d.exception?.description ?? d.text);
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
        consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
    }
    // The project ships no favicon, so every load logs one 404 that says
    // nothing about the app. The filename is in entry.url, not entry.text
    // ("Failed to load resource: ... 404"), so the url is what to match on.
    if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error"
        && !(msg.params.entry.url ?? "").includes("favicon")) {
        consoleErrors.push(`[${msg.params.entry.source}] ${msg.params.entry.text} ${msg.params.entry.url ?? ""}`.trim());
    }
};

function send(method, params = {}) {
    const msgId = ++id;
    ws.send(JSON.stringify({ id: msgId, method, params }));
    return new Promise((r) => pending.set(msgId, r));
}

const evaluate = async (expression) => {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (res.result?.exceptionDetails) {
        throw new Error(res.result.exceptionDetails.exception?.description ?? "evaluate failed");
    }
    return res.result.result.value;
};

const key = async (code, k, vk, modifiers = 0) => {
    for (const type of ["keyDown", "keyUp"]) {
        await send("Input.dispatchKeyEvent", { type, code, key: k, windowsVirtualKeyCode: vk, modifiers });
    }
};

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
// Start from a clean slate: the profile persists localStorage between runs,
// and a restored session would make every "type digit X" step ambiguous
// (re-entering the digit already in a cell clears it, by design).
await send("Page.navigate", { url: PAGE });
await new Promise((r) => setTimeout(r, 2000));
await send("Runtime.evaluate", { expression: `localStorage.clear()` });
await send("Page.reload", { ignoreCache: true });
await new Promise((r) => setTimeout(r, 3000));

const checks = [];
const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    checks.push({ name, ok, actual, expected });
};

check("board renders 81 cells", await evaluate(`document.querySelectorAll('[role="gridcell"]').length`), 81);
check("live region is visually hidden",
    await evaluate(`(() => { const r = document.querySelector('[aria-live]');
        const s = getComputedStyle(r); return s.position === "absolute" && r.getBoundingClientRect().width <= 1; })()`), true);
check("board has a real rendered width",
    await evaluate(`document.querySelector('.board').getBoundingClientRect().width > 200`), true);
check("header buttons meet the 48px control floor",
    await evaluate(`[...document.querySelectorAll('.app-shell-header button')]
        .every(b => b.getBoundingClientRect().height >= 48)`), true);

// --- keyboard: navigate to the first empty cell using only real key events,
// so the adapter's own selection is what moves (a scripted .focus() would
// desynchronise it and test the driver rather than the app).
const emptyIndex = await evaluate(
    `Number(document.querySelector('.cell[data-given="0"]').dataset.index)`);
check("mounting seeds the selection on cell 0",
    await evaluate(`Number(document.activeElement.dataset.index)`), 0);
for (let i = 0; i < emptyIndex; i++) await key("ArrowRight", "ArrowRight", 39);
check("arrow navigation reaches the first empty cell",
    await evaluate(`Number(document.activeElement.dataset.index)`), emptyIndex);
await key("Digit5", "5", 53);
check("typing 5 fills the focused cell",
    await evaluate(`document.querySelector('[data-index="${emptyIndex}"] .cell-value').textContent`), "5");

// --- the Ctrl+Arrow regression: a one-box (3 cell) jump
const beforeJump = await evaluate(`Number(document.activeElement.dataset.index)`);
await key("ArrowRight", "ArrowRight", 39, 2); // modifiers 2 = Ctrl
check("Ctrl+ArrowRight jumps one box (3 cells), not one",
    await evaluate(`Number(document.activeElement.dataset.index)`),
    Math.floor(beforeJump / 9) * 9 + Math.min(8, (beforeJump % 9) + 3));

// --- persistence (the write is debounced by 300ms, so wait it out)
await new Promise((r) => setTimeout(r, 600));
check("the session is written to localStorage",
    await evaluate(`JSON.parse(localStorage.getItem("sudoku:v1:session")).values[${emptyIndex}]`), 5);

// --- touch controls
check("the digit bar rendered 9 digits plus pencil and memo",
    await evaluate(`document.querySelectorAll('.digit-bar button').length`), 11);

// --- dialog: open help and confirm focus containment mounts
await evaluate(`document.querySelector('[data-action="help"]').click()`);
await new Promise((r) => setTimeout(r, 300));
check("help opens a modal dialog", await evaluate(`!!document.querySelector('[role="dialog"]')`), true);
check("the background is inert while the dialog is open",
    await evaluate(`document.querySelector('.app-shell').inert === true`), true);
await key("Escape", "Escape", 27);
await new Promise((r) => setTimeout(r, 300));
check("Escape closes the dialog and clears inert",
    await evaluate(`!document.querySelector('[role="dialog"]') && document.querySelector('.app-shell').inert === false`), true);

// --- conflict display: two empty cells in one row, filled with a digit that
// is absent from both cells' row, column, and box, so the only conflict they
// can have is with each other. Picking blind would collide with a given and
// leave a legitimate conflict behind after the clear.
const pair = await evaluate(`(() => {
    const val = (i) => { const c = document.querySelector('[data-index="'+i+'"]');
        return c.dataset.given === "1" ? c.querySelector('.cell-value').textContent : ""; };
    const unitsOf = (i) => { const r = Math.floor(i/9), c = i%9, b = Math.floor(r/3)*3 + Math.floor(c/3);
        const out = new Set();
        for (let k = 0; k < 9; k++) { out.add(r*9+k); out.add(k*9+c);
            out.add((Math.floor(b/3)*3 + Math.floor(k/3))*9 + (b%3)*3 + k%3); }
        out.delete(i); return [...out]; };
    const empty = (i) => document.querySelector('[data-index="'+i+'"]').dataset.given === "0"
        && document.querySelector('[data-index="'+i+'"] .cell-value').textContent === "";
    for (let r = 0; r < 9; r++) {
        const cells = []; for (let c = 0; c < 9; c++) if (empty(r*9+c)) cells.push(r*9+c);
        if (cells.length < 2) continue;
        for (let a = 0; a < cells.length; a++) for (let b = a+1; b < cells.length; b++) {
            const seen = new Set([...unitsOf(cells[a]), ...unitsOf(cells[b])].map(val).filter(Boolean));
            for (let d = 1; d <= 9; d++) if (!seen.has(String(d)))
                return { a: cells[a], b: cells[b], digit: d };
        }
    }
    return null; })()`);
check("found an isolated pair to test conflicts with", pair !== null, true);
const rowPeer = pair.b;
// Click the peer cell -- this also exercises pointer -> keyboard selection sync.
const box = await evaluate(`(() => { const r = document.querySelector('[data-index="${rowPeer}"]')
    .getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1, pointerType: "mouse" });
}
check("clicking a cell moves the selection there",
    await evaluate(`Number(document.activeElement.dataset.index)`), rowPeer);

const dk = [`Digit${pair.digit}`, String(pair.digit), 48 + pair.digit];
await key(...dk); // fills pair.b, the cell just clicked
check("typing after a click writes to the clicked cell",
    await evaluate(`document.querySelector('[data-index="${pair.b}"] .cell-value').textContent`),
    String(pair.digit));

// now fill pair.a with the same digit by clicking it too
const boxA = await evaluate(`(() => { const r = document.querySelector('[data-index="${pair.a}"]')
    .getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x: boxA.x, y: boxA.y, button: "left", clickCount: 1, pointerType: "mouse" });
}
await key(...dk);
check("a duplicate in the same row marks both cells",
    await evaluate(`document.querySelector('[data-index="${pair.a}"]').dataset.conflict === "1"
        && document.querySelector('[data-index="${pair.b}"]').dataset.conflict === "1"`), true);

// Delete clears pair.a (the current selection); pair.b must stop being marked
// even though the store only reports pair.a as changed.
await key("Delete", "Delete", 46);
check("clearing one duplicate clears the other cell's conflict cue too",
    await evaluate(`document.querySelector('[data-index="${pair.b}"]').dataset.conflict`), "0");

console.log("\n=== interaction checks ===");
for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}`);
    if (!c.ok) console.log(`      expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(c.actual)}`);
}
console.log(`\n=== console errors: ${consoleErrors.length} ===`);
for (const e of consoleErrors) console.log("  " + e);
console.log(`=== uncaught exceptions: ${exceptions.length} ===`);
for (const e of exceptions) console.log("  " + e);

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} interaction checks passed`);
ws.close();
process.exit(failed || consoleErrors.length || exceptions.length ? 1 : 0);
