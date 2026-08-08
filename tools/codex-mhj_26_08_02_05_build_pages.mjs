import fs from 'node:fs';
import path from 'node:path';
import { MESSAGES } from '../game/static/game/js/i18n/claude-mhj_26_08_07_05_messages.js';

const root = path.resolve(import.meta.dirname, '..');
const templateRoot = path.join(root, 'game', 'templates', 'game');
const staticRoot = path.join(root, 'game', 'static');

// The address Google indexes. Canonical and hreflang have to be absolute, so
// this constant is the one place the deployed origin is written down.
const ORIGIN = 'https://sudoku-bw7.pages.dev';

// One row per (page, locale). `page` groups the translations of one thing:
// hreflang links a page to its other languages and never to a different game,
// so /rush/ points at /en/rush/ and never at /en/. The x-default of a group is
// its Korean page -- the language the site was written in, and where a link
// with no locale lands.
const LOCALES = [
  { locale: 'ko', prefix: '', ogLocale: 'ko_KR' },
  { locale: 'en', prefix: 'en', ogLocale: 'en_US' },
];

const PAGE_KINDS = [
  { page: 'classic', template: 'index.html', segment: '', keys: {
    title: 'meta.title', description: 'meta.description',
    ogDescription: 'meta.ogDescription', heading: 'meta.heading',
    noscript: 'meta.noscript',
  } },
  { page: 'rush', template: 'claude-mhj_26_08_07_21_rush.html', segment: 'rush', keys: {
    title: 'meta.rushTitle', description: 'meta.rushDescription',
    ogDescription: 'meta.rushOgDescription', heading: 'meta.rushHeading',
    noscript: 'meta.rushNoscript',
  } },
];

const PAGES = PAGE_KINDS.flatMap((kind) => LOCALES.map(({ locale, prefix, ogLocale }) => {
  const parts = [prefix, kind.segment].filter(Boolean);
  return {
    locale, ogLocale, page: kind.page, keys: kind.keys,
    template: path.join(templateRoot, kind.template),
    urlPath: `/${parts.map((p) => `${p}/`).join('')}`,
    out: [...parts, 'index.html'],
  };
}));

// Asset URLs are site-absolute, so /en/index.html loads exactly the same files
// as / without any depth-relative rewriting.
const replacements = new Map([
  ["{% static 'game/css/claude-mhj_26_08_07_20_rush.css' %}", '/game/css/claude-mhj_26_08_07_20_rush.css'],
  ["{% static 'game/js/claude-mhj_26_08_07_19_rush-main.js' %}", '/game/js/claude-mhj_26_08_07_19_rush-main.js'],
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

// The asset table covers every template, and no template uses all of it -- the
// classic page has no rush stylesheet and the rush page has no main.js. An
// absent marker is therefore normal; a repeated one still is not. Anything that
// should have been substituted and was not is caught by the leftover-Django
// check at the end of build().
function replaceAtMostOnce(source, marker, replacement) {
  if (!source.includes(marker)) return source;
  return replaceExactlyOnce(source, marker, replacement);
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
  // Every language of this page links to every other, itself included -- an
  // hreflang set that omits the self-reference is the single most common way to
  // get the whole set ignored. Only same-page rows qualify: the two games are
  // different content, not translations of each other.
  const family = PAGES.filter((p) => p.page === page.page);
  const alternates = family.map(
    (p) => `    <link rel="alternate" hreflang="${p.locale}" href="${ORIGIN}${p.urlPath}">`,
  );
  const xDefault = family.find((p) => p.locale === 'ko') ?? family[0];
  return [
    `    <title>${escapeText(m(page.keys.title))}</title>`,
    `    <meta name="description" content="${escapeAttr(m(page.keys.description))}">`,
    `    <link rel="canonical" href="${url}">`,
    ...alternates,
    `    <link rel="alternate" hreflang="x-default" href="${ORIGIN}${xDefault.urlPath}">`,
    '    <meta property="og:type" content="website">',
    `    <meta property="og:url" content="${url}">`,
    `    <meta property="og:title" content="${escapeAttr(m(page.keys.title))}">`,
    `    <meta property="og:description" content="${escapeAttr(m(page.keys.ogDescription))}">`,
    `    <meta property="og:locale" content="${page.ogLocale}">`,
    '    <meta name="twitter:card" content="summary">',
  ].join('\n');
}

function build(page) {
  const m = (key) => MESSAGES[page.locale][key];
  let html = fs.readFileSync(page.template, 'utf8');
  html = replaceExactlyOnce(html, '{% load static %}', '');
  for (const [marker, value] of replacements) {
    html = replaceAtMostOnce(html, marker, value);
  }
  html = replaceExactlyOnce(html, '<html lang="ko">', `<html lang="${page.locale}">`);
  html = replaceRegion(html, 'head', headFor(page).trimStart());
  html = replaceRegion(html, 'heading', `<h1 class="visually-hidden">${escapeText(m(page.keys.heading))}</h1>`);
  html = replaceRegion(html, 'noscript', `<noscript>\n        <p>${escapeText(m(page.keys.noscript))}</p>\n    </noscript>`);
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
