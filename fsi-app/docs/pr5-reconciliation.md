# PR #5 Reconciliation — read-only investigation

**Date:** 2026-05-25
**Investigator:** Claude (read-only agent)
**Status:** AWAITING OPERATOR DECISION

## TL;DR

PR #5 is **already MERGED** (merge commit `0d7013c`, merged 2026-05-01T02:25:01Z by Dwarves77). The PR title in master's log is `Merge pull request #5 from Dwarves77/redesign/full-migration` with subject `redesign: full editorial migration (Option 2 stat strips, navy accent, every page)`. 371 commits have shipped to master since the merge. The PR body still carries the original `BLOCKER — DO NOT MERGE UNTIL RESOLVED` notice plus `Status: In progress`, but the branch was nonetheless merged. There is no in-flight reconciliation work for the operator to do — the PR is closed and integrated. The only "reconciliation" question is whether to be aware of any followups the PR body flagged as out-of-scope that may still need separate PRs.

## PR #5 Snapshot

- **Title:** redesign: full editorial migration (Option 2 stat strips, navy accent, every page)
- **Author:** Dwarves77 (GitHub user id 60444495)
- **Created:** 2026-04-26T22:05:17Z
- **Last updated:** 2026-05-01T02:25:01Z
- **Merged at:** 2026-05-01T02:25:01Z (merge commit `0d7013c6ed3ebc95d548bc98fe40add6b2eadc79`)
- **State:** **MERGED**
- **Base -> head:** `master` <- `redesign/full-migration`
- **Mergeability at query time:** UNKNOWN / UNKNOWN (irrelevant — PR is already merged)
- **Stats:** +13,493 / -3,439 across 124 changed files
- **Commit count on the branch:** 95 commits (see `Commits` section below)

## Scope

### Files touched (high-level groupings; 124 files total)

- **Design system / shell** (created in this PR):
  - `fsi-app/src/components/shell/PageMasthead.tsx`
  - `fsi-app/src/components/shell/SectionHeader.tsx`
  - `fsi-app/src/components/shell/StatStrip.tsx`
  - `fsi-app/src/app/theme.css`
  - `fsi-app/src/components/AppShell.tsx`, `Sidebar.tsx`
- **Page rebuilds:**
  - `fsi-app/src/app/page.tsx`, `regulations/page.tsx`, `community/page.tsx`, `profile/page.tsx`, `onboarding/page.tsx`, `privacy/page.tsx`, `admin/page.tsx`
  - `fsi-app/src/components/pages/RegulationsPage.tsx`
  - `fsi-app/src/components/Dashboard.tsx` (later deleted in `fa9370d`, see "Files NOT to lose")
  - `fsi-app/src/components/home/DashboardHero.tsx`, `WeeklyBriefing.tsx`
- **Source intake / admin (Phase B.0 + B.2 + B.2.5):**
  - `fsi-app/src/components/sources/B2ProgressBanner.tsx`, `CanonicalSourceReview.tsx`, `IntersectionDetectionView.tsx`, `ProvisionalReviewCard.tsx`, `SourceAdminControls.tsx`, `SourceHealthDashboard.tsx`, `SourceProvenanceBadge.tsx`
  - `fsi-app/src/components/admin/AdminDashboard.tsx`, `WorkspaceProfile.tsx`
  - API routes: `/api/admin/canonical-sources/*`, `/api/admin/sources/*`, `/api/admin/intersections`, `/api/admin/scan`, `/api/admin/b2-progress`, `/api/admin/users`, `/api/admin/recompute-trust`
- **Agent system:**
  - `fsi-app/src/lib/agent/parse-output.ts`, `section-validator.ts`, `source-pool.ts`, `system-prompt.ts`
  - `fsi-app/src/lib/sources/browserless.ts`
  - `fsi-app/src/lib/trust.ts`
  - `/api/agent/run`, `/api/data/fetch-source`, `/api/data/scan-all`, `/api/worker/check-sources`
  - Profile/auth: `fsi-app/src/components/auth/UserMenu.tsx`, `fsi-app/src/lib/api/org.ts`, `pause.ts`, `supabase-server.ts`
- **Migrations** (17 SQL files): 009 through 025 (capture undeclared tables, legacy -> item migration, orphan supersessions, drop legacy tables, provisional classification, processing pause, admin_only, B.2 brief schema, intersection-readiness, canonical source candidates, classification cache, intersection detection RPC, admin cooldowns, sector activation interest)
- **Seed scripts** (24 files under `supabase/seed/`): B2 runner, brief generators, canonical source classifier/discoverer, batch rewriters, migration runners, URL health check, verifier
- **Onboarding / profile:** `fsi-app/src/components/onboarding/SectorOnboarding.tsx`, `fsi-app/src/components/profile/SectorSelector.tsx`
- **Resource UI:** `fsi-app/src/components/resource/IntelligenceMetadataStrip.tsx`, `ResourceCard.tsx`, `SectorSynopsis.tsx`
- **State:** `fsi-app/src/stores/resourceStore.ts`, `sourceStore.ts`, `workspaceStore.ts`
- **Types:** `fsi-app/src/types/resource.ts`
- **Infrastructure / docs:** `fsi-app/vercel.json`, `.env.local.example`, `.gitignore`, `STATUS.md`, `.claude/CLAUDE.md`, `.claude/skills/environmental-policy-and-innovation/SKILL.md`
- **Docs added:** `fsi-app/docs/SCOPE_AUDIT.md`, `admin-scan-audit.md`, `contradictions-audit.md`, `intelligence-summaries-proposal.md`
- **GitHub workflows:** `.github/workflows/source-monitoring.yml`, `trust-recompute.yml` (replaces broken Vercel cron)

### Commit titles (95 commits, abbreviated)

The branch spans 2026-04-26 -> 2026-05-01 (5 calendar days). Highlights from `gh pr view 5 --json commits`:

- `84021a8` `feat(design): foundation tokens, StatStrip, masthead gradient`
- `50f9346` `migration(008): platform admin flag on profiles + apply script`
- `8c08eec` `feat(shell): PageMasthead component, mounted per-tab`
- `3866b75` `feat(stat-strip): wire StatStrip into regulations + MergedSection; ad...`
- `367fab4` `feat(dashboard 6a): hero strip + masthead refresh per dashboard-v3.html`
- `2d2005b` `chore(shell): consolidate primitives into src/components/shell/ + STA...`
- `b0d9724` `security: replace hardcoded service-role JWT with env var, sync env t...`
- `5f8403b` `docs(scope): full intent-vs-reality audit for Caro's Ledge`
- `ea03469` `feat(monitoring): replace broken Vercel cron with GitHub Action sched...`
- `0813039` `feat(workspace): persist priority override and archive to workspace_i...`
- `00f5da7` `feat(auth): resolve org_id from auth context, remove hardcoded refere...`
- `d7d2c98` `feat(auth): re-enable authentication on gated pages, verify RLS`
- `735db22` / `367cc11` / `729899e` `feat(schema): migrate legacy intelligence content into item_* tables ...` and follow-ups
- `c7af704` `feat(sources): SourceProvenanceBadge component, mounted on ResourceCard`
- `e3e23dd` `feat(agent): rewrite system prompt to match new SKILL.md contract`
- `3edc20b` `chore(cleanup): drop legacy tables and retire 19 one-shot scripts per...`
- `840a572` `feat(b2): migration 018 — brief metadata columns on intelligence_items`
- `8ea651d` `feat(agent): emit and parse 8 metadata fields per regeneration (SKILL...`
- `8f3c89f` `feat(b2): pre-B.2 tasks — dynamic pool, URL health, section validator...`
- `76d52c` `feat(agent): topic_tags emission and population during regeneration`
- `98e4dea` `feat(admin): canonical source review UI with bulk approve and AI-reco...`
- `b0e6d2c` / `3c5ffd4` / `99e5b3f` Browserless fixes
- `2fecb79` `feat(b25): intersection-readiness contract — schema, skill, system pr...`
- `a6691ec` `feat(intersections): detection RPC + admin API + dashboard view; cap ...`
- `ff52fbd` `feat(b25): full B.2 regeneration runner with checkpoint/resume`
- 13 `docs(cleanup): fix contradiction N` commits
- `d918b3e` / `c9f076d` admin/scan drift fixes (cooldown migration 024)
- `3507ca8` `feat(migration 025): sector activation interest columns on workspace_...`
- `97ac7b6` / `8be79da` / `db5fa4b` SectorSelector + onboarding plumbing
- `65f42f2` `merge cleanup/post-b2: 27 commits`
- `7ddfa0f` `feat(privacy): add /privacy page for LinkedIn API submission` (last commit before merge)

### What the PR aimed to do (from the PR body)

Direct quotes from the body:

> Single-PR migration to the April 2026 editorial design (per `design_handoff_2026-04/`). Tokens + shared shell + every page rebuilt against the corrected previews + `is_platform_admin` column + 40-sector taxonomy migration + cleanup.

In-scope per the PR body:

1. Tokens (shell.css palette, fonts, radii, shadows) wired to global stylesheet
2. Shared shell — sidebar, masthead with navy->red gradient, StatStrip, AI prompt bar, badges, buttons
3. Every page rebuilt against corrected previews
4. `users.is_platform_admin` column on `public.profiles` mirror
5. 40-sector taxonomy migration
6. Cleanup

Explicitly out-of-scope, deferred to separate PRs:

- Bulk-export builder modal
- Timeline view on regulations
- Bulk-select + sticky action bar
- Disputes / priority override / archive flow on regulation detail
- Community behaviors: command-K search wiring, promote-to-public modal logic, onboarding state-machine persistence (Community shipped visual-only)

The body also carried this banner, which is the surprising part:

> ## WARNING — BLOCKER — DO NOT MERGE UNTIL RESOLVED
> **Confirm Vercel prod deploy target before merge.** I cannot determine from `vercel.json` alone whether merging to `master` triggers a production deploy or only a preview. Resolve this in our thread before merging — not as a passive flag in this PR body.
> ## Status
> In progress — pushing incrementally. This is the foundation commit; per-screen rebuilds and migrations land in subsequent commits on this same branch.

The PR was merged on 2026-05-01 despite this banner.

## Master-since-open analysis

Because the PR is merged, "since open" is a bit of a misnomer — the right frame is **since merge** (`0d7013c..master`, 371 commits). For each major slice of PR #5's work, here's what master has done since:

### Absorbed (still present, evolved, or intentionally retired)

| PR #5 file / area | Status on master | Evidence |
|---|---|---|
| `fsi-app/src/components/shell/PageMasthead.tsx` | **Still on master** (introduced by PR #5 commit `2d2005b`, last touched by `ef634da fix(mobile): H3.1 — clear hamburger overlap on mobile masthead`) | `git ls-tree master` |
| `fsi-app/src/components/shell/StatStrip.tsx` | **Still on master** (last touched `af2a69f fix(ui): StatStrip tiles fit single row on mobile (#106)`) | `git log 0d7013c6..master -- fsi-app/src/components/shell/` |
| `fsi-app/src/components/shell/SectionHeader.tsx` | **Still on master** | `git ls-tree master` |
| `fsi-app/src/app/theme.css` | **Still on master** (no commits since merge under this exact path; design tokens carried forward) | `git log 0d7013c6..master -- fsi-app/src/app/theme.css` |
| `fsi-app/src/components/AppShell.tsx` + `Sidebar.tsx` | **Evolved** (subsequent IA refactors `3f5d735 ui: IA refactor (#35)`, `6b1ebb7 feat(shell): move Community into intelligence-pages nav block`, `93af8cc feat(multi-tenant): B. invitations infrastructure (#115)`) | `git log 0d7013c6..master -- fsi-app/src/components/AppShell.tsx fsi-app/src/components/Sidebar.tsx` |
| `fsi-app/src/components/admin/AdminDashboard.tsx` | **Evolved heavily** (8 follow-on commits incl. `af0a4a4 feat(auth): requirePlatformAdmin helper + /admin route gate fix; closes OBS-17`, `4a67c7d feat(multi-tenant): consolidate user_profiles into profiles (#114)`, `de40816 feat(ingestion): wave 1a foundation (#83)`) | `git log 0d7013c6..master -- fsi-app/src/app/admin/page.tsx` |
| Migrations 009 - 025 | **All still present on master** (verified by `ls-tree`; migrations 026 - 106 layered on top) | `git ls-tree master -- fsi-app/supabase/migrations/` |
| `.github/workflows/source-monitoring.yml`, `trust-recompute.yml` | **Still on master** (later joined by `discipline.yml`, `spot-check-monthly.yml`) | `git ls-tree master -- .github/workflows/` |
| `fsi-app/src/components/home/DashboardHero.tsx`, `WeeklyBriefing.tsx` | **Still on master, heavily evolved** (`ce9a984 feat(dashboard): wire DashboardHero critical helper to workspace snapshot`, `ffc3537 feat(dashboard): mount Q9 credibility chips on WeeklyBriefing items`, `d03e69a ui: Dashboard editorial blocks rebuild (#57)`) | `git log 0d7013c6..master -- fsi-app/src/components/home/` |
| `fsi-app/src/components/sources/*` (B2ProgressBanner, CanonicalSourceReview, IntersectionDetectionView, SourceProvenanceBadge, SourceHealthDashboard, etc.) | **All still on master**, several extended by Phase 7 + Q-series work (`a282fc0 Build 8.5: wire /research source coverage matrix to real RPC`, `31d3730 feat(admin): Phase 7 tier-opinion disagreement review surface`, `4abe2c8 feat(admin): Phase 7 tier-override UI in SourceAdminControls`) | `git ls-tree master -- fsi-app/src/components/sources/` |
| `fsi-app/src/lib/agent/parse-output.ts`, `section-validator.ts`, `source-pool.ts`, `system-prompt.ts` | **Still on master** (later extended by `ae2c9a2 fix(agent/run): recover swallowed sources lookup error (#80)`) | `git ls-tree master -- fsi-app/src/lib/agent/` |
| `fsi-app/src/lib/sources/browserless.ts`, `trust.ts` | **Still on master** | `git ls-tree master -- fsi-app/src/lib/sources/` |
| `fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md` | **Still on master, evolved** (`383974e 3-axis skill audit remediation (P0-P5)`) | `git log 0d7013c6..master -- fsi-app/.claude/skills/environmental-policy-and-innovation/SKILL.md` |
| `fsi-app/.claude/CLAUDE.md` | **Still on master, evolved** (`617587b docs(claude.md): add reuse-before-construction principle`) | `git log 0d7013c6..master -- fsi-app/.claude/CLAUDE.md` |

### Intentionally removed (post-merge cleanup, not a regression)

| File | Removed by | Reason (per commit) |
|---|---|---|
| `fsi-app/src/components/Dashboard.tsx` (PR #5 included a heavy edit; total file 845 lines at deletion) | `fa9370d chore(cleanup): delete orphan Dashboard.tsx and RegulationsPage/ResearchPage/MapPage (#16)` (2026-05-03) | "After all 7 intelligence surfaces landed as standalone per-route page components (PRs #12, #13, #14, #15), the Dashboard.tsx monolith and three pages/* delegators are no longer imported anywhere in src/. Deleting per Rule 11 (deprecation = deletion). Verified zero callsites with grep before deletion." |
| `fsi-app/src/components/pages/RegulationsPage.tsx` | `fa9370d` (same) | Same as above — orphan delegator |
| `fsi-app/src/components/pages/MapPage.tsx`, `ResearchPage.tsx` | `fa9370d` (same) | Same as above |

This is **not a conflict** — master shipped PR #5's Dashboard.tsx and RegulationsPage.tsx, then a deliberate later cleanup retired them in favor of per-route components.

### Conflicting

None observed. The 371 post-merge commits build on top of PR #5's foundation rather than reverting it. There are no commits in `0d7013c..master` titled "revert", "rollback PR #5", or similar.

### Orthogonal

Most of the 371 post-merge commits are orthogonal — new builds (Builds 1 - 11), new sprints (sprint-1, sprint-2, sprint-3), new admin surfaces (integrity flags, jurisdiction normalization, bias tags, tier opinions), new migrations (026 - 106), new design rebuild waves (Sequence C, Phase 4, Phase 5, H1 - H6). They touch some of the same files PR #5 touched but are net additions, not contests.

## Recommendation

**close (acknowledge: already closed)** — PR #5 is in state `MERGED` and the work is integrated. No operator action is required on the PR itself.

### Reasoning

- The PR's GitHub state is `MERGED`. Merge commit `0d7013c` is on master.
- All major artifacts created by the PR (shell primitives, migrations 009 - 025, GitHub Action workflows, source-intake admin UI, agent system prompt rewrite, SKILL.md update) are still present on master 24 days later.
- A small handful of files PR #5 modified (`Dashboard.tsx`, `pages/RegulationsPage.tsx`, etc.) were retired by `fa9370d` in PR #16, but that was an intentional per-route refactor, not a regression of PR #5's work.
- The PR body's `DO NOT MERGE` banner is moot — the merge already happened on 2026-05-01.

### Caveats and uncertainty

- **Uncertain:** Whether the operator (Jason) believes the merge resolved the original BLOCKER (Vercel prod deploy target confirmation). The PR body asked for that to be resolved "in our thread, not as a passive flag." I cannot tell from git history alone whether that conversation occurred — only that the merge was performed by Dwarves77 (the same account that authored the PR). If the BLOCKER was not externally resolved, that is a process observation, not a code action.
- **Uncertain:** Whether the deferred out-of-scope items (bulk-export builder modal, timeline view on regulations, bulk-select + sticky action bar, disputes / priority override / archive on regulation detail, command-K search wiring, promote-to-public modal logic, onboarding state-machine persistence) have been picked up by later PRs. I see signals that some have (`93af8cc feat(multi-tenant): B. invitations infrastructure + onboarding state machine (#115)` covers the onboarding state machine; multiple admin surface PRs cover review queues), but I have not traced every deferred item to closure. Recommend cross-checking against `STATUS.md` or the active sprint followups doc if the operator wants assurance.
- **Uncertain:** I did not inspect PR review comments, requested changes, or whether the merge was a "squash and merge", "rebase and merge", or a real merge commit. The merge commit message is the default GitHub `Merge pull request #5 from ...` form, which suggests a true merge (not squash); 95 commits worth of history should be preserved on master from the branch tip. If the operator cares about whether intermediate commit history is preserved or squashed, that needs a separate check.

## Risks of each option

Since the PR is already merged, only one option is operationally relevant. Listed for completeness:

- **close (already closed):** Risk: low. There is nothing to do. Risk would be if the operator believed the PR was still open and was about to take action on the branch `redesign/full-migration`. The branch is presumably stale but harmless.
- **rebase-then-merge:** N/A. Cannot rebase-then-merge an already-merged PR. Attempting would create a destructive force-push scenario; do not attempt.
- **absorb-into-master:** N/A. Already absorbed.
- **keep-open:** N/A. The PR is `MERGED`, not `OPEN`.
- **Revert PR #5:** Not recommended. Would unwind 371 commits' worth of work that builds on PR #5's foundation (shell primitives, migrations 009 - 025, agent rewrite). The only sane "undo" path is the cleanup already performed by `fa9370d` for the specific orphaned components.

## Files NOT to lose

Recommendation is to acknowledge the merge, so nothing needs to be "carried forward." However, if the operator is concerned about the **deferred out-of-scope items** from the PR body and wants assurance they were not silently dropped, this is the checklist to cross-reference against current master / open PRs:

| Deferred item (from PR #5 body) | Suggested check |
|---|---|
| Bulk-export builder modal | Search master for `BulkExport`, `export builder`, `ExportModal` — `fsi-app/src/stores/exportStore.ts` exists on master; verify whether the modal is wired |
| Timeline view on regulations | Search for `TimelineBar` — present at `fsi-app/src/components/resource/TimelineBar.tsx` on master |
| Bulk-select + sticky action bar | Check `BulkImportView.tsx` on master and any sticky-bar primitives |
| Disputes / priority override / archive on regulation detail | `priority override` is partly addressed by Q5 tier_override (migration 093) + `feat(admin): Phase 7 tier-override UI in SourceAdminControls`. Verify whether the regulation-detail flow itself was completed |
| Command-K search wiring | Search master for `cmdk`, `command-k`, `CommandPalette` |
| Promote-to-public modal logic | Check `041_post_promotions.sql` and any `PromoteToPublicModal` component |
| Onboarding state-machine persistence | Covered by `93af8cc feat(multi-tenant): B. invitations infrastructure + onboarding state machine (#115)` — verify completeness |

None of these require action on PR #5 itself — they are independent followups whose status should be tracked in `STATUS.md` / sprint followups, not in PR #5's reconciliation.
