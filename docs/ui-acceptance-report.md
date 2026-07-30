# UI Acceptance Report (UI-B13)

Phase 4 implementation of the UI track (UI-B01 through UI-B14), measured
against the integrated build. Every PASS below was actually executed in this
session; nothing here is estimated. Items requiring a real browser, a screen
reader, a physical device, or human study participants are marked NOT RUN,
per AGENTS.md's PASS/FAIL/BLOCKED/NOT RUN classification -- an unmeasured
item is never written up as a pass.

## Three-runner execution (M-UI-B13-01)

| Runner | Result | Count | Duration |
|---|---|---|---|
| `node --test` (tests/js) | PASS | 193 tests, 0 failures | ~2.3s |
| `node tools/check-contrast.mjs` | PASS | 76 pairs, 0 failing | <1s |
| `python manage.py test game` | PASS | 87 tests, 0 failures | ~2.8s |

Working tree was inspected before measuring (`git status --short`); the diff
consists entirely of this implementation's own new/modified files, no
unrelated changes.

## Accessibility audit (M-UI-B13-02)

- **axe automated scan: NOT RUN.** This requires a real browser (or a
  headless one) running axe-core against the rendered page. No dependency
  was added to run one in this session (DEC-UI-02 forbids adding
  dependencies), and no browser is available in this environment.
- **Manual screen reader walkthrough: NOT RUN.** Requires a human with a
  screen reader (NVDA/JAWS/VoiceOver) confirming: single tab stop on the
  grid, arrow-key movement, accessible names carrying state, Tab leaving the
  non-modal note editor naturally, Tab staying trapped in a real dialog,
  silence on digit entry, and a single sticky-mode announcement per toggle.
- What **is** verified by automated test: `ui/board-view.js` never uses raw
  markup insertion (T-UI-B06-19), `ui/notes-view.js` never sets an
  ARIA-modal state (T-UI-B10-06), `ui/dialog-host.js` does apply `inert` to
  background elements and does restore focus on close (tests/js/dialog-host.test.mjs),
  and `boardHasFocus`/Tab-trap logic is unit-tested against a DOM stub.

## Lifecycle durability trial (M-UI-B13-03)

**PASS.** 100 simulated trials of "mutate, then pagehide before the 300ms
debounce would otherwise fire" -- 0 losses
(`tests/js/lifecycle-durability.test.mjs`). This exercises the real
`flushNow()` path that `bootstrap.js`'s pagehide listener calls, so it is a
faithful simulation of the durability contract rather than a proxy for it;
no browser was required to prove it.

## Codec round-trip and latency (M-UI-B13-04)

**PASS**, re-run in this session:
- 1,000 seeded random states: 100% round-trip success (`tests/js/url-codec.property.test.mjs`).
- Near-maximal payload decode: ~1.7ms, well under the 100ms ceiling.
- Environment: Node v24.14.0, `CompressionStream`/`DecompressionStream` available globally.

## Metric table and kill criteria (M-UI-B13-05)

| # | Metric | Result |
|---|---|---|
| 1 | node:test suite | PASS -- 193/193 |
| 2 | contrast gate | PASS -- 76/76 pairs, worst light 5.75:1, dark text 5.27:1, dark non-text 4.05:1 |
| 3 | Django suite | PASS -- 87/87 |
| 4 | Lifecycle durability (100 trials) | PASS -- 0 losses |
| 5 | Codec round-trip (1,000 trials) | PASS -- 100% |
| 6 | Codec decode latency (max payload) | PASS -- ~1.7ms < 100ms |
| 7 | axe critical violations | NOT RUN -- no browser available |
| 8 | Manual screen reader walkthrough | NOT RUN -- needs a human |
| 9 | Candidate legibility at 320/360/390px | NOT RUN -- computed sizes recorded (docs/legibility-record.md), human legibility judgment not made |

| Kill criterion (Phase 1 §13) | Status |
|---|---|
| Desktop quasimode error rate > sticky error rate | **NOT RUN** -- requires a usability study with participants (RR3) |
| Digit First tap reduction < 5% | **NOT RUN** -- requires a usability study |
| Touch sticky mode error rate >= 8% | **NOT RUN** -- requires a usability study |
| 9px candidate illegible at any of 320/360/390px | **CANNOT EVALUATE YET** -- computed sizes all meet the 9px floor (docs/legibility-record.md), but the legibility judgment itself needs a human on a device |
| VisualViewport covers the board for >=1 frame with the software keyboard open | **NOT RUN** -- requires a physical/emulated mobile device |

No kill criterion is reported as "triggered": three are blocked on a
usability study this session cannot run, and the fifth needs a device. None
of them are being silently assumed clear -- the table says NOT RUN, not PASS,
for all five.

## Legacy disposition (M-UI-B13-06)

Handled separately below, per the plan's requirement that legacy removal is
a distinct, explicitly-approved decision from the rest of acceptance.

### Legacy reference check

```
$ grep -rn "legacy/" game/templates game/static/game/js
(no output)
```

No template or JS module under `game/static/game/js` references
`legacy/game.js` or `legacy/style.css`. The reference count is genuinely
zero, matching V-UI-B13-06's precondition for asking about removal.

**No removal has been performed.** Per DEC-UI-05 and this block's own rule,
legacy files are only removed after the user's explicit approval, asked for
separately from this report.
