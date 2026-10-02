# Remediation plan, 2026-09-30

**Operator approval, 2026-10-01, verbatim (recorded here as the approval this plan's header line had
asked for):** "You have built the plan and I trust you to make the best decision for all of these issues.
If items are from decisions made a long time ago and superseded by newer items are out of scope. Remove
them. I want all of these it's fixed. Not worked around. Resolved completely." This plan is approved for
execution under that delegation. The "Decisions 2026-10-01" section immediately below records the
specific dispositions the coordinator made under this delegation for every item that previously said
"needs an operator ruling"; those blocks are removed from the affected lanes accordingly. Every lane in
this plan is a proposal, class over instance per the remediation-discipline skill: one lane closes every
instance of a finding class, not one lane per finding id. Ordering follows R14 (data machine and
integrity first, gates second, surfaces third, docs last). Sizes are S (under a day), M (a day to a few
days), L (a dedicated multi-day lane). Model is the lane's own judgment call: Sonnet where a fix needs
reading code/design intent, Haiku where the fix is mechanical (a known-shape edit repeated across files, a
header correction, a status-table transcription).

## Decisions 2026-10-01 (coordinator, under that delegation)

1. **The 33 chained-apply rows (Lane 1).** Guarded hard delete, not an archive step: run the already-built
   `#829` script's `--apply` mode, which routes through `guardedDelete` (snapshots the prior row state
   before deleting, per rule-015 discipline), then `--verify`. "Fixed, not worked around" rules out leaving
   the rows in an archived/quarantined state; they are deleted outright with a reversible snapshot as the
   safety net, matching every other guarded write in this codebase.
2. **`inference_records` (Lane 5).** KEEP. It is migration 338 on `lane/w2g-learning-loop` (ADR-036's own
   write set); once that lane merges, the table traces to a real migration and `F24-db-object-migration-
   home` sees it. The DROP SQL this plan staged for it is withdrawn; no DROP SQL for this table runs.
3. **`/api/admin/promotion-policy` (Lane 12).** DELETE: the route, the `promotion_policy` table, and its
   migration, via a new drop migration. Superseded by the operator-priced spend model (RD-31/RD-32); the
   promotion-engine-gating mechanism this route was built for is out of scope under this ruling's
   "superseded by newer items" clause, not a mechanism to finish wiring.
4. **`DashboardTopPriority.tsx` (Lane 13).** DELETE. The dashboard was ruled "stays as-is" 2026-05-24; a
   component built for a dashboard redesign that was itself superseded by that ruling is out of scope, not
   a wire-it candidate.
5. **Design conflicts (Lane 19, DES-3).** The 2026-09-18 parts brief supersedes the 2026-09-07 and
   2026-09-09 rulings it conflicts with. Specifically: the rule below S-section titles stands (the parts
   brief's own instruction governs); the CommandBar Search\|Ask toggle is removed, and `GET /api/search`
   stays reachable from the single remaining CommandBar input (no capability is dropped, only the toggle
   UI). Recorded in `docs/decisions/ADR-037-parts-brief-supersedes-earlier-ui-rulings.md`, citing all three
   dated sources.
6. **WatchButton "Unwatch" text (folded into Lane 19).** BUILD. Operator ruling 3.5's second half is
   implemented, not deferred: a watched row's hover/menu state reads "Unwatch", never "Watch".
7. **Superseded docs (Lane 16, Lane 18).** Archived, not repaired: `docs/sprint-1/`, `docs/sprint-2/`, and
   `docs/design/redesign/` move to `docs/archive/` with a historical-record header, per the operator's
   "superseded by newer items are out of scope, remove them" instruction. The 88 fossil links inside them
   are not individually fixed; they die with the archived files, matching the loading rule that
   `docs/archive/` is not indexed and not loaded. The three stale `docs/ops/` followups (rendering-guard,
   multi-tenant Phase 3, DEF-1 dwell) and the `CODE-5a-register.md` findings each get a closure note citing
   this ruling, rather than a re-verification chase.
8. **New Lane 22: GitHub Actions artifact retention.** 7-day retention and uploads reduced to the run
   summary only, across all 13 workflows that currently upload a fuller artifact. Measured 2026-10-01: 6.2
   GB of live artifacts; the coordinator has already deleted 290 of them directly.

Source register: `docs/audits/audit-consolidated-2026-09-30.md` (OUTPUT 1 of this same consolidation).
Every lane below cites the `CF-*` finding ids it closes.

**Amended 2026-09-30 (same day, coordinator message):** `audit/a8d-docs` (PR #856) landed after this
plan's first commit. Its PROGRAM-BOARD reconstruction (38 merged PRs, #800-#837, each with a proposed
row built from `git log` commit subjects) is folded into Lane 15's Haiku batch below. Its 5 design-doc
findings and 1 census/tech-debt finding are new Lane 19. A6b will be folded in as a second commit when it
lands.

**Amended 2026-09-30 (second correction, coordinator message):** CF-PROC-2 (the instruction-integrity
finding) is refuted; the two messages lane A5 received were genuinely from the coordinator, no injection
occurred. This plan never carried a lane for CF-PROC-2 (it was process, not a code/doc fix), so no lane
above is withdrawn. CF-BROKEN-6 (Market detail raw-dump) is now `[CONFIRMED]` with a built, attack-proven
fix on branch `lane/w2d-market-detail-dump`, not a `[HYPOTHESIS]` awaiting reproduction; no lane in this
plan proposed fixing it (it was already scoped to W2-D as a build-plan workstream, outside this
consolidation's remediation lanes), so this plan is otherwise unchanged by that correction.

**Amended 2026-09-30 (fourth amendment, coordinator message):** Five completion registers (A1c PR #859,
A2bc PR #860, A4d PR #858, A4bc PR #862, A4cc PR #861) folded into the audit register add 2 new confirmed
findings this plan now carries: new Lane 20 (5 unguarded producer scripts, CF-BROKEN-9) and new Lane 21
(PostgREST `.or()` injection, CF-SEC-15). Lane 13 is extended to also fix the timeline-dot ring instance
of CF-BROKEN-2 (A2bc's finding, live on customer-facing surfaces). Lane 11 is revised: CF-GATE-3
(EXIT0-1) is dropped, A4bc's completion pass found zero swallowed-error exits across all 87
`scripts/verify/**` files, no fix needed; CF-GATE-4 (CLI-TEST-1) is narrowed to the 2 files A4bc confirmed
still lack subprocess-level CLI coverage (`run-mint-batch.mjs` already has it).

## Lane ordering (R14)

1. Data machine and integrity (Lanes 1-6)
2. Gates (Lanes 7-11)
3. Surfaces (Lanes 12-14)
4. Docs (Lanes 15-18)
5. Non-code items requiring operator approval (section below)

---

## 1. Land the chained-apply reversal

- **Closes:** CF-BROKEN-7 (P0, open).
- **Decision (2026-10-01):** guarded hard delete, not an archive. Run the `#829` script's `--apply` mode
  (routes every delete through `guardedDelete`, which snapshots the prior row state first, per rule-015),
  then `--verify`.
- **Write set:** the already-built reversal script from #829. Disjoint from every other lane (touches only
  the 33+33+32+51 marked rows from run `36568656803`).
- **Files:** the script named in `docs/ops/session-log.d/2026-09-29-reverse-chained-apply.md`.
- **Acceptance test:** a live SELECT confirms zero rows carrying that run's marker across
  `intelligence_items`, `staged_updates`, `agent_run_searches`, `integrity_flags`. The `harness_runs` row
  for the reversal itself is the proof artifact (rule 15, execution over existence); `guardedDelete`'s own
  prior-value snapshot is the reversibility record, not an archived/quarantined copy of the rows
  themselves.
- **Size:** S (mechanism already built and tested; this is running it under approval).
- **Model:** Haiku (mechanical execution of an already-reviewed script) with Sonnet sign-off on the
  pre-flight dry-run output before `--apply` is authorized.
- **Ordering:** first. Zero build risk, blocks every count-based audit downstream from reading a
  quarantined-but-present row as real (A7's own recommendation 1 makes the same case).

## 2. Fix the anti-fabrication moat no-op

- **Closes:** CF-BROKEN-1 (P1, `lib/sources/officialness.mjs` `splitBlocks()`).
- **Write set:** `fsi-app/src/lib/sources/officialness.mjs`, `officialness.test.mjs`.
- **Acceptance test:** `splitBlocks()` inserts a delimiter before the closing-tag replace (or splits on
  block-opening tags) so STEP 2's link/text-density drop can fire on multi-character content; a new
  regression fixture (an un-wrapped, non-keyword-classed link list, e.g. class `"quick-links"`) is added
  alongside the existing RED-1/RED-2/GREEN cases and asserts the drop now fires. `node --test
  officialness.test.mjs` green.
- **Size:** S for the fix, M once the new fixture is added (recommended in the same change, per A3b's own
  finding).
- **Model:** Sonnet (anti-fabrication logic, judgment on the correct delimiter choice).
- **Ordering:** second. This is the corpus's own anti-fabrication moat; a live gap here outranks every
  surface-visible bug.

## 3. Guarded upsert for `estimated_values` and `portal_link_candidates`

- **Closes:** the rule-015 (guarded-write) bypass findings from A4/A4b/A4c on
  `scripts/propagation/seed-derived-values.mjs` and `scripts/turns/run-source-sweep.mjs` (not separately
  id'd in the consolidated register's class tables since both lanes independently found the same root
  cause: `scripts/lib/db.mjs` has no `guardedUpsert`).
- **Write set:** `scripts/lib/db.mjs` (add `guardedUpsert(table, row, {onConflict, cite, select,
  stampIso})`, mirroring `guardedInsert`), then migrate the two call sites.
- **Files:** `fsi-app/scripts/lib/db.mjs`, `fsi-app/scripts/propagation/seed-derived-values.mjs:286-308`,
  `fsi-app/scripts/turns/run-source-sweep.mjs:357-368`.
- **Acceptance test:** both call sites route through `guardedUpsert`; a snapshot-before-mutate row exists
  in `_snapshots/` (or its replacement location, see Lane 16) for both tables after a dry-then-apply test
  run; `node --test` on the touched files' siblings green.
- **Size:** S-M.
- **Model:** Sonnet (touches the write-guard chokepoint; class fix, not a one-off).
- **Ordering:** third. `estimated_values` feeds customer-visible NPV figures (automate-vs-hire); this is
  data-machine-critical.

## 4. Migration header truth pass, plus a standing check

- **Closes:** CF-DATA-1 (4 confirmed instances: migrations 331, 335, 277, 261), CF-DATA-2 (7 unconfirmed:
  146-150, 240, 260, needs verification first).
- **Write set:** the 4 confirmed migration files (header text only, no DDL change), plus a new fitness
  function.
- **Files:** `fsi-app/supabase/migrations/331_harness_runs.sql`,
  `335_drop_placeholder_community_layer.sql`, `277_corpus_turn_requests.sql`,
  `261_drop_dead_notification_v1.sql` (header comment edits); new
  `.discipline/fitness/functions/F-migration-applied-status.mjs`.
- **Acceptance test:** each header now reads APPLIED with a date, mirroring migration 330's pattern
  (already correct). The new fitness function compares every migration's self-declared
  APPLIED/NOT-APPLIED/DRAFT header text against `information_schema`/`pg_proc`/row-count reality via the
  coordinator's periodic live-schema export, and fails on a mismatch; it self-skips (exit 2) without DB
  creds per rule 15. Run once against the 7 CF-DATA-2 migrations to resolve their status before writing
  their headers.
- **Size:** S for the 4 header edits; M for the fitness function.
- **Model:** Haiku for the header text edits (mechanical, exact replacement text already drafted by A5/A5c
  in the source registers); Sonnet for the fitness function (needs to reason about `information_schema`
  shapes for tables, columns, and functions uniformly).
- **Ordering:** fourth. This is the single highest-leverage data-integrity fix in the register by
  recurrence count (4 confirmed instances across two independent lanes, a fifth-plus likely in the
  unconfirmed 7).

## 5. Refresh `db-catalog.json` and disposition `inference_records`

- **Closes:** CF-DATA-3 (stale catalog), CF-DEAD-12 (`inference_records`), CF-DATA-4
  (`sources.reliability_score` dead column).
- **Decision (2026-10-01):** `inference_records` is KEEP. It is migration 338 on
  `lane/w2g-learning-loop` (ADR-036's write set); no DROP and no retroactive migration from this lane,
  `F24-db-object-migration-home` resolves on its own once that lane merges.
- **Write set:** `.discipline/governance/db-catalog.json` (regenerate via the existing
  `db-catalog-refresh.sql`, read-only); one DROP migration for `sources.reliability_score`.
- **Acceptance test:** `db-catalog.json` shows 117+ tables matching the coordinator's live-schema export;
  `sources.reliability_score` no longer exists in `information_schema.columns`; `inference_records`
  requires no action from this lane, verified clean once `lane/w2g-learning-loop` merges (tracked by that
  lane, not this one).
- **Size:** S for the catalog refresh; S for the reliability_score drop (approved SQL below).
- **Model:** Haiku (catalog refresh is a script run; the DROP migration is template-shaped).
- **Ordering:** fifth.

## 6. Class lint for the RLS/admin-gate shipping pattern

- **Closes:** CF-DATA-8 (A5c-6: 3 confirmed instances of a table shipping RLS-disabled-with-broad-grants
  or an `org_memberships`-gated admin check instead of `profiles.is_platform_admin`), and closes the
  traceability half of CF-SEC-14 and CF-DATA-12 (11+2 tables with no `ENABLE ROW LEVEL SECURITY`
  statement anywhere in the migration corpus, safe live but undocumented) by making the next instance
  impossible to ship silently.
- **Write set:** new `.discipline/governance/` check.
- **Files:** new `.discipline/fitness/functions/F-rls-admin-gate-class.mjs`.
- **Acceptance test:** flags any `CREATE TABLE` with no matching `ENABLE ROW LEVEL SECURITY` in the same
  migration file, and any RLS policy referencing `org_memberships` for what reads as an admin check rather
  than `profiles.is_platform_admin`. Negative-tested per rule 15 (a fixture migration that should fail,
  does).
- **Size:** M.
- **Model:** Sonnet.
- **Ordering:** sixth, closes the data-integrity block of lanes.

## 7. ESLint wired into CI and pre-push

- **Closes:** CF-SEC-10 (A6 D3, A10 A10-4).
- **Write set:** `.github/workflows/discipline.yml` (`fitness-check` job).
- **Files:** `.github/workflows/discipline.yml` (one new `run: cd fsi-app && npm run lint` step after the
  existing `npm ci`).
- **Acceptance test:** the step runs on the next PR and fails on a deliberately-introduced lint violation
  in a throwaway branch, then is reverted; on the real PR it passes clean (A9 already confirmed `npx eslint
  src --max-warnings=0` exits 0 today, so this lands green).
- **Size:** S.
- **Model:** Haiku (mechanical, no new install cost, exact YAML line already drafted by A6).
- **Ordering:** seventh, first of the gate lanes; unblocks the staleness audit on the 32 existing
  `eslint-disable` comments (CF-DATA/A6 D5) as a natural follow-up, not separately lane'd here since it is
  instance-review, not a class fix.

## 8. Bracket-path test guard

- **Closes:** CF-SEC-11 (Node `--test` silently drops `[param]/`-path tests).
- **Write set:** new fitness function.
- **Files:** new `.discipline/fitness/functions/F62-no-bracket-path-tests.mjs`.
- **Acceptance test:** fails the build if any tracked `*.test.mjs`/`*.npmtest.mjs`/`*.selftest.mjs` path
  contains a `[`/`]` segment. Negative-tested (a fixture path under a `[param]/` dir fails the check).
  Separately, file (or link) the Node-level root-cause ticket so a future fix upstream is tracked, but that
  ticket is not this lane's deliverable.
- **Size:** S.
- **Model:** Sonnet (needs to reason about the manifest/glob shape correctly; still small).
- **Ordering:** eighth. Mechanical, cheap, closes the class regardless of whether Node itself is ever
  fixed.

## 9. Promote the consistency-backstop job to a required check

- **Closes:** CF-SEC-12 (A6 D1).
- **Write set:** branch protection config (via `gh api`), no code.
- **Acceptance test:** 3 consecutive green runs of the "Consistency layer (C3/C4/C5 reality)" job are
  observed (mirroring the rendering-guard promotion protocol already documented in the same workflow
  file), then `gh api --method PUT
  repos/Dwarves77/dotfiles/branches/master/protection/required_status_checks` adds it to the `contexts`
  array.
- **Size:** S once the 3 green runs exist.
- **Model:** Haiku (mechanical API call once the precondition is met).
- **Ordering:** ninth. No code change; sequenced here because it is a gate-class fix, not because it is
  hard.

## 10. Rule-14 backlog relabel and hard gate

- **Closes:** CF-GATE-1 (609 of 643 unlabeled finding lines across 123 pre-existing audit docs; this
  consolidation's own three new files are clean per the same checker, run and confirmed at write time).
- **Write set:** the 123 pre-2026-09-30 audit files (status-token insertion only, no content change) plus
  `.discipline/run-test-suite.sh` (flip `\|\| true` to a hard exit once the backlog is clear).
- **Acceptance test:** `node scripts/verify/audit-finding-status.mjs` reports 0 unlabeled across the full
  `docs/audits/` tree; `run-test-suite.sh`'s rule-14 step is no longer report-only.
- **Size:** M/L. Largely mechanical (a finding-shaped bullet line gets a `[HYPOTHESIS]` token by default,
  since none of these were re-verified live in this pass, per rule 14's own "label either way") but touches
  123 files and needs a human/Sonnet spot-check that the default label isn't hiding an already-obviously-
  confirmed or already-obviously-refuted line.
- **Model:** Haiku for the bulk mechanical labeling pass (append `[HYPOTHESIS]` to every unlabeled
  finding-shaped line, the checker's own regex defines "finding-shaped"), Sonnet for a sampled review pass
  before the hard-gate flip, since a wrongly-defaulted label is worse than the current report-only state.
- **Ordering:** tenth. Real work, not urgent relative to the data-integrity lanes above, but a
  prerequisite for treating any future audit's un-labeled line as a gate failure rather than a courtesy.

## 11. Clock-fragility standing check, and CLI-test coverage for the mint chokepoint

- **Closes:** CF-GATE-2 (A6 C3, one-time manual grep not a standing gate), CF-GATE-4 (A4b CLI-TEST-1,
  resolved per file by A4bc: `apply-mint-batch.mjs`/`validate-mint-payload.mjs` genuinely have no
  subprocess-level CLI test; `run-mint-batch.mjs` already does and needs no work), CF-GATE-7 (A6 C4/C5, 41
  self-skips and 16 DB-dependent tests not individually re-verified to fail loud). **Revised 2026-09-30**:
  CF-GATE-3 (EXIT0-1) is dropped from this lane's scope, A4bc's completion pass read all 87
  `scripts/verify/**` files in full and confirmed zero swallowed-error exits anywhere; no fix needed, no
  further reading required.
- **Write set:** new fitness function; 2 new subprocess-level test cases.
- **Files:** new `.discipline/fitness/functions/F-clock-fragility.mjs` (flags a test combining a live
  `new Date()`/`Date.now()` read with a string-equality date assertion); one new subprocess test each for
  `mint/apply-mint-batch.test.mjs` and `mint/validate-mint-payload.test.mjs`, following
  `mint/run-mint-batch.test.mjs`'s own `execFileSync` pattern (line 280) as the template, exercising a
  bad-argv or `--help` path.
- **Acceptance test:** the fitness function has a real (not over-fit) heuristic verified against
  `relative-time.npmtest.mjs` and `render-clock.npmtest.mjs` as known-good non-matches (A6's own sampled
  cases); both new subprocess tests exercise the CLI's own argv-parsing/exit-code layer, not only the
  exported pure functions.
- **Size:** M for the fitness function; S for the two subprocess tests (template already exists in the
  same directory).
- **Model:** Sonnet (heuristic design, judgment-heavy) for the fitness function; Haiku for the two
  subprocess tests (mechanical, template already proven).
- **Ordering:** eleventh, closes the gate-class lanes.

## 12. Delete `/api/admin/promotion-policy`

- **Closes:** CF-DEAD-1.
- **Decision (2026-10-01):** DELETE. Superseded by the operator-priced spend model (RD-31/RD-32); the
  promotion-engine mechanism this route was built to gate is out of scope under the operator's
  superseded-items ruling, not a consumer to go build.
- **Write set:** `src/app/api/admin/promotion-policy/route.ts`, the `promotion_policy` table, and a new
  DROP migration.
- **Acceptance test:** `grep -rn "promotion_policy" fsi-app/src fsi-app/scripts` returns zero hits outside
  the migration history; the route file is removed; a `docs/tech-debt-log.md` entry records the deletion
  and cites RD-31/RD-32 as the superseding model.
- **Size:** S.
- **Model:** Haiku (deletion is mechanical once the disposition is ruled; the DROP migration follows the
  same template as every other drop in this corpus).
- **Ordering:** twelfth, first surface-class lane (this is an admin control, adjacent to data-machine
  authorization, not a customer surface, but sequenced here since it is instance-scale, not class-scale).

## 13. Delete `DashboardTopPriority.tsx`; fix the invalid-CSS tint/ring class

- **Closes:** CF-DEAD-2, CF-BROKEN-2 (both the original 5-file admin-only instance and A2bc's
  customer-facing extension).
- **Decision (2026-10-01):** DELETE `DashboardTopPriority.tsx`. The dashboard was ruled "stays as-is"
  2026-05-24; a component built against a dashboard redesign that ruling superseded is out of scope, not
  a mount-it candidate.
- **Write set:** `src/components/home/DashboardTopPriority.tsx` (+ its 2 comment-only referrers) for the
  deletion; `src/components/sources/CanonicalSourceReview.tsx`, `ProvisionalReviewCard.tsx`,
  `IntersectionDetectionView.tsx`, `ThemesView.tsx`, `resource/IntelligenceMetadataStrip.tsx`,
  `src/components/ui/timeline-dot-styles.ts`, plus a new shared tint token/helper for the CSS fix.
- **Acceptance test:** `DashboardTopPriority.tsx` is deleted, its 2 comment-only referrers
  (`lib/dashboard/row-fields.ts`, `lib/item-links.ts`) cleaned up. The tint fix:
  `color-mix(in srgb, var(--color-X) N%, transparent)` (or 4 fixed `--color-*-tint` tokens matching the
  existing `--action-tint`/`--immediate-tint` pattern) replaces all 24 cited `sources/`-tree sites; a
  visual check on the admin Sources surface's 5 sub-tabs shows the tinted backgrounds now render.
  **Extended by A2bc's finding**: `timeline-dot-styles.ts`'s `nextDotStyle` gets a raw-hex (or
  `color-mix`-ready) field on `UrgencyBand` instead of string-appending an alpha suffix onto a CSS-var
  reference; both call sites (`Timeline.tsx:178`, `MilestoneTimeline.tsx:86` via `ListRow.tsx:685`)
  re-point to it; a visual check on any list row and any detail page's Timeline block with a "next"
  milestone shows the ring now renders.
- **Size:** S for the DashboardTopPriority deletion; S for the `sources/`-tree tint fix (one shared
  helper, 24 mechanical call-site edits); S for the timeline-dot ring fix (one shared function, 2 call
  sites).
- **Model:** Haiku for the deletion (mechanical, disposition already ruled) and both tint/ring mechanical
  replacements once the token/helper shape is chosen; Sonnet to choose that shape.
- **Ordering:** thirteenth. The timeline-dot half is higher-reach than the original 5-file instance (every
  customer-facing surface, not only an admin panel) and should land first within this lane if split.

## 14. Duplication class fixes

- **Closes:** CF-DUP-1 (markdown renderer duplication), CF-DUP-2 (classification editor duplication),
  CF-DUP-4 (`safeJson` duplication), CF-DUP-5 (`apply-tags`/`discover-for-items` duplication), and
  addresses CF-DUP-3 (SectionHeader/RailCard, pending a fresh diff since the prior audit's exact literal
  citations are stale, per A2's own note) as a re-verify-then-fix step.
- **Write set:** `src/components/resource/IntelligenceBrief.tsx` + `SectorSynopsis.tsx` (extract shared
  markdown-renderer subset); `src/components/sources/CanonicalSourceReview.tsx` +
  `ProvisionalReviewCard.tsx` (extract shared classification editor + vocab module);
  `src/components/community/GroupCard.tsx` + `GroupHeader.tsx` (extract `safeJson` into
  `community/api-client.ts`); `scripts/connections/apply-tags.mjs` + `discover-for-items.mjs` (extract
  `runDiscoveryForOneItem`); `src/components/ui/SectionHeader.tsx` + `SectionHeading.tsx` +
  `home/DashboardRailCard.tsx` + `list-surface/ListSurfaceRailCards.tsx` (re-diff first, then converge).
- **Acceptance test:** each pair's duplicated logic collapses to one shared module with both call sites
  importing it; `grep` for the duplicated function/array name returns exactly one non-test definition site
  per pair; existing tests for both call sites stay green.
- **Size:** M per pair (5 pairs).
- **Model:** Sonnet.
- **Ordering:** fourteenth, last of the surface-class lanes (quality, not correctness).

## 15. PROGRAM-BOARD resync

- **Closes:** CF-DOCS-1, CF-DOCS-3, CF-DOCS-8 (the stacked resume-pointer chain), CF-DOCS-10 (the 38-PR
  reconstruction gap).
- **Write set:** `docs/PROGRAM-BOARD.md` only (coordinator-owned file per the wave2b write-set contract;
  this lane is written to be run BY the coordinator or a coordinator-delegated Haiku batch, not a
  parallel lane).
- **Acceptance test:** the board's header collapses to one current resume pointer (the rest archived per
  the doc's own dated-archive convention); a new dated section summarizes every thread opened/closed in
  `docs/ops/session-log.md` between 2026-09-11 and today; the "Operations matrix shows values" row is
  flipped to CLOSED using the exact replacement text A8/A8b already staged
  (`docs/ops/session-log.d/2026-09-29-w2h.md:41-53`); the "Structured-action extraction" row is flipped to
  DONE/MERGED citing #832 (A8d's corrected-existing-rows finding); the 38-row PR skeleton A8d built from
  `git log` commit subjects (`#801` through `#837`, its own table gives the literal commit subject as a
  starting "Proposed row" for each) is expanded into the board's usual prose-section voice and landed as
  the body's 2026-09-25 through 2026-09-29 coverage, closing the append-only-body-stops-at-2026-09-11 gap;
  the 16-row Wave-2 sub-table is reconciled against this consolidation's own OUTPUT 3 build-overview table
  3.
- **Size:** L (revised up from M: A8d's own effort estimate for the 38-row expansion is L, "matching that
  voice and density for 40+ PRs is not a mechanical fill"; the judgment pass over session-log.md content
  remains a real cost on top of that).
- **Model:** Sonnet, coordinator-run, for the row-selection judgment and prose-voice expansion; the
  skeleton table itself (PR number, commit hash, one-line proposed row) is already Haiku-batchable
  transcription, since A8d built it from `git log` output alone.
- **Ordering:** fifteenth, first docs-class lane.

## 16. Mechanical docs corrections batch, and archive the superseded directories

- **Closes:** CF-DOCS-4 (2 live broken links; the 88 pre-redesign-fossil links are not individually
  fixed, they are archived away with their files per the decision below), CF-DOCS-7 (2 missing
  superseded banners), CF-DEAD-5/6 (gitignore additions for `_plans/`, `_diag/`, `tmp/`, `_snapshots/`),
  CF-DEAD-4 (`git rm -r --cached` for `_snapshots/`), CF-DOCS-11's DES-1 (redesign/ supersession, now
  moot, see below), CF-DOCS-12 (SPR-1/SPR-2).
- **Decision (2026-10-01):** superseded, not repaired. `docs/sprint-1/` (16 files), `docs/sprint-2/`
  (4 files), and `docs/design/redesign/` (the 11 `.dc.html` mocks, README, DEVIATION-LOG, HANDOFF prompt,
  support.js, per A8d's own archive-candidate list) move to `docs/archive/` with a historical-record
  header on each directory's own README (or a new one if none exists), matching `fsi-app/STATUS.md`'s
  existing header pattern. The 88 broken relative links inside the sprint-1/2 files are not fixed link by
  link; `docs/archive/` is explicitly not indexed and not loaded per CLAUDE.md's own table, so a broken
  link inside an archived file carries no live cost. This supersedes this lane's earlier plan (a
  historical-record header left in place, links unfixed) with the operator's own instruction: move the
  superseded material out, do not leave it standing with a note.
- **Write set:** `docs/ops/session-log.d/2026-09-25-supabase-audit-lane.md` (1 link),
  `docs/dispatches/lane-briefs/2026-09-18/brief-d2.md` (1 link), `docs/plans/finish-plan-2026-09-02.md` +
  `system-completion-plan-2026-09-02.md` (superseded banners, exact text already drafted by A8c),
  `docs/sprint-1/` -> `docs/archive/sprint-1/`, `docs/sprint-2/` -> `docs/archive/sprint-2/`,
  `docs/design/redesign/` -> `docs/archive/design/redesign-2026-07/` (A8d's own suggested archive path),
  `docs/audits/wave1b-stub-quality-investigation-2026-05-11.md` (historical-record header, stays in place,
  it is a standalone audit file, not part of either archived directory), `.gitignore`, then a separate
  `git rm -r --cached` PR for `_snapshots/`.
- **Acceptance test:** the link-checker script (used by A8/A8b) reports 0 broken links on the 2 live-doc
  links named above (`2026-09-25-supabase-audit-lane.md`, `brief-d2.md`); `docs/sprint-1/`,
  `docs/sprint-2/`, and `docs/design/redesign/` no longer exist at their old paths, `git mv` preserves
  history; each archived directory's own README states it is historical and names what superseded it
  (SPR-1/SPR-2: the wave/lane/T-thread model; DES-1: `handoff-2026-09-07/README.md`); `docs/INDEX.md`'s
  entries for the moved paths are updated or removed per the archive-is-not-indexed convention; the 2
  banner files match the sibling files' exact wording; `git ls-files scripts/_snapshots` is empty after
  the untrack PR while the working-tree copy is preserved locally; `.gitignore` covers `_plans/`, `_diag/`,
  `tmp/`, `_snapshots/`.
- **Size:** S for the doc edits and the 2 directory moves; S for the untrack PR (no history rewrite in
  this pass, per A4's own "optional" framing of `git filter-repo`).
- **Model:** Haiku, this is the textbook Haiku batch: every edit is a known-shape transcription, a
  directory move with a header, or a gitignore-pattern addition, with the exact text already drafted in
  the source registers.
- **Ordering:** sixteenth.

## 17. Corrected WS1-16 and wave status tables

- **Closes:** CF-DOCS-2.
- **Write set:** `docs/plans/wave-plan-2026-09-28.md` (State column), `docs/plans/wave2b-lanes-2026-09-29.md`
  (append a "Landing status" section).
- **Acceptance test:** the tables match A8c's "Corrected WS1-16" and "Corrected wave status" tables
  verbatim (already reconciled against `git log origin/master` at write time); this consolidation's OUTPUT
  3 table 3 is the same fact restated for the build-overview, so the two documents cannot drift once both
  land in the same commit window.
- **Size:** S, a status transcription from git log, not a judgment call (A8c's own framing).
- **Model:** Haiku.
- **Ordering:** seventeenth.

## 18. Close the 4-month-old docs/ops followups

- **Closes:** CF-DOCS-5 (rendering-guard, multi-tenant Phase 3, DEF-1 dwell), CF-DOCS-6 (CODE-5a-register's
  2 HIGH findings).
- **Decision (2026-10-01):** closure notes, not a re-verification chase. The operator's ruling treats
  items from superseded decisions as out of scope; these 3 followups and the `CODE-5a-register.md`
  findings are old enough (4-5 months) and narrow enough (each already has a concrete evidence trail in
  this consolidation) that a dated closure note citing this ruling, rather than fresh verification, is
  the correct-sized response. Where this consolidation's own reading already found real evidence either
  way (rendering-guard: still manual per `HANDOFF-2026-09-11.md`; SW-2: done, RD-50 landed 2026-07-20), the
  closure note states that evidence directly rather than re-deriving it.
- **Write set:** `docs/ops/rendering-guard-followups-2026-07-11.md`,
  `docs/ops/multi-tenant-foundation-followups-2026-05-15.md`, `docs/ops/registered-deferrals-2026-07-11.md`,
  `docs/ops/full-system-audit-2026-07-11/CODE-5a-register.md` (closure notes on F-5a-4/F-5a-11).
- **Acceptance test:** each of the 3 followups and the 2 CODE-5a findings carries a dated closure note
  citing the 2026-10-01 operator ruling and the evidence already on record in this consolidation (A8b's
  own A8b-3/A8b-7/A8b-8/A8b-13 findings); none is left as a live open item with no disposition.
- **Size:** S, this is a transcription of already-gathered evidence into a closure note, not new
  investigation.
- **Model:** Haiku (the evidence and the citation are both already written; this is formatting it into
  each file's own closure-note convention).
- **Ordering:** eighteenth.

## 19. Design-doc drift batch, the parts-brief ADR, and the WatchButton "Unwatch" build

- **Closes:** CF-DOCS-11 (DES-1, DES-2, DES-5 mechanical; DES-3 resolved per the decision below; DES-4
  stays unfixed, see "will not fix"), CF-DOCS-13 (CEN-2, decision below), CF-DOCS-14 (TDL-1, verification
  only), and AUD-1 (the WatchButton "Unwatch" build, decision below).
- **Decision (2026-10-01), DES-3:** the 2026-09-18 parts brief supersedes the 2026-09-07 and 2026-09-09
  rulings. The rule below S-section titles stands; the Search\|Ask toggle is removed and `GET /api/search`
  stays reachable from the single CommandBar input. Recorded in new
  `docs/decisions/ADR-037-parts-brief-supersedes-earlier-ui-rulings.md`.
- **Decision (2026-10-01), AUD-1:** BUILD. `WatchButton.tsx`'s hover/menu state is implemented to read
  "Unwatch" on a watched row, not deferred.
- **Decision (2026-10-01), CEN-2:** delete the empty-table promise rather than populate it; the
  `census_worklist`-backed per-item detail tables `gap-census-2026-07.md` promises were never built and
  the doc is 2.5 months stale regardless, consistent with the operator's "superseded, remove it" framing
  rather than a build-it-now scope addition.
- **Write set:** `docs/design/redesign/README.md` (covered by Lane 16's archive move, not re-edited here);
  `docs/design/handoff-2026-09-06/README.md` (2 lines: placeholder text, 778px figure);
  `docs/design/handoff-2026-09-06/HANDOFF.md` (1 line, 778px figure); `docs/census/gap-census-2026-07.md`
  (delete the empty per-item tables and the "how to read" promise referencing them, keep the populated
  rollup sections); `docs/tech-debt-log.md` (verification pass on the F52 shellcheck entry, no edit unless
  a closing commit is found); new `docs/decisions/ADR-037-parts-brief-supersedes-earlier-ui-rulings.md`;
  `src/components/ui/WatchButton.tsx` (the hover/menu label swap) and its `*.npmtest.mjs` companion (new
  assertion).
- **Acceptance test:** `handoff-2026-09-06/README.md:45`'s placeholder text matches the shipped
  `masthead.json` string; the 778px figure is corrected to 780px in both named files;
  `docs/tech-debt-log.md`'s F52 entry is either closed with a citation or left open with a note that this
  pass confirmed no closing commit exists among #800-#837; `gap-census-2026-07.md` no longer carries the
  per-item table promise; ADR-037 exists with frontmatter per ADR-009 and cites all 3 dated rulings
  (2026-09-07, 2026-09-09, 2026-09-18); `SectionHeader.tsx` keeps its rule-below-title behavior unchanged
  (no code change needed there, the ADR just records which ruling governs); the CommandBar Search\|Ask
  toggle UI is removed; `grep -rn "Unwatch" src/` now returns a real hit in `WatchButton.tsx`'s row
  variant, and the companion test asserts the hover/menu state reads "Unwatch" on a watched row.
- **Size:** S for the 4 mechanical text fixes, the tech-debt-log verification, and the CEN-2 deletion; S
  for the ADR; S for the WatchButton build (ruling 3.5's own scope is one label swap plus a test).
- **Model:** Haiku for the mechanical text fixes and the CEN-2 deletion (exact replacement text already
  drafted by A8d); Sonnet for the ADR (needs to state the supersession reasoning, not just transcribe) and
  the WatchButton build (a real component change, small but not pattern-fill).
- **Ordering:** nineteenth, folds into the docs-class lanes alongside Lanes 16-18, except the WatchButton
  build, which is logically a surface-class lane (alongside 12-14, 21) kept here for register continuity
  since it originates from the same A8d finding as the rest of this lane.

## 20. Guard the 5 unguarded producer scripts

- **Closes:** CF-BROKEN-9. Appended here for numbering continuity (this document's second amendment);
  by R14 this is a data-machine-class fix and belongs immediately after Lane 3 (guarded-write fixes), not
  at the end of the docs lanes.
- **Write set:** `scripts/producers/market/eu-weekly-oil-bulletin.mjs`,
  `scripts/producers/regional/eurostat-nrg-pc-205-producer.mjs`,
  `scripts/producers/regional/bls-oews-producer.mjs`, `scripts/gen/emission-factors-desnz.mjs`,
  `scripts/gen/emission-factors-epa.mjs`.
- **Acceptance test:** each file wraps its `main()`/`runEnvelopeProducer(...)` call in the same
  `isMainModule(import.meta.url)` guard from `scripts/lib/is-main.mjs` that ~40 other scripts in the
  codebase already use (the sibling `fetch-oil-bulletin.mjs` already documents fixing this exact class in
  its own header, 2026-09-02, as the copy-from template). `node --test
  scripts/gen/emission-factors-desnz.test.mjs` no longer performs a live Supabase read as a side effect of
  running the test (verify by running with valid `.env.local` creds present and confirming no network call
  fires before the first assertion). Extend `scripts/lib/is-main.test.mjs`'s own regression sweep (or a
  new fitness function) to catch the "no guard at all" shape specifically, not only the "wrong guard"
  shape it currently checks for, per A4bc's own process-gap note, so a sixth instance cannot land unnoticed.
- **Size:** S for the 5 mechanical guard additions; M for the new/extended fitness function.
- **Model:** Haiku for the 5 guard additions (mechanical, template already proven in the same directory
  tree); Sonnet for the fitness-function extension.
- **Ordering:** logically third-and-a-half (immediately after Lane 3); numbered 20 in this document for
  continuity with the already-approved numbering.

## 21. Fix the PostgREST `.or()` filter-injection pattern

- **Closes:** CF-SEC-15. Appended here for numbering continuity; by R14 this is a surface-class fix and
  belongs with Lanes 12-14.
- **Write set:** `src/app/api/community/search/route.ts`, `src/app/operations/[slug]/page.tsx`,
  `src/app/research/[slug]/page.tsx`.
- **Acceptance test:** `community/search` extends `escapeLike` to also escape `,` and `(`/`)` (PostgREST's
  documented workaround), or replaces the two `.or()` calls with two separate `.ilike()` reads unioned in
  JS. `operations/[slug]` and `research/[slug]` replace the `orExpr`/`.or()` branch with the same shape
  `api/workspace/archive-impact/route.ts` and `regulations/[slug]/page.tsx` already use (branch on
  `isUuid`, call `.eq("id", id)` or `.eq("legacy_id", id)` directly, never a composed string), which also
  closes the missing `provenance_status='verified'` gap on both pages as a one-line addition. A crafted
  input containing `,`/`(`/`)` no longer changes the query's filter structure at any of the 5 sites.
- **Size:** S (3 files, the safe pattern already exists twice in the same codebase to copy from).
- **Model:** Sonnet (security-adjacent, small but needs care).
- **Ordering:** logically thirteenth-and-a-half (alongside Lanes 12-14); numbered 21 in this document for
  continuity with the already-approved numbering.

## 22. GitHub Actions artifact retention and upload scope

- **Closes:** new, this plan's second amendment under the 2026-10-01 operator ruling; not a `CF-*` audit
  finding (no audit lane measured this; the coordinator measured it directly, 6.2 GB live, 2026-10-01, and
  already deleted 290 artifacts by hand ahead of this lane).
- **Decision (2026-10-01):** every workflow that uploads an artifact sets `retention-days: 7`; every
  workflow that currently uploads a fuller artifact (logs, intermediate JSON, per-step state) reduces its
  upload to the run summary only, the minimum the harness/dispatch-ledger conventions need to keep a
  record of what happened without keeping the full payload.
- **Write set:** all 13 `.github/workflows/*.yml` files that upload an artifact today (named by A4/A7's
  own workflow inventory: `brief-export.yml`, `brief-apply.yml`, `change-detection.yml`, `corpus-turn.yml`,
  `data-audit-lane.yml`, `date-chain.yml`, `discipline.yml`, `downstream-chain.yml`, `fetch-drain.yml`,
  `gate-a-rescan.yml`, `maintenance.yml`, `population-turn.yml`, `producers.yml`, `propagation-drain.yml`,
  `source-monitoring.yml`, `source-sweep.yml`, `spot-check-monthly.yml`, `trust-recompute.yml`,
  `uptime-probes.yml`; the lane confirms the exact 13 by grepping every workflow file for
  `actions/upload-artifact` before editing, since this plan's own audit sources did not enumerate the
  upload sites individually).
- **Acceptance test:** every `actions/upload-artifact` step across all 22 workflow files carries
  `retention-days: 7`; every one of the 13 identified upload sites uploads only the run summary (the same
  content already surfaced via `GITHUB_STEP_SUMMARY`/the harness-run artifact record), not the fuller
  payload; a `gh api` check of the repo's current artifact storage, run after the next full cycle of
  workflow firings, shows the live total trending down from the 6.2 GB baseline rather than regrowing.
- **Size:** M (13 files, each a small, mechanical edit, but needs a per-file check that the reduced upload
  still satisfies whatever downstream step reads it, e.g. the harness-run-landing convention from #813).
- **Model:** Haiku for the mechanical `retention-days` addition across all 22 files; Sonnet for the 13
  upload-scope reductions (each needs a one-file judgment call on what the run summary must still
  contain).
- **Ordering:** a gates-class lane (CI/infra hygiene), sequenced with Lanes 7-11.

---

## What will NOT be fixed, and why

- **CF-DEAD-3** (6 F25-tracked dead `src/lib` modules): each already carries a named review trigger on the
  repo's own `LEGACY_ALLOWLIST`. No lane needed until a trigger condition fires; re-verified this pass as
  still correctly tracked, not newly dead.
- **CF-DEAD-7** (`_reground/`, `_ruling/`, `_worklists/`, `_archive/` scratch directories): `[HYPOTHESIS]`
  only. Before a lane deletes anything here, a basename-grep sweep (named in A4's own decision-ready items)
  needs to run first; that sweep is folded into Lane 16's gitignore work as a follow-on check, not a
  separate lane, since the two touch the same directories.
- **CF-UNWIRE-3** (`community_topics`/`community_topic_groups` read-orphan), **CF-UNWIRE-4**
  (`bulk_imports`/`disposition_ledger` write-orphans): both are `[HYPOTHESIS]`/already-allowlisted
  respectively; A5's own text calls the `bulk_imports` disposition "overdue" but names it as a coordinator
  decision, not a lane's call. Accepted as open pending that ruling.
- **CF-DATA-9** (`get_technology_items()`'s hardcoded predicate): accepted as possibly-correct-as-is.
  Whether Technology is a deliberate exception to the `surface_of()` model depends on reading
  `surface_of()`'s live SURFACE_RULES definition, which no lane in this wave did. Do not fix blind; the
  next lane that touches `surface_of()` for any other reason should resolve this as a side observation, not
  a dedicated lane.
- **A3B-06/A3B-SW-1** (`lib/trust.ts` 908 lines, `lib/sources/verification.ts` 1,018 lines): read in full
  and judged coherent-by-design (one auditable narrative each). No split proposed; matches the codebase's
  own precedent (`propagation/drain.ts`, `canonical-pipeline.ts`'s grounding stage) of leaving load-bearing
  cohesion alone.
- **CF-DUP-7** (oversized files generally, `supabase-server.ts` 4,842 lines, `heal-provenance.mjs` 4,268
  lines, `CommunityRooms.tsx` 1,785 lines): accepted as opportunistic, driver-rule work per A7's own
  recommendation 8, not a dedicated lane. `supabase-server.ts`'s split is explicitly named (one file per
  domain reader) as a "do it opportunistically" item, not scheduled here.
- **CF-GATE-5** (fitness-function id gaps F29/F53/F55/F56): P3, cosmetic traceability only. A
  `docs/tech-debt-log.md` line is sufficient; not worth a lane.
- **CF-DOCS-9** (one undated docs/ file): S-effort rename, folded into whichever lane next touches that
  file rather than a standalone lane.
- **REFUTED findings** (section (d) of the audit register): no fix needed by definition. Listed in the
  audit for the record, not carried into this plan.
- **CF-DOCS-11's DES-4** (`docs/design/decision-package-2026-07-06.md`'s 2026-07-06 doctrine, possibly
  absorbed by later heal machinery): `[HYPOTHESIS]` only, A8d's own text names this as untraced through
  git log or the DB within its session. A lane would need to trace the 52-item worklist to a closing
  commit before a superseded-note edit is safe; not scheduled until that tracing happens, folded into
  whichever lane next has reason to touch the rule-18 heal machinery rather than a dedicated lane.
- **CF-DOCS-12** (`docs/sprint-1/`, `docs/sprint-2/` archival): already covered by Lane 16's historical-
  header batch (A8's L3-1 finding); A8d's SPR-1/SPR-2 corroborate the same disposition with a different
  method (git log dates), not a new fix.

## Non-code items, dispositioned by the 2026-10-01 operator ruling

Every item in this section previously said "needs an operator ruling." The "Decisions 2026-10-01" section
at the top of this document records the ruling for each; this section now states only the resulting
mechanism, not an open question.

### DROP statements (exact SQL, never executed by this lane; staged for the operator/coordinator to run)

```sql
-- CF-DATA-4: sources.reliability_score, dead column, 2,572/2,572 rows at exactly the
-- default value, superseded by trust.ts's live computeReliabilityComponent(). Zero
-- dependent code beyond the original migration 007 ADD COLUMN.
ALTER TABLE public.sources DROP COLUMN reliability_score;
```

```sql
-- CF-DEAD-1, decision 3 (2026-10-01): /api/admin/promotion-policy's table, DELETE.
-- Superseded by the operator-priced spend model (RD-31/RD-32). Run only after the
-- route file itself is removed in the same PR (Lane 12).
DROP TABLE IF EXISTS public.promotion_policy;
```

`inference_records` carries no DROP statement: decision 2 (2026-10-01) is KEEP, it is migration 338 on
`lane/w2g-learning-loop` and needs no action from this plan.

### Migration applied-status header corrections (text only, no schema change; see Lane 4)

- `331_harness_runs.sql`: "DRAFT / NOT APPLIED" to "APPLIED (confirmed live, 38 rows, 2026-09-30)".
- `335_drop_placeholder_community_layer.sql`: "AUTHOR-ONLY, NOT APPLIED" to "APPLIED (confirmed, tables
  absent from live schema, 2026-09-30)".
- `277_corpus_turn_requests.sql`: "LEFT UNAPPLIED... Applied only by the coordinator" to "APPLIED
  (confirmed live, 1,757 rows, 2026-09-30)".
- `261_drop_dead_notification_v1.sql`: "COMMITTED, NOT YET APPLIED" to "APPLIED (confirmed, tables absent
  from live schema, 2026-09-30)".

### PROGRAM-BOARD reconstruction as a Haiku batch (Lane 15/17)

The mechanical sub-parts (row-text replacement once the coordinator names which rows close, wave-status
table transcription from git log) are Haiku-batchable per A8c's own framing. The judgment part (deciding
which of the 16 Wave-2 sub-rows are actually closed, reading `session-log.d/2026-09-29-*.md` closes
against each row's stated acceptance evidence) is not; A8's own text explicitly recommends a dedicated
coordinator pass over a mechanical patch for that part. Split accordingly if approved: Sonnet judgment
pass first, Haiku transcription second, same PR.

---

*Lanes proposed: 22 (amended four times: 2026-09-30, fold in A8d PR #856, +1 lane Lane 19, Lane 15 revised
with the 38-PR reconstruction; 2026-09-30, the CF-PROC-2/A3/CF-BROKEN-6 corrections touched no lane count;
2026-09-30, fold in A1c/A2bc/A4d/A4bc/A4cc PRs #858-#862, +2 lanes Lanes 20-21, Lane 11 revised; 2026-10-01,
**plan approved by the operator under the delegation recorded at the top of this document**, every
"needs an operator ruling" block resolved into a firm decision (Lanes 1, 5, 12, 13, 16, 18, 19 revised
accordingly), +1 lane Lane 22 for GitHub Actions artifact retention). Every CONFIRMED finding in the audit
register is mapped to a lane above or the "will not fix" list, with a reason in both cases. Write sets
checked disjoint by file path across all 22 lanes (no two lanes above name an overlapping file); Lane 15
(PROGRAM-BOARD) and Lane 17 (wave-status tables) both touch planning docs but not the same file; Lane 19
(design docs) and Lane 16 (mechanical docs batch) both touch `docs/` but not the same files. Lanes 20-22
are numbered at the end for continuity but belong earlier in R14 order (noted in each lane's own Ordering
field). **The plan is approved; lanes may begin.** Lane 1's `--apply` step is the one write action in this
plan touching live customer-facing data; it is covered by the same 2026-10-01 approval (decision 1) and
needs no further separate go-ahead. A6b will be folded in as a further commit when it lands.*
