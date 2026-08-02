import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const template = path.join(root, 'game', 'templates', 'game', 'index.html');
const output = path.join(root, 'game', 'static', 'index.html');
const replacements = new Map([
  ["{% static 'game/css/tokens.css' %}", '/game/css/tokens.css'],
  ["{% static 'game/css/layout.css' %}", '/game/css/layout.css'],
  ["{% static 'game/css/board.css' %}", '/game/css/board.css'],
  ["{% static 'game/css/chrome.css' %}", '/game/css/chrome.css'],
  ["{% static 'game/js/main.js' %}", '/game/js/main.js'],
]);

function replaceExactlyOnce(source, marker, replacement) {
  const first = source.indexOf(marker);
  const second = first === -1 ? -1 : source.indexOf(marker, first + marker.length);
  if (first === -1 || second !== -1) {
    throw new Error(`expected exactly one template marker: ${marker}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + marker.length);
}

function build() {
  let html = fs.readFileSync(template, 'utf8');
  html = replaceExactlyOnce(html, '{% load static %}', '');
  for (const [marker, value] of replacements) {
    html = replaceExactlyOnce(html, marker, value);
  }
  if (/{%|%}|{{|}}/.test(html)) throw new Error('leftover Django template markers');
  return html;
}

function writeAtomic(content) {
  const temporary = path.join(
    path.dirname(output),
    `codex-mhj_26_08_02_${process.pid}_tmp_index.html`,
  );
  try {
    fs.writeFileSync(temporary, content, 'utf8');
    fs.renameSync(temporary, output);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary);
  }
}

const mode = process.argv.slice(2);
if (mode.length !== 1 || !['--write', '--check'].includes(mode[0])) {
  throw new Error('usage: node tools/codex-mhj_26_08_02_05_build_pages.mjs --write|--check');
}
const expected = build();
if (mode[0] === '--write') writeAtomic(expected);
else if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== expected) {
  throw new Error('static index is missing or stale');
}
