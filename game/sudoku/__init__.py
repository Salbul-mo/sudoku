"""Size-parametric Sudoku engine: geometry, exact-cover solver, generator.

Public surface lives here so callers never need to know which module a name
comes from::

    from game.sudoku import generate_puzzle, solve, SudokuSpec
"""
from __future__ import annotations

from .spec import SudokuSpec, spec_for
from .dlx import DancingLinks, SearchOutcome, default_budget
from .solver import (
    Uniqueness,
    classify,
    count_solutions,
    has_unique_solution,
    solve,
)
from .generator import (
    DIFFICULTIES,
    generate_puzzle,
    generate_solved_board,
    givens_for,
)

__all__ = [
    "SudokuSpec",
    "spec_for",
    "DancingLinks",
    "SearchOutcome",
    "default_budget",
    "Uniqueness",
    "classify",
    "count_solutions",
    "has_unique_solution",
    "solve",
    "DIFFICULTIES",
    "generate_puzzle",
    "generate_solved_board",
    "givens_for",
]
