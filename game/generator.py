"""Backwards-compatible facade over :mod:`game.sudoku`.

The engine moved into the ``game.sudoku`` package (size-parametric geometry,
array-based Dancing Links, iterative search).  This module keeps the names and
signatures the views were already importing, so existing callers need no change.

New code should import from :mod:`game.sudoku` directly::

    from game.sudoku import generate_puzzle, solve, classify, Uniqueness
"""
from __future__ import annotations

from .sudoku import generator as _generator
from .sudoku import solver as _solver
from .sudoku.spec import spec_for

DIM = 9
TARGET_GIVENS = 32


def solve_board(board: list[int], dim: int = DIM) -> list[int]:
    """Return the completed board, or ``[]`` if it has no solution."""
    return _solver.solve(board, dim)


def has_unique_solution(board: list[int], dim: int = DIM) -> bool:
    """True only when uniqueness was proven within the search budget."""
    return _solver.has_unique_solution(board, dim)


def generate_solved_board(dim: int = DIM) -> list[int]:
    """A random complete grid."""
    return _generator.generate_solved_board(dim)


def generate_puzzle(target_givens: int = TARGET_GIVENS,
                    dim: int = DIM) -> tuple[list[int], list[int]]:
    """Return ``(puzzle, solution)`` where the puzzle has exactly one solution."""
    return _generator.generate_puzzle(target_givens=target_givens, dim=dim)


__all__ = [
    "DIM",
    "TARGET_GIVENS",
    "solve_board",
    "has_unique_solution",
    "generate_solved_board",
    "generate_puzzle",
    "spec_for",
]
