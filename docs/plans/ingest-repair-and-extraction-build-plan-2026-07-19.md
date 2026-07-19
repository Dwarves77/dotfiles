# Ingest Repair + Complete-Extraction Build Plan (2026-07-19, Session E, Step 2)

> **PLAN ONLY. Nothing in this document executes until the operator rules on it.** It builds no code,
> mints nothing, grounds nothing, applies no migration. It is the phased, costed build plan the Step 1
> recovery mandate called for, grounded in the behavioral audit
> ([ingest-behavioral-read-2026-07-18](../audits/ingest-behavioral-read-2026-07-18.md)) and nothing else.
> Every pipeline claim below is cited to a Step 1 finding (F-number / D-number) or to code.

**Authority.** Step 1 ruling (operator, 2026-07-18): zero restorations accepted, findings accepted, the
strong list fenced. [ADR-015](../decisions/ADR-015-restore-source-monitoring-supersede-adr-012.md)
(source-monitoring is the operating design). The structural addition the operator set: a REPAIR PHASE
opens the plan, because complete extraction multiplies document volume through this pipeline and must not
scale its verified flaws with it.

**Live grounding (queried 2026-07-19, project kwrsbpiseruzbfwjpvsp).** 276 live items; 367 sources back at
least one live item, 190 back a verified item, 20 back more than one item; 1294 sources total;
`coverage_gap_candidates` 109 (Session C census: 106 MISSING / 2 HAVE_QUARANTINED / 1 AMBIGUOUS); drain
queue 66 rows; `system_state.scrape_cadence=off` (the app is in the dormant cadence-off state, so no fetch
fires today).

---

## The load-bearing strong list (fenced; no phase modifies these)

Per the Step 1 report and the operator ruling, these are correct and are NOT to be modified by anything in
this plan. Each phase states below how it preserves them.

| Strong element | Where it lives | Invariant it holds |
|---|---|---|
| Non-destructive apply | `applyLedgerDiff` (ledger-apply.mjs) | a re-ground never deletes a claim; add/version/keep only |
| Dominance guard | `ledgerRegression` (ledger-dominance.mjs) | a weaker re-ground applies nothing |
| Four mint gates | mint-gates.mjs + defect-signatures.mjs | S-CONFLATE hard hold, S-NUMERIC soft, authority-floor, generic-source |
| Target-match | target-match.mjs | wrong-instrument = hard hold |
| The moat | `tierOfSource = base_tier ?? null` (institution.ts) | reputation never confers grounding eligibility (SC-9) |
| Fail-closed audit gate + preflight | audit-gate.ts, generate-brief.ts preflight | a gate that cannot verify state does not let generation proceed |
| Error-body gates | captureForStorage (write-side) + partitionErrorBodies (read-side) | junk bodies never stored, never grounded |
| Single mint chokepoint | `mintIntelligenceItem` (mint-item.ts) | the only `intelligence_items` INSERT in src (verified Part II) |

**Preservation is by construction, not promise.** No phase edits these files' gate logic. Phase R fixes the
CHANGE-path of ledger-apply (F5) and the tier-stamp in verification.ts (F4); both are additive hardening
that make the surrounding guarantees stronger, and each carries a test asserting the fenced behavior still
holds (stated per fix). The plan adds callers and seams around the strong list; it does not reach inside it.

---

## Existing-first legend

Every component below is tagged **USES** (calls an existing thing unchanged), **EXTENDS** (adds to an
existing thing), or **NEW** (genuinely new seam), each with the Step 1 finding that is the check evidence
the existing thing is real.

---

# PHASE R — REPAIR (first, small, bounded)

The gate: no capability build (Phase 1+) starts until Phase R merges. Phase R touches only the verified
defects; it does not add features. It is deliberately small.

## R.1 — F3: give the live workflow a permanent snapshot + move criterion 3 onto durable storage

**The defect (Step 1 F3, answer 3).** The live `/api/agent/run` workflow never calls `writeSnapshot`; only
operator acquire scripts do. And `validate_item_provenance` criterion 3 checks each FACT span against
`agent_run_searches.result_content_excerpt` — the char-capped pool that is DELETE-then-INSERT replaced every
generate (F3, answer 3, the critical coupling). Grounding validity rides a replaceable char-capped pool, not
the permanent snapshot.

**Build.**
- **R.1a — snapshot writer on the live path. EXTENDS** `writeSnapshot` (snapshot-store.mjs:95, exists per
  F3) — call it, do not rewrite it. The seam: in `generateBrief` after the pool is persisted
  (canonical-pipeline.ts:922), write each fetched primary+corroborator body to `raw_fetches` via
  `writeSnapshot(sourceId, fetchResult)`. This is the I3 writer the audit found missing on the workflow path
  (F3). The fetch already carries `truncated`/`fullLength` (D2-adjacent, canonical-fetch reports both), so
  the snapshot stores full bodies; a body over the storage cap raises a `truncation-guard` integrity_flag
  (the existing no-silent-truncation discipline), never a silent slice.
- **R.1b — criterion 3 reads durable storage. EXTENDS** `validate_item_provenance` (the six-criteria DB
  function, exists per Step 1 section 2). Criterion 3 today substring-matches the FACT span against
  `agent_run_searches.result_content_excerpt`. Change: match against the durable snapshot body
  (`raw_fetches` via `file_path`), falling back to the pool excerpt only when no snapshot row exists yet.
  This is a migration to the DB function, not a code-path rewrite.

**Blast radius + the no-unexamined-flip proof (operator required this explicitly).**
- Every currently-verified item was verified against the pool. Moving the check to a superset store (the
  full snapshot ⊇ the char-capped excerpt) can only make a span MORE findable, never less — a span that was
  a substring of the capped excerpt is a substring of the full body. So the migration is monotonic in the
  safe direction: no verified item can flip to quarantined because the span text got longer.
- The one exception is an item that today has NO snapshot (F3: most live items, snapshot is scripts-only).
  The fallback-to-pool clause (R.1b) keeps those exactly as they are until Phase 1 backfills their snapshot.
  So the flip set on the migration alone is provably empty.
- **Proof obligation, mechanical, before the migration is accepted:** a read-only prover script runs the new
  criterion-3 logic against every verified item and asserts zero would flip; it is the migration's gate (RD:
  probe-first blast radius). The migration does not merge until the prover returns 0.

**Preserves the strong list:** criterion 3's tier-floor half (`COALESCE(tier_override, base_tier) ≤ floor`)
and the moat are untouched; only the span-storage source changes. The error-body gates still run before a
body reaches `writeSnapshot` (captureForStorage), so no junk is snapshotted.

**Test.** (1) The prover (zero-flip). (2) A generate run asserts a `raw_fetches` row now exists for the
item (the I3 invariant, newly true on the live path). (3) A right-failure test: a FACT span absent from the
snapshot quarantines, present verifies.

## R.2 — F4 + F18: one tier discipline (close the moat crack)

**The defect (Step 1 F4, F18).** `verification.ts executeAction` (:634-645) stamps `base_tier` from a
Haiku-guessed `ai_trust_tier` on a LIVE path (bulk-import, verified F4), while `registerCitedSources`
(source-growth.ts, F4) forbids exactly that (deterministic-only, ambiguous hosts worklisted). `bulk-approve`
drifts further (F18): no vertical-fit gate, hardcoded `intelligence_types:["GUIDE"]`, no `source_role`,
cached-guess tier.

**Build.**
- **R.2a — verification.ts conforms to the deterministic rule. EXTENDS** `classTierForHost` /
  `decidePoolHostRegistration` (source-growth.ts, the deterministic tier resolver, exists per F4). Replace
  the `ai_trust_tier → numericTier` stamp (verification.ts:634-645) with a call to the same deterministic
  resolver: an institution-group match INHERITS the canonical tier, a codified host-class rule applies its
  class tier, and an AMBIGUOUS host is NOT stamped — it worklists (the SC-13 rule the sibling already
  obeys). Haiku's relevance/freight scores still gate WHETHER to register; they never set the tier VALUE.
- **R.2b — bulk-approve conforms to decide. EXTENDS** the `canonical-sources/decide` route (F18, the
  correct sibling exists). Port decide's three missing gates into bulk-approve: the vertical-fit gate, the
  `source_role` write (via `classifySourceRole`), and `intelligence_types:[]` (trigger-derived, not the
  hardcoded GUIDE placeholder). Tier still comes from the cached classification, but R.2a's rule binds it:
  a cached-guess tier on an ambiguous host worklists rather than stamps.

**Blast radius.** New sources only; no existing source's `base_tier` is rewritten by this change (that would
be a separate, larger reconciliation, named as a NAMED GAP for a follow-on tier-audit sweep, not done here).
The moat resolver `tierOfSource` is untouched — this fix removes a way to feed it a guessed value, it does
not change how it reads.

**Preserves the strong list:** this hardens the moat (SC-9) by closing an intake that fed it guessed tiers.
`tierOfSource = base_tier ?? null` is unchanged.

**Test.** An ambiguous host through both `verifyCandidate` and bulk-approve asserts NULL base_tier +
worklist row, never a stamped tier. A codified host asserts the inherited/class tier. A retired off-vertical
host through bulk-approve asserts rejection (the ported vertical-fit gate).

## R.3 — F5: applyLedgerDiff CHANGE path fail-closed

**The defect (Step 1 F5).** On the CHANGE branch, if the `claim_versions` archive insert fails,
ledger-apply.mjs:127 warns then :129 STILL overwrites the current row — prior attribution lost. The header
claims fail-closed; only the erase path (:152) actually is.

**Build. EXTENDS** `applyLedgerDiff` (ledger-apply.mjs, the single writer, exists per F5). Make CHANGE match
erase: if the `claim_versions` archive insert fails, THROW before the current-row update, so no overwrite
happens without a durable prior version. One-line-class change (warn → throw), matching the file's own erase
path and header.

**Blast radius.** Only the failure branch changes; the happy path is identical. A re-ground that would have
silently lost history now hard-fails and the item stays as-is for retry — strictly safer.

**Preserves the strong list:** this IS the non-destructive-apply guarantee; R.3 closes the one hole the
audit found in it. Nothing else in `applyLedgerDiff` moves.

**Test.** Inject a `claim_versions` insert failure on a CHANGE; assert the current row is unchanged and the
call throws (right-failure-forced). Assert the happy path still versions-then-updates.

## R.4 — F6: plan-intake fails closed or is retired

**The defect (Step 1 F6).** `planIntakeCycle` (plan-intake.ts:46) drops the read error (fails OPEN → empty
corpus → every candidate reports `would_mint`) and does not model the source-link invariant, so its dry
verdict drifts from the real mint (which fails CLOSED).

**Recommendation: RETIRE plan-intake, do not repair it.** The check evidence: the real mint chokepoint
`mintIntelligenceItem` (mint-item.ts, verified strong, the single INSERT) already computes the exact
disposition (idempotency / dedup / source-link / would-mint) fail-closed. A parallel dry-planner that
re-derives the same logic is a second source of truth that will drift again (it already has, twice, per F6).
The dry information plan-intake was meant to provide is obtainable by running the real mint in a **dry-run
mode** — the same chokepoint with the final INSERT guarded by a `dryRun` flag, returning the disposition it
WOULD take. One code path, no drift by construction (class-over-instance: the recurring drift is made
impossible, not re-patched).

- **R.4. EXTENDS** `mintIntelligenceItem` (mint-item.ts, exists, strong) — add a `dryRun` param that runs
  every gate and returns the disposition without the INSERT. **Delete** plan-intake.ts. Any caller of
  `planIntakeCycle` repoints to `mintIntelligenceItem(candidate, {dryRun:true})`.

**Blast radius.** plan-intake has limited callers (staged-update preview surfaces); each repoints. The mint
chokepoint gains a branch that skips its final INSERT — the branch is exercised by the dry path only, so the
live mint is unchanged.

**Preserves the strong list:** the chokepoint stays the single INSERT; the dry branch cannot insert. This
makes the chokepoint the ONE source of both real and dry dispositions.

**Test.** Dry-run over a known unsourced candidate asserts the SAME `unsourced` reject the live mint gives
(the drift F6 found, now impossible). A dry-run asserts zero rows written.

## R.5 — Triage of the remaining findings (Phase R stays small)

One line each: **fix-in-R**, **fix-with-next-touch** (the phase that naturally touches that file fixes it),
or **accept-as-documented**.

| Finding | Decision | Justification |
|---|---|---|
| F13 state-min-wage dry-run writes sources | fix-in-R | One-line gate move (registerSource behind `--execute`); a dry run writing a source is the same error class as F6 (fail-open dry path); cheap to fix while we are in the repair mindset. |
| F14 EIA price rows no source FK | fix-with-next-touch | The Phase 3 Operations/Market feed wave touches the price feeds; fold the source-FK write + NaN-check there, where the feed is re-specced against snapshot-first anyway. |
| F15 census-run live-pass all-or-nothing | accept-as-documented | census-run is a one-shot audit tool, not the live pipeline; the all-or-nothing pass ran once and produced the 109-row census Phase 3 consumes. No live-path impact; documented in the audit. |
| F16 tombstone-delete keys-mode gate-light | fix-with-next-touch | Phase 4 (reconciliation) is where the drain/disposition tools are handled; add the census/allowlist gate to keys-mode there, alongside Session A's resumption. Tombstone-first is already fail-closed (verified), so no live risk today. |
| F17 restore-to-live MIN_BRIEF=1 | fix-with-next-touch | Same Phase 4 drain-tools touch; raise the default floor when the drain queue is worked. Post-write verification is already sound. |
| F19 decide success-on-failed-update | fix-in-R | We are already in `decide`/bulk-approve for R.2b; make the candidate-update failure fail the response in the same edit. Near-zero marginal cost. |
| F20 triage 404/409 asymmetry | accept-as-documented | Admin-only triage convenience routes; re-triage overwrite is low-consequence operator-facing, not an intake-integrity issue. Logged as tech-debt, not Phase R. |
| D1 haiku-classify stale header + dead code | fix-with-next-touch | The Phase 1 classifier work reads haiku-classify; delete the dead `haikuClassify` header/types then. |
| D2 canonical-fetch stale header | fix-in-R | Comment-only correction (header describes 2-tier, code is 3-tier); zero-risk doc fix, do it while the file is open for R.1a. |
| D3 url-canonicalize re-encodes CELEX bytes | accept-as-documented (with a guard note) | Benign for comparisons (both sides canonicalize). NAMED GAP: Phase 1 must never write `canonicalizeUrl` output back to a `source_url`/citation URL column (it would mutate CELEX colons). Phase 1's dedup USES it read-only (comparison), which is safe. Flagged in Phase 1's existing-first table. |
| D4/D5 api-fetch silent truncation + shared-key claim | fix-with-next-touch | The Phase 3 feed wave re-specs api-fetch against snapshot-first; add the `truncated`/`fullLength` fields (matching canonical-fetch) and correct the credential comment there. |

**Phase R scope = R.1, R.2, R.3, R.4, plus the three cheap fix-in-R items (F13, F19, D2).** Everything else
is routed to the phase that naturally touches the file, or accepted with a one-line reason. Phase R stays a
repair PR, not a feature PR.

---

# PHASE 1 — COMPLETE EXTRACTION OF HELD SOURCES (closes F1)

**The gap (Step 1 F1, answer 4).** The system extracts one document per item; no source-document
enumeration exists. Everything DOWNSTREAM of enumeration already absorbs per-document candidates unchanged
(answer 4): the mint chokepoint, `groundBrief`, the four mint gates, `validate_item_provenance`, the
non-destructive apply. **So Phase 1 is the missing seam, not a new pipeline: source → document-list → one
candidate per document → the existing intake path.**

## 1.1 — The enumeration step (the one genuinely new brick)

**USES** `extractPortalLinks` (check-sources:115 + the acquire script, exists per F1/answer 4 — it already
lists a portal's deep links) as the nearest existing brick. What it covers: portal-shaped pages where deep
links sit in the rendered HTML. What it CANNOT enumerate (the honest gaps that need genuinely new
enumeration, per source shape):

| Source shape | Existing coverage | New enumeration required |
|---|---|---|
| **Register-API portal** (EUR-Lex OJ, Federal Register API, eCFR) | `apiEndpointFor` exists (transport-escalation.mjs, per Step 1 transport read) | **NEW**: a listing-walk over the API's date/section index → the document set. Salvage from the superseded crawl spec: the EUR-Lex OJ daily-view + Federal Register API endpoints (crawl spec section 4). |
| **Static register page** (leginfo, legislation.gov.uk, state registers) | `extractPortalLinks` gets rendered links | **EXTENDS** extractPortalLinks: paginated index-walk (a register lists documents across pages; one render is one page). |
| **Feed** (RSS/API listing sources, 189 rss-access sources) | none live (F: rss-fetch purged, P-5) | **NEW**: a feed-listing transport, re-specced against `assertFetchAllowed` + the R.1 snapshot writer (crawl spec section 4 wave-two note; D4/D5 api-fetch hardening lands here). |
| **Institutional doc-library** (IMO, MPA, ministry sites) | `extractPortalLinks` partial | **EXTENDS**: doc-library structures (MEPC resolution lists, circular indexes) need a per-host link-selector; the deterministic host-class table (SC-13, source-growth) is the home for per-host rules. |

**NEW seam:** `enumerateSourceDocuments(source)` → a document-URL list. It dispatches on source shape
(reusing `detectScheme` / `selectTransportOrder` from the transport layer, which exist per Step 1). Every
enumeration call passes `assertFetchAllowed` (F: the transport hold gate, caller-null fail-closed) — so the
sweep obeys the scrape hold and cadence exactly like every other fetch.

## 1.2 — Classification against all four page contracts (multi-tag)

**EXTENDS** the existing Haiku classifier (`haikuVerifyCandidate`, verification.ts + haiku-classify.ts,
exists per Step 1 primitives read; D1 dead-code cleanup lands here). Each enumerated document is classified
against all four page contracts — Regulations (regulation/directive/standard/guidance/framework), Operations
(regional_data), Market Intel (market_signal/initiative), Research (research_finding/technology) — and
carries multi-tag output (a document can be both a regulation and a market signal, per the MPA case in the
proving slice). The classification writes the `item_type` + surface tags the mint and format-dispatch
(`specForItemType`, extract-registry.ts, exists per Step 1) already consume unchanged.

## 1.3 — Candidates through the existing intake path (USES, unchanged)

**USES**, all verified strong or existing in Step 1:
- each enumerated+classified document → one `staged_updates` row (transit-only, RD-20).
- **USES** `run-intake-cycle` (exists per Step 1 section 2) → `applyStagedUpdate` → `mintIntelligenceItem`
  (the single chokepoint, strong). No new intake path — the operator's binding constraint and ADR-015's.
- **USES** `matchExistingSubject` (entity-resolve.mjs, exists per Step 1 Part II, matches on
  instrument_identifier / canonical source_url / shared reg-number, NEVER title similarity) for dedup
  against holdings BEFORE mint. This is why the proving slice picks multi-item sources: they PROVE the sweep
  re-mints nothing already held. **NAMED GAP (D3):** dedup USES `canonicalizeUrl` read-only for comparison
  (safe); Phase 1 never writes its output back to a URL column.
- **USES** the R.1 snapshot writer: every touched document is snapshotted to `raw_fetches` under the Phase R
  writer, so criterion 3 grounds against durable storage (this is WHY Phase R precedes Phase 1 — the sweep's
  volume must land on the repaired verification path, not the char-capped pool).

## 1.4 — The proving slice (5 operator-chosen sources, proposed with rationale)

Selected from the live corpus (queried 2026-07-19) to span all four source shapes and be multi-item (so each
exercises `matchExistingSubject` dedup — the sweep must not re-mint their held documents):

| # | Source | Shape | Surface(s) | Live items today | Why this one |
|---|---|---|---|---|---|
| 1 | **EUR-Lex** (eur-lex.europa.eu, api, tier 1) | Register-API portal | Regulations | 4 | THE portal case: OJ daily-view API, heaviest dedup (4 held items), reg-family floor, `apiEndpointFor` transport. |
| 2 | **California Legislative Information / leginfo** (scrape, tier 1) | Static register page | Regulations (US sub-national) | 3 | No API — proves the paginated static-index walk, a different enumeration primitive from EUR-Lex. |
| 3 | **Maritime + Port Authority of Singapore / MPA** (scrape, tier 2) | Institutional doc-library | Regulations + Market Intel | 3 | Multi-tag proof: already backs both `regulation` and `market_signal` items; Asia jurisdiction; per-host link-selector case. |
| 4 | **California Air Resources Board / CARB** (rss, tier 2) | Feed | Regulations (rulemaking) | 2 | The feed shape — proves the new feed-listing transport (D4/D5 hardening) on a live rulemaking source. |
| 5 | **National Laboratory of the Rockies / NLR** (nlr.gov, scrape, tier 2) | Research institute site | Research | 3 | Research-surface horizon feedstock; multi-item; research authority floor (tier 4) exercised. |

**Operator decision point (proving-slice composition):** this slice covers Regulations, Market Intel, and
Research directly. It does NOT include a pure Operations (`regional_data`) source — Operations coverage is
indirect (per the crawl-spec coverage-honesty table). If the operator wants Operations in the proving slice,
the swap candidate is **UAE Government (u.ae, scrape, tier 2, backs `regional_data`+`regulation`)** in place
of one Regulations pick. Named, not silently omitted.

## 1.5 — Sizing, spend gates, pause-and-report

- **Per-source document multiplicity is UNKNOWN until enumeration** — that is precisely what the proving
  slice measures (documents-per-source, and how many are genuine deltas vs already-held). Any corpus-wide
  total stated before the slice runs would be speculation; it is labeled a gap, not a number.
- **The proving slice is the sizing instrument.** It runs full-depth on 5 sources, produces
  documents-enumerated / deltas-after-dedup / cost-per-source, and THAT extrapolates to the ~209 held
  sources (live: 190 back verified, 367 back any live item). Corpus-wide sizing is a post-slice deliverable,
  operator-priced, never a pre-committed default.
- **Spend gates (USES existing):** enumeration + classification is cheap (Haiku cents/doc, through the
  existing spend chokepoint RD-10) and runs under the current dormant state (no paid grounding). The
  grounding of NEW deltas is the paid half — behind `GROUNDING_ACQUIRE_ENABLED` + operator-priced line
  (F: the acquire lock, verify-item), snapshot-first (R.1), one paid pass per item.
- **Pause-and-report thresholds (NEW, small):** the sweep halts and reports at (a) a per-source
  document-count anomaly (a source enumerating far more documents than the slice predicted), and (b) a
  cumulative spend line the operator sets at the corpus-wide gate. Halts surface as a report, never a silent
  cap (the no-silent-truncation discipline).

## 1.6 — The ongoing standard

Once proven, this sweep becomes what "holding a source" MEANS: a held source is fully enumerated, not
one-document-deep. **EXTENDS** the check-sources tick (ADR-015's awareness tier): when the tick is re-armed,
`enumerateSourceDocuments` runs inside it so new documents at a held source are discovered on cadence, diffed
against holdings, and staged — the steady-state form of Phase 1. (Re-arm is a later gate; see sequencing.)

**Preserves the strong list:** Phase 1 adds only the enumeration seam and a classifier caller. Every
document flows through the unchanged chokepoint, mint gates, target-match, non-destructive apply, and
`validate_item_provenance`. The sweep multiplies VOLUME through the strong list; it changes none of it.

---

# PHASE 2 — CHANGE-TO-ANALYSIS (closes F2)

**The gap (Step 1 F2, answer 2).** `check-sources` sets `change_detected`; `reconcile` writes a flag-event to
`intelligence_changes`; and the signal TERMINATES — `intelligence_changes` is read only by the Dashboard
digest, has no re-ground consumer, 0 rows live. The scan→compare→ADJUST design has the ADJUST half unbuilt.

## 2.1 — The re-ground consumer (the new seam)

**Built on existing writers, per F2.** `check-sources` (fingerprint → `change_detected`) and `reconcile`
(→ `intelligence_changes`) are the existing producers; the NEW seam is the consumer.

- **NEW:** `applyDetectedChange(change)` — reads an `intelligence_changes` row, resolves the affected item(s)
  (the items whose pool or R.1 snapshot the changed source backs), and routes by severity.
- **USES** `compareFreshness` (freshness-probe.mjs, exists per Step 1 primitives: etag + Last-Modified vs
  snapshot capture time) to confirm the source content actually moved since the item's snapshot — the cheap
  HEAD-only gate before any spend.
- **USES** `cheapVerifyClaims` (cheap-verify.mjs, exists per Step 1: passes only when every FACT span is
  still present in the stored snapshot) to test whether the change actually invalidates the item's grounded
  facts. A change that leaves every FACT span intact is a no-op flag; a change that breaks a span is a real
  re-ground trigger.

## 2.2 — Trigger discipline (what auto-fires vs what holds for operator go)

Respecting the existing pause + cadence + acquire gates (ADR-015, F: preflight, acquire lock):
- **cheapVerifyClaims still passes** (spans intact) → record the change, no re-ground, dashboard digest shows
  it (the existing display layer, retained). Auto, $0.
- **cheapVerifyClaims fails** (a FACT span broke) → the item is flagged `stale_snapshot_content_changed`
  (the existing STALE_FLAG, verify-item.mjs, exists) and enqueued for re-ground. The re-ground itself is
  PAID, so it HOLDS behind `GROUNDING_ACQUIRE_ENABLED` + operator go — never auto-fires a spend (F: the
  acquire lock is the existing discipline; Phase 2 does not weaken it).
- **severity from the change class:** a source that 404s / moves (not just edits) escalates to the
  roadblock/alternative-search path (F: primary-fallback, exists) rather than a re-ground of stale content.

**Page-level output** is adjusted only after a re-ground actually re-grounds — the non-destructive apply
(strong) versions the changed claims, the dominance guard (strong) rejects a weaker re-ground, and
`validate_item_provenance` re-flips the item's status. The customer surface reflects the new state through
the existing read path; no new surface write.

**Preserves the strong list:** Phase 2 fires the EXISTING grounding pipeline as its actuator. It adds a
consumer and a severity router; it modifies no gate. The re-ground runs the non-destructive apply, dominance
guard, mint gates, and validate exactly as a first grounding does.

---

# PHASE 3 — DISCOVERY (third, and only third)

Gap measurement is valid only against fully-extracted holdings — a diff against one-document-per-item
holdings is a false denominator (Step 1 answer 5, the crawl spec's "106 missing" error). So discovery
follows complete extraction (Phase 1), never precedes it.

## 3.1 — Inside-out first (existing machinery, finally consumed)

- **USES** `growSourcesFromBrief` (source-growth.ts, exists per F4/answer 5 — surfaces NEW sources from every
  brief into the registry, deterministic tier only). Every Phase 1 + Phase 2 brief feeds it; it is already
  wired, it just now runs at extraction volume.
- **USES** `extractPortalLinks` + **consumes** `portal_link_candidates` (check-sources:117, written but 0
  rows / no consumer, per F1/answer 4). Phase 3 is where the portal-harvest ledger finally has a reader: its
  candidates route through `run-intake-cycle` like any other. This is the "built-but-never-run P2-5 ledger"
  from the crawl spec, now consumed.

## 3.2 — Outside-in second (universe-first, funnel stated)

Register / feed / catalog enumeration for the four surfaces, with the explicit funnel: **universe
enumerated → classified relevant → diffed missing.** Gap measured ONLY against fully-extracted holdings
(answer 5, cited).

- **Salvage from the superseded crawl spec** (its register-enumeration research survives this ordering):
  KEEP — the EUR-Lex OJ daily-view + Federal Register API + national-gazette endpoint research (crawl spec
  section 4), the wave structure (registers → market feeds → research, section 4), the coverage-honesty table
  (section 7), and the section 8.1 `source_trust_events` decision line (evidence points to PURGE, operator
  ruling owed). DISCARD — the crawl spec's framing that outside-in enumeration is the PRIMARY build (it is
  third here) and its "106 missing" denominator (false, per answer 5).
- **USES** the Session C census (`coverage_gap_candidates`, 109 rows) as outside-in feedstock — but only
  after Phase 1 extraction, so the "missing" set is measured against complete holdings, not partial.

**Preserves the strong list:** discovery stages candidates through the unchanged chokepoint; every strong
element applies at mint/ground exactly as Phase 1. `growSourcesFromBrief` writes `effective_tier` only (the
moat — reputation never confers eligibility), unchanged.

---

# PHASE 4 — RECONCILIATION WITH COMPLETED WORK

Nothing already done is orphaned or redone. How the plan preserves and uses each session's output:

- **Session A — the parked drain queue (66 rows) + relabel-primitive spec.** USES as-is. A's 66 quarantined
  rows are an OPEN investigation (research-or-erase, RD-2.1), not Phase 1 feedstock. A's resumption slots
  BETWEEN Phase R and Phase 1's corpus-wide backfill: the drain queue is worked (relabel primitive built by
  the session that specced it, per the crawl spec's deliberate exclusion) so the corpus is clean before the
  sweep multiplies volume. F16 (tombstone keys-mode gate) + F17 (restore MIN_BRIEF floor) are the
  fix-with-next-touch items that land HERE, with the drain tools. Named exception: the relabel primitive is
  built by A's resuming session, not this plan (same builder-and-operator discipline).
- **Session B — the mechanical intake-drain lane.** USES unchanged. B's lane is the mechanical half of the
  drain work; it runs alongside A's resumption. No rebuild.
- **Session C — the dispositioned census (109 rows, 62 free feeds, declined/parked rulings).** USES as Phase
  3 outside-in feedstock (3.2), consumed only after Phase 1 extraction (false-denominator rule). The 62 free
  feeds are the Phase 3 market-feed universe; the declined/parked rulings stay declined (no silent revival).
- **The campaign's grounding machinery.** USES entirely unchanged — it IS the strong list. Phase 1/2/3 all
  actuate the existing generate→ground→validate pipeline. No grounding-model or floor change anywhere in
  this plan (matching the crawl spec's exclusion).

---

# SEQUENCING, DEPENDENCY GRAPH, AND DECISION POINTS

```
        [Phase R: repair]  (R.1 snapshot+crit3, R.2 tier, R.3 apply, R.4 dry-mint, +F13/F19/D2)
                 |
                 v
   OPERATOR GATE 1: Phase R go  ── (R merges; strong list verified intact by tests)
                 |
     +-----------+-----------------------------+
     |                                         |
     v                                         v
 [Session A/B drain resumption]        [Phase 1 build: enumerate+classify seam]
 (Phase 4 reconciliation;              (no spend; dormant-safe)
  clean corpus before volume)                  |
     |                                         v
     |                          OPERATOR GATE 2: proving-slice go (5 sources, full depth)
     |                                         |
     +--------------------+--------------------+
                          v
              OPERATOR GATE 3: corpus-wide backfill go (priced from slice)
                          |
                          v
                 [Phase 2 build: change-to-analysis consumer]
                 (can parallel Phase 1 corpus-wide; both USE R.1 snapshot)
                          |
                          v
              OPERATOR GATE 4: tick re-arm go  ── (ADR-015 re-arm checklist, below)
                          |
                          v
                 [Phase 3: inside-out discovery, then...]
                          |
                          v
              OPERATOR GATE 5: Phase 3 outside-in go
```

**What can parallel.** Session A/B drain resumption parallels the Phase 1 BUILD (different files: drain
tools vs enumeration seam). Phase 2's build can parallel Phase 1's corpus-wide backfill (both consume the
R.1 snapshot; neither blocks the other). Phase 3 is strictly last.

**Per-phase cost (facts + labeled projection, operator prices; RD-31 no machine default).**
- Phase R: pure code + one DB migration; no paid model calls. The prover script is a read.
- Phase 1 proving slice: enumeration+classification of 5 sources = Haiku cents/doc (single-digit dollars);
  grounding of NEW deltas only = the existing ~$0.15-0.35/item (labeled projection), count unknown until the
  slice enumerates (gap, not a number).
- Phase 1 corpus-wide: extrapolated from the slice, operator-priced at Gate 3.
- Phase 2: pure code; the re-ground actuator is existing paid pipeline, fired only on operator go per change.
- Phase 3: awareness enumeration cheap; depth grounding of the measured-missing set operator-priced.

**Operator decision points (minimum, all present):** Gate 1 Phase R go; Gate 2 proving-slice go; Gate 3
corpus-wide backfill go; Gate 4 tick re-arm go; Gate 5 Phase 3 outside-in go. Plus the 1.4 proving-slice
composition choice (Operations swap).

**The tick re-arm checklist (ADR-015 section 3, appears at Gate 4):**
1. **Code:** uncomment the `schedule:` blocks in `.github/workflows/source-monitoring.yml` +
   `spot-check-monthly.yml` (a committed change, not a config flip — ADR-015 G-2), or replace with the
   two-tier awareness tick.
2. **Config:** set `system_state.scrape_cadence` + `scrape_start_date` off the dormant `off` state.
3. **Env (operator dashboard, out-of-repo):** confirm deployed Vercel `SCRAPE_HOLD` lifted +
   `GROUNDING_ACQUIRE_ENABLED` armed per sanctioned run. (Step 1 / dormant-audit section 7 check 3: the
   deployed env values are the one operator-console read no tool in-session can confirm.)

---

## Standing-rules compliance

No em/en dashes where a comma is correct; plain "section N"; no section-mark glyph; no speculation stated as
fact (per-source document counts and corpus-wide totals are labeled gaps until the proving slice measures
them); every pipeline claim cited to a Step 1 finding or code; the strong list fenced and per-phase
preservation stated. `PROGRAM-BOARD.md` is updated in this PR. This document builds nothing.

**STOP.** This plan lands as one PR. The operator rules on the document before anything in it executes.
