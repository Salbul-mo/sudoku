"""Performance harness for the Sudoku engine.

Not collected by the test runner (the filename does not match ``test*.py``);
it is slow and reports numbers rather than asserting them.  Run it with::

    python manage.py shell -c "from game.tests import benchmarks; benchmarks.main()"

It also carries the pre-refactor baseline so the comparison stays honest: the
"legacy" rows below really do rebuild the object-based matrix on every call,
exactly as the old ``generator.has_unique_solution`` did.
"""
from __future__ import annotations

import random
import statistics
import time
from math import sqrt

from game import dlx as legacy_dlx
from game.sudoku import generator, solver
from game.sudoku.dlx import DancingLinks, default_budget
from game.sudoku.spec import spec_for

SIZES = (9, 12, 16)


# --------------------------------------------------------------- legacy path
# Reproduced from the pre-refactor generator so the A/B is measured, not quoted.
# The sqrt-based box rule is why this path cannot express a 12x12 grid.
def _legacy_constraints(row: int, dim: int) -> tuple[int, int, int, int]:
    return (
        row // dim,
        dim ** 2 + dim * (row // (dim ** 2)) + row % dim,
        2 * (dim ** 2) + (row % (dim ** 2)),
        int(3 * (dim ** 2)
            + (row // (sqrt(dim) * dim ** 2)) * (dim * sqrt(dim))
            + ((row // (sqrt(dim) * dim)) % sqrt(dim)) * dim
            + (row % dim)),
    )


def _legacy_matrix(board: list[int], dim: int) -> legacy_dlx.DL_Matrix:
    matrix = legacy_dlx.DL_Matrix(dim ** 3, (dim ** 2) * 4)
    for i, cell in enumerate(board):
        candidates = range(dim) if cell == 0 else [cell - 1]
        for candidate in candidates:
            row = i * dim + candidate
            for col in _legacy_constraints(row, dim):
                matrix.insert_node(row, col)
    return matrix


def _sample_puzzle(dim: int, givens: int, rng: random.Random) -> list[int]:
    solution = generator.generate_solved_board(dim, rng)
    puzzle = list(solution)
    for index in rng.sample(range(len(puzzle)), len(puzzle) - givens):
        puzzle[index] = 0
    return puzzle


def _time(fn, repeats: int) -> float:
    start = time.perf_counter()
    for _ in range(repeats):
        fn()
    return (time.perf_counter() - start) / repeats


# ------------------------------------------------------------------ sections
def compare_uniqueness_checks(repeats: int = 20) -> None:
    print("\n[1] uniqueness check: legacy rebuild vs array matrix + reuse")
    print(f"    {'size':>6} {'givens':>7} {'legacy':>12} {'new':>12} {'speedup':>9}")
    rng = random.Random(1)
    for dim, givens in ((9, 32), (16, 120)):
        puzzle = _sample_puzzle(dim, givens, rng)
        legacy = _time(lambda: _legacy_matrix(puzzle, dim).count_solutions(limit=2), repeats)
        new = _time(lambda: solver.classify(puzzle, dim), repeats)
        print(f"    {dim:>4}x{dim:<1} {givens:>7} {legacy*1000:>10.2f}ms "
              f"{new*1000:>10.2f}ms {legacy/new:>8.1f}x")
    print("    12x12      -- legacy path cannot build this size (sqrt box rule)")


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


def main() -> None:
    compare_uniqueness_checks()
    iteration_distribution()
    generation_cost()


if __name__ == "__main__":  # pragma: no cover
    main()
