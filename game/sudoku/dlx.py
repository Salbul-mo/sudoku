"""Dancing Links (Algorithm X) over flat integer lists, searched iteratively.

Two things differ from the textbook implementation.

**Nodes are integers, not objects.**  A node is an index into six parallel
lists, so ``node.right.up`` becomes ``U[R[i]]``.  This removes one Python object
and one generator frame per link traversal, which profiling showed to be the
real cost: a single 9x9 uniqueness check drove 458,580 generator calls in the
object-based version.  Plain ``list`` beats ``array('i')`` here by ~40% because
``array`` re-boxes an int on every read and our indices are far outside
CPython's small-int cache.

**The search is a loop, not a recursion.**  Depth-first search is expressed as a
three-state machine over an explicit stack, so there is no recursion limit to
raise, the traversal position is plain data that can be inspected or resumed,
and progress can be bounded by an iteration budget.

Because every Sudoku candidate row covers exactly four constraints, the node
count is known before building (``1 + 4*dim**2 + 4*dim**3``) and all lists are
preallocated: 3,241 nodes for 9x9 and 17,409 for 16x16.
"""
from __future__ import annotations

import random
from contextlib import contextmanager
from typing import Iterator, NamedTuple

from .spec import SudokuSpec, spec_for

#: Iteration ceilings per dimension.  These are safety valves against pathological
#: search trees, not tuning knobs -- see :func:`default_budget`.
_BUDGETS: dict[int, int] = {
    9: 200_000,
    12: 1_000_000,
    16: 5_000_000,
}


def default_budget(spec: SudokuSpec) -> int:
    """Maximum search iterations allowed for ``spec``.

    Sized off the tail of the observed distribution, not its median, because the
    two are far apart.  Over 200 uniqueness checks per size at "hard" clue
    counts (``game.tests.benchmarks.iteration_distribution``):

    ====== ======= ======== ========= ========== =========
    size   median  p95      max       budget     headroom
    ====== ======= ======== ========= ========== =========
    9x9    146     253      404       200,000    495x
    12x12  251     738      2,218     1,000,000  451x
    16x16  921     20,878   185,264   5,000,000  27x
    ====== ======= ======== ========= ========== =========

    The engine sustains ~1.07M iterations/sec, so these ceilings bound a single
    check to roughly 0.2s, 0.9s and 4.7s respectively -- the point of the valve
    is to make that worst case finite, not to be reached.

    Callers must treat an exhausted budget as "not proven", never as an answer;
    see :class:`SearchOutcome` and :class:`~game.sudoku.solver.Uniqueness`.
    """
    known = _BUDGETS.get(spec.dim)
    if known is not None:
        return known
    return 300 * spec.num_rows


class SearchOutcome(NamedTuple):
    """Result of one :meth:`DancingLinks.search` call.

    ``budget_exceeded`` means the search stopped early and ``count`` is a lower
    bound only.  It never means "no solution".
    """

    count: int
    rows: list[int]
    iterations: int
    budget_exceeded: bool


class DancingLinks:
    """Exact-cover matrix for one puzzle size, reusable across many searches.

    The matrix is built once for an *empty* board and holds every candidate row.
    A concrete puzzle is layered on top with :meth:`givens`, which covers the
    columns fixed by the clues and restores them afterwards.  That turns the
    per-check cost from ``O(dim**3)`` node insertions into ``O(givens * 4)``
    covers; profiling attributed ~50% of every uniqueness check to rebuilding.

    Instances are **not** thread-safe: a search mutates the links in place.
    :mod:`game.sudoku.solver` keeps one instance per thread.
    """

    __slots__ = ("spec", "_L", "_R", "_U", "_D", "_COL", "_ROW", "_SIZE",
                 "_row_head", "_num_cols", "_max_depth")

    def __init__(self, spec: SudokuSpec | int = 9) -> None:
        self.spec = spec = spec_for(spec)
        dim = spec.dim
        num_cols = self._num_cols = spec.num_cols
        num_rows = spec.num_rows
        # root + one header per column + four body nodes per candidate row
        size = 1 + num_cols + 4 * num_rows

        self._L = L = [0] * size
        self._R = R = [0] * size
        self._U = U = [0] * size
        self._D = D = [0] * size
        self._COL = COL = [0] * size
        self._ROW = ROW = [-1] * size
        self._SIZE = SIZE = [0] * size
        self._max_depth = spec.cells + 1

        # Node 0 is the root; nodes 1..num_cols are column headers.
        for c in range(1, num_cols + 1):
            L[c] = c - 1
            R[c] = c + 1 if c < num_cols else 0
            U[c] = D[c] = c
            COL[c] = c
        L[0] = num_cols
        R[0] = 1

        # Body.  Rows are appended in order, so each node goes to the bottom of
        # its column in O(1) -- the old builder scanned the column to find the
        # insertion point, which made it the single hottest function.
        self._row_head = row_head = [0] * num_rows
        n = num_cols + 1
        for r in range(dim):
            for c in range(dim):
                for v in range(dim):
                    rid = spec.row_id(r, c, v)
                    row_head[rid] = first = n
                    for k, col0 in enumerate(spec.constraint_cols(r, c, v)):
                        col = col0 + 1  # headers are 1-based; column 0 is the root
                        U[n] = U[col]
                        D[n] = col
                        D[U[col]] = n
                        U[col] = n
                        SIZE[col] += 1
                        COL[n] = col
                        ROW[n] = rid
                        L[n] = n - 1 if k else first + 3
                        R[n] = n + 1 if k < 3 else first
                        n += 1

    # ------------------------------------------------------------- primitives
    def cover(self, c: int) -> None:
        """Unlink column ``c`` and every row that intersects it."""
        L, R, U, D = self._L, self._R, self._U, self._D
        COL, SIZE = self._COL, self._SIZE
        R[L[c]] = R[c]
        L[R[c]] = L[c]
        i = D[c]
        while i != c:
            j = R[i]
            while j != i:
                U[D[j]] = U[j]
                D[U[j]] = D[j]
                SIZE[COL[j]] -= 1
                j = R[j]
            i = D[i]

    def uncover(self, c: int) -> None:
        """Exact inverse of :meth:`cover`, applied in reverse order."""
        L, R, U, D = self._L, self._R, self._U, self._D
        COL, SIZE = self._COL, self._SIZE
        i = U[c]
        while i != c:
            j = L[i]
            while j != i:
                SIZE[COL[j]] += 1
                U[D[j]] = j
                D[U[j]] = j
                j = L[j]
            i = U[i]
        R[L[c]] = c
        L[R[c]] = c

    def _is_active(self, c: int) -> bool:
        """True while column ``c`` is still linked into the header list."""
        return self._R[self._L[c]] == c

    # ----------------------------------------------------------------- givens
    def _apply_row(self, rid: int, applied: list[int]) -> bool:
        """Force candidate row ``rid`` into the solution by covering its columns.

        Returns ``False`` if one of those columns is already covered, which
        means the clues contradict each other (the same value twice in a row,
        column or box).  Columns covered before the clash are recorded in
        ``applied`` so the caller can still unwind.
        """
        R, COL = self._R, self._COL
        head = self._row_head[rid]
        j = head
        while True:
            col = COL[j]
            if not self._is_active(col):
                return False
            j = R[j]
            if j == head:
                break
        j = head
        while True:
            col = COL[j]
            self.cover(col)
            applied.append(col)
            j = R[j]
            if j == head:
                break
        return True

    @contextmanager
    def givens(self, board: list[int]) -> Iterator[bool]:
        """Layer ``board``'s clues onto the matrix for the duration of the block.

        Yields ``False`` if the clues are mutually contradictory, in which case
        the puzzle has no solution and no search is worth running.  The matrix
        is restored on the way out, including when the body raises.
        """
        spec = self.spec
        dim = spec.dim
        applied: list[int] = []
        consistent = True
        try:
            for index, value in enumerate(board):
                if not value:
                    continue
                r, c = divmod(index, dim)
                if not self._apply_row(spec.row_id(r, c, value - 1), applied):
                    consistent = False
                    break
            yield consistent
        finally:
            for col in reversed(applied):
                self.uncover(col)

    # ----------------------------------------------------------------- search
    def search(
        self,
        limit: int = 1,
        budget: int | None = None,
        randomize: bool = False,
        rng: random.Random | None = None,
        collect: bool = True,
    ) -> SearchOutcome:
        """Explore the matrix iteratively, stopping after ``limit`` solutions.

        The traversal is a three-state machine over two stacks:

        ``stack_col[d]``    the column chosen at depth ``d``
        ``stack_node[d]``   the candidate currently being tried there
        ``stack_start[d]``  where the scan of that column began

        ``DESCEND`` picks the column with the fewest candidates and covers it.
        ``ADVANCE`` undoes the candidate in play and steps to the next one,
        which is exactly the "fall back to the next node to try" behaviour that
        recursion normally gets for free.  ``BACKTRACK`` pops a level.  The
        stacks are the entire search position, so nothing is held on the Python
        call stack.

        The matrix is always returned to its entry state, on every exit path.
        """
        if limit < 1:
            raise ValueError(f"limit must be >= 1, got {limit}")
        if budget is None:
            budget = default_budget(self.spec)
        if randomize and rng is None:
            rng = random.Random()

        L, R, U, D = self._L, self._R, self._U, self._D
        COL, ROW, SIZE = self._COL, self._ROW, self._SIZE
        depth_limit = self._max_depth
        stack_col = [0] * depth_limit
        stack_node = [0] * depth_limit
        stack_start = [0] * depth_limit

        DESCEND, ADVANCE, BACKTRACK = 0, 1, 2
        state = DESCEND
        depth = 0
        count = 0
        iterations = 0
        solution: list[int] = []

        while True:
            iterations += 1
            if iterations > budget:
                # In ADVANCE the column at `depth` is already covered, so that
                # level has to come off too; in the other states `depth` is
                # still untouched and only the levels below it are open.
                self._unwind(stack_col, stack_node,
                             depth + 1 if state == ADVANCE else depth)
                return SearchOutcome(count, solution, iterations, True)

            if state == DESCEND:
                if R[0] == 0:  # every column covered -> exact cover found
                    count += 1
                    if collect and not solution:
                        solution = [ROW[stack_node[d]] for d in range(depth)]
                    if count >= limit:
                        self._unwind(stack_col, stack_node, depth)
                        return SearchOutcome(count, solution, iterations, False)
                    state = BACKTRACK
                    continue

                # MRV: fewest candidates first.  A column of size 1 is forced,
                # so nothing can beat it and the scan stops early.
                best = R[0]
                best_size = SIZE[best]
                j = R[best]
                while j != 0:
                    s = SIZE[j]
                    if s < best_size:
                        best, best_size = j, s
                        if s <= 1:
                            break
                    j = R[j]

                if best_size == 0:  # dead end: an unsatisfiable constraint
                    state = BACKTRACK
                    continue

                self.cover(best)
                stack_col[depth] = best
                if randomize:
                    start = D[best]
                    for _ in range(rng.randrange(best_size)):
                        start = D[start]
                else:
                    start = D[best]
                stack_start[depth] = start
                stack_node[depth] = best  # header doubles as "nothing tried yet"
                state = ADVANCE

            elif state == ADVANCE:
                col = stack_col[depth]
                node = stack_node[depth]
                if node != col:
                    j = L[node]  # undo in reverse of the covering order
                    while j != node:
                        self.uncover(COL[j])
                        j = L[j]
                    node = D[node]
                    if node == col:  # skip the header when wrapping around
                        node = D[col]
                    if node == stack_start[depth]:  # full cycle -> exhausted
                        self.uncover(col)
                        state = BACKTRACK
                        continue
                else:
                    node = stack_start[depth]

                stack_node[depth] = node
                j = R[node]
                while j != node:
                    self.cover(COL[j])
                    j = R[j]
                depth += 1
                state = DESCEND

            else:  # BACKTRACK
                depth -= 1
                if depth < 0:
                    return SearchOutcome(count, solution, iterations, False)
                state = ADVANCE

    def _unwind(self, stack_col: list[int], stack_node: list[int], depth: int) -> None:
        """Undo every covered level so the matrix matches its pre-search state."""
        L, COL = self._L, self._COL
        while depth > 0:
            depth -= 1
            node = stack_node[depth]
            col = stack_col[depth]
            if node != col:
                j = L[node]
                while j != node:
                    self.uncover(COL[j])
                    j = L[j]
            self.uncover(col)

    # ------------------------------------------------------------ diagnostics
    def snapshot(self) -> tuple[list[int], ...]:
        """Copy of the link state, for asserting the matrix was restored."""
        return (list(self._L), list(self._R), list(self._U),
                list(self._D), list(self._SIZE))

    def active_columns(self) -> int:
        count = 0
        c = self._R[0]
        while c != 0:
            count += 1
            c = self._R[c]
        return count

    def is_pristine(self) -> bool:
        """True if no column is currently covered."""
        return self.active_columns() == self._num_cols
