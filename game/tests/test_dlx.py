"""Exact-cover matrix and the iterative search engine."""
from __future__ import annotations

import random
import sys

from django.test import SimpleTestCase

from game.sudoku.dlx import DancingLinks, default_budget
from game.sudoku.solver import rows_to_board
from game.sudoku.spec import spec_for

from .reference import is_valid_solution

SIZES = (9, 12, 16)


class MatrixShapeTests(SimpleTestCase):
    def test_node_count_matches_the_preallocation_formula(self):
        for dim in SIZES:
            spec = spec_for(dim)
            with self.subTest(dim=dim):
                matrix = DancingLinks(spec)
                self.assertEqual(matrix.active_columns(), spec.num_cols)
                self.assertTrue(matrix.is_pristine())

    def test_every_column_holds_exactly_dim_candidates(self):
        for dim in SIZES:
            spec = spec_for(dim)
            with self.subTest(dim=dim):
                matrix = DancingLinks(spec)
                sizes = matrix._SIZE[1:spec.num_cols + 1]
                self.assertEqual(set(sizes), {dim})


class CoverUncoverTests(SimpleTestCase):
    def test_uncover_restores_the_links_exactly(self):
        matrix = DancingLinks(spec_for(9))
        before = matrix.snapshot()
        for column in (1, 50, 200, 324):
            with self.subTest(column=column):
                matrix.cover(column)
                self.assertNotEqual(matrix.snapshot(), before)
                matrix.uncover(column)
                self.assertEqual(matrix.snapshot(), before)

    def test_nested_cover_unwinds_in_reverse(self):
        matrix = DancingLinks(spec_for(9))
        before = matrix.snapshot()
        columns = [3, 17, 88, 300]
        for column in columns:
            matrix.cover(column)
        for column in reversed(columns):
            matrix.uncover(column)
        self.assertEqual(matrix.snapshot(), before)


class SearchTests(SimpleTestCase):
    def test_finds_a_valid_complete_grid_for_every_size(self):
        for dim in SIZES:
            spec = spec_for(dim)
            with self.subTest(dim=dim):
                matrix = DancingLinks(spec)
                outcome = matrix.search(limit=1)
                self.assertFalse(outcome.budget_exceeded)
                self.assertEqual(outcome.count, 1)
                board = rows_to_board(outcome.rows, spec)
                self.assertTrue(is_valid_solution(board, spec))

    def test_solution_uses_exactly_one_row_per_cell(self):
        for dim in SIZES:
            spec = spec_for(dim)
            with self.subTest(dim=dim):
                outcome = DancingLinks(spec).search(limit=1)
                cells = {rid // dim for rid in outcome.rows}
                self.assertEqual(len(outcome.rows), spec.cells)
                self.assertEqual(len(cells), spec.cells)

    def test_matrix_is_restored_after_search(self):
        """The recoverability invariant: search leaves no trace."""
        for dim in SIZES:
            spec = spec_for(dim)
            with self.subTest(dim=dim):
                matrix = DancingLinks(spec)
                before = matrix.snapshot()
                matrix.search(limit=1)
                self.assertEqual(matrix.snapshot(), before)
                matrix.search(limit=3, collect=False)
                self.assertEqual(matrix.snapshot(), before)

    def test_matrix_is_restored_even_when_the_budget_runs_out(self):
        """Bail out at every point in the state machine, not just a lucky one.

        The budget can be hit in DESCEND, ADVANCE or BACKTRACK, and each leaves a
        different number of covered levels on the stack.  Sweeping the budget
        walks the search through all of them.
        """
        for dim in SIZES:
            spec = spec_for(dim)
            matrix = DancingLinks(spec)
            before = matrix.snapshot()
            for budget in range(1, 120):
                with self.subTest(dim=dim, budget=budget):
                    outcome = matrix.search(limit=1, budget=budget)
                    self.assertTrue(outcome.budget_exceeded)
                    self.assertEqual(matrix.snapshot(), before)
                    self.assertTrue(matrix.is_pristine())

    def test_matrix_is_restored_when_the_budget_runs_out_mid_puzzle(self):
        """Same sweep, but with clues layered on and backtracking in play."""
        spec = spec_for(9)
        matrix = DancingLinks(spec)
        board = [0] * 81
        for index, value in ((0, 1), (10, 2), (20, 3), (30, 4), (40, 5)):
            board[index] = value
        before = matrix.snapshot()
        for budget in range(1, 200):
            with self.subTest(budget=budget):
                with matrix.givens(board) as consistent:
                    self.assertTrue(consistent)
                    matrix.search(limit=10, budget=budget, collect=False)
                self.assertEqual(matrix.snapshot(), before)

    def test_budget_exceeded_is_reported_not_raised(self):
        matrix = DancingLinks(spec_for(9))
        outcome = matrix.search(limit=1, budget=1)
        self.assertTrue(outcome.budget_exceeded)
        self.assertEqual(outcome.count, 0)
        self.assertLessEqual(outcome.iterations, 2)

    def test_search_uses_no_recursion(self):
        """A tiny recursion limit must not bother the solver."""
        matrix = DancingLinks(spec_for(16))
        original = sys.getrecursionlimit()
        sys.setrecursionlimit(60)
        try:
            outcome = matrix.search(limit=1)
        finally:
            sys.setrecursionlimit(original)
        self.assertEqual(outcome.count, 1)

    def test_givens_are_layered_and_then_removed(self):
        spec = spec_for(9)
        matrix = DancingLinks(spec)
        board = [0] * 81
        board[0] = 5
        board[40] = 7
        before = matrix.snapshot()
        with matrix.givens(board) as consistent:
            self.assertTrue(consistent)
            self.assertLess(matrix.active_columns(), spec.num_cols)
        self.assertEqual(matrix.snapshot(), before)

    def test_contradictory_givens_are_detected(self):
        matrix = DancingLinks(spec_for(9))
        before = matrix.snapshot()
        board = [0] * 81
        board[0] = 5
        board[1] = 5  # same value twice in row 0
        with matrix.givens(board) as consistent:
            self.assertFalse(consistent)
        self.assertEqual(matrix.snapshot(), before)

    def test_givens_are_restored_when_the_body_raises(self):
        matrix = DancingLinks(spec_for(9))
        before = matrix.snapshot()
        board = [0] * 81
        board[0] = 5
        with self.assertRaises(RuntimeError):
            with matrix.givens(board):
                raise RuntimeError("boom")
        self.assertEqual(matrix.snapshot(), before)


class RandomisationTests(SimpleTestCase):
    def test_randomised_search_produces_different_grids(self):
        matrix = DancingLinks(spec_for(9))
        rng = random.Random(20260726)
        grids = {
            tuple(rows_to_board(matrix.search(limit=1, randomize=True, rng=rng).rows,
                                matrix.spec))
            for _ in range(12)
        }
        self.assertGreater(len(grids), 8)

    def test_randomised_search_still_produces_valid_grids(self):
        spec = spec_for(12)
        matrix = DancingLinks(spec)
        rng = random.Random(7)
        for _ in range(3):
            board = rows_to_board(matrix.search(limit=1, randomize=True, rng=rng).rows, spec)
            self.assertTrue(is_valid_solution(board, spec))

    def test_randomised_scan_still_reaches_every_candidate(self):
        """Starting mid-column must not shrink the search space."""
        spec = spec_for(9)
        matrix = DancingLinks(spec)
        board = [0] * 81
        # A 4-clue board has many solutions; the count must not depend on
        # where each column scan happens to begin.
        for index, value in ((0, 1), (10, 2), (20, 3), (30, 4)):
            board[index] = value
        with matrix.givens(board):
            plain = matrix.search(limit=500, collect=False).count
        with matrix.givens(board):
            shuffled = matrix.search(limit=500, collect=False,
                                     randomize=True, rng=random.Random(3)).count
        self.assertEqual(plain, shuffled)


class BudgetTests(SimpleTestCase):
    def test_budgets_are_defined_for_every_shipped_size(self):
        for dim in SIZES:
            with self.subTest(dim=dim):
                self.assertGreater(default_budget(spec_for(dim)), 0)

    def test_budget_grows_with_puzzle_size(self):
        self.assertLess(default_budget(spec_for(9)), default_budget(spec_for(12)))
        self.assertLess(default_budget(spec_for(12)), default_budget(spec_for(16)))

    def test_budget_is_far_above_the_measured_tail(self):
        """16x16 uniqueness checks were observed at 246,706 iterations."""
        self.assertGreaterEqual(default_budget(spec_for(16)), 1_000_000)
