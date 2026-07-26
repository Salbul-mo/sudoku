"""Board-level solving, uniqueness classification, and matrix reuse."""
from __future__ import annotations

import random
import threading

from django.test import SimpleTestCase

from game.sudoku import solver
from game.sudoku.solver import Uniqueness
from game.sudoku.spec import spec_for

from . import reference

# A well-known 9x9 puzzle with a single solution.
UNIQUE_9 = [
    5, 3, 0, 0, 7, 0, 0, 0, 0,
    6, 0, 0, 1, 9, 5, 0, 0, 0,
    0, 9, 8, 0, 0, 0, 0, 6, 0,
    8, 0, 0, 0, 6, 0, 0, 0, 3,
    4, 0, 0, 8, 0, 3, 0, 0, 1,
    7, 0, 0, 0, 2, 0, 0, 0, 6,
    0, 6, 0, 0, 0, 0, 2, 8, 0,
    0, 0, 0, 4, 1, 9, 0, 0, 5,
    0, 0, 0, 0, 8, 0, 0, 7, 9,
]


class SolveTests(SimpleTestCase):
    def test_solves_a_known_puzzle(self):
        spec = spec_for(9)
        solved = solver.solve(UNIQUE_9, 9)
        self.assertTrue(reference.is_valid_solution(solved, spec))
        for index, value in enumerate(UNIQUE_9):
            if value:
                self.assertEqual(solved[index], value)

    def test_empty_board_solves_for_every_size(self):
        for dim in (9, 12, 16):
            spec = spec_for(dim)
            with self.subTest(dim=dim):
                solved = solver.solve([0] * spec.cells, dim)
                self.assertTrue(reference.is_valid_solution(solved, spec))

    def test_unsolvable_board_returns_empty(self):
        board = list(UNIQUE_9)
        board[2] = 5  # duplicates the 5 already in row 0
        self.assertEqual(solver.solve(board, 9), [])

    def test_malformed_board_is_rejected(self):
        with self.assertRaises(ValueError):
            solver.solve([0] * 80, 9)


class ClassifyTests(SimpleTestCase):
    def test_unique_puzzle(self):
        self.assertIs(solver.classify(UNIQUE_9, 9), Uniqueness.UNIQUE)
        self.assertTrue(solver.has_unique_solution(UNIQUE_9, 9))

    def test_empty_board_has_many_solutions(self):
        self.assertIs(solver.classify([0] * 81, 9), Uniqueness.MULTIPLE)
        self.assertFalse(solver.has_unique_solution([0] * 81, 9))

    def test_contradictory_board_has_none(self):
        board = list(UNIQUE_9)
        board[2] = 5
        self.assertIs(solver.classify(board, 9), Uniqueness.NO_SOLUTION)

    def test_removing_a_clue_can_break_uniqueness(self):
        board = list(UNIQUE_9)
        board[0] = 0
        board[4] = 0
        board[8] = 0
        board[36] = 0
        board[40] = 0
        self.assertIn(solver.classify(board, 9),
                      {Uniqueness.UNIQUE, Uniqueness.MULTIPLE})

    def test_exhausted_budget_is_not_reported_as_an_answer(self):
        result = solver.classify(UNIQUE_9, 9, budget=1)
        self.assertIs(result, Uniqueness.BUDGET_EXCEEDED)
        # The conservative contract: unproven never reads as unique.
        self.assertFalse(solver.has_unique_solution(UNIQUE_9, 9, budget=1))


class AgainstReferenceTests(SimpleTestCase):
    """Cross-check the DLX engine against the independent backtracking oracle."""

    def test_solution_counts_agree_on_random_9x9_boards(self):
        spec = spec_for(9)
        rng = random.Random(4242)
        full = solver.solve([0] * 81, 9)
        for trial in range(40):
            board = list(full)
            for index in rng.sample(range(81), rng.randint(45, 60)):
                board[index] = 0
            with self.subTest(trial=trial):
                self.assertEqual(
                    solver.count_solutions(board, 9, limit=3),
                    reference.count_solutions(board, spec, limit=3),
                )

    def test_solution_counts_agree_on_12x12(self):
        spec = spec_for(12)
        rng = random.Random(99)
        full = solver.solve([0] * 144, 12)
        for trial in range(5):
            board = list(full)
            for index in rng.sample(range(144), 30):
                board[index] = 0
            with self.subTest(trial=trial):
                self.assertEqual(
                    solver.count_solutions(board, 12, limit=2),
                    reference.count_solutions(board, spec, limit=2),
                )


class AlternativeExistsTests(SimpleTestCase):
    def test_agrees_with_full_classification_under_its_invariant(self):
        """The targeted probe must match a full count when the precondition holds."""
        spec = spec_for(9)
        rng = random.Random(11)
        puzzle = list(solver.solve([0] * 81, 9))
        checked = 0
        for index in rng.sample(range(81), 81):
            removed = puzzle[index]
            puzzle[index] = 0
            rival = solver.alternative_exists(puzzle, index, removed, spec)
            full = solver.classify(puzzle, spec)
            self.assertIsNotNone(rival)
            if rival:
                self.assertIs(full, Uniqueness.MULTIPLE)
                puzzle[index] = removed
            else:
                self.assertIs(full, Uniqueness.UNIQUE)
            checked += 1
        self.assertEqual(checked, 81)

    def test_returns_none_when_the_budget_runs_out(self):
        spec = spec_for(9)
        board = [0] * 81
        board[0] = 1
        self.assertIsNone(solver.alternative_exists(board, 0, 1, spec, budget=1))


class MatrixReuseTests(SimpleTestCase):
    def test_repeated_checks_leave_the_cached_matrix_clean(self):
        spec = spec_for(9)
        matrix = solver.matrix_for(spec)
        before = matrix.snapshot()
        for _ in range(25):
            solver.classify(UNIQUE_9, 9)
            solver.solve(UNIQUE_9, 9)
        self.assertEqual(matrix.snapshot(), before)
        self.assertTrue(matrix.is_pristine())

    def test_same_matrix_is_reused_within_a_thread(self):
        self.assertIs(solver.matrix_for(9), solver.matrix_for(9))

    def test_each_thread_gets_its_own_matrix(self):
        """Sharing one matrix across Django worker threads would corrupt it."""
        mine = solver.matrix_for(9)
        theirs: list[object] = []
        results: list[bool] = []

        def worker() -> None:
            theirs.append(solver.matrix_for(9))
            results.append(solver.has_unique_solution(UNIQUE_9, 9))

        thread = threading.Thread(target=worker)
        thread.start()
        thread.join()
        self.assertIsNot(mine, theirs[0])
        self.assertTrue(results[0])

    def test_concurrent_solving_stays_correct(self):
        errors: list[str] = []

        def worker() -> None:
            for _ in range(15):
                if solver.solve(UNIQUE_9, 9) != solver.solve(UNIQUE_9, 9):
                    errors.append("unstable result")

        threads = [threading.Thread(target=worker) for _ in range(4)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(errors, [])
