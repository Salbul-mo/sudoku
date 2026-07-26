"""Geometry tests -- the layer where 12x12 used to break."""
from __future__ import annotations

from django.test import SimpleTestCase

from game.sudoku.spec import SPECS, SudokuSpec, spec_for

SIZES = (9, 12, 16)


class BoxShapeTests(SimpleTestCase):
    def test_shipped_specs_tile_their_grid(self):
        for dim, spec in SPECS.items():
            with self.subTest(dim=dim):
                self.assertEqual(spec.box_w * spec.box_h, dim)

    def test_for_dim_picks_the_conventional_shape(self):
        self.assertEqual(SudokuSpec.for_dim(9), SudokuSpec(9, 3, 3))
        self.assertEqual(SudokuSpec.for_dim(12), SudokuSpec(12, 4, 3))
        self.assertEqual(SudokuSpec.for_dim(16), SudokuSpec(16, 4, 4))
        self.assertEqual(SudokuSpec.for_dim(6), SudokuSpec(6, 3, 2))

    def test_twelve_is_not_square_and_is_still_supported(self):
        spec = spec_for(12)
        self.assertNotEqual(spec.box_w, spec.box_h)
        self.assertEqual((spec.box_w, spec.box_h), (4, 3))

    def test_impossible_box_shape_is_rejected(self):
        with self.assertRaises(ValueError):
            SudokuSpec(12, 5, 3)


class ConstraintColumnTests(SimpleTestCase):
    def test_every_column_family_is_exactly_dim_squared(self):
        """The old sqrt-based box rule produced 176 columns for dim=12, not 144."""
        for dim in SIZES:
            spec = spec_for(dim)
            with self.subTest(dim=dim):
                families: list[set[int]] = [set(), set(), set(), set()]
                for r in range(dim):
                    for c in range(dim):
                        for v in range(dim):
                            for family, col in enumerate(spec.constraint_cols(r, c, v)):
                                families[family].add(col)
                for family, columns in enumerate(families):
                    self.assertEqual(len(columns), dim * dim, f"family {family}")

    def test_columns_stay_inside_the_matrix(self):
        for dim in SIZES:
            spec = spec_for(dim)
            with self.subTest(dim=dim):
                for r in range(dim):
                    for c in range(dim):
                        for v in range(dim):
                            for col in spec.constraint_cols(r, c, v):
                                self.assertGreaterEqual(col, 0)
                                self.assertLess(col, spec.num_cols)

    def test_column_families_do_not_overlap(self):
        for dim in SIZES:
            spec = spec_for(dim)
            with self.subTest(dim=dim):
                cols = spec.constraint_cols(dim - 1, dim - 1, dim - 1)
                self.assertEqual(len(set(cols)), 4)

    def test_boxes_partition_the_grid_evenly(self):
        for dim in SIZES:
            spec = spec_for(dim)
            with self.subTest(dim=dim):
                counts: dict[int, int] = {}
                for r in range(dim):
                    for c in range(dim):
                        b = spec.box_of(r, c)
                        counts[b] = counts.get(b, 0) + 1
                self.assertEqual(len(counts), dim)
                self.assertEqual(set(counts.values()), {dim})

    def test_row_id_round_trips(self):
        for dim in SIZES:
            spec = spec_for(dim)
            with self.subTest(dim=dim):
                for rid in range(0, spec.num_rows, 7):
                    r, c, v = spec.decode_row(rid)
                    self.assertEqual(spec.row_id(r, c, v), rid)


class BoardHelperTests(SimpleTestCase):
    def test_check_board_rejects_bad_shape_and_values(self):
        spec = spec_for(9)
        with self.assertRaises(ValueError):
            spec.check_board([0] * 80)
        with self.assertRaises(ValueError):
            spec.check_board([10] + [0] * 80)
        with self.assertRaises(ValueError):
            spec.check_board([-1] + [0] * 80)

    def test_is_solved_rejects_incomplete_and_conflicting_grids(self):
        spec = spec_for(9)
        self.assertFalse(spec.is_solved([0] * 81))
        self.assertFalse(spec.is_solved([1] * 81))

    def test_peers_forbid_sees_row_column_and_box(self):
        spec = spec_for(9)
        board = [0] * 81
        board[0] = 5
        self.assertTrue(spec.peers_forbid(board, 8, 5))    # same row
        self.assertTrue(spec.peers_forbid(board, 72, 5))   # same column
        self.assertTrue(spec.peers_forbid(board, 10, 5))   # same box
        self.assertFalse(spec.peers_forbid(board, 40, 5))  # unrelated cell
