"""Puzzle geometry for square Sudoku variants.

The previous implementation derived box geometry from ``sqrt(dim)``, which
silently breaks for any dimension that is not a perfect square: a 12x12 box is
4 wide and 3 tall, and no square-root formula can express that.  The old
``_box_constraint`` produced 176 distinct box columns for dim=12 (144 expected)
with indices up to 608 in a 576-column matrix, which tripped an assertion
inside the matrix builder.

``SudokuSpec`` carries box width and height explicitly instead, so 9, 12 and 16
all share one code path and every index is integer arithmetic.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

#: Number of constraint families: cell, row-value, column-value, box-value.
NUM_CONSTRAINTS = 4


@dataclass(frozen=True)
class SudokuSpec:
    """Geometry of a ``dim x dim`` grid divided into ``box_w x box_h`` boxes.

    Cells are addressed by a flat index ``r * dim + c``.  Values are 1-based in
    boards (``0`` means empty) but 0-based everywhere inside the solver.
    """

    dim: int
    box_w: int
    box_h: int

    def __post_init__(self) -> None:
        if self.dim < 1:
            raise ValueError(f"dim must be positive, got {self.dim}")
        if self.box_w < 1 or self.box_h < 1:
            raise ValueError(f"box dimensions must be positive, got {self.box_w}x{self.box_h}")
        if self.box_w * self.box_h != self.dim:
            raise ValueError(
                f"a {self.box_w}x{self.box_h} box does not tile a "
                f"{self.dim}x{self.dim} grid (needs box_w * box_h == dim)"
            )

    @classmethod
    def for_dim(cls, dim: int) -> "SudokuSpec":
        """Return the most-square box shape that tiles ``dim``.

        9 -> 3x3, 12 -> 4x3, 16 -> 4x4, 6 -> 3x2.  Boxes are never taller than
        they are wide, matching the usual convention for non-square variants.
        """
        if dim < 1:
            raise ValueError(f"dim must be positive, got {dim}")
        width = math.isqrt(dim)
        if width * width < dim:
            width += 1
        for w in range(width, dim + 1):
            if dim % w == 0:
                return cls(dim, w, dim // w)
        raise ValueError(f"no box shape tiles dim={dim}")  # pragma: no cover

    # ------------------------------------------------------------------ sizes
    @property
    def cells(self) -> int:
        return self.dim * self.dim

    @property
    def num_rows(self) -> int:
        """Candidate rows in the exact-cover matrix: one per (cell, value)."""
        return self.dim ** 3

    @property
    def num_cols(self) -> int:
        """Constraint columns: ``dim**2`` for each of the four families."""
        return NUM_CONSTRAINTS * self.dim * self.dim

    @property
    def boxes_per_band(self) -> int:
        """How many boxes sit side by side in one horizontal band."""
        return self.dim // self.box_w

    # ---------------------------------------------------------------- indices
    def box_of(self, r: int, c: int) -> int:
        return (r // self.box_h) * self.boxes_per_band + (c // self.box_w)

    def row_id(self, r: int, c: int, v: int) -> int:
        """Matrix row for "cell (r, c) holds value v", with ``v`` 0-based."""
        return (r * self.dim + c) * self.dim + v

    def decode_row(self, row_id: int) -> tuple[int, int, int]:
        """Inverse of :meth:`row_id`, returning ``(r, c, v)`` with ``v`` 0-based."""
        v = row_id % self.dim
        cell = row_id // self.dim
        return cell // self.dim, cell % self.dim, v

    def constraint_cols(self, r: int, c: int, v: int) -> tuple[int, int, int, int]:
        """The four columns covered by placing ``v`` at ``(r, c)``.

        Integer arithmetic only -- no floats, no ``sqrt``.
        """
        dim = self.dim
        block = dim * dim
        return (
            r * dim + c,                                          # cell occupied
            block + r * dim + v,                                  # value in row
            2 * block + c * dim + v,                              # value in column
            3 * block + self.box_of(r, c) * dim + v,              # value in box
        )

    # ------------------------------------------------------------ board utils
    def check_board(self, board: list[int]) -> None:
        """Raise ``ValueError`` if ``board`` is not a well-formed grid.

        Only shape and value range are checked; contradictory givens are a
        solver concern, not a shape concern.
        """
        if len(board) != self.cells:
            raise ValueError(f"board has {len(board)} cells, expected {self.cells}")
        for i, value in enumerate(board):
            if not isinstance(value, int) or isinstance(value, bool):
                raise ValueError(f"cell {i} is {value!r}, expected an int")
            if not 0 <= value <= self.dim:
                raise ValueError(f"cell {i} is {value}, expected 0..{self.dim}")

    def peers_forbid(self, board: list[int], index: int, value: int) -> bool:
        """True if ``value`` already appears in the row, column or box of ``index``.

        Used to skip hopeless candidates before handing them to the solver.
        """
        dim = self.dim
        r, c = divmod(index, dim)
        row_base = r * dim
        for cc in range(dim):
            if board[row_base + cc] == value and row_base + cc != index:
                return True
        for rr in range(dim):
            if board[rr * dim + c] == value and rr * dim + c != index:
                return True
        r0 = (r // self.box_h) * self.box_h
        c0 = (c // self.box_w) * self.box_w
        for rr in range(r0, r0 + self.box_h):
            for cc in range(c0, c0 + self.box_w):
                if board[rr * dim + cc] == value and rr * dim + cc != index:
                    return True
        return False

    def is_solved(self, board: list[int]) -> bool:
        """True if ``board`` is completely filled and violates no constraint."""
        if len(board) != self.cells:
            return False
        dim = self.dim
        complete = (1 << dim) - 1
        rows = [0] * dim
        cols = [0] * dim
        boxes = [0] * dim
        for i, value in enumerate(board):
            if not 1 <= value <= dim:
                return False
            r, c = divmod(i, dim)
            bit = 1 << (value - 1)
            b = self.box_of(r, c)
            if rows[r] & bit or cols[c] & bit or boxes[b] & bit:
                return False
            rows[r] |= bit
            cols[c] |= bit
            boxes[b] |= bit
        return all(m == complete for m in rows) and \
            all(m == complete for m in cols) and \
            all(m == complete for m in boxes)


#: Sizes the project ships with.  Any other dimension still works via
#: :meth:`SudokuSpec.for_dim`.
SPECS: dict[int, SudokuSpec] = {
    9: SudokuSpec(9, 3, 3),
    12: SudokuSpec(12, 4, 3),
    16: SudokuSpec(16, 4, 4),
}

DEFAULT_DIM = 9


def spec_for(dim_or_spec: int | SudokuSpec = DEFAULT_DIM) -> SudokuSpec:
    """Coerce a dimension (or an existing spec) into a :class:`SudokuSpec`."""
    if isinstance(dim_or_spec, SudokuSpec):
        return dim_or_spec
    spec = SPECS.get(dim_or_spec)
    if spec is None:
        spec = SudokuSpec.for_dim(dim_or_spec)
    return spec
