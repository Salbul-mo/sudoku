"""Performance harness for the Sudoku engine.

Not collected by the test runner (the filename does not match ``test*.py``);
it is slow and reports numbers rather than asserting them.  Run it with::

    python manage.py shell -c "from game.tests import benchmarks; benchmarks.main()"

The pre-refactor object-based engine (``game/dlx.py``) has been retired after
DX-B07; its speedup over the array-based engine (6.3x-9.0x, measured across
two rounds) is recorded in ``docs/dlx-improvement-round2-report.md`` rather
than re-derived here on every run.
"""
from __future__ import annotations

import cProfile
import pstats
import random
import statistics
import time
from contextlib import contextmanager
from dataclasses import dataclass
from statistics import median
from typing import Iterator

from game.sudoku import generator, solver
from game.sudoku.dlx import DancingLinks, default_budget
from game.sudoku.spec import spec_for

SIZES = (9, 12, 16)


def _sample_puzzle(dim: int, givens: int, rng: random.Random) -> list[int]:
    solution = generator.generate_solved_board(dim, rng)
    puzzle = list(solution)
    for index in rng.sample(range(len(puzzle)), len(puzzle) - givens):
        puzzle[index] = 0
    return puzzle


# ------------------------------------------------------------------ sections
def iteration_distribution(trials: int = 200) -> None:
    print("\n[2] search iterations per uniqueness check (budget calibration)")
    print(f"    {'size':>6} {'givens':>7} {'p50':>8} {'p95':>9} {'max':>10} "
          f"{'budget':>10} {'headroom':>9}")
    for dim in SIZES:
        spec = spec_for(dim)
        givens = generator.givens_for(spec, "hard")
        rng = random.Random(dim)
        matrix = DancingLinks(spec)
        counts: list[int] = []
        for _ in range(trials):
            puzzle = _sample_puzzle(dim, givens, rng)
            with matrix.givens(puzzle) as consistent:
                if not consistent:
                    continue
                counts.append(matrix.search(limit=2, collect=False).iterations)
        counts.sort()
        budget = default_budget(spec)
        peak = counts[-1]
        print(f"    {dim:>4}x{dim:<1} {givens:>7} {counts[len(counts)//2]:>8,} "
              f"{counts[int(len(counts)*0.95)]:>9,} {peak:>10,} {budget:>10,} "
              f"{budget/peak:>8.0f}x")


def generation_cost(trials: int = 5) -> None:
    print("\n[3] end-to-end puzzle generation")
    print(f"    {'size':>6} {'difficulty':>11} {'givens':>7} {'median':>10} {'max':>10}")
    for dim in SIZES:
        for difficulty in ("easy", "medium", "hard"):
            rng = random.Random(dim)
            times: list[float] = []
            givens = 0
            for _ in range(trials):
                start = time.perf_counter()
                puzzle, _solution = generator.generate_puzzle(
                    dim=dim, difficulty=difficulty, rng=rng)
                times.append(time.perf_counter() - start)
                givens = sum(1 for cell in puzzle if cell)
            print(f"    {dim:>4}x{dim:<1} {difficulty:>11} {givens:>7} "
                  f"{statistics.median(times):>9.3f}s {max(times):>9.3f}s")


# -------------------------------------------------------------- instrumented
@dataclass(frozen=True)
class CallCounts:
    """Immutable snapshot of :class:`Accumulator`, safe to hand to a caller."""

    apply_row: int
    givens_enter: int
    search: int
    iterations: int
    alternative_calls: int
    probes: int
    zero_probe_calls: int


class Accumulator:
    """Mutable counters filled in by the wrappers :func:`instrument` installs."""

    def __init__(self) -> None:
        self.apply_row = 0
        self.givens_enter = 0
        self.search = 0
        self.iterations = 0
        self.alternative_calls = 0
        self.probes = 0
        self.zero_probe_calls = 0

    def snapshot(self) -> CallCounts:
        return CallCounts(
            apply_row=self.apply_row, givens_enter=self.givens_enter,
            search=self.search, iterations=self.iterations,
            alternative_calls=self.alternative_calls, probes=self.probes,
            zero_probe_calls=self.zero_probe_calls,
        )


_active = False


@contextmanager
def instrument() -> Iterator[Accumulator]:
    """Count DLX/solver calls for the duration of the block.

    Patches both ``solver.alternative_exists`` and ``generator.alternative_exists``
    -- ``generator`` imports the name directly (``from .solver import
    alternative_exists``), so patching only ``solver``'s attribute would leave
    ``generator.dig_holes`` still calling the original (EF1). Not re-entrant:
    a nested call would restore the outer wrappers when the inner block exits,
    silently losing the rest of the outer measurement.
    """
    global _active
    if _active:
        raise RuntimeError("instrument() is not re-entrant")
    acc = Accumulator()

    original_apply_row = DancingLinks._apply_row
    original_givens = DancingLinks.givens
    original_search = DancingLinks.search
    original_solver_alt = solver.alternative_exists
    original_generator_alt = generator.alternative_exists

    def counted_apply_row(self, rid, applied):
        acc.apply_row += 1
        return original_apply_row(self, rid, applied)

    @contextmanager
    def counted_givens(self, board):
        acc.givens_enter += 1
        with original_givens(self, board) as consistent:
            yield consistent

    def counted_search(self, *args, **kwargs):
        acc.search += 1
        outcome = original_search(self, *args, **kwargs)
        acc.iterations += outcome.iterations
        return outcome

    def counted_alternative_exists(board, index, exclude, spec, budget=None):
        # Mirrors alternative_exists' own skip conditions so the count matches
        # what it actually probes, not just how many times it was entered.
        probes = sum(
            1 for value in range(1, spec.dim + 1)
            if value != exclude and not spec.peers_forbid(board, index, value)
        )
        acc.alternative_calls += 1
        acc.probes += probes
        if probes == 0:
            acc.zero_probe_calls += 1
        return original_solver_alt(board, index, exclude, spec, budget)

    DancingLinks._apply_row = counted_apply_row
    DancingLinks.givens = counted_givens
    DancingLinks.search = counted_search
    solver.alternative_exists = counted_alternative_exists
    generator.alternative_exists = counted_alternative_exists

    _active = True
    try:
        yield acc
    finally:
        DancingLinks._apply_row = original_apply_row
        DancingLinks.givens = original_givens
        DancingLinks.search = original_search
        solver.alternative_exists = original_solver_alt
        generator.alternative_exists = original_generator_alt
        _active = False


def workload(dim: int, trials: int, seed: int) -> list[tuple[list[int], list[int]]]:
    """Deterministic puzzle series shared by every measurement section below.

    The same ``(dim, trials, seed)`` always yields the same puzzles -- the
    premise every A/B comparison in this module (and in the DX-B02..DX-B05
    spikes) depends on.
    """
    if trials < 1:
        raise ValueError(f"trials must be >= 1, got {trials}")
    spec = spec_for(dim)  # raises ValueError for dim < 1; see SudokuSpec.for_dim
    rng = random.Random(seed)  # local rng, never random.seed()
    return [generator.generate_puzzle(dim=spec, rng=rng) for _ in range(trials)]


def call_counts(dims: tuple[int, ...] = (9, 12), trials: int = 20, seed: int = 7) -> None:
    print(f"\n[4] call counts per generated puzzle (trials={trials}, seed={seed})")
    print(f"    {'size':>6} {'givens/pz':>10} {'apply_row/pz':>13} {'search/pz':>10} "
          f"{'iters/pz':>10} {'alt/pz':>8} {'probe/call':>11} {'zero-probe%':>12}")
    for dim in dims:
        with instrument() as acc:
            workload(dim, trials, seed)
        c = acc.snapshot()
        calls = max(c.alternative_calls, 1)
        print(f"    {dim:>4}x{dim:<1} {c.givens_enter/trials:>10.1f} "
              f"{c.apply_row/trials:>13.1f} {c.search/trials:>10.1f} "
              f"{c.iterations/trials:>10.1f} {c.alternative_calls/trials:>8.1f} "
              f"{c.probes/calls:>11.2f} {100*c.zero_probe_calls/calls:>11.1f}%")


def _cumtime_of(stats: pstats.Stats, filename_part: str, funcname: str) -> float:
    for (filename, _line, name), entry in stats.stats.items():
        if name == funcname and filename_part in filename:
            return entry[3]  # (cc, nc, tt, ct, callers) -- ct is cumtime
    return 0.0


def profile_section(dims: tuple[int, ...] = (9, 16), trials: int = 25, seed: int = 7) -> None:
    print(f"\n[5] cProfile summary (trials={trials}, seed={seed})")
    print("    profiling overhead inflates every absolute time here -- read only "
          "the givens/search share, never the seconds, as a performance claim")
    for dim in dims:
        pr = cProfile.Profile()
        pr.enable()
        workload(dim, trials, seed)
        pr.disable()
        stats = pstats.Stats(pr)
        total = stats.total_tt
        givens_cum = _cumtime_of(stats, "dlx.py", "givens")
        search_cum = _cumtime_of(stats, "dlx.py", "search")
        print(f"    dim={dim}: total={total:.3f}s "
              f"givens_share={givens_cum/total:.1%} search_share={search_cum/total:.1%}")
        stats.sort_stats("tottime")
        stats.print_stats(7)


def ab_timing(dims: tuple[int, ...] = (9, 12, 16), trials: int = 10, seed: int = 7) -> None:
    print(f"\n[6] A/B generation timing (trials={trials}, seed={seed})")
    print(f"    {'size':>6} {'median':>10} {'max':>10}")
    for dim in dims:
        times: list[float] = []
        for i in range(trials):
            start = time.perf_counter()
            workload(dim, 1, seed + i)
            times.append(time.perf_counter() - start)
        print(f"    {dim:>4}x{dim:<1} {median(times)*1000:>9.1f}ms {max(times)*1000:>9.1f}ms")


def main() -> None:
    iteration_distribution()
    generation_cost()
    call_counts()
    profile_section()
    ab_timing()


if __name__ == "__main__":  # pragma: no cover
    main()
