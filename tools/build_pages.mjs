import fs from 'node:fs';
import path from 'node:path';
import { MESSAGES } from '../game/static/game/js/i18n/messages.js';
import { PAGE_CONTENT, CONTACT_EMAIL } from './page-content.mjs';

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
  { page: 'rush', template: 'rush.html', segment: 'rush', keys: {
    title: 'meta.rushTitle', description: 'meta.rushDescription',
    ogDescription: 'meta.rushOgDescription', heading: 'meta.rushHeading',
    noscript: 'meta.rushNoscript',
  } },
  { page: 'learn', template: 'learn.html', segment: 'learn', keys: {
    title: 'meta.learnTitle', description: 'meta.learnDescription',
    ogDescription: 'meta.learnOgDescription', heading: 'meta.learnHeading',
    noscript: 'meta.learnNoscript',
  } },
  { page: 'printable', template: 'printable.html', segment: 'printable-sudoku', keys: {
    title: 'meta.printableTitle', description: 'meta.printableDescription',
    ogDescription: 'meta.printableOgDescription', heading: 'meta.printableHeading',
    noscript: 'meta.printableNoscript',
  } },
  // The two text pages. `content` marks them as prose rather than an app: they
  // share one template, carry no script, and their body is written from
  // tools/page-content.mjs instead of being mounted at runtime.
  { page: 'privacy', template: 'content.html', segment: 'privacy', content: true, keys: {
    title: 'meta.privacyTitle', description: 'meta.privacyDescription',
    ogDescription: 'meta.privacyOgDescription', heading: 'meta.privacyHeading',
    noscript: 'meta.privacyNoscript',
  } },
  { page: 'business', template: 'content.html', segment: 'business', content: true, keys: {
    title: 'meta.businessTitle', description: 'meta.businessDescription',
    ogDescription: 'meta.businessOgDescription', heading: 'meta.businessHeading',
    noscript: 'meta.businessNoscript',
  } },
];

// Footer order, which is reading order rather than the order pages were built:
// the two games first, then the practice page. `label` is the message key the
// row is named by.
const FOOTER_ROWS = [
  { page: 'classic', label: 'nav.playClassic' },
  { page: 'rush', label: 'nav.playRush' },
  { page: 'learn', label: 'nav.playLearn' },
  { page: 'printable', label: 'nav.printable' },
  { page: 'privacy', label: 'nav.privacy' },
  { page: 'business', label: 'nav.business' },
];

const PAGES = PAGE_KINDS.flatMap((kind) => LOCALES.map(({ locale, prefix, ogLocale }) => {
  const parts = [prefix, kind.segment].filter(Boolean);
  return {
    locale, ogLocale, page: kind.page, keys: kind.keys, content: kind.content === true,
    template: path.join(templateRoot, kind.template),
    urlPath: `/${parts.map((p) => `${p}/`).join('')}`,
    out: [...parts, 'index.html'],
    // Written by tools/build_og.mjs, one card per (game, language) so a shared
    // link previews in the language of the page that was shared.
    ogImage: `/og-${kind.page}-${locale}.png`,
    // One manifest per language: the file has a single `name` and `start_url`,
    // so it cannot describe both locales at once.
    manifest: prefix ? `/${prefix}/site.webmanifest` : '/site.webmanifest',
  };
}));

const localeRoot = (locale) => (locale === 'ko' ? '/' : `/${locale}/`);

// Must match the card size tools/build_og.mjs renders at. Declaring the
// dimensions lets a scraper reserve the right box before the image loads.
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// --bg-page of the light theme (game/static/game/css/tokens.css). A manifest
// has one background_color and no media query, so this is the light value on
// purpose, matching the favicon's reasoning.
const PAGE_BACKGROUND = '#E8E7E3';

// Written by tools/build_icons.mjs. Everything it emits is listed here except
// apple-touch-icon.png, which the pages reference through its own <link> -- so
// no generated file goes unreferenced by anything.
//
// `maskable` is not claimed: the mark runs to the edge of the square, so an
// Android mask would crop the grid. Declaring it maskable anyway is what
// produces the icons with their corners sliced off.
const MANIFEST_ICONS = [
  { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
  { src: '/icon-48.png', sizes: '48x48', type: 'image/png' },
  { src: '/icon-96.png', sizes: '96x96', type: 'image/png' },
  { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
];

// Asset URLs are site-absolute, so /en/index.html loads exactly the same files
// as / without any depth-relative rewriting.
//
// The brand assets go through the same table for a second reason: they live at
// the site root in production (game/static IS the deployed root), but Django
// serves that directory under /static/, so writing "/favicon.ico" literally in
// the template 404s every time the app is run locally.
const replacements = new Map([
  ["{% static 'favicon.ico' %}", '/favicon.ico'],
  ["{% static 'icon.svg' %}", '/icon.svg'],
  ["{% static 'apple-touch-icon.png' %}", '/apple-touch-icon.png'],
  ["{% static 'game/css/content.css' %}", '/game/css/content.css'],
  ["{% static 'game/css/printable.css' %}", '/game/css/printable.css'],
  ["{% static 'game/js/printable-main.js' %}", '/game/js/printable-main.js'],
  ["{% static 'game/css/learn.css' %}", '/game/css/learn.css'],
  ["{% static 'game/js/learn-main.js' %}", '/game/js/learn-main.js'],
  ["{% static 'game/css/rush.css' %}", '/game/css/rush.css'],
  ["{% static 'game/js/rush-main.js' %}", '/game/js/rush-main.js'],
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
    `    <meta property="og:image" content="${ORIGIN}${page.ogImage}">`,
    `    <meta property="og:image:width" content="${OG_WIDTH}">`,
    `    <meta property="og:image:height" content="${OG_HEIGHT}">`,
    `    <meta property="og:image:alt" content="${escapeAttr(m(page.keys.heading))}">`,
    // summary_large_image only earns its name once there is an image to be
    // large: with no og:image Twitter falls back to a bare link, which is
    // strictly worse than the small card. The two changed together.
    '    <meta name="twitter:card" content="summary_large_image">',
    `    <meta name="twitter:image" content="${ORIGIN}${page.ogImage}">`,
    `    <link rel="manifest" href="${page.manifest}">`,
    ...jsonLdFor(page).map((block) => (
      `    <script type="application/ld+json">${JSON.stringify(block)}</script>`
    )),
  ].join('\n');
}

/**
 * The one place every page links to every other.
 *
 * Real anchors in the HTML rather than a script that builds them: this is how
 * /learn/ is discovered at all, by a crawler that may or may not run the page's
 * JavaScript and by a reader who wants to middle-click. It also sits outside
 * #app, which the entry points empty on boot.
 *
 * The current page is a <span>, not a link to itself. A self-link is a dead
 * control to anyone tabbing through, and aria-current is what actually tells a
 * screen reader where it already is.
 */
function footerFor(page) {
  const m = (key) => {
    const value = MESSAGES[page.locale][key];
    if (value === undefined) throw new Error(`unknown message key: ${key} (${page.locale})`);
    return value;
  };
  const rows = FOOTER_ROWS.map(({ page: target, label }) => {
    const text = escapeText(m(label));
    if (target === page.page) return `            <span aria-current="page">${text}</span>`;
    const path = PAGES.find((p) => p.page === target && p.locale === page.locale).urlPath;
    return `            <a href="${path}">${text}</a>`;
  });
  return [
    '<footer class="site-footer">',
    `        <nav aria-label="${escapeAttr(m('nav.footerLabel'))}">`,
    ...rows,
    '        </nav>',
    '    </footer>',
  ].join('\n');
}

/**
 * The body of a text page, from tools/page-content.mjs.
 *
 * Every string is escaped on the way in: the source is a list of blocks rather
 * than raw HTML precisely so that a stray angle bracket in a policy sentence
 * cannot become markup.
 */
function contentFor(page) {
  const m = (key) => MESSAGES[page.locale][key];
  const blocks = PAGE_CONTENT[page.page]?.[page.locale];
  if (!blocks) throw new Error(`no content for ${page.page} (${page.locale})`);

  const out = ['<main class="content-page">', `        <h1>${escapeText(m(page.keys.heading))}</h1>`];
  for (const block of blocks) {
    if (block.h) out.push(`        <h2>${escapeText(block.h)}</h2>`);
    else if (block.p) out.push(`        <p>${escapeText(block.p)}</p>`);
    else if (block.ul) {
      out.push('        <ul>');
      for (const item of block.ul) out.push(`            <li>${escapeText(item)}</li>`);
      out.push('        </ul>');
    } else throw new Error(`unknown content block in ${page.page}: ${JSON.stringify(block)}`);
  }
  // A real mailto, last, on both pages. The address lives in one constant so
  // the policy and the enquiry page can never disagree about where to write.
  out.push(`        <p class="content-contact"><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>`);
  out.push('    </main>');
  return out.join(String.fromCharCode(10));
}

/**
 * Structured data for one page.
 *
 * Deliberately absent: `offers`, `aggregateRating`, `review`. The game is in
 * fact free and has no ratings, and describing things the site does not
 * actually provide is the structured-data mistake that gets rich results
 * revoked. `isAccessibleForFree` states the free part without inventing a
 * price object.
 *
 * `WebSite` is emitted only on the two classic pages. They are the roots of
 * their language; naming /rush/ as the website would be false, and repeating
 * the same WebSite node at four URLs under four different names is worse than
 * stating it once per locale.
 */
function jsonLdFor(page) {
  const m = (key) => MESSAGES[page.locale][key];
  const url = `${ORIGIN}${page.urlPath}`;
  const blocks = [];
  if (page.page === 'classic') {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: m('meta.heading'),
      url: `${ORIGIN}${localeRoot(page.locale)}`,
      inLanguage: page.locale,
    });
  }
  // A policy page and an enquiry page are not games, and describing them as
  // one would be the same kind of untruth as claiming a rating.
  if (page.content) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: m(page.keys.heading),
      url,
      description: m(page.keys.ogDescription),
      inLanguage: page.locale,
    });
    return blocks;
  }
  blocks.push({
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: m(page.keys.heading),
    url,
    description: m(page.keys.ogDescription),
    inLanguage: page.locale,
    image: `${ORIGIN}${page.ogImage}`,
    genre: 'Puzzle',
    gamePlatform: 'Web browser',
    applicationCategory: 'GameApplication',
    operatingSystem: 'Any',
    playMode: 'SinglePlayer',
    isAccessibleForFree: true,
  });
  return blocks;
}

/**
 * The install manifest for one language.
 *
 * `id` is pinned to the locale root rather than left to default from
 * `start_url`: it is the identity a browser matches an already-installed app
 * against, and letting it drift with start_url would make a later start_url
 * change register as a second, unrelated app.
 */
function manifestFor(locale) {
  const m = (key) => MESSAGES[locale][key];
  return `${JSON.stringify({
    id: localeRoot(locale),
    name: m('meta.title'),
    short_name: m('meta.heading'),
    description: m('meta.ogDescription'),
    lang: locale,
    start_url: localeRoot(locale),
    scope: '/',
    display: 'standalone',
    background_color: PAGE_BACKGROUND,
    theme_color: PAGE_BACKGROUND,
    icons: MANIFEST_ICONS,
  }, null, 2)}\n`;
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
  if (page.content) {
    // A text page has its heading inside the prose, where it belongs, and
    // no noscript fallback because there is nothing for script to fall
    // back from.
    html = replaceRegion(html, 'content', contentFor(page));
  } else {
    html = replaceRegion(html, 'heading', `<h1 class="visually-hidden">${escapeText(m(page.keys.heading))}</h1>`);
    html = replaceRegion(html, 'noscript', `<noscript>\n        <p>${escapeText(m(page.keys.noscript))}</p>\n    </noscript>`);
  }
  html = replaceRegion(html, 'footer', footerFor(page));
  if (/{%|%}|{{|}}/.test(html)) throw new Error('leftover Django template markers');
  if (/<!-- i18n:/.test(html)) throw new Error('leftover i18n region marker');
  return html;
}

function writeAtomic(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = path.join(
    path.dirname(target),
    `build_pages_${process.pid}_tmp_${path.basename(target)}`,
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
  throw new Error('usage: node tools/build_pages.mjs --write|--check');
}
const outputs = [
  ...PAGES.map((page) => ({
    out: page.out, label: page.urlPath, content: build(page),
  })),
  ...LOCALES.map(({ locale, prefix }) => ({
    out: [prefix, 'site.webmanifest'].filter(Boolean),
    label: `${localeRoot(locale)}site.webmanifest`,
    content: manifestFor(locale),
  })),
];
for (const { out, label, content } of outputs) {
  const target = path.join(staticRoot, ...out);
  if (mode[0] === '--write') writeAtomic(target, content);
  else if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) {
    throw new Error(`generated file is missing or stale: ${label}`);
  }
}
