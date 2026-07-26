"""A deliberately naive Sudoku solver used as a test oracle.

This shares no code with the DLX engine: it is plain backtracking over
row/column/box bitmasks, and it recurses.  Being structurally different is the
point -- an oracle that reused the exact-cover machinery could not catch a bug
in the exact-cover machinery.

It is slow, so tests use it on 9x9 boards and on larger grids only when they
are close to complete.
"""
from __future__ import annotations

from game.sudoku.spec import SudokuSpec


def count_solutions(board: list[int], spec: SudokuSpec, limit: int = 2) -> int:
    """Count solutions of ``board`` up to ``limit``."""
    dim = spec.dim
    rows = [0] * dim
    cols = [0] * dim
    boxes = [0] * dim
    empty: set[int] = set()

    for index, value in enumerate(board):
        r, c = divmod(index, dim)
        if value:
            bit = 1 << (value - 1)
            b = spec.box_of(r, c)
            if rows[r] & bit or cols[c] & bit or boxes[b] & bit:
                return 0  # the clues already contradict each other
            rows[r] |= bit
            cols[c] |= bit
            boxes[b] |= bit
        else:
            empty.add(index)

    full = (1 << dim) - 1
    found = 0

    def recurse() -> bool:
        """Returns True once ``limit`` solutions have been seen."""
        nonlocal found
        if not empty:
            found += 1
            return found >= limit

        # Most-constrained cell first, otherwise this is unusably slow.
        best = -1
        best_mask = 0
        best_count = dim + 1
        for index in empty:
            r, c = divmod(index, dim)
            available = full & ~(rows[r] | cols[c] | boxes[spec.box_of(r, c)])
            n = available.bit_count()
            if n < best_count:
                best, best_mask, best_count = index, available, n
                if n <= 1:
                    break
        if best_count == 0:
            return False

        r, c = divmod(best, dim)
        b = spec.box_of(r, c)
        empty.discard(best)
        mask = best_mask
        while mask:
            bit = mask & -mask
            mask ^= bit
            rows[r] |= bit
            cols[c] |= bit
            boxes[b] |= bit
            if recurse():
                rows[r] ^= bit
                cols[c] ^= bit
                boxes[b] ^= bit
                empty.add(best)
                return True
            rows[r] ^= bit
            cols[c] ^= bit
            boxes[b] ^= bit
        empty.add(best)
        return False

    recurse()
    return found


def is_valid_solution(board: list[int], spec: SudokuSpec) -> bool:
    """Independent completeness check (does not call into ``spec.is_solved``)."""
    dim = spec.dim
    expected = set(range(1, dim + 1))
    if len(board) != dim * dim:
        return False
    rows: list[list[int]] = [[] for _ in range(dim)]
    cols: list[list[int]] = [[] for _ in range(dim)]
    boxes: list[list[int]] = [[] for _ in range(dim)]
    for index, value in enumerate(board):
        r, c = divmod(index, dim)
        rows[r].append(value)
        cols[c].append(value)
        boxes[(r // spec.box_h) * (dim // spec.box_w) + (c // spec.box_w)].append(value)
    return all(set(group) == expected for group in rows + cols + boxes)
