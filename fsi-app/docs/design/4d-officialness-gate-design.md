# 4d — The Officialness Gate (clean past-nav body read → path a vs path b)

**Status: DESIGN.** Sibling of 4b (`floor-attribution.mjs`, floor-first span re-home) and 4c
(`docs/design/4c-label-step-design.md`, labeled-analysis relabel). Pure testable core, like both siblings.
**Naming caveat:** `floor-attribution.mjs:17` already uses "4d" for a *system-prompt* step (wrong-language
original-span). This remediation-pipeline **4d** is distinct — the officialness gate. Keep the two numberings
apart in the landing code comment.

## 1. The problem 4d solves + the batch-1 defect
4b re-homes a FACT to a floor-qualifying pool source that **verbatim-contains its span** (`reattributeToFloor`,
`floor-attribution.mjs:52`), matched by `.toLowerCase().includes(needle)` (`:58`) against `canonical-fetch.mjs`'s
`stripText` output — which removes `<script>/<style>/<tags>` but **keeps every visible string**: nav menus,
breadcrumbs, cookie banners, footer link lists. Two failures the batch-1 funded pass surfaced:
- **False positive:** a span "matches" a floor source's *navigation chrome* (menu label, breadcrumb) → 4b stamps a
  floor tier onto a fact the body never asserts (fabricated provenance via nav text).
- **False FACT:** a slot span extracted from nav-menu-only text (batch-1: "the pool span was navigation menu text
  only") reads as topically on-point but carries no instrument body.

4d inserts a **clean-body read** so both the span-match (4b) and the primary-FACT decision run against the
*instrument body*, not the chrome — then routes **path a** (official primary instrument → primary FACT at
institutional tier) vs **path b** (portal/explainer/chrome → secondary, relabel via 4c, or roadblock; never primary FACT).

## 2. Getting the clean body (pure, no LLM, no new fetch)
Operate on the **raw `html`** (canonical-fetch returns it alongside `text`, `htmlLength`, `fullTextLength`,
`truncated`) — the flattened `text` has already lost the structure needed to find chrome.
1. **Structural strip:** drop `<nav>/<header>/<footer>/<aside>`, `role="navigation"`, and
   `id|class~=(menu|breadcrumb|cookie|banner|sidebar|footer|skip-link)` containers before flattening.
2. **Block boilerplate ratio:** per block compute **link-density** = anchor-text chars / block chars and
   **text-density** = text chars / tag count; drop high-link-density (link-list) / short-line-dense (menu) blocks (~0.4 threshold).
3. **Clean-body length** = surviving chars; reuse `detectRoadblock`'s **`STUB_MIN_CHARS`=200** (`primary-fallback.mjs:21`)
   as the "real content" floor — but on the CLEAN body: a page clearing 200ch of raw text but <200ch *past the nav* is chrome.
The read is a pure function of `(html, host)` — the html is already in hand (retrieval-before-generation).

## 3. Path a vs path b (reuse existing signals, never topical fit)
- **Host authority-origin axis:** `defaultTierForHost(host)` (`host-authority.ts:29`: LEGAL_PRIMARY→T1,
  GOV_INTERGOV/GOV_TLD→T2); `classifySourceRole` (`classify-source-role.ts:27`, primary_legal_authority vs
  government_press); `classifyInstitutionalType` (`vertical-fit.ts:87`, the decisive **`statute_gazette_db` (primary
  text) vs `general_legislature` (portal)** split, `:111-113`).
- **Instrument-body axis:** the clean body carries **primary-instrument markers** (`Article N`, `Section`, `shall/must`,
  numbered paragraphs, OJ/CELEX identifiers) vs **portal/explainer markers** ("Browse", "Search the database", news lede, link-list-only).

**Path a** requires BOTH: host tier ≤ the item's authority floor (reg-family ≤ T2) **AND** clean body ≥ 200ch with
instrument markers. **Path b** on any miss (sub-floor host, or portal/explainer/chrome body). Ambiguous → **path b**
(host-authority's conservative bias: honest-quarantine > hollow-pass).

## 4. Where 4d wires in
At the span→source resolution site (`canonical-pipeline.ts` groundBrief, where 4b's `reattributeToFloor` is consumed):
`detectRoadblock` (usable content at all?) → **4d clean-body read** (is it the OFFICIAL instrument, past the nav?) →
4b floor re-home (now matching `needle` against the **clean body**, so `.includes` can't fire on chrome) →
4c relabel (path-b prose → labeled analysis). 4d refines the roadblock/honest-partial line: `detectRoadblock` returns
`roadblocked:false` for any ≥200ch in-language body (correct for *fetch success*), but 4d is the second gate — a
portal-chrome honest-partial passes `detectRoadblock` yet fails 4d → path b (a **non-primary** source: corroborate or 4c-label, not a roadblock/alternative-hunt).

## 5. The moat — what 4d must NEVER do
- **Never PROMOTE a non-official page to primary** because grounding wants a FACT or topical fit is high. Officialness =
  **host + instrument identity**, not subject relevance (the class-society precedent: a regulator's portal/briefing page
  is its website, not its enacted ACT — `Industry interpretation:` analysis at best, never unlabeled FACT-grade).
- **Never DOWNGRADE a real instrument for having chrome.** EUR-Lex pages are nav-heavy; find the instrument body *past*
  the nav (path a). The test is presence of instrument body, not absence of chrome.
- **Never fabricate a floor stamp** (4b's binding rule): a span absent from the *clean* body keeps its honest
  attribution — walls or relabels, never forced.

## 6. Red-then-green + pure core
Pure core: `officialnessOf(html, host) → { cleanBody, cleanLen, linkDensity, path:'a'|'b', reason }` — no I/O, `node --test`.
- **RED-1 (nav false-match):** floor source whose only >24ch span match sits in a menu → pre-4d `reattributeToFloor`
  returns it (fake stamp); with 4d the span is absent from `cleanBody` → no re-home; assert `path:'b'`.
- **RED-2 (portal at high host):** a T1-host link-dense landing page, no `Article/shall` → `path:'b'` despite T1 host.
- **GREEN:** EUR-Lex enacted-text page (heavy nav + real directive body) → `cleanLen ≥ 200`, instrument markers, host T1 → `path:'a'`.
- **Wire point:** 4b's `floorSources`/`reattributeToFloor` consume `cleanBody` instead of raw `s.text`.

## Status / relation to 03b5f234
DESIGN ONLY — not built. Per the standing exclusion "03b5f234 until 4d LANDS," the 03b5f234 single pass stays
**deferred until 4d is BUILT** (design alone does not lift the exclusion — a portal-source item like 03b5f234
regjeringen.no is exactly what 4d's path-b gate is for; ground-passing it pre-4d would waste spend on a likely hold).
