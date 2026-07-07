# Spec Audit: Map (`/map`) vs caros-ledge-platform-intent SKILL.md

Date: 2026-05-23
Branch: `chore/spec-audit-map`
Base: `origin/master` @ `9ca913c`
Auditor mode: READ-ONLY

## Scope

Compare the Map surface (`/map`) as built against the Caro's Ledge platform
intent spec at
`fsi-app/.claude/skills/caros-ledge-platform-intent/SKILL.md`. Operator's
new instruction is to audit every site page against spec; this report
addresses Map even though Map was not in the original three-misaligned
list.

The audit first answers the framing question (is Map a surface or a
cross-cutting visualization layer?), then audits the build against
whatever framing the spec actually states.

---

## 1. Spec excerpt and Map framing

The spec is explicit and consistent. Map is NOT one of the five
customer-facing surfaces. Map is one of two cross-cutting capabilities
(the other being Intelligence Assistant). Direct quotes:

- Frontmatter (line 3): "Cross-cutting capabilities include Map
  (geographic view of Regulations content) and Intelligence Assistant"
- Load triggers (line 9): "Any dispatch touching the five customer-facing
  surfaces (Regulations, Market Intel, Research, Operations, Community)
  or cross-cutting capabilities (Map, Intelligence Assistant)"
- Section header (line 128-130): "Cross-Cutting Capabilities. These span
  the five surfaces; they are not surfaces themselves."
- MAP section (lines 142-152):
  - "**Surface.** Geographic visual layer over Regulations content. Lives
    at `/map`."
  - "**Function.** Region-specific search done visually as a filter
    alternative to the Regulations list view. A view of Regulations
    content, not a separate content category."
  - "**Future cross-cutting use.** Visualizing agent availability across
    regions (when that feature ships). Possibly visualizing Community
    working group presence by region."
  - "**Source category mapping.** Map is a view of Regulations content;
    the source category is `regulatory`. Map does not surface its own
    content."
  - "**Current state.** Functional as a view of Regulations."
- Anti-pattern (line 316): "Treating Map as a separate content category.
  Map is a geographic view of Regulations content. It does not surface
  its own content category."
- Framing-binding clause (line 305): the "Map as view of Regulations"
  framing is named explicitly as binding and may not be modified without
  operator strong-emphasis correction.

**Framing answer.** Map is a CROSS-CUTTING VISUALIZATION LAYER over
Regulations content. It is NOT a surface in the canonical five (the five
are Regulations, Market Intel, Research, Operations, Community per lines
45-127). The spec is explicit and unambiguous on this point. The spec
also explicitly declares Map's current build state as "Functional as a
view of Regulations" (line 152), meaning the spec considers Map
appropriately delivered relative to its stated scope.

The spec is intentionally thin on what Map could become. The "Future
cross-cutting use" line (148) hints at agent availability and Community
working-group region visualization as plausible expansions, but does not
commit to either. Operations facility metadata, Market Intel signals,
Research findings, and ports/lanes overlay are not mentioned at all.

---

## 2. Current built reality

`fsi-app/src/app/map/page.tsx` (40 lines) is a thin server component
that:

- Fetches `getListingsMapData()` from `src/lib/data.ts:243` (returns
  resources, changelog, disputes, xrefPairs, supersessions). The fetcher
  pulls the same Regulations-style payload the rest of the app uses, via
  RPC 066. There is no Operations, Market Intel, Research, or Community
  data sourced for Map.
- Fetches `getCoverageGaps()` from `src/lib/coverage-gaps.ts:273` which
  rolls up per-region source-registry coverage (env-body presence,
  legislature presence, gap counts) for Tier 1 priority regions. This is
  source-registry meta-content, not Regulations content per se, but it
  is bounded to the regulatory source taxonomy.
- Accepts `?region=us-ca` URL param for ISO pre-filter, matching the
  `/regulations` URL schema (page.tsx:8-15).

`fsi-app/src/components/map/MapPageView.tsx` (636 lines) renders:

- `EditorialMasthead` titled "Global Regulatory Map" (line 249) with
  meta "Where regulations bite. Click a marker for the open items in
  that jurisdiction; size and colour encode urgency." (line 250)
- `AiPromptBar` chip placeholder, chips: "Critical jurisdictions",
  "Corridors with active CBAM", "Where coverage is thin" (lines 256-263)
- Mode-filter toolbar with `all | ocean | air | road` (lines 81, 302-329).
  Note: a "facility" mode option was explicitly removed at line 73-80
  with an inline comment citing the SKILL.md framing ("D14 resolution
  2026-05-19 ... facility data belongs on /operations per skill
  Section 3"). The build is enforcing spec framing in code.
- 70/30 grid layout (lines 334-342): Leaflet map left, side rail right.
- Side rail (lines 371-580): three cards
  - "Active heat" (jurisdictions with CRITICAL items, total CRITICAL
    items)
  - "By jurisdiction" (click-to-fly list, top 12)
  - "Coverage gaps" (top 5 regions by gap severity, linked to
    `?region-filter=<region.id>`)

`fsi-app/src/components/map/MapView.tsx` (1046 lines) is the Leaflet
canvas:

- World-view start, `MarkerClusterGroup`, custom DivIcon pins with EU/CA
  style sub-jurisdiction differentiation (lines 69-126, 508-548).
- Search, priority filter (CRITICAL/HIGH/MODERATE), region filter, sort
  (name/count/critical) on the right list panel (lines 803-925).
- Two-level drill (parent jurisdiction -> sub-jurisdictions -> regs;
  lines 354-460, 687-797).
- Resource cards expand inline (`ResourceCard` + `ResourceDetail`) and
  link to `/regulations/{id}` for full detail (lines 765-781). The full
  detail page is on Regulations, not Map.

`fsi-app/src/components/map/jurisdictionCentroids.ts` supplies coords
and pin codes. No Operations facility data, no port/lane geometry, no
Community group geo data, no agent geography.

Interactive: yes. Filterable: yes (mode, search, priority, region, sort).
Data shown: Regulations resources only, plus a source-registry coverage
rollup.

---

## 3. Line-cited gap analysis

Framed against the spec's explicit Map framing (cross-cutting visual
layer over Regulations content; "view of Regulations content, not a
separate content category" per SKILL.md:146).

### PRESENT (build matches spec)

- **Geographic visual layer over Regulations content.** SKILL.md:144-146.
  Built at `MapPageView.tsx:248-251` ("Global Regulatory Map") with
  Leaflet canvas at `MapView.tsx:508-548` rendering Regulations
  resources via `getListingsMapData()` (`page.tsx:25`,
  `lib/data.ts:243`).
- **Region-specific search as filter alternative to Regulations list.**
  SKILL.md:146. Built via the search/priority/region filters at
  `MapView.tsx:803-925`, jurisdiction drill at `MapView.tsx:687-797`,
  and the `?region=us-ca` URL handoff matching `/regulations` schema at
  `page.tsx:8-15`.
- **Map is a view, not a separate content category.** SKILL.md:316
  anti-pattern. Build enforces this explicitly at
  `MapPageView.tsx:73-80` ("facility mode removed ... facility data
  belongs on /operations per skill Section 3"). Full-detail links route
  to `/regulations/{id}` not a Map-owned route (`MapView.tsx:773-781`).
- **Intelligence Assistant per-page prompt bar on `/map`.**
  SKILL.md:134 ("Available globally ... per-page (Ask anything about
  prompt bars on /market, /research, /operations, /regulations, /map)").
  Built at `MapPageView.tsx:256-263`.
- **Current state matches spec characterization.** SKILL.md:152
  ("Functional as a view of Regulations"). Build is functional, ships
  data, supports interaction.

### MISSING (spec hints, not built)

- **Future cross-cutting use: agent availability by region.**
  SKILL.md:148. Not built; no agent geo data flows in, no toggle to
  surface it. Spec frames this as future, not current scope. Not a gap
  against current spec but worth flagging because it is the spec's only
  explicit forward signal.
- **Future cross-cutting use: Community working-group presence by
  region.** SKILL.md:148. Not built; no Community geo overlay,
  `MapPageView.tsx` does not import any Community data. Same status as
  above (future, not current scope).

### MIS-FRAMED (build language vs spec language)

- **None observed.** The build's masthead ("Global Regulatory Map"),
  meta text ("Where regulations bite"), and inline scoping comment at
  `MapPageView.tsx:73-80` all reflect the spec's framing of Map as a
  Regulations-content view. No "decision engine," "operations layer,"
  or "intelligence surface" language has crept into Map.

### PRESENT_BUT_UNAUTHORIZED (built beyond spec scope)

- **Coverage gaps card driven by source-registry rollup.**
  `MapPageView.tsx:520-579`, `lib/coverage-gaps.ts`. The Coverage gaps
  panel surfaces per-region source-registry coverage (env-body presence,
  legislature presence, gap counts). The spec frames Map as a view of
  Regulations CONTENT; source-registry coverage is meta-content (what
  sources are wired up). This is arguably an admin/triage concern more
  than a customer concern. SKILL.md does not explicitly authorize
  Coverage gaps on Map.

  Mitigating: source-registry coverage is bounded to regulatory
  jurisdictions, so it stays inside the Regulations scope by adjacency.
  And `getCoverageGaps()` documentation at `lib/coverage-gaps.ts:6-9`
  lists "Map · Coverage gaps card (current consumer)" alongside future
  Research and Admin consumers, suggesting this is intentional shared
  infrastructure. Flag as a question for operator: is "where coverage is
  thin" a customer question on Map, or operator chrome leaking?

- **AI prompt bar chip "Where coverage is thin."**
  `MapPageView.tsx:262`. Same concern as above. This chip invites
  customer questions about the platform's source-registry coverage,
  which is operator-facing concern, not customer-facing. Possible
  chrome leak similar to the OBS-19 stub chips on Operations or the
  phase-language banner on Operations / Research.

### UNDER-SPECIFIED (spec is thin)

- The spec gives Map one short subsection (lines 142-152). It defines
  what Map is NOT (a content category, an operations layer, a separate
  surface) more thoroughly than what Map IS (a visual filter over
  Regulations). The forward roadmap is two sentences. There is no
  guidance on:
  - Should Map surface Regulations cross-references (xref pairs,
    supersessions) visually? Build passes these props (`page.tsx:32-37`,
    `MapPageView.tsx:53-54`) but they only render inside the inline
    `ResourceDetail` expansion, not as a visual overlay.
  - Should the Coverage gaps panel exist on Map at all? Currently it
    does (see PRESENT_BUT_UNAUTHORIZED above).
  - When agent availability and Community working-group presence land,
    will Map's masthead and meta text need to broaden from "Global
    Regulatory Map" / "Where regulations bite" to something inclusive?
    Spec does not say.

---

## 4. Missing data shapes

Because the spec explicitly scopes Map to a Regulations view and
explicitly DENIES other content categories (facility removed per
SKILL.md:144-152 and enforced at `MapPageView.tsx:73-80`), there are no
missing data shapes against the current spec. The build has every shape
the spec calls for: jurisdictionIso array on Resource, jurisdiction
centroids, sub-jurisdiction centroids, pin codes, mode arrays.

Against the spec's two forward signals (lines 148):

- **Agent availability geo shape (future).** Would need:
  - `agents` table with `region_iso[]` or `jurisdiction_iso[]` array
    plus availability/capacity fields
  - A toggle in Map to switch between Regulations view and Agents view
    (or a layer composition pattern)
  - Centroids exist; pin styling would need a different visual register
    to avoid colliding with regulatory urgency colors
- **Community working-group region geo shape (future).** Would need:
  - `community_groups` rows already exist per Multi-Tenant Workstream B;
    needs a `region_iso[]` derived column or membership rollup
  - Layer toggle same as above
  - Aggregation function similar to `jurisdictionRows` at
    `MapPageView.tsx:186-222` but for group counts

Against the operator's plausible customer questions:

- "What's happening in my routes geographically?" — Map currently
  cannot answer. No route geometry, no lane data, no port markers.
  Would require route/lane/port data shape that does not exist
  anywhere in the schema. Spec does not authorize this; it is
  Operations-adjacent.
- "Where are my regulatory deadlines concentrated by jurisdiction?" —
  Map CAN answer this today via the priority filter + jurisdiction
  drill. Builds correctly per spec.
- "What facilities, ports, lanes are affected by recent intel?" — Map
  CANNOT answer. Facility data was explicitly excluded per
  `MapPageView.tsx:73-80`. Ports/lanes have no data shape. Spec does
  not authorize; this is Operations-adjacent or a Map scope expansion
  that would require a spec amendment.
- "How do my operations footprint and the intel surface visually
  overlay?" — Map CANNOT answer. Operations footprint is not on Map by
  spec design. Spec frames cross-surface synthesis as the Intelligence
  Assistant's job (research helper grounded in skill content), not
  Map's job.

---

## 5. Operator questions

1. **Is Map a surface or a cross-cutting visualization layer?** The
   spec says cross-cutting layer (SKILL.md:128-152). The build matches
   that framing today. Confirm this remains the binding framing, or
   authorize promotion to surface status. (Spec is silent on the
   surface-vs-layer ambiguity in some downstream phrasings; the answer
   in the canonical skill is layer.)

2. **Coverage gaps panel: customer-facing or operator-chrome leak?**
   The Coverage gaps card (`MapPageView.tsx:520-579`) surfaces
   source-registry rollup data. Is "where coverage is thin" a
   freight-forwarder customer question, or does it belong on admin
   chrome only? If operator-chrome, this is a leak similar to OBS-19
   on Operations.

3. **AI prompt bar chip "Where coverage is thin": same question.**
   `MapPageView.tsx:262`. If Coverage gaps is operator chrome, this
   chip should be removed.

4. **Does the spec need to grow forward guidance?** The Map subsection
   is 10 lines. The forward roadmap is one sentence (agent availability
   + Community group presence as possibilities). Does Map need a
   richer forward spec to prevent silent drift in Sprint 3+, or does
   "thin spec, matches build" remain operator-intended?

5. **The four customer questions in the dispatch operator-context
   block: which (if any) are intended Map scope?**
   - Routes geographically (currently no shape; Operations-adjacent)
   - Regulatory deadlines by jurisdiction (currently answered)
   - Facilities/ports/lanes affected by intel (explicitly excluded by
     facility mode removal at `MapPageView.tsx:73-80`; spec does not
     authorize)
   - Operations + intel visual overlay (spec hands cross-surface
     synthesis to Intelligence Assistant, not Map)

   If any of (1), (3), or (4) should be answerable on Map, that is a
   spec amendment dispatch.

6. **Forward roadmap items: prioritize?** Agent availability geo and
   Community group geo are both listed as "future" in the spec
   (SKILL.md:148). Neither has a data shape today. Operator decides
   whether either belongs in Sprint 2+ scope or whether they remain
   open-ended future work.

7. **Should Regulations xref / supersession relationships render as a
   visual overlay on Map?** The data is fetched (`page.tsx:34-36`) and
   passed through to `MapView`, but only renders inside the inline
   `ResourceDetail` expansion. Spec is silent. If the answer is yes,
   that is a Map enhancement; if no, the unused-on-canvas data is fine
   (it powers the detail panel).

---

## Verdict (one line)

Map is **appropriately specified and built to match spec.** Spec is thin
but explicit; build conforms; one possible chrome leak (Coverage gaps)
worth operator confirmation.

---

## Caveats

- Read-only audit. No file modifications outside this report.
- Audit was against `origin/master` @ `9ca913c`. Open PRs touching Map
  not evaluated.
- Coverage gaps "chrome leak" call is a judgment call, not a clear
  spec violation. The spec is silent rather than prohibitive.
- The Intelligence Assistant per-page prompt bar on `/map` is presumed
  functional per SKILL.md:140 ("Wired into the surfaces"); deep
  end-to-end response quality not verified here.
- Future-roadmap gaps (agent availability geo, Community group geo)
  are listed as future in spec; flagging them is forward-looking, not
  a current-state gap.
- No em or en dashes per operator preference; commas used throughout.

## Related

- [[spec-audit-operations-2026-05-23]] — Facility mode was removed from Map because facility data belongs on /operations per skill Section 3
- [[spec-audit-regulations-2026-05-23]] — Map is explicitly a geographic view of Regulations content; shares the getListingsMapData/resources payload
- [[spec-audit-synthesis-2026-05-23]] — One of eight audits synthesized; Map named the sole clean match
- [[jurisdiction-normalization-audit-2026-05-11]] — Map centroids/pin codes depend on normalized jurisdiction ISO codes this audit governs
- [[source-coverage-diagnostic-2026-05-09]] — Map's Coverage-gaps card (chrome-leak flag) surfaces per-region source-coverage this diagnostic quantifies
