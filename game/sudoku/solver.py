"""Board-level solving on top of the reusable exact-cover matrix."""
from __future__ import annotations

import threading
from enum import IntEnum

from .dlx import DancingLinks, default_budget
from .spec import SudokuSpec, spec_for


class Uniqueness(IntEnum):
    """Outcome of a uniqueness question.

    ``BUDGET_EXCEEDED`` is deliberately distinct from the three real answers.
    It means the search ran out of iterations without settling the question, and
    callers must treat it as "not proven unique" rather than as a verdict.  That
    keeps the budget a performance guard that can only cost difficulty, never
    correctness.
    """

    NO_SOLUTION = 0
    UNIQUE = 1
    MULTIPLE = 2
    BUDGET_EXCEEDED = 3


# One matrix per (thread, dim).  A search mutates the links in place, so a
# matrix shared between Django's worker threads would corrupt itself; building
# per thread costs one ~30ms build for 16x16 and nothing thereafter.
_local = threading.local()


def matrix_for(spec: SudokuSpec | int = 9) -> DancingLinks:
    """Thread-local, lazily built matrix for ``spec``."""
    spec = spec_for(spec)
    cache = getattr(_local, "cache", None)
    if cache is None:
        cache = _local.cache = {}
    matrix = cache.get(spec.dim)
    if matrix is None or matrix.spec != spec:
        matrix = cache[spec.dim] = DancingLinks(spec)
    return matrix


def rows_to_board(rows: list[int], spec: SudokuSpec) -> list[int]:
    board = [0] * spec.cells
    dim = spec.dim
    for row_id in rows:
        board[row_id // dim] = (row_id % dim) + 1
    return board


def solve(board: list[int], dim: int | SudokuSpec = 9,
          budget: int | None = None) -> list[int]:
    """Return one completed grid, or ``[]`` if there is none (or the budget ran out)."""
    spec = spec_for(dim)
    spec.check_board(board)
    matrix = matrix_for(spec)
    with matrix.givens(board) as consistent:
        if not consistent:
            return []
        outcome = matrix.search(limit=1, budget=budget)
    if outcome.budget_exceeded or outcome.count == 0:
        return []
    filled = list(board)
    dimension = spec.dim
    for row_id in outcome.rows:
        filled[row_id // dimension] = (row_id % dimension) + 1
    return filled


def count_solutions(board: list[int], dim: int | SudokuSpec = 9, limit: int = 2,
                    budget: int | None = None) -> int:
    """Count solutions, stopping at ``limit``.

    A budget overrun returns the count found so far, which is a lower bound.
    Use :func:`classify` when the difference matters.
    """
    spec = spec_for(dim)
    spec.check_board(board)
    matrix = matrix_for(spec)
    with matrix.givens(board) as consistent:
        if not consistent:
            return 0
        return matrix.search(limit=limit, budget=budget, collect=False).count


def classify(board: list[int], dim: int | SudokuSpec = 9,
             budget: int | None = None) -> Uniqueness:
    """Decide whether ``board`` has zero, one, or several solutions."""
    spec = spec_for(dim)
    spec.check_board(board)
    matrix = matrix_for(spec)
    with matrix.givens(board) as consistent:
        if not consistent:
            return Uniqueness.NO_SOLUTION
        outcome = matrix.search(limit=2, budget=budget, collect=False)
    if outcome.budget_exceeded:
        return Uniqueness.BUDGET_EXCEEDED
    if outcome.count == 0:
        return Uniqueness.NO_SOLUTION
    return Uniqueness.UNIQUE if outcome.count == 1 else Uniqueness.MULTIPLE


def has_unique_solution(board: list[int], dim: int | SudokuSpec = 9,
                        budget: int | None = None) -> bool:
    """True only when uniqueness was *proven*; an exhausted budget yields False."""
    return classify(board, dim, budget) is Uniqueness.UNIQUE


def alternative_exists(board: list[int], index: int, exclude: int,
                       spec: SudokuSpec, budget: int | None = None) -> bool | None:
    """Can cell ``index`` hold something other than ``exclude`` in some solution?

    Returns ``None`` if the budget ran out before the question was settled.

    This is the cheap uniqueness test used while digging holes.  It relies on a
    caller-side invariant: the board *with* ``index`` set to ``exclude`` must
    already be known to have exactly one solution.  Given that, any second
    solution of the current board has to differ at ``index`` -- if it agreed
    there it would also solve the previous board and therefore be the same
    grid.  So probing the alternatives at one cell settles uniqueness, and it
    skips re-deriving the solution we already know.

    :func:`classify` remains the right call when that invariant does not hold.
    """
    if budget is None:
        budget = default_budget(spec)
    matrix = matrix_for(spec)
    probe = list(board)
    for value in range(1, spec.dim + 1):
        if value == exclude:
            continue
        if spec.peers_forbid(board, index, value):
            continue
        probe[index] = value
        with matrix.givens(probe) as consistent:
            if not consistent:
                continue
            outcome = matrix.search(limit=1, budget=budget, collect=False)
        if outcome.budget_exceeded:
            return None
        if outcome.count:
            return True
    return False
