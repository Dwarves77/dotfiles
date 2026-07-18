# Dormant-Systems Audit, 2026-07-18 (Session E)

**Mandate.** Close the audit class the prior dead-code audit missed: built, wired, gated-off machinery.
Five inventories (dormant-wired gates; endpoints; workers/workflows; governance-code divergence;
purge candidates), each item judged three-state: **keep-and-integrate / purge-candidate /
unresolved-operator**. This document is the input to (a) the operator's purge ruling, (b) the
two-tier crawl rebuild spec, and (c) Session A's stall-gate decision.

**Baseline.** master `eb99dc64` (PR #340 merge). Worktree `wt-audit` (registered in
`docs/inventories/worktrees.md` this commit). Read-only throughout: zero code, flag, workflow, or
data changes; this document and its board/inventory/index riders are the only writes.

**Method.** Direct reads of every gate module, all 7 GitHub workflows, all 83 API route files'
caller graphs (mechanical grep sweep over `src/`, `scripts/`, `.github/workflows/`, with per-route
verification of every zero-hit and truncated result), all 14 ADRs, all 58 doctrine-register entries,
and targeted `git log` traces for state-change commits. Session D's forensics report was read in full
(commit `048669a9`, branch `corpus-integrity/cc-grounding-executor-d`, appending to
`docs/ops/session-log.md`; not yet on master at write time). D's context facts relied on here were
independently re-verified where marked.

**DB state is deliberately NOT claimed.** Live flag values, scan reachability, and queue contents
are operator-dashboard checks (section 7), not code inferences. No DB query was attempted; the
Supabase MCP skill-gate that blocked Session D was not tested or worked around.

---

## 1. Prior-audit scope: diagnosis confirmed, with one correction

**Working diagnosis given:** the prior audit inventoried zero-caller code only and had no category
for built-wired-gated-off.

**Verdict: confirmed in effect, corrected in detail.** The prior audit is the full-system audit of
2026-07-11 (`docs/ops/full-system-audit-2026-07-11/`, baseline `71bcbd4`). It was not literally
blind to dormancy; individual registers recorded dormant items piecemeal (DB-3 F7 "dormant queue +
never-fired change detection", CODE-1 span-check "currently unwired", CODE-2 F-6 trust.ts dormant
promotion engine, CODE-5a q7 "superseded-but-armed, no scheduler"). The class failure was
structural, three ways:

1. **Taxonomy.** Its severity ladder (P1 breaks-customer / P2 breaks-doctrine / P3 dead-weight /
   P4 cosmetic) has no dormant-wired state. Every dormant observation was routed to P3
   "dead-weight (the erase backlog)", an erase-shaped category, or waved through with "fine while
   the hold is on" (DB-3 F7 verbatim). Built-wired-gated-off as a system state to be inventoried,
   dated, and checked against intent did not exist.
2. **Lens.** The correction plan opens: "the hold is deliberate, build-first. Freshness/intake gaps
   ride the flip (Jason's switch) and are NOT in this plan." Frozen intake machinery was excluded
   from correction scope by ruling, so nobody asked who froze what, when, or whether the frozen
   state matched founding intent.
3. **Timing and doctrine cover.** ADR-012 (same date, 2026-07-11) reframed the hold from emergency
   to design. The audit's lens cites the same posture. From that day, governance docs read the
   freeze as intended, which is why a reader of governance would not go looking.

The dormant P2-5/P2-6 units (portal-crawl, change-detection) landed 2026-07-08, three days before
that audit; it saw their empty tables (`portal_link_candidates` listed among 29 empty tables) and
raised no dormant-machinery finding about them. The narrower zero-caller precedent (seek-more,
built with zero live callers, its own test the only caller) was caught only later, by the
2026-07-14 acquisition-ladder post-mortem, and is now doctrine
(`caller-count-is-not-wiring-verification`). This audit closes the complementary class: code that
HAS callers and passes a zero-caller scan while a switch upstream keeps it from ever running.

---

## 2. Inventory 1: dormant-wired gates, flags, and freezes

Legend: state = repo-visible state; live DB/env values are section 7 checks. "Callers y/n" = does
committed code actually consult the gate on a live path.

### 2.1 DB-backed operator switches (system_state singleton + sources columns)

| # | Gate | What it gates | Repo-visible state | Last state-change (repo evidence) | Live callers | Judgment |
|---|---|---|---|---|---|---|
| 1 | `system_state.scrape_cadence` (`off\|weekly\|monthly`) | ALL fetch-capable routes via `isGloballyPaused()` (cadence `off` blocks operator paths too); the worker additionally via `scrapeWindowOpen()`; autonomous generation via `evaluateGenerationPause` | Doc-recorded `off` since the 2026-07-07 ruling ("Cadence stays OFF"); live value = dashboard check | Ruling 2026-07-07 (session log); value is DB state, no code default change since | y (12 files) | keep-and-integrate |
| 2 | `system_state.global_processing_paused` | Emergency stop, hard halt for every caller including F16-signed | Unknown from repo; dashboard check | Writer locked to `admin_set_pause_state` RPC, migration 201 + F20 + RD-23 (2026-07-12) | y | keep-and-integrate |
| 3 | `system_state.scrape_start_date` | Cadence anchor; unset = never runs | Unknown from repo; dashboard check | n/a | y (schedule math) | keep-and-integrate |
| 4 | `sources.processing_paused` (per-source) | Per-source fetch pause (`isSourcePaused`) | Per-row DB state | n/a | y | keep-and-integrate |
| 5 | `sources.auto_run_enabled` (per-source kill switch, Wave 1a) | Worker eligibility per source | Per-row DB state; post-cold-start default was "no source eligible" | Wave 1a (2026-05) | y (worker) | keep-and-integrate |
| 6 | `sources.status='active' AND admin_only=false` | The provisional-source processing gate (provisional rows get one reachability check, nothing more) | Per-row DB state | founding-era doctrine | y | keep-and-integrate |

### 2.2 Env-driven gates (deployed values are out-of-repo; see section 7)

| # | Gate | What it gates | Default / semantics | Last state-change commit | Live callers | Judgment |
|---|---|---|---|---|---|---|
| 7 | `SCRAPE_HOLD` (`fetch-hold.mjs`) | Every canonical fetch at the transport primitive (`assertFetchAllowed`); two signed callers pass an engaged hold (`manual-intake-run`, `unit3-remediation`, the F16 manifest) | Default LIFTED when unset (prod-preserving); engaged only by explicit token | Introduced with the transport unit (2026-07-06); two-caller exception `6425b749` (Unit 0b, 2026-07-11) | y | keep-and-integrate |
| 8 | `GROUNDING_ACQUIRE_ENABLED` (`acquire-lock.mjs`) | The paid-acquire path (external fetch + model grounding); composes with SCRAPE_HOLD | Default OFF; affirmative token only; per-sanctioned-run arming | PR #295 (`19c6b333`, 2026-07-12/13) | y (verify-item, canonical-pipeline, funded-pass, generate-brief) | keep-and-integrate |
| 9 | `SPEND_REGIME` (`spend-regime.mjs`) | Which spend regime governs paid work; under BUILD-PHASE all standing dollar figures are information-only | BUILD-PHASE current; switched only by ruling | Operator ruling 2026-07-15 | y | keep-and-integrate |
| 10 | `SPEND_FREEZE_SINCE_ISO` (spend-health) | The post-freeze boundary the spend alarm keys on (paid row not tracing to an operator-priced line) | Moved 07-13 to 07-15T03:00Z as the designed resumed-spend escape | PR #336 (`4da0169`, 2026-07-15) | y (uptime-probes daily) | keep-and-integrate |
| 11 | `SPEND_CEILING_USD` / monthly ceiling ($130 code-only) / `GENERATION_DAILY_CAP_USD` | Information-only under build-phase regime (doctrine `build-phase-spend-regime`); never a gate | Retired as limits 2026-07-13/15 | Rulings 2026-07-13 + 2026-07-15 | y (display/findings) | keep-and-integrate |
| 12 | `GROUND_MODEL` | Grounding model knob (Sonnet default per the A/B verdict, doctrine `model-tier-rule`) | Sonnet full-ground, Haiku delta/classify | PR #336 window (2026-07-14) | y | keep-and-integrate |

### 2.3 CI-level freezes and code-level gate logic

| # | Gate | What it gates | State | Last state-change commit | Live callers | Judgment |
|---|---|---|---|---|---|---|
| 13 | Commented `schedule:` in `.github/workflows/source-monitoring.yml` | The hourly check-sources tick (the ONE formerly-scheduled discovery-adjacent job) | FROZEN since 2026-07-12/13; `workflow_dispatch` remains | `11c008c2` ("ci: freeze unattended acquisition crons", PR #295) | the workflow is the caller of `/api/worker/check-sources`; nothing calls the workflow | unresolved-operator (restoration surface for the crawl rebuild; not a purge candidate) |
| 14 | Commented `schedule:` in `.github/workflows/spot-check-monthly.yml` | Monthly classifier-drift spot check (~20 Haiku calls + reachability fetches) | FROZEN, same commit, dispatch-only | `11c008c2` | same shape | unresolved-operator (same restoration decision) |
| 15 | `scrapeWindowOpen()` (`scrape-schedule.ts`) | Worker-only cadence window on top of the off-gate | Pure logic, live | Option-1 cadence model (per-source cadence retired) | y (worker) | keep-and-integrate |
| 16 | `evaluateGenerationPause` + `AUTHORIZED_HOLD_CALLERS` (F16 manifest) | Generation split: emergency stops everyone; cadence-off stops autonomous only; signed manual caller proceeds (RD-21, doctrine `pause-is-prohibition-dormancy-is-schedule`) | Live | Ruling 2026-07-12 | y | keep-and-integrate |
| 17 | `ACTIVE_PHASE` (`docs/program/GOVERNING-PROGRAM.md`) = `phase-intake-gate` | C5 phase-anchor re-grounding gate (RG-1) | Pointer still on the intake-gate phase, which flipped live 2026-07-08 (PR #218); not advanced since | PR #218 | y (C5 at pre-push + CI) | unresolved-operator (advance or confirm the pointer; a stale ACTIVE_PHASE makes C5 verify a completed phase) |
| 18 | Mint gates S-CONFLATE (hard) / S-NUMERIC (soft) | FACT minting (RD-41; hold-not-reject) | LIVE, not dormant; listed because flip state is doctrine-tracked | Flip `922825ec` + migration 206 (2026-07-16) | y | keep-and-integrate |

**Stale gate references (cosmetic, fix-with-next-touch):** `pause.ts` header and an
`/api/agent/run` comment still name the `drain-first-fetch` worker among live fetch entries; that
worker was dissolved 2026-07-12 (`mint-item.ts` header records the dissolution).

---

## 3. Inventory 2: all 83 API routes classified

Count verified: `find src/app/api -name route.ts | wc -l` = 83 at baseline. Classes:
**live-wired** (reachable from current UI, an active worker/workflow, or by design),
**gated** (wired but a switch or freeze sits upstream), **orphaned** (zero callers).
Caller evidence: mechanical sweep + per-route verification of every zero-hit.

### 3.1 Live-wired: 75 routes

- **Community (24 of 25):** `groups` + `groups/[id]/{invitations,invite,invite-candidates,join,members,settings,star}`, `invitations/[id]/{accept,decline,revoke}`, `moderation/reports` + `[id]`, `notifications` + `[id]` + `counts`, `posts` + `[id]` + `{promote,replies,signoff}`, `search`, `signoff/[id]/{decide,withdraw}`. All have live component callers.
- **Orgs/invitations/workspace (11):** `orgs` ×5, `invitations/[token]` ×3 + `invitations/mine`, `workspace/overrides`, `watchlist`.
- **Platform (9):** `ask`, `auth/linkedin/{start,callback}`, `cache/revalidate-item` (generate-brief workflow + ISR), `health/{spend,surfaces}` (uptime-probes, ACTIVE schedules), `intelligence-items/[id]/metadata`, `telemetry/error`, `version` (zero in-repo callers BY DESIGN: operator-approved public build-metadata endpoint for external audit anchoring, documented in `fsi-app/.claude/CLAUDE.md`).
- **Admin (25):** `attention`, `b2-progress`, `canonical-sources/{pending,decide,bulk-approve,bulk-classify,recommend-classification}`, `coverage`, `integrity-flags` + `[id]/{regenerate,resolve}`, `intersections`, `recompute-trust` (ACTIVE monthly workflow `trust-recompute.yml`), `sources/{commit-tier-change,pause-global,promote,recommend-classification,recommend-tier,tier-opinions}`, `sources/[id]/{pause,tier-override,visibility}`, `triage/{ingest-rejections,pending-jurisdiction-review}`, `users`.
- **Fetch-capable admin, live UI + pause-gated (5):** `admin/scan` (AdminDashboard.tsx:236, verified; `pausedResponse` + 4h cooldown), `admin/sources/bulk-import`, `admin/sources/[id]/fetch-now`, `admin/sources/[id]/regenerate-brief` (delegates to agent/run), `agent/run` (platform-admin; generation-pause split RD-21). These are live-wired in code AND gated by the cadence/pause switches, the exact dual state the prior audit's taxonomy could not express. Whether a click executes today is a dashboard check (section 7).
- **Staged-updates GET** counts here conditionally: see 3.3.

### 3.2 Gated (wired, a switch or freeze upstream): 4 routes

| Route | Wiring | The gate(s) | Judgment |
|---|---|---|---|
| `/api/worker/check-sources` | Called ONLY by `source-monitoring.yml`, whose schedule is commented out (dispatch-only) | frozen schedule + worker-secret + `isGloballyPaused` + `scrapeWindowOpen` + per-source `auto_run_enabled` | keep-and-integrate (this route is the natural home of the awareness-tier tick; it already carries change detection + portal-link harvest on the paid render) |
| `/api/admin/spot-check/recurring` | Called ONLY by `spot-check-monthly.yml`, schedule commented | frozen schedule + worker-secret + off-gate + 4h cooldown | keep-and-integrate (classifier-drift QA; independent of crawl but restorable the same way) |
| `/api/admin/run-intake` | ZERO callers anywhere (UI, scripts, workflows). ADR-012 promised "an admin surface control + a script path"; only the API route was built. Never executed ("0 manual-intake-run agent_runs", session log 2026-07-14, doc-sourced) | requirePlatformAdmin + the intake-cycle machine gates | keep-and-integrate (this IS the one-pipeline entry, doctrine `manual-intake-run-is-the-one-pipeline`; the crawl rebuild's intake handoff should land here, and the two promised invocation surfaces are owed) |
| `/api/admin/q7-daily-recompute` | No scheduler anywhere (vercel.json has no crons; no workflow); worker-secret manual-only since Phase 1 (2026-06-28) retired the nightly model in favor of the end-of-cycle recompute inside `growSourcesFromBrief` | worker-secret | unresolved-operator (name says daily, nothing daily exists; the superseded `.mjs` script the prior audit's E5 flagged is already deleted, verified absent; keep as manual full-recompute utility or purge the route) |

### 3.3 Orphaned (zero callers): 4 routes

| Route | Evidence | Judgment |
|---|---|---|
| `/api/admin/sources/discover` (+ `src/lib/sources/discovery.ts::discoverForJurisdiction`) | Zero callers. The CoverageMatrix "discover" affordance was removed Wave-α A5 (2026-07-11, comment in `CoverageMatrixView.tsx:87`) and never re-wired | purge-candidate (see section 6 rationale) |
| `/api/community/notifications/preferences` | Zero callers; no UI reads or writes notification preferences | purge-candidate (product-orphan class, not crawl-related) |
| `/api/workspace/regulations-defaults` | Zero callers; PR-E2 built L2 server persistence for Save-as-default, the UI ships localStorage-only | purge-candidate (product-orphan class) |
| `/api/staged-updates` | GET (visibility list): zero callers, AdminDashboard reads `staged_updates` directly via supabase client (AdminDashboard.tsx:196). POST: a deliberate 410 tombstone for the retired human-approval path (RD-20 / Unit 0c) | GET purge-candidate; POST unresolved-operator (keep as permanent tombstone vs tombstone-then-delete) |

`/api/worker/reconcile` (zero callers) is classified in section 4 as the deliberately-unwired
consume half of P2-6, not as an orphan: its unwired state is a recorded operator gate ("Consume
steps deliberately unwired, the flip is the operator's word", session log 2026-07-08).

---

## 4. Inventory 3: workers and workflows, actual behavior vs named purpose

### 4.1 GitHub workflows (all 7; repo root `.github/workflows/`)

| Workflow | Trigger state | Named purpose vs actual behavior | Judgment |
|---|---|---|---|
| `source-monitoring.yml` | **FROZEN** (schedule commented, `11c008c2`); dispatch-only | Name: source monitoring. Actual TODAY: POSTs check-sources, which does an accessibility probe PLUS real content-fingerprint change detection (PR #252) PLUS portal deep-link harvest (PR #253) on the same render. Actual AT PEAK (pre 2026-07-07): accessibility ping only, `change_detected` hardcoded false (the named precedent; hardcode confirmed in the route's own comment at line 59). The name-behavior gap is CURED in code and FROZEN in operation | unresolved-operator (restoration is the crawl-rebuild decision) |
| `spot-check-monthly.yml` | **FROZEN** (same commit); dispatch-only | Name matches behavior: monthly 20-source Haiku re-classification calibration | unresolved-operator (same restoration decision) |
| `trust-recompute.yml` | **ACTIVE** (monthly, 03:00 UTC on the 1st) | Name matches behavior: DB-only Bayesian trust recompute via `/api/admin/recompute-trust`. No external fetch, no LLM. The one scheduled DB-writing job that survived the freeze; consistent with the freeze's own scope (unattended ACQUISITION) | keep-and-integrate |
| `data-audit-lane.yml` | **ACTIVE** (nightly 06:00) | Name matches behavior: 8 hard read-only live-data audits + 1 soft | keep-and-integrate |
| `uptime-probes.yml` | **ACTIVE** (30-min surfaces + daily 09:00 spend watch) | Name matches behavior: read-only probes; spend alarm = untraceable post-freeze paid row | keep-and-integrate |
| `discipline.yml` | **ACTIVE** (push/PR CI) | Name matches behavior: RaC engine | keep-and-integrate |
| `bug-class-guard.yml` | **ACTIVE** (push/PR CI) | Name matches behavior: hard discrimination selftests + soft repo scans | keep-and-integrate |

### 4.2 App workers and durable workflows

| Unit | State | Behavior vs purpose | Judgment |
|---|---|---|---|
| `/api/worker/check-sources` | Built, trigger frozen | See 4.1. The consume half of its change-detection output is `/api/worker/reconcile` | keep-and-integrate |
| `/api/worker/reconcile` | Built, NEVER had a caller | Reads `monitoring_queue.change_detected=true, reconciled_at IS NULL`, records changes into `intelligence_changes`. Deliberately unwired pending the operator flip (session log 2026-07-08). Correctly named | keep-and-integrate |
| `src/workflows/generate-brief.ts` | LIVE via `/api/agent/run` | The canonical durable generation workflow (preflight, generate, register, section, ground, grow). Correctly named | keep-and-integrate |
| `run-intake-cycle.ts` (lib) + its route | Built, zero invocations ever | The machine-gated mint-to-validate cycle, RD-20. Candidates are supplied BY THE CALLER; it discovers nothing itself (re-verified: no discovery call in the cycle) | keep-and-integrate (the crawl rebuild's intake handoff target) |
| Operator-fired script runners (`funded-pass.mjs` with RD-38 run-lock, `regen-quarantined.mjs`, verify/* lanes) | Manual, unscheduled by design | Correctly named; spend-gated by the section 2 stack | keep-and-integrate |
| RETIRED this cycle (for the record): `runSeekMore` orchestrator (retired `58930fea` 2026-07-14, derivation logic folded into the live ladder), `drain-first-fetch` worker (dissolved 2026-07-12), `b2-runner.mjs` (superseded), `q7-daily-recompute.mjs` script (deleted; E5 executed) | already gone | n/a | no action |

---

## 5. Inventory 4: governance-code divergence

ADR-012 was the proven instance. Full sweep: 14 ADRs + 58 doctrine-register entries + the new
worklist-note class. The register is in good mechanical health: the meta-gate enforces that every
entry is enforced-or-exempt-with-reason, and no entry claims an invariant that does not exist
(CI-checked). The divergences below are semantic, where doctrine describes a system state code does
not deliver.

### 5.1 The ADR-012 cluster (the proven instance, decomposed into checkable parts)

| # | Divergence | Evidence | Judgment |
|---|---|---|---|
| G-1 | ADR-012 section 1 promised a first-class "run intake now" control: "an admin surface control + a script path". Only the API route exists; zero UI, zero script, zero executions | Caller sweep (section 3.2); session-log "0 manual-intake-run agent_runs" (2026-07-14) | keep-and-integrate (build the owed surfaces with the crawl rebuild; until then ADR-012's central mechanism is unexecutable without a hand-crafted HTTP call) |
| G-2 | ADR-012: "The saved-cadence / auto mechanism stays built and dormant. Flipping it on later is config, not code." Falsified the next day: `11c008c2` (2026-07-12/13) commented out the workflow schedules, so restoration now requires a code change (uncomment YAML) plus config (DB cadence) plus env. ADR-012 was never amended | ADR-012 section 1; `11c008c2` diff | unresolved-operator (amend ADR-012 to record the true flip cost, or restore the schedule stubs at rebuild time) |
| G-3 | ADR-012: "This is the operating design, not a temporary safety posture" vs the CURRENT `fsi-app/.claude/CLAUDE.md`: "Not a regulation tracker, a source-monitoring system", "The system monitors sources. Sources produce intelligence items. Manual entry is not the model." Both are in force today. This is a live doctrine-vs-doctrine contradiction, and the founding side matches the founding commit `a8cd8d1a` verbatim | Both files at baseline | unresolved-operator (the crawl-rebuild ruling IS the resolution; whichever way it goes, one of the two texts must be amended) |
| G-4 | ADR-012 header claims "operator ruling, Jason, 2026-07-11, transmitted-as-written". The campaign record (this audit's kickoff, and the operator's own reaction that a forensic session was needed to answer "wasn't this system designed to scan?") treats the permanent-manual reframe as not operator-signed. The repo cannot decide who authored the reframe language; the ADR asserts sign-off, the campaign asserts its absence | ADR-012 header vs dispatch record | unresolved-operator (only the operator can rule whether ADR-012 section 1's "not a temporary safety posture" sentence was their intent; flagged, not asserted either way) |
| G-5 | ADR-012 exit test clause 9 (intake dry-proof, discovery through a verified item, zero human touch) has never run; clause 8 (dead code zero) is contradicted by the standing P3 erase backlog | Section 3.2; prior-audit P3 register | gap, tracked (not a purge item) |

### 5.2 Other ADR and doctrine divergences found

| # | Divergence | Evidence | Judgment |
|---|---|---|---|
| G-6 | Doctrine register `research-is-horizon-scan` (ruled 2026-07-12): "Its feedstock is AUTONOMOUS intake from research-role sources, machine-ingested, not editor-selected." No autonomous intake exists, is scheduled, or is currently possible without code + config + env changes. The entry's residual covers only the editorial-queue half; the feedstock half describes a capability that cannot run | Register entry; sections 2 and 4 | unresolved-operator (rides the same crawl ruling as G-3; the register entry should name the feedstock gap the way `analysis-follows-page-intent` names its enforcement-to-build gap) |
| G-7 | Doctrine register `manual-intake-run-is-the-one-pipeline`: "At the cadence flip the scheduled caller invokes the SAME runIntakeCycle." No scheduled caller invokes runIntakeCycle; check-sources (the only formerly-scheduled worker) has no intake handoff. The claim is future-tense so it is not false, but the one-pipeline has zero proven runs and no golden exercises it end-to-end (its own `caller-count-is-not-wiring-verification` / RD-35 bar) | Register; caller sweep | gap, tracked (the intake dry-proof, G-5, is the discharge) |
| G-8 | `rss-fetch.ts` header claims it is "used by the access_method routing switch in /api/agent/run"; no such switch exists in `generate-brief.ts` or `canonical-pipeline.ts` (re-verified this audit, confirming D). One helper import from `browserless.ts` is its only live consumer. Its own docstring defers true feed-item discovery to "a follow-up wave", never built | grep sweep at baseline | purge-candidate for the false header + dormant transport (section 6); the deferred feed-item discovery idea belongs to the crawl-rebuild spec, not this file |
| G-9 | `pause.ts` header + `/api/agent/run` comment still list the dissolved `drain-first-fetch` worker as a live fetch entry (dissolved 2026-07-12) | File reads | cosmetic, fix with next touch |
| G-10 | ADR-001 consequences state a `(tenant)` route-group convention; no such group exists (honestly marked future_scope in the ADR frontmatter, but the consequences line reads as adopted). All tenant pages sit directly under `src/app/` | ADR-001; `src/app/` listing | cosmetic |
| G-11 | ADR-013/ADR-014 checked clean: Phase-3 closed-not-run matches code (no restitution runner armed); ADR-014's claimed mechanical half exists (`wave-acceptance-audit.mjs` + golden + QA-1). ADRs 002-011 spot-checked against their scope files; no divergence found beyond G-10. ADR-006/ADR-009 are marked deprecated and claim nothing about code | file reads | clean |

### 5.3 The new divergence class: worklist-note vs live gate (Session A's SW-3 finding)

Recorded at Session A's stop-point commit `3f730232` (2026-07-18) and filed as an
`integrity_flags` row (data_quality, subject drain_worklist; DB row is a section 7 check):

- Sample: 7 `drain_worklist` items checked against live `validate_item_provenance`.
- Result: 6 notes within tolerance; 1 materially wrong: `bec305e1` (EPA HDV Phase 3) note said
  "4 relabel-manual", the live gate shows **28** failures, a 7x undercount.
- Class statement: **worklist notes are operational metadata, not state; live gates are state.**
  This is label-is-not-proof extended from content labels to operational metadata, and it is the
  same shape as ADR-vs-code divergence: a written description of state diverging from the live
  mechanism, with work then planned against the description.
- Existing doctrine already covers the fix pattern: `no-execution-from-stale-state` (RD-33) says a
  plan/manifest is a proposal, never authority. Extension owed: any queue/worklist consumer
  re-derives per-item hold state from the live gate at action time; the note is routing hint only.
- Judgment: keep-and-integrate as a named divergence class in this register's terms;
  the RD-33 extension (worklist-note-is-a-proposal) is a one-line doctrine amendment plus, if the
  operator wants it mechanical, a cheap audit that re-derives a sample of worklist notes per drain
  bank. Session A's stall question ("is what it is draining correctly classified") is answered by
  this audit as: the QUEUE is real, the NOTES are hints with a proven 1-in-7 material error rate on
  the sampled bank; drain against live gate output, not notes.

---

## 6. Inventory 5: purge-candidate list

**Bar applied (from the mandate):** the crawl rebuild integrates with the current intake
structures (dedup-before-ground, mint gates, congruence checks, snapshot-first verify, source-link
mint invariant, per-item leases). One intake path, no parallel front door. The frozen 2026-04
machinery is evidence of intent, not components. Anything that would require a second intake path
or bypass a gate is a purge candidate by definition. **List only; purge executes later, after
operator ruling, as tombstone-then-delete committed migrations. Nothing was purged by this audit.**

### 6.1 Purge candidates

| # | Item | Why the crawl rebuild will not use it | Class |
|---|---|---|---|
| P-1 | `/api/admin/sources/discover` route + `discoverForJurisdiction` (`src/lib/sources/discovery.ts`) | Zero callers since Wave-α A5. It is a one-shot Sonnet+web_search SOURCE finder that predates the two-tier design; the rebuild's awareness tier will spec discovery against the current intake structures, and per the mandate the frozen machinery is evidence, not components. Keeping a second, caller-less discovery entry alongside the rebuilt one is exactly the no-shadow-capability shape | purge-candidate |
| P-2 | `/api/staged-updates` GET | Visibility duplicate; AdminDashboard reads the table directly. The POST tombstone is a separate operator call (P-8) | purge-candidate |
| P-3 | `/api/community/notifications/preferences` | Product orphan, zero callers, unrelated to crawl; listed because inventory 2 surfaced it | purge-candidate (product ruling, not crawl ruling) |
| P-4 | `/api/workspace/regulations-defaults` | Product orphan, zero callers (UI ships localStorage-only); same class as P-3 | purge-candidate (product ruling) |
| P-5 | `rss-fetch.ts` false-header transport | Not wired into the canonical pipeline (G-8); the crawl rebuild's transport set is the canonical-fetch ladder; if an RSS transport is wanted it gets re-specced against `assertFetchAllowed` + snapshot-first, not this header-drifted file. One live helper import (`browserless.ts`) must be re-homed first | purge-candidate (after re-homing the helper) |
| P-6 | `trust.ts` dormant promotion/demotion engine (`computeConflictResolutionImpact` and the never-emitted trust-event types), `source_conflicts` 0-row surface, `openSourceConflict` (zero callers) | Prior-audit F-6/F19 carry-forward; the crawl rebuild grounds on the moat (base_tier), and the sealed corroboration design (2026-07 ruling) deliberately keeps reputation out of eligibility; the dormant promotion engine is not on any rebuild path | purge-candidate (carry-forward; already in the E-backlog) |
| P-7 | `/api/admin/q7-daily-recompute` route | Superseded by the end-of-cycle recompute inside `growSourcesFromBrief`; its manual full-recompute utility is real but duplicable by a one-line script at need; "daily" name is dead | unresolved-operator leaning purge (operator may value the manual utility) |
| P-8 | `/api/staged-updates` POST 410 tombstone | The retirement is doctrine (RD-20); the question is whether the tombstone stays as a permanent honest 410 or follows tombstone-then-delete | unresolved-operator |

### 6.2 Explicitly NOT purge candidates (named so the ruling is clean)

- The frozen workflow schedule stubs (`source-monitoring.yml`, `spot-check-monthly.yml`): the
  restoration surface for the rebuild, and the freeze comments are the operative dated record of
  the 2026-07-13 ruling.
- `check-sources` route + `content-change.mjs` + `portal-links.mjs` + `monitoring_queue` +
  `portal_link_candidates` + `/api/worker/reconcile`: the built awareness-tier substrate (P2-5/P2-6
  + consume half). These landed AFTER the current intake structures and already compose with the
  gates (worker-auth + pause + window; discovery-not-intake). They meet the keep bar.
- `run-intake-cycle` + `/api/admin/run-intake`: the one-pipeline intake entry (G-1 surfaces owed).
- `/api/admin/scan`: the sole live-wired discovery path; stages transit-only into the machine-gated
  cycle; keep.
- The entire section 2 gate stack: all live, all composing, all crawl-rebuild prerequisites.
- `scrape-schedule.ts` cadence model: ADR-012 names it the saved-cadence mechanism; the rebuild's
  scheduling tier starts here.

---

## 7. Operator-dashboard checks (carried forward, deliberately not inferred from code)

1. `system_state`: current `scrape_cadence`, `scrape_start_date`, `global_processing_paused` values.
2. `/api/admin/scan` live reachability: does an admin click return a run or the 503
   `global_processing_paused` response today.
3. Deployed Vercel env: `SCRAPE_HOLD`, `GROUNDING_ACQUIRE_ENABLED`, `SPEND_REGIME` (out-of-repo
   boundary class; repo defaults are lifted/OFF/build-phase but deployed values are not readable
   from the repo).
4. GitHub Actions UI state: `source-monitoring` was recorded "disabled_manually" in the 2026-07-15
   session log; workflow enable/disable state lives GitHub-side, on top of the commented schedules.
5. The SW-3 `integrity_flags` row (data_quality, subject drain_worklist) exists and is open.
6. `drain_worklist` queue state (66 rows at Session A's park, per commit `3f730232`).
7. D's forensics report merge state (branch `corpus-integrity/cc-grounding-executor-d`, commit
   `048669a9`; on master or not at the time of the purge ruling).

## 8. Three-state roll-up

- **keep-and-integrate:** the full gate stack (section 2, items 1-12, 15, 16, 18); check-sources +
  change-detection + portal-links + reconcile + monitoring_queue + portal_link_candidates;
  run-intake-cycle + its route (with the two owed invocation surfaces); `/api/admin/scan`; the 5
  active workflows; generate-brief workflow; the operator-fired runners; the SW-3 divergence class
  with its RD-33 extension.
- **purge-candidate:** P-1 through P-6 (P-3/P-4 under a product ruling, not the crawl ruling).
- **unresolved-operator:** the two frozen schedules (restore-vs-respec at rebuild time);
  ACTIVE_PHASE pointer; G-2 (ADR-012 flip-cost amendment); G-3/G-6 (the manual-by-design vs
  source-monitoring contradiction, resolved by the crawl ruling); G-4 (ADR-012 sign-off); P-7, P-8;
  every section 7 dashboard check.

**The single load-bearing conclusion:** the discovery layer was designed (founding commit), partly
built (accessibility-only at peak), materially completed in code (PR #252/#253) three days before
being frozen operationally (`11c008c2`), and then reframed as by-design-manual (ADR-012) while the
founding doctrine text still says the opposite in the current tree. Nothing found by this audit
requires a second intake path; everything the rebuild needs either exists behind a named switch or
is an owed surface on the one pipeline. The purge list is small because most of what looked dead is
dormant-wired, and most of what is dormant-wired meets the keep bar.
