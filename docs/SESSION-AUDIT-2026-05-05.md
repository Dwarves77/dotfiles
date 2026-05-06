# Session Audit — 2026-05-05

Generated: 2026-05-06 03:15Z (post PR #25 + #26 merge, PR #24 still open).
Scope: comprehensive read-only ground truth on Caro's Ledge platform state.
Method: git history, gh PR API, repo state, in-session result docs (W3/W4/W5, GAP-1, GAP-2, REGIONAL-DATA-COLLECTION-AUDIT, BRIEF-STRUCTURE-AUDIT, PERF-PROFILING-FINDINGS, INTEGRITY-TRIAGE-REPORT, E2E-VERIFICATION).

Session window defined as **2026-05-01 → present** (PR #5 merge → now). 21 PRs merged, 1 open.

---

## 0. Headline state

| Metric | Start of session (≈ PR #5 merge) | Now |
|---|---:|---:|
| PRs merged in session | 0 | 21 (#6–#23, #25, #26) |
| PRs open | 0 | 1 (#24, polish/intelligence-depth) |
| Migrations applied | 025 | **047** (22 new) |
| Active sources | ~73 (legacy seed) | **501** (563 total; 62 suspended/non-active) |
| Active intelligence items | ~155 | **184** (194 total) |
| Tier-1 jurisdictions covered (≥1 active source) | ~9 | **63 distinct** in active set |
| Source verifications run (W2.F audit log) | 0 | **1,414 in last 30 days** (1,000 sampled, 64 H / 280 M / 656 L; W5 says 105/385/924 cumulative) |
| Provisional sources in admin review queue | 12 (all 2026-04-05, unscored) | **393** (12 + 381 backfilled, scored) |
| Auto-approved H-tier sources spot-checked | 0 | **0** (pilot was read-only) |
| Integrity flags unresolved | 0 | **1** (post-trigger-retune; was 57 before mig 044) |
| AI thresholds (relevance / freight) | 70 / 50 | **75 / 55** |
| Anthropic LLM spend this session (confirmed) | $0 | ~$0.66 (3 EU briefs) + ~$0.02 (spot-check pilot) |

---

## 1. SHIPPED THIS SESSION

### Merged PRs (21)

Listed reverse-chronological. Per PR: scope summary, headline files. (Counts in the table omit doc-only churn.)

| # | Date (merge) | Title | Scope | Branch |
|---|---|---|---|---|
| #26 | 2026-05-06 02:51 | Verification pipeline integrity backfill | 381 buried provisionals → provisional_sources, threshold 70/50 → 75/55, 3 named demotions (DPNR/MDE/VDOT) | verification/integrity-fixes-and-backfill |
| #25 | 2026-05-06 02:40 | perf: full_brief slim RPC + sidebar prefetch=false | Migration 047 sibling RPC `get_workspace_intelligence_slim`; sidebar 8 nav links → `prefetch={false}`; ~3.33 MB/render saved on 4 surfaces | perf/full-brief-slim-and-prefetch |
| #23 | 2026-05-06 01:32 | Polish wave audit fixes + EU regulation inserts | A1–A9 audit-driven fixes (jurisdiction display, editorial priority labels, isolate filter chips, count tooltip, hide-empty stat cards, UUID→slug redirect, member name embed, past-event styling); migration 045 (orphan slugs + ACF dedup + r10 archive); 3 EU regulation inserts (Battery 1542, HDV CO2 1242, NZIA 2024/1735) | polish/audit-fixes |
| #22 | 2026-05-06 01:31 | Community parallelization + integrity trigger retune + ops scripts | 6 sequential awaits → 1 parallel batch on /community; 8 → 2 batches on /community/[slug] + /community/browse; migration 044 retunes integrity-flag trigger sensitivity (57 unresolved → 1) | post-merge-fixes |
| #21 | 2026-05-06 00:40 | Block C C5–C9 community feed/promote/notifications/moderation/realtime | Posts feed + post→staged-update promote + notifications schema + preferences UI + moderation reports + realtime hooks (browser-only); 4 quick-win perf fixes (id-map dedup, detail page slim fetch, region-count RPC migration 042, AdminDashboard server hydration) | phase-c/community-extensions |
| #20 | 2026-05-06 00:38 | Phase C foundation: jurisdiction_iso + materialization fix + admin tooling | Migration 033 jurisdiction_iso column + 100% backfill across 194 items; mig 034 staged_updates materialization error capture; mig 035 agent_integrity_flags + trigger; mig 036 admin notifications RPC; mig 037 source_verification (W2.F pipeline); mig 038 bulk import audit; mig 039 coverage_matrix RPC; mig 040 discovery provenance; admin UIs for all of the above | phase-c/foundation-and-admin-tooling |
| #19 | 2026-05-04 00:26 | hotfix: research empty + Market/Operations stat-tile interactivity | Defensive research fetch; clickable stat tiles on Operations & Market | phase-c/hotfix-surfaces |
| #18 | 2026-05-05 16:45 | community: shell + C4 functional | CommunityShell + sidebar swap + region tabs + masthead search; group detail page; community/browse; invitation API | phase-c/community-shell |
| #17 | 2026-05-04 00:05 | hotfix: jurisdictionLabels Map typing | Widen jurisdictionLabels Map type to accept generic string ids | phase-c/hotfix-jurisdictions-typing |
| #16 | 2026-05-04 00:06 | cleanup: orphan Dashboard.tsx + 3 page delegators | Delete dead code post Phase C Block B | phase-c/dashboard-cleanup |
| #15 | 2026-05-02 00:21 | auth: multi-user signup + onboarding + notification preferences UI | New /signup; onboarding wizard; preferences UI surface | phase-c/multi-user-signup |
| #14 | 2026-05-02 00:21 | surfaces: Research + Map + Admin rebuild | Phase C Block B greenfield rewrites | phase-c/research-map-admin |
| #13 | 2026-05-02 00:21 | surfaces: Dashboard + Regulations + Regulation Detail rebuild | Phase C Block B greenfield rewrites | phase-c/dashboard-regs |
| #12 | 2026-05-02 00:20 | surfaces: Operations + Market Intel rebuild | Phase C Block B greenfield rewrites | phase-c/ops-market |
| #11 | 2026-05-01 15:22 | UI primitives | RowCard + EditorialMasthead + barrel + Badge→PriorityBadge + AiPromptBar rework | phase-c/components |
| #10 | 2026-05-01 15:22 | db: community schema | Migrations 027 user_profiles, 028 groups, 029 group_members, 030 posts, 031 topics, 032 notifications/moderation | phase-c/community-schema |
| #9 | 2026-05-01 15:17 | vendors stub | /vendors page with 10 curated vendors | phase-c/vendors-stub |
| #8 | 2026-05-01 15:17 | events stub | /events page with editorial calendar | phase-c/events-stub |
| #7 | 2026-05-01 15:14 | db: migration 026 | intelligence_items.pipeline_stage column | phase-c/migration-026 |
| #6 | 2026-05-01 15:11 | housekeeping | Card primitive + AmbientOrbs cleanup + LinkedIn button hide | phase-c/housekeeping |

### Migrations applied (22 new in session: 026 → 047)

| # | Name | Effect |
|---|---|---|
| 026 | research_pipeline_stage | `intelligence_items.pipeline_stage` text + btree index |
| 027 | user_profiles | New table for non-auth profile data (name, headshot) |
| 028 | community_groups | New table + region partial index |
| 029 | community_group_members | New table — RLS LATER FIXED in 046 (recursion bug) |
| 030 | community_posts | New table for posts/replies + promotion FK to staged_updates |
| 031 | community_topics | New table + community_topic_groups |
| 032 | community_notifications_moderation | Notifications + moderation reports + preferences |
| 033 | jurisdiction_iso | `intelligence_items.jurisdiction_iso TEXT[]` + GIN; backfilled 100% |
| 034 | staged_updates_materialization_error | Capture column for failed promotions |
| 035 | agent_integrity_flags | `agent_integrity_flag BOOLEAN` + trigger detecting "integrity rule" phrasing |
| 036 | admin_notifications_rpc | RPC powering admin attention badge / queue |
| 037 | source_verification | `source_verifications` audit table + `verification_tier` enum (H/M/L) |
| 038 | bulk_import_audit | Bulk-import operation history |
| 039 | coverage_matrix_rpc | RPC `coverage_matrix()` returning (jurisdiction × item_type) pivot |
| 040 | discovery_provenance | `provisional_sources.discovered_for_jurisdiction` (UNPOPULATED — see partial) |
| 041 | post_promotions | Community post → staged_update promotion ledger |
| 042 | community_region_counts_rpc | Replaces 8 region-count queries with single RPC |
| 043 | security_advisor_fixes | Function search_path hardening + several SECURITY DEFINER tightenings |
| 044 | integrity_flag_trigger_tune | Retune integrity-flag trigger to suppress "integrity rule" phrase false-positives. **Effect: 57 → 1 unresolved** |
| 045 | orphan_slugs_and_acf_dedup | Slug-backfill orphan items, delete dup ACF UUID, archive r10 with reason |
| 046 | community_rls_recursion_fix | SECURITY DEFINER helpers (user_is_group_member / _admin / owner) replacing self-referencing RLS in 029 |
| 047 | workspace_intelligence_slim_rpc | Sibling RPC drops `full_brief` + 3 other wide TEXT cols on list-view path |

### Database state — start vs now

| Table | Start of session | Now | Δ |
|---|---:|---:|---|
| `sources` (total) | ~73 | **563** | +490 (W3 ingestion) |
| `sources` active | ~73 | **501** | +428 |
| `intelligence_items` total | ~155 | **194** | +39 (3 EU inserts + 36 from agent runs / scans) |
| `intelligence_items` active | ~155 | **184** | +29 |
| `intelligence_items.jurisdiction_iso` populated | 0% | **100%** (W4.1) |
| `source_verifications` rows | 0 (table didn't exist) | **1,414 in last 30d / 1,000 cumulative sample** |
| `source_verifications` Tier H | 0 | 105 |
| `source_verifications` Tier M | 0 | 385 |
| `source_verifications` Tier L | 0 | 924 |
| `provisional_sources` | 12 (stale 2026-04-05) | **393** (12 + 381 backfilled) |
| `agent_integrity_flag = TRUE` unresolved | 0 (column didn't exist) | **1** (was 57 pre-mig 044) |
| Spot-checked sources (`spotchecked = true`) | 0 | **0** |
| Active community groups | 0 | 1 (test seed) |
| Community posts | 0 | 2 (test seed) |
| `staged_updates` pending | 0 | **0** |

### Feature delta — start vs now (user-visible)

**At session start** the platform had: Phase C kickoff complete, 119-item legacy regulation explorer, Phase B agent runtime, 73-source registry seed, single-user auth, no community, no admin tooling beyond manual SQL, no jurisdiction_iso column, no source verification pipeline.

**Now** the platform has:
- 7 Phase C surfaces rebuilt under editorial design (Dashboard, Regulations index + detail, Operations, Market Intel, Research, Map, Admin)
- Multi-user signup + onboarding wizard + notification preferences UI
- Community shell with groups, posts, replies, notifications, moderation reports, post→staged-update promotion path, realtime hooks (mounted not exercised)
- Vendors + events stubs (linked but data backed by static curation)
- Admin tooling: integrity flags queue, source verification pipeline UI, provisional review surface (393 in queue), bulk import audit, coverage matrix RPC, organizations/members management with name display
- Sub-national jurisdiction taxonomy live (118 Tier 1 + 44 Tier 2 ISO codes; jurisdiction_iso column populated 100%)
- Verification thresholds calibrated 75/55, monthly recurring spot-check workflow wired (cron 1st of month)
- Perf: slim workspace RPC, sidebar prefetch disabled on 8 data-heavy targets, community pages parallelised
- Editorial polish: ISO jurisdiction labels, editorial priority vocabulary, isolate-filter-chip semantics, hide-empty-stat tiles
- 3 EU regulations newly inserted (Battery, HDV CO2, Net-Zero Industry Act) with full briefs

---

## 2. IN FLIGHT (not yet shipped)

### Open PRs

| # | Title | Branch | State | Blocked on |
|---|---|---|---|---|
| **#24** | Item 2 — intelligence-depth layering on regulation detail Summary tab | `polish/intelligence-depth` | OPEN, master merged in | (a) PR #25 production deploy verification (smoke /regulations, /operations, /market with slim payload); (b) optional bundle additions |

PR #24 work shipped on the branch (parser at `lib/agent/extract-sections.ts`, Tier-2 expander on Summary tab, severity callout, Tier-2→Tier-3 deep-link). 7/7 brief parser tests pass.

### Dispatched agents currently running

**None.** Bundle agent + Gap 1 dry-run agent were both **approved by user but not dispatched** before the audit pause.

### Items pending user decisions

None outstanding — last decisions ("Bundle + Gap 1 dry-run: approve dispatch in parallel"; "PR #24 merge after PR #25 deploy verification") have been received but action paused for this audit.

### Items approved but not yet dispatched

1. **Bundle agent** extending PR #24 with: Timeline parser + backfill, tab rename ("Full text" → "Intelligence Brief") + reorder (Summary → Intelligence Brief → Timeline → Sources → Exposure → Penalty Calc), hide Team Notes, Coming-soon tile for Exposure + Penalty Calc, restore Verification status badge, restore Archive flow with reason picker (platform-admin only).
2. **Gap 1 dry-run agent** running `fsi-app/supabase/seed/spot-check-all-h-tier.mjs` against 64 H-tier auto-approved sources at the new 75/55 thresholds in classify-only mode. Surface category-level results before mass-execution.
3. **PR #25 production deploy verification** — walk through /regulations, /operations, /market on `https://carosledge.com` after Vercel deploy completes; confirm slim payload renders correctly.
4. **PR #24 merge** after step 3 verifies and (optionally) bundle agent lands.

---

## 3. PARTIAL OR BROKEN

### Features that ship code but lack data

| Feature | Code state | Data state |
|---|---|---|
| Operations "By Jurisdiction" tab | Built, renders `regional_data` items | **11 of 118 Tier 1** jurisdictions covered. Effectively shows 11 cells. Dubai/UAE profile mis-tagged `[GLOBAL]` instead of `[AE]` — bug |
| Tier 2 jurisdictions | Schema + 44 codes defined | **43 of 44 zero coverage** (only CN has 1 source) |
| Tier 1 sub-national | 118 codes defined; ISO taxonomy + JOIN paths live | **105 of 118 under-covered** (89%); EU 27 member states, 13 CA provinces, 3 UK devolved nations all at 0 |
| Non-English ingestion | None; `scan_enabled` / `language` columns NEVER ADDED to `sources` | All non-English Tier 2 (CN provinces, BR/MX states, IN states, ASEAN, LATAM) is schema-blocked |
| Email notification delivery | Schema + preferences UI built (mig 032 + PR #21) | **No SMTP / send pipeline.** Notifications only render in-app |
| LinkedIn OAuth | Button hidden via housekeeping (PR #6) | API approval pending |
| Vendors | /vendors page renders 10 curated vendors | No verification backend; static |
| Events | /events page with calendar | No backend; static |
| Multi-tenant workspace switcher | Schema in place (overrides + memberships) | No user-facing switcher; admin sees one workspace |
| AI query bar | AskAssistant component exists; Stream-C fix mounts in AppShell | **E2E A10 FAIL** — "Ask AI" control text absent in DOM; component may render hidden by default |
| Real time hooks | `useCommunityPostsRealtime` + `useCommunityNotificationsRealtime` exist | Not exercised yet (browser-only; E2E B14 SKIP) |
| Embedding-based source quality (pgvector) | Foundation laid earlier | Not investigated this audit |

### Phase C regression backlog (caught only by user observation)

Surface migration regressions on `RegulationDetailSurface` from greenfield Phase C Block B rewrite (PR #13). Missing in current production:

| Feature | Status |
|---|---|
| Timeline parser + visual bar | NOT YET RESTORED — in approved bundle, not dispatched |
| Tab labels: "Full text" → "Intelligence Brief"; reorder | NOT YET RESTORED — in approved bundle |
| Verification status badge (verified / partial / unverified / disputed) | NOT YET RESTORED — in approved bundle |
| Archive flow with reason picker (platform admin only) | NOT YET RESTORED — in approved bundle |
| Team Notes section visibility | "Hide" decision in approved bundle |
| Exposure + Penalty Calculator | "Coming-soon tile" decision in approved bundle |
| **Share menu** (3 detail levels × 2 formats) | DEFERRED per user decision |
| **Priority override beyond what's in current bundle** | DEFERRED per user decision |
| Gradient bars on impact assessment | RESTORED earlier (PR #23) |
| Editorial priority labels | RESTORED earlier (PR #23) |
| ISO jurisdiction display | RESTORED earlier (PR #23) |
| UUID → slug redirect on detail page | **E2E A4 FAIL** — implementation lands but redirect returns 200 not 307 |

### Integrity flags currently in queue

Per `docs/INTEGRITY-TRIAGE-REPORT.md` (2026-05-06T00:47Z, 57 flagged), then mig 044 retune (PR #22), E2E C1 verifies **1 unresolved** post-retune.

The 57-flag triage breakdown (frozen pre-retune, useful for cataloguing):
- 15 missing-regulation flags pointing at 8 distinct EU regulation IDs that don't exist in `intelligence_items`. PR #23 inserted **3 of 8** (Battery 1542, HDV 1242, NZIA 2024/1735). Still missing: 2023/2405 (ReFuelEU SAF), 2024/1610 (Clean Trucking), 2023/1804 (AFIR alt-fuels infra), 2023/959 (EU ETS Directive amendment), 2023/956 (CBAM), generic "EU ETS". The trigger retune may have suppressed these as not surfacing the absence — re-validate.
- 3 factual-gap flags (regenerate): r16 Carbon Trust, f6774c49 Hydrogen/Ammonia Marine Fuel, afc851b1 Marine Fuel Decarbonisation Pathways — ~$0.45 worst-case to regen
- 37 "other" flags (rationale: phrase "integrity rule" in legitimate prose). Most resolved by mig 044
- 1 source-url-broken (r10) — fixed by mig 045 archive
- 1 over-flag (r13 GreenBiz) — clear_flag

### Provisional sources awaiting review

**393 rows in `provisional_sources` queue** (12 stale orphans pre-W2.F + 381 backfilled tier-M from PR #26).

Composition (from Gap 2 audit + cost-projection):
- 108 promotable now at 75/55 thresholds (53 EU member-state, 24 US state, 8 CA province + DC + 2 territory, etc.)
- 140 needing human review (60–75 relevance, 30–55 freight band; many language_non_english or domain_unknown gates)
- 8 reject candidates
- 10 NULL AI scores (the 12 orphans that pre-date W2.F)

### Auto-approved sources awaiting spot-check

**0 of 64 H-tier sources have been spot-checked.** Pilot run of 20 was read-only (no DB writes). 3 pilot-flagged should-be-M sources were demoted explicitly via `apply-known-demotions.mjs` in PR #26 (DPNR, MDE, VDOT). The full `spot-check-all-h-tier.mjs` script for the remaining ~61 is **ready to run, est $0.06, not yet dispatched**.

`sources.spotchecked = TRUE` count remains 0 across the entire registry. Recurring monthly cron (`spot-check-monthly.yml`) is wired but not yet exercised.

### Coverage gaps surfaced but not closed

From `docs/REGIONAL-DATA-COLLECTION-AUDIT.md`:
- 57 Tier-1 jurisdictions at 0 active sources (EU 27 member states, 13 CA provinces, 3 UK devolved nations, 4 US territories, JP/KR/HK + 9 US states)
- 19 of those have 0 candidates anywhere (need discovery wave)
- 38 have ≥1 promotable candidate from W2.F log (Gap 2 promotion target)
- 6 jurisdictions render items with "Source: —" pin: JP, AE, KR, BR, IN, IMO (CL is single-item)
- Battery brief (eu-battery-regulation-2023-1542): citation parse showed `src=0` — table missing or unparsed; not yet sanity-checked
- 5 EU cross-ref opportunities (other items mention the 3 newly-inserted EU regs without hard link) — not catalogued

### E2E test failures (5 of 27 fail; 18.5%)

Per `docs/E2E-VERIFICATION.md` (2026-05-06T01:49Z):

| Test | Verdict | Notes |
|---|---|---|
| A4 UUID → slug redirect | **FAIL** | Returns 200 not 307. Real bug — A7 implementation logic doesn't fire on this row |
| A10 AI Ask bar mounted | **FAIL** | "Ask AI" control text absent. Could be hidden-by-default state, but worth confirming |
| B2 / B5 / B10 community POSTs | "FAIL" | 201/200 returned with valid IDs — these are test-shape errors (test expected only 201, got 200), not real bugs |

**Real failing surface area**: A4 + A10. Two regressions newly introduced this session.

---

## 4. DEFERRED INTENTIONALLY (Phase D)

| Item | State |
|---|---|
| Multi-tenant workspace switcher | Schema in place (workspace_item_overrides, organizations, org_memberships); admin can manage memberships (PR #20). User-facing switcher: NOT BUILT |
| Vendor verification backend | Stub page with curated list (PR #9); verification: NOT BUILT |
| Events backend | Stub page with editorial calendar (PR #8); backend: NOT BUILT |
| LinkedIn OAuth | Button hidden (PR #6); API approval pending |
| AI query bar proper implementation | AskAssistant component exists; Stream-C fix mounts in AppShell. **E2E A10 says it's not visible — needs investigation** |
| Real email notification delivery | Schema + preferences UI built; SMTP/send pipeline: NOT BUILT |
| Tier 2 jurisdictional expansion | 43/44 zero coverage. Sequence proposed: CH/NO/IS first (English-Latin-script), then UAE/IN/BR/MX after schema gating |
| Multi-language scan support | `scan_enabled` / `language` columns NEVER ADDED. Blocks all non-English Tier 2 |
| Embedding-based source quality (pgvector foundation) | Not investigated this audit |
| Comprehensive perf wave | Per `PERF-AUDIT.md`: 11 deferred fixes (revalidate=60 silently broken, AuthProvider 3× duplicate query, intelligence_changes/item_changelog unbounded, code-split 4× heavy client components, sources.select("*") slim, /research limit lower, dead retry path, etc.) |
| Bundle weight | lucide-react in 73 files (tree-shake not verified); gsap, leaflet, react-markdown weight not measured |
| vitest install + actual running tests | Not investigated; only ad-hoc node test runners exist (`test-extract-sections.mjs` etc.) |
| Security Advisor warnings | Migration 043 addressed several. The earlier "21 remaining" number is stale; current count not freshly verified this audit |

---

## 5. BURIED-SIGNAL PATTERNS DOCUMENTED THIS SESSION

Pattern: **silent failures that look like success in audit logs**. Caught only by user observation or careful reconciliation. All four covered below.

### Pattern 1 — SB 253 integrity flag in brief content, never routed (pre-session backstory)

**Root cause**: Earlier-session agents emitted "integrity rule" phrasing inside `full_brief` markdown (e.g. SB 253 brief noted that a fact couldn't be verified). The platform had no DB-level extraction or routing — the warning lived in markdown only, invisible unless a human read the brief.

**Fix shipped this session**: Migration 035 (PR #20) added `agent_integrity_flag BOOLEAN` + a trigger that scans incoming briefs for the flag-phrase, sets the column, and surfaces flagged items in the admin queue. Migration 044 (PR #22) retuned trigger sensitivity to suppress legitimate-prose false-positives. `INTEGRITY-TRIAGE-REPORT.md` was generated against the pre-retune 57-flag set; post-retune state is 1 flag unresolved.

**Prevention measure**: All integrity flags now route to admin queue automatically. Trigger sensitivity is calibrated. Triage procedure documented at `docs/INTEGRITY-TRIAGE-PROCEDURE.md`.

### Pattern 2 — RLS recursion in `community_group_members` (mig 029, fixed in mig 046)

**Root cause**: Original RLS policies in migration 029 included rules like "user can read members if they are an admin of the same group", checked via subquery against the same `community_group_members` table. This created infinite recursion when any read fired.

**Fix shipped**: Migration 046 (in PR #20 set) introduced 3 SECURITY DEFINER helper functions — `user_is_group_member`, `user_is_group_admin`, `user_owns_group` — that bypass RLS internally. Policies rewritten to call those helpers instead of self-referencing.

**Prevention measure**: SECURITY DEFINER pattern documented in CLAUDE.md. Open question: would benefit from a static check / lint rule that flags self-referencing RLS subqueries before they merge. Not yet implemented.

### Pattern 3 — W2.F provisional_sources silent drop (PR #26 fix + 381 backfill)

**Root cause**: `fsi-app/supabase/seed/tier1-population-runner.mjs:1151` referenced a non-existent `jurisdictions` column on `provisional_sources` (the actual column is `discovered_for_jurisdiction TEXT`, added by migration 040). Every tier-M insert errored with PostgREST schema-cache message; the runner caught the error, recorded `action_taken='rejected'` in `source_verifications`, and continued. **385 candidates dropped silently**, with audit-log noise that read as "rejected" rather than "failed".

**Fix shipped (PR #26)**: 
- Removed the bad column reference from `tier1-population-runner.mjs` + comment block explaining root cause
- Wrote `fsi-app/supabase/seed/backfill-missing-provisionals.mjs` (idempotent) that selected orphan tier-M audit rows, inserted to `provisional_sources` with their cached AI scores, updated audit row to `action_taken='queued-provisional'` + `resulting_provisional_id` pointer
- Backfill executed: **381 inserted, 4 dedupe skips, 0 failed**. Provisional queue went 12 → 393.
- Commit message keywords: "post-write verification", "buried signal" (per user request, future agents can grep)

**Prevention measure (Phase D)**: Post-write verification on queue/table writes — every code path that records "I queued X for review" should verify the write landed before declaring success. Concretely: any insert that produces a downstream pointer (e.g. `resulting_provisional_id`, `staged_update_id`, `materialized_item_id`) should set the pointer in the same transaction or assert the row exists before recording the audit-log decision.

### Pattern 4 — Phase C surface migration regressions caught only by user observation

**Root cause**: Phase C Block B (PRs #12–14) rebuilt 7 surfaces as greenfield component rewrites under the editorial design language. Feature parity with the pre-Block-B legacy components was not enforced via tests, audit checklist, or programmatic comparison. Specific regressions:

- Timeline parser + visual bar (was in `ResourceDetail`; not ported to `RegulationDetailSurface`)
- Gradient bars on impact assessment (regressed; restored in PR #23)
- Share menu (3 detail levels × 2 formats; not ported)
- Priority override (not ported)
- Archive flow with reason picker (not ported)
- Verification status badge (not ported)
- Editorial priority labels (regressed; restored in PR #23)
- ISO jurisdiction display (regressed; fixed in PR #23)

**Fix shipping**: PR #23 restored the items it caught. Remaining regressions (Timeline, badge, archive flow) are in the **approved bundle agent dispatch** that has not yet been kicked off.

**Prevention measure**: Phase C surface rebuilds need a documented feature-parity audit checklist captured **before** the rewrite begins, and a programmatic diff (interactive feature inventory: button count, click handlers, data fields rendered) between pre/post-rewrite trees. This was never created. Concrete proposal: add `docs/SURFACE-FEATURE-INVENTORY.md` per surface that gets touched, owned by the surface author, signed off before the new component replaces the old.

---

## 6. ARCHITECTURAL STATE

### Brief structure source of truth

Per `docs/BRIEF-STRUCTURE-AUDIT.md`:

- **Operative source of truth: `fsi-app/src/lib/agent/system-prompt.ts`** (what the model receives at runtime)
- **Reference + contract: `fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md`**
- Both content-aligned at section level (verbatim names + order)
- Prompt header still says `canonical, 2026-04-28`; emitted YAML uses `2026-04-29` — **comment-revision drift**
- Parser (`parse-output.ts`) does NOT enforce section names or order, only the 12-field YAML frontmatter. Agent can drift sections freely without runtime check.
- Order drift in real briefs: 4 of 7 audited briefs misplace conditional sections 6 (Anticipated Guidance) and 7 (Threshold Questions). ACF uses numbered H2 (`## N. Section Name`) — outlier. EU HDV CO2 omits doc-title H1.
- Undocumented conventions: `## Regulatory Fact Document` preamble (5/7 briefs); `# New Sources Identified` H1 after `# Sources` (7/7 briefs); doc-title H1 (6/7 briefs).

### Migration ledger

Applied 001 → 047 (numbering has gaps from earlier deletions; see `git ls-files fsi-app/supabase/migrations/`). Session window 026 → 047 (22 migrations). All 22 are present in the repo and applied to remote (verified via PR merge history; deeper supabase CLI verification was not run this audit).

Notable: 021 was renamed to 023 in cleanup-pass-2026-04-30. Migration 014 was deleted historically. Migrations 008 + 012 may not exist on disk (checked: confirmed missing from `fsi-app/supabase/migrations/`; not investigated whether ledger needs `migration repair`).

### Source registry tier composition

| Tier | Definition | Active sources | Coverage |
|---|---|---:|---|
| Tier 1 (institutional) | Official gazettes, primary regulators | ~67% of active set | 63 distinct ISO codes covered in active set; 13 well-covered (≥3 sources), 48 under-covered (1–2 sources), 38 gap with provisionals, 19 gap no provisionals |
| Tier 2 (industry / standards) | Industry interpretation, standards bodies | ~25% | Distributions across DNV, BV, ABS, ClassNK, GLEC, GHG Protocol, etc. |
| Tier 3 (analysis / press) | ICCT, ITF, FreightWaves, Loadstar, etc. | ~7% | Mostly trade press + thinktanks |
| Provisional | Pending review | 393 rows | 108 promotable / 140 review / 8 reject / 10 unscored |

Top 10 active-source jurisdictions: GLOBAL (180), EU (69), US (66), GB (22), US-CA (9), US-WA (5), US-NY (4), US-NC (4), US-GA (3), US-IA (3).

### Auto-verification thresholds (post-PR #26)

| Threshold | Value |
|---|---:|
| `AI_RELEVANCE_H` | 75 (was 70) |
| `AI_FREIGHT_H` | 55 (was 50) |
| `AI_RELEVANCE_M` | 50 (unchanged) |
| `AI_FREIGHT_M` | 25 (unchanged) |
| `KNOWN_AUTHORITATIVE_PATTERNS` | 57 |

Pilot false-positive rate at 70/50: 15% (3 of 20). Target: ≤5%.

### Coverage matrix state

`coverage_matrix()` RPC returns 113 (jurisdiction × item_type) pivot rows. 77 distinct jurisdictions, 11 item_types. Asymmetry: 6 jurisdictions render items with 0 active sources (JP, AE, KR, BR, IN, IMO + CL).

---

## 7. COST AND CAPACITY

### Anthropic API spend this session (running totals)

| Activity | Cost |
|---|---:|
| 3 EU brief inserts (Battery + HDV + NZIA) | $0.641 |
| Spot-check pilot 20 sources (Haiku) | $0.019 |
| Earlier-session brief regenerations + agent calls | unmeasured this audit (no per-call telemetry — see W5 recommendation 6) |
| Backfill 381 provisionals | $0 (DB-only, AI scores reused from cached audit rows) |
| 3 demotions (DPNR/MDE/VDOT) | $0 (DB-only) |
| **Confirmed session spend (LLM only)** | **~$0.66** |

### Estimated steady-state monthly operating cost (post cost-optimization wave)

Per `docs/W5-cost-projection.md` (live DB inputs as of 2026-05-05T16:44):

| Scenario | Annual | Monthly |
|---|---:|---:|
| Low (minimal usage) | $671.50 | $56 |
| **Mid (expected)** | **$4,031.84** | **$336** |
| High (full activation) | $9,750.81 | $812 |

The dominant line in every scenario is **source scan worker** (97% of low, 97% of mid, 94% of high). W5 recommendation 1 (tiered cadence: T1 weekly, T2 monthly, T3 quarterly) cuts this ~40% with no recall loss. W5 recommendations 2 (hash-based regen) + 3 (Haiku triage) + 4 (prompt cache) compound to ~60–75% off the brief-regen line and ~30–50% off admin scan. Net steady-state target after the cost-optimization wave: ~**$2,000–2,500/yr at Mid**.

### Database storage state

| Table | Row count |
|---|---:|
| sources | 563 |
| intelligence_items | 194 |
| source_verifications (cumulative sample) | 1,000 |
| provisional_sources | 393 |
| staged_updates | small (100-row cap on UI; pending=0) |
| community_groups | 1 (test) |
| community_posts | 2 (test) |

### Browserless usage

Not investigated this audit. The agent runtime (`/api/agent/run`) uses `browserless.ts` for source content fetch, but per-call rate / quota tracking is not in any current dashboard.

---

## 8. WORK QUEUED FOR NEXT WAVES

### Cost optimization wave (~3h, ~$3,500–3,800 saved annually)

Per W5 recommendations 1–4:
- Tiered scan cadence (T1 weekly, T2 monthly, T3 quarterly)
- Hash-based brief regeneration (gate regen on source content hash / Last-Modified)
- Anthropic prompt caching on system-prompt prefix (~90% input-token cost reduction)
- Two-stage Haiku→Sonnet pattern on admin scan + discovery agent (~30–50%)

(Threshold tightening landed in PR #26 — already shipped.)

### Tier 2 expansion wave (separate, est $30–50)

Per Gap 2 + Regional Audit:
- Phase 1: re-run 12 stale provisional rows through W2.F (~$0.012)
- Phase 2: surface the 393 provisional queue for admin promotion (no LLM cost)
- Phase 3: promote the 108 ready candidates (no LLM cost)
- Phase 4: admin triage on 140 borderline (human time)
- Phase 5: discovery wave for 19 empty Tier 1 jurisdictions (~$1–3)
- Phase 6: source registration for 7 asymmetry jurisdictions (~$0–0.012)
- Phase 7+: T2 expansion sequenced — CH/NO/IS first (English-Latin-script), then UAE/IN/BR/MX after `scan_enabled`/`language` schema lands

### Auth-state audit follow-up

Logged-out signup/login/onboarding flow integrity. Specifics not captured in current docs — surface the audit before triaging.

### Phase D items in priority order

1. Spot-check the 64 H-tier sources (Gap 1 dry-run, dispatch already approved)
2. Bundle agent (PR #24 extension, dispatch already approved)
3. Triage 393 provisional sources (Gap 2 promotion + review buckets)
4. EU 27 member-state regulator promotions (53 candidates ready)
5. CA provinces + UK devolved nations discovery (16 of 17 zero — major freight jurisdictions)
6. Add `scan_enabled` + `language` columns to `sources` (small migration; unblocks all non-English work)
7. Backfill regional_data profiles for Tier 1 sub-nationals (107/118 missing)
8. Fix Dubai/UAE jurisdiction_iso (`[GLOBAL]` → `[AE]`)
9. Apply remaining EU regulation inserts (5 IDs still missing — ReFuelEU 2023/2405, Clean Trucking 2024/1610, AFIR 2023/1804, EU ETS Directive 2023/959, CBAM 2023/956)
10. Catalogue the 5 EU cross-ref opportunities (full-text scan against `intelligence_items.full_brief`)
11. Sanity-check Battery brief citation table (parse showed src=0)
12. Backfill `provisional_sources.discovered_for_jurisdiction` for 12 stale rows
13. SKILL.md doc-3 conventions formalisation (preamble, doc-title H1, New Sources Identified)
14. ACF + EU HDV brief regen on next hash-regen pass
15. Email notification delivery pipeline
16. Multi-tenant workspace switcher UI
17. Vendors / events / LinkedIn OAuth backends

---

## 9. COMMITMENTS MADE BUT NOT YET DELIVERED

Things I (Claude Code) said I would do during this session but haven't yet:

1. **Bundle agent dispatch** — approved by user, not dispatched. Agent would extend PR #24 with Timeline parser + tab rename/reorder + Coming-soon for Exposure/Penalty + hide Team Notes + Verification badge + Archive flow. **Status: paused for this audit at user direction**.
2. **Gap 1 dry-run agent dispatch** — approved by user, not dispatched. Would run `spot-check-all-h-tier.mjs` against 64 H-tier sources at 75/55. **Status: paused**.
3. **PR #25 production deploy verification** — `https://carosledge.com` smoke walk through /regulations, /operations, /market with slim payload. **Status: PR #25 is MERGED and Vercel previews show SUCCESS, but post-merge production smoke not yet executed**.
4. **PR #24 merge** — gated on (3). **Status: pending**.
5. **Surface Gap 1 dry-run results before mass-execution** — depends on (2).

---

## 10. RECOMMENDATIONS

### What's launch-ready

- **Core read-and-monitor surfaces**: Dashboard, Regulations index + detail (with caveats), Operations, Market Intel, Research, Map. Slim RPC saves 3.33 MB/render. Authenticated routes work; auth + onboarding shipped.
- **Admin tooling**: integrity flag queue (1 unresolved), source registry browser (501 active), provisional review surface (393 in queue), bulk import audit, organizations + members management.
- **Verification pipeline**: thresholds calibrated post-pilot; recurring monthly cron wired; W2.F audit log captures every classification with score traces.
- **Agent runtime**: 5 format-selected briefs (regulatory, technology, operations, market, research); YAML metadata enforced; intersection detection live.
- **Community foundation**: shell + groups + posts (with promote→staged) + notifications schema + moderation. Runs on parallelised data path (~700ms warm target).

### What's not launch-ready

- **Operations By Jurisdiction tab**: 11/118 cells. The "By Jurisdiction" promise is structurally false until Gap 2 promotions land + `regional_data` profiles are backfilled.
- **AI Ask bar**: E2E A10 says it's not visible. If launch flow includes "ask the assistant", this is a P0.
- **A4 UUID→slug redirect**: regression. Detail-page URLs from earlier UUIDs still 200 — search-engine canonicalisation will be confused.
- **393 provisional sources**: queue is now visible (good) but untriaged. Without Phase 3 promotion of the 108 ready candidates, the surface looks like "huge backlog, no progress".
- **0 of 64 H-tier sources spot-checked**: the verification post-condition has never closed. 15% false-positive rate is in the live registry.
- **Phase C regression backlog**: 6 items need bundle-agent dispatch before detail-page parity matches the legacy artifact.
- **6 EU regulation IDs still referenced but missing** in `intelligence_items` — when those briefs are next read, they'll reference regs that don't exist in the platform.

### Next priority

In order of leverage × dependency:

1. **Smoke-test PR #25 production deploy** (5–10 min) — confirms slim RPC didn't break /regulations, /operations, /market.
2. **Dispatch bundle agent + Gap 1 dry-run in parallel** (per user's previous approval). Bundle landing on PR #24 unblocks merge of detail-page parity. Gap 1 dry-run produces the FP-rate evidence needed to spot-check the rest of the H-tier registry.
3. **After PR #24 + bundle merge**: triage the 393 provisional sources (Phase 3 — promote the 108 high-confidence; Phase 4 — admin triage on 140 borderline). This is the largest concrete coverage delta available right now.
4. **Apply 5 missing EU regulation inserts** before any further brief regen (so cross-ref relationships materialise).
5. **Cost optimization wave** once shipped state is stable.

### What can wait

- Tier 2 expansion (separate wave, schema-blocked anyway)
- Multi-tenant workspace switcher UI (single-workspace works fine today)
- Real email notification delivery (in-app notifications work; email is additive)
- Comprehensive perf wave fixes #6–15 (current state is operationally fine; revisit when bundle weight matters)
- vitest setup (ad-hoc node test runners do the job for now)
- Embedding-based source quality (pgvector foundation laid; not blocking)

### What got missed or under-scoped

- **AI Ask bar visibility verification**: Stream-C fix landed in PR #23, but E2E A10 says the control isn't in the DOM. Either the panel is closed by default and the test looks for the open-button text (in which case the test is wrong), or the mounting is hidden behind a condition that isn't satisfied on the dashboard. Worth a 10-minute investigation before considering AskAssistant "live".
- **A4 UUID→slug redirect**: regression introduced this session. The implementation logic in PR #23 doesn't fire for `42b8bfee-…/sb253`. Investigate whether the UUID detection regex is wrong or the legacy_id lookup path is bypassed.
- **Battery regulation brief citation table**: `src=0` in parse means either the agent didn't emit a `# New Sources Identified` table, or the parser missed it. This affects citation extraction and provisional discovery for that one regulation.
- **Dubai/UAE regional_data jurisdiction_iso**: `[GLOBAL]` instead of `[AE]`. Cosmetic in isolation but reveals a class of regional_data tagging-validation gaps that the W4 backfill didn't catch.
- **5 EU cross-ref opportunities**: items mentioning the 3 newly-inserted EU regs without hard link. Not catalogued — the inserts succeeded but the "intersection" half of the value didn't fully land.

### Architectural debt user might not be aware of

- **`revalidate = 60` is silently broken** on every page that uses cookies. The 9–11 query data path runs on every single request; the ISR hint is a lie. PERF-AUDIT recommendation 4 is the highest-leverage perf fix in the audit and has not been scheduled.
- **AuthProvider duplicates `org_memberships` lookup** on the client at mount, even though the server already resolved it in proxy + getAppData. 3× same query per page render. PERF-AUDIT item 8.
- **Brief structure parser doesn't validate section names or order**. Agent drift is invisible to the parser — it only enforces YAML frontmatter. 4 of 7 real briefs are out of spec order without anyone noticing.
- **Migrations 008 + 012 + 014 not on disk**. The numbering has gaps. Whether that's harmless or whether the supabase ledger needs `migration repair` was not investigated this audit.
- **Per-call AI cost not logged** on `staged_updates` rows. W5 cost projections are model-derived, not actuals. The high-scenario delta (~$5,719/yr) is invisible until the bill arrives. W5 recommendation 6.
- **The 12 stale provisional_sources rows pre-date W2.F entirely** (2026-04-05). They're orphan candidates with NULL AI scores, NULL discovered_for_jurisdiction. Re-running W2.F on those 12 closes 4 of the 7 asymmetry jurisdictions — a 1-line orchestration fix that hasn't been queued.

---

## Artefacts referenced

Repo:
- `fsi-app/supabase/migrations/026_*.sql` through `047_*.sql`
- `fsi-app/src/lib/agent/system-prompt.ts` (canonical agent contract)
- `fsi-app/src/lib/sources/verification.ts` (W2.F thresholds, post-tighten)

Session docs:
- `docs/GAP-1-RESOLUTION.md` — H-tier spot-check audit + threshold tightening
- `docs/GAP-2-PROMOTION-CANDIDATES.md` — sub-national coverage + 393 provisional triage
- `docs/REGIONAL-DATA-COLLECTION-AUDIT.md` — 8-dimension regional state
- `docs/BRIEF-STRUCTURE-AUDIT.md` — agent prompt vs SKILL.md vs real briefs
- `docs/PERF-PROFILING-FINDINGS.md` — fresh perf claim verification
- `docs/PERF-AUDIT.md` — 15-item perf backlog (11 deferred)
- `docs/PERF-WAVE-2.md` — wave-2 perf changes (slim per-page fetchers etc.)
- `docs/COMMUNITY-PERF-FIX.md` — community parallelisation
- `docs/INTEGRITY-TRIAGE-REPORT.md` — 57-flag triage (pre-mig 044 retune)
- `docs/INTEGRITY-TRIAGE-PLAN.json` — machine-readable triage
- `docs/SPOT-CHECK-RESULTS.md` — 20-source pilot, 15% FP at 70/50
- `docs/STREAM-AB-POLISH.md` — A1–A9 polish wave
- `docs/STREAM-C-FIXES.md` — 3 production bugs + fixes
- `docs/INTELLIGENCE-DEPTH-IMPL.md` — Tier-1/2/3 layering implementation
- `docs/E2E-VERIFICATION.md` + `.json` — 27-test verification matrix (5 fail)
- `docs/W5-cost-projection.md` — annual operating cost projection (low/mid/high)
- `docs/EU-INSERTS-LOG.json` + `docs/EU-BRIEFS-RUNLOG.txt` — 3 EU regulation insert logs
- `docs/BACKFILL-MISSING-PROVISIONALS-RESULTS.json` — 381 inserted, 0 failed
- `docs/W3-tier1-{US,EU,UK,CA,AU,APAC}-results.json` — W3 ingestion logs
- `docs/W4-{1,2,3,4}-*.json` — W4 backfill logs
- `docs/EXTRACT-SECTIONS-TEST.md` — 7/7 brief parser pass

No DB rows were created, modified, or deleted as part of this audit. No migrations applied. No agents dispatched.
