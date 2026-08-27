// The lives readout: a count, and one pip per life beside it.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeDocument, fakeRoot } from "./helpers/fake-dom.mjs";

const uninstall = installFakeDocument();
const { mountRushShell } = await import("../../game/static/game/js/rush/rush-shell.js");
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
