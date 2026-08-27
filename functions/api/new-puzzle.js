import {
  generatePuzzle,
  GIVENS_MIN,
  GIVENS_MAX,
  GIVENS_DEFAULT,
} from '../_lib/sudoku/generator.js';

// Digits only, no sign, decimal point, whitespace or suffix. The looser
// conversions all let something wrong through: parseInt('26abc') is 26,
// Number(' 26 ') is 26, and Number('26.0') is 26 -- none of which the caller
// actually asked for. This is the trust boundary, so it reads the string
// exactly. Two digits is enough for any value in the accepted range.
const GIVENS_PATTERN = /^\d{1,2}$/;

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

// null when the caller supplied something unusable, so the caller can answer
// 400 rather than quietly substituting a number the client never asked for.
export function parseGivens(rawValue) {
  if (rawValue === null || rawValue === undefined) return GIVENS_DEFAULT;
  if (!GIVENS_PATTERN.test(rawValue)) return null;
  const givens = Number(rawValue);
  if (givens < GIVENS_MIN || givens > GIVENS_MAX) return null;
  return givens;
}

export function createPuzzleResponse(generate = generatePuzzle, givens = GIVENS_DEFAULT) {
  try {
    const { puzzle, solution } = generate({ dim: 9, givens });
    return jsonResponse({ puzzle, solution }, 200);
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: 'puzzle generation failed' }, 500);
  }
}

export function onRequest({ request }) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'method not allowed' }, 405, { Allow: 'GET' });
  }
  const givens = parseGivens(new URL(request.url).searchParams.get('givens'));
  if (givens === null) {
    return jsonResponse({ error: 'invalid givens' }, 400);
  }
  return createPuzzleResponse(generatePuzzle, givens);
}
