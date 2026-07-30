# Unified Acceptance Report (UI + DX tracks, Phase 4 close-out)

Per `mic:unified-gate-execution` (CT-05/RR4): results are reported **per
runner, not summed**, since the two tracks use different test frameworks and
a combined count would obscure which runner actually covers which code. Full
detail for each track lives in its own report and is not repeated here:

- UI track detail: `docs/ui-acceptance-report.md` (UI-B13)
- DX track detail: `docs/dlx-improvement-round2-report.md` (DX-B08)

This document is the merge point the plan asks for, plus the overall gate
decision.

## Per-runner results (not summed)

| Runner | Scope | Result |
|---|---|---|
| `node --test` (tests/js) | UI track: core/state/url/ui modules, bootstrap | PASS -- 193 tests, 0 failures, ~2.3s |
| `node tools/check-contrast.mjs` | UI track: theme token contrast (light/dark) | PASS -- 76/76 pairs |
| `python manage.py test game` | Both tracks: server shell (UI-B01/02) + solver/generator/DLX (DX-B01-08) | PASS -- 87 tests, 0 failures, ~2.6-2.8s |

No item here is a sum across runners (e.g. "193+87=280 tests passed") --
each runner exercises a disjoint part of the codebase and is reported on its
own line, per CT-05.

## Track outcomes

**UI track (UI-B01 through UI-B14): implemented and integrated.**
Full module set (core/state/url/ui/bootstrap) built, wired through
`main.js`, and exercised by the three runners above. Two items remain
NOT RUN because they require a real browser, a screen reader, or human study
participants (axe scan, manual accessibility walkthrough, three usability
kill-criteria, on-device legibility judgment, VisualViewport-on-device
check) -- see `docs/ui-acceptance-report.md` §"Metric table and kill
criteria" for the full breakdown. None of these are assumed clear; all are
explicitly marked NOT RUN.

**DX track (DX-B01 through DX-B05, DX-B07 pending, DX-B06 deferred):**
measurement harness built and used correctly; three candidate optimizations
(DX-B02/03/04) were implemented, verified for correctness, measured head to
head against the 1st-round baseline, and rejected because the measured gain
did not clear the "improves at every tested size" / "exceeds noise" bars the
plan itself set. `game/sudoku/dlx.py` and `game/sudoku/solver.py` remain
byte-identical to the 1st-round baseline (commit `bb53700`) as a result.
DX-B05 was correctly skipped per DEC-M-04-a (no engine speed change to
recalibrate against). DX-B06 remains deferred per explicit user instruction.
See `docs/dlx-improvement-round2-report.md` for the full A/B tables and the
falsified-hypothesis ledger.

## Overall gate decision

The unified plan's gate (`mic:unified-gate-execution`) requires both tracks'
automated runners to pass and every validation item to carry an honest
PASS/FAIL/BLOCKED/NOT RUN classification, not that every item be a PASS. On
that basis:

- **All three automated runners: PASS.**
- **UI track: implementation complete**, automatable validation PASS,
  human/device-dependent validation honestly NOT RUN (not silently assumed).
- **DX track: evidence gate executed as designed.** Three rejections are a
  valid, plan-anticipated outcome, not a blocker -- the plan explicitly says
  discarding every algorithm block is itself a conclusion (모든 알고리즘
  block이 폐기됨 -> 그것이 결론이다). No regression was introduced; the
  engine is provably unchanged from the 1st-round baseline.

**Gate status: PASS for everything this session was able to execute.**
Two categories of work remain outside this gate, both requiring the user's
separate, explicit approval before proceeding (destructive / hard-to-reverse
per AGENTS.md):

1. **UI-B13-06 -- legacy UI file removal.** `game/static/game/legacy/game.js`
   and `game/static/game/legacy/style.css` have zero references anywhere in
   `game/templates` or `game/static/game/js` (confirmed by an actual `grep`
   run, not assumed). Removing them is safe by that evidence, but the plan
   marks this `requires-approval="true"` and AGENTS.md requires explicit
   approval before deleting files -- not yet asked.
2. **Wave 7 / DX-B07 -- legacy DLX engine retirement.** `game/dlx.py` (and
   its benchmark comparison path) is superseded by the array-based DLX in
   `game/sudoku/dlx.py`, with a reproducible 6.3x-9.0x speedup measured this
   session. Removing it is also `requires-approval="true"` and has not been
   asked about yet.
3. **DX-B06 -- Cloudflare D1 puzzle cache.** Deferred by explicit user
   instruction ("클라우드플레어는 일단 미뤄두고 다른 것 부터 진행해"); design
   is complete in the unified plan but implementation has not started and
   will not until the user says to resume it.
