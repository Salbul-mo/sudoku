"""instrument() and workload() -- the measurement primitives DX-B02..DX-B05 rely on.

Not benchmarks.main() itself: that section is slow and reports numbers rather
than asserting them, so its manual output is checked in DX-B01's validation
notes instead of here.
"""
from __future__ import annotations

from django.test import SimpleTestCase

from game.sudoku import generator, solver
from game.sudoku.dlx import DancingLinks
from game.tests import benchmarks


class InstrumentTests(SimpleTestCase):
    def test_original_functions_are_restored_on_normal_exit(self):
        originals = (
            DancingLinks._apply_row, DancingLinks.givens, DancingLinks.search,
            solver.alternative_exists, generator.alternative_exists,
        )
        with benchmarks.instrument():
            pass
        restored = (
            DancingLinks._apply_row, DancingLinks.givens, DancingLinks.search,
            solver.alternative_exists, generator.alternative_exists,
        )
        for original, current in zip(originals, restored):
            self.assertIs(original, current)

    def test_original_functions_are_restored_even_if_the_block_raises(self):
        original_alt = solver.alternative_exists
        with self.assertRaises(ValueError):
            with benchmarks.instrument():
                raise ValueError("boom")
        self.assertIs(solver.alternative_exists, original_alt)

    def test_nested_instrument_raises_and_the_outer_block_still_restores(self):
        original_alt = solver.alternative_exists
        with benchmarks.instrument():
            with self.assertRaises(RuntimeError):
                with benchmarks.instrument():
                    pass
        self.assertIs(solver.alternative_exists, original_alt)

    def test_generator_alternative_exists_is_also_replaced_during_instrument(self):
        # EF1: generator imports the name directly, so patching solver's
        # attribute alone would leave generator.dig_holes calling the original.
        original = generator.alternative_exists
        with benchmarks.instrument():
            self.assertIsNot(generator.alternative_exists, original)
            self.assertIs(generator.alternative_exists, solver.alternative_exists)
        self.assertIs(generator.alternative_exists, original)

    def test_instrument_actually_counts_a_known_workload(self):
        with benchmarks.instrument() as acc:
            benchmarks.workload(dim=9, trials=3, seed=1)
        counts = acc.snapshot()
        self.assertGreater(counts.givens_enter, 0)
        self.assertGreater(counts.apply_row, 0)
        self.assertGreater(counts.search, 0)
        self.assertGreaterEqual(counts.alternative_calls, 0)


class WorkloadTests(SimpleTestCase):
    def test_same_arguments_produce_identical_results(self):
        first = benchmarks.workload(dim=9, trials=3, seed=42)
        second = benchmarks.workload(dim=9, trials=3, seed=42)
        self.assertEqual(first, second)

    def test_rejects_zero_trials(self):
        with self.assertRaises(ValueError):
            benchmarks.workload(dim=9, trials=0, seed=1)

    def test_rejects_an_unsupported_dimension(self):
        with self.assertRaises(ValueError):
            benchmarks.workload(dim=0, trials=1, seed=1)
