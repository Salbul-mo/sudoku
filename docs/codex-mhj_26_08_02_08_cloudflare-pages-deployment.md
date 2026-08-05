# Cloudflare Pages deployment

This repository deploys `game/static` as a Cloudflare Pages site and exposes
`functions/api/new-puzzle.js` as its only Pages Function. Every request runs a
real Dancing Links (Algorithm X) generation-and-digging pass in the Worker
itself -- there is no precomputed puzzle pool. The DLX engine, solver, and
generator live under `functions/_lib/sudoku/` (`claude-mhj_26_08_05_01_spec.js`
through `_04_generator.js`), ported from the Python reference implementation in
`game/sudoku/`. Django source and `requirements.txt` remain in the repository
as a rollback reference and as the app's local-development puzzle API; they
are not required for the Cloudflare deployment.

## Requirements

`/api/new-puzzle/` performs real computation per request (worst-case DLX
uniqueness checks during digging), so this deployment requires the **Workers
Paid plan** -- the Free plan's 10ms CPU/request ceiling is not enough headroom
for the digging phase's worst case. `wrangler.jsonc` sets
`limits.cpu_ms: 10000`, which needs a Paid-plan account to take effect.
Locally measured generation time (`node --test`, Node on a dev machine) is
~1-17ms per puzzle; the 10-second ceiling exists as a safety margin against
pathological search trees, not because generation is expected to approach it.

## Rebuild and validate

Run from the repository root:

```powershell
.\venv\Scripts\python.exe manage.py test
node --test "tests/js/*.test.mjs"
node tools/codex-mhj_26_08_02_05_build_pages.mjs --write
node tools/codex-mhj_26_08_02_05_build_pages.mjs --check
```

`node --test` covers the ported DLX engine (matrix pristine-state invariants),
solver (`solve`/`countSolutions`/`classify`/`hasUniqueSolution`/
`alternativeExists`), generator (`generateSolvedBoard`/`digHoles`/
`generatePuzzle`), and the `/api/new-puzzle/` HTTP contract (200/405/500,
headers, uniqueness of the returned puzzle). It does **not** measure real
Cloudflare Worker CPU-time consumption -- Node's `node:test` runs on a
different engine/host than the Workers runtime, so CPU-budget behavior must be
checked separately in `wrangler dev` or a preview deployment before promoting
to production.

## Wrangler validation

Wrangler is pinned at `4.118.0` without adding `package.json`, a lock file, or
local dependencies. Pages commands require the tool-mandated project-root
`wrangler.jsonc`; Wrangler rejects custom config paths for Pages, so do not pass
`-c` to these commands:

```powershell
npx --yes wrangler@4.118.0 pages functions build functions --outfile .wrangler/codex-mhj_26_08_02_worker.js --metafile .wrangler/codex-mhj_26_08_02_metafile.json --minify
npx --yes wrangler@4.118.0 pages dev --port 8788
```

With local development running, verify both accepted URL forms, the method
contract, and that repeated calls return different puzzles:

```powershell
curl.exe -i http://127.0.0.1:8788/
curl.exe -i http://127.0.0.1:8788/api/new-puzzle
curl.exe -i http://127.0.0.1:8788/api/new-puzzle/
curl.exe -i -X POST http://127.0.0.1:8788/api/new-puzzle/
```

Confirm the reported compressed bundle size (3 MB ceiling applies regardless
of plan) and inspect preview invocation metrics -- in particular actual CPU
time per request -- before production promotion.

## Git-integration (dashboard) build settings

If the Pages project is connected to this repository via Cloudflare's Git
integration (auto-deploy on push), two dashboard settings under **Settings ->
Build & deployments** must be set correctly -- neither lives in a repo file,
so they cannot be fixed by editing code:

- **Deploy command**: must be `npx wrangler pages deploy game/static`, not
  the `npx wrangler deploy` default some project templates prefill.
  `wrangler.jsonc` has `pages_build_output_dir` (a Pages-specific field, no
  `main` or `assets.directory`), so plain `wrangler deploy` fails with
  "Missing entry-point to Worker script or to assets directory" -- it does
  not know this is a Pages project without the `pages` subcommand.
- **Build command**: leave empty. `game/static` is already the final output;
  there is no build step to run.
- **Environment variable `SKIP_DEPENDENCY_INSTALL=1`**: Cloudflare's build
  image auto-detects `requirements.txt` at the repo root and runs
  `pip install -r requirements.txt` before the deploy command, even though
  Python is never invoked at request time (see above). This variable is
  Cloudflare's documented way to skip that automatic dependency-install step
  regardless of which language it detected. `requirements.txt` itself stays
  in the repo (Django remains the local-dev/rollback path); this only stops
  the Cloudflare build from installing it.

## Optional authenticated deployment

Live deployment changes external Cloudflare state and requires an authenticated
Wrangler session, on an account with the Workers Paid plan enabled. After local
validation and deployment approval, run:

```powershell
npx --yes wrangler@4.118.0 pages deploy game/static --project-name sudoku-django-pages
```

No D1, KV, R2, or upstream API is required. Runtime computation now happens
entirely in JavaScript inside the Worker -- Python is not invoked at request
time; it remains only as the local Django development server's puzzle source.
