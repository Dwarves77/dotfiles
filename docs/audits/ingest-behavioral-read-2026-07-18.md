# Ingest Pipeline — Behavioral Read + Merge Re-Verification (2026-07-18, Session E recovery)

**Mandate.** Establish what the ingest system actually does by reading the code (not the wiring map, not
summaries), re-verify every change merged today against that read, restore anything the live pipeline
touches, and label gaps as gaps. Where a document and the code disagree, the code is the truth and the
document is a finding.

**Method.** Read in call order: `src/workflows/generate-brief.ts`, `src/lib/agent/canonical-pipeline.ts`,
`src/lib/intake/run-intake-cycle.ts`, `src/lib/intake/mint-item.ts` + `apply-staged-update.ts`,
`src/app/api/worker/check-sources/route.ts`, `src/app/api/worker/reconcile/route.ts`,
`src/lib/sources/reconcile.ts`, `src/lib/sources/snapshot-store.mjs`, `src/lib/sources/verify-item.mjs`,
`scripts/remediation/acquire-primaries-batch.mjs`, plus live DB queries (project kwrsbpiseruzbfwjpvsp).
Session A's live-session account of the intake stages was cross-checked against the code line by line; it
is accurate for the acquire-script path Session A ran, with the workflow-vs-script distinction noted below.

---

## 1. The five answers (with code citations)

### (1) When we hold a source, what do we actually extract? ONE document, never a source sweep.

The system is item-centric and document-centric end to end. An intelligence_item = ONE document (its
`source_url`). There is no mechanism anywhere that enumerates all documents at a source and creates an item
per document.

- **Live workflow path.** `generateBrief` (canonical-pipeline.ts:839) fetches the item's ONE `source_url`
  via `fetchPrimaryDeep` (:863), commented "Fetched ONCE here (never re-fetched in the pool below)" (:862).
  `fetchPrimaryDeep` (:590) = `fetchPrimaryWithFallback` with `maxAlts:3` (:611): it tries the declared
  primary, and on a roadblock tries up to 3 discovered ALTERNATIVE URLs — alternatives are REPLACEMENTS for
  a broken primary, not additional coverage. It then adds `web_search`-discovered CORROBORATORS
  (`discoverCorroborators`, :871), each an individual corroborating page, char-capped at
  `CORROBORATOR_MAX_CHARS`. The pool = primary + fetched corroborators.
- **Acquire-script path** (Session A's `acquire-primaries-batch.mjs`, the real ingest work). Per EXISTING
  item: fetch `source_url`, `extractPortalLinks` to find the enacted deep-link behind a portal (PDFs
  preferred), add pool corroborator URLs, then ACCEPT THE FIRST candidate that clears `officialnessOf` at
  path 'a' (:69-80). It resolves the ONE correct instrument for one item and repoints; it does not sweep the
  source for its other documents.
- **`run-intake-cycle`** (run-intake-cycle.ts:80-127) mints ONE item per caller-supplied candidate
  `{title, source_url, item_type}` (:35). The candidate IS one document.

**Answer:** we extract the one document the item points at (plus web-search corroborator pages / the one
enacted instrument behind a portal). No component, workflow or script, sweeps a source's document tree.

### (2) Does a detected change ever adjust existing analysis, or does the signal terminate? It TERMINATES.

- `check-sources` (route.ts:64-65) fingerprints the render, sets `change_detected` on a `monitoring_queue`
  row (:96-104) and `sources.last_content_changed_at` (:75). Line 62, verbatim: "Downstream auto-action on a
  change is deliberately NOT wired here."
- `reconcile` worker (reconcile/route.ts) reads `monitoring_queue` where `change_detected=true`, and for
  each affected item writes a flag-event row to `intelligence_changes` (`recordSourceChangeTrigger`,
  reconcile.ts:88, with `previous_value=null, new_value=null`), then marks the queue reconciled. It does NOT
  re-fetch, re-ground, or flip provenance. Its own closing note: "Detailed field-diff + provenance reset
  (re-ground) run via generation once content is available" — but nothing triggers that generation.
- `intelligence_changes` is READ by exactly ONE place: the Dashboard "recent changes" digest
  (supabase-server.ts:1449-1454, `limit(100)`, display only). There is no re-ground consumer.
- **Live evidence:** `intelligence_changes` = **0 rows**; `monitoring_queue` `change_detected=true` and
  unreconciled = **0**. The loop has never carried a signal (both workers frozen / uncalled).

**Answer:** a detected change is recorded and, if the workers ran, displayed on the dashboard. It NEVER
adjusts a claim, brief, or analysis. The design's scan → compare → ADJUST has the adjust half unbuilt; the
signal terminates.

### (3) Is save-all-data true, and where does it stop? TWO paths, and the workflow path does NOT snapshot.

There are two distinct capture stores, and which one fills depends on the path:

- **`agent_run_searches`** (the working pool) — written by the live workflow's `generateBrief`
  (canonical-pipeline.ts:909-923). It is per-item and REPLACED each generate: `DELETE ... eq(item)` then one
  batched `INSERT` (:922-923). Content excerpts are char-capped; truncation is flagged, not stored in full.
- **`raw_fetches`** (the permanent, content-addressed, append-only snapshot) — written by `writeSnapshot`
  (snapshot-store.mjs:95). **`writeSnapshot` is called ONLY from operator-fired scripts**
  (`scripts/remediation/acquire-primaries-batch.mjs:130`, `scripts/_reground/acquire-*.mjs`) — the runners
  Session A used. It is NOT called by the live workflow (`generate-brief.ts` / `canonical-pipeline.ts` /
  `verify-item.mjs` read `raw_fetches` for the holdings gate at canonical-pipeline.ts:832 but never write
  it). The 660 historical rows are the 2026-05 cold-start (`wave1-cold-start.mjs`) plus Session A's acquire
  runs.

**Answer:** "save everything permanently" (raw_fetches, append-only, no delete path) is TRUE for the
operator-fired acquire-script path (Session A's work). It is NOT true for the live `/api/agent/run`
workflow, which persists only the replaceable `agent_run_searches` pool. A workflow-generated item that
was never run through an acquire script has no permanent snapshot — which is exactly why `verify-item`
cheap-verify finds no snapshot for such items and falls to the (frozen) acquire path. This is a finding, not
damage from today's merges (no merge touched snapshot-store or the acquire scripts).

### (4) If the existing pipeline were pointed at a full source sweep today, unmodified, where would it stop short?

At the very first step. There is no source-document enumeration anywhere. `fetchPrimaryDeep` fetches one
document; `discoverCorroborators` searches for THIS item's corroborators; `extractPortalLinks` (used by
check-sources and the acquire script) DOES list a portal's deep links, but nothing turns that list into an
item-per-document mint — `portal_link_candidates` is written (check-sources:117) and has **0 rows** live,
and no consumer reads it into the intake path. `run-intake-cycle` consumes a caller-supplied candidate list;
nothing produces a complete per-source candidate set.

**Answer:** it stops short at "enumerate the documents at this source." Everything downstream of that
(mint chokepoint, groundBrief, the four mint gates, validate_item_provenance, non-destructive apply) already
exists and would absorb per-document candidates unchanged. The missing seam is: source → its document list →
one candidate per document. `extractPortalLinks` is the nearest existing brick; it is written but never fed
into intake.

### (5) What does the existing pipeline already provide that today's crawl spec duplicated or ignored?

- **Already provides (the crawl spec duplicated):** `web_search` source discovery
  (`discoverCorroborators`, :871); identifier-derived URL discovery (`generateCandidates` / seek-more, :601);
  the grow-step source-discovery loop (`growSourcesFromBrief`) that surfaces NEW sources from every brief;
  portal deep-link listing (`extractPortalLinks`); the one intake path (`run-intake-cycle`); the mint
  chokepoint; snapshot-first verify; the full gate stack. The crawl spec re-proposed "enumerate → classify →
  diff → stage → one intake path" as if new — most of it exists.
- **Ignored (the two real gaps):** complete extraction of a HELD source (the one-document-per-item limit,
  section 1) and the OPEN change-to-analysis loop (section 2). The crawl spec said "built on reconcile +
  intelligence_changes as they exist" without reading that `intelligence_changes` has no re-ground consumer
  and 0 rows. It also measured "106 missing" by diffing a candidate list against a corpus of
  partially-extracted sources — a false denominator, because missing-ness measured against one-document-per
  item sources is not a real gap count.

**The crawl spec is discarded as a build basis** (per the mandate). Its register-enumeration research
(EUR-Lex/Federal Register/gazette endpoints) is salvage material only.

---

## 2. Step 1B — every merge today, re-verified behaviorally. Zero restorations.

Each purge was re-checked against the behavioral read AND dynamic references, string-built routes,
config-driven dispatch, migration dependencies, and DB objects — not just static imports. Nothing in the
live ingest path references any purged item. No restoration was required.

| Merge | Behavioral / dynamic / DB verification | Verdict |
|---|---|---|
| **P-1** sources/discover + discovery.ts (#345) | No static, dynamic, or string caller. `discoverForJurisdiction` was a standalone admin SOURCE-finder; it is on no path in generate / ground / mint / run-intake-cycle. | SAFE |
| **P-2/P-8** /api/staged-updates route (#345) | The ROUTE was purged, NOT the `staged_updates` TABLE (live, **35 rows**). The intake path uses the table via `run-intake-cycle` (:85) + `applyStagedUpdate`; `/api/admin/scan` stages into it. No code fetches the route (all string matches are comments / references to the table concept). | SAFE |
| **P-3** notifications/preferences (#345) | Zero callers; unrelated to ingest. | SAFE |
| **P-4** workspace/regulations-defaults (#345) | Zero callers; unrelated to ingest. | SAFE |
| **P-5** rss-fetch.ts (#345) | `access_method` dispatches ONLY api-vs-browserless (`fetch-now/route.ts:94`); an `rss` value falls to browserless. The **189** sources with `access_method='rss'` were ALWAYS browserless-rendered, never routed to rss-fetch. `secFairAccessUaForUrl` re-homed to `sec-fair-access.ts`, consumed by `browserless.ts:14,55`. | SAFE. FINDING (pre-existing): 189 sources declare rss with no rss transport — relevant to a future feed-intake wave, not damage. |
| **P-6** source_conflicts slice + computeConflictResolutionImpact + mig 215 DROP (#345, applied) | Live DB: **0** functions and **0** views reference `source_conflicts` (no CASCADE damage; the only dependent, the `open_conflicts` view, was already dropped by mig 180). The pipeline reads `source_trust_events` (LIVE, 6 writers) not `source_conflicts`; `computeConflictResolutionImpact` was test-only. | SAFE |
| **P-7** q7-daily-recompute route (#345) | No scheduler, no caller; the end-of-cycle recompute inside `growSourcesFromBrief` is the live path. | SAFE |
| `source_trust_events` narrowing | **NOT executed** (deferred on merits — the table is live with 6 writers). Correctly not done. | N/A |
| ADR-015 + register amendments (#344) | Documentation + doctrine-register text. No runtime code path. `research-is-horizon-scan` gained a residual; RD-33 gained a clause. No ingest effect. | SAFE (docs) |
| ACTIVE_PHASE advance (#344) | A pointer in GOVERNING-PROGRAM.md; C5 anchor check green. No code behavior. | SAFE (doc) |
| skill-gate fix (#346) | `skill-token.mjs` is the dev-time PreToolUse hook matcher; not in the ingest runtime. Tests 12/12 + 26/26. | SAFE (dev-time) |
| C4 checker fixes (#342/#343) | Dev-time consistency check; not ingest. | SAFE (dev-time) |
| crawl spec (#347) | A document. Discarded as build basis; marked superseded in the board (this recovery). No code. | SUPERSEDED |

**Migration 215** (source_conflicts DROP) applied cleanly with the content gate (0 rows) and zero dependency
damage, confirmed by the live pg_proc / pg_views check. It is not restored; the drop was correct.

**Conclusion of Step 1B: no merge today damaged the live ingest path. No restorations were needed.** The
purges removed genuinely dead surfaces; the behavioral read confirms the pipeline touches none of them.

---

## 3. Where documents disagreed with the code (findings)

- **Session A's account vs the workflow path.** Session A's live-session description (capture → raw_fetches
  + agent_run_searches) is accurate for the ACQUIRE-SCRIPT path Session A ran (`writeSnapshot` fires there).
  The LIVE `/api/agent/run` WORKFLOW does not call `writeSnapshot`; it persists only the replaceable pool.
  Both write claims through the same `groundBrief` chokepoint, so Session A's Stages 4-6 (single mint
  chokepoint, four mint gates, non-destructive apply, three sanctioned exits, validate_item_provenance) are
  accurate for both paths (verified: `applyLedgerDiff` is the single claim writer at canonical-pipeline.ts:1604;
  `verifyPoolTargetMatch` target-match is wired at :1323).
- **The dormant-systems audit's framing (wiring map) vs behavior.** The audit correctly mapped callers but
  did not read that the change-to-analysis loop terminates or that the workflow path never snapshots. Those
  are behavioral facts a caller-graph cannot show. This report is the behavioral complement.

## 4. Uncertain / gaps (labeled)

- `groundBriefImpl` (canonical-pipeline.ts:1140-1676) is 536 lines; I read its structure (target-match,
  the four mint gates via `perFactGates`, `applyLedgerDiff`, validate) and its single-claim-writer property,
  but not every branch line by line. No contradiction found; flagged as a not-exhaustively-read region.
- The exact freshness-probe semantics in `verify-item` (`probeFreshness` HEAD comparison) were read at the
  interface level, not the byte level. It does not consume the check-sources `change_detected` signal (the
  two change-detection mechanisms are independent) — that much is confirmed and is part of the section 2
  finding.
- Whether Session A's acquire runs have snapshotted all ~209 verified items to raw_fetches is a DB question
  for the build plan's proving-slice sizing, not a correctness question here.

---

*This is the Step 1 output. The build plan (Step 2) is a separate document. Nothing in this report changed
any code or data; it is a read plus the re-verification of already-merged work.*
