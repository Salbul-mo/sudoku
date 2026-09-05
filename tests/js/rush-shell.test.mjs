// The lives readout: a count, and one pip per life beside it.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeDocument, fakeRoot } from "./helpers/fake-dom.mjs";

const uninstall = installFakeDocument();
const { mountRushShell } = await import("../../game/static/game/js/rush/rush-shell.js");
const { mountRushView } = await import("../../game/static/game/js/rush/rush-view.js");
const { RUSH } = await import("../../game/static/game/js/rush/config.js");
after(uninstall);

// header = [stats, game switch, language switch]; stats = [score, combo,
// lives]; a card is [label, line] and the lives line is [value, pip row].
function parts(root) {
    const header = root.children[0];
    const livesLine = header.children[0].children[2].children[1];
    return {
        header,
        value: livesLine.children[0],
        pips: livesLine.children[1].children,
    };
}

test("T-B05-01: the header states the full lives count before a run starts", () => {
    const root = fakeRoot();
    mountRushShell(root, {});
    const { header, value, pips } = parts(root);
    assert.equal(value.textContent, `${RUSH.LIVES}/${RUSH.LIVES}`);
    assert.equal(header.dataset.lives, String(RUSH.LIVES));
    assert.equal(pips.length, RUSH.LIVES, "one pip per life");
    assert.ok(pips.every((pip) => pip.dataset.spent === "0"), "none spent yet");
});

test("T-B05-02: a spent life is hollowed rather than removed, so the total stays visible", () => {
    const root = fakeRoot();
    const shell = mountRushShell(root, {});
    const { header, value, pips } = parts(root);

    shell.setStats({ score: 40, combo: 2, lives: 1 });
    assert.equal(value.textContent, `1/${RUSH.LIVES}`);
    assert.equal(header.dataset.lives, "1", "the low-life cue keys off this");
    assert.equal(pips.length, RUSH.LIVES, "the pip row never shrinks");
    assert.deepEqual(
        pips.map((pip) => pip.dataset.spent),
        ["0", ...Array(RUSH.LIVES - 1).fill("1")],
    );

    shell.setStats({ score: 40, combo: 0, lives: 0 });
    assert.ok(pips.every((pip) => pip.dataset.spent === "1"), "a finished run shows none left");
});

test("T-B05-03: the pip row is hidden from screen readers, which get the count instead", () => {
    const root = fakeRoot();
    mountRushShell(root, {});
    const pipRow = root.children[0].children[0].children[2].children[1].children[1];
    assert.equal(pipRow.getAttribute("aria-hidden"), "true");
});

test("T-B10-04: the rush header keeps language navigation but no game-mode switch", () => {
    const root = fakeRoot();
    mountRushShell(root, {});
    const links = root.children[0].children[1];
    assert.equal(links.children.length, 1);
    assert.equal(links.children[0].className, "lang-switch");
});

test("T-B10-03: restart keeps the selected mode and mode change is a separate action", () => {
    const root = fakeRoot();
    const started = [];
    const view = mountRushView(root, { onRestart: (mode) => started.push(mode) });

    view.showStart();
    const wrap = root.children[0];
    const panel = wrap.children[2];
    const startActions = panel.children[1];
    const start = startActions.children[0];
    const change = startActions.children[1];
    assert.equal(start.textContent, "시작");
    assert.equal(change.textContent, "난이도 변경");

    change.dispatch("click");
    const options = panel.children[1];
    const pickerActions = panel.children[2];
    assert.equal(options.children.length, 4);
    assert.equal(options.children.map((option) => option.textContent).join(" / "), "초급 (20초 · 점수 0.5배) / 중급 (15초 · 점수 0.75배) / 상급 (10초 · 점수 1배) / 도전 (7초 · 점수 1.5배)");
    options.children[3].dispatch("click");
    assert.equal(options.children[3].getAttribute("aria-pressed"), "true");
    assert.deepEqual(started, [], "choosing a draft mode does not restart until applied");

    pickerActions.children[0].dispatch("click");
    assert.deepEqual(started, ["challenge"]);
    assert.equal(view.mode(), "challenge");

    const result = view.showResult({
        score: 0,
        bestCombo: 0,
        persisted: false,
        best: { bestScore: 0 },
    });
    const resultActions = result.again.parentNode;
    assert.equal(resultActions.children[0], result.again);
    assert.equal(resultActions.children[1], result.change);
    result.again.dispatch("click");
    assert.deepEqual(started, ["challenge", "challenge"], "restart reuses the selected mode");
});
