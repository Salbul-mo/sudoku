# Candidate legibility record (RK3 kill-criterion evidence, UI-B08)

RK3 is an unverified hypothesis with a kill criterion attached: if candidate
digits are illegible at narrow mobile widths, Phase 1's layout must be
reconsidered. This record supplies the computed inputs to that judgment. The
**px column is arithmetic** from `.candidate { font-size: max(9px, 24cqi) }`
against `.board { inline-size: calc(100vw - 16px) }` (layout.css's narrow
breakpoint, ≤599px) and is reproducible from the committed CSS. The
**legibility column is not** -- it requires a human reading real rendered
text on a real or emulated device, which this session has no way to perform.

| viewport width | board width | cell width | computed candidate size | legibility |
|---|---|---|---|---|
| 320px | 304px | 33.78px | 9.00px (floor) | NOT RUN -- needs device confirmation |
| 360px | 344px | 38.22px | 9.17px | NOT RUN -- needs device confirmation |
| 390px | 374px | 41.56px | 9.97px | NOT RUN -- needs device confirmation |

## What this does and does not establish

- The `max(9px, 24cqi)` floor holds at all three widths: no computed size
  falls below 9px, which is the number the plan's own validation targets
  (V-UI-B08-04). That part is a verified fact about the CSS, not a guess.
- Whether 9.00px of a digit glyph is actually *legible* to a person -- as
  opposed to merely present at that size -- is a perceptual judgment this
  record does not make. Per AGENTS.md's validation classification, that part
  of V-UI-B08-04 is **NOT RUN**, not PASS, until someone reads it on a
  device and records legible / marginal / illegible per width.
- If that manual check finds any width illegible, RK3's kill criterion fires
  and the candidate-size approach goes back to Phase 1 for reconsideration
  (horizontal zoom, an alternate list view, or a larger floor) -- this record
  does not pre-empt that decision or silently redesign around it.

## How to complete this record

1. Open the app at 320, 360, and 390 CSS px (device emulation or a physical
   device), with a cell holding 4-5 candidates.
2. For each width, read the candidate digits without zooming and record
   legible / marginal / illegible, plus the device and browser zoom used.
3. Update the table above and remove this instruction section once complete.
