# tests/js

Node-runnable specs for `game/static/game/js/`. Run from the repository root:

```
node --test "tests/js/*.test.mjs"
```

Pass the glob, not the directory: `node --test tests/js` fails with
`MODULE_NOT_FOUND` on this project's toolchain (verified on Node v24 for
Windows, from both Git Bash and PowerShell).

Most specs are DOM-free. The ones that mount views (`board-view-mount`,
`touch-controls`, `app-composition`, `bootstrap`, `dialog-host`) install
`helpers/fake-dom.mjs` first -- a minimal stand-in covering only the DOM
surface these modules actually touch, because DEC-UI-02 forbids adding a
dependency such as jsdom. What it cannot express (layout, computed style, real
focus and pointer behavior) is verified against a real browser separately and
reported as such; it is never silently assumed.

This directory is served by nothing: `STATICFILES_DIRS` is not configured at
all, and Django's app-directories finder only exposes `game/static/`. It is
unrelated to `game/tests/` (the Django/Python test package, collected
separately by `manage.py test`); the similar name is coincidental.
