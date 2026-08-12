# APEX Whitetail payout calculator — handoff

Everything below is current as of the end of the previous session.

## Where things live

| What | Where |
|---|---|
| Working branch | `feat/config-driven-payouts` on `github.com/furiae/whitetail-payout-calculator` (a fork) |
| Pull request | jdno7/whitetail-payout-calculator PR #1 — open, unmerged |
| Live demo | https://furiae.github.io/whitetail-payout-calculator/ (auto-deploys from the branch) |
| Upstream | `jdno7/whitetail-payout-calculator` — Chris has **pull-only** access, cannot push or open PRs via API |
| Staging site | https://whitetailstage.apexoutdoorrewards.com (WP Engine, Astra Child Theme, Elementor, 29 plugins) |

The repo root is the original calculator (rewritten). `wordpress/` holds the
WordPress build. Test suites live in the scratchpad, not the repo.

## The engine

`payoutConfig.js` holds every tunable number; `whitetailCalcV4.js` is the
machinery. `buildBoard(entries, fee)` returns `{topRows, outsideRows,
specialRows, revenue, hunterPayout, grossMargin, marginPercent, model}` where
each row is `{label, amount, seats}`.

### Rules currently in force — all agreed with Chris, do not change silently

- **Entry fee $225**, sellout **2,500 entries**. Both are the defaults.
- **Margin**: 30% up to 50 entries, sliding to 35% by 100 entries, 35% above.
  `marginFlex` 0.02 lets it dip to give rounding money back to hunters.
- **Every prize is a multiple of $50** (`payoutIncrement`).
- **No prize below 2× the entry fee** ($450). Chris called this unbreakable.
  A prize that cannot reach the floor is *dropped*, never topped up — topping
  up is what made the old calculator pay out more than it collected.
- **At least $100 between adjacent places** (`minPlaceGap`), 1st through 75th.
  Does not apply to Special Harvest.
- **Top-ten caps**: 25000, 22500, 20500, 18500, 16500, 15000, 13500, 12500,
  11000, 10000. Money over a cap flows to the other boards, never to the house.
- **Special Harvest caps**: point classes $5,000 each; milestones step down
  $500 at a time from $4,500 (100th) to $1,000 (1250th).
- **The four point classes are always equal and all-or-nothing** — four prizes
  or none.
- **11th must be strictly below 10th**, never equal.
- **Outside the top ten never pays past 75th place.** Hard limit.
- **One paid place per 5 hunters**, continuing past 10th so 11th cannot exist
  before 10th.
- Purse split 55 / 31 / 14 (top ten / outside / special), renormalised over
  whichever boards are actually paying.

At 2,500 × $225: revenue $562,500, payout $365,650, **margin 35%**, 63 prizes,
deepest place 51st.

### Test suites (scratchpad, not committed)

`invariants-test.js` covers all eleven rules in one sweep and is the one to run
first. Also `smooth-test`, `special-test`, `inc-test`, `cap-test`, `order-test`,
`floor-test`, `econ-test`, `dom-test` (needs `npm i jsdom`). Margin assertions
are scoped to the $225 operating fee deliberately — a strictly descending $50
ladder cannot always absorb the purse at other fees, and tuning for prices the
contest does not charge would cost paid places at the one it does.

A board takes ~15ms to build, so the big sweeps step through entry counts.

## WordPress: what is installed

In `wp-content/themes/astra-child-theme/`:

- `page-payout-calculator.php` — "Payout Calculator" page template, assigned to
  page **33740** (published). Works.
- `assets/apex-payout-calculator.js` — the engine, plus a one-line
  `window.ApexPayouts = { buildBoard }` export.
- `assets/apex-payout-calculator.css` — layout only; Astra supplies the rest.
- `assets/apex-home-rewards.js` — home page view layer. **Uploaded but NOT
  active.**
- `apex-payout-calculator.php` — enqueue file. **Uploaded but NOT active.**

`functions.php` is back to its original 36,139 bytes — the `require_once` line
was removed. Nothing the previous session built is currently running on the
home page.

## The remaining job

Wire the home page REWARDS CALCULATOR (page **52**, Elementor) to the engine.
Chris approved a mockup; build to match it exactly.

### Approved design

- Two columns: **1st–25th left, 26th–51st right**. Not "top ten" vs "11th–70th".
- The right column is mirrored — value on the left, bar filling from the right.
- First five rows of **each** column use the red ramp, the rest grey:
  `rgb(130,0,4)`, `rgb(162,0,5)`, `rgb(198,28,33)`, `rgb(223,19,28)`,
  `rgb(239,55,60)`, then `rgb(202,202,202)`. Value text matches its bar.
- **Bar width is decorative, not a chart of the money**: it tapers evenly by
  rank from 100% on the top row to 33% on the last, per column. Chris asked for
  this so the shortest bar does not crowd its value.
- Special Harvest keeps full-width bars in three groups of four:
  points `rgb(161,0,4)`, 100th–400th `rgb(223,19,28)`,
  500th–1250th `rgb(241,72,72)`.
- Headings still say "TOP TEN SCORES" and "SCORES 11TH - 70TH". Chris is
  rewording them himself in Elementor — leave the heading widgets alone.

The mockup generator is in the scratchpad session log; regenerate from
`buildBoard(2500, 225)` if needed.

### Existing markup on page 52

```
.progress-con                          one row
  .progress / .progress-2                bar wrapper
    span                                 the label
    .progress_bar.progress_bar_animate   the bar
  .{key}.progress-content                the value
```

Value element classes: `progress-content` (1st–10th), `-2` (outside),
`-3` (10PT, 9PT, 8PT, 7PT), `-4` (100th–400th), `-5` (500th–1250th). The key
class matches the engine's row labels exactly, which is why writing by key works.

**Three responsive copies of the section exist** (`f3d97df`, `fe96e71`,
`48fb42b2`); all must be updated, only one is visible at a time.

Band dropdown: `ul.new-dropdown-payout span` shows the current value,
`ul.show-click-btm li` holds the ten options (50, 100, 150, 200, 250, 500, 750,
1000, 1500, 2500).

### Do not dequeue submit-score.js

`wp-content/plugins/apex-competitions-controller/assets/submit-score.js` holds
the old hardcoded payout branches, but it **also** runs the score-submission
popup, the step carousel, the measurement calculator and the video widget —
all present on the home page. Dequeuing it breaks score submission.

It binds the band dropdown **directly** to the list items, not delegated, so
`jQuery('ul.show-click-btm li').off('click')` removes that one handler and
leaves everything else alone. That is the approach.

### Mistake to avoid

The previous session selected row containers with `.elementor-column`. An outer
nested column contains **both** lists, so clearing it wiped the top ten and
destroyed the design on the live page. Derive the container from the rows
themselves — the direct parent of a `.progress-con` holding the relevant value
class — and mark it so it can be found again after its rows are replaced.

Chris loves this page. Build changes as a static mockup or on a duplicate page
first; do not iterate on the live home page.

## Environment gotchas

- **The whole staging front end redirects to `/?home`.** Every page, including
  `/rules/` and `/faq/`, logged in or out. Pre-existing, not caused by this
  work. The child theme and mu-plugins are clean; `.htaccess` is not readable
  through File Manager. Likely a plugin or a WP Engine staging setting. This is
  why `/payout-calculator/` cannot be viewed. The home page itself renders.
- **File Manager** is at `admin.php?page=file_manager_advanced_ui` (elFinder).
  Drive it through its JS API rather than the UI. Hashes are
  `'l1_' + base64url(relative path)` — no leading slash, e.g.
  `wp-content/themes`. Use `cmd:'ls'`, `mkfile`, `mkdir`, and `put` with
  `options:{type:'post'}` for writes.
- **raw.githubusercontent.com serves stale copies to the browser** even with
  cache-busting, while curl gets the fresh one. Verify byte counts after every
  upload, or transfer file contents directly rather than fetching from GitHub.
- **The browser JS tool blocks output containing URLs or query strings.**
  Redact or return structural summaries instead of raw file contents.
- Chrome is connected via the Claude in Chrome extension and Chris is logged
  into WP admin. The in-app browser cannot reach localhost or script `file://`.

## Settled — do not re-ask

- **The staging redirect to `/?home` does not matter.** The work is on the home
  page, which renders. `/payout-calculator/` being unreachable is accepted, and
  PR #1 sitting unmerged is accepted. Neither blocks anything.
- **Column headings**: Chris will handle the wording himself in Elementor.
  Leave the heading widgets alone — touch only the rows and their values.

## Scope of the remaining job, precisely

Only the home page (page 52) matters. Render into the existing rows on all
three responsive copies of the section, wire the ten dropdown bands to
`buildBoard(band, 225)`, and leave every heading, caption and surrounding
widget exactly as it is.
