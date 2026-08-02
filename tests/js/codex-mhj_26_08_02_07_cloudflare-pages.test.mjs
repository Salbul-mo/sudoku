import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { PUZZLE_POOL } from '../../cloudflare/codex-mhj_26_08_02_03_puzzle_pool.mjs';
import {
  createPuzzleResponse,
  onRequest,
  selectPuzzleIndex,
} from '../../functions/api/new-puzzle.js';

const request = (method, slash = true) => new Request(
  `https://example.test/api/new-puzzle${slash ? '/' : ''}`,
  { method },
);

test('selector is deterministic and applies Uint32 rejection boundary', () => {
  const values = [0xffffffff, 17];
  const used = [];
  const index = selectPuzzleIndex(3, (target) => {
    target[0] = values.shift();
    used.push(target[0]);
  });
  assert.equal(index, 2);
  assert.deepEqual(used, [0xffffffff, 17]);
  assert.equal(selectPuzzleIndex(512, (target) => { target[0] = 0xffffffff; }), 511);
});

test('GET returns a pool member and security headers', async () => {
  for (const slash of [false, true]) {
    const response = await onRequest({ request: request('GET', slash) });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(body), ['puzzle', 'solution']);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('pragma'), 'no-cache');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(
      PUZZLE_POOL.some(
        ([puzzle, solution]) => JSON.stringify({ puzzle, solution }) === JSON.stringify(body),
      ),
      true,
    );
  }
});

test('all non-GET methods return JSON 405 and Allow GET', async () => {
  for (const method of ['HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await onRequest({ request: request(method) });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET');
    assert.deepEqual(await response.json(), { error: 'method not allowed' });
  }
});

test('invalid pool returns deterministic JSON 500', async () => {
  const response = createPuzzleResponse([]);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'puzzle pool unavailable' });
});

test('committed pool and manifest satisfy the full data contract', () => {
  const manifest = JSON.parse(fs.readFileSync(
    'cloudflare/codex-mhj_26_08_02_04_puzzle_pool_manifest.json',
    'utf8',
  ));
  assert.equal(PUZZLE_POOL.length, 512);
  assert.equal(new Set(PUZZLE_POOL.map(([puzzle]) => puzzle.join(','))).size, 512);
  for (const [puzzle, solution] of PUZZLE_POOL) {
    assert.equal(puzzle.length, 81);
    assert.equal(solution.length, 81);
    assert.equal(puzzle.filter(Boolean).length, 32);
    assert.equal(puzzle.every((value) => Number.isInteger(value) && value >= 0 && value <= 9), true);
    assert.equal(solution.every((value) => Number.isInteger(value) && value >= 1 && value <= 9), true);
    assert.equal(puzzle.every((value, index) => value === 0 || value === solution[index]), true);
  }
  assert.equal(manifest.count, 512);
  assert.equal(manifest.entriesSha256, crypto
    .createHash('sha256')
    .update(JSON.stringify(PUZZLE_POOL))
    .digest('hex'));
});

test('Pages build output, routes, and Wrangler config are exact contracts', () => {
  const html = fs.readFileSync('game/static/index.html', 'utf8');
  assert.equal(/{%|{{|}}|%}/.test(html), false);
  assert.match(html, /src="\/game\/js\/main\.js"/);
  assert.deepEqual(JSON.parse(fs.readFileSync('game/static/_routes.json', 'utf8')), { version: 1, include: ['/api/*'], exclude: [] });
  assert.deepEqual(
    JSON.parse(fs.readFileSync('wrangler.jsonc', 'utf8')),
    {
      name: 'sudoku-django-pages',
      pages_build_output_dir: './game/static',
      compatibility_date: '2026-08-02',
    },
  );
});
