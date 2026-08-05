import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequest } from '../../functions/api/new-puzzle.js';

const request = (method, slash = true) => new Request(
  `https://example.test/api/new-puzzle${slash ? '/' : ''}`,
  { method },
);

test('all non-GET methods return JSON 405 and Allow GET', async () => {
  for (const method of ['HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await onRequest({ request: request(method) });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET');
    assert.deepEqual(await response.json(), { error: 'method not allowed' });
  }
});

test('Pages build output, routes, and Wrangler config are exact contracts', () => {
  const html = fs.readFileSync('game/static/index.html', 'utf8');
  assert.equal(/{%|{{|}}|%}/.test(html), false);
  assert.match(html, /src="\/game\/js\/main\.js"/);
  assert.deepEqual(JSON.parse(fs.readFileSync('game/static/_routes.json', 'utf8')), { version: 1, include: ['/api/*'], exclude: [] });
  // wrangler.jsonc has comments (JSONC), so this reads the value with a
  // permissive strip rather than JSON.parse -- matches how the file is
  // actually consumed by Cloudflare, not a byte-exact JSON contract.
  const raw = fs.readFileSync('wrangler.jsonc', 'utf8');
  const withoutComments = raw.replace(/\/\/.*$/gm, '');
  assert.deepEqual(
    JSON.parse(withoutComments),
    {
      name: 'sudoku-django-pages',
      pages_build_output_dir: './game/static',
      compatibility_date: '2026-08-02',
      limits: { cpu_ms: 10000 },
    },
  );
});
