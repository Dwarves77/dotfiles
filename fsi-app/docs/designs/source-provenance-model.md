# Source Provenance Model — design

**Status:** design, not built. Revision 2 (2026-05-29) strengthens Addition A to active sourcing and expands the invariant to claim-level FACT grounding + analysis-labeling + human verification for CRITICAL/HIGH.

**Architectural ruling 2026-05-29:** **provenance is a hard data-model invariant, not a feature.** An intelligence item without verified source-chain provenance is not a low-quality record — it is an invalid record that must not be in the active table or shown to a customer.

**Standard for the gate:** the system's selling point is accurate data AND analysis of that data. The gate must distinguish three claim tiers and enforce each differently:
1. **FACTS** — true to source, zero fabrication. Span-grounded to an authoritative source. Unsourced fact = fabrication = reject to staging.
2. **ANALYSIS** — permitted and IS the value. Validate that underlying facts are grounded AND that the inference is labeled. Do NOT validate against "the source says this."
3. **LEGAL / REGULATORY INTERPRETATION** — off-limits to the agent. Routes to "Legal Confirmation Required" or fails.

The failure mode the gate MUST catch: analytical inference stated as if it were a sourced fact. "The regulation requires X" when X is the agent's reading of what the regulation implies. Looks like analysis; functions like fabrication.

**Companion audit outputs:** Part 1 B audit (reachability + page-content check on 19 non-source-citing Option C items — complete, 16 of 19 had fabrication-class flags, 16 items pulled 2026-05-29). Part 1 C audit (10-item deep text trace — complete, NGER threshold inconsistency between sibling items confirmed the fabricated-claim-with-real-source failure mode).

---

## 1. The invariant

A row in `intelligence_items` is admissible to the active corpus (visible to customers) only if ALL of the following:

1. **Validated source (criterion 1).** Non-null `source_id` -> row in `sources` with non-null `base_tier` (or `effective_tier`) AND `status` indicating active classification (not provisional, not paused, not retired).
2. **Citation URL grounding (criterion 2).** Every URL emitted in any of the item's `intelligence_item_sections` rows resolves to (a) the item's `source_url`, (b) a URL logged in `agent_run_searches` for the run that wrote this item's content, OR (c) the URL of another row in `sources`.
3. **Claim-level grounding (criterion 3).** Every FACT-class claim in any section is span-grounded: the cited source's actual content contains the asserted fact verbatim or near-verbatim. For CRITICAL and HIGH priority items, every FACT claim's grounding source must be Tier 1 or Tier 2.
4. **Labeling discipline (criterion 4).** Every substantive claim is labeled FACT, ANALYSIS, or LEGAL. ANALYSIS-tagged content must use a recognized label syntax. LEGAL-tagged content routes to the `*Legal Confirmation Required:*` callout or fails the gate. Unlabeled strong assertions on regulatory matters fail the gate.
5. **Active sourcing for stated facts (criterion 5).** No bare unsourced fact and no extrapolation. Every FACT claim is either span-grounded to an authoritative source (criterion 3) OR is replaced by an EXPLICIT GAP statement: `*Specific [figure / date / threshold] not available from primary sources as of [date].*` Silent omission of a slot-required field (effective date, primary deadline, jurisdictional scope, applicable penalty) also fails the gate.
6. **Human verification for CRITICAL + HIGH (criterion 6).** Items at CRITICAL or HIGH priority that pass criteria 1-5 land at `provenance_status = 'pending_human_verify'`, NOT `'verified'`. They are not customer-visible until a reviewer ticks each FACT claim against its source span in the admin verification queue. MODERATE/LOW items at the same gate-pass go directly to `'verified'`.

Items that have NO section content (corpus-miss shells rendering summary + pending-sections affordance) satisfy criteria 2-5 vacuously. They must still satisfy criterion 1.

A row that does not satisfy criteria 1-5 is `provenance_status: 'quarantined'`. Quarantined rows are visible to admins, never to customers.

A row at CRITICAL or HIGH that passes 1-5 but has not been human-verified is `provenance_status: 'pending_human_verify'`. Also not customer-visible.

A row at MODERATE or LOW that passes 1-5 is `provenance_status: 'verified'`. Customer-visible.

---

## 2. Why this supersedes prompt-level enforcement

Prompt rules drift. Manual inserts bypass them. Future code paths forget them. Backfill scripts have their own prompts. The audit-as-forensics burden falls on whoever happens to notice. The Option C audit found 24% of generated items did not cite their input source URL, and the search-result log was discarded — we cannot tell forensically whether the cited URLs were retrieved or invented.

The constraint must live in the database schema and the write path. Prompt language reinforces but does not enforce.

---

## 3. The admission gate

### 3a. Schema gates

> **Block 1 scope = ADDITIVE ONLY** — new columns (with defaults), new tables, the `validate_item_provenance` function, the `set_provenance_status` trigger, the `active_intelligence_items` view. The two `NOT NULL` / `CHECK` constraints below that ALTER **existing** columns are tagged **[POST-RECONCILIATION]**; they are section 4 **step 7**, NOT Block 1. An agent implementing Block 1 task 1.1 must skip the bracketed bullets. Reason: enforcing them in Block 1 would fail or mass-quarantine the existing rows that lack `source_id` before reconciliation has assigned/quarantined them.

- **[POST-RECONCILIATION — NOT Block 1; lands per section 4 step 7.]** `intelligence_items.source_id` becomes `NOT NULL` for `domain IS NOT NULL` (active items in any domain). Existing nullable rows migrated to `provenance_status: 'quarantined'` until a backfill assigns `source_id`. This ALTER cannot run during gate-landing: ~24 active D1 rows currently have null `source_id`, so the constraint would fail or force a mass-quarantine ahead of HARD CHECKPOINT 2. It lands as a distinct step AFTER Phase 2 reconciliation, once the corpus is clean. Block 1 adds only the `provenance_status` column + trigger (additive) — nothing flips.
- New column `intelligence_items.provenance_status` enum: `'verified' | 'quarantined' | 'unverified' | 'pending_human_verify'`. Default `'unverified'` at insert. Trigger sets terminal status only when criteria pass.
- New column `intelligence_items.provenance_verified_at` timestamptz, populated by the trigger or by the admin verification queue.
- New view `active_intelligence_items` filters to `provenance_status = 'verified'`. All customer-facing reads switch to the view.
- **[POST-RECONCILIATION — NOT Block 1; lands per section 4 step 7.]** `intelligence_item_sections.source_ids` becomes `NOT NULL` with default `'{}'`; CHECK requires `array_length > 0` for non-empty `content_md`. Same reason: constraining existing rows is post-reconciliation, not gate-landing. Block 1 may add the column with a default but must NOT add the `NOT NULL` / `CHECK` enforcement against existing data.

**New table `section_claim_provenance` (Addition A core):**

```
id                  uuid PK
section_row_id      uuid FK -> intelligence_item_sections.id
intelligence_item_id uuid FK -> intelligence_items.id  -- denorm for queries
claim_text          text NOT NULL      -- the verbatim claim
claim_kind          text NOT NULL CHECK (claim_kind IN ('FACT','ANALYSIS','LEGAL','GAP'))
source_span         text               -- verbatim quote from the cited source (required for FACT)
source_id           uuid FK -> sources.id  -- which registered source grounds this (required for FACT)
search_result_id    uuid FK -> agent_run_searches.id  -- which search call surfaced the source (optional)
source_tier_at_grounding integer       -- snapshot of source's effective_tier at validation time
extracted_at        timestamptz NOT NULL DEFAULT now()
verified_by         uuid               -- admin user who ticked this claim (Addition D)
verified_at         timestamptz
```

**New table `agent_run_searches` (Addition A enabling table — same as original criterion 2 design):**

```
id                   uuid PK
agent_run_id         uuid               -- the run that originated the search
intelligence_item_id uuid FK -> intelligence_items.id
search_query         text
result_url           text
result_title         text
result_index         int
result_content_excerpt text             -- cached text snippet for span-check; ~2KB
searched_at          timestamptz
```

The `result_content_excerpt` field is added so span-checks can run without re-fetching the page at validation time. The agent's `web_search` returns the excerpt as part of the search result; we persist it.

**Item-type slot requirements (Addition A criterion-5 enforcement):**

A new table `item_type_required_slots` declaratively lists slot fields required for each item_type. For `regulation`:

```
item_type   slot_key                    description
regulation  effective_date              When the regulation enters force
regulation  primary_deadline            The headline compliance deadline (closest in time)
regulation  jurisdictional_scope        Where the regulation applies
regulation  penalty_summary             What the workspace risks if non-compliant
```

Each declared slot must be present in `section_claim_provenance` with either a FACT row (span-grounded) or an explicit GAP row. Missing slots fail the gate.

### 3b. Write-time validation

`public.validate_item_provenance(item_id UUID) RETURNS validation_result` runs whenever an item or its sections are written. It walks all six criteria:

1. **Source validity**: `source_id` non-null AND source has `base_tier IS NOT NULL` AND `status = 'active'`.
2. **URL grounding**: each URL in `content_md` resolves to `source_url`, `agent_run_searches.result_url`, or `sources.url`.
3. **Claim-level grounding** (FACT claims): for each `section_claim_provenance` row where `claim_kind = 'FACT'`:
   - `source_span` is non-null AND non-empty.
   - `source_span` appears (substring or near-verbatim match with tokenization tolerance) in `agent_run_searches.result_content_excerpt` where `id = search_result_id`, OR in a cached fetch of `source_url`.
   - For items at CRITICAL or HIGH priority: `source_tier_at_grounding IN (1, 2)`.
4. **Labeling discipline**: for each `section_claim_provenance` row:
   - `ANALYSIS` claims: the corresponding span in `content_md` is wrapped in a recognized label pattern (`*Per the workspace's reading: ...*`, `*Analytical inference: ...*`, or similar enumerated set).
   - `LEGAL` claims: routed to a `*Legal Confirmation Required:*` callout in s4 or stages-for-review.
   - Unlabeled assertion pattern match: regex-scan section prose for strong-modal verbs (requires, must, mandates, obligates, prohibits, applies to) in conclusory voice without a label nearby. Each match contributes a `unlabeled_assertion` failure.
5. **Active-sourcing / no-bare-fact**: for each `section_claim_provenance` row of kind `FACT` or `GAP`, confirm it covers at least one item-type required slot OR is a non-slot claim that the agent chose to assert. Required slots for the item's type must have AT LEAST ONE row each (FACT or GAP). Missing required slots = failure.
6. **Human verification gate**: for items at CRITICAL or HIGH priority, the trigger sets `'pending_human_verify'` instead of `'verified'`. Only the admin verification queue can flip to `'verified'` after each FACT claim has `verified_by` and `verified_at` populated.

Return shape: `(valid: bool, failures: jsonb[])`. Failures enumerate the specific criterion + payload (claim text, URL, slot name) so staging surfaces the exact problem.

The trigger `set_provenance_status` runs AFTER INSERT/UPDATE on `intelligence_items`, `intelligence_item_sections`, or `section_claim_provenance` and calls the function. Branches:

- All criteria pass, item is MODERATE/LOW: `provenance_status = 'verified'`. Customer-visible.
- All criteria pass, item is CRITICAL/HIGH: `provenance_status = 'pending_human_verify'`. Not customer-visible; admin queue surfaces.
- Any criterion fails: `provenance_status = 'quarantined'`. Insert `integrity_flags` row with failures payload.

### 3c. Application-layer gate

`/api/agent/run` is amended so that immediately after parsing the Sonnet response, it:

1. Persists the agent's `server_tool_use` blocks to `agent_run_searches` (see component 4 / "what becomes possible").
2. Calls `validate_item_provenance(item_id)`.
3. On `valid: false`, writes the brief content into `staged_updates` with `status: 'pending'` and the failures payload. Does NOT write to `intelligence_items`.
4. On `valid: true`, writes to `intelligence_items` + `intelligence_item_sections`. The trigger re-runs validation as defense-in-depth.

Two gates: the trigger (immutable, runs on any write) and the application gate (preferred path, lets the agent route to staged for human review before the trigger ever fires).

### 3d. Manual-insert protection

The trigger fires on ANY write path, including admin SQL, scripts, future Supabase Functions. The only way to bypass is `SET LOCAL session_replication_role = 'replica'` which requires the service role and explicit intent — usable for one-shot migrations, never for application writes. This is the "future code paths forget" failsafe.

---

## 4. Migration plan for the gate

| Step | What | Reversible? |
|---|---|---|
| 1 | Migration: add `provenance_status` enum, `provenance_verified_at` column, default `'unverified'`. No constraint enforcement yet. | Yes (column drop) |
| 2 | Migration: create `agent_run_searches` table + index on `intelligence_item_id`. | Yes |
| 3 | Code: update `/api/agent/run`, `b2-runner.mjs`, `sprint3-a5-sonnet-backfill.mjs` to persist `agent_run_searches`. Ship behind no-op (writes happen, status stays `'unverified'`). | Yes (revert) |
| 4 | Migration: create `validate_item_provenance` function + `set_provenance_status` trigger. Trigger sets `'verified'` or `'quarantined'` but is not blocking. | Yes |
| 5 | Reconciliation: run the audit script that computes provenance status for ALL 294 existing active D1 items, sets `provenance_status` accordingly. (Detailed in section 6.) | Yes (mass UPDATE back to `'unverified'`) |
| 6 | Code: switch all customer-facing reads to the new `active_intelligence_items` view (provenance_status = 'verified'). | Yes (point reads back at base table) |
| 7 | Migration: enable `NOT NULL` on `source_id` for active items (backfill-then-constrain pattern). | Reversible until next step |
| 8 | Code: 139-shell generation pass starts. Writes routed through validation gate. | N/A (forward-only fix) |

Steps 1-4 can ship in one PR; step 5 is a script run; step 6 is the cutover moment; steps 7-8 follow.

---

## 5. Components — gate parts

Six components, organized by the criteria they enforce. The four "Additions" the operator named (A, B, D, C) sit inside these components. **All six are mandatory for Block 1, except per-item authority floor (Component 3 / "Addition C" / Block 1.5) which can ship in a follow-on block.**

### Component 1 — Validated source authority (criterion 1)

**Gate role:** reads `intelligence_items.source_id` and joins to `sources.base_tier`. Source tier set per-source by entity domain, not agent guess.

**What has to be true at generation:** the system prompt receives a slice of the active `sources` registry as context and is required to attach `source_id` UUIDs from that registry to its emitted `section_claim_provenance` rows. The agent does NOT emit free-text tier labels. The renderer joins `source_id` -> `sources.effective_tier` for the displayed badge.

**Effort:** ~5-6h (system prompt update, `/api/agent/run` to inject registry context, parser to validate source_id assignments, renderer change).

### Component 2 — Citation URL grounding (criterion 2)

**Gate role:** walks `intelligence_item_sections.content_md` URLs, cross-checks against `(source_url ∪ agent_run_searches.result_url ∪ sources.url)`.

**What has to be true at generation:** every `web_search` call's queries, result URLs, and result content excerpts persist to `agent_run_searches` at write time. The excerpt field is what makes Component 3's span-check possible without re-fetching at validation time.

**Effort:** ~7-8h (migration for `agent_run_searches`; instrumentation in `/api/agent/run` + backfill scripts; validation function + trigger; staged_updates UI extension for ungrounded URL surfacing).

### Component 3 — Claim-level FACT grounding with active sourcing (criterion 3 + criterion 5 — Addition A strengthened)

**Gate role:** checks `section_claim_provenance` rows of kind `FACT`. Each must have a non-null `source_span` that appears in `agent_run_searches.result_content_excerpt` for the linked `search_result_id` OR in a cached fetch of `source_url`. For CRITICAL/HIGH items, the linked `source_id`'s `effective_tier` must be 1 or 2.

**Active sourcing contract — what has to be true at generation:**

The agent's system prompt is amended with explicit instructions:

> For each quantitative or specific FACT-class claim you would assert (date, deadline, penalty, threshold, article number, jurisdictional scope, named obligated entity), you MUST do one of the following:
>
> 1. If the fact appears verbatim or near-verbatim in your input `source_url` content, emit the claim with `<claim_kind>FACT</claim_kind>`, `<source_span>verbatim quote</source_span>`, `<source_id>{source_url's UUID}</source_id>`.
>
> 2. If the fact does NOT appear in your input source, use `web_search` to find an AUTHORITATIVE source that SPECIFICALLY states the fact. Authoritative for CRITICAL/HIGH items means Tier 1 or Tier 2 in the source registry. Emit with `<source_id>{found source's UUID}</source_id>` and the verbatim span from the found source.
>
> 3. If web_search does not surface an authoritative source with the specific fact, DO NOT extrapolate from on-topic-but-non-stating sources. Instead, emit an EXPLICIT GAP statement: `*Specific [figure / date / threshold] not available from primary sources as of [today's date].*` Mark it as `<claim_kind>GAP</claim_kind>`.
>
> A bare unsourced fact — no span, no gap label — fails the gate and the brief stages for review.

**Effort:** ~12h. Breakdown:
- Schema migration for `section_claim_provenance` (30 min)
- System prompt extensive update for per-claim emission contract (~2h)
- Parser extension in `parse-output.ts` for extractive claim payload (~3h)
- Validation function span-check logic including the search-result excerpt walk (~4h)
- Required-slots enforcement (`item_type_required_slots` table + slot-coverage check in validation) (~1.5h)
- Per-claim tier lookup and CRITICAL/HIGH floor check (~1h)

**Per-item generation cost change:** $0.35 -> ~$0.55 (web_search budget up from ~4 to ~8-15 searches per item, output tokens up ~30-50% for verbatim spans).

### Component 4 — Labeling discipline FACT vs ANALYSIS vs LEGAL (criterion 4 — Addition B)

**Gate role:** for each `section_claim_provenance` row, validates the kind tag matches the surrounding prose pattern. ANALYSIS claims must be wrapped in recognized label syntax in `content_md`. Unlabeled strong-modal assertions in regulatory subjects fail.

**What has to be true at generation:** the system prompt requires every substantive claim to be labeled. ANALYSIS claims use one of an enumerated set of label patterns. LEGAL routes to `*Legal Confirmation Required:*` or to a flag.

**Effort:** ~5h. System prompt update (1h), parser label detection (2h), validation extension for label syntax + unlabeled-assertion pattern match (2h).

**Customer-facing affordance (NEW — Block 4 / surface work):**

`section_claim_provenance.claim_kind` flows through to render time. Customer sees:
- FACT-grounded content in default treatment with source-span accessible via tooltip/popover.
- ANALYSIS-labeled content visually distinct (subtle tint or italic body convention, plus a small `Analysis` tag).
- LEGAL-flagged content in clear callout box.

Operator clarification 2026-05-29: this affordance is part of what the product sells. Compliance teams must see which statements are sourced facts they can rely on directly vs which are our analytical reading to weigh and take to counsel. Cost: ~6h surface work (Block 4 / surface scope, ships with first gated-generation pass).

### Component 5 — Per-item authority floor (Block 1.5 — Addition C)

**Gate role:** for CRITICAL/HIGH items, validates that AT LEAST ONE citation in s15 is Tier 1 or Tier 2. Mostly redundant with Component 3's per-claim floor — if every FACT is span-grounded in a Tier 1-2 source, item-level floor is satisfied. Component 5 catches edge cases (e.g., item whose only Tier 1-2 citations support context but no FACT claims).

**What has to be true at generation:** the agent's system prompt instructs flag-and-stop with `authority_floor_breach: true` for CRITICAL/HIGH items if no Tier 1-2 source can be found at all (after web_search exhaustion).

**Effort:** ~2h. Ship as Block 1.5 follow-on; not on the Block 1 critical path.

### Component 6 — Human verification for CRITICAL + HIGH (criterion 6 — Addition D)

**Gate role:** items at CRITICAL or HIGH that pass criteria 1-5 land at `provenance_status = 'pending_human_verify'`, not `'verified'`. The trigger sets the pending status; only the admin verification queue can flip to `'verified'`.

**Verification UI** (admin queue at `/admin → Items pending verification`):
- Each pending item rendered with its brief + the `section_claim_provenance` rows.
- For each FACT claim: claim text shown next to the `source_span` excerpt + a link to the full source.
- Reviewer ticks each claim as `verified` (correct) or `reject` (claim not supported by source / wrong figure / etc.).
- When all FACT claims for an item are ticked verified, trigger flips item to `'verified'` and customer-visible.
- Any claim ticked reject routes item to `staged_updates` for regeneration.
- Verification log persisted: `verified_by` + `verified_at` on each `section_claim_provenance` row.

**Tier scope** (operator ruling 2026-05-29): both CRITICAL and HIGH gate to this queue. MODERATE and LOW skip and go directly from `'verified'` at trigger time. Operator's reasoning: audit showed fabrication concentrates in HIGH-secondary; verifying CRITICAL alone leaves the dirtiest tier unverified.

**UI design priority** (operator ruling 2026-05-29): per-claim tick mechanism with source span pre-displayed makes verification fast. If verification means "go find the source yourself" it bottlenecks. The corpus grows at the rate the operator can verify, not the rate the agent generates — correct for an accuracy-first product.

**Effort:** ~7.5h. Schema enum extension (30m), trigger logic (1h), admin queue UI with per-claim tick + source pre-display (5h), verification audit log (1h).

### Component 7 — Timeout policy on span-check (operator ruling 2026-05-29)

When validation needs to fetch source content (Component 3 fallback path when `agent_run_searches.result_content_excerpt` is not cached or stale), the policy is:

- Bounded retry: 2-3 attempts with exponential backoff (1s, 3s, 9s).
- On exhaustion: route to `staged_updates`. Do NOT accept the claim because the source was "historically reachable."
- Timeout = UNVERIFIED. Unverified is not verified.

Cost: marginal in Component 3 (a few hours added to validation function for retry logic).

### Component 8 — Analysis-level corroboration / authority signal (DESIGN ONLY — Phase 4 / Intelligence Assistant scope; NOT Block 1; NOT a gate criterion)

**The reframe this rests on.** Caro's Ledge does not assert facts in its own voice. The platform's *output* is ANALYSIS — synthesis and interpretation. The facts underneath are not claims the platform makes; they are sourced INPUTS the analysis is built on. The unit is therefore "analysis, explicitly built on sourced information," not "a free-standing factual claim." Corroboration is an authority signal that attaches to a UNIT OF ANALYSIS — not to individual facts.

**What it records.** For each unit of analysis, how many INDEPENDENT sourced inputs it rests on. An analysis triangulated across several independent sources is higher-authority than the same analysis resting on one. Two states:
- `single_source` — the analysis rests on 1 independent source. VALID, common, NOT penalized. Much regulatory analysis legitimately rests on a single authoritative instrument.
- `corroborated` — the analysis rests on 2+ independent sources.

This is a SIGNAL, not a gate. `single_source` never fails. Component 8 adds NO pass/fail criterion and does not change the six-criteria gate.

**The unit of analysis (schema placement).** The unit is an ANALYSIS-kind row in `section_claim_provenance` (criterion 4). Each ANALYSIS row is extended to declare the sourced inputs it synthesizes and to carry the computed signal:

```
-- added to section_claim_provenance, populated for claim_kind = 'ANALYSIS' rows
analysis_input_claim_ids   uuid[]    -- the FACT/GAP section_claim_provenance rows this analysis is built on
independent_source_count   integer   -- distinct primary-authority identities across those inputs (see below)
authority_signal           text CHECK (authority_signal IN ('single_source','corroborated'))
                                     -- derived: 'corroborated' iff independent_source_count >= 2, else 'single_source'
```

`independent_source_count` and `authority_signal` are SNAPSHOTS computed at generation/validation time (like `source_tier_at_grounding`), so the customer affordance renders without recomputation.

**The load-bearing invariant underneath (criteria 2 + 3 — do NOT relax; MORE important here).** Because the platform's analysis has no independent authority of its own, the analysis is only as trustworthy as its sourced inputs are REAL. An analysis built on an imagined source is worse than a fabricated fact — it launders fabrication through interpretation. Therefore:
- `independent_source_count` is computed ONLY over input FACT claims that have PASSED criterion 2 (URL grounding) AND criterion 3 (span grounding). A non-real or non-span-grounded input contributes ZERO to the count — and the analysis built on it already fails criterion 3 and never reaches a corroboration computation.
- Corroboration is layered ON TOP of the grounding gate. It signals how much real ground the analysis stands on; it NEVER substitutes for the grounding requirement. A high corroboration count cannot rescue an ungrounded input.

**Independence determination (the hard part — explicit). Independence, not source count.** "Corroborated" must mean genuinely INDEPENDENT sources, NOT one fact echoed across outlets. Three trade-press pieces that all derive from one EUR-Lex regulation rest on ONE independent source, not three. Independence is determined by resolving each sourced input to a PRIMARY-AUTHORITY IDENTITY and counting DISTINCT identities — derivative/syndicated sources collapse to the primary authority they report on.

Mechanism:
1. Add `primary_authority_key text` to `sources`: the normalized identity of the underlying first-party authority/instrument a source represents or derives from — e.g. `eu:celex:32025R0040`, `us:fedreg:2024-12345`, `imo:mepc:80/17`.
   - For a PRIMARY source (binding law / regulator guidance — `source_role` primary_legal_authority / standards_body, base_tier 1-2), `primary_authority_key` is its OWN instrument identity.
   - For a DERIVATIVE source (trade_press, news, industry_association commentary, analysis — base_tier 4-6), `primary_authority_key` is the identity of the instrument it reports on, NOT itself. Set at source registration / the Phase 1.5 tier audit, or surfaced by the agent at grounding time when it identifies the instrument a derivative cites.
2. `independent_source_count = COUNT(DISTINCT primary_authority_key)` across the analysis's grounded FACT inputs.
   - Three trade-press inputs sharing `eu:celex:32025R0040` -> one distinct key -> count 1 -> `single_source`.
   - The EUR-Lex regulation itself + an independent ICCT analysis grounded in its own modeling (distinct key) -> count 2 -> `corroborated`.
3. **Conservative default (never inflate).** If an input's `primary_authority_key` is null/unknown, it does NOT add independence — it is folded in at the lowest authority and the count is NOT incremented on its behalf. When independence cannot be established, the signal falls toward `single_source`, never toward `corroborated`. Inflating authority for echoed or unresolved content is the exact "looks better-grounded than it is" failure the gate exists to prevent; the default fails safe.

**Anti-inflation check (the one integrity rule Component 8 adds).** At validation, the asserted `authority_signal` must be consistent with the inputs: `independent_source_count` may NOT exceed `COUNT(DISTINCT primary_authority_key)` over the span-grounded inputs. A generation step that emits `corroborated` whose inputs collapse to one authority is DOWNGRADED to `single_source` (or flagged). This is a downgrade, never a fail — single_source is valid.

**Labeling unchanged (criterion 4 stands).** Corroboration is orthogonal to claim_kind:
- The visible product remains LABELED ANALYSIS (one of the four closed-set labels). Corroboration does NOT promote an inference to FACT — multiple sources strengthen the authority signal; they do not reclassify the analysis as asserted fact.
- LEGAL conclusions still route to `*Legal Confirmation Required:*` regardless of corroboration count. No number of corroborating sources lets the platform make a legal determination.

**Customer affordance.** Alongside the FACT/ANALYSIS/LEGAL affordance (Component 4), an ANALYSIS unit carries its authority signal:
- `corroborated` -> a quiet positive badge, e.g. "Corroborated · N independent sources," expandable to list the N primary authorities (titles + tiers).
- `single_source` -> a NEUTRAL indicator (e.g. "Single source"), never styled as a warning or deficiency. Single-source analysis on one authoritative instrument is legitimate and expected.
The affordance reinforces the product's honesty — "this is our analytical reading, and here is how much independent ground it stands on" — without overclaiming for echoed content or penalizing legitimate single-source analysis.

**Effort (Phase 4 estimate, not Block 1):** ~6-8h. `primary_authority_key` column + backfill heuristics (~2h), independence-collapse logic in the generation/validation step (~2h), anti-inflation check (~1h), customer affordance (~2-3h, ships with the Component 4 affordance).

**Phase-sequence note:** Component 8 is **Phase 4 / Intelligence Assistant scope.** It refines what the gate RECORDS and SURFACES during gated generation; it is NOT a Block 1 task and it does NOT gate (single-source analysis remains valid). It presupposes the Block 1 invariant (criteria 2 + 3 grounding, `section_claim_provenance`) and the Phase 1.5 source-tier audit (authoritative tiers + `primary_authority_key` curation), so it lands with or after first gated generation. **Status: design proposal, awaiting operator sign-off — not yet locked.**

---

## 6. Reconciliation of the 294 active D1 items

### Quarantine projection (revised under expanded invariant)

The revision strengthens criteria from 2 to 6. The quarantine projection grows accordingly.

| Quadrant | Count | Why it quarantines | Pass? |
|---|---|---|---|
| Has sections + has `source_id` | 135 (was 64 + 71 from corpus pre-pull adjustments) | Criteria 2-5 all fail — no `agent_run_searches` logs, no `section_claim_provenance` rows, no labeling discipline, no slot enforcement | NO |
| Has sections + no `source_id` | 11 | Criteria 1 AND 2-5 fail | NO |
| No sections + no `source_id` | 13 | Criterion 1 fails | NO |
| No sections + has `source_id` | 135 | Criterion 1 met; criteria 2-5 vacuous (no sections to validate) | YES |
| **Total** | **294** | **159 quarantine, 135 active** | **54% quarantine** |

The 159 number HOLDS under the expanded invariant because the same items that fail criterion 2 (no search logs) also fail criteria 3-5 (no per-claim provenance, no labels, no slot enforcement). The expansion does not make the existing corpus worse off; it makes the GATE stricter for future generation.

**The Component 6 (CRITICAL/HIGH human verification) does NOT change the reconciliation count.** The 135 items that pass criterion 1 vacuously are shells without section content — they have no claims to verify and go straight to `'verified'` if they're MODERATE/LOW, or to `'pending_human_verify'` if CRITICAL/HIGH. Of the 135 shells passing reconciliation, the priority-mix split: approximately 85 CRITICAL/HIGH shells go to `pending_human_verify` (a 0-claim verification: reviewer ticks "no claims to verify, summary is grounded") and approximately 50 MODERATE/LOW shells go to `'verified'` directly.

**Refined customer-visible count after reconciliation:** ~50 MODERATE/LOW shells visible immediately + ~85 CRITICAL/HIGH shells visible after admin tick. Operator-paced surface; corpus grows at verification rate.

### Two refinements the operator can authorize to lower the quarantine count

**Refinement A — historical-grounding exception:** items with sections whose s15 URLs ALL resolve to `(source_url ∪ sources.url)` are admitted even without `agent_run_searches` logs. Rationale: if every cited URL is either the input source or a known registry entry, the lack of search logs doesn't surface a fabrication risk. Under this refinement: the ~76% of Option C items whose s15 URLs all cite registered sources or source_url move from quarantine to verified. Estimate: 80-100 of the 146 items-with-sections move to verified.

**Refinement B — audit-cleared exception:** items that pass the Part 1 B audit (reachability + page-content check on s15 URLs) and Part 1 C audit (text-internal claim tracing) are admitted with `provenance_status: 'verified_post_hoc'` and a one-time human signoff. Applies to the 80 Option C items specifically since they were the recent batch.

Without refinements: 159 quarantine.
With Refinement A: estimated 60-80 quarantine (only items with unsourced s15 URLs).
With Refinement A + B: estimated 30-50 quarantine (only items that fail audit OR have unsourced URLs OR lack source_id).

The choice is the operator's. I recommend Refinement A (it's mechanical, no audit dependency) plus Refinement B for items that pass the audit.

### Mechanism

1. Migration adds `provenance_status` column with default `'unverified'`.
2. Reconciliation script `scripts/sprint4-provenance-reconcile.mjs` (to be written) walks all 294 items, runs `validate_item_provenance()` against each, sets `provenance_status` to either `'verified'` or `'quarantined'`.
3. For each quarantined item, an `integrity_flags` row is created with `category: 'data_quality'`, `subject_type: 'item'`, `subject_ref: <item.id>`, `description: <list of failing criteria>`, `recommended_actions: [...]`.
4. The view `active_intelligence_items` filters customer reads.
5. No deletes. Items stay in `intelligence_items` for admin review and remediation.

### Remediation paths for quarantined items

| Cause of quarantine | Path back to verified |
|---|---|
| Missing `source_id` | Admin assigns from `sources` registry or creates new entry. Trigger re-validates on UPDATE. |
| Source `base_tier` null | Admin sets tier on the source row. All items pointing to that source re-validate. |
| Has sections, missing search log | Either (a) Refinement A admits if all s15 URLs are in known registries; (b) regenerate the brief through the new gated pipeline (writes search log this time); (c) Refinement B admits if Part 1 audit cleared. |
| Authority floor breach (CRITICAL/HIGH item, no Tier 1-2 citation) | Human sources the primary instrument; admin adds to `sources` or attaches as additional citation. |

### Sequencing dependency

The reconciliation script REQUIRES the gate (steps 1-4 of section 4) to be in place. The reconciliation cannot land before the schema and the validation function exist.

---

## 7. Sprint ordering

### Sprint 4 Block 1 — invariant landing (MUST ship before any further generation)

| # | Task | Effort | Component |
|---|---|---|---|
| 1 | Migration: `provenance_status` enum (incl. `pending_human_verify`), `provenance_verified_at`, `agent_run_searches` (with `result_content_excerpt`), `section_claim_provenance`, `item_type_required_slots` | 1.5h | All |
| 2 | Seed `item_type_required_slots`: for `regulation` (effective_date, primary_deadline, jurisdictional_scope, penalty_summary); for other item_types as appropriate | 30m | C3 |
| 3 | Validation function `validate_item_provenance()` — all six criteria | 6h | C1-C6 |
| 4 | Trigger `set_provenance_status` on `intelligence_items` + `intelligence_item_sections` + `section_claim_provenance`; branches to `verified` / `pending_human_verify` / `quarantined` | 2h | C6 |
| 5 | `/api/agent/run` instrumentation: persist `agent_run_searches` + result excerpts, parse `section_claim_provenance` payload from agent output, call validation, route on failure | 5h | C2, C3, C4 |
| 6 | `b2-runner.mjs` + `sprint3-a5-sonnet-backfill.mjs` parallel updates for the same persistence + validation flow | 3h | All |
| 7 | System prompt update: source-or-explicit-gap contract + per-claim emission contract (FACT span, ANALYSIS label, LEGAL routing) + active-sourcing instructions + slot enforcement awareness | 2.5h | C3, C4 |
| 8 | Parser extension (`parse-output.ts`): extract `section_claim_provenance` payload from agent output; cross-link to `agent_run_searches` for source_id resolution | 3h | C3, C4 |
| 9 | Reconciliation script `sprint4-provenance-reconcile.mjs` (walks 294 items, calls validation, sets `provenance_status`) | 4h | -- |
| 10 | View `active_intelligence_items` filters to `provenance_status = 'verified'` only; cutover customer-facing reads | 2h | -- |
| 11 | `staged_updates` UI extension: surface ungrounded URLs, unverified spans, unlabeled assertions, missing required slots | 3h | C2-C5 |
| 12 | Admin verification queue (`/admin → Items pending verification`): per-claim tick mechanism with source span pre-displayed for each CRITICAL/HIGH pending item | 5h | C6 |
| 13 | Verification audit log (`section_claim_provenance.verified_by`, `verified_at`); record + display verification history | 1h | C6 |
| 14 | Timeout policy for span-check page-fetch (2-3 retries with backoff; route to staging on exhaustion) | 30m | C7 |
| **Block 1 total** | | **~39h** | |

### Sprint 4 Block 1.5 — per-item authority floor (ships after Block 1)

| # | Task | Effort |
|---|---|---|
| 1 | System prompt: per-item authority floor rule + `authority_floor_breach` flag for items where no Tier 1-2 source exists at all | 30m |
| 2 | Validation function extension: per-item floor check (mostly redundant with C3's per-claim floor; catches edge cases) | 1h |
| 3 | Admin queue filter for `source_issue` category | 30m |
| **Block 1.5 total** | | **~2h** |

### Sprint 4 Block 2 — folded into Block 1 component 4

Originally Block 2 was authority floor. That's been split: per-claim floor is in Block 1 Component 3 (mandatory); per-item floor is Block 1.5 Component 5 (independent ship). No separate Block 2 in the revised plan.

### Sprint 4 Block 3 — folded into Block 1 component 4

The two prompt patches (legal-confirmation callout, non-regulatory empty-{}) now ship as parts of Component 4's system prompt update in Block 1 task 7. They are NOT a standalone block.

### Sprint 4 Block 4 — generation under the gate

| # | Task | Effort + cost |
|---|---|---|
| 1 | Customer-facing FACT/ANALYSIS/LEGAL visual affordance (surface work) | ~6h |
| 2 | Pre-run probe: single test generation against known-good item; confirms span-check + slot coverage + label discipline all pass | ~30m + minimal model cost |
| 3 | 139-shell fill via dynamic workflow under the new gated pipeline | per-item ~$0.55 expected, total ~$77 expected; cap ~$150 |
| 4 | Remediation pass on Option C-archived items the operator authorizes for regeneration | ~$25-30 model cost for the 45-55 items |
| 5 | Operator-paced CRITICAL/HIGH verification through the admin queue | open-ended; throughput-limited by reviewer time |

Block 4 cannot start until Block 1 is live AND Reconciliation has run AND operator green-lights at HARD CHECKPOINT 3 with binding cap + expected spend.

### Revised total Block 1 effort: ~39h (vs original 18h)

Block 1 doubles in size to accommodate the strengthened invariant. Block 2 + 3 fold into Block 1's prompt + validation updates. Block 1.5 stays as a small follow-on. Block 4 ships the visual affordance + the generation pass.

---

## 8. Part 1 audit findings (companion deliverables)

### C audit (10-item deep text trace) — complete

Side-agent walked 10 Option C items (3 CRITICAL PRIMARY, 2 CRITICAL SECONDARY, 2 HIGH PRIMARY, 3 HIGH SECONDARY). For each substantive claim across s3/s4/s8/s10/s11/s14, checked traceability to a citation in s15.

**Aggregate:**

- 4 items CLEAN (7a0ead55 FuelEU, 9622fa5d MEPC.377(80), 3ae89ce6 EU HDV CO2, 60bccf36 CalSTA with scope-mismatch caveat)
- 3 items FORMAT-DRIFT only (4c26f34b MARPOL, f72155a2 TCEQ, 8c47cbb2 Queensland)
- 3 items with UNTRACEABLE CLAIMS (e227e2c4 IRU/vans, c41f4c7d CCA Act C2022C00255, f249c2bc CCA Act No. 143)
- 6 untraceable claims total

**Highest-attention findings:**

1. **NGER threshold inconsistency between two CCA Act sibling items.** One says 25,000 t CO2-e; the other says ~50 kt CO2-e for the same Australian National Greenhouse and Energy Reporting threshold. Neither is sourced to NGER Act text. **This is internal factual inconsistency, not just unsourced — the agent invented or misread a quantitative figure**. This is the exact failure mode the invariant prevents at scale.
2. **IRU/vans item** carries 4 specific quantitative claims (German €1,500 fine, Italian €3,328 fine, €2,000/month driver aggregate, Community licence €1,800/€900) with no primary citation. All would fail criterion 2 under the new gate.
3. **CalSTA SB 125** is text-internally clean but the URL anchor (a fraud alert) does only the s3 bullet work; the rest of the content was assembled from auxiliary primary sources that the agent searched up. **Demonstrates the type-confusion case the empty-{} rule must catch in component 3.**

### C audit implication for the invariant

The 3 CRITICAL PRIMARY items are the cleanest — primary EUR-Lex/IMO citations are present and aligned. Items grounded in primary instruments produce traceable content. The fabrication risk lives in SECONDARY-sourced items, especially HIGH priority ones (86% of which are secondary-sourced per the Part 1 audit). Component 3 (authority floor) directly addresses this.

### B audit (19-item URL reachability + page-content check) — complete

Script `audit-optionc-reachability.mjs` walked 287 URLs across the 19 non-source-citing items. Result classes: `FABRICATED_URL` (HEAD non-2xx or redirected to home or timeout), `FABRICATED_METADATA` (URL alive but page title doesn't match cited title), `CLEAN`, `CLEAN_NON_HTML` (PDF or other non-HTML).

**Tally:**

| Class | Count | % of 287 |
|---|---|---|
| CLEAN | 211 | 73.5% |
| CLEAN_NON_HTML | 22 | 7.7% |
| FABRICATED_URL | 39 | 13.6% |
| FABRICATED_METADATA | 15 | 5.2% |

**Item-level: 16 of 19 items (84%) have at least one fabrication-class flag.** 54 fabrications across the 19 items. 3 items clean.

**Caveat on FABRICATED_URL count:** the 15-second per-URL timeout caused several Australian `.gov.au` URLs to abort. Of the 39 `FABRICATED_URL` flags, ~15 are concentrated on the two Australian CCA Act items (c41f4c7d with 10 flags, f249c2bc with 9), most due to timeout. A retry with longer timeout would likely clean some of those. The lower-bound real fabrication count is `FABRICATED_URL - timeout_aborts + FABRICATED_METADATA` ≈ 35-40 unambiguous fabrications. The upper bound is 54.

**Unambiguous fabrications** (URL alive, page content does NOT match cited metadata — these are not timeout artifacts):

- `8767e010` ICAO CORSIA SAF: 2 FABRICATED_METADATA. Cited "ICAO Sustainable Aviation Fuels (SAF) — Main Framework Page" → actual page title "SAF". Cited "CORSIA Eligibility Framework and Requirements for Sustainability" → actual "CORSIA Eligible Fuels".
- `b8b6fde3` NYC LL97: 2 FABRICATED_METADATA. Cited "NYC Administrative Code §28-320" → actual page is "Greenhouse Gas Emission Reporting - Buildings".
- `4c26f34b` MARPOL: 2 FABRICATED_METADATA among 5 total flags. Cited "LR Class News: MARPOL Annex V Reg 10 and Annex VI Reg X" → actual "MARPOL | LR" (generic landing). Cited "EC COM(2025) 431 final EU Position for MEPC/ES.2" → actual generic Commission doc.
- `478ee79c` UK SAF Mandate: 3 flags (2 metadata). Cited "Sustainable Aviation Fuel Bill 2024-25" → URL unreachable. Cited "The UK's SAF Bill and the Revenue Certainty" → actual "Addleshaw Goddard - Unexpected Error" page.
- `e17717c9` DAERA: 1 FABRICATED_METADATA (bluetongue article title divergent from cited title).
- `8c47cbb2` Queensland: 2 FABRICATED_METADATA (Trusts Act 2025 and Trusts Act reform analysis — cited titles don't match actual Queensland legislation portal pages).

This means: **at minimum 15 fabricated citation metadata entries** where the agent generated a citation title/issuer that doesn't match the actual content at the URL it cited. These are not retrievable from training data — they are constructed.

### Combined B + C implications for the 80 Option C items

The 80 Option C items break down as:
- 51 cite their input `source_url` exactly in s15
- 10 cite the source URL at host level but not exactly
- 19 do not cite the source URL at all in s15 (the set B audited)

For the 19-set: 16 of 19 (84%) have fabrication-class flags. Refinement B (audit-cleared admits) does NOT apply to these — they're not clean.

For the remaining 61 (51 + 10): untested by B audit directly. C audit covered 10 items spanning both audited and unaudited sets; of those 10, 4 are CLEAN, 3 are FORMAT-DRIFT, 3 have UNTRACEABLE CLAIMS. Extrapolating naively: ~40% clean, ~30% drift, ~30% with untraceable claims across the full 80.

**Realistic Refinement B admissions**: ~25-35 of the 80 Option C items would survive both audits as `verified_post_hoc`. The other 45-55 require regeneration under the new gated pipeline OR `quarantine` status without remediation.

**Refinement A** (admit items whose s15 URLs all resolve to known registry) is limited by the fact that many cited URLs are not in the registry AND are not reachable. Refinement A admits maybe 10-20 of the 80.

### Combined B + C implications for the 66 pre-Option-C items

Same agent family, same prompt era, same lack of search logging. The fabrication risk pattern likely generalizes. No audit has been run on these items. Without audit: treat as unverified. With an analogous audit batch: similar 40-50% admit rate estimated.

### Revised refinement effectiveness for the 294-corpus reconciliation

| Refinement set | Estimated quarantine |
|---|---|
| Strict invariant, no refinements | 159 |
| Refinement A only (s15 all-registry admits) | ~140 (slight relief) |
| Refinement A + B (audit-cleared post-hoc admits) | ~110-130 |
| All refinements + full regeneration of failed items | quarantine clears as items reach verified, weeks of regen work |

The B audit confirms the architectural premise: the existing corpus has fabrication at meaningful scale (84% of the audited 19 had ≥1 fab), and post-hoc auditing only partially recovers items. The reconciliation is going to result in a materially smaller active corpus until items are regenerated under the new gate. This is the cost of the invariant; the operator accepted it in the ruling.

### Full audit report

Per-item URL-by-URL outcomes: `C:/Users/jason/AppData/Local/Temp/optionc-b-audit.txt` (76 KB, item sections + tally).

---

## 9. What this design does NOT cover

- Tier reassignment of seeded `sources` rows whose `base_tier` is too permissive. Separate dispatch (SOURCE-TIER-AUDIT, Sprint 5).
- OFF-VERTICAL-RECLASSIFICATION Sprint 4 dispatch — distinct concern (item-level vertical relevance, not source provenance).
- CORPUS-RECLASSIFY Sprint 3 follow-up — distinct concern (source-vs-regulation classification confusion).
- INGESTION-BRIEF-GENERATION Sprint 4 candidate — that fix prevents future shells via inline-brief-on-scan-approve. Distinct concern.
- Sources outside D1 (Technology, Regional, Geopolitical, Sources Health, Facilities, Research). The invariant generalizes but the gate has to land per-domain. D1 ships first; other domains follow with the same pattern.
- Workspace-override items (priority overrides, archives, dismissals). These don't write content; they wrap platform items. Invariant applies to platform items only.

---

## 10. Open questions for the operator

All previously-open questions have been answered (refinements rejected for strictness, source_id NOT NULL lands in Block 1, Tier 1+2 floor accepted, hide quarantined items entirely). The operator's revision 2 message answered three additional questions:

- Active sourcing required (not just defensive validation) — IN
- Tier scope for human verification: CRITICAL + HIGH — IN
- Timeout policy: 2-3 retries then route to staging — IN
- Customer-facing FACT/ANALYSIS/LEGAL affordance — IN as Block 4 surface work
- Legal-interpretation pattern-match at validation with false-positive tolerance — IN

Remaining open at revision 2:

1. **Required-slots vocabulary per item_type.** For `regulation`, the slots are effective_date, primary_deadline, jurisdictional_scope, penalty_summary. For other D1 item_types (directive, standard, guidance, framework) the slot set may differ. Operator decides whether to seed all D1 item_types with the same four slots OR per-type customization. Recommendation: same four for D1 in Block 1; refinement in Block 1.5 if customization needed.

2. **ANALYSIS label syntax — enumerated set.** Which label patterns count as recognized for criterion 4? Recommendation: `*Per the workspace's reading: ...*`, `*Analytical inference: ...*`, `*Industry interpretation: ...*`, `*Operational implication: ...*`. Operator approves the set or refines.

3. **Verification queue UX detail.** Should the per-claim tick mechanism support batch ticks (e.g., "verify all 7 claims in this brief at once") or claim-by-claim only? Recommendation: claim-by-claim with optional batch-tick gating on the reviewer reading the source span at least once per claim. Bottlenecking is the point; rushing through batch ticks defeats it.

---

## 11. References

- `fsi-app/src/lib/agent/system-prompt.ts` (current agent contract — to be updated under Block 1)
- `fsi-app/src/lib/agent/parse-output.ts` (current parser)
- `fsi-app/scripts/sprint3-a5-sonnet-backfill.mjs` (Option C generation script — to be updated under Block 1)
- `fsi-app/scripts/audit-optionc-sources.mjs` (current sources audit script, Part 1)
- `fsi-app/scripts/audit-optionc-reachability.mjs` (Part 1 B audit script)
- Memory: `~/.claude/projects/.../memory/project_caros_ledge_corpus_axis.md`
- Memory: `~/.claude/projects/.../memory/feedback_prompt_audit_before_scaled_runs.md`
- Migration framework: `fsi-app/supabase/migrations/004_source_trust_framework.sql` (source tier definitions)
- C audit transcript: in conversation 2026-05-29 (folded into section 8)
- B audit transcript: pending completion at write time
