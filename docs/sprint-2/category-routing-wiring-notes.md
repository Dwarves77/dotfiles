# Sprint 2 Build 4: Category Routing Wiring Notes

Branch: `feat/category-routing-wiring` (from `feat/tier2-ui-hygiene` at `9b97c3c`)

Closes: OBS-26 / REC-OBS-G. Side-effect closure of OBS-36 (Regulations taxonomy bleed).

## Chosen path

**Path 2 (src-side filter refinement).** Routing rules per
`environmental-policy-and-innovation` SKILL.md Section 3 are encoded in
TypeScript in `fsi-app/src/lib/supabase-server.ts`. The three orphan
RPCs (`get_market_intel_items`, `get_research_items`,
`get_operations_items`, defined in migration 070 and refreshed in 071)
are now invoked from app code. A second round-trip joins
`sources.name` and the result is post-filtered to apply the
skill-aligned exceptions.

Path 2 was chosen over Path 1 (migration 084 with refined RPC bodies)
because:

- No DB write coordination required with the concurrent Stage 2 dispatch
  in `dotfiles-stage2` (per operator decision D6 in Sprint 2 planning).
- Routing logic lives in TypeScript where named exception lists are
  easier to evolve as the source registry grows.
- Ships within the worktree's app-code scope. The dispatch's coordination
  note prohibited DB writes; Path 2 honours it.
- When the canonical-category schema column lands in a later sprint
  (separate, larger build), the src-side filter retires cleanly.

## Routing exception lists (skill Section 3 alignment)

The orphan RPCs filter by `source_role` alone, which misroutes specific
sources whose skill-assigned destination differs from their role bucket.
The src-side filter encodes three exception lists:

### 1. Intergovernmental body routed to Regulations (not Research)

Sources matching these names are excluded from `/research` even though
their `source_role = 'intergovernmental_body'` would otherwise place them
there per the orphan RPC. The skill places binding regulatory authorities
in Regulations.

- IMO (International Maritime Organization)
- ICAO (International Civil Aviation Organization)

Regulations does not filter by `source_role` (it uses the full slim
payload), so these continue to surface on `/regulations` without
additional change.

### 2. Trade press routed to Research (not Market Intel)

Sources matching these names are excluded from `/market` and added to
`/research` even though their `source_role = 'trade_press'` would
otherwise place them in Market Intel per the orphan RPC. The skill routes
analytical / horizon-scanning trade press to Research; the discriminator
is analytical depth, not academic publication form.

- FreightWaves (Sustainability branch)
- Loadstar
- GreenBiz
- Environmental Finance
- Splash247 (Green branch)
- Supply Chain Digital
- Edie
- Reuters Sustainable Business (analytical reporting)

Note that the Reuters Sustainable Switch newsletter remains in Market
Intel per the skill; the substring match (`"reuters sustainable
business"`) is precise enough not to capture it.

### 3. Statistical data agency routed to Research (not Operations)

Sources matching these names are excluded from `/operations` and added to
`/research` even though their `source_role = 'statistical_data_agency'`
would otherwise place them in Operations per the orphan RPC. Both
publish quantified climate research, not jurisdictional cost data.

- Carbon Trust
- Project Drawdown

## Implementation summary

### New code (Path 2)

`fsi-app/src/lib/supabase-server.ts`:

- `RESEARCH_BOUND_INTERGOV`, `RESEARCH_BOUND_TRADE_PRESS`,
  `RESEARCH_BOUND_STAT_AGENCY` constant readonly arrays carrying the
  exception lists above.
- `nameMatchesAny()` case-insensitive substring matcher (forgiving
  against minor naming drift in the source registry).
- `fetchSourceNameMap(sourceIds)` builds a `uuid → sources.name` map in a
  single round-trip.
- `rpcRowToResource(row)` translates an orphan-RPC slim+ row into a
  `Resource` (mirrors `fetchWorkspaceResources`'s mapper, minus the
  timeline join).
- `runCategoryRpc(orgId, rpcName, exclude, include)` internal helper.
- `fetchMarketIntelItems(orgId)` calls `get_market_intel_items` then
  excludes `RESEARCH_BOUND_TRADE_PRESS`.
- `fetchResearchItems(orgId)` calls `get_research_items` (excluding
  `RESEARCH_BOUND_INTERGOV`) then merges in trade-press extras and
  statistical-data-agency extras.
- `fetchOperationsItems(orgId)` calls `get_operations_items` then
  excludes `RESEARCH_BOUND_STAT_AGENCY`.

`fsi-app/src/lib/data.ts`:

- Cached wrappers `getMarketIntelItems()`, `getResearchItems()`,
  `getOperationsItems()` keyed by orgId, 60s TTL, tagged `APP_DATA_TAG`
  for lockstep invalidation with `getAppData` / scoped aggregates /
  override mutations.

### Page wiring

`fsi-app/src/app/market/page.tsx` now calls `getMarketIntelItems()` in
parallel with `getResourcesOnly()` (fallback) and the scoped aggregates.
`fsi-app/src/app/operations/page.tsx` parallels with
`getOperationsItems()`. Both pages fall back to the slim payload when
the category RPC returns empty (anon / misconfigured), so the surface is
never blank.

`fsi-app/src/app/research/page.tsx` intersects the existing pipeline
rows (which power the `pipeline_stage` UI control) with the ID
allow-list from `getResearchItems()`. The `pipeline_stage` filter
continues to operate within the category-routed slice.

## Coverage table

| OBS | Status | Routing |
|---|---|---|
| OBS-26 / REC-OBS-G | COVERED (wiring half) | Category routing wired; canonical-category schema column remains separate Sprint 2+ item |
| OBS-36 (Regulations taxonomy bleed) | COVERED (side effect) | /market and /operations no longer share the unfiltered slim payload |
| OBS-9 (Sprint 2 classifier loop) | Orthogonal | Untouched |
| OBS-18 (Market Intel alerts non-interactive) | Foundation only | Sprint 2 Build 7 (Market Intel signal aggregation) |
| OBS-19 (Operations stub chips mis-attribute) | Foundation only | Sprint 2 Build 9 (Operations content) |

## Live verification

NOT VERIFIED. Agent lacks browser automation. Operator verifies via
Claude Chrome by visiting `/market`, `/research`, `/operations` and
confirming the three surfaces show differentiated content per the
mapping above.
