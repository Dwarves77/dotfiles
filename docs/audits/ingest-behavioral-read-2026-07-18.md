# Ingest Pipeline — COMPLETE Behavioral Audit + Merge Re-Verification (2026-07-18, Session E recovery)

**Mandate.** Read the actual code of the whole ingest system (not the wiring map, not summaries), establish
what it really does, re-verify every merge today against that read, restore anything the live path touches,
label gaps as gaps. Where a document and the code disagree, the code is truth and the document is a finding.

**Completeness.** Every file on the ingest surface was read in full: the 1710-line
`canonical-pipeline.ts` core plus `generate-brief.ts`, `run-intake-cycle.ts`, `mint-item.ts`,
`apply-staged-update.ts`, `plan-intake.ts`, `entity-gate.mjs`, `cited-host-gate.mjs`, `mint-gates.mjs`,
`defect-signatures.mjs`, `source-blocks.mjs`, `floor-attribution.mjs`, `slot-forcing.mjs`,
`slot-prompt.mjs`, `ledger-apply.mjs`, `ledger-dominance.mjs`, `target-match.mjs`, `primary-fallback.mjs`,
`transport-escalation.mjs`, `transport-runtime.mjs`, `seek-more.mjs`, `snapshot-store.mjs`,
`verify-item.mjs`, `verification.ts`, `source-growth.ts`, `institution.ts`, `check-sources/route.ts`,
`reconcile/route.ts`, `reconcile.ts`, `agent/run/route.ts`, `admin/scan/route.ts`, `parse-output.ts`,
`system-prompt.ts`, `extract-registry.ts`, `audit-gate.ts`, `link-items.ts`, plus the live DB functions
`validate_item_provenance` and `set_provenance_status` (read as SQL, not from docs). ~8,700 lines of code
plus the two DB functions. Peripheral files were read by parallel deep-read agents; every finding cited
below was spot-verified against the source file (four agent citations checked, all exact) or read directly.

---

## 1. The five answers (code-grounded, with citations)

### (1) When we hold a source, what do we extract? ONE document. No source sweep exists anywhere.

The system is item-centric and document-centric end to end. An `intelligence_items` row = ONE document
(its `source_url`).

- `generateBrief` (canonical-pipeline.ts:839) fetches the item's ONE `source_url` via `fetchPrimaryDeep`
  (:863), "Fetched ONCE here (never re-fetched)" (:862). `fetchPrimaryWithFallback` (primary-fallback.mjs:155)
  tries the declared primary; on a roadblock it tries discovered ALTERNATIVE URLs — replacements for a
  broken primary, not additional coverage. Then `discoverCorroborators` (:871) adds web-search corroborator
  PAGES (up to 6, real URLs only, char-capped). The pool = primary + corroborators, stored in
  `agent_run_searches`, DELETE-then-INSERT replaced each generate (:922).
- `run-intake-cycle` (run-intake-cycle.ts:80-127) mints ONE item per caller-supplied candidate
  `{title, source_url, item_type}` — the candidate IS one document.
- Even Session A's acquire script (`acquire-primaries-batch.mjs`) picks the ONE correct enacted instrument
  per existing item via `extractPortalLinks` + `officialnessOf` (accept the first path-'a' candidate) and
  repoints — it does not sweep the source for its other documents.

**Answer:** we extract the one document the item points at (plus web-search corroborator pages / the one
enacted instrument behind a portal). No component sweeps a source's document tree.

### (2) Does a detected change adjust existing analysis? No. The signal terminates.

- `check-sources` (route.ts:64) fingerprints the render, sets `change_detected` on a `monitoring_queue`
  row (:96) + `sources.last_content_changed_at` (:75). Line 62 verbatim: "Downstream auto-action on a change
  is deliberately NOT wired here."
- `reconcile` worker reads `monitoring_queue` change_detected=true and writes a flag-event row to
  `intelligence_changes` per affected item (`recordSourceChangeTrigger`, reconcile.ts:88, previous/new =
  null). It does NOT re-fetch, re-ground, or flip provenance.
- `intelligence_changes` is READ by exactly ONE place: the Dashboard "recent changes" digest
  (supabase-server.ts:1449-1454, `limit(100)`, display only). No re-ground consumer anywhere.
- **Live DB:** `intelligence_changes` = 0 rows; `monitoring_queue` change_detected unreconciled = 0. The loop
  has never carried a signal (both workers frozen / uncalled).

**Answer:** a detected change is recorded and (if the workers ran) displayed on the dashboard. It NEVER
adjusts a claim, brief, or analysis. The scan→compare→ADJUST design has the ADJUST half unbuilt.

### (3) Is save-all-data true, and where does it stop?

Two capture stores; which fills depends on the path:
- `agent_run_searches` (the working pool) — written by the live workflow's `generateBrief`, per-item and
  REPLACED each generate (DELETE-then-INSERT, canonical-pipeline.ts:922; same in refresh, :1026). Content
  excerpt (`result_content_excerpt`) is char-capped; truncation is flagged, not stored in full.
- `raw_fetches` (the permanent, content-addressed, append-only snapshot) — written by `writeSnapshot`
  (snapshot-store.mjs:95). **`writeSnapshot` is called ONLY from operator-fired scripts**
  (`acquire-primaries-batch.mjs:130`, `_reground/acquire-*.mjs`). It is NOT called by the live
  `/api/agent/run` workflow, by `groundBrief`, or by `verify-item` (verified: verify-item.mjs imports only
  `assertAcquireAllowed`; its `needs_acquire` branch terminates at the lock and hands off to a caller —
  verify-item.mjs:152-156). The workflow only READS `raw_fetches` (holdingsForItem:832).

**Answer:** "save everything permanently" (raw_fetches, append-only) is TRUE for the operator-fired
acquire-script path (Session A's work). It is NOT true for the live workflow, which persists only the
replaceable pool. The snapshot-first invariant I3 ("an acquiring run must write raw_fetches") has NO live
writer on the workflow path — the writer exists (`writeSnapshot`) but the acquire pipeline that would call
it is the frozen/unbuilt PR-2 path. **CRITICAL DOWNSTREAM COUPLING:** `validate_item_provenance` criterion 3
(the customer-visibility gate) checks each FACT's `source_span` against `agent_run_searches.result_content_excerpt`
— the char-capped, per-generate-replaced pool. Grounding validity therefore rides the char-capped pool, not
the permanent snapshot.

### (4) Pointed at a full source sweep today, unmodified, where does it stop short?

At step one: there is no source-document enumeration. `fetchPrimaryDeep` fetches one document;
`discoverCorroborators` searches for THIS item's corroborators; `extractPortalLinks` (check-sources:115 +
the acquire script) DOES list a portal's deep links, but nothing turns that list into an item-per-document
mint — `portal_link_candidates` is written (check-sources:117), has 0 rows live, and has no consumer that
feeds intake. `run-intake-cycle` consumes a caller-supplied candidate list; nothing produces a complete
per-source candidate set.

**Answer:** it stops at "enumerate the documents at this source." Everything downstream (the mint chokepoint
`mintIntelligenceItem`, `groundBrief`, the four mint gates, `validate_item_provenance`, non-destructive
apply) already exists and would absorb per-document candidates unchanged. The missing seam is
source → document-list → one candidate per document. `extractPortalLinks` is the nearest existing brick; it
is written but never fed into intake.

### (5) What does the pipeline already provide that the crawl spec duplicated or ignored?

- **Already provides (spec duplicated):** web-search source discovery (`discoverCorroborators`, :871);
  identifier-derived URL discovery (`generateCandidates`/seek-more, :601); the grow-step source-discovery
  loop (`growSourcesFromBrief`) that surfaces NEW sources from every brief; portal deep-link listing
  (`extractPortalLinks`); the one intake path (`run-intake-cycle`); the mint chokepoint; snapshot-first
  verify; the full gate stack.
- **Ignored (the two real gaps):** complete extraction of a HELD source (the one-document-per-item limit)
  and the OPEN change-to-analysis loop. The spec's "106 missing" diffed a candidate list against a corpus of
  one-document-per-item sources — a false denominator.

**The crawl spec is superseded as a build basis** (marked in the board + its own header).

---

## 2. The pipeline, as it actually runs (the verified flow)

`/api/agent/run` (agent/run/route.ts): auth → 60/min rate limit → **platform-admin gate** (inline
`isPlatformAdmin`, :48) → verified-short-circuit (:119) → 1h per-item cooldown (:141) → `start(generateBriefWorkflow,[itemId,refresh])`.
Every read here destructures `error` and warns (post-mortem discipline honored).

`generateBriefWorkflow` (generate-brief.ts:515): preflight (pause split + data-audit-block + daily-cap,
fail-closed) → auditBaseline → **generate** → register → section → **ground** → retry ladder
(structural-hold / reground / research-or-erase) → grow → link → **auditGate** (fail-closed cross-item) →
revalidate. `run-intake-cycle` invokes the SAME workflow with caller `"manual-intake-run"`.

**generate** (`generateBrief`, canonical-pipeline.ts:839): holdings gate (refuses to fetch when holdings
present unless forceRefresh, :851) → fetch primary once + web-search corroborators → write-side error-body
gate (`captureForStorage`) → persist pool (DELETE+INSERT) → `synthesiseAndWriteBrief` (:677): tier-ordered
source blocks (floor source in full = the truncation moat; buildSourceBlocks source-blocks.mjs:74), slot
enforcement + one corrective retry, format determinism, writes the 19-field contract to `intelligence_items`.

**section** (`sectionBrief`, :1040): skip-if-verified; ledger-preserving reconcile by `section_key` (not
delete-cascade); §14 timeline harvest.

**ground** (`groundBriefImpl`, :1140): acquire-lock gate (unless injectedLedger) → skip-if-verified →
read prior ledger (NON-DESTRUCTIVE, no delete) → cited-host gate (stub only known hosts;
cited-host-gate.mjs) → grounding corpus = the stored pool `agent_run_searches` (:1272), error-body gate
(`partitionErrorBodies`) → **target-match verify** (target-match.mjs; MISMATCH → hard hold, UNVERIFIED →
soft flag) → extract ledger (Sonnet with its OWN `<<<CLAIM_PROVENANCE_LEDGER` prompt at :1349, or injected)
→ kept-filter (FACT span must be verbatim in pool; ANALYSIS must be labeled+verbatim) → slot-forcing
(judge-confirmed FACT or honest GAP; slot-forcing.mjs) → resolver tier stamp (`institution.ts tierOfSource`
= `base_tier ?? null`, the moat) → floor-first re-attribution (`reattributeToFloor`) → null-tier host
aggregation → **dominance guard** (`ledgerRegression`; weaker re-ground applies NOTHING) → **non-destructive
apply** (`applyLedgerDiff`: add/version/keep, never delete) → four mint gates (S-CONFLATE hard hold via
`mint_hold_reason`, S-NUMERIC soft flag, authority-floor + generic-source; mint-gates.mjs + defect-signatures.mjs)
→ `validate_item_provenance` RPC → the `set_provenance_status` trigger flips verified/quarantined.

**validate_item_provenance (the actual SQL, six criteria):** (1) source_id present + source found + tier
not-both-null + `status='active'`; (2) every section URL resolves to item source_url / this item's
`agent_run_searches` / any `sources.url`; (3) every FACT: span present, span is a substring of the linked
`agent_run_searches.result_content_excerpt`, derived tier (`COALESCE(tier_override, base_tier)`) ≤ the
per-type floor (reg-family 2 / research 4 / tech 5, with standard-own-body → 4), and `mint_hold_reason`
null; (4) ANALYSIS labeled in its paragraph, LEGAL routed to callout, no unlabeled binding assertion; (5)
every required slot appears in a FACT/GAP claim; (6) full_brief non-empty. Zero failures → verified, else
quarantined.

**intake** (`run-intake-cycle` → `applyStagedUpdate` → `mintIntelligenceItem`): stage a `staged_updates`
row → the mint chokepoint (mint-item.ts:103): idempotency (fail-closed), congruence 1a/1b, subject-existence
dedup (fail-closed; news → market_signal + link, non-news dup → hard reject), relevance flag (surface-only),
domain canonicalization, **source-link invariant** (`sourceLinkDecision`:79 — preset trusted, no-url
reject, unregistered-url reject, else link), the single INSERT → ground via the same workflow.

**discovery** (already built, unwired for a sweep): `discoverCorroborators` (web_search), `generateCandidates`
(identifier-derived, seek-more.mjs), `extractPortalLinks` (portal deep links), `growSourcesFromBrief`
(surfaces New Sources from every brief into the registry). `/api/admin/scan` (admin/scan/route.ts): web_search
→ dedup (fail-closed) → portal-vs-reg heuristic → stages to `staged_updates` + `provisional_sources`;
**cannot auto-insert `intelligence_items`** (verified: no such insert exists) — conforms to doctrine.

**source registration:** two paths with DIFFERENT tier discipline (see finding F4). `institution.ts
tierOfSource` = `base_tier ?? null` (the moat: reputation `effective_tier` never confers grounding
eligibility). `buildResolver` skips `status='suspended'` sources (institution.ts:87).

---

## 3. Findings, ranked by severity (all verified against the code)

**Behavioral (what the system does — the operator's core questions):**

- **F1 — one-document-per-item; no source sweep** (section 1.1). The whole system extracts one document per
  item. Complete per-source extraction does not exist. VERIFIED.
- **F2 — the change-to-analysis loop terminates** (section 1.2). `intelligence_changes` has no re-ground
  consumer (only the dashboard digest reads it), 0 rows live, auto-action "deliberately NOT wired." VERIFIED.
- **F3 — the live workflow never writes the permanent snapshot** (section 1.3). `writeSnapshot` is called
  only by operator acquire scripts; the I3 invariant has no live writer on the `/api/agent/run` path.
  Grounding validity (criterion 3) rides the char-capped, per-generate-replaced `agent_run_searches` pool.
  VERIFIED (my read + transport deep-read).

**Integrity cracks (real defects, verified):**

- **F4 — base_tier stamped from a Haiku guess on a LIVE path (moat crack).** `verification.ts executeAction`
  (verification.ts:634-645) stamps `base_tier` from the Haiku-guessed `ai_trust_tier` (T1→1/T2→2/T3→4) when
  auto-approving a source to `status='active'`. `source-growth.ts registerCitedSources` (source-growth.ts:108-129)
  EXPLICITLY forbids a guessed base_tier — deterministic-only via `classTierForHost`, ambiguous hosts
  worklisted not minted. Both write `base_tier`, both feed the same `tierOfSource` moat resolver. `verifyCandidate`
  is LIVE (called by `/api/admin/sources/bulk-import/route.ts:517,586`). So one live registration path mints a
  grounding-eligible tier off a model guess while the sibling path forbids exactly that. Mitigations: the host
  must already be in verification.ts's hardcoded HIGH allow-list to reach the H path, and a D3 guard can divert
  to provisional — but the tier VALUE is still a guess. VERIFIED (citation + liveness confirmed).
- **F5 — `applyLedgerDiff` CHANGE path is not fail-closed.** On the CHANGE branch, if the `claim_versions`
  archive insert fails, ledger-apply.mjs:127 only `console.warn`s, then :129 STILL overwrites the current
  claim row — losing the prior attribution with no archived version. The module header claims fail-closed
  "version preserved BEFORE the current row is changed"; that guarantee holds only on the erase path (throws,
  :152), not on version-change. A data-history-loss window. VERIFIED.
- **F6 — plan-intake fails OPEN and drifts from the real mint.** `planIntakeCycle` (plan-intake.ts:46)
  destructures `data` without `error` (the exact post-mortem code-smell) → on a corpus read error the live
  set is empty → every candidate reports `would_mint`, whereas the real mint fails CLOSED (mint-item.ts:144).
  Plan also does NOT model the source-link invariant, so an unsourced candidate reports `would_mint` while
  the mint rejects it `unsourced` (mint-item.ts:200). The header's "a plan verdict cannot drift from apply"
  is false in two ways. VERIFIED.

**Dead/dormant code + naming (verified):**

- **F7 — the inline claim-ledger parser is dead code for conformant output.** `system-prompt.ts` (the
  GENERATE contract) explicitly forbids emitting a Claim Provenance Ledger (:498 "Do NOT emit a Claim
  Provenance Ledger block", :387, :477). So `parse-output.ts`'s STRICT `locateClaimLedger`/`extractClaimLedger`
  path is dormant for generate output (parseAgentOutput wraps it in try/catch → null). The LIVE ledger is the
  GROUND step's OWN separate extraction call (canonical-pipeline.ts:1349, using the lenient extractor).
  Not a break — provenance moved from generate-inline to ground-extraction — but the strict inline parser
  is now dead-on-arrival. VERIFIED.
- **F8 — `maxAlts` is a no-op floor.** primary-fallback.mjs:182 iterates `altUrls.slice(0, Math.max(maxAlts,
  altUrls.length))`; since `altUrls` is already capped at `maxCandidates=6` (:180), `Math.max(3, len) ≥ len`
  never truncates. The alternative search tries up to 6, not the documented 3. Behavioral cap = maxCandidates.
  VERIFIED.

**Lower-risk (verified, bounded):**

- **F9 — error-swallow shapes** (`data` without `error`): `link-items.ts` reads (:24/29/30, bounded by the
  <20-char skip), `verification.ts checkDuplicate` (:412). The post-mortem class, bounded here.
- **F10 — suspend-gate asymmetry.** `buildResolver` skips suspended sources for the stamp
  (institution.ts:87), but `compoundSourceCredibility` (source-growth.ts:196) reads citer tiers without a
  suspend filter — a suspended source can still influence convergence scoring (not eligibility).
- **F11 — silent classifier cap.** `verification.ts` truncates classifier input to `CONTENT_MAX_CHARS=6000`
  (:336) with no truncated-flag — a silent cap at the classification layer (not the grounding layer).
- **F12 — `captureForStorage` classifies body-only** (transport-escalation.mjs:264, no status) — a 403 with
  a plausible-length non-error body could be stored; upstream status filtering mitigates in practice.

**What is genuinely strong (verified, so the build plan does not "fix" it):** the non-destructive apply
(never deletes a claim on re-ground; ledger-apply diffLedger), the dominance guard (weaker re-ground applies
nothing), the four mint gates, target-match (wrong-instrument hard hold), the `base_tier ?? null` moat in
`tierOfSource`, the fail-closed audit gate + preflight, the write-side + read-side error-body gates, and the
single mint chokepoint. These are real and correct.

---

## 4. Merge re-verification (behavioral) — all purges SAFE, zero restorations

Re-checked against the full behavioral read + dynamic dispatch + string routes + config + DB objects:

- **P-1** sources/discover + discovery.ts: on no path in generate/ground/mint/run-intake. `admin/scan`
  (the live discovery path) does NOT import it. SAFE.
- **P-2/P-8** /api/staged-updates route: the ROUTE went, NOT the `staged_updates` TABLE (live, 35 rows) —
  `run-intake-cycle` (:85) + `applyStagedUpdate` + `admin/scan` all use the table. No code fetches the route.
  SAFE.
- **P-3/P-4** notifications/preferences + regulations-defaults: zero callers, unrelated to ingest. SAFE.
- **P-5** rss-fetch.ts: `access_method` dispatches ONLY api-vs-browserless (fetch-now:94); the 189 `rss`
  sources were always browserless-rendered. `secFairAccessUaForUrl` re-homed to sec-fair-access.ts, live in
  browserless.ts:14,55. SAFE (finding, pre-existing: 189 rss sources have no rss transport).
- **P-6** source_conflicts slice + computeConflictResolutionImpact + mig 215 DROP: live DB shows 0 functions
  / 0 views reference source_conflicts (no CASCADE damage). The pipeline reads `source_trust_events` (live, 6
  writers) not `source_conflicts`. SAFE.
- **P-7** q7-daily-recompute route: no scheduler/caller; end-of-cycle recompute inside `growSourcesFromBrief`
  is the live path. SAFE.
- `source_trust_events` narrowing NOT executed (deferred). ADR-015/register/ACTIVE_PHASE/skill-gate/C4 are
  docs or dev-time, no ingest runtime effect. Crawl spec superseded.

**No merge today touched the live ingest path. Zero restorations.** (Migration 215 applied cleanly, verified.)

---

## 5. Gaps labeled

- `entity-resolve.mjs` (`matchExistingSubject`, `resolve`, `LINK_ALLOWED_TABLES`), `source-role.mjs`,
  `identifier-variants.mjs`, `holdings-audit.mjs`, `officialness.mjs`, `freshness-probe.mjs`,
  `cheap-verify.mjs`, `two-pass-generate.mjs`, `spend-client.ts` were consumed as primitives (their callers
  were fully read); their internals were not line-audited this pass. None contradicted the flow; flagged as a
  next-pass ring, not a blocker.
- `probeFreshness` (verify-item's freshness input) was read at the interface; it does NOT consume the
  check-sources `change_detected` signal — the two change-detection mechanisms are independent (part of F2).

---

*This is the COMPLETE Step 1 output (supersedes the partial first pass on this branch). It changed no code
or data; it is a read plus the re-verification of already-merged work. The Step 2 build plan is grounded in
these findings and is a separate document, produced only on operator go.*

---

# PART II — Exhaustive coverage: every intake / sorting / saving path, every data type, every page

The operator's completeness bar: every code path that intakes, sorts, or saves data of ANY type for ANY
page. Method: a multi-line-aware mechanical enumeration of EVERY write site (`.insert/.upsert/.update/.delete`
on every table, src + scripts, plus storage uploads, plus RPC write-functions, plus the guarded helper
layer whose table names are variables and therefore invisible to a regex over `.from("literal")`) — then a
complete read of every writer not already covered in Part I. Nothing below is inferred from a wiring map;
every finding was read in the file and the load-bearing ones spot-verified (nine citations checked against
source this pass, all exact; one verified empirically, D3 below).

## II.1 The complete write-site map (every table, classified)

- **Corpus core** (Part I): intelligence_items (INSERT in src = `mint-item.ts` ONLY, the doctrine holds;
  the 33 update sites are the pipeline steps, the admin source-linkage routes, and dated one-shot scripts),
  intelligence_item_sections, section_claim_provenance (single writer = `ledger-apply.mjs`), claim_versions,
  item_timelines, item_cross_references, agent_run_searches, agent_runs, raw_fetches (writer =
  `writeSnapshot`, scripts-only), staged_updates, integrity_flags, monitoring_queue, intelligence_changes.
- **Source registry + credibility** (Part I + II.3): sources (22 insert sites: verification.ts,
  source-growth.ts, db.mjs registerSource, admin canonical-sources routes, dated one-shots),
  provisional_sources, source_citations, source_trust_events, source_verifications, source_tier_opinions,
  canonical_source_candidates, intelligence_item_citations.
- **Guarded-layer tables (invisible to a literal-regex; writers read in full this pass):**
  published_price_statistics (`source-eia-price-board.mjs`), state_cost_facts (`source-state-min-wage.mjs`),
  corpus_census (`census-run.mjs`), drain_worklist (`lane-split.mjs` / `archive-item.mjs` /
  `restore-to-live.mjs`), disposition_ledger (`tombstone-delete.mjs`), regional_data_facts + item_changelog
  (dated one-shots), mutation_leases + funded_pass_runlock (RPC-only: acquire/heartbeat/release via
  `mutation-lease.mjs`; the read-client `.rpc` passthrough is a DOCUMENTED deliberate bypass of the
  read-only proxy). coverage_gap_candidates is written by committed migrations only (no JS writer).
- **Community surface:** community_* + post_promotions + moderation_reports + notifications. BOUNDARY
  VERIFIED MECHANICALLY: no community route writes any non-community table except `staged_updates` via the
  promote route, and the promote route can NEVER insert intelligence_items (`const intelligenceItemId =
  null; // never set here (staged-only)`, promote:312; zero `.from("intelligence_items")` refs in the file).
- **User/tenant state (not intelligence intake; enumerated + boundary-classified):** workspace_settings,
  workspace_item_overrides, user_watchlist, org_* (invitations/memberships/bans), organizations, profiles,
  notification_preferences, error_events, admin_action_cooldowns, bulk_imports (audit sink),
  ingest_rejections + pending_jurisdiction_review (triage: writes triage columns; PJR can also edit an
  item's jurisdiction arrays, whitelisted to `jurisdictions|jurisdiction_iso`, column-injection blocked).
- **Storage:** exactly two uploaders, `snapshot-store.mjs` (raw_fetches bucket) and the historical
  `wave1-cold-start.mjs`.

## II.2 The guarded write layer (`scripts/lib/db.mjs`, read in full)

Sound by construction: every write REQUIRES a `{skill, reason}` cite (throws without), SNAPSHOTS prior
state to `_snapshots/` before mutating, and `sources` is DELETE-PROTECTED (suspend-not-delete, structural).
`readClient()` proxies `.from()` so insert/update/upsert/delete THROW (the rule-015 bypass closed), but
`.rpc` passes through, which is how the lease functions write (documented, deliberate). `registerSource`
defaults `base_tier` to 7 (overflow) when unspecified, a tier that can never hollow-pass any floor,
consistent with SC-13. `reclassifyToSource` is register then read-back-verify-active then only-then-archive,
fail-closed.

## II.3 New findings from the exhaustive pass (verified, ranked)

**Data-program writers:**
- **F13 - state-min-wage dry-run writes.** `registerSource` runs BEFORE the `--execute` gate
  (source-state-min-wage.mjs:82), so a "dry run" still creates/activates the NCSL source row. Also the
  "LIVE-SOURCED" figures are a hardcoded 2026-07-07 snapshot (corroborated for only 4 of 13 states, per its
  own header); re-runs re-stamp `last_updated` on old data, so stale data reads freshly updated.
- **F14 - EIA price rows carry no source FK.** `source-eia-price-board.mjs` defines registered source
  UUIDs in constants but never writes them to the row, only a literal `source_tier: 3`. The provenance link
  exists in comments only. Also `Number(row.value)` is never NaN-checked, and the delete-then-insert refresh
  is non-atomic.
- **F15 - census-run's live-pass "idempotent" claim is false.** The $0 live-item pass runs only when
  `corpus_census` is COMPLETELY EMPTY (`if (!done.size)`, census-run.mjs:42), all-or-nothing, not per-item;
  newly-live items never get census rows once any row exists.
- **F16 - tombstone-delete keys mode is gate-light.** The census gate, the `--empty-only` content gate, and
  the bucket allowlist apply only in BUCKET mode; `--keys` mode bypasses all three (lease + tombstone-first
  are the only constants), and an explicit `--disposition` free-text overrides the allowlist string. The
  tombstone-then-delete order itself IS correctly fail-closed (insert-throws then delete never runs,
  tombstone-delete.mjs:99-106, verified). `snapshot_pointer` is `source_id`, one indirection weaker than the
  "survives in raw_fetches" comment implies.
- **F17 - restore-to-live's content gate defaults to 1 char.** `MIN_BRIEF` defaults to 1, so "any brief"
  passes `warranted()`; the real floor is opt-in per sweep. Its post-write verification (read back
  provenance, route non-verified to drain_worklist) is genuinely good, better than archive-item's
  print-only read-back. All three lease tools exit 0 on per-item failure (batch callers can't detect
  partial failure from the exit code).

**Admin source-lifecycle (the second half of the F4 moat-crack context):**
- **F18 - bulk-approve vs decide route drift.** `canonical-sources/decide` has a vertical-fit gate (blocks
  re-admitting retired off-vertical hosts), writes `source_role`, and inserts `intelligence_types: []` for
  the migration-123 trigger to derive. `bulk-approve` has NONE of the three: no vertical-fit gate (a retired
  host can re-enter via bulk), hardcodes `intelligence_types: ["GUIDE"]`, omits `source_role`. Both stamp
  tier from the CACHED Haiku classification (refused when absent), cached-AI not guessed-at-approve-time,
  but still model-derived into `base_tier` (the F4 class). decide's header claims "any authenticated user"
  while the code correctly enforces isPlatformAdmin (stale comment; code stricter). Both bake a frozen
  literal date "2026-04-28" into every new row's notes.
- **F19 - decide returns success on a failed candidate-approved update** (warn-only after durable
  source/item writes), so a re-decide would double the trust-event; the dedup guard prevents a duplicate
  source.
- **F20 - triage asymmetry.** ingest-rejections POST has no 404/409 (re-triage silently overwrites); the
  PJR sibling has both. PJR's dynamic column is whitelisted (injection blocked).
- fetch-now confirmed: a manual fetch is a PROBE (accessibility stamps only, 800-char preview); it persists
  NO content. Consistent with Part I answer 3.
- bulk-import confirmed: dryRun defaults TRUE; apply writes only via `verifyCandidate` or a tier-7
  provisional fallback; its dry-run still spends Browserless units per row (headCheck), so the header's
  "dry-run calls do not touch the database" is true of the DB but not of outbound spend.

**Primitives ring (all pure/network primitives read; five discrepancies):**
- **D1 - haiku-classify.ts header advertises a removed export.** `haikuClassify` was deleted 2026-05-11;
  `CONTENT_HAIKU_SYSTEM_PROMPT` + the Classify* types are dead code behind a stale header.
- **D2 - canonical-fetch.mjs header describes the OLD 2-tier design.** The code is 3-tier
  (plain then stealth then unblock) and returns the least-bad blocked result rather than throwing.
- **D3 - url-canonicalize re-encodes query bytes, contradicting its own header** ("does NOT decode
  percent-encoded characters in path or query"). VERIFIED EMPIRICALLY: `?uri=CELEX:32020R1056` becomes
  `?uri=CELEX%3A32020R1056`. Benign for comparisons (both sides canonicalize) but MUTATING if output is ever
  written back to a URL column; the file's own wwwNormalize comment admits this is why stored URLs were
  never bulk-canonicalized.
- **D4/D5 - api-fetch.ts** claims per-source-keyed credentials but reads only the shared `SOURCE_API_KEY`,
  and it truncates to maxTextLength with NO `truncated`/`fullTextLength` in its return, the ONE fetch
  primitive that still caps silently (canonical-fetch reports both; the no-silent-truncation rule has a hole
  on the API transport).
- Confirmed sound: `matchExistingSubject` (the dedup matcher) matches on instrument_identifier equality /
  canonical source_url equality / shared EU reg-number, NEVER title similarity. `officialnessOf` path-a
  requires host-qualifies AND at-least-200ch-past-the-nav body AND instrument markers. `compareFreshness`
  uses etag (opportunistic) + Last-Modified-vs-capture-time; content-length NOT compared; any HEAD failure
  becomes unknown then continue-on-stored. `cheapVerifyClaims` passes only when at least one FACT claim
  exists AND every FACT span is present in the stored snapshot. `holdingsPresent` = snapshot>1000 bytes OR
  at-least-2 usable pool rows. `LINK_ALLOWED_TABLES` + `assertMoatBoundary` (in entity-resolve.mjs) enforce
  the link-step moat with a throw. `browserlessFetch` and `apiFetch` both carry the transport hold gate with
  caller-null = fail-closed.

## II.4 Exhaustion statement

Every writer of every table in the enumeration is now either (a) read in full in Part I, (b) read in full
in this pass, (c) a dated one-shot script that is the committed audit record of an already-executed data
change (per the code-vs-data doctrine, enumerated and sampled, not re-read line-by-line: the
`tier1-*/sprint3-*/sprint4-*/wave*/_reconciliation-*` families and `wave1-cold-start.mjs`), or (d) a
user/tenant-state writer boundary-classified in II.1. The community-to-corpus boundary and the
mint-chokepoint singleton were verified mechanically, not by sampling. The remaining deliberately-unread
ring is (c) plus test/golden files, named here, not silent. This is the complete intake/sort/save surface.
