# Master Gap Register — Full-System Audit (2026-07-11)

Baseline: master `71bcbd46a30e6b4e5f953a4949c3b8e276dacf8b` · DB `kwrsbpiseruzbfwjpvsp` live · READ-ONLY held
(zero DB writes, zero DDL, zero fetches, zero mints, zero program-ledger spend, loop OFF, hold LIVE).

**Coverage: PROVEN.** 13 agents (11 Wave-1 + X cross-wiring + INTENT), all accepted with nonzero tool
counts and reconciled manifest slices. Code: 1,348/1,348 code files accounted — 1,324 read line-by-line
(CODE-1 159 · CODE-2 95 · CODE-3 97 · CODE-4a 183 · CODE-4b 51 · CODE-5a 541 · CODE-5b 217, per-agent
check-offs in each register) + 24 declared-excluded (docs/design-mockup/meta, manifest deviation 1).
DB: **85/85 tables** (manifest header said 86 — orchestrator transcription error, corrected here;
`pg_tables` census = 85, every one scanned; verified by mechanical name-diff against all four DB
registers), 5/5 views, 63 app-owned functions, 34 triggers, 183 policies, all migrations 001–163 read.
Agent tool-call totals: DB-1 51 · DB-2 53 · DB-3 72 · DB-4 46 · CODE-1 62 · CODE-2 111 · CODE-3 ~112 ·
CODE-4a ~241 · CODE-4b 89 · CODE-5a 76 · CODE-5b 37 · X 43 · INTENT 40. Deviation logs in each register.

Severity: **P1 breaks-customer/security · P2 breaks-doctrine · P3 dead-weight · P4 cosmetic.**
Evidence lives in the cited register; every finding carries a candidate next-action there.

---

## P1 — breaks-customer / structural security (12)

**RE-VERIFIED 2026-08-11.** This register was baselined against master `71bcbd4` (2026-07-11) and never
updated as fixes landed through #443–#448 — 10 of 12 items below were already fixed and this file still
read them as open. Re-verified against live code (HEAD `3533e12`+) and live DB (`kwrsbpiseruzbfwjpvsp`)
by direct re-check (function defs, RLS policies, column privileges, live queries), not by trusting any
prior note. Two items (#4, #10) required a fix in this same pass; both are closed as of this commit.
Standing lesson this re-verification produced: a finding list in this repo is evidence about the past,
not the present — re-verify before acting on any of them, including this one, next time.

| # | Finding | Evidence (2026-07-11) | Status (2026-08-11) | Verification evidence |
|---|---|---|---|---|
| 1 | **`get_market_intel_items` has NO org-membership gate** (mig 108 dropped 077's `_assert_org_membership`; live-confirmed via pg_get_functiondef). Any authenticated user + foreign org_id reads that org's override overlay. Mitigated only by single-tenancy today. | X headline 1; CODE-5b F1 | **FIXED** | Live `pg_get_functiondef(public.get_market_intel_items)`: first statement is `PERFORM public._assert_org_membership(p_org_id);`; `id ASC` tiebreak also present. |
| 2 | **/admin provisional-review queue silently EMPTY since mig 157** — 157 dropped the SELECT policy; `fetchProvisionalSources()` reads with the anon client and drops `error` → 489+2 pending rows render as an empty queue on the only review surface. | X headline 3; supabase-server.ts:344; DB-2 §2 | **FIXED** | `fsi-app/src/lib/supabase-server.ts:353` — `fetchProvisionalSources()` now uses `getServiceSupabase()` (service-role) and logs `error` instead of swallowing it. |
| 3 | **Profile self-edit + onboarding identity step silently persist NOTHING** — `profiles` has only a SELECT policy; browser-client UPDATEs match 0 rows with no error; UI reports saved. | DB-4 F1; X.4 row 2; UserProfilePage.tsx:142, OnboardingWizard.tsx:196 | **FIXED** | Migration 165, applied+ledgered. Live `pg_policies` on `public.profiles`: `profiles_self_insert` (INSERT, WITH CHECK `auth.uid()=id`) and `profiles_self_update` (UPDATE, USING/WITH CHECK `auth.uid()=id`) both present. |
| 4 | **`profiles` anon-readable including emails**, linkedin_sub, is_platform_admin. | DB-4 F2; X.4 anon register | **FIXED** | Migration 165, applied+ledgered. Mechanism is column-level grant restriction, not row-policy tightening — the row policy `"Public read"` (`qual=true`) is deliberately left intact so community author-joins (display_name, avatar_url, etc.) keep working. Live `information_schema.column_privileges`: `anon` has zero `SELECT` on `email`/`linkedin_sub`/`is_platform_admin` (34 non-PII columns granted, those 3 withheld — `anon_select_grant_count=34`). **Operator ruling 2026-08-11: close as-is; do not additionally tighten the row policy to self+same-org** — ~10 live readers (community joins, `invite-candidates` search, `CouncilMembersRail`, admin `MembersPanel`, `CommunityPickupsQueueView`) rely on reading OTHER users' rows under the current permissive row policy for legitimate display purposes; a self+org-only row policy would zero out those reads today (the gap-#2 failure class repeating) unless they were first re-architected onto a service-role/RPC path — a materially larger change than this finding requires. **Residual noted, not yet fixed:** `authenticated` still holds column-level `SELECT` on all three sensitive columns for *all* rows, not just the caller's own (the row policy is table-wide, not self-scoped) — no live route was found that lets an authenticated user select an arbitrary other user's `email`/`is_platform_admin` this way, but the privilege exists. Flagged as a candidate follow-up. |
| 5 | **Staged-update approve-with-notes: materializes the item then 500s on phantom `staged_updates.reviewer_notes`** (column in no migration) leaving status='pending' → re-approve mints a duplicate. One approved-but-unmaterialized row already exists (DB-3 F15). | X.1(b) row 2; X runner-up | **FIXED / SUPERSEDED** | Migration 167 adds `reviewer_notes`; ledgered. Live query: 0 rows with `status='approved' AND materialized_at IS NULL`. The buggy approve-with-notes UI path itself was retired (`src/app/admin/page.tsx:218-220` — human approve/reject replaced by machine-gated visibility-only). |
| 6 | **Verified-gate bypass in customer "related" rails** — research/[slug] + operations/[slug] (+ regulations resourceLookup) run service-role selects without `provenance_status='verified'`; 106 live quarantined items can surface. | CODE-4b F1 | **FIXED** | `research/[slug]/page.tsx:171,190`, `operations/[slug]/page.tsx:224,244`, `regulations/[slug]/page.tsx:150,159` all carry `.eq("provenance_status","verified")` on the related-item queries. Independently re-verified by direct code read, not taken on a prior note. |
| 7 | **Dashboard timeout serves SEED data as live content** — fetchDashboardData's fallback passes seedResources (the one fetcher not migrated to empty+`_error`). | CODE-3 F-01; supabase-server.ts:1425 | **FIXED** | `supabase-server.ts:1567-1586,1711-1712` — timeout and exception paths now return empty+`_error`; `seedResources` no longer appears in any active return. |
| 8 | **/api/agent/run: requireAuth only — no admin gate, no rate limit** on the only spend-triggering route. | CODE-3 F-03 | **FIXED** | `api/agent/run/route.ts:27-54` — `requireAuth` → `checkRateLimit` → `isPlatformAdmin` (403 if not admin), all present; comment cites this exact finding. |
| 9 | **5 verified-live items with NULL `full_brief`** (TCEQ, MEPC.377(80), C376, EPA Fast Facts, NC Register) — customer opens an empty detail page. | DB-1 ITM-1; X.5 "wired but missed" | **FIXED** | Live query: 826 verified items, 0 with `full_brief IS NULL`. |
| 10 | **Scrape-hold transport holes** — only the Browserless transport is gated; direct-HTTP / API / RSS / api-fetch fetch freely under SCRAPE_HOLD. Under a deliberate build-first hold, the hold must be airtight. | CODE-1 F-02; X.5 missed #1 | **FIXED (this commit)** | Production pipeline (Browserless, direct-HTTP, API-ladder) already gated. **New residual found and fixed today:** `api/admin/sources/[id]/fetch-now/route.ts`'s inline `fetchViaApi` made a raw `fetch()` with no gate — the admin manual-fetch button bypassed an engaged hold. Added `assertFetchAllowed` call (caller `"admin-fetch-now"`, not in `AUTHORIZED_HOLD_CALLERS` — extending that frozen set is its own governed change, out of scope here); widened F16's `TRANSPORT_MODULES` to include this route so the class can't reappear unnoticed. F16: 10/10 green, live coverage now 374 files. |
| 11 | **Community links to `/account` → 404** (route doesn't exist; live are /profile, /settings). | CODE-4a F-01 | **FIXED** | Repo-wide grep for `/account` as a link/route returns zero matches in `src/`; no `/account` route exists. |
| 12 | **Open-redirect vectors** — unvalidated `next`/`redirect` params in auth callback + login. | CODE-4b | **FIXED** | `src/lib/auth/safe-return-path.mjs` (`sanitizeReturnPath`) wired into both `auth/callback/route.ts:27` and `login/page.tsx:19`; rejects protocol-relative and backslash-escape values. |

**Net: 12/12 closed** (10 already fixed and unrecorded; #4 closed on re-verification of an already-applied
fix; #10 fixed in this pass). Zero open P1 items as of 2026-08-11. The P2/P3/P4 sections below and the
other linked registers were **not** re-verified in this pass — treat them as still evidence about
2026-07-11 until someone does the same exercise on them.

## P2 — breaks-doctrine (headline set; full lists in registers)

**Provenance/moat:** 890 FACT claims (12.6%) with NULL source_id/tier stamp (validator re-resolves — floor
holds — but the schema-promised stamp is missing) [DB-1] · all 75 regional_data_facts NULL source_id under
a masthead claiming "every fact carries a source" [DB-1/INTENT] · 167 provisional + 4 suspended sources
carry grounded claims — doctrine ruling owed [DB-2] · eTLD+1 institution collisions (amazonaws.com→SFC T4,
windows.net→IEA T3) = wrong-tier stamp channel [DB-2] · 6 cross-format same-instrument twin pairs incl.
**PPWR both-VERIFIED** [DB-2] · aux tables (timelines/xrefs/disputes/supersessions/changelog) anon-readable
without parent gate — 689 timeline rows name quarantined items RLS hides [DB-1; X.4].

**Pipeline contract (the build-first core):** synthesis prompt never reads `item_type_required_slots` (7
non-reg types get zero slot enforcement — `missing_required_slot` deterministic) + prompt authorizes a 4th
ANALYSIS label the validator/kept-filter/4c reject — both located at canonical-pipeline.ts:569-688/:432-441
[CODE-1 F-01] · theme vocab disjoint parser-vs-DB (themes never persist) [CODE-1] · mint chokepoint
fail-open on probe read-error [CODE-1 F-09] · W2.F auto-approve writes legacy `tier` not `base_tier` +
hardcoded domains [CODE-1 F-06] · eraseStep leaves harvested timelines + clobbers recommended_actions on
ALL open flags [CODE-1 F-07/08] · fetch cache built-never-wired [CODE-1 F-03] · discovery.ts +
recommend-source-tier bypass the ledger entirely [CODE-1 F-05].

**Records/state truth:** **15 applied-but-unledgered migrations (107–134 band)** [DB-3 F1; X.3 verified
object-by-object] · mig **099 on disk never applied** → dismiss affordance 500s + zero-policy table [DB-3
F2; X.1(b)] · 4 `_pre_phase5` live tables in NO migration (the only out-of-band tables) [CODE-5b F4; X.3] ·
7 out-of-band policies on the mig-009 capture tables [X.3(f)] · fresh-DB replay breaks ≥3 ways (007 42P13,
091 vs 090 order, 163 vs 118 42710) + seed layer targets tables dropped in 013 [CODE-5b F2/F9] ·
**mig-158 is APPLIED+LEDGERED — the "AUTHOR-ONLY/HELD" state in CODE-5b F10, the migrations inventory, and
project memory is STALE** [X headline 2]. ORCHESTRATOR ADJUDICATION on X's "72-item flip armed": that blast
radius **already fired and was dispositioned** by the 2026-07-11 reconciliation remediation (the 65-item
program; lane substrate-agreement PASS on the same day proves no armed flip remains). The stale-records
half stands. · 47 expired-open deferral flags on non-quarantined subjects + 62 flags on deleted items
(alarm-fatigue class; lane's item-join can't see them) [DB-3 F3/F10; X.5 missed #2].

**Guards/CI:** consistency layer (C3/C4/C5) has NO CI backstop; rule-014 CI leg structurally vacuous
[CODE-2] · rule-016 vs F15 allowlist drift = next innocent commit on 3 files fails [CODE-2] · skill-map
lags the new chokepoints (mint-item, spend-client, fetch-hold ungoverned in the edit gate) [CODE-2] ·
~65 error-swallow instances, 4 with WRITE consequences (auto-resolve-on-read-error the worst) [CODE-3
F-04/§9] · no-names/routing verifiers can vacuously pass [CODE-5a F-13] · 3 lib acceptance tests +
~40 executed one-shots write prod on bare invocation (interlock covers 7) [CODE-5a F-4/F-11] ·
`readClient()` returns the full service-role client — rule-015 bypassable by property access [CODE-5a F-1].

**Community pre-adoption set:** counter triggers run as INVOKER (RLS-path writes silently skip counts);
`weekly_post_count` displayed but never written; ban has no re-join block; forum layer seeded-never-used
(17 sections, zero code paths); 4/6 case_studies carry hand-set `peer_validated` with 0 endorsements;
stale "wiring up in C4" customer-visible copy [DB-4 F7/F9/F10/F16; CODE-4a F-04; CODE-3].

**Operator-owned (flagged, not agent-fixable):** both triage queues at zero throughput ~54 days
(ingest_rejections 131/131, pending_jurisdiction_review 109/109) [DB-3 F8] · Research repositioning
decision never made [INTENT] **[RULED-CLOSED 2026-07-12: Research = horizon-scan, editorial queue
REJECTED — doctrine register `research-is-horizon-scan`]** · published_price_statistics 8 days past its
own next_release promise [DB-1].

## P3 — dead-weight (the erase backlog)

38 unmounted components ≈10,047 lines (RegulationsSurface 1963, OperationsPage 1012, legacy resource/
chain, 5 market/ orphans, 7 ui primitives + both barrels) [CODE-4a] · domains/* trio (1,514 lines of
hardcoded "live-looking" data — delete before anything imports it) [CODE-4a F-03] · ~7 dead src modules
(source-pool.ts truly dead; **browserless.ts is NOT retired — 7 importers; fix CLAUDE.md**, section-validator,
extract-research-sections, congruentType, openSourceConflict, checkFetchQuality, dup VERIFICATION prompt)
[CODE-1 F-04/F-10] · vendor family: 4 tables + 2 trigger fns + type residue, 0 rows/writers/readers
(removed-from-scope 2026-05-24) [DB-4] · user_profiles mirror pair — drop blocked only by 3 RLS arms
reading `user_profiles.is_platform_admin` [DB-4] · notification v1 trio unreachable end-to-end;
bulk_imports write-only; ingestion_state+control_log frozen contradictory pair (1,483 rows, zero
consumers) [DB-4/DB-3 F5] · 2 orphan RPCs (get_workspace_members, related_items_derived) + **all 5 views
zero consumers** (incl. active_intelligence_items — gates nothing) [X.2] · ~30 dead columns consolidated
(items ×13 incl. theme/trajectory_points; sections.source_ids all-3,379-NULL; versions.created_by_run_id;
agent_run_searches.agent_run_id no-FK; agent_runs.intelligence_item_version_id 0/1,653) [X.1(a)] ·
5 dead endpoints; dead store slices [CODE-3] · q7-daily-recompute superseded-but-armed writing legacy
`tier`; no scheduler exists anywhere for it (vercel.json has no crons) [CODE-5a F-10; CODE-5b] ·
adr-loader.mjs 216 dead-but-tested lines; 4 stale READMEs [CODE-2] · types/community.ts, seed-remap.json
975 lines, seed-scoring/clusters chain, source-mapping.ts (still in CLAUDE.md Key Files), TabBar +
7-domain TabId [CODE-4b] · intelligence_summaries 2,265 shelved rows (doctrine says keep; count stale in
docs: "2,325") [DB-1] · settings.local.json grants for deleted scripts [CODE-5b] · gitignore split-brain:
_snapshots 1,144 tracked vs 1,211 ignored **including db.mjs's non-regenerable reversal records — operator
ruling owed** [CODE-5a F-14/15].

## P4 — cosmetic

"Vol IV" masthead literal · duplicate `--destructive-quiet` dark var · SourceHealthDashboard inline tier
legend outside the drift guard · no not-found.tsx · `/privacy` auth-walled while metadata says index:true
(borderline P2 for trust) [CODE-4a/4b].

## Intent-vs-delivery verdicts (INTENT register; hold-is-deliberate lens applied)

All 9 surfaces **PARTIALLY DELIVER** — none fully delivers, none outright misses. Freshness/intake gaps
are EXPECTED under the deliberate build-first hold and are excluded from the correction plan; they ride
the flip. What counts as misses NOW: Regulations hides its flagship corpus (99 quarantined reg-family
items incl. CBAM/EUDR/FuelEU/CORSIA — 45 recoverable zero-fetch post-pipeline-fix), Operations' two
"critical" regions have zero facts + all facts source-less, Community is feature-complete but
adoption-blocked by the P1 profile bug + pre-adoption set, Dashboard's honesty breach (seed-on-timeout),
Assistant grounding never verified, Research's parked repositioning decision. Product-level: the
intelligence half is closer to best-in-class (the provenance moat is real and defensible); its gap is
executable content work. Community's gap is peers, not code — but the pre-adoption set must land before
the second org.

## The 62-item pool-coverage table (routes the resynth batch)

**45 COVERED / 8 PARTIAL / 9 NOT-COVERED** — full table in [pool-coverage-62.md](pool-coverage-62.md).
The 9 NOT-COVERED (incl. the GRI cookie-policy portal artifact — archive candidate) stay deferred to
batch-1 re-fetch at hold-lift. The 45 run zero-fetch AFTER the Track-C pipeline contract fix.

## Invariant coverage map (X.5)

6 wired-but-missed (detector narrower than claim — fixes named per row) · 10-item ranked next-invariants
backlog, led by: **#1 RLS-credential parity** (this audit's biggest silent-failure class, 2 P1 proof
cases) · **#2 column-existence parity** (generated DB types; 2 live defects caught) · #3 workspace-RPC org
gate · #4 customer verified-gate predicate · #5 migration ledger parity. Bookkeeping: ledger-onepass,
unregistered-span-host, vocab-sync + surface-visibility audits need invariants.mjs entries.

## Correction routing

The full sequenced plan is [correction-plan.md](correction-plan.md) — Tracks A–E on the build-first
lens: A seal-the-customer-surface (pure code, now) · B tenancy/credential integrity (one operator DDL
window batch) · C pipeline contract before the tap opens (then the 45-item zero-fetch recovery, quoted)
· D community pre-adoption bundle · E dead-weight erase + records truth. Governance riders: X.5 top-5
invariants + consistency-layer CI backstop.
