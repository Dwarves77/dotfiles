# Operations lane — spec-from-repo pass: WO-10, WO-11, WO-21, WO-22 (2026-08-30)

**Status: DRAFT, spec-from-repo pass.** Written per the vault gap named in
`docs/plans/connection-redesign-and-build-scope-2026-08-29.md` §4 ("Vault gap, named") and executed
under that scope's §5 executor contract and §6a wave-4 lane model (Operations lane: WO-10 → 11 → 21 →
22, serialized within the lane, parallel to the Market and Research lanes). The lost v1 WO-10/11/21/22
text (never committed, lived only in chat) is **not** reconstructed here — per this lane's hard rule 5,
nothing below is a guess at what that text said. This document is derived fresh from the repository and
the live database (project `kwrsbpiseruzbfwjpvsp`) at worktree commit `c6c228ff`, reasoning forward from
three real, citable artifacts: the still-open gap tables in `docs/specs/04-operations.md` §10 and
`docs/specs/06-gap-register-and-sequence.md`, what `docs/plans/master-execution-plan-2026-08-17.md`
Appendix A and Wave 4 actually shipped, and this session's own reads of the live surface code and the
live database. Every claim is labelled `[FACT]` (file+line or live query, this session), `[INFERENCE]`
(a reasoned conclusion from FACTs, not itself directly observed) or `[UNCONFIRMED]` (stated but not
verified this session), per CLAUDE.md standing rule 14. Where this session's own reads **refuted** a
hypothesis it started from, that is stated in place (rule 14's corollary), not silently dropped — see
WO-21's history below, which is the clearest case of that in this document.

**Self-correction, disclosed:** one read-only `git log -1` was run against this worktree to confirm the
commit hash already given in this lane's task brief (`c6c228ff`) before the author noticed hard rule 1
("NEVER run any git command — not even read-only") forbids this categorically, including read-only. The
hash it returned matched the brief exactly, so no finding in this document rests on that call, and no
further git command was run. Flagged here rather than omitted, per rule 14.

Vault landing path when ratified: this file, at its current path.

---

## 0. Rule 0.15 — live schema and data, re-confirmed this session

Every row below is `[FACT]` from `information_schema` / `pg_catalog` / a live count query against
`kwrsbpiseruzbfwjpvsp`, this session, independent of the master plan's Appendix A (which predates Wave
4). Where this diffs from what the task brief's "critical live context" asserted, the diff is called
out explicitly.

1. **`regional_data_facts` carries the full 11-column envelope, confirmed live** — `value_numeric,
   unit, currency, derivation, origin_class, source_key, source_ref, n_observations, method_version,
   as_at_date, reference_period`, all nullable, plus the `derivation`/`origin_class`/`n_observations`
   CHECK constraints, matching migration `267_origin_class_and_envelope.sql` byte-for-byte (both listed
   in `list_migrations` as applied: `20260830005305 267_origin_class_and_envelope`,
   `20260830020924 268_market_series`). Confirms the brief's claim.
2. **Row population, per region × dimension** (`SELECT r.code, f.dimension, count(*), count(value_numeric), count(source_id), count(origin_class) ... GROUP BY`):
   75 rows total, exactly 5 per (region, dimension) cell for **ASIA, UAE, UK only**, across the 5
   sourced dimensions (`infrastructure, labor_markets, materials_sourcing, operational_cost,
   regional_resources`). **EU = 0 rows, US = 0 rows. `value_numeric` = 0/75 populated. `source_id` =
   0/75. `origin_class` = 0/75.** Confirms the brief's "0 rows populated by producers" claim exactly —
   Wave 4's envelope columns exist but carry no data yet, live or legacy.
3. **`regional_data_facts.status` is populated free text on ~all 75 rows** (`"Available"` ×32,
   `"Constrained"` ×16, `"Tight pool"` ×4, plus ~20 more distinct one-off strings) — a
   real-world-availability read (labour tightness, port congestion, material scarcity), not the spec's
   provenance-status vocabulary. **New finding this session, not in the brief or in Appendix A**: this
   column is selected into `OperationsFact.status` (`supabase-server.ts:2116,2212`) and threaded into
   `region-grid.mjs`'s cell objects (`RegionDimensionMatrix.tsx:92`), but is **never rendered** by
   either consumer (`FactList` in `OperationsLedger.tsx` and the matrix's expanded-row renderer both
   render `fact_label`/`value`/`trend`/source/date only). Seeds WO-10 §1 below.
4. **The WO-17 producers are confirmed kill-switched OFF**, both `ENABLED = false` — literal constants
   in `eurostat-nrg-pc-205-producer.mjs:11` and `bls-oews-producer.mjs:11`, checked before any work
   including `--dry`. `run-envelope-producer.mjs` never bypasses the guarded write path
   (`scripts/lib/db.mjs`'s `guardedInsert`/`guardedUpdate`). Confirms the brief.
5. **`region_dimension_coverage` is kept in sync with `regional_data_facts` by a live DB trigger** —
   `rdf_sync_coverage` (INSERT/UPDATE/DELETE on `regional_data_facts`) →
   `region_dimension_coverage_sync_fact_count()`, which recomputes `fact_count` and flips
   `state` between `missing`↔`populated` automatically, never touching an operator-set `partial`/
   `pending`. **This is a genuine refutation of a hypothesis this session started from** (that the
   detail-page matrix-eligibility gate, `checkMatrixEligibility` in `operations-matrix.ts`, which reads
   `region_dimension_coverage` directly, was a second, drift-prone "two homes" implementation of the
   same coverage truth `region-grid.mjs` computes from raw facts — the same failure class
   `docs/specs/04-operations.md` §10 already named for the pre-WO-9 surface). Measured live: the trigger
   makes the two tables agree by construction on every write, past and future (a WO-17 producer landing
   EU/US rows will flip `region_dimension_coverage` automatically). This is `[REFUTED]`, corrected in
   place rather than dropped — see WO-21's history note. It also means the coverage view **`state`
   values are correct and current**: for `regulatory_feasibility`, all 5 regions show `state='missing',
   fact_count=0` (matches: 0 rows in `regional_data_facts` for that dimension, by CHECK-permitted design
   — D1 is cross-reference-derived, never fact-sourced). For the 5 sourced dimensions: ASIA/UAE/UK show
   `state='populated', fact_count=5` on all 5; EU/US show `state='missing', fact_count=0` on all 5. Zero
   disagreement with the raw facts today.
6. **`state_cost_facts` — 13 rows, 13/13 with `unit`, `source_id`, `statute_citation` populated**, one
   `fact_label` (`"Minimum wage"`) per state, covering **`US-AZ, US-CA, US-CO, US-FL, US-GA, US-IL,
   US-MA, US-NJ, US-NY, US-OH, US-PA, US-TX, US-WA`**. Confirms Appendix A's "13/13 enveloped" claim.
   **New finding this session**: `OperationsLedger.tsx`'s `US_STATE_MATCH` (line 125) only recognises
   **4 states** — `US-CA, US-NY, US-NC, US-TX` — and `US-NC` has **zero** rows in `state_cost_facts` (it
   is not among the 13 codes above). The By-state sub-list only ever renders a state that (a) matched a
   *regulation* by this 4-entry regex **and** happens to also carry a cost fact — so **at most 2 of the
   13 sourced, cited state cost facts (CA, NY) can ever render**, not the "10 of 13" the pre-WO-9 spec
   text estimated; the true number is worse. Seeds WO-10 §1.
7. **`regions` — 5 rows**, `iso_codes` populated for every region: `EU→[EU,DE,NL,BE,FR,IT,ES]`,
   `US→[US,US-CA,US-NY,US-TX]`, `ASIA→[SG,HK,CN,JP,KR]`, `UK→[GB]`, `UAE→[AE]`. Confirmed live; not in
   Appendix A (which only recorded the `regions` column list, not values). Seeds WO-22.
8. **`emission_factors` — 0 rows. `market_series` — 0 rows. `assumption_register` — relation does not
   exist** (confirms WO-20's own greenfield finding still holds; no migration 269 applied yet).
9. **No table or column anywhere in `public` matches `%tco%`, `%breakeven%`, `%payback%`, `%feasib%`,
   `%labour%`, `%corridor%`, `%distance%`, `%npv%`, `%irr%`, `%capex%`, `%opex%`** (two full
   `information_schema` sweeps, zero rows both). Confirms spec 04's TCO/feasibility-gate/labour-chain/
   corridor/distance components (§6 items 5, 6, 7, 8, 9, 10) are genuinely greenfield at the schema
   layer — named in §5 below as anti-scope for this wave, not silently dropped.
10. **`intelligence_items` — 35 rows `item_type='regional_data'`** (23 verified, 12 quarantined) — the
    population `getOperationsItems()` and the detail route serve.
11. **`/api/ask` grounds only on `intelligence_items` and `sources`** — full-text grep of
    `fsi-app/src/app/api/ask/` and `fsi-app/src/lib/agent/` for
    `regional_data_facts|region_dimension_coverage|state_cost_facts` returns zero matches. Confirms
    spec 04 §10's "Assistant coverage" gap is still live. Seeds WO-11.

**No STOP condition triggered.** Every schema claim in the task brief was re-confirmed; the one place
this session's own investigation went further than the brief (finding 5) produced a refutation of a
plausible-looking gap, not a mismatch against the brief itself — handled per rule 14, not a stop.

---

## Lane summary

| Order | WO | What it does | Touches (own) | Depends on | Status today |
|---|---|---|---|---|---|
| 1 | **WO-10** | Ledger data-completeness: render the orphaned `status` field on fact cells; fix the By-state sub-list so all 13 sourced states can appear, not just the 2 that happen to also match a 4-entry regulation regex | `OperationsLedger.tsx` (2 self-contained functions) | nothing | **Ready to execute now** |
| 2 | **WO-11** | Ground the Intelligence Assistant on the three Operations tables it is currently blind to, so the Ask bar's own suggested chips ("Warehouse labor, EU vs US") get a grounded answer instead of a guess | `src/app/api/ask/route.ts` | nothing | **Ready to execute now** — but see the cross-lane file-sharing note in §11 below before starting |
| 3 | **WO-21** | Fix a real, evidenced UI bug: the region card's regulatory-severity colour is painted onto every D2–D6 dimension figure (cost, labour, materials, infrastructure), so a labour-cost number renders in "threshold breached, immediate cost impact" red for reasons that have nothing to do with labour cost | `OperationsLedger.tsx` (2 functions, serializes after WO-10 on the same file) | WO-10 (same file, sequential landing) | **Ready to execute after WO-10 lands** |
| 4 | **WO-22** | Replace the D1 region-grouping regex (`regionForResource`) with the same `regions.iso_codes` crosswalk `operations-matrix.ts` already uses correctly, instead of a second, weaker, duplicated implementation | `OperationsLedger.tsx` (1 function, serializes after WO-21) | ⛔ a 1-line addition to `fetchOperationsCoverage`'s `regions` select in `supabase-server.ts` (reader-lane file) — **not this lane's to make**, see WO-22 §3 | **Blocked on the reader lane** until the `iso_codes` column is added to that select; the rest of WO-22 can be written and reviewed in parallel |

None of the four touches `supabase-server.ts`, `src/lib/operations/**`, or `RegionDimensionMatrix.tsx`
(the reader lane's named territory) for a **write**. WO-22 reads `regions.iso_codes` and therefore needs
that one column added to an existing reader-lane `select(...)` call — flagged as a dependency, not
claimed as this lane's scope, per the task brief's instruction. The bigger, genuinely greenfield spec-04
components — the TCO/breakeven engine, the labour chain, feasibility gates, the materials/PPWR join, and
distance-to-node (finding 9 above) — are **not** in any of these four WOs; they need new schema this
wave's $0/no-migration constraint cannot deliver, and are named as anti-scope in each WO's §5, not
silently dropped.

---

## WO-10 — Operations ledger data-completeness pass

### 1. What the repo actually has today

**The `status` field is fetched, typed, and threaded, and then never shown.** `[FACT]`
- `fsi-app/src/lib/supabase-server.ts:2165` selects `status` from `regional_data_facts`; `:2212`
  assigns it onto `OperationsFact.status` (typed `string | null` at `:2121`).
- `fsi-app/src/components/operations/RegionDimensionMatrix.tsx:92` passes `status: f.status` into
  `buildRegionGrid`'s `facts` array — so it survives into every `cell.facts[i]` object `region-grid.mjs`
  returns (`region-grid.mjs:63-71`, the module stores whatever properties arrive on each fact).
- Neither consumer reads it back out: `FactList` in `OperationsLedger.tsx:768-794` renders
  `f.fact_label`, `f.value`, `f.trend`, `f.source_name`/`f.source_note`. The matrix's expanded-row
  renderer (`RegionDimensionMatrix.tsx:225-240`) renders `f.factLabel`, `f.value`, `f.sourceName`/
  `f.sourceUrl`, `f.lastUpdated`. `.status`/`.status` is read by neither.
- Live values (finding 0.3) are short, human-meaningful phrases — "Constrained", "Tight pool", "Import-
  dependent", "Refused / Blocked" — genuinely useful content sitting on 32-of-75+ rows, currently
  invisible to every customer who reads this surface.

**The By-state sub-list can structurally only ever render 2 of 13 sourced states.** `[FACT]`
- `OperationsLedger.tsx:125-130` — `US_STATE_MATCH` hand-lists exactly 4 states (`CA, NY, NC, TX`), each
  with a regex matched against `${jurisdiction} ${title} ${note}` of a **regulation** row
  (`usStateForResource`, `:132-138`).
- `ByStateSubList` (`:798-901`) builds its `states` array **exclusively** from
  `regs.map(usStateForResource)` (`:813-823`) — i.e., from which US *regulations* happen to name a
  state in their title/note — then looks up a cost figure per matched state from `stateCosts.get(st.code)`
  (`:851`). A state never gets a row unless a regulation ALSO matched it first; the cost table itself is
  never walked.
- Live: `state_cost_facts` has 13 distinct `state_code`s, of which the regex only recognises 4 (`CA, NY,
  NC, TX`), and `NC` has **zero** rows in the cost table (finding 0.6). So the maximum possible render
  today is CA and NY — **2 of 13** sourced, cited, enveloped cost facts, assuming a CA or NY regulation
  also happens to exist and match. This is a live, currently-broken instance of the exact gap
  `docs/specs/04-operations.md` §10 named before WO-9 ("By-state list… Broken… so 10 of 13 sourced,
  cited state cost facts can never render") — measured worse than that estimate, not fixed by WO-9's
  matrix work (WO-9 never touched this sub-list).

### 2. What the WO must do

1. **Render `status`** in `FactList` (`OperationsLedger.tsx`) as a short inline badge or line beneath the
   value (e.g. `Constrained` / `Available`), styled distinctly from `trend` (they answer different
   questions — trend is direction, status is current state) and omitted cleanly when null (most of the
   remaining ~43 rows). Do the equivalent for the matrix's expanded-row renderer **only if** that edit
   can land without needing a WRITE to `RegionDimensionMatrix.tsx` — since that file is reader-lane
   territory, the executor's default posture is: fix the ledger's `FactList` only, and file the matrix
   half as a note for the reader lane (their `grid.byCell[...].facts[i].status` already carries the
   value — it is a one-line render addition on their side, not a new fetch).
2. **Fix the By-state roster.** Build the state list from the union of `{states matched by a US
   regulation}` (existing `usStateForResource` machinery, kept for the regulation-count column) and
   `{states present in `stateCosts`}` (the prop already threaded in as `StateCostFactVM[]`/
   `Map<string, StateCostFactVM>`) — so all 13 sourced states can render, each showing its real cost
   figure, with `0 regs` shown honestly for a state that has cost data but no matched regulation (rather
   than being invisible). **Labels: confirmed, do not depend on the reader lane for this.**
   `state_cost_facts.state_label` is a live, populated column (finding 0.6:
   `"Arizona"`, `"California"`, … all 13 present) but `fetchStateCostFacts()`
   (`supabase-server.ts:2253`) does **not** select it — its column list is `state_code, fact_label,
   value, unit, trend, statute_citation, effective_date, source:sources(name)`, confirmed this session,
   no `state_label`. Rather than adding a second reader-lane dependency alongside WO-22's, extend
   `US_STATE_MATCH`'s existing static `{code, label}` list to all 13 known codes (the labels are fixed,
   well-known US state names — a static map is the right size for a closed, rarely-changing 13-entry
   set, unlike WO-22's region roster which already has a live, correct source to read from).

### 3. Named write set

`fsi-app/src/components/operations/OperationsLedger.tsx` only — specifically the `FactList` function,
and the `US_STATE_MATCH` / `usStateForResource` / `ByStateSubList` functions. Does **not** touch
`RegionDimensionMatrix.tsx`, `region-grid.mjs`, or `supabase-server.ts`. Serializes with WO-21 and WO-22
(same file, different functions) — land WO-10 first, then WO-21 rebases on it, then WO-22.

### 4. Consumers and blast radius

`grep -rn "US_STATE_MATCH\|usStateForResource"` → both symbols are local to `OperationsLedger.tsx`,
unexported, single definition site (confirmed this session). `FactList` is called once, at
`OperationsLedger.tsx:735`. Zero external import sites for anything this WO touches — the blast radius
is contained to this one file's own render output.

### 5. Gates and anti-scope

- Does **not** add a new `state_label` reader-lane dependency unless the executor first confirms
  `fetchStateCostFacts`'s live select list already carries it (check before assuming — flagged above,
  not resolved by this document).
- Does **not** touch the matrix's own fact rendering (reader-lane territory) — files the `status` field
  gap there as a note for that lane rather than writing to `RegionDimensionMatrix.tsx`.
- Does **not** add a numeric/index layer to any cell — `value_numeric` is 0/75 populated (finding 0.2);
  there is nothing to index yet. That remains the reader lane's WO-12-dependent work, gated on WO-17
  producers actually running (⛔ currently OFF — finding 0.4; no ETA in this document's scope).
- Standard gates: canonical suite, `tsc`, fitness 21/0, memory-gate files in the same PR (coordinator).

---

## WO-11 — Ground the Intelligence Assistant on the Operations tables

### 1. What the repo actually has today

**The Ask bar promises cross-region answers the Assistant cannot see.** `[FACT]`
- `OperationsLedger.tsx:472` ships four suggested Ask-bar chips, including `"Warehouse labor, EU vs US"`
  and `"Drayage rates, LA / NY / Rotterdam"` — questions that can only be answered from
  `regional_data_facts`/`state_cost_facts`, not from `intelligence_items`.
- `fsi-app/src/app/api/ask/route.ts` (515 lines, read in full) builds its entire grounding context from
  two sources only: `intelligence_items` via FTS retrieval (`search_intelligence_items` RPC,
  `:230-263`) and `sources` (`:224-229`, `:292`). Confirmed by grep (finding 0.11): zero references to
  `regional_data_facts`, `region_dimension_coverage`, or `state_cost_facts` anywhere in
  `src/app/api/ask/` or `src/lib/agent/`.
- The context assembly point is precise: `dynamicTail` (`route.ts:341-351`) is a template string built
  from `itemsContext` (`:301`) and `sourcesContext` (`:332`), passed as the second (uncached) system
  block (`route.ts:368-374`, alongside the `cache_control`-marked static block). This is a single,
  well-isolated insertion point.
- `/api/ask` is a **cross-surface** endpoint, not Operations-specific: its only two client call sites,
  `AskAssistant.tsx` and `workspaceStore.ts` (confirmed by grep), are the shared shell component the
  static system prompt itself describes as "available on every surface" (`route.ts` system prompt text,
  read in full) — the Ask bar on `/operations` just dispatches the same global open event
  (`OperationsLedger.tsx:390`) every other surface's Ask affordance uses.

### 2. What the WO must do

Extend the `dynamicTail` context assembly in `route.ts` with one additional block, built from the same
three tables `fetchOperationsCoverage`/`fetchStateCostFacts` already read (but via this route's own
`createClient` call, already independent of `supabase-server.ts` — `route.ts:2` imports
`@supabase/supabase-js` directly, it does not import `supabase-server.ts`, so this is not a reader-lane
file conflict):

1. Fetch `regional_data_facts` (join `regions` for the code, same shape `fetchOperationsCoverage` uses)
   and `state_cost_facts` — 75 + 13 live rows today, cheap enough to include in full rather than
   filtering by question relevance (no FTS needed at this scale; revisit if/when WO-17 producers land
   materially more rows).
2. Format a compact `AVAILABLE OPERATIONS DATA` block (mirroring `sourcesContext`'s plain-line style,
   not the citation-marker `itemsContext` style — these rows are not `[Item: ...]`-citable individual
   items, they are background reference data, the same class `sourcesContext` already is) and append it
   to `dynamicTail`.
3. State the coverage gap honestly inside the block itself (e.g. a one-line header: "regions with
   sourced Operations data: ASIA, UAE, UK. EU and US: no sourced Operations data yet.") so a question
   about EU/US labour rates gets an honest "not yet sourced" answer instead of the model inventing one —
   consistent with this repo's own "never impute, state the gap" posture (spec 04 §3, CLAUDE.md rule 2).
4. Do **not** add these rows to the `[Item: ...]` citation-validation regex/set (`route.ts`'s
   `itemMarkerRe` block) — they are not `intelligence_items` rows and have no title to cite by; treat
   them as reference context only, same as `sourcesContext` today.

### 3. Named write set

`fsi-app/src/app/api/ask/route.ts` only. A small new formatting helper may be extracted into a sibling
module if the executor prefers (e.g. `fsi-app/src/lib/agent/operations-ask-context.ts`, **not** under
`src/lib/operations/**`, which is reader-lane territory) — either is acceptable; the fetch and format
logic must not be placed inside `supabase-server.ts` or `src/lib/operations/**`.

### 4. Consumers and blast radius

Single production consumer confirmed by grep: `AskAssistant.tsx` / `workspaceStore.ts`. Because `/api/ask`
is global (not Operations-scoped, finding above), **every** question on every surface gains this extra
context block, not just Operations ones — acceptable given the block's small size (~88 rows formatted),
consistent with `itemsContext`/`sourcesContext` already being global and unscoped by surface. `max_tokens:
1500` (`route.ts`) caps the model's *output*; this WO only grows *input* tokens, marginally, on an
already-metered call this route already makes — not a new metered call, so it does not trigger the $0
STOP rule, but the coordinator should be aware the per-call token cost rises slightly.

### 5. Gates and anti-scope

- Does **not** change retrieval scoring, the citation contract, or `itemsContext`'s FTS mechanism.
- Does **not** add a new RPC or migration — reads `regional_data_facts`/`regions`/`state_cost_facts`
  directly via the route's existing service-role client, the same tables `fetchOperationsCoverage`
  already reads (this WO does not import that function; it re-implements the read locally to avoid
  touching the reader-lane file, per the task brief's instruction to treat reader-lane files as a
  dependency rather than editable scope).
- Does **not** attempt to scope the block to only fire when the user is "on" Operations — no
  page/surface parameter reaches this route today (confirmed: no `surface`/`page` field is read from
  the request body anywhere in `route.ts`), and adding one would be a larger, separate design change
  this WO does not make.
- **Cross-lane file-sharing note, flagged for the coordinator, not resolved here:** `route.ts` is a
  single shared file across all five surfaces. `docs/specs/02-market-intel.md` and
  `docs/specs/03-research.md` do **not** name an equivalent Assistant-blindness gap (grepped this
  session, zero hits for "Assistant" in either file) — so there is no current evidence the Market or
  Research lanes plan a concurrent edit to this same file. But if either lane later decides to add its
  own grounding block (a plausible parallel need, structurally identical to this one), a second
  concurrent write to `route.ts` breaks wave-disjointness (§6a rule 1). Recommend the coordinator land
  WO-11 promptly relative to any Market/Research work that touches this file, rather than letting it sit
  parallel indefinitely.
- Standard gates: canonical suite, `tsc`, fitness 21/0, memory-gate files in the same PR (coordinator).

---

## WO-21 — Stop painting D1's regulatory severity onto D2–D6 dimension figures

### 0. History: what this WO was going to be, and why it changed

This session started from the hypothesis (drawn from `docs/specs/04-operations.md` §10's pre-WO-9
"Region severity Wrong by construction" note, read alongside `operations-matrix.ts`'s independent
`region_dimension_coverage` read) that the detail-page matrix-eligibility gate (`checkMatrixEligibility`)
was a second, drift-prone implementation of the coverage truth `region-grid.mjs` already computes from
raw facts — the same "two truths on one page" failure class the surface spec explicitly warns about.
**Verified live and refuted** (finding 0.5): a DB trigger, `rdf_sync_coverage`, keeps
`region_dimension_coverage.state`/`fact_count` in sync with `regional_data_facts` automatically on every
write, past and future — including a future WO-17 producer landing EU/US rows. There is no live
divergence today and no plausible future divergence this trigger doesn't already close. Per rule 14's
corollary, this refutation is recorded here rather than silently dropped, and **WO-21 is redirected** to
a different, still-live, confirmed bug this session found while reading the same file.

### 1. What the repo actually has today

**One region-level severity colour is applied to every dimension's headline figure, regardless of what
that dimension is about.** `[FACT]`
- `OperationsLedger.tsx:515` — `const chipSev = deriveRegionSeverity(regs, region.severity);` — computed
  **only** from the region's *regulations* (`deriveRegionSeverity`, `:149-164`, walks `r.severity`/
  `r.priority` on `Resource[]` regulation rows; has no input from cost/labour/materials/infrastructure
  facts at all).
- `:630` — `const meta = SEV_META[chipSev];` inside `RegionCard`.
- `:665` — `regionHue={meta.hue}` is passed to **every** `DimensionCell` in the 2-column dimension grid
  (`:658-670`, the `.map(DIMENSIONS...)` loop), with no per-dimension branching.
- `:724` — `DimensionCell` renders the fact's headline figure in exactly that colour:
  `<span style={{ ..., color: regionHue, ... }}>{figure}</span>`, for D2 through D6 alike.
- Net effect: a "Materials sourcing" figure, a "Labor markets" figure, and an "Operational cost" figure
  in one region card all render in the SAME colour as that region's worst-regulation severity — under
  the platform-wide severity vocabulary (`SEV_META`) whose labels read "Critical: threshold breached,
  immediate cost impact." A labour-cost number has no relationship to a regulatory threshold; painting
  it in that colour asserts one that does not exist. This is the live instance of exactly the finding
  `docs/specs/04-operations.md` §10 named ("derived from the worst regulation in the region, then
  painted onto every dimension figure, under a severity vocabulary that reads 'threshold breached,
  immediate cost impact'") — confirmed still present, not touched by WO-9 (WO-9 built the matrix
  alongside this code, not instead of it).
- D1's own cell (`isD1` branch, `:728`) does not use `figure`/`regionHue` for a numeric value at all (D1
  has no headline figure — `:715`, `figure` is `null` when `isD1`) — so the bug's practical harm is
  confined to D2–D6's headline numbers, exactly the dimensions that carry real sourced data today.

### 2. What the WO must do

Stop deriving D2–D6's figure colour from the region's regulatory severity. Two defensible options,
either acceptable (recommend the first as the smaller, more honest change):
1. **Neutral figure colour for D2–D6.** Render the headline figure in the same primary text colour used
   elsewhere on the surface (`var(--color-text-primary)`), reserving `regionHue`/`SEV_META` strictly for
   D1 and for the region chip itself (its own explicit purpose). This is the honest reading: these
   figures do not carry a severity judgement today (no scoring model exists — spec 04 §1 explicitly
   forbids scoring feasibility, and no cost/labour severity model exists for the other dimensions
   either), so they should not visually claim one.
2. **A dimension-appropriate signal**, if the executor judges it valuable and cheap: colour a D2–D6
   figure by its own `trend` (`up`/`down`/`flat`, already on `OperationsFact` and already rendered as an
   arrow in `FactList`) rather than by the unrelated region severity — but only if this can be done
   without inventing a new severity model, which would exceed this WO's $0/no-new-model scope.

### 3. Named write set

`fsi-app/src/components/operations/OperationsLedger.tsx` only — the `RegionCard` and `DimensionCell`
functions (the `regionHue` prop and its one call site). Serializes after WO-10 (same file); lands before
WO-22 (also same file).

### 4. Consumers and blast radius

`grep -n "regionHue"` → defined and consumed only inside `OperationsLedger.tsx` (confirmed this
session); not exported, not read by `RegionDimensionMatrix.tsx` or any other file. Zero external blast
radius — this is a self-contained rendering fix.

### 5. Gates and anti-scope

- Does **not** build a cost/labour/infrastructure severity model — deliberately renders these figures
  with no severity claim rather than fabricating one, per spec 04 §3's "never impute" posture applied to
  visual signalling, not just to data values.
- Does **not** touch D1's rendering, the region chip's own colour, or the severity tiles at the top of
  the page (`SeverityTile`) — all correctly scoped to regulation severity already, unaffected by this
  bug.
- Does **not** touch `region-grid.mjs`, `RegionDimensionMatrix.tsx`, or `checkMatrixEligibility` — the
  hypothesis that originally motivated a change there is refuted (§0 above).
- Standard gates: canonical suite, `tsc`, fitness 21/0, memory-gate files in the same PR (coordinator).

---

## WO-22 — Region grouping via the canonical `iso_codes` crosswalk, not a duplicated regex

### 1. What the repo actually has today

**Two different implementations resolve "which region does this item belong to," and only one of them
uses the canonical data.** `[FACT]`
- `OperationsLedger.tsx:104-120` — `REGION_MATCH` (a hand-written `Record<string, RegExp[]>`, e.g.
  `EU: [/^eu$/i, /european union/i, /\bgermany\b/i, ...]`) and `regionForResource(r)`, which regex-tests
  `${r.jurisdiction} ${r.title}` — **`r.jurisdiction`, the single flattened string** (`Resource.jurisdiction`),
  never `r.jurisdictionIso` (the structured `string[]` field that exists on the same type,
  `types/resource.ts:185`, and is already populated from the DB's `jurisdiction_iso`/`jurisdictions`
  column elsewhere in the data layer — `supabase-server.ts:1051`, `:2517`). This is the function that
  groups every regulation into a region card for the D1 cross-reference count (`OperationsLedger.tsx:291-299`).
- `fsi-app/src/lib/agent/formats/operations-matrix.ts:121-151` — `resolveItemRegionCodes`, the detail
  page's jurisdiction resolver, does this properly: it reads the item's **actual** `jurisdictions` array
  (or the single `jurisdiction` fallback), and matches each code against **`regions.iso_codes` UNION
  `regions.code`** (`:139-142`, `new Set([region.code.toUpperCase(), ...region.iso_codes.map(...)])`) —
  the real crosswalk, live-populated (finding 0.7: `EU→[EU,DE,NL,BE,FR,IT,ES]`, `US→[US,US-CA,US-NY,US-TX]`,
  `ASIA→[SG,HK,CN,JP,KR]`, `UK→[GB]`, `UAE→[AE]`).
- Live data (finding 0.9's companion query, sampled regulation rows) shows `jurisdictions` values arrive
  in **both forms** — sometimes a raw region code (`"EU"`, `"ASIA"`, `"GLOBAL"`) and sometimes an ISO
  sub-code (`"SG"`). `resolveItemRegionCodes`'s `UNION region.code` handles both forms correctly by
  construction; `regionForResource`'s regex list handles each case only insofar as someone remembered to
  write a pattern for it (e.g. it has no pattern that would ever match a raw `"SG"` token, only the
  literal words "Singapore"/"Hong Kong"/"Asia" appearing in title text) — a second, independently
  maintained, strictly weaker copy of the same lookup `operations-matrix.ts` already gets right.
  Labelled `[FACT]` for the duplication itself and the described weakness; labelled `[INFERENCE]` for
  "this causes a specific wrong grouping in production today" — no single failing example was traced
  end-to-end this session (would require running the live `getResourcesOnly`/`getOperationsItems`
  pipeline, out of this document's read-only scope), so that stronger claim is not asserted as fact.

### 2. What the WO must do

Replace `regionForResource`'s regex map with a lookup built the same way `resolveItemRegionCodes`
already does it: for each region, build `{region.code.toUpperCase(), ...region.iso_codes}`, then match
the resource's `jurisdictionIso` array (falling back to its single `jurisdiction` string only when
`jurisdictionIso` is empty, mirroring `operations-matrix.ts:127-132`'s own fallback order) against that
set. This removes the free-text-regex dependency entirely for the cases where structured jurisdiction
data exists, keeping title-text matching only as the documented last resort. Do **not** change
`resolveItemRegionCodes` itself (reader-lane-adjacent risk is low there — it is not a file the reader
lane claims — but this WO's job is to make `OperationsLedger.tsx` consistent with the existing correct
implementation, not to refactor that implementation further).

### 3. Named write set, and the one dependency this WO cannot resolve itself

`fsi-app/src/components/operations/OperationsLedger.tsx` only — the `REGION_MATCH`/`regionForResource`
function (replaced) and the `Region` roster construction (`useMemo` at `:223-235`, which currently
builds `{key, label, severity}` from `operationsCoverage.regions` — needs `iso_codes` added to make the
crosswalk possible client-side).

**⛔ Dependency, not this lane's scope:** `operationsCoverage.regions` is populated by
`fetchOperationsCoverage()` in `supabase-server.ts:2154-2156`, whose `regions` query selects
`"id, code, label, severity, display_order"` — **`iso_codes` is not in that list**, and
`OperationsRegion` (`supabase-server.ts:2100-2106`) has no `isoCodes` field to carry it even if it were.
Both are inside `supabase-server.ts`, which this lane may read but not write (task brief, "critical live
context"). **WO-22 cannot land its own fix until that one column is added** to an existing select list
and threaded onto `OperationsRegion`/`OperationsCoverageData` — a small, low-risk, one-line-plus-one-field
change, but not this lane's file to make. Two ways forward, for the coordinator to choose between (not
resolved by this document, per its own §7 discipline):
1. Ask the reader lane to add `iso_codes` to `fetchOperationsCoverage`'s regions select (cheapest, keeps
   one canonical read of `regions`).
2. Have WO-22 do a small, clearly-commented, independent `regions.select("code, iso_codes")` read
   directly in `fsi-app/src/app/operations/page.tsx` (which this lane does not consider reader-lane
   territory — it is not `supabase-server.ts`, `src/lib/operations/**`, or a matrix component) and pass
   `isoCodes` down as a new prop alongside the existing `operationsCoverage` prop, accepting a second,
   narrower read path for this one field rather than waiting on the other lane.

### 4. Consumers and blast radius

`grep -rn "REGION_MATCH\|regionForResource"` → both local to `OperationsLedger.tsx`, single definition,
single call site (`:295`, inside the `regsByRegion` `useMemo`), confirmed this session. `regsByRegion` in
turn feeds the D1 cross-reference count shown on every region card and in the right-rail "By dimension"
D1 row (`dimCoverage.regulatory`, `:356-361`) — the only downstream consumers, both inside this same
file, both already read by the WO-9 grid module read-only (`crossRefCountsByRegion`, passed into
`buildRegionGrid` as an opaque count, not recomputed by it) — so a corrected region assignment changes
which region a given regulation is counted under, but does not change any code path outside this file.

### 5. Gates and anti-scope

- Does **not** modify `regions.iso_codes` data, `resolveItemRegionCodes`, or any reader-lane file.
- Does **not** claim a specific live misclassification was found and fixed — the finding is architectural
  (duplicated, weaker logic) and labelled `[INFERENCE]` for real-world impact, not `[FACT]`; the fix is
  justified by removing the duplication and using already-correct, already-existing logic, independent
  of whether a concrete wrong grouping can be demonstrated today.
- **This WO is BLOCKED until the §3 dependency is resolved one way or the other** — it should not be
  started by an executor before the coordinator picks option 1 or 2 above.
- Standard gates: canonical suite, `tsc`, fitness 21/0, memory-gate files in the same PR (coordinator).

---

## Consolidated open rulings

1. **WO-22's `iso_codes` dependency** — reader-lane addition to `fetchOperationsCoverage`, or a small
   independent read in `operations/page.tsx`? *Recommendation: ask the reader lane first (cheaper, keeps
   one canonical `regions` read); fall back to the independent read only if that lane's own scope or
   timing makes the ask impractical.* Tradeoff: asking costs a small coordination step; the independent
   read costs a second, narrower `regions` read path that could itself drift from the canonical one
   later (a smaller version of the same duplication WO-22 is fixing elsewhere in this file).
2. **WO-10's state-label source** — resolved by this document, not left open: `state_label` is confirmed
   live but not in `fetchStateCostFacts`'s select (§ WO-10 §2); use a static 13-entry code→label map in
   `OperationsLedger.tsx` rather than asking the reader lane for a second column addition. Recorded here
   only as a tradeoff, not a question: a static map is one more place a state's display name could drift
   from the DB's own `state_label` if that column is ever corrected, however small a risk for 13 fixed
   US state names.
3. **WO-11's shared-file risk with Market/Research** — no evidence today (§ WO-11 gates) that another
   lane plans to touch `route.ts` concurrently, but it is a single shared file across all five surfaces.
   *Recommendation: land WO-11 promptly once it and its coordinator-side review are ready, rather than
   letting it sit open in parallel with other lanes' work indefinitely.* Tradeoff: prompt landing means
   less batching of `route.ts` changes into one PR if Market/Research do turn out to want the same kind
   of change soon after.
4. **WO-21's colour choice for D2–D6** (§2, option 1 vs 2) — *Recommendation: option 1 (neutral colour)*,
   because option 2 risks reading as a second, informal severity signal (trend-as-colour) on a surface
   whose own spec (04 §2) explicitly warns against composite/implied severity signals that are not
   transparently constructed. Tradeoff: option 1 is visually flatter; option 2 is marginally more
   informative if a reader already understands trend arrows, at the cost of one more implicit colour
   convention on the page.

No other question in the four WOs above required an operator ruling — the repository and the live
database answered them directly, per this document's own rule 6 (do not manufacture questions the repo
answers).
