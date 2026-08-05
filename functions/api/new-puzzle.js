import { generatePuzzle } from '../_lib/sudoku/claude-mhj_26_08_05_04_generator.js';

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

export function createPuzzleResponse(generate = generatePuzzle) {
  try {
    const { puzzle, solution } = generate({ dim: 9, difficulty: 'medium' });
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
  return createPuzzleResponse();
}
