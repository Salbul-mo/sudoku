#!/usr/bin/env node
// Deep audit of the paths tools/browser-smoke.mjs does not reach: undo/redo,
// sticky candidate mode, the settings dialog, 정답 체크,
// a full share-link round trip through the URL codec and bootstrap, a corrupt
// fragment, 새 게임 (remount), and 전체 지우기.
//
// Same prerequisites as tools/browser-smoke.mjs -- see its header.
//
//   node tools/browser-audit.mjs
//
// Three traps this script exists to stay clear of, all of which produced
// false failures before they were understood:
//
//   1. Navigating between URLs that differ only in their #fragment is a
//      same-document navigation; the app never re-executes. hardNavigate()
//      bounces through about:blank to force a real load.
//   2. localStorage.clear() before leaving a page is undone by the pagehide
//      listener flushing the live session back. clearOriginStorage() uses CDP
//      Storage.clearDataForOrigin from off-origin instead.
//   3. Chrome caches the ES modules, so a source fix can appear to have no
//      effect. Network.setCacheDisabled is set before anything else runs.
//
// Env: APP_URL, CDP_URL (see browser-smoke.mjs).
const BASE = process.env.CDP_URL ?? "http://127.0.0.1:9222";
const APP = process.env.APP_URL ?? "http://127.0.0.1:8731/";

const t = (await (await fetch(`${BASE}/json/list`)).json()).find((x) => x.type === "page");
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });

let id = 0;
const pending = new Map();
const consoleErrors = [];
const exceptions = [];
ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id !== undefined) { pending.get(m.id)?.(m); pending.delete(m.id); return; }
    if (m.method === "Runtime.exceptionThrown") {
        exceptions.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    }
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
        consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
    }
    // The favicon 404 carries its filename in entry.url, not entry.text, so
    // matching on the text alone never filtered it out.
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error"
        && !(m.params.entry.url ?? "").includes("favicon")) {
        consoleErrors.push(`[${m.params.entry.source}] ${m.params.entry.text} ${m.params.entry.url ?? ""}`.trim());
    }
};
const send = (method, params = {}) => {
    const i = ++id;
    ws.send(JSON.stringify({ id: i, method, params }));
    return new Promise((r) => pending.set(i, r));
};
const ev = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description);
    return r.result.result.value;
};
const key = async (code, k, vk, modifiers = 0) => {
    for (const type of ["keyDown", "keyUp"]) {
        await send("Input.dispatchKeyEvent", { type, code, key: k, windowsVirtualKeyCode: vk, modifiers });
    }
};
const click = async (selector) => {
    const b = await ev(`(() => { const e = document.querySelector(${JSON.stringify(selector)});
        if (!e) return null; const r = e.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!b) throw new Error(`no element for ${selector}`);
    for (const type of ["mousePressed", "mouseReleased"]) {
        await send("Input.dispatchMouseEvent", { type, x: b.x, y: b.y, button: "left", clickCount: 1, pointerType: "mouse" });
    }
    await new Promise((r) => setTimeout(r, 250));
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Page.navigate between two URLs that differ only in their fragment is a
// same-document navigation: the hash changes and the app is never re-executed.
// Bouncing through about:blank forces the real load a user opening the link
// in a fresh tab would get.
// localStorage.clear() in the page is not enough before leaving it: the
// pagehide listener flushes the live session straight back on the way out.
// Clearing through CDP once we are off-origin is the only way to simulate a
// recipient who has never opened the app.
const clearOriginStorage = async () => {
    await send("Storage.clearDataForOrigin", { origin: APP.replace(/\/$/, ""), storageTypes: "local_storage" });
};

const hardNavigate = async (url) => {
    await send("Page.navigate", { url: "about:blank" });
    await wait(400);
    await send("Page.navigate", { url });
    // Poll instead of guessing a delay: with the HTTP cache disabled every
    // module is refetched, so a fixed wait is either flaky or wastefully long.
    for (let i = 0; i < 40; i++) {
        await wait(250);
        const settled = await ev(`document.querySelectorAll('[role="gridcell"]').length > 0
            || !!document.querySelector('[role="dialog"], .retry-panel')`);
        if (settled) return;
    }
    console.error(`  (hardNavigate: ${url} never settled)`);
};

process.on("unhandledRejection", (e) => {
    console.error("DRIVER ERROR:", e?.message ?? e);
    report();
    process.exit(1);
});

const checks = [];
const check = (name, actual, expected) => {
    checks.push({ name, ok: JSON.stringify(actual) === JSON.stringify(expected), actual, expected });
};

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Page.navigate", { url: APP });
await wait(1500);
await ev(`localStorage.clear()`);
await send("Page.reload", { ignoreCache: true });
await wait(2500);

const firstEmpty = async () => ev(`(() => { for (let i = 0; i < 81; i++) {
    const c = document.querySelector('[data-index="'+i+'"]');
    if (c.dataset.given === "0" && c.querySelector('.cell-value').textContent === "") return i; }
    return -1; })()`);
const goTo = async (target) => {
    const from = await ev(`Number(document.activeElement.dataset.index)`);
    for (let i = from; i < target; i++) await key("ArrowRight", "ArrowRight", 39);
    for (let i = from; i > target; i--) await key("ArrowLeft", "ArrowLeft", 37);
};
const clickCell = (i) => click(`[data-index="${i}"]`);
const cellText = (i) => ev(`document.querySelector('[data-index="${i}"] .cell-value').textContent`);
const candText = (i) => ev(`[...document.querySelectorAll('[data-index="${i}"] .candidate')]
    .map(n => n.textContent).join("")`);

// ---------------------------------------------------------------- undo/redo
const cell = await firstEmpty();
await goTo(cell);
await key("Digit7", "7", 55);
check("digit entered", await cellText(cell), "7");
await key("KeyZ", "z", 90, 2);            // Ctrl+Z
check("Ctrl+Z undoes the entry", await cellText(cell), "");
await key("KeyZ", "Z", 90, 2 | 8);        // Ctrl+Shift+Z
check("Ctrl+Shift+Z redoes it", await cellText(cell), "7");
await key("KeyY", "y", 89, 2);            // Ctrl+Y on an empty redo stack is a no-op
check("Ctrl+Y on an empty redo stack changes nothing", await cellText(cell), "7");
await key("Delete", "Delete", 46);

// ------------------------------------------------------- sticky / candidates
await key("Space", " ", 32);
await key("Digit3", "3", 51);
await key("Digit8", "8", 56);
check("sticky mode writes candidates, not a value", await cellText(cell), "");
check("both candidates are rendered", await candText(cell), "38");
check("sticky mode is announced",
    await ev(`document.querySelector('[aria-live]').textContent.includes("후보 입력 모드")`), true);
const markedCells = await ev(`document.querySelectorAll('.cell[data-candidate-mode="1"]').length`);
check("only the selected cell shows the candidate-mode badge", markedCells, 1);
await key("Space", " ", 32); // back to value mode
await key("Delete", "Delete", 46);

// ---------------------------------------------------------------- settings
await click('[data-action="settings"]');
check("settings dialog opens", await ev(`!!document.querySelector('.settings-form')`), true);
const boxes = await ev(`document.querySelectorAll('.settings-form input[type="checkbox"]').length`);
check("three boolean settings render", boxes, 3);
const radios = await ev(`document.querySelectorAll('.settings-form input[type="radio"]').length`);
check("three touchControls options render", radios, 3);
await ev(`(() => { const b = document.querySelectorAll('.settings-form input[type="checkbox"]')[1];
    b.checked = false; b.dispatchEvent(new Event("change")); })()`); // showConflicts off
check("showConflicts persists to storage",
    await ev(`JSON.parse(localStorage.getItem("sudoku:v1:settings")).showConflicts`), false);
await key("Escape", "Escape", 27);
await wait(300);

// make a conflict and confirm the cue is suppressed but 정답 체크 still finds it
//
// The digit is chosen to be wrong for `other` rather than hardcoded. 정답 체크
// judges against the solution when there is one, so it highlights cells that
// disagree with it -- and a hardcoded 9 that happened to be the right digit for
// this cell would be a correct entry the check has no reason to flag. That is a
// one-in-nine failure of the test, not of the app.
const other = await firstEmpty();
const wrongDigit = await ev(`(() => {
    const raw = JSON.parse(localStorage.getItem("sudoku:v1:session"));
    const truth = raw.solution[${other}];
    return truth === 9 ? 8 : 9; })()`);
const typeWrong = () => key(`Digit${wrongDigit}`, String(wrongDigit), 48 + wrongDigit);

await clickCell(other); // the settings dialog returned focus to the header button
await typeWrong();
// A second cell in the same row with the same digit, so the pair is also a
// plain rule violation -- which is what the accessible-name check reads.
const rowMate = await ev(`(() => { const r = Math.floor(${other} / 9);
    for (let c = 0; c < 9; c++) { const i = r * 9 + c;
        const el = document.querySelector('[data-index="'+i+'"]');
        if (i !== ${other} && el.dataset.given === "0" && el.querySelector('.cell-value').textContent === "") return i; }
    return -1; })()`);
await clickCell(rowMate);
await typeWrong();
check("with showConflicts off the cue stays hidden",
    await ev(`document.querySelector('[data-index="${other}"]').dataset.conflict`), "0");
check("but the violation is still in the accessible name",
    await ev(`document.querySelector('[data-index="${other}"]').getAttribute("aria-label").includes("규칙 위반")`), true);
await click('[data-action="check"]');
check("정답 체크 forces the cue on despite the setting",
    await ev(`document.querySelector('[data-index="${other}"]').dataset.conflict`), "1");
// ui/app-shell.js::onCheck has two branches: it judges against the solution
// when the session has one, and falls back to a rule-violation count when it
// does not (a session adopted from a shared link). This board came from the
// API, so it has a solution and the announcement is the solution-based one --
// "규칙 위반" is the fallback's wording and would mean the solution went
// missing. The fallback itself is covered in tests/js/app-shell.test.mjs
// ("onCheck without a known solution falls back to a rule-violation check").
check("정답 체크 announces how many cells differ from the solution",
    await ev(`document.querySelector('[aria-live]').textContent.includes("정답과 다른 칸")`), true);

// ------------------------------------------------------------ share round trip
await wait(700); // let the 300ms persistence debounce land before reading storage
check("the conflicting values reached storage before encoding",
    await ev(`JSON.parse(localStorage.getItem("sudoku:v1:session")).values.filter(Boolean).length`), 2);
const link = await ev(`(async () => {
    const { encode } = await import("/static/game/js/url/codec.js");
    const raw = JSON.parse(localStorage.getItem("sudoku:v1:session"));
    const session = { givens: raw.givens, values: raw.values, candidates: raw.candidates };
    const fragment = await encode(session, "SC2", raw.updatedAt);
    return location.origin + location.pathname + "#s=" + fragment;
})()`);
check("a share link was produced", typeof link === "string" && link.includes("#s="), true);
await send("Page.navigate", { url: "about:blank" });
await wait(500);
await clearOriginStorage(); // the recipient of a shared link has no saved session
await hardNavigate(link);
check("the shared link restores the entered values",
    await ev(`document.querySelector('[data-index="${other}"] .cell-value').textContent`),
    String(wrongDigit));
check("the fragment is stripped from the address bar after adoption",
    await ev(`location.hash`), "");
check("no retry panel after adopting a link", await ev(`!document.querySelector('.retry-panel')`), true);

// a corrupt fragment must not blank the page
await hardNavigate(APP + "#s=!!!!not-base64!!!!");
check("a corrupt fragment asks the user instead of failing silently",
    await ev(`(document.querySelector('[role="dialog"]')?.textContent ?? "").includes("해석하지 못했습니다")`), true);
check("the board is NOT mounted while that dialog is unanswered",
    await ev(`document.querySelectorAll('[role="gridcell"]').length`), 0);
await ev(`[...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent === "계속").click()`);
await wait(3000);
check("answering the dialog mounts a playable board",
    await ev(`document.querySelectorAll('[role="gridcell"]').length`), 81);
check("the corrupt fragment is cleared from the address bar", await ev(`location.hash`), "");

// ---------------------------------------------------------------- new game
await ev(`localStorage.clear()`);
await hardNavigate(APP);
const beforeGivens = await ev(`[...document.querySelectorAll('.cell')].map(c => c.dataset.given).join("")`);
await click('[data-action="newGame"]');
await wait(300);
check("새 게임 asks which difficulty first", await ev(`!!document.querySelector('[role="dialog"]')`), true);
// Picking a difficulty is itself the confirmation -- there is no separate
// yes/no step -- so the five difficulties plus 취소 are what this dialog offers.
check("the difficulty dialog offers all five plus cancel",
    await ev(`[...document.querySelectorAll('[role="dialog"] button')].map(b => b.textContent).join(",")`),
    "입문,쉬움,보통,어려움,전문가,취소");
await ev(`[...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent === "어려움").click()`);
await wait(3000);
const afterGivens = await ev(`[...document.querySelectorAll('.cell')].map(c => c.dataset.given).join("")`);
check("새 게임 replaces the puzzle", beforeGivens !== afterGivens, true);
check("새 게임 leaves exactly one board mounted",
    await ev(`document.querySelectorAll('[role="grid"]').length`), 1);
check("새 게임 leaves exactly one header mounted",
    await ev(`document.querySelectorAll('.app-shell-header').length`), 1);
check("새 게임 leaves exactly one digit bar mounted",
    await ev(`document.querySelectorAll('.digit-bar').length`), 1);
await clickCell(await firstEmpty());
await key("Digit4", "4", 52);
check("input still works after 새 게임",
    await ev(`document.querySelector('[data-index="'+document.activeElement.dataset.index+'"] .cell-value').textContent`), "4");
await wait(600);
check("the new game is persisted",
    await ev(`JSON.parse(localStorage.getItem("sudoku:v1:session")).values.filter(Boolean).length`), 1);

// --------------------------------------------------------------- clear all
await click('[data-action="clearAll"]');
await wait(300);
await ev(`[...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent === "계속").click()`);
await wait(400);
check("전체 지우기 empties every user value",
    await ev(`[...document.querySelectorAll('.cell[data-given="0"] .cell-value')].every(n => n.textContent === "")`), true);
await clickCell(0);
await key("KeyZ", "z", 90, 2);
check("전체 지우기 is undoable as one step",
    await ev(`[...document.querySelectorAll('.cell[data-given="0"] .cell-value')].filter(n => n.textContent).length`), 1);



// Hoisted so the unhandledRejection handler above can print whatever was
// collected before a crash -- a driver that dies mid-run must not swallow the
// checks it already completed.
function report() {
    console.log("\n=== audit checks ===");
    let failed = 0;
    for (const c of checks) {
        console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}`);
        if (!c.ok) { failed++; console.log(`      expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(c.actual)}`); }
    }
    console.log(`\nconsole errors: ${consoleErrors.length}`);
    for (const e of consoleErrors) console.log("  " + e);
    console.log(`uncaught exceptions: ${exceptions.length}`);
    for (const e of exceptions) console.log("  " + e);
    console.log(`\n${checks.length - failed}/${checks.length} audit checks passed`);
    return failed;
}

const failed = report();
ws.close();
process.exit(failed || consoleErrors.length || exceptions.length ? 1 : 0);
