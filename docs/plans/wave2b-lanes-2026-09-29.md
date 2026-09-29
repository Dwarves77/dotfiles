# Wave 2 lanes, 2026-09-29: write sets, decisions answered, migration numbers

Executes the "Wave 2" table of [wave-plan-2026-09-28.md](./wave-plan-2026-09-28.md). Every lane brief carries that plan's run rules 1-12 and this file is the write-set contract for the wave (lane common contract "Where you work"). The 2026-09-02 wave-2 file is a different, earlier wave; this one is suffixed "2b" for that reason.

Status tokens per rule 14. Everything in "Facts checked" was read from origin/master at 70d87352 or by SELECT on 2026-09-29.

## Facts checked (so lanes do not re-derive them)

- `[CONFIRMED]` live tables: `propagation_events`, `derivation_edges`, `derived_values`, `source_bias_tags`, `community_group_members` (cols group_id, user_id, role, joined_at, starred, muted), `region_dimension_coverage`, `workspace_settings` (has a `profile` jsonb column and `sector_profile`), `profiles`, `organizations`, `harness_runs`. NOT live: `signposts`, `organisations`, `recommended_actions` (334 pending).
- `[CONFIRMED]` `source_bias_tags.assignment_source` CHECK tokens: `haiku_auto_high_confidence`, `haiku_proposed_low_confidence`, `operator_confirmed`, `operator_set`. Dimensions funding/methodology/stakeholder with fixed tag lists (migration 092).
- `[CONFIRMED]` no `community_*` table has an anonymity or identity-display column today.
- `[CONFIRMED]` the platform-intent SKILL.md already carries the ADR-034 wording (description line and "Architectural intent"); ADR-034's skill amendment is done.
- `[CONFIRMED]` UI-1 (Operations matrix reader gap) is REFUTED in the audit register: `fetchOperationsCoverage` selects all 11 envelope columns (supabase-server.ts ~3376). PROGRAM-BOARD row ~122 and build-plan WS4 still say OPEN: doc conflict, W2-H closes it.
- `[CONFIRMED]` nav label "Market" at `src/components/Sidebar.tsx:76` and RailStat label "Market" at `src/components/dashboard/DashboardBrief.tsx:361`; `MarketSignalDetailSurface.tsx:345` passes `surface="Market"`.
- Production URL: https://carosledge.com (read-only browsing with Playwright is allowed; no writes).

## Migration numbers (rule 9; coordinator applies, lane sends SQL first)

| Number | Lane | Purpose |
|---|---|---|
| 334 | structured-actions (wave 1) | `recommended_actions`, reserved |
| 336 | W2-B | Community anonymity opt-in columns (per-post, per-user) |
| 337 | W2-E | profile role and organisation-size fields, only if `workspace_settings.profile` jsonb cannot carry them (lane checks first; jsonb keys need no DDL) |
| 338 | W2-G | `inference_records` (ADR-036) |
| 339 | W2-G | `signposts` per spec 00 section 1.2 DDL, only if the M lane reaches the prediction object |
| 340+ | free | |

## Coordinator rulings made for this wave (standards-derived; ADR-036 records the learning-loop ones)

1. ADR-035 floor lives in ONE helper, `fsi-app/src/lib/aggregate/anonymity-floor.mjs` (`meetsFloor({orgCount, maxShare})` → ≥10 and ≤0.25), built and tested by W2-B (its first commit) and imported by every aggregate reader. W2-E does not build an aggregate view: ADR-034 says the "on behalf of many" mechanism is undesigned; W2-E ships profile dimensions and applicability only.
2. Absence wording rule (2026-09-25 close): "a value that exists is shown; one that cannot exist yet names the data it needs". W2-C owns the shared part (`StateNote` or its successor) and every non-market surface; market files belong to W2-D and W2-F.
3. Learning loop forks (ADR-036): question generation is $0-only; `inference_records` is a separate table; reliability reweights are ratification-gated. W2-G builds S then M; L waits.
4. The `community_group_members.muted/starred` WIRE item moves from W2-A to W2-B (community write set). The "Peer Insights / case study" WIRE item is void: those tables were dropped by migration 335.

## Write sets (one writer per file; a file outside your set is a stop-and-report, never an edit)

| Lane | Branch / worktree | Write set | Excluded |
|---|---|---|---|
| W2-A | `lane/w2a-wire-items` `.claude/worktrees/w2a-wire-items` | `src/app/api/admin/sources/recommend-classification/**`, new `src/lib/sources/bias-tag-pipeline.mjs` (+test), admin coverage-gap surface for `region_dimension_coverage.notes` (`src/components/admin/**` coverage files), `docs/ops/session-log.d/2026-09-29-w2a.md` | community anything |
| W2-B | `lane/w2b-community-identity` `.claude/worktrees/w2b-community-identity` | `src/app/community/**`, `src/app/api/community/**`, `src/components/community/**`, `src/lib/community/**`, new `src/lib/aggregate/anonymity-floor.mjs` (+test), migration 336 SQL (sent to coordinator, then committed), session-log.d note | nav, dashboard, market |
| W2-C | `lane/w2c-absence-wording` `.claude/worktrees/w2c-absence-wording` | `src/components/Sidebar.tsx` (label), `src/components/dashboard/**`, `src/components/shared/**`, `src/components/regulations/**`, `src/components/research/**`, `src/components/operations/**` (absence wording only), session-log.d note | `src/components/market/**`, `src/app/market/**`, community, operations calculator page |
| W2-D | `lane/w2d-market-detail-dump` `.claude/worktrees/w2d-market-detail-dump` | `src/app/market/[slug]/**`, `src/components/pages/MarketSignalDetailSurface.tsx` (incl. `surface="Market Intel"`), `src/lib/market/**` detail readers, one Playwright spec under `fsi-app/tests/` or existing e2e dir, session-log.d note | `src/app/market/page.tsx`, `src/components/market/**` |
| W2-E | `lane/w2e-profile-applicability` `.claude/worktrees/w2e-profile-applicability` | `src/lib/profile/**` (new), `src/lib/applicability/**` (new or existing applicability module found by grep), profile settings route/page under `src/app/settings/**` or where `workspace_settings.profile` is edited today, migration 337 SQL only if needed, session-log.d note | community, aggregate views |
| W2-F | `lane/w2f-generalise-examples` `.claude/worktrees/w2f-generalise-examples` | `src/lib/classification/**`, `src/app/market/page.tsx`, `src/components/market/**` (not the detail surface), `src/app/operations/calculator/**`, SAF benchmark template files ONLY if outside W2-B's set (else stop and report), one coverage test per class, session-log.d note | `MarketSignalDetailSurface.tsx`, community |
| W2-G | `lane/w2g-learning-loop` `.claude/worktrees/w2g-learning-loop` | new `src/lib/learning/**`, `scripts/turns/run-population-flywheel.mjs` (one added step), `src/lib/connections/flag-namespaces.mjs` (`question:` namespace), `src/lib/propagation/drain.ts` METHODS registration, `src/lib/sources/seek-more.mjs` generalisation, migration 338 (339) SQL, `docs/decisions/ADR-036-*.md` is the coordinator's, session-log.d note | surfaces |
| W2-H | `lane/w2h-naming-and-ops-confirm` `.claude/worktrees/w2h-naming-and-ops-confirm` | `docs/PROGRAM-BOARD.md` (WS4 row only), `docs/plans/build-plan-2026-09-25.md` (WS4 row only), marketing/auth copy files with forwarder-only wording that are in no other lane's set, session-log.d note | every file in another lane's set (report them instead) |

Generated files (`coverage-report.json`, migrations inventory, INDEX.md lines): whichever lane merges second rebases; coordinator sequences.

## Pre-push sequencing (rule 10)

Lanes iterate on touched tests, then STOP and report "ready for pre-push" with the size estimate. The coordinator releases one lane at a time to run the full pre-push and push once.
