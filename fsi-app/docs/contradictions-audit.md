# CLAUDE.md / STATUS.md vs Actual Code State — Contradiction Catalog

Compiled 2026-04-30 on `cleanup/post-b2` from `redesign/full-migration` HEAD `6bc8032` plus this branch's `f0f7cdf` AGENT-ARCHITECTURE rewrite. **Read-only audit.** No fixes applied — listed for follow-up.

For each item: **claim** as written, **actual** state observed, **suggested fix** (deferred).

---

## CLAUDE.md

### 1. Source registry counts (lines 36–40)

**Claim:**
> 73 sources seeded across T1-T6, all 7 domains
> 1 provisional (DEWA Shams Dubai — needs live verification)
> Source mapping: 95/119 legacy resources mapped to sources (80%)
> 24 unmapped = provisional source candidates for discovery pipeline

**Actual:**
- `seed-sources.sql` carries 11 INSERT statements but registry has been expanded by Phase B.0c additions (DNV, Bureau Veritas, ABS, ClassNK, CLECAT, TIACA, FreightWaves, Lloyd's List, etc.) plus B.0e promotions. Last observed in-session: ~176 sources (per the Bayesian-prior trust backfill).
- "1 provisional (DEWA)" is wrong; B.0d has 12+ pending provisionals, B.2.5 spawned 210+ pending `canonical_source_candidates` (separate table).
- "95/119 legacy resources" predates the migration to `intelligence_items` — there are now 155 active items, not 119.

**Suggested fix:** delete the entire `## Source Registry` section. The numbers move every commit; they belong in `/api/admin/b2-progress` and the Source Health Dashboard, not a static MD claim.

### 2. Tech Stack — Supabase deployment status (line 16)

**Claim:**
> Supabase (PostgreSQL) — schema defined, not yet deployed

**Actual:** Supabase has been live for the entire B-phase work. 25 migrations applied; live DB has 155 active items, 73+ sources, 2,325 intelligence_summaries. The claim was true for 5 minutes during the original setup.

**Suggested fix:** change to "Supabase (PostgreSQL) — live; 25 migrations applied; data model documented in `supabase/migrations/`."

### 3. "Not Started" section (lines 79–84)

**Claim:**
> - Supabase deployment and live data connection
> - Execute migration: 119 resources → intelligence_items with source_id FK
> - Monitoring queue implementation
> - Worker/cron for source scanning
> - Community layer (Phase 2)

**Actual:**
- Supabase deployment: DONE (item 2 above).
- 119 → intelligence_items: DONE in migration 010 (`migrate_legacy_to_item.sql`).
- Monitoring queue: PARTIAL. `monitoring_queue` table exists; worker route `/api/worker/check-sources` exists. Not driven by a cron yet; trust-recompute workflow runs monthly.
- Worker/cron for source scanning: PARTIAL via GitHub Actions (`.github/workflows/`). `/api/data/scan-all` route exists.
- Community layer: still pending. Tables seeded (`forum_threads`, `vendors`) but no UI. Single legitimate "Not Started" item.

**Suggested fix:** rewrite the section keeping only Community as not-started; add a "Phase B done / Phase C pending" header.

### 4. Key Files list (lines 86–95)

**Claim:** 9 files listed.

**Actual:** Significant new key files since the list was written:
- `src/lib/agent/system-prompt.ts` (the agent contract)
- `src/lib/agent/parse-output.ts` (the YAML parser)
- `src/lib/agent/source-pool.ts` (dynamic pool)
- `src/lib/sources/browserless.ts` (shared helper)
- `supabase/seed/b2-runner.mjs` (full-corpus runner)
- `src/components/sources/IntersectionDetectionView.tsx`
- `src/components/sources/CanonicalSourceReview.tsx`
- `src/components/sources/B2ProgressBanner.tsx`
- `src/components/resource/IntelligenceMetadataStrip.tsx`

**Suggested fix:** add the agent runtime files + Phase B.2.5 surfaces; the existing list is fine as historical record but incomplete.

### 5. API Security — "Currently Authenticated Routes" table (lines 116–120)

**Claim:** 2 routes listed (`/api/sources`, `/api/staged-updates`).

**Actual:** 28 route files exist under `src/app/api/`. 25 of them call `requireAuth()`. Routes added since the table was written:
- `/api/admin/b2-progress`
- `/api/admin/canonical-sources/{bulk-approve,bulk-classify,decide,pending,recommend-classification}`
- `/api/admin/intersections`
- `/api/admin/recompute-trust`
- `/api/admin/scan`
- `/api/admin/sources/{[id]/{fetch-now,pause,regenerate-brief,visibility},all,pause-global,promote,recommend-classification}`
- `/api/admin/users`
- `/api/agent/run`
- `/api/ask`
- `/api/data/{fetch-source,scan-all}`
- `/api/intelligence-items/[id]/metadata`
- `/api/notifications/trigger`
- `/api/worker/check-sources`
- `/api/workspace/overrides`

**Suggested fix:** the table is too granular to keep current. Replace it with: "All routes under `src/app/api/` call `requireAuth()` except `/api/auth/callback` and `/api/worker/*` which use worker-secret auth. Inventory: `find src/app/api -name route.ts`."

### 6. AGENT ARCHITECTURE (lines 127–155) — RESOLVED on this branch

**Status:** rewritten in commit `f0f7cdf` (this branch). Documented as archived: multi-sector synopsis model, Anthropic Console Managed Agent. Documented as current: format-selected single-brief regeneration. 6 permitted live Claude routes listed.

### 7. Session Log entries reference deleted/renamed files

**Claim** (line 387):
> 5. ~~Delete `/api/debug/data-path` diagnostic route~~ — RESOLVED 2026-04-28: directory `src/app/api/debug/` does not exist; route was removed in an earlier session.

**Actual:** correct, no contradiction. Cited as an example of how the session log already self-resolves.

**Suggested fix:** none.

### 8. Session Log refers to `intelligence_summaries` as primary read source (line 374)

**Claim:**
> Sector contexts read from `sector_contexts` table at runtime — not hardcoded. 15 sectors with `synopsis_prompt` per sector.

**Actual:** the `sector_contexts` table likely still exists but is not consulted by `/api/agent/run`. The synopsis injection was archived when the multi-sector model was retired.

**Suggested fix:** session log entries are historical and shouldn't be edited; the AGENT ARCHITECTURE rewrite (commit `f0f7cdf`) documents the archived state. Leave session log untouched.

---

## STATUS.md

### 9. Branch line — "PR #5 (draft)" (line 6)

**Claim:**
> **Branch:** `redesign/full-migration` → PR #5 (draft)

**Actual:** unverified from this audit (no `gh pr view` run). Plausibly still accurate, plausibly not.

**Suggested fix:** verify with `gh pr list --head redesign/full-migration` before next status pass.

### 10. "Migration files committed, NOT yet run" — 008_* (line 8)

**Claim:**
> Migration files committed, NOT yet run: `008_platform_admin_profiles.sql`, `008_seed_platform_admins.sql`. Apply order documented in commits `50f9346` and `c67dd29`. Migration commits run after code merge, never before.

**Actual:** 008 files exist on disk; their applied-status against the Supabase DB was not verified in this audit. Earlier session log mentions these as "applied" alongside other 0xx migrations; if so, the STATUS.md line is stale.

**Suggested fix:** run `npx supabase migration list --linked` and update — or delete the line if both have been applied.

### 11. Migration rule 9 — "Deprecation means deletion, not annotation" (line 153)

**Claim:** rule 9 in the working rules.

**Actual:** consistent with practice and reinforced by Phase B.0/B.0h cleanups + commit `1744b55` (this session). NO contradiction.

### 12. Migration rule "Migration commits run after code merge, never before" (line 8 + line 166)

**Claim:**
> Migration commit runs after code merge, never before.

**Actual:** Phase B.0/B.0e/B.2/B.2.5 practice has been the OPPOSITE — apply migration first via Supabase CLI, then commit the code that depends on the new column. This pattern keeps preview deployments from 500-erroring on a row that references columns that don't exist yet.

**Suggested fix:** the rule is anachronistic for the runtime/data layer (it was written for the editorial migration's apply-008.mjs scripts). Either narrow the rule's scope ("for editorial migrations only") or invert it ("apply migration first, then commit the code that depends on it"). Decide which way per current convention and update.

### 13. Migration rule "No automatic ordering — each migration is applied via its own apply-NNN.mjs" (line 166)

**Claim:**
> No automatic ordering — each migration is applied via its own `apply-NNN.mjs`.

**Actual:** Phase B.0+ migrations have been applied via `npx supabase db query --linked -f migrations/NNN_*.sql` followed by `npx supabase migration repair --status applied NNN`. There is no `apply-NNN.mjs` script for migrations 013, 015–022 — only the early `apply-008*.mjs` scripts exist (for the platform-admin work).

**Suggested fix:** loosen the rule. Either "early migrations use apply-NNN.mjs; later ones use Supabase CLI direct" or just "apply via whichever path is current; document in commit body."

### 14. Migration numbering collision

**Claim:** none made directly, but the migration filename convention assumes unique numbers.

**Actual on disk:**
- `006_multi_tenant.sql` AND `006_rls_multi_tenant.sql` (collision OK — different concerns)
- `007_community_layer.sql` AND `007_full_brief.sql` AND `007_rls_community.sql` (3-way 007 collision)
- `008_platform_admin_profiles.sql` AND `008_seed_platform_admins.sql` (collision OK — paired)
- `021_canonical_source_candidates.sql` AND `021_intersection_detection_function.sql` (collision in this session — should have been 022 + 023, not both 021)
- Number 014 SKIPPED (no file).
- 022 used for `canonical_source_classification_cache`.

**Suggested fix:** rename `021_intersection_detection_function.sql` → `023_intersection_detection_function.sql` so applied-order is unambiguous. Update `supabase/migrations/` table in `migration_repair` if needed.

### 15. Open question 1 — "BLOCKER for merge: Vercel Deployment Protection state on Production" (line ~150)

**Claim:** merge blocker pending user check.

**Actual:** unverified from this audit. May still be a blocker.

**Suggested fix:** check Vercel project settings via the user; mark resolved if confirmed safe.

### 16. Open question 4 — "Regulation detail count discrepancy" (line ~152)

**Claim:**
> User scope says "5 sections of the brief structure as currently designed" with "additional 5 brief sections to bring the structure to 10" deferred.

**Actual:** the brief structure is now 14 sections (regulatory_fact_document) per SKILL.md 2026-04-29, not 5 or 10. Earlier 10-section reference is stale.

**Suggested fix:** mark this open question RESOLVED — superseded by the 14-section regulatory_fact_document format committed in `2fecb79`.

---

## Summary

**16 contradictions catalogued.**

- High-impact (numbers + architecture): items 1–6, 12, 14
- Medium-impact (stale lists or rules): items 3, 4, 7, 13, 16
- Verify-then-decide: items 9, 10, 15
- Already resolved on this branch: item 6 (commit `f0f7cdf`)

**Recommended order if fixing in a future commit:**
1. Section rewrite of CLAUDE.md "Not Started" + "Source Registry" + "Tech Stack" + "Currently Authenticated Routes" (items 1, 2, 3, 5)
2. Migration filename rename for 021 collision (item 14) — purely cosmetic, do alongside the next migration
3. STATUS.md migration-rules update (items 12, 13) — narrow scope or invert
4. STATUS.md verify-and-update lines (items 9, 10, 15)
5. Mark resolved (items 6, 16)

No fixes applied in this commit.
