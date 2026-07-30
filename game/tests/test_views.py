"""HTTP-level contract for the views: shell delivery.

Static ESM delivery (main.js served with a JavaScript MIME type) is verified
manually against the dev server (T-UI-B01-11) -- the test Client does not run
requests through StaticFilesHandler, so it never resolves /static/... URLs the
way `runserver` does.
"""
from __future__ import annotations

from unittest.mock import patch

from django.test import SimpleTestCase
from django.urls import reverse


class IndexShellTests(SimpleTestCase):
    def test_viewport_meta_present(self):
        html = self.client.get(reverse("game:index")).content.decode()
        self.assertIn('name="viewport"', html)

    def test_entry_script_is_a_module(self):
        html = self.client.get(reverse("game:index")).content.decode()
        self.assertIn('type="module"', html)
        self.assertNotIn("js/game.js", html)

    def test_every_stylesheet_is_linked(self):
        """The shell shipped once with no stylesheet link at all, so the board
        rendered unstyled and the screen-reader live region was visible."""
        html = self.client.get(reverse("game:index")).content.decode()
        for name in ("tokens.css", "layout.css", "board.css", "chrome.css"):
            self.assertIn(f"game/css/{name}", html)

    def test_response_has_no_puzzle_or_solution_data(self):
        html = self.client.get(reverse("game:index")).content.decode()
        self.assertNotIn("puzzle-data", html)
        self.assertNotIn("solution-data", html)

    def test_index_does_not_generate_a_puzzle(self):
        with patch("game.views.generator.generate_puzzle") as mocked:
            self.client.get(reverse("game:index"))
        mocked.assert_not_called()


class NewPuzzleContractTests(SimpleTestCase):
    """Pins the response shape DX-B06's cache-first lookup must also produce (CT-02)."""

    def test_response_keys_are_exactly_puzzle_and_solution(self):
        response = self.client.get(reverse("game:new_puzzle"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.json().keys()), {"puzzle", "solution"})
