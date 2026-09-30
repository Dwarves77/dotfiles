# Remediation plan, 2026-09-30

**Nothing in this plan executes until the operator approves it.** Every lane below is a proposal, class
over instance per the remediation-discipline skill: one lane closes every instance of a finding class, not
one lane per finding id. Ordering follows R14 (data machine and integrity first, gates second, surfaces
third, docs last). Sizes are S (under a day), M (a day to a few days), L (a dedicated multi-day lane).
Model is the lane's own judgment call: Sonnet where a fix needs reading code/design intent, Haiku where
the fix is mechanical (a known-shape edit repeated across files, a header correction, a status-table
transcription).

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

## Lane ordering (R14)

1. Data machine and integrity (Lanes 1-6)
2. Gates (Lanes 7-11)
3. Surfaces (Lanes 12-14)
4. Docs (Lanes 15-18)
5. Non-code items requiring operator approval (section below)

---

## 1. Land the chained-apply reversal

- **Closes:** CF-BROKEN-7 (P0, open).
- **Write set:** the already-built reversal script from #829, plus whatever migration/direct-SQL step
  executes `--apply --archive`. Disjoint from every other lane (touches only the 33+33+32+51 marked rows
  from run `36568656803`).
- **Files:** the script named in `docs/ops/session-log.d/2026-09-29-reverse-chained-apply.md`.
- **Acceptance test:** a live SELECT confirms zero rows carrying that run's marker across
  `intelligence_items`, `staged_updates`, `agent_run_searches`, `integrity_flags`. The `harness_runs` row
  for the reversal itself is the proof artifact (rule 15, execution over existence).
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
- **Write set:** `.discipline/governance/db-catalog.json` (regenerate via the existing
  `db-catalog-refresh.sql`, read-only); one retroactive migration or a DROP for `inference_records`
  depending on the coordinator's disposition call (see non-code items below); one DROP migration for
  `sources.reliability_score`.
- **Acceptance test:** `db-catalog.json` shows 117+ tables matching the coordinator's live-schema export;
  `F24-db-object-migration-home` passes with `inference_records` now traced to a migration (or the table is
  gone); `sources.reliability_score` no longer exists in `information_schema.columns`.
- **Size:** S for the catalog refresh; S for the reliability_score drop (approved SQL below); S once the
  inference_records disposition is ruled.
- **Model:** Haiku (catalog refresh is a script run; the DROP migrations are template-shaped once ruled).
- **Ordering:** fifth. Closes the visibility gap that let `inference_records` go unnoticed in the first
  place.

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

## 11. Clock-fragility and exit(0) standing checks

- **Closes:** CF-GATE-2 (A6 C3, one-time manual grep not a standing gate), CF-GATE-3 (A4b EXIT0-1, 30+
  `process.exit(0)` sites sanity-checked only by grep context), CF-GATE-4 (A4b CLI-TEST-1, mint chokepoint
  CLI layer untested), CF-GATE-7 (A6 C4/C5, 41 self-skips and 16 DB-dependent tests not individually
  re-verified to fail loud).
- **Write set:** new fitness function plus a targeted read-through of `scripts/verify/**` (87 files, the
  coverage gap A4b names as its own top finding, G-1).
- **Files:** new `.discipline/fitness/functions/F-clock-fragility.mjs` (flags a test combining a live
  `new Date()`/`Date.now()` read with a string-equality date assertion); a follow-on read-through of the 5
  highest-consequence `verify/*.mjs` files first (the ones with a live DB write inside their success path,
  e.g. `verify/remediate-orphan-sources.mjs`, `verify/run-data-audit-lane.mjs`) to confirm no
  `process.exit(0)` sits inside an unlogged `catch`; grep the mint-chokepoint `*.test.mjs` files for
  `execFileSync`/`spawn` and add a subprocess-level test if none exists.
- **Acceptance test:** the fitness function has a real (not over-fit) heuristic verified against
  `relative-time.npmtest.mjs` and `render-clock.npmtest.mjs` as known-good non-matches (A6's own sampled
  cases); the 5 highest-consequence `verify/*.mjs` files are confirmed to log before any exit(0); at least
  one CLI-argv-parsing path is exercised as a real subprocess for the mint chokepoint.
- **Size:** M.
- **Model:** Sonnet (heuristic design, judgment-heavy).
- **Ordering:** eleventh, closes the gate-class lanes.

## 12. Delete or wire `/api/admin/promotion-policy`

- **Closes:** CF-DEAD-1.
- **Write set:** `src/app/api/admin/promotion-policy/route.ts` and either its consumer (if wiring) or its
  own deletion plus migration (if retiring).
- **Acceptance test:** either `grep -rn "promotion_policy"` finds a second, non-fixture, non-route-file
  hit that actually gates a spend, plus a rendered admin panel calling GET/POST; or the route, its table,
  and its migration are removed in one PR with a `docs/tech-debt-log.md` entry.
- **Size:** M (wire) / S (retire). **Needs an operator ruling** on which disposition (see non-code items).
- **Model:** Sonnet.
- **Ordering:** twelfth, first surface-class lane (this is an admin control, adjacent to data-machine
  authorization, not a customer surface, but sequenced here since it is instance-scale, not class-scale).

## 13. Delete or mount `DashboardTopPriority.tsx`; fix the invalid-CSS tint class

- **Closes:** CF-DEAD-2, CF-BROKEN-2.
- **Write set:** `src/components/home/DashboardTopPriority.tsx` (+ its 2 comment-only referrers) for the
  first; `src/components/sources/CanonicalSourceReview.tsx`, `ProvisionalReviewCard.tsx`,
  `IntersectionDetectionView.tsx`, `ThemesView.tsx`, `resource/IntelligenceMetadataStrip.tsx` plus a new
  shared tint token/helper for the second.
- **Acceptance test:** `DashboardTopPriority` either renders on a route or is deleted with its dead
  comment references cleaned up. The tint fix: `color-mix(in srgb, var(--color-X) N%, transparent)` (or 4
  fixed `--color-*-tint` tokens matching the existing `--action-tint`/`--immediate-tint` pattern) replaces
  all 24 cited sites; a visual check on the admin Sources surface's 5 sub-tabs shows the tinted
  backgrounds now render.
- **Size:** S (delete) / M (wire) for DashboardTopPriority; S for the tint fix (one shared helper, 24
  mechanical call-site edits).
- **Model:** Sonnet for the DashboardTopPriority decision (needs an operator ruling first, see below);
  Haiku for the tint-token mechanical replacement once the token/helper shape is chosen.
- **Ordering:** thirteenth.

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

## 16. Mechanical docs corrections batch

- **Closes:** CF-DOCS-4 (2 live broken links; the 88 pre-redesign-fossil links get a historical header
  instead of individual fixes, per A8's own recommendation), CF-DOCS-7 (2 missing superseded banners),
  CF-DEAD-5/6 (gitignore additions for `_plans/`, `_diag/`, `tmp/`, `_snapshots/`), CF-DEAD-4
  (`git rm -r --cached` for `_snapshots/`).
- **Write set:** `docs/ops/session-log.d/2026-09-25-supabase-audit-lane.md` (1 link),
  `docs/dispatches/lane-briefs/2026-09-18/brief-d2.md` (1 link), `docs/plans/finish-plan-2026-09-02.md` +
  `system-completion-plan-2026-09-02.md` (superseded banners, exact text already drafted by A8c),
  `docs/sprint-1/*.md` + `docs/sprint-2/*.md` + `docs/audits/wave1b-stub-quality-investigation-2026-05-11.md`
  (historical-record header), `.gitignore`, then a separate `git rm -r --cached` PR for `_snapshots/`.
- **Acceptance test:** the link-checker script (used by A8/A8b) reports 0 broken links on the 4 named
  files; the 2 banner files match the sibling files' exact wording; `git ls-files scripts/_snapshots` is
  empty after the untrack PR while the working-tree copy is preserved locally; `.gitignore` covers
  `_plans/`, `_diag/`, `tmp/`, `_snapshots/`.
- **Size:** S for the doc edits; S for the untrack PR (no history rewrite in this pass, per A4's own
  "optional" framing of `git filter-repo`).
- **Model:** Haiku, this is the textbook Haiku batch: every edit is a known-shape transcription or a
  gitignore-pattern addition with the exact text already drafted in the source registers.
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

## 18. Reconcile the 4-month-old docs/ops followups

- **Closes:** CF-DOCS-5 (rendering-guard, multi-tenant Phase 3, DEF-1 dwell), CF-DOCS-6 (CODE-5a-register's
  2 HIGH findings).
- **Write set:** `docs/ops/rendering-guard-followups-2026-07-11.md`,
  `docs/ops/multi-tenant-foundation-followups-2026-05-15.md`, `docs/ops/registered-deferrals-2026-07-11.md`
  (closure notes once verified), plus a verification pass against `CODE-5a-register.md`'s F-5a-4/F-5a-11.
- **Acceptance test:** each of the 3 followups either gets a closure note with evidence, or is re-opened as
  a live P1/P2 finding with a dated entry explaining why it is still open 2-4 months later; F-5a-4/F-5a-11
  are re-checked against the current `fsi-app/scripts/**` tree (grep for `--live`/interlock additions in the
  two named script families) and either closed or promoted to a numbered finding in a future audit.
- **Size:** S to verify each (mostly a grep + a read of the current file state); M if any turns out to
  still be genuinely open and needs a fix.
- **Model:** Sonnet (judgment on whether the evidence found closes the item).
- **Ordering:** eighteenth, last.

## 19. Design-doc drift batch

- **Closes:** CF-DOCS-11 (DES-1, DES-2, DES-5 mechanical; DES-3 needs an operator ruling; DES-4 needs
  verification first), CF-DOCS-13 (CEN-2, mechanical-or-decision), CF-DOCS-14 (TDL-1, verification only).
- **Write set:** `docs/design/redesign/README.md` (1 line), `docs/design/handoff-2026-09-06/README.md` (2
  lines: placeholder text, 778px figure), `docs/design/handoff-2026-09-06/HANDOFF.md` (1 line, 778px
  figure), `docs/census/gap-census-2026-07.md` (either populate or delete the empty-table promise, see
  below), `docs/tech-debt-log.md` (verification pass on the F52 shellcheck entry, no edit unless a closing
  commit is found).
- **Acceptance test:** `redesign/README.md` line 1 carries the superseded banner A8d drafted verbatim
  ("SUPERSEDED by `../handoff-2026-09-07/README.md`..."); `handoff-2026-09-06/README.md:45`'s placeholder
  text matches the shipped `masthead.json` string; the 778px figure is corrected to 780px in both named
  files; `docs/tech-debt-log.md`'s F52 entry is either closed with a citation or left open with a note that
  this pass confirmed no closing commit exists among #800-#837.
- **Size:** S for the 4 mechanical text fixes and the tech-debt-log verification; S (delete the promise) or
  M (populate from a live query) for CEN-2, **needs an operator or coordinator call on which disposition**.
- **Model:** Haiku for the 4 mechanical text fixes (exact replacement text already drafted by A8d); Sonnet
  for the CEN-2 disposition once ruled.
- **Ordering:** nineteenth, folds into the docs-class lanes alongside Lanes 16-18.

**Not included in Lane 19, needs an operator ruling first (see non-code items below):** DES-3 (the
rule-below-S-section-title contradiction and the Search\|Ask toggle disposition) and AUD-1 (the WatchButton
hover "Unwatch" text, a real product-behavior gap against a named operator ruling, not a docs-only fix).

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

## Non-code items requiring operator approval

### DROP statements (exact SQL, never executed by this lane)

```sql
-- CF-DATA-4: sources.reliability_score, dead column, 2,572/2,572 rows at exactly the
-- default value, superseded by trust.ts's live computeReliabilityComponent(). Zero
-- dependent code beyond the original migration 007 ADD COLUMN.
ALTER TABLE public.sources DROP COLUMN reliability_score;
```

```sql
-- CF-DEAD-12: inference_records, only if the operator rules it was a one-off
-- experiment rather than a table to keep. Column definition unknown to this lane
-- (no DB access); confirm the live DDL before running this, or write the retroactive
-- migration (migration-256 pattern) instead if the table stays.
-- DROP TABLE public.inference_records;  -- DO NOT RUN without confirming live columns first
```

### Migration applied-status header corrections (text only, no schema change; see Lane 4)

- `331_harness_runs.sql`: "DRAFT / NOT APPLIED" to "APPLIED (confirmed live, 38 rows, 2026-09-30)".
- `335_drop_placeholder_community_layer.sql`: "AUTHOR-ONLY, NOT APPLIED" to "APPLIED (confirmed, tables
  absent from live schema, 2026-09-30)".
- `277_corpus_turn_requests.sql`: "LEFT UNAPPLIED... Applied only by the coordinator" to "APPLIED
  (confirmed live, 1,757 rows, 2026-09-30)".
- `261_drop_dead_notification_v1.sql`: "COMMITTED, NOT YET APPLIED" to "APPLIED (confirmed, tables absent
  from live schema, 2026-09-30)".

### `inference_records` disposition (operator call, blocks Lane 5's second half)

Two options, exact mechanism named, no default chosen: (a) write the retroactive migration capturing its
live definition, migration-256's own pattern, if the table is meant to stay; or (b) drop it (SQL staged
above, commented out) if it was a one-off experiment. This lane cannot see its column definition without
DB access, so this is not resolved here.

### Design-ruling conflicts (operator call, blocks part of Lane 19)

Two unresolved, dated ruling conflicts named by A8d (DES-3), neither resolved by any later doc in this
wave's read set: (a) whether a rule sits below an S-section title (`SectionHeader.tsx:27-30` cites a
CLOSED 2026-09-07 ruling forbidding it; `parts-brief-2026-09-18.md` section 2.3 asks for exactly that
rule); (b) whether the CommandBar Search\|Ask toggle (a named, dated 2026-09-09 CMDSEARCH ruling) is
removed per the 2026-09-18 parts brief's instruction, and if so what happens to the `GET /api/search`
capability the toggle exists to reach. Record as an ADR or a parts-brief amendment once ruled; this closes
`parts-inventory.md`'s own still-open findings in place per rule 13's corollary.

### WatchButton "Unwatch" text (operator or coordinator call, not blocked, just not chosen here)

A8d's AUD-1: operator ruling 3.5's second half ("a watched row must never read 'Watch'" on hover/menu) has
zero implementation (`grep -rn "Unwatch" src/` returns nothing), confirmed by two independently-dated
passes 4 days apart. Either build the hover/menu "Unwatch" swap in `WatchButton.tsx`'s row variant (S
effort, Sonnet), or record an explicit deferral/ruling-amendment so the gap stops being an untracked
silent omission. Not scheduled to a lane above because it is a small, self-contained product fix once
chosen, not because it needs more investigation; the choice itself (fix now vs. defer) is the open item.

### `/api/admin/promotion-policy` disposition (operator call, blocks Lane 12)

Wire it to the promotion engine it was built for (candidates named by A1:
`src/lib/sources/promote-provisional.mjs`, `scripts/maintenance/resolve-provisional-sources.mjs`), or
delete the route, its table, and its migration in one PR with a tech-debt-log entry. Either is
decision-ready; neither is chosen here.

### The 33-row chained-apply data (operator has already ruled, see Lane 1)

Already ruled "get rid of them." Listed here only to flag that Lane 1's `--apply --archive` step is the
one write action in this entire plan that touches live customer-facing data (as opposed to schema/docs/CI
config), and should get an explicit go-ahead immediately before that specific step runs, separate from
approving the plan as a whole.

### PROGRAM-BOARD reconstruction as a Haiku batch (Lane 15/17)

The mechanical sub-parts (row-text replacement once the coordinator names which rows close, wave-status
table transcription from git log) are Haiku-batchable per A8c's own framing. The judgment part (deciding
which of the 16 Wave-2 sub-rows are actually closed, reading `session-log.d/2026-09-29-*.md` closes
against each row's stated acceptance evidence) is not; A8's own text explicitly recommends a dedicated
coordinator pass over a mechanical patch for that part. Split accordingly if approved: Sonnet judgment
pass first, Haiku transcription second, same PR.

---

*Lanes proposed: 19 (amended 2026-09-30 to fold in A8d, PR #856: +1 lane, Lane 19; Lane 15 revised in
place with the 38-PR reconstruction). Every CONFIRMED finding in the audit register is mapped to a lane
above or the "will not fix" list, with a reason in both cases. Write sets checked disjoint by file path
across all 19 lanes (no two lanes above name an overlapping file); Lane 15 (PROGRAM-BOARD) and Lane 17
(wave-status tables) both touch planning docs but not the same file; Lane 19 (design docs) and Lane 16
(mechanical docs batch) both touch `docs/` but not the same files. Approve this plan, then Lane 1's
`--apply` step separately, before any lane starts. A6b will be folded in as a second commit when it
lands.*
