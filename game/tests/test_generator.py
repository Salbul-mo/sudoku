"""Generation: valid grids, proven-unique puzzles, honest budget behaviour."""
from __future__ import annotations

import random

from django.test import SimpleTestCase

from game.sudoku import generator, solver
from game.sudoku.solver import Uniqueness
from game.sudoku.spec import spec_for

from . import reference


class SolvedBoardTests(SimpleTestCase):
    def test_generates_valid_grids_for_every_size(self):
        for dim in (9, 12, 16):
            spec = spec_for(dim)
            with self.subTest(dim=dim):
                board = generator.generate_solved_board(dim, random.Random(dim))
                self.assertTrue(reference.is_valid_solution(board, spec))
                self.assertTrue(spec.is_solved(board))

    def test_successive_grids_differ(self):
        rng = random.Random(2026)
        grids = {tuple(generator.generate_solved_board(9, rng)) for _ in range(10)}
        self.assertGreater(len(grids), 7)


class PuzzleTests(SimpleTestCase):
    def test_9x9_puzzles_are_uniquely_solvable(self):
        rng = random.Random(1)
        spec = spec_for(9)
        for trial in range(12):
            puzzle, solution = generator.generate_puzzle(dim=9, rng=rng)
            with self.subTest(trial=trial):
                self.assertTrue(reference.is_valid_solution(solution, spec))
                # Verified by the independent oracle, not by the engine itself.
                self.assertEqual(reference.count_solutions(puzzle, spec, limit=2), 1)
                self.assertEqual(solver.solve(puzzle, 9), solution)

    def test_clues_are_a_subset_of_the_solution(self):
        rng = random.Random(5)
        puzzle, solution = generator.generate_puzzle(dim=9, rng=rng)
        for index, value in enumerate(puzzle):
            if value:
                self.assertEqual(value, solution[index])

    def test_12x12_puzzles_are_uniquely_solvable(self):
        """The size the previous implementation could not build at all."""
        spec = spec_for(12)
        puzzle, solution = generator.generate_puzzle(
            target_givens=100, dim=12, rng=random.Random(3))
        self.assertTrue(reference.is_valid_solution(solution, spec))
        self.assertIs(solver.classify(puzzle, 12), Uniqueness.UNIQUE)
        self.assertEqual(solver.solve(puzzle, 12), solution)

    def test_16x16_puzzles_are_uniquely_solvable(self):
        spec = spec_for(16)
        puzzle, solution = generator.generate_puzzle(
            target_givens=190, dim=16, rng=random.Random(3))
        self.assertTrue(reference.is_valid_solution(solution, spec))
        self.assertIs(solver.classify(puzzle, 16), Uniqueness.UNIQUE)

    def test_reaches_the_requested_clue_count_on_9x9(self):
        rng = random.Random(8)
        for difficulty, expected in generator.DIFFICULTIES[9].items():
            puzzle, _ = generator.generate_puzzle(dim=9, difficulty=difficulty, rng=rng)
            with self.subTest(difficulty=difficulty):
                self.assertEqual(sum(1 for cell in puzzle if cell), expected)

    def test_invalid_target_is_rejected(self):
        with self.assertRaises(ValueError):
            generator.generate_puzzle(target_givens=0, dim=9)
        with self.assertRaises(ValueError):
            generator.generate_puzzle(target_givens=82, dim=9)

    def test_unknown_difficulty_is_rejected(self):
        with self.assertRaises(ValueError):
            generator.generate_puzzle(dim=9, difficulty="impossible")


class BudgetSafetyTests(SimpleTestCase):
    """The budget may only cost difficulty -- never correctness.

    A removal is kept only when uniqueness is *proven* to survive it, and an
    exhausted budget counts as unproven.  So starving the search leaves more
    clues on the board; it can never let a puzzle with several solutions out.
    """

    def test_puzzles_stay_uniquely_solvable_at_every_budget(self):
        spec = spec_for(9)
        for budget in (1, 10, 100, 1000, None):
            for seed in range(3):
                puzzle, _ = generator.generate_puzzle(
                    dim=9, target_givens=25, rng=random.Random(seed), budget=budget)
                with self.subTest(budget=budget, seed=seed):
                    # Confirmed by the independent oracle, not by the engine.
                    self.assertEqual(reference.count_solutions(puzzle, spec, limit=2), 1)

    def test_a_smaller_budget_yields_an_easier_puzzle(self):
        def givens(budget: int | None, seed: int) -> int:
            puzzle, _ = generator.generate_puzzle(
                dim=9, target_givens=25, rng=random.Random(seed), budget=budget)
            return sum(1 for cell in puzzle if cell)

        for seed in range(3):
            with self.subTest(seed=seed):
                self.assertGreater(givens(1, seed), givens(100, seed))
                self.assertGreaterEqual(givens(100, seed), givens(None, seed))

    def test_a_starved_budget_still_removes_forced_clues(self):
        """Cells whose peers already exclude every other value need no search."""
        puzzle, solution = generator.generate_puzzle(
            dim=9, target_givens=25, rng=random.Random(2), budget=1)
        self.assertLess(sum(1 for cell in puzzle if cell), len(solution))

    def test_a_tight_time_limit_stops_early_without_breaking_uniqueness(self):
        spec = spec_for(9)
        puzzle, _ = generator.generate_puzzle(
            dim=9, target_givens=22, rng=random.Random(6), time_limit=0.0)
        self.assertEqual(reference.count_solutions(puzzle, spec, limit=2), 1)


class DifficultyTableTests(SimpleTestCase):
    def test_every_shipped_size_has_a_difficulty_table(self):
        for dim in (9, 12, 16):
            with self.subTest(dim=dim):
                self.assertIn(dim, generator.DIFFICULTIES)

    def test_targets_are_within_the_grid(self):
        for dim, table in generator.DIFFICULTIES.items():
            spec = spec_for(dim)
            for difficulty, givens in table.items():
                with self.subTest(dim=dim, difficulty=difficulty):
                    self.assertGreater(givens, 0)
                    self.assertLess(givens, spec.cells)

    def test_harder_means_fewer_clues(self):
        for dim, table in generator.DIFFICULTIES.items():
            with self.subTest(dim=dim):
                self.assertGreater(table["easy"], table["medium"])
                self.assertGreater(table["medium"], table["hard"])
