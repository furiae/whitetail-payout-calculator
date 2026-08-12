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
- `assets/apex-home-rewards.js` — home page view layer. The copy on staging is
  the **old** one. **Uploaded but NOT active.**
- `apex-payout-calculator.php` — enqueue file. **Uploaded but NOT active.**

`functions.php` is back to its original 36,139 bytes — the `require_once` line
was removed. Nothing the previous session built is currently running on the
home page.

## The remaining job — the code is written, nothing is deployed

`wordpress/assets/apex-home-rewards.js` in this repo is a full rewrite that
matches the approved design and passes `home-test.js` against the real page 52
markup at all ten bands. `wordpress/assets/apex-home-rewards.css` is new and
**must ship with it** (see "the bar has no height of its own" below).

What is left is deployment, and it is all in WordPress:

1. Upload `assets/apex-home-rewards.js` (replacing the old one),
   `assets/apex-home-rewards.css`, and `apex-payout-calculator.php` to
   `wp-content/themes/astra-child-theme/`.
2. Add the `require_once` line back to `functions.php` to activate the enqueue.
3. Reload the home page and step through all ten bands.

One design question is still open — see "Open questions" at the end.

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
- Headings **follow the band** (Chris, this session — this supersedes "Chris is
  rewording them himself in Elementor"). Each column is headed by the places it
  actually holds: "Scores 1st - 25th" / "Scores 26th - 51st" at a sellout,
  "Scores 1st - 8th" / "Scores 9th - 15th" at 250 hunters. The page carries two
  heading widgets per column worded differently on purpose — the large one
  includes "Scores", the `.text-small` one does not — and each keeps its own
  style. Reword via `HEADING_LONG` / `HEADING_SHORT` in `apex-home-rewards.js`.
  Every other heading, including "Special Harvest", is left alone.

`wordpress/rewards-mockup.html` is the approved mockup; regenerate from
`buildBoard(2500, 225)` if needed. At a sellout the board is 63 prizes: 25 left,
26 right, 12 Special Harvest.

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
class matches the engine's row labels exactly.

**Every row is its own Elementor HTML widget.** The chain is
`.elementor-element.elementor-widget-html > .elementor-widget-container >
.progress-con`, one per row, each with its own `data-id`. So "the direct parent
of a `.progress-con`" is that row's own widget container, not a column — a
column is the `.elementor-widget-wrap` holding a run of those widgets, and the
way to find it is the **lowest common ancestor of the rows carrying that
column's value class**. That wrap is safe: it never contains the other column.

That wrap also holds the column heading widgets **above** the rows and the
"Winning Gross Scores are Validated" and "Rewards based on N Hunters" notes
**below** them. Rows added to a column must be inserted after the last existing
row, not appended to the wrap, or they land underneath the notes.

**The bar has no height of its own.** There is no bare `.progress_bar` rule
anywhere. Height and width come only from twelve-odd compound rules like
`.progress-value-6-a.progress_bar_animate.progress_bar { height: 40px; width: 0 }`,
each with its own `@keyframes load-N` animating to one fixed per cent. Dropping
`progress_bar_animate` to set a width of your own therefore also drops
`height: 40px`, and the whole section renders invisible. That is what
`apex-home-rewards.css` restores.

**The right column is already mirrored** by `.progress-2 { float: right;
justify-content: flex-end }` and `.progress-content-2 { float: left }` — no work
needed. But `styles.css` un-mirrors it with `!important` between 768px and
1200px, and below 768px. Pre-existing and deliberate; left alone.

`.progress span` and `.progress-content`/`-2` are `display: none` in CSS until
submit-score.js calls `.show()` on them. New or repainted rows must set the
display themselves.

**The three copies are not responsive copies** — they are user-state variants,
and the class on each says which:

| Copy | Class | Notes |
|---|---|---|
| `f3d97df` | `free-challenge-hidden` | the paid UI; the one that normally shows |
| `fe96e71` | `free-challenge-ui` | free challenge; **no band dropdown**, and its key classes repeat (twelve rows all keyed `31st-35th`), so it cannot be addressed by key |
| `48fb42b2` | `elementor-hidden-desktop/tablet/mobile` | hidden at every breakpoint; dormant |

`.apex_free_challenge_true` on `<body>` swaps which of the first two is shown.
All three are rendered anyway.

Band dropdown: `ul.new-dropdown-payout span` shows the current value,
`ul.show-click-btm li` holds the ten options (50, 100, 150, 200, 250, 500, 750,
1000, 1500, 2500). It exists in `f3d97df` and `48fb42b2` but **not** `fe96e71`.

### Do not dequeue submit-score.js

`wp-content/plugins/apex-competitions-controller/assets/js/submit-score.js`
(note `js/`) holds the old hardcoded payout branches at lines 584–690, but it
**also** runs the score-submission popup, the step carousel, the measurement
calculator and the video widget — all present on the home page. Dequeuing it
breaks score submission.

It binds the band dropdown **directly** to the list items, not delegated, so
`jQuery('ul.show-click-btm li').off('click')` removes that one handler and
leaves everything else alone. That is the approach.

Two other things in that file matter:

- Its dropdown handler also writes `.apex_payout_number` ("Rewards based on N
  Hunters"). Removing the handler stops that, so the view layer writes it.
- `apex_payout_calculator()` runs a 3s jQuery count-up on every
  `.progress-content*`, re-reading the text and reformatting it with a `$`.
  Values written into elements it is still animating get overwritten, so the
  view layer calls `jQuery(el).stop(true, false)` before writing.

### Mistake to avoid

An earlier session selected row containers with `.elementor-column`. An outer
nested column contains **both** lists, so clearing it wiped the top ten and
destroyed the design on the live page.

The version before this one then over-corrected to "the direct parent of a
`.progress-con`", which is that row's own widget container — so it rendered all
25 rows into each of the 30 row widgets. Both are avoided now: the container is
the lowest common ancestor of a column's rows, and `column()` returns null
rather than touch a container that turns out to hold both lists.

Nothing is ever cleared. Existing row widgets are repainted in place, extra ones
are cloned from the last row when a band pays deeper than the page was built
for, and surplus ones are hidden.

Chris loves this page. Build changes as a static mockup or on a duplicate page
first; do not iterate on the live home page.

## Environment gotchas

- **The staging front end routes to exactly two places.** Without `home` in the
  query string, every URL 301s to `/challenges/` (page 27149). *With* it, every
  URL serves page **52**, whatever the path — `/?home`, `/rules/?home` and
  `/faq/?home` all render page 52. So `?home` is how you reach the calculator,
  and `/payout-calculator/` genuinely cannot be viewed. Pre-existing; the child
  theme and mu-plugins are clean and `.htaccess` is not readable through File
  Manager. Likely a plugin or a WP Engine staging setting.
- **Page 52 can be fetched with plain curl**, no login, which is how
  `p52.html` for the test harness is refreshed:
  `curl -sSL "https://whitetailstage.apexoutdoorrewards.com/?page_id=52&home"`.
  The calculator section is server-rendered by Elementor, so the markup is all
  there. Logged out the section computes to zero height, so measure it in the
  browser only after forcing `display` on it locally.
- **File Manager** is at `admin.php?page=file_manager_advanced_ui` (elFinder).
  Drive it through its JS API rather than the UI. Hashes are
  `'l1_' + base64url(relative path)` — no leading slash, e.g.
  `wp-content/themes`. Use `cmd:'ls'`, `mkfile`, `mkdir`, and `put` with
  `options:{type:'post'}` for writes.
- **GitHub serves stale copies of this repo** — not just raw.githubusercontent
  to the browser, but `gh api .../contents/HANDOFF.md?ref=...` too. A session
  that read HANDOFF.md that way got the version from two commits back and spent
  an hour building against instructions that had since been reversed. **Read it
  from a fresh `git fetch` / `git show`, not the API.** Verify byte counts after
  every upload for the same reason.
- **The browser JS tool blocks output containing URLs or query strings.**
  Redact or return structural summaries instead of raw file contents.
- **The in-app browser's screenshots go stale** — it will keep returning the
  first paint of a URL while the DOM has moved on. Read the DOM with the JS tool
  and measure with `getBoundingClientRect`; do not trust a screenshot to show
  the current state.
- The in-app browser **can** reach localhost: point `.claude/launch.json` at
  `python3 -m http.server` over the scratchpad and open the preview from there.
  It still cannot script `file://`.
- Chrome is connected via the Claude in Chrome extension and Chris is logged
  into WP admin.

## Settled — do not re-ask

- **The staging redirect to `/?home` does not matter.** The work is on the home
  page, which renders. `/payout-calculator/` being unreachable is accepted, and
  PR #1 sitting unmerged is accepted. Neither blocks anything.
- **Column headings**: Chris will handle the wording himself in Elementor.
  Leave the heading widgets alone — touch only the rows and their values.

## Scope of the remaining job, precisely

Only the home page (page 52) matters. Render into the existing rows on all
three copies of the section, wire the ten dropdown bands to
`buildBoard(band, 225)`, and leave every heading, caption and surrounding
widget exactly as it is.

## Open questions for Chris

1. **How the two columns split below a sellout.** The approved mockup is
   1st–25th | 26th–51st, which is the 2,500 board. Smaller bands pay fewer
   places — 25 at 500 hunters, 15 at 250, 7 at 50 — and filling the left column
   to 25 first would leave the right column empty for six of the ten bands,
   with its heading standing over a gap. The shipped default therefore halves
   the places below the cap, so the section stays two columns at every band
   (`BALANCE_SMALL_BANDS` in `apex-home-rewards.js`; set it to `false` for the
   literal 25-first rule). At 2,500 both give exactly 25 | 26. What this means
   at band 50 is 1st–4th on the left and 5th–7th on the right.
2. **Heading wording has to work across all ten bands**, not just at a sellout —
   at 250 hunters the columns hold 1st–8th and 9th–15th. Wording is Chris's, but
   worth knowing before he writes it. Say the word and the headings can be made
   to follow the band automatically instead.
3. The page's Special Harvest labels are inconsistent — the paid copy reads
   "100th Place" and "200th Place" but then just "300th" and "400th", and
   "1,000 Place" for 1,000th. Left alone deliberately, since captions are
   Chris's. Worth a tidy in Elementor.

## Test suite for the home page

`home-test.js` in the scratchpad runs the view layer against the real page 52
markup (`p52.html`) in jsdom, across all ten bands and all three copies, and
checks twenty things — the split, the values against `buildBoard`, the red
ramp, the 100%→33% taper, the bar keeping its height, Special Harvest grouping
and slot alignment, that headings and captions come through untouched, that
rows stay above the page notes, and that no column is ever wiped.

`build-preview.js` assembles `preview.html`: the real section markup plus the
real stylesheets, the shipped engine and the shipped view layer, standalone and
interactive. That is the thing to show Chris before touching the live page.
