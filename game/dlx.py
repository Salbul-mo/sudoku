"""Dancing Links (Algorithm X) exact-cover solver.

Adapted from the toroidal doubly-linked-list implementation in
exact_cover_sudoku/python/dlinks_matrix.py, with two additions needed for
puzzle generation:
  - alg_x_search(randomize=True) shuffles candidate rows at each step so
    repeated searches on an empty grid produce different valid solutions.
  - count_solutions(limit) counts solutions up to `limit` and stops early,
    used to check whether a puzzle has a unique solution while digging holes.
"""
from __future__ import annotations
import random
from typing import Generator, Union


class DL_Matrix:
    def __init__(self, num_rows: int, num_cols: int) -> None:
        self.root: Node = Node(self, -1, -1)
        self.rows: list[Node] = [Node(self, row=i, col=-1) for i in range(num_rows)]
        self.cols: list[Node] = [Node(self, row=-1, col=i, count=0) for i in range(num_cols)]
        for i, node in enumerate(self.rows):
            node.right = node
            node.left = node
            node.down = self.rows[i + 1] if i < len(self.rows) - 1 else self.root
            node.up = self.rows[i - 1] if i > 0 else self.root
        for i, node in enumerate(self.cols):
            node.up = node
            node.down = node
            node.right = self.cols[i + 1] if i < len(self.cols) - 1 else self.root
            node.left = self.cols[i - 1] if i > 0 else self.root
        self.root.right = self.cols[0]
        self.root.left = self.cols[-1]
        self.root.down = self.rows[0]
        self.root.up = self.rows[-1]

    def select_min_col(self) -> Node:
        min_node = self.root.right
        min_count = self.root.right.count
        for col in self.root.itr_right():
            if col.count < min_count:
                min_node = col
                min_count = col.count
        return min_node

    @staticmethod
    def cover(node: Node) -> None:
        col = node.get_col()
        col.right.left = col.left
        col.left.right = col.right
        for col_itr in col.itr_down():
            for row_itr in col_itr.itr_right():
                row_itr.up.down = row_itr.down
                row_itr.down.up = row_itr.up
                row_itr.get_col().count -= 1

    @staticmethod
    def uncover(node: Node) -> None:
        col = node.get_col()
        for col_itr in col.itr_up():
            for row_itr in col_itr.itr_left():
                row_itr.up.down = row_itr
                row_itr.down.up = row_itr
                row_itr.get_col().count += 1
        col.right.left = col
        col.left.right = col

    # search matrix for an exact cover; returns list of matrix rows for one solution
    def alg_x_search(self, randomize: bool = False) -> list[int]:
        solution: list[int] = []
        found: list[bool] = [False]

        def search() -> bool:
            if self.is_empty():
                found[0] = True
                return True

            selected_col = self.select_min_col()
            if selected_col.count < 1:
                return False

            candidates = list(selected_col.itr_down())
            if randomize:
                random.shuffle(candidates)

            for col_itr in candidates:
                solution.append(col_itr.row)
                for sol_node in col_itr.itr_right(excl=False):
                    if sol_node.col >= 0:
                        DL_Matrix.cover(sol_node)

                if search():
                    return True

                solution.pop()
                for sol_node in col_itr.left.itr_left(excl=False):
                    if sol_node.col >= 0:
                        DL_Matrix.uncover(sol_node)
            return False

        search()
        return solution if found[0] else []

    # count solutions up to `limit`, stopping early once reached (for uniqueness checks)
    def count_solutions(self, limit: int = 2) -> int:
        count = [0]

        def search() -> None:
            if count[0] >= limit:
                return
            if self.is_empty():
                count[0] += 1
                return

            selected_col = self.select_min_col()
            if selected_col.count < 1:
                return

            for col_itr in list(selected_col.itr_down()):
                for sol_node in col_itr.itr_right(excl=False):
                    if sol_node.col >= 0:
                        DL_Matrix.cover(sol_node)

                search()

                for sol_node in col_itr.left.itr_left(excl=False):
                    if sol_node.col >= 0:
                        DL_Matrix.uncover(sol_node)

                if count[0] >= limit:
                    return

        search()
        return count[0]

    def insert_node(self, row: int, col: int) -> None:
        assert row >= 0 and col >= 0 and row < len(self.rows) and col < len(self.cols)
        new_node = Node(self, row, col)

        n = self.root
        for n in self.rows[row].itr_right(excl=False):
            if n.right.col == -1 or n.right.col > col:
                break
        if n.col == col:
            return
        new_node.right = n.right
        new_node.left = n
        new_node.right.left = new_node
        n.right = new_node

        for n in self.cols[col].itr_down(excl=False):
            if n.down.row == -1 or n.down.row > row:
                break
        new_node.down = n.down
        new_node.up = n
        new_node.down.up = new_node
        n.down = new_node
        self.cols[col].count += 1

    def is_empty(self) -> bool:
        return self.root.right == self.root


class Node:
    def __init__(self, matrix: DL_Matrix, row: int, col: int, count: int = 1,
                 up: Union[Node, None] = None, down: Union[Node, None] = None,
                 left: Union[Node, None] = None, right: Union[Node, None] = None) -> None:
        self.row = row
        self.col = col
        self.count = count
        self.matrix = matrix
        self.up = up or self
        self.down = down or self
        self.left = left or self
        self.right = right or self

    def itr_up(self, excl: bool = True) -> Generator[Node, None, None]:
        itr = self
        if not excl:
            yield itr
        while itr.up != self:
            itr = itr.up
            yield itr

    def itr_down(self, excl: bool = True) -> Generator[Node, None, None]:
        itr = self
        if not excl:
            yield itr
        while itr.down != self:
            itr = itr.down
            yield itr

    def itr_left(self, excl: bool = True) -> Generator[Node, None, None]:
        itr = self
        if not excl:
            yield itr
        while itr.left != self:
            itr = itr.left
            yield itr

    def itr_right(self, excl: bool = True) -> Generator[Node, None, None]:
        itr = self
        if not excl:
            yield itr
        while itr.right != self:
            itr = itr.right
            yield itr

    def get_col(self) -> Node:
        if self.col == -1:
            return self.matrix.root
        return self.matrix.cols[self.col]
