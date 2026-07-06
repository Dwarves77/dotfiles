# Design deviations — redesign proposals

Deviations are **proposals**, not decisions. The operator reviews this file.
One entry per deviation: template, what deviated, why, screenshot.

---

## Template 03 — Regulation detail (`feat/redesign-t03-regulation-detail`)

### D1 — Detail-page action color is brand orange via new `--cl-*` tokens, not the existing `--accent` (navy)
- **What deviated.** The live editorial token set in `src/app/theme.css` deliberately
  sets `--accent: #1E3A8A` (navy) for post-2026-04 components. The approved T03 mock
  uses brand orange `#E8610A` as THE action color (Export brief, active tab underline,
  links, accents). HANDOFF §2 lists `accent = #E8610A`.
- **Resolution.** Rather than flip the shared `--accent` (which would restyle every
  neighbor surface — forbidden by the dispatch), I added an additive, detail-scoped
  token block (`--cl-*`) lifted verbatim from the mock, and the T03 surface consumes
  exact mock hex through a local `C` palette constant. No neighbor surface changes.
- **Why.** Smallest-deviation rule + "do not refactor neighbors" + "lift exact hex,
  do not substitute Tailwind defaults." When the redesign reaches the shell/global
  layer, the operator can promote `--cl-accent` to the canonical `--accent`.

### D2 — Hero gradient strip is supplied by AppShell, not re-drawn inside the hero
- **What deviated.** The standalone mock draws its own 4px `#E8610A → #2563EB` strip at
  the top of the hero card. In production, `AppShell` already renders the shell's 3px
  masthead gradient strip at the top of the content column on every page.
- **Resolution.** The T03 hero does NOT draw a second strip (that would render two
  parallel gradient strips a few px apart). The shell strip stands in for the mock's
  hero strip.
- **Why.** Avoids a visual artifact; keeps the masthead strip identical shell chrome
  across pages per HANDOFF §5. If the operator prefers the strip attached to the hero,
  it is a one-line addition.

### D3 — Breadcrumb replaces EditorialMasthead on the detail route
- **What deviated.** `/regulations/[slug]` previously rendered a separate back-link plus
  `EditorialMasthead` (Vol-eyebrow + Anton title + meta) above the surface. The mock puts
  the breadcrumb + Anton title + deck + actions + tabs together inside one hero.
- **Resolution.** The page now composes the breadcrumb middle segment (`Global · IMO`)
  and deck sub-line server-side from real fields and passes them to the surface, which
  renders the full hero. `EditorialMasthead` is untouched and still used by other pages.
- **Why.** HANDOFF §5: "Detail pages replace the volume eyebrow with a breadcrumb."
  Matches the mock's single-hero structure.

### D4 — "Watch" is a local pressed-state toggle (no persistence)
- **What deviated.** The mock shows a quiet "Watch" action. No watchlist table /
  per-workspace membership API exists yet (KNOWN NEW BACKEND WORK).
- **Resolution.** Rendered as a real `aria-pressed` button that toggles local state and
  states the honest pending status in its `title`. It does not fabricate persistence.
- **Why.** Honest-state discipline: render the affordance, do not fake the backend.
  Wire to the watchlist table when it ships.

### D5 — "Connected intelligence" renders the honest pending frame
- **What deviated.** The mock shows two illustrative connected-intelligence rows
  (Corroborates / References). There is no first-class cross-surface link graph on the
  Resource today (only `xrefIds` / `refByIds`, which render in the rail's Linked
  regulations card).
- **Resolution.** The Summary "Connected intelligence" panel renders the §4 pending
  frame rather than fabricating cross-surface rows. Linked regulations remain in the rail.
- **Why.** HANDOFF §1/§4: no invented data. The illustrative mock rows are content, not
  a data contract.

### D6 — Accordion contents bind the real operational briefing, not the mock's verified/analysis columns
- **What deviated.** The mock's Full-summary accordions show curated
  "Verified · checked against the source" vs "Our analysis" vs "confirm with counsel"
  columns. Production has the parsed operational-briefing prose (immediate action /
  what-it-is / compliance chain) + structured `intelligence_item_sections`, not a
  structured verified/analysis split per paragraph.
- **Resolution.** The accordions render the real parsed prose (with the immediate-action
  severity callout where the agent emitted a severity label) and the structured
  RegulationSections. Epistemic chips are only rendered where a backing field exists
  (clamped tier chips on sources; severity label on immediate action). No VERIFIED chip
  is fabricated absent a provenance field.
- **Why.** DO-NOT-REVERT: "never render a chip without its backing field"; epistemic
  grammar must bind real fields. The mock's three-column split is illustrative content.
