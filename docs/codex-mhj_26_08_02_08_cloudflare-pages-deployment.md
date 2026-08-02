# Cloudflare Pages deployment

This repository deploys `game/static` as a Cloudflare Pages site and exposes
`functions/api/new-puzzle.js` as its only Pages Function. Django source and
`requirements.txt` remain in the repository as rollback references; Python is
used only to generate the committed pool offline.

## Rebuild and validate

Run from the repository root:

```powershell
.\venv\Scripts\python.exe tools/codex-mhj_26_08_02_02_build_puzzle_pool.py --write
.\venv\Scripts\python.exe tools/codex-mhj_26_08_02_02_build_puzzle_pool.py --check
node tools/codex-mhj_26_08_02_05_build_pages.mjs --write
node tools/codex-mhj_26_08_02_05_build_pages.mjs --check
.\venv\Scripts\python.exe manage.py test
node --test "tests/js/*.test.mjs"
```

The pool build is deterministic with seed `20260802` and must contain exactly
512 unique 9x9 medium puzzles with 32 givens. The check command regenerates the
expected bytes in memory and fails if either committed artifact is stale.

## Wrangler validation

Wrangler is pinned at `4.118.0` without adding `package.json`, a lock file, or
local dependencies. Pages commands require the tool-mandated project-root
`wrangler.jsonc`; Wrangler rejects custom config paths for Pages, so do not pass
`-c` to these commands:

```powershell
npx --yes wrangler@4.118.0 pages functions build functions --outfile .wrangler/codex-mhj_26_08_02_worker.js --metafile .wrangler/codex-mhj_26_08_02_metafile.json --minify
npx --yes wrangler@4.118.0 pages dev --port 8788
```

With local development running, verify both accepted URL forms and the method
contract:

```powershell
curl.exe -i http://127.0.0.1:8788/
curl.exe -i http://127.0.0.1:8788/api/new-puzzle
curl.exe -i http://127.0.0.1:8788/api/new-puzzle/
curl.exe -i -X POST http://127.0.0.1:8788/api/new-puzzle/
```

The Free plan limits relevant to this deployment are 100,000 requests per day,
10 ms CPU per HTTP request, 3 MB Worker size after gzip compression, and one
second startup time. Confirm the reported compressed bundle size and inspect
preview invocation metrics before production promotion.

## Optional authenticated deployment

Live deployment changes external Cloudflare state and requires an authenticated
Wrangler session. After local validation and deployment approval, run:

```powershell
npx --yes wrangler@4.118.0 pages deploy game/static --project-name sudoku-django-pages
```

No D1, KV, R2, runtime Python, or upstream API is required.
