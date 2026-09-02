#!/usr/bin/env node
// Renders the 1200x630 link-preview images, one per (game, language).
//
//   node tools/build_og.mjs --write
//
// Needs Chrome. Unlike tools/build_icons.mjs there is no --check mode, and the
// reason is text: these cards carry real words, so they need a font rasterizer,
// and font rasterization is not reproducible across machines or Chrome
// versions. A byte-comparison check would fail on a different laptop while the
// image was perfectly correct, so this tool writes and the test asserts what
// can honestly be asserted -- that the files exist, are PNGs, and are the size
// Open Graph requires.
//
// The outputs are committed, so a normal build and a deploy never run this.
// Re-run it when a heading or tagline in i18n/messages.js changes.
//
// Chrome is found via CHROME_PATH or the usual Windows install location, the
// same shape tools/browser-smoke.mjs uses for its own endpoint override.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { MESSAGES } from '../game/static/game/js/i18n/messages.js';

const root = path.resolve(import.meta.dirname, '..');
const staticRoot = path.join(root, 'game', 'static');

const WIDTH = 1200;
const HEIGHT = 630;

const CHROME = process.env.CHROME_PATH
    ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// Same three tokens the favicon is drawn from (game/static/game/css/tokens.css).
const PAPER = '#E8E7E3';
const LINE = '#3A3935';
const MARK = '#2F4E70';

const CARDS = [
    { out: 'og-classic-ko.png', locale: 'ko', heading: 'meta.heading', tagline: 'meta.shareTagline' },
    { out: 'og-classic-en.png', locale: 'en', heading: 'meta.heading', tagline: 'meta.shareTagline' },
    { out: 'og-rush-ko.png', locale: 'ko', heading: 'meta.rushHeading', tagline: 'meta.rushShareTagline' },
    { out: 'og-rush-en.png', locale: 'en', heading: 'meta.rushHeading', tagline: 'meta.rushShareTagline' },
    { out: 'og-learn-ko.png', locale: 'ko', heading: 'meta.learnHeading', tagline: 'meta.learnShareTagline' },
    { out: 'og-learn-en.png', locale: 'en', heading: 'meta.learnHeading', tagline: 'meta.learnShareTagline' },
];

function escapeText(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The card. Grid mark on the left, wordmark on the right.
 *
 * The 3x3 is the favicon's mark at poster size rather than a real 9x9 board:
 * a link preview is shown at perhaps 500px wide in a timeline, and a full board
 * at that scale is a gray texture. Sizes are absolute px, never viewport units,
 * because the screenshot is taken at a fixed window size and a vh here would
 * silently re-scale if that ever changed.
 */
function cardHtml({ locale, heading, tagline }) {
    const m = (key) => {
        const value = MESSAGES[locale][key];
        if (value === undefined) throw new Error(`unknown message key: ${key} (${locale})`);
        return value;
    };
    const cells = Array.from({ length: 9 }, (_, i) => (
        `<div class="cell${i === 4 ? ' filled' : ''}"></div>`
    )).join('');
    return `<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; background: ${PAPER};
    display: flex; align-items: center; gap: 88px; padding: 0 96px;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    color: ${LINE};
  }
  .mark {
    flex: none; width: 300px; height: 300px;
    display: grid; grid-template: repeat(3, 1fr) / repeat(3, 1fr);
    gap: 8px; background: ${LINE}; border: 8px solid ${LINE};
  }
  .cell { background: #F6F5F2; }
  .cell.filled { background: ${MARK}; }
  /* text-wrap: balance on both, because the longest line here is the English
     Rush tagline and left to itself it breaks one word onto its own line. */
  h1 { font-size: 108px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.05; text-wrap: balance; }
  p { margin-top: 28px; font-size: 42px; font-weight: 500; color: #55534E; line-height: 1.3; text-wrap: balance; }
  .rule { margin-top: 40px; width: 160px; height: 8px; background: ${MARK}; }
</style></head>
<body>
  <div class="mark">${cells}</div>
  <div>
    <h1>${escapeText(m(heading))}</h1>
    <p>${escapeText(m(tagline))}</p>
    <div class="rule"></div>
  </div>
</body>
</html>
`;
}

function shoot(html, target) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'og-'));
    const source = path.join(scratch, 'card.html');
    try {
        fs.writeFileSync(source, html, 'utf8');
        execFileSync(CHROME, [
            '--headless',
            '--disable-gpu',
            '--hide-scrollbars',
            `--screenshot=${target}`,
            `--window-size=${WIDTH},${HEIGHT}`,
            `file:///${source.replace(/\\/g, '/')}`,
        ], { stdio: 'pipe' });
    } finally {
        fs.rmSync(scratch, { recursive: true, force: true });
    }
}

const mode = process.argv.slice(2);
if (mode.length !== 1 || mode[0] !== '--write') {
    throw new Error('usage: node tools/build_og.mjs --write');
}
if (!fs.existsSync(CHROME)) {
    throw new Error(`Chrome not found at ${CHROME}; set CHROME_PATH`);
}
for (const card of CARDS) {
    shoot(cardHtml(card), path.join(staticRoot, card.out));
}
