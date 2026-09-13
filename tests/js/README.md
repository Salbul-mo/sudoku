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

This directory is test-only and is not part of the Cloudflare Pages output.
The deployed site root remains `game/static/`.
