import fs from 'node:fs';
import path from 'node:path';
import { MESSAGES } from '../game/static/game/js/i18n/claude-mhj_26_08_07_05_messages.js';

const root = path.resolve(import.meta.dirname, '..');
const template = path.join(root, 'game', 'templates', 'game', 'index.html');
const staticRoot = path.join(root, 'game', 'static');

// The address Google indexes. Canonical and hreflang have to be absolute, so
// this constant is the one place the deployed origin is written down.
const ORIGIN = 'https://sudoku-bw7.pages.dev';

// Order matters only in that ko is the x-default: it is the language the site
// was written in, and `/` is where a link with no locale lands.
const PAGES = [
  { locale: 'ko', urlPath: '/', ogLocale: 'ko_KR', out: ['index.html'] },
  { locale: 'en', urlPath: '/en/', ogLocale: 'en_US', out: ['en', 'index.html'] },
];

// Asset URLs are site-absolute, so /en/index.html loads exactly the same files
// as / without any depth-relative rewriting.
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

// Replaces the whole `<!-- i18n:name:start -->…<!-- i18n:name:end -->` span,
// comments included, so the generated pages carry no build scaffolding.
function replaceRegion(source, name, replacement) {
  const open = `<!-- i18n:${name}:start -->`;
  const close = `<!-- i18n:${name}:end -->`;
  const start = source.indexOf(open);
  const end = source.indexOf(close, start === -1 ? 0 : start);
  if (start === -1 || end === -1) throw new Error(`missing i18n region: ${name}`);
  if (source.indexOf(open, start + open.length) !== -1) {
    throw new Error(`duplicate i18n region: ${name}`);
  }
  return source.slice(0, start) + replacement + source.slice(end + close.length);
}

function escapeText(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return escapeText(value).replace(/"/g, '&quot;');
}

function headFor(page) {
  const m = (key) => {
    const value = MESSAGES[page.locale][key];
    if (value === undefined) throw new Error(`unknown message key: ${key} (${page.locale})`);
    return value;
  };
  const url = `${ORIGIN}${page.urlPath}`;
  // Every language links to every language including itself -- an hreflang set
  // that omits the self-reference is the single most common way to get the
  // whole set ignored.
  const alternates = PAGES.map(
    (p) => `    <link rel="alternate" hreflang="${p.locale}" href="${ORIGIN}${p.urlPath}">`,
  );
  return [
    `    <title>${escapeText(m('meta.title'))}</title>`,
    `    <meta name="description" content="${escapeAttr(m('meta.description'))}">`,
    `    <link rel="canonical" href="${url}">`,
    ...alternates,
    `    <link rel="alternate" hreflang="x-default" href="${ORIGIN}/">`,
    '    <meta property="og:type" content="website">',
    `    <meta property="og:url" content="${url}">`,
    `    <meta property="og:title" content="${escapeAttr(m('meta.title'))}">`,
    `    <meta property="og:description" content="${escapeAttr(m('meta.ogDescription'))}">`,
    `    <meta property="og:locale" content="${page.ogLocale}">`,
    '    <meta name="twitter:card" content="summary">',
  ].join('\n');
}

function build(page) {
  const m = (key) => MESSAGES[page.locale][key];
  let html = fs.readFileSync(template, 'utf8');
  html = replaceExactlyOnce(html, '{% load static %}', '');
  for (const [marker, value] of replacements) {
    html = replaceExactlyOnce(html, marker, value);
  }
  html = replaceExactlyOnce(html, '<html lang="ko">', `<html lang="${page.locale}">`);
  html = replaceRegion(html, 'head', headFor(page).trimStart());
  html = replaceRegion(html, 'heading', `<h1 class="visually-hidden">${escapeText(m('meta.heading'))}</h1>`);
  html = replaceRegion(html, 'noscript', `<noscript>\n        <p>${escapeText(m('meta.noscript'))}</p>\n    </noscript>`);
  if (/{%|%}|{{|}}/.test(html)) throw new Error('leftover Django template markers');
  if (/<!-- i18n:/.test(html)) throw new Error('leftover i18n region marker');
  return html;
}

function writeAtomic(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = path.join(
    path.dirname(target),
    `codex-mhj_26_08_02_${process.pid}_tmp_index.html`,
  );
  try {
    fs.writeFileSync(temporary, content, 'utf8');
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary);
  }
}

const mode = process.argv.slice(2);
if (mode.length !== 1 || !['--write', '--check'].includes(mode[0])) {
  throw new Error('usage: node tools/codex-mhj_26_08_02_05_build_pages.mjs --write|--check');
}
for (const page of PAGES) {
  const target = path.join(staticRoot, ...page.out);
  const expected = build(page);
  if (mode[0] === '--write') writeAtomic(target, expected);
  else if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== expected) {
    throw new Error(`static page is missing or stale: ${page.urlPath}`);
  }
}
