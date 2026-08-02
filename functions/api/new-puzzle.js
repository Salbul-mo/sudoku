import { PUZZLE_POOL } from '../../cloudflare/codex-mhj_26_08_02_03_puzzle_pool.mjs';

const UINT32_RANGE = 0x100000000;
const headers = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
};

function jsonResponse(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, ...extraHeaders },
  });
}

export function selectPuzzleIndex(
  poolSize = PUZZLE_POOL.length,
  random = crypto.getRandomValues.bind(crypto),
) {
  if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > UINT32_RANGE) {
    throw new RangeError('pool size must be an integer in 1..2^32');
  }
  const limit = UINT32_RANGE - (UINT32_RANGE % poolSize);
  const bytes = new Uint32Array(1);
  do random(bytes); while (bytes[0] >= limit);
  return bytes[0] % poolSize;
}

export function createPuzzleResponse(
  pool = PUZZLE_POOL,
  random = crypto.getRandomValues.bind(crypto),
) {
  if (!Array.isArray(pool) || pool.length === 0) {
    return jsonResponse({ error: 'puzzle pool unavailable' }, 500);
  }
  try {
    const entry = pool[selectPuzzleIndex(pool.length, random)];
    if (
      !Array.isArray(entry)
      || entry.length !== 2
      || !Array.isArray(entry[0])
      || !Array.isArray(entry[1])
      || entry[0].length !== 81
      || entry[1].length !== 81
    ) {
      return jsonResponse({ error: 'puzzle pool unavailable' }, 500);
    }
    const [puzzle, solution] = entry;
    return jsonResponse({ puzzle, solution }, 200);
  } catch {
    return jsonResponse({ error: 'puzzle pool unavailable' }, 500);
  }
}

export function onRequest({ request }) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'method not allowed' }, 405, { Allow: 'GET' });
  }
  return createPuzzleResponse();
}
