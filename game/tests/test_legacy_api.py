"""The pre-refactor import surface must keep working unchanged.

``game/views.py`` does ``from . import generator`` and calls
``generator.generate_puzzle()``; that call site was not touched by the refactor
and this pins it down.
"""
from __future__ import annotations

from django.test import SimpleTestCase

from game import generator as legacy
from game.sudoku.spec import spec_for

from . import reference
from .test_solver import UNIQUE_9


class LegacyFacadeTests(SimpleTestCase):
    def test_module_constants_are_unchanged(self):
        self.assertEqual(legacy.DIM, 9)
        self.assertEqual(legacy.TARGET_GIVENS, 32)

    def test_generate_puzzle_default_call(self):
        puzzle, solution = legacy.generate_puzzle()
        spec = spec_for(9)
        self.assertEqual(len(puzzle), 81)
        self.assertEqual(len(solution), 81)
        self.assertTrue(reference.is_valid_solution(solution, spec))
        self.assertEqual(reference.count_solutions(puzzle, spec, limit=2), 1)

    def test_generate_puzzle_positional_signature(self):
        puzzle, _ = legacy.generate_puzzle(40, 9)
        self.assertEqual(sum(1 for cell in puzzle if cell), 40)

    def test_solve_board(self):
        solved = legacy.solve_board(UNIQUE_9)
        self.assertTrue(reference.is_valid_solution(solved, spec_for(9)))

    def test_solve_board_returns_empty_when_unsolvable(self):
        board = list(UNIQUE_9)
        board[2] = 5
        self.assertEqual(legacy.solve_board(board), [])

    def test_has_unique_solution(self):
        self.assertTrue(legacy.has_unique_solution(UNIQUE_9))
        self.assertFalse(legacy.has_unique_solution([0] * 81))

    def test_generate_solved_board(self):
        board = legacy.generate_solved_board()
        self.assertTrue(reference.is_valid_solution(board, spec_for(9)))


class ViewIntegrationTests(SimpleTestCase):
    def test_index_view_renders(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)

    def test_new_puzzle_endpoint_returns_a_unique_puzzle(self):
        response = self.client.get("/api/new-puzzle/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        spec = spec_for(9)
        self.assertEqual(len(payload["puzzle"]), 81)
        self.assertEqual(reference.count_solutions(payload["puzzle"], spec, limit=2), 1)
