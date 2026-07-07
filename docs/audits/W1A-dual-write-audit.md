# W1.A — Dual-Write Audit: `jurisdictions` Callsites

This audit lists every place in the codebase that reads or writes the legacy
`jurisdictions` column on `intelligence_items` or `sources`. The new
`jurisdiction_iso` column from migration 033 must eventually be populated
alongside `jurisdictions` at every WRITE site, and read-side surfaces should
prefer `jurisdiction_iso` once W4 backfill completes.

This audit identifies callsites only — no callsites have been modified.

Notes on the read-side surfaces:

- `staged_updates.proposed_changes` is a JSONB blob, not a top-level column,
  so writes there are JSON-shape concerns (the column itself was added in 033
  for completeness but isn't strictly required for backwards compatibility).
- `user_profiles.jurisdictions` (migration 027) is a *user preference* — what
  the operator personally watches. It is NOT the same column as
  `intelligence_items.jurisdictions` and is **out of scope** for this dual-
  write effort. Listed at the end for clarity only.

Counts at a glance:

| Category | Files | Sites |
| --- | ---: | ---: |
| WRITE — `intelligence_items.jurisdictions` | 2 | 2 |
| WRITE — `sources.jurisdictions` | 4 | 5 |
| WRITE — `staged_updates.proposed_changes.jurisdictions` (JSONB) | 1 | 1 |
| READ — `intelligence_items.jurisdictions` (`.select(...)`) | 7 | 8 |
| READ — `sources.jurisdictions` (`.select(...)`) | 1 | 1 |
| READ — UI / display / agent prompts | 12 | many |
| READ — filter / sort / scoring logic | 4 | 6 |
| READ — seed scripts | 5 | 88 |
| Out-of-scope (`user_profiles.jurisdictions`) | 3 | many |
| Schema definitions | 6 | 6 |

---

## 1. Writes to `intelligence_items.jurisdictions`

These are the sites that must be updated to dual-write `jurisdiction_iso` once
the W1.A migration is applied.

| File | Line | What it does |
| --- | ---: | --- |
| `fsi-app/src/app/api/admin/scan/route.ts` | 202 | Inserts a freshly scanned intelligence item — the only place the public scan endpoint creates rows. Currently writes `[item.jurisdiction.toLowerCase()]` or `["global"]`. |
| `fsi-app/src/app/api/agent/run/route.ts` | (340-ish, see Step 10) | Updates an existing `intelligence_items` row by `source_url` after the agent regenerates content. Does NOT currently mutate `jurisdictions` (Step 10 update payload), but the targetItem read at line 108 includes `jurisdictions` so the column is available; this is the place to add `jurisdiction_iso` to the update payload if the agent ever proposes jurisdiction changes. |

Worker / agent insertion paths that are NOT direct callsites today (no item
INSERTs in `agent/run`) but should be reviewed when W2 staged-update approval
flow lands.

## 2. Writes to `sources.jurisdictions`

| File | Line | What it does |
| --- | ---: | --- |
| `fsi-app/src/app/api/admin/sources/promote/route.ts` | 100, 153 | Promote endpoint — updates `sources.jurisdictions = body.jurisdictions || []` and stores the same value into `recommended_classification.jurisdictions`. |
| `fsi-app/src/app/api/admin/canonical-sources/decide/route.ts` | 198, 236 | Approve canonical-source candidate — writes `body.jurisdictions || []` to the new `sources` row and to `recommended_classification` JSONB. |
| `fsi-app/src/app/api/admin/canonical-sources/bulk-approve/route.ts` | 127 | Bulk-approve loop — writes `rec.jurisdictions` to each new `sources` row. |
| `fsi-app/src/components/sources/CanonicalSourceReview.tsx` | 690 | Sends `jurisdictions` field in the request body to the decide / bulk-approve endpoints (UI source of the writes above). |
| `fsi-app/src/components/sources/ProvisionalReviewCard.tsx` | 101 | Sends `jurisdictions` field in the request body to the promote endpoint. |

Seed scripts that insert `sources` rows directly (lines per file in section 9):

- `fsi-app/supabase/seed/seed-sources.sql` (15 occurrences)
- `fsi-app/supabase/seed/add-source-registry.mjs` (62 occurrences)
- `fsi-app/supabase/seed/add-tech-sources.mjs` (15 occurrences)
- `fsi-app/supabase/seed/add-building-standards.mjs` (16 occurrences)
- `fsi-app/supabase/seed.sql` (10 occurrences)

## 3. Writes to `staged_updates.proposed_changes` (JSONB)

| File | Line | What it does |
| --- | ---: | --- |
| `fsi-app/src/components/AskAssistant.tsx` | 57 | Builds a payload that includes `jurisdictions: Object.keys(jurisdictionWeights || {})` — fed downstream to the Ask endpoint, not a staged-update write per se but the same shape. |

Note: `staged_updates` does not have a top-level `jurisdictions` column; its
data lives in the `proposed_changes` JSONB blob. The new `jurisdiction_iso`
column added by migration 033 is available for future structured filtering.

## 4. Reads from `intelligence_items.jurisdictions` (Supabase `.select()`)

| File | Line | What it does |
| --- | ---: | --- |
| `fsi-app/src/app/api/agent/run/route.ts` | 108 | Selects `jurisdictions` from `intelligence_items` to pass to the dynamic source-pool builder (line 127). |
| `fsi-app/src/app/api/ask/route.ts` | 40 | Selects `jurisdictions` for inclusion in the Ask LLM grounding context (line 58). |
| `fsi-app/src/app/research/page.tsx` | 37, 65 | Selects `jurisdictions` for the research / market table rows. |
| `fsi-app/src/app/api/admin/canonical-sources/recommend-classification/route.ts` | 177 | Selects `jurisdictions` from the parent intelligence item to ground the Haiku classification prompt. |
| `fsi-app/src/app/api/admin/canonical-sources/pending/route.ts` | 53 | Selects `jurisdictions` for the pending canonical-source list display. |
| `fsi-app/supabase/seed/canonical-source-discover.mjs` | 35 (select) | Selects `jurisdictions` from intelligence items for the discovery loop. |
| `fsi-app/supabase/seed/b2-runner.mjs` | 72 | Selects `jurisdictions` for the B.2 regeneration loop. |
| `fsi-app/src/lib/supabase-server.ts` | 185, 379, 716 | Server-side data hydration — maps `row.jurisdictions` onto Resource / IntelligenceItem objects for the home page payloads. |

## 5. Reads from `sources.jurisdictions` (Supabase `.select()`)

| File | Line | What it does |
| --- | ---: | --- |
| `fsi-app/src/lib/agent/source-pool.ts` | 62, 71, 84, 87 | Selects `jurisdictions` and uses them for ranking the dynamic per-item source pool — overlap with item jurisdictions, plus "global" inheritance fallback. |

## 6. Reads — UI display, agent prompts, and grounding text

These do not go through Supabase; they consume `jurisdictions` from already-
hydrated objects (props, state, server payload) for rendering or prompt
construction. They are READ-side dual-write candidates: as `jurisdiction_iso`
becomes populated, these surfaces should prefer it for display.

| File | Line(s) | What it does |
| --- | ---: | --- |
| `fsi-app/src/components/research/ResearchView.tsx` | 41, 141-143, 190, 201, 629 | `regionLabel(jurisdictions[])` — derives display region from first entry; filters by region. |
| `fsi-app/src/components/admin/AdminDashboard.tsx` | 519 | Renders staged-update `proposed_changes.jurisdictions` chips. |
| `fsi-app/src/components/sources/CanonicalSourceReview.tsx` | 46, 67, 624, 654, 690, 860 | Pill-picker UI for source classification jurisdictions; sends to decide endpoint. |
| `fsi-app/src/components/sources/ProvisionalReviewCard.tsx` | 11, 48, 79, 101, 236-240 | Pill-picker UI for provisional-source jurisdictions; sends to promote endpoint. |
| `fsi-app/src/components/home/WeeklyBriefing.tsx` | 105 | Counts unique `r.jurisdiction || "global"` for the "N jurisdictions" summary tile. |
| `fsi-app/src/lib/agent/system-prompt.ts` | 374 | Agent system prompt instruction — "Extract jurisdictions, affected transport modes, ...". |
| `fsi-app/src/lib/briefing/systemPrompt.ts` | 10, 15-16, 36 | Adds `Active jurisdictions: ...` line to the briefing system prompt. |
| `fsi-app/src/components/explore/FilterBar.tsx` | 22, 33, 81, 133, 135 | Renders the explore-page jurisdiction filter chips (read from `filters.jurisdictions`). |
| `fsi-app/src/stores/settingsStore.ts` | 26, 41 | Persists the saved-default `jurisdictions` filter list. |
| `fsi-app/src/stores/sourceStore.ts` | 10, 48, 110 | Source-store filter state and `jurisdictions` overlap predicate. |
| `fsi-app/src/stores/resourceStore.ts` | 53, 143 | Resource-store filter state for `jurisdictions`. |
| `fsi-app/src/components/map/MapView.tsx` | 156, 214, 222, 227, 238, 256, 341, 382, 393, 616, 771, 891 | Map display — splits resources into top-level + sub-jurisdictions, renders pins, drill-down, search. **Highest visual impact surface for ISO migration.** |
| `fsi-app/src/components/map/MapPageView.tsx` | 159, 183-185, 225, 397, 417 | Map page chrome — "N jurisdictions live", critical-jurisdictions ask suggestions, empty states. |
| `fsi-app/src/components/map/jurisdictionCentroids.ts` | 11, 124, 154 | Lat/lng lookup table — top-level jurisdictions and labels for sub-jurisdictions. **Will need an ISO-keyed twin for full migration.** |
| `fsi-app/src/components/pages/OperationsPage.tsx` | 272 | Operations summary — "N jurisdictions with data". |
| `fsi-app/src/app/page.tsx` | 7, 25, 31 | Home meta — `jurisdictionsCount` for the "N regulations tracked · N jurisdictions" line. |
| `fsi-app/src/app/regulations/page.tsx` | 33, 36 | Regulations page meta — same pattern. |

## 7. Reads — filter / sort / scoring logic

| File | Line(s) | What it does |
| --- | ---: | --- |
| `fsi-app/src/lib/scoring.ts` | 228, 250, 252 | Resource-list filter — `filters.jurisdictions.includes(resourceJur)`. |
| `fsi-app/src/lib/agent/source-pool.ts` | 41, 62, 71, 84, 87 | Source-pool ranking — overlap predicate against item jurisdictions, "global" inheritance. |
| `fsi-app/src/stores/sourceStore.ts` | 110 | Filter predicate `s.jurisdictions.includes(j)`. |
| `fsi-app/src/lib/supabase-server.ts` | 379, 716 | Maps `row.jurisdictions[0]` onto a single legacy `jurisdiction` field for the Resource type. |

## 8. Reads — agent prompts and Haiku classification grounding

These are LLM-call payloads that include `jurisdictions` as part of the
grounding text. They are read-side; once `jurisdiction_iso` exists, prompts
should include both for backwards-compat with workers that may have been
trained / tuned against the legacy strings.

| File | Line(s) | What it does |
| --- | ---: | --- |
| `fsi-app/src/app/api/agent/run/route.ts` | 139 | Embeds `jurisdictions: ${JSON.stringify(...)}` in the system prompt. |
| `fsi-app/src/app/api/admin/canonical-sources/recommend-classification/route.ts` | 51, 61, 65, 72, 97, 134 | Haiku classification prompt — declares the `jurisdictions` schema field, includes parent-item grounding line. |
| `fsi-app/src/app/api/admin/sources/recommend-classification/route.ts` | 46, 58 | Haiku classification prompt — same shape for the source-promote flow. |
| `fsi-app/supabase/seed/canonical-source-discover.mjs` | 64, 142 | Discovery prompt — embeds parent-item jurisdictions; prints to console. |
| `fsi-app/supabase/seed/b2-runner.mjs` | 158, 175 | B.2 regeneration loop — embeds jurisdictions in the agent prompt. |

## 9. Seed scripts — direct INSERT writers of `sources.jurisdictions`

These are the bulk seed writers. Each will need `jurisdiction_iso` populated
once the legacy → ISO mapping is locked in `lib/jurisdictions/iso.ts`.

| File | Occurrence count |
| --- | ---: |
| `fsi-app/supabase/seed/add-source-registry.mjs` | 62 |
| `fsi-app/supabase/seed/add-building-standards.mjs` | 16 |
| `fsi-app/supabase/seed/add-tech-sources.mjs` | 15 |
| `fsi-app/supabase/seed/seed-sources.sql` | 15 |
| `fsi-app/supabase/seed.sql` | 10 |
| `fsi-app/supabase/seed/canonical-source-discover.mjs` | 2 (read-only) |
| `fsi-app/supabase/seed/b2-runner.mjs` | 2 (read-only) |
| `fsi-app/supabase/seed/canonical-source-classify.mjs` | 1 (read-only) |

## 10. Schema definitions

For reference — the SQL definitions of the legacy column. The new
`jurisdiction_iso` column added by migration 033 sits alongside.

| File | Line | What it does |
| --- | ---: | --- |
| `fsi-app/supabase/migrations/004_source_trust_framework.sql` | 41 | `sources.jurisdictions TEXT[] NOT NULL DEFAULT '{}'`. |
| `fsi-app/supabase/migrations/004_source_trust_framework.sql` | 105 | `idx_sources_jurisdictions` GIN index. |
| `fsi-app/supabase/migrations/004_source_trust_framework.sql` | 150 | `intelligence_items.jurisdictions TEXT[] NOT NULL DEFAULT '{}'`. |
| `fsi-app/supabase/migrations/004_source_trust_framework.sql` | 197 | `idx_items_jurisdictions` GIN index. |
| `fsi-app/supabase/migrations/006_multi_tenant.sql` | 217, 265 | `intelligence_items` recreated under tenant scope — re-declares `jurisdictions TEXT[]`. |
| `fsi-app/supabase/migrations/007_full_brief.sql` | 28, 62 | `intelligence_items` re-declares `jurisdictions TEXT[]`. |

## 11. Out of scope — `user_profiles.jurisdictions`

Listed only to forestall confusion. This is a USER PREFERENCE column added in
migration 027 — it stores which jurisdictions an operator personally watches,
not which ones an intelligence item or source covers. It uses lower-case
slugs from the same legacy vocabulary but is not part of the W1.A dual-write
contract.

| File | Line(s) |
| --- | --- |
| `fsi-app/supabase/migrations/027_user_profiles.sql` | 32, 125-141 |
| `fsi-app/src/components/profile/UserProfilePage.tsx` | 39, 49, 64, 81, 126, 178, 230, 246-250, 325, 331-332, 576, 588, 601, 654 |
| `fsi-app/src/app/privacy/page.tsx` | 49 |

---

## Suggested follow-up work order

1. **Write-side dual-write** — update the 8 callsites in sections 1, 2, and 3
   to call `legacyToIso(jurisdictions)` and write the result to
   `jurisdiction_iso`.
2. **Seed-script dual-write** — bulk-update the 5 seed files in section 9.
   Two of them are SQL; the three `.mjs` files are programmatic and can use
   the helper module.
3. **Read-side display upgrade (optional)** — UI surfaces in section 6 that
   render jurisdiction strings can switch to `jurisdiction_iso` +
   `isoToDisplayLabel()` for cleaner labels (e.g., "United States" instead
   of "us"). The map view (`MapView.tsx`, `jurisdictionCentroids.ts`) is
   the largest beneficiary because ISO 3166-2 codes give us proper
   sub-national pin support.
4. **Filter logic** — `scoring.ts` and `sourceStore.ts` filter predicates
   need to accept either column during the 60-day window, then collapse to
   `jurisdiction_iso` when the legacy column is dropped.
