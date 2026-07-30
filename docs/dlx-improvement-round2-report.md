# DLX 2nd-Round Improvement Report (DX-B08)

Same format as `docs/dlx-refactor-plan.md` (the 1st round). This round's
verdict, stated up front: **every algorithmic block was measured and
discarded.** `game/sudoku/dlx.py` and `game/sudoku/solver.py` are byte-identical
to the 1st-round baseline (commit `bb53700`) -- `git diff --stat` against both
files shows no changes. Per this round's own failure-mode guidance, that is a
measured answer, not a failure: F1-F3's profiling found the DLX layer to be
already efficient for this workload at the current engine speed, and every
candidate optimization's cost turned out to meet or exceed its saving.

## Full suite (V-DX-B08-01)

**PASS.** `python manage.py test game`: 87 tests, 0 failures, ~2.6-2.8s.

1st-round baseline was 74 tests / 2.876s. The +13 tests are entirely from the
UI track's server-shell and measurement-harness work this round
(`game/tests/test_views.py`, `game/tests/test_benchmarks.py`) -- not from any
adopted DLX algorithm change, since none were adopted.

## Integrated A/B against the 1st-round baseline (V-DX-B08-02)

Same-machine, same-session re-measurement (DEC-DX-04's reason for keeping
`game/dlx.py` as the legacy comparison path):

| size | metric | value | trials/seed |
|---|---|---|---|
| 9x9 | legacy vs array-matrix uniqueness check | 6.38ms vs 1.01ms (6.3x) | 20 trials, seed 1 |
| 16x16 | legacy vs array-matrix uniqueness check | 25.85ms vs 2.88ms (9.0x) | 20 trials, seed 1 |
| 12x12 | -- | legacy path cannot build this size (sqrt box rule) | -- |
| 9x9 | generation (ms/puzzle, median/max) | 14.0 / 17.2 | 10 trials, seed 7 |
| 12x12 | generation (ms/puzzle, median/max) | 54.9 / 64.0 | 10 trials, seed 7 |
| 16x16 | generation (ms/puzzle, median/max) | 326.3 / 403.2 | 10 trials, seed 7 |

The array-matrix-vs-legacy gap (6-9x) is the 1st round's already-adopted
improvement, reproduced here as a sanity check, not a claim of new work this
round. No 2nd-round algorithmic change altered these numbers, because none
were adopted -- this table and the 1st-round document's table describe the
same code.

## Byte-identical generation results (V-DX-B08-03)

Confirmed: `dlx.py`/`solver.py` have zero diff against the pre-round-2
baseline, so generation output for any given seed is unchanged by
construction -- there is no "intended range of difference" to check, because
nothing in the generation path changed.

## Adopted / rejected / unchanged, with numbers (V-DX-B08-04)

| Block | Direction | Result | Verdict |
|---|---|---|---|
| DX-B02 (probe pre-filter) | D1: reduce probe count | Correct (500-trial oracle cross-check passed; byte-identical generation with prefilter disabled). A/B over 3 repeated runs: dim=9 consistently faster (~15-25%), but **dim=16 was flat-to-slower** (mean 376.6ms vs 368.0ms baseline across 3 runs, trials=15/seed varied) | **REJECTED** -- fails "improvement at both dim=9 and dim=16" (plan's own adoption rule). Reverted in full; `game/sudoku/prefilter.py` deleted, `solver.py` restored to baseline. |
| DX-B03 (reduced matrix vs layer) | D2: cheaper per-probe cost | Correct (200-board `count_solutions` agreement, `is_pristine` held both paths). A/B: reduced strategy was **4-5x slower** at every size (12x12: 60.6ms -> 277.7ms layer vs reduced, trials=10/seed=7) | **REJECTED** -- rebuilding a matrix per probe costs far more than the layer-and-cover approach it was meant to replace, even with this round's O(1)-insertion builder. Reverted in full; the `reduced()` classmethod and its switch removed from `dlx.py`/`solver.py`. |
| DX-B04 (preallocated search stacks + re-entrancy guard) | D3: cut per-call allocation | Correct (existing invariant tests all held; new re-entrancy test passed). A/B over repeated runs: dim=9 flat, dim=12 borderline (~6%), **dim=16 within noise or slightly worse** (single larger sample: 354.3ms baseline vs 362.6ms preallocated) | **REJECTED** -- "below noise" per the block's own decision rule (V-DX-B04-06); the measured gain never consistently exceeded run-to-run variance. Reverted; preallocated stack slots and the re-entrancy guard removed from `dlx.py`. |
| DX-B05 (budget/difficulty recalibration) | -- | Not executed | **N/A per DEC-M-04-a**: DX-B02/03/04 were all rejected, so engine speed is unchanged and the existing budget table's basis is unchanged. Recorded as "근거표 유효, 재측정 불요" (existing table valid, no re-measurement needed); its 5 validation items are NOT RUN. |
| DX-B06 (Cloudflare D1 puzzle cache) | -- | Deferred | User asked to defer Cloudflare work (2026-07-30/31). CT-01 was resolved as CT-01-A (U1 amended, PSD-01) and the design (D1 client instead of Django ORM) is specified in the unified plan, but implementation has not started. Its 6 validation items are NOT RUN, pending resumption. |

## Falsified hypotheses carried forward (V-DX-B08-04)

H-A and H-B were falsified in the *1st* round (see
`docs/claude-mhj_26_07_30_01_sudoku-unified-plan.xml`'s `plan:dlx-design-basis`)
and are not re-tested here; they remain valid negative results. This round
adds three more to the same ledger:

- **DX-B02 rejected**: cheap contradiction-checking before a probe helps at
  small dim but its own O(cells) cost grows with dim and erodes the saving by
  16x16.
- **DX-B03 rejected**: rebuilding a reduced matrix per probe is dominated by
  allocation and re-derivation cost; the cached, layer-based matrix wins at
  every size tested, confirming the 1st round's H-B finding (cover/uncover's
  strict LIFO requirement) generalizes to "don't rebuild per probe" even
  outside the specific incremental-layering shape H-B ruled out.
- **DX-B04 rejected**: the search loop's per-call list allocation was already
  cheap relative to cover/uncover's own work; removing it bought a re-entrancy
  restriction without a reliable speed return.

A future round should not retry these three in the same form without a
change to what's actually expensive (per F1: 83-91% of generation time is
still the clue layer's cover/uncover cost, not search).

## Validation item classification (V-DX-B08-05)

| Item | Status |
|---|---|
| V-DX-B01-01..05 (measurement harness) | PASS -- see Wave 0 |
| V-DX-B02-01..05 | Executed and used to reject the block; not "PASS" as an adoption outcome, but every measurement ran. Recorded as **REJECTED (evidence-based)**, distinct from NOT RUN. |
| V-DX-B03-01..05 | REJECTED (evidence-based), same basis |
| V-DX-B04-01..06 | REJECTED (evidence-based) for -06 (the gate item); 01-05's underlying invariants held both before reversion and remain true of the unmodified baseline |
| V-DX-B05-01..05 | **NOT RUN** -- DEC-M-04-a applies (all three algorithm blocks rejected) |
| V-DX-B06-01..06 | **NOT RUN** -- deferred by user request |

No item above is marked PASS when it was not actually run, and no rejection
is recorded as a failure of process -- DEC-DX-01's evidence gate worked
exactly as designed: three plausible optimizations were measured and none
justified their cost at this engine speed and this workload.
