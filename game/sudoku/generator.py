"""Puzzle generation: a random full grid, then holes dug while uniqueness holds."""
from __future__ import annotations

import random
import time

from .dlx import default_budget
from .solver import alternative_exists, matrix_for, rows_to_board
from .spec import SudokuSpec, spec_for

#: Target clue counts per size.  9x9 numbers follow the usual conventions; the
#: larger sizes are starting points -- fewer clues cost generation time
#: superlinearly, so lower them only with the benchmark in hand.
DIFFICULTIES: dict[int, dict[str, int]] = {
    9: {"easy": 40, "medium": 32, "hard": 26},
    12: {"easy": 78, "medium": 66, "hard": 56},
    16: {"easy": 140, "medium": 120, "hard": 104},
}

DEFAULT_DIFFICULTY = "medium"

#: Wall-clock ceiling for the digging phase.  Hitting it yields a puzzle with
#: more clues than requested rather than a slow request or a hang.
DIG_TIME_LIMIT = {9: 5.0, 12: 15.0, 16: 45.0}


def givens_for(spec: SudokuSpec, difficulty: str = DEFAULT_DIFFICULTY) -> int:
    """Clue count for ``difficulty``, falling back to ~40% of the grid."""
    table = DIFFICULTIES.get(spec.dim)
    if table is None:
        return max(spec.dim, round(spec.cells * 0.4))
    try:
        return table[difficulty]
    except KeyError:
        raise ValueError(
            f"unknown difficulty {difficulty!r}; expected one of {sorted(table)}"
        ) from None


def _dig_time_limit(spec: SudokuSpec) -> float:
    return DIG_TIME_LIMIT.get(spec.dim, 5.0 * (spec.dim / 9.0) ** 3)


def generate_solved_board(dim: int | SudokuSpec = 9,
                          rng: random.Random | None = None) -> list[int]:
    """A uniformly-shuffled complete grid.

    Randomisation happens inside the search: each column's candidate scan starts
    at a random offset and wraps, so every candidate is still reachable on
    backtracking while the first choice is unbiased.
    """
    spec = spec_for(dim)
    matrix = matrix_for(spec)
    outcome = matrix.search(limit=1, randomize=True, rng=rng or random.Random())
    if outcome.budget_exceeded or not outcome.count:  # pragma: no cover
        raise RuntimeError(f"could not build a solved {spec.dim}x{spec.dim} grid")
    return rows_to_board(outcome.rows, spec)


def dig_holes(solution: list[int], spec: SudokuSpec, target_givens: int,
              rng: random.Random | None = None,
              budget: int | None = None,
              time_limit: float | None = None) -> list[int]:
    """Remove clues from ``solution`` while the puzzle stays uniquely solvable.

    Cells are visited in random order.  A removal is kept only when uniqueness
    is *proven* to survive it; an exhausted budget counts as not proven and the
    clue goes back, so the budget can only make the puzzle easier than asked,
    never wrong.
    """
    rng = rng or random.Random()
    if budget is None:
        budget = default_budget(spec)
    if time_limit is None:
        time_limit = _dig_time_limit(spec)

    puzzle = list(solution)
    order = list(range(spec.cells))
    rng.shuffle(order)

    givens = spec.cells
    deadline = time.monotonic() + time_limit
    for index in order:
        if givens <= target_givens:
            break
        if time.monotonic() > deadline:
            break
        removed = puzzle[index]
        puzzle[index] = 0
        # Invariant: before this removal the puzzle was uniquely solvable, so a
        # rival solution must disagree at `index`.  See alternative_exists().
        rival = alternative_exists(puzzle, index, removed, spec, budget)
        if rival is False:
            givens -= 1
        else:  # True, or None when the budget ran out -- both mean "put it back"
            puzzle[index] = removed
    return puzzle


def generate_puzzle(target_givens: int | None = None,
                    dim: int | SudokuSpec = 9,
                    difficulty: str = DEFAULT_DIFFICULTY,
                    rng: random.Random | None = None,
                    budget: int | None = None,
                    time_limit: float | None = None) -> tuple[list[int], list[int]]:
    """Return ``(puzzle, solution)``; the puzzle has exactly one solution.

    ``target_givens`` overrides ``difficulty`` when supplied.  It is a target,
    not a guarantee: digging stops early rather than run unbounded, so the
    result may keep a few more clues than requested.
    """
    spec = spec_for(dim)
    rng = rng or random.Random()
    if target_givens is None:
        target_givens = givens_for(spec, difficulty)
    if not 0 < target_givens <= spec.cells:
        raise ValueError(
            f"target_givens must be in 1..{spec.cells}, got {target_givens}"
        )

    solution = generate_solved_board(spec, rng)
    puzzle = dig_holes(solution, spec, target_givens, rng, budget, time_limit)
    return puzzle, solution
