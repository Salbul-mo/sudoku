#!/usr/bin/env node
// Generates the favicon set from one drawing, with no dependencies.
//
//   node tools/build_icons.mjs --write     regenerate the committed files
//   node tools/build_icons.mjs --check     fail if any of them is stale
//
// Why hand-rolled instead of a rasterizer: this project has no package.json and
// adds no npm dependency, and the mark is nothing but axis-aligned rectangles,
// so a general rasterizer would buy nothing. Drawing it directly also makes the
// output byte-reproducible, which is what lets --check exist at all; a real
// rasterizer's antialiasing differs across versions and could not be asserted.
//
// The mark is a 3x3 Sudoku box on paper with the centre cell filled. A 9x9 grid
// is the obvious choice and the wrong one: at 16px its lines land under half a
// pixel and it collapses into a gray square. 3x3 survives the smallest size and
// still reads as Sudoku.
//
// Everything is drawn in normalized 0..1 coordinates and snapped to whole
// pixels per size, so no size inherits another's rounding error.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const staticRoot = path.join(root, 'game', 'static');

// From game/static/game/css/tokens.css: the light palette's paper, grid line,
// and the blue a digit the player entered is drawn in. The icon is deliberately
// the light theme in both themes -- a favicon has no media query on most
// surfaces (Windows taskbar, iOS home screen, bookmark lists), so one fixed
// appearance beats one that is right half the time.
const PAPER = [0xe8, 0xe7, 0xe3, 0xff];
const LINE = [0x3a, 0x39, 0x35, 0xff];
const MARK = [0x2f, 0x4e, 0x70, 0xff];

const MARGIN = 0.125;   // blank paper around the grid
const STROKE = 0.055;   // grid line thickness

// PNG sizes that get their own file. 48 is the base unit Google asks favicons
// to be a multiple of; 180 is the apple-touch-icon; 192 and 512 are the two the
// web manifest is required to carry.
const PNG_SIZES = [48, 96, 180, 192, 512];
// Sizes packed into favicon.ico. Windows and legacy browsers pick from these.
const ICO_SIZES = [16, 32, 48];

function surface(size) {
    const pixels = Buffer.alloc(size * size * 4);
    return {
        size,
        pixels,
        fill(x0, y0, x1, y1, [r, g, b, a]) {
            const left = Math.max(0, Math.round(x0));
            const top = Math.max(0, Math.round(y0));
            const right = Math.min(size, Math.round(x1));
            const bottom = Math.min(size, Math.round(y1));
            for (let y = top; y < bottom; y++) {
                for (let x = left; x < right; x++) {
                    const at = (y * size + x) * 4;
                    pixels[at] = r;
                    pixels[at + 1] = g;
                    pixels[at + 2] = b;
                    pixels[at + 3] = a;
                }
            }
        },
    };
}

/**
 * The mark itself, at one size.
 *
 * Lines are drawn centred on their grid position and clamped to at least one
 * pixel: at 16px the computed stroke is 0.88px, and rounding that to zero would
 * erase the grid entirely on the size that needs it most.
 */
function draw(size) {
    const s = surface(size);
    const px = (u) => u * size;
    const stroke = Math.max(1, Math.round(px(STROKE)));

    s.fill(0, 0, size, size, PAPER);

    const gridStart = px(MARGIN);
    const gridSpan = px(1 - 2 * MARGIN);
    const step = gridSpan / 3;

    // Centre cell first, so the grid lines draw over its edges rather than the
    // fill spilling across them.
    s.fill(gridStart + step, gridStart + step, gridStart + 2 * step, gridStart + 2 * step, MARK);

    // Four lines per axis: the two outer edges and the two internal dividers.
    for (let i = 0; i <= 3; i++) {
        const at = gridStart + i * step;
        const lo = at - stroke / 2;
        const hi = lo + stroke;
        s.fill(lo, gridStart - stroke / 2, hi, gridStart + gridSpan + stroke / 2, LINE);
        s.fill(gridStart - stroke / 2, lo, gridStart + gridSpan + stroke / 2, hi, LINE);
    }
    return s;
}

const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();

function crc32(buffer) {
    let c = -1;
    for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
}

/**
 * 8-bit RGBA, non-interlaced. Every scanline uses filter 0 (None): the artwork
 * is flat colour blocks, so the filters that help photographs would only cost
 * time here, and None keeps the encoder small enough to trust by reading it.
 *
 * deflate level is pinned so two runs of this file produce identical bytes.
 */
function encodePng({ size, pixels }) {
    const stride = size * 4;
    const raw = Buffer.alloc(size * (stride + 1));
    for (let y = 0; y < size; y++) {
        raw[y * (stride + 1)] = 0;
        pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;    // bit depth
    ihdr[9] = 6;    // colour type: RGBA
    ihdr[10] = 0;   // compression: deflate
    ihdr[11] = 0;   // filter method
    ihdr[12] = 0;   // interlace: none
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

/**
 * ICO carrying PNG payloads rather than BMP ones. Every browser in use and
 * Windows since Vista read this form, and it avoids the BMP-in-ICO alpha mask,
 * which is the part of the format that is usually got wrong.
 */
function encodeIco(images) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);             // reserved
    header.writeUInt16LE(1, 2);             // type: icon
    header.writeUInt16LE(images.length, 4);
    const directory = Buffer.alloc(16 * images.length);
    let offset = header.length + directory.length;
    images.forEach(({ size, png }, i) => {
        const at = i * 16;
        // 256 is stored as 0; none of ICO_SIZES reaches it, but encoding the
        // rule here keeps the function correct if one ever does.
        directory[at] = size % 256;         // width
        directory[at + 1] = size % 256;     // height
        directory[at + 2] = 0;              // palette size: none
        directory[at + 3] = 0;              // reserved
        directory.writeUInt16LE(1, at + 4);  // colour planes
        directory.writeUInt16LE(32, at + 6); // bits per pixel
        directory.writeUInt32LE(png.length, at + 8);
        directory.writeUInt32LE(offset, at + 12);
        offset += png.length;
    });
    return Buffer.concat([header, directory, ...images.map((i) => i.png)]);
}

/**
 * The scalable master, used by browsers that prefer it and by anything that
 * needs to re-render the mark larger than 512. Kept in exact agreement with
 * draw() -- same normalized constants, same order.
 */
function buildSvg() {
    const hex = ([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    const grid = 1 - 2 * MARGIN;
    const step = grid / 3;
    const lines = [];
    for (let i = 0; i <= 3; i++) {
        const at = +(MARGIN + i * step).toFixed(6);
        lines.push(`    <line x1="${at}" y1="${MARGIN}" x2="${at}" y2="${1 - MARGIN}"/>`);
        lines.push(`    <line x1="${MARGIN}" y1="${at}" x2="${1 - MARGIN}" y2="${at}"/>`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" role="img" aria-label="Sudoku">
  <rect width="1" height="1" fill="${hex(PAPER)}"/>
  <rect x="${+(MARGIN + step).toFixed(6)}" y="${+(MARGIN + step).toFixed(6)}" width="${+step.toFixed(6)}" height="${+step.toFixed(6)}" fill="${hex(MARK)}"/>
  <g stroke="${hex(LINE)}" stroke-width="${STROKE}" stroke-linecap="square">
${lines.join('\n')}
  </g>
</svg>
`;
}

function artifacts() {
    const out = new Map();
    for (const size of PNG_SIZES) {
        const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
        out.set(name, encodePng(draw(size)));
    }
    out.set('favicon.ico', encodeIco(ICO_SIZES.map((size) => ({ size, png: encodePng(draw(size)) }))));
    out.set('icon.svg', Buffer.from(buildSvg(), 'utf8'));
    return out;
}

const mode = process.argv.slice(2);
if (mode.length !== 1 || !['--write', '--check'].includes(mode[0])) {
    throw new Error('usage: node tools/build_icons.mjs --write|--check');
}
for (const [name, content] of artifacts()) {
    const target = path.join(staticRoot, name);
    if (mode[0] === '--write') {
        fs.writeFileSync(target, content);
    } else if (!fs.existsSync(target) || !fs.readFileSync(target).equals(content)) {
        throw new Error(`icon is missing or stale: ${name}`);
    }
}
