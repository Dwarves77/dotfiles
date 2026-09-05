# Plan-completion audit, 2026-09-05

## What this audit is

The operator's instruction, verbatim: "look at the build plans directly and confirm what has
and hasnt been completed, do not rely on past agents information, read the whole code to
understand. we have had problems with building tools, flywheel, harness and not making the
entire systems work as one single unit and not using existing tools."

Six lanes ran in parallel against the same tree, each read-only (no writes, no migrations
applied, no full test suite or build run, the container had other lanes actively writing to
it), each holding itself to CLAUDE.md rule 14 (every finding carries `[CONFIRMED]` /
`[HYPOTHESIS]` / `[REFUTED]`), and each treating `docs/PROGRAM-BOARD.md`, `docs/ops/session-log.md`,
and the prior `docs/audits/wiring-audit-2026-09-04/` as claims to re-check against
`docs/plans/complete-system-build-plan-2026-09-04.md`, live code, and live read-only SQL, never
as evidence on their own.

## Tree audited

`1e6d9e8b`, REBASE-47's merge of train 47 into train 46 master ("train 47 merged with master;
take `supabase-env.ts`, drop the `supabase-service-config.mjs` duplicate"). This was the tree
named in every lane's dispatch as the one T46 validation runs against, and the most complete
tree that existed at audit time. It predates this folder's own landing (train 47 has since
landed as PR #594 = master `c3003233`, and migrations 308-311 have since been applied live;
see `docs/ops/handoff-2026-09-05.md` §6's "Landing state" note and `docs/inventories/
migrations.md`); the six files below describe `1e6d9e8b` as it stood, not the tree this
audit folder is committed on top of.

## The six files

| File | Lane (model) | Scope | Verdict counts |
|---|---|---|---|
| [W1-W2-intake-population.md](./W1-W2-intake-population.md) | AUDIT-W1-W2 (Sonnet) | W1 (intake, close the loop in front of mint) and W2 (population to record grade) | 12 scored rows: COMPLETE 1 (corpus-turn-requests consumption, mechanism only), PARTIAL 6, NOT BUILT 4, COULD NOT VERIFY 1 |
| [W3-W4-sourcing-propagation.md](./W3-W4-sourcing-propagation.md) | AUDIT-W3-W4 (Sonnet) | W3 (every figure sourced, every source rated) and W4 (decision propagation, spec 08) | 13 scored rows: COMPLETE 2, PARTIAL 6, BUILT-DORMANT 3, NOT BUILT 2 |
| [W5-W6-W7-surfaces-community-discipline.md](./W5-W6-W7-surfaces-community-discipline.md) | AUDIT-W5-W6-W7 (Sonnet) | W5 (surfaces), W6 (community as ruled), W7 (discipline/closure-gate) | mixed verdicts across ~16 scored rows: COMPLETE (mechanically) 5, PARTIAL 7, BUILT-DORMANT 2, NOT BUILT/NOT VERIFIED 2; plus the standalone finding that master's closure gate is one train-landing away from flipping 7 STALE-NEXT entries red |
| [loop-harness-flywheel-one-unit.md](./loop-harness-flywheel-one-unit.md) | AUDIT-LOOP (Sonnet) | Plan §1 (the loop, both sub-loops), W0/W8 (speed, harness, memory), the full 17-workflow dispatch graph, rule 17 | 12 scored rows: COMPLETE 4, PARTIAL 3, BUILT-DORMANT 2, NOT BUILT 3 |
| [skills-rules-doctrine.md](./skills-rules-doctrine.md) | AUDIT-SKILLS-RULES (Haiku) | CLAUDE.md's 18 standing rules, 8 skills, 3 hooks, 2 doctrine seeds, 6 governance files, all 27 ADRs, 13 operator rulings from the handoff | self-reported: 26 items COMPLETE, 20 PARTIAL, 0 NOT BUILT, 0 BUILT-DORMANT, 0 DUPLICATE, **shallow pass, see Haiku-lane caveat below** |
| [tools-inventory-unused-duplicates.md](./tools-inventory-unused-duplicates.md) | AUDIT-TOOLS (Haiku) | Every script/module under `fsi-app/scripts/` and `fsi-app/src/lib/`, all maintenance.yml steps, all fitness functions | self-reported: 209 scripts enumerated, 65 USED, 12 UNUSED (orphaned audit scripts), 2 DUPLICATE, 6 flagged MISSING-SOURCE, **2 of the MISSING-SOURCE-adjacent findings are REFUTED, see below** |

## Haiku-lane caveat and the two refuted findings

The two Haiku-model lanes (`skills-rules-doctrine.md`, `tools-inventory-unused-duplicates.md`)
ran a shallower read-then-report pass than the four Sonnet lanes, several of their own rows
say so directly (e.g. skills-rules-doctrine.md's Finding 6 is explicitly `[HYPOTHESIS,
not independently run against live workflows.yml this audit]`). Two of their findings were
investigated by the coordinator after all six lanes reported and found false; per CLAUDE.md
rule 14's corollary ("a flag that dissolves under evidence gets a same-session correction
wherever it was recorded, never a quiet drop"), both are corrected **in place**, with a
`[REFUTED]` line under the original claim, in `tools-inventory-unused-duplicates.md` (both
findings originated there, not in `skills-rules-doctrine.md`):

1. **"Three maintenance steps name non-existent files."** `tools-inventory-unused-duplicates.md`
   claimed `fsi-app/scripts/maintenance/review-digests.mjs`, and wrapper files
   `scripts/spec09/grid-queue.mjs` / `scripts/spec09/oem-roadmap.mjs`, do not exist
   (`FILE-NOT-FOUND` / `MISSING-SOURCE`). **[REFUTED]**: `fsi-app/scripts/maintenance/
   review-digests.mjs` exists (confirmed by `ls`, 4,460 bytes); `maintenance.yml`'s
   `spec09-grid-queue` and `spec09-oem-roadmap` steps call `scripts/spec09/grid-queue-producer.mjs`
   and `scripts/spec09/oem-roadmap-producer.mjs` directly, both exist, and no separate wrapper
   file is invoked or required. The finding assumed a wrapper-file naming convention the
   workflow does not use.
2. **"Two live crons."** The same file claimed `.github/workflows/trust-recompute.yml` and
   `.github/workflows/uptime-probes.yml` carry ACTIVE, uncommented `cron:` schedule lines.
   **[REFUTED]**: both files' `schedule:` blocks are commented out, each carrying an explicit
   `# DISARMED 2026-09-04 (operator ruling, CLAUDE.md rule 16...)` comment directly above the
   commented-out `cron:` line. Neither file has a live schedule trigger anywhere in this tree.
   (This matches what the Sonnet loop-harness-flywheel audit independently found and reported
   as `[CONFIRMED]`, "trust-recompute / uptime-probes cron disarm... COMPLETE", so the
   Haiku finding was checking stale content, not this tree's actual files.)

## Findings the next trains act on

Consolidated from the four Sonnet files' `[CONFIRMED]` findings, deduplicated across files
where the same underlying gap was independently found by more than one lane. Each cites the
file:section it came from and the plan workstream it belongs to.

1. **Ledger-consume's apply half has never fired with a real verdict.** `LEDGER_CONSUME_APPLY_ENABLED`
   is `true`, the code path exists, but every recorded run (chained or manual) is `mode:"plan"`
   or `mode:"export"`, zero `mode:"apply"` runs ever. Live: 57,469 `portal_link_candidates`
   rows `status='candidate'`, only 3 `status='promoted'`, ever. See *W1-W2-intake-population.md
   §"ledger-consume $0 verdict path"*; *loop-harness-flywheel-one-unit.md §3, §"Summary table"
   row "ledger-consume APPLY"*. **Workstream: W1.1.**

2. **`attach-found-sources.mjs` and `tier-opinions.mjs` are built, wired, unit-tested, and have
   never been dispatched in apply mode.** `source_tier_opinions` = 0 rows; no
   `attach-found-sources` run artifact anywhere in the tree; the 443-orphan-figure heal rule 18
   exists to force has not happened. See *W3-W4-sourcing-propagation.md §"W3, every figure
   sourced", rows 1-2*; *loop-harness-flywheel-one-unit.md §2, §"Findings" bullet 1*.
   **Workstream: W3.1, W3.3.**

3. **Migration 310 (item_grade into the 11 listing RPCs) was unapplied at audit time, so
   `RecordGradeBadge` rendered nothing on any ledger row anywhere in the product**, even where
   mounted (Regulations, Operations); Market and Research had no row-level mount of the
   component at all. See *W5-W6-W7-surfaces-community-discipline.md §W5, rows "RecordGradeBadge"
   and "item_grade in the listing RPCs"*. **Note for the next reader**: this audit's own tree
   (`1e6d9e8b`) predates this folder's landing, migration 310 has since been applied live
   (`docs/inventories/migrations.md`, `docs/ops/handoff-2026-09-05.md` §6) via the MIG310-FIX
   rewrite, closing the RPC half of this finding; the Market/Research row-mount gap is
   independent of the migration and was not addressed by that fix. **Workstream: W5, W3.4.**

4. **`apply-mint-batch.mjs`, the batch/population mint path, self-documents skipping rule-16
   participation** (connection discovery + forward-event extraction) on every record it mints,
   deferred to "a different turn" this audit found no evidence was ever dispatched for those
   batches; the single-item chokepoint (`mint-item.ts`) does this correctly. Hundreds of
   record-grade items (dispatch-ledger: 416 on 2026-09-04 alone) were minted with neither. See
   *W3-W4-sourcing-propagation.md §"Findings against the operator's three concerns", bullet
   3.1*. **Workstream: rule 17, W1.4.**

5. **`population-turn.yml`'s completion triggers nothing downstream, and `corpus-turn.yml` is
   wired to nothing on either side**, the plan's own §1 loop diagram implies a closed circle;
   the live workflow graph is a chain with two dead ends and one isolated island. Unlike
   `change-detection.yml` (which has a documented rule-16 ruling for its isolation),
   `corpus-turn.yml` has no equivalent ruling. See *loop-harness-flywheel-one-unit.md §4, items
   1-2*; *W1-W2-intake-population.md §"Event chaining without schedules"*. **Workstream: W1.4,
   plan §1.**

6. **DAG authorship (`derivation_edges`) reaches only 2 of the 9 producer families**, zero
   edges exist from `market_series` (the highest-volume producer table: `eia-v2-petroleum-spot`,
   `ecb-fx`, `eu-weekly-oil-bulletin`). The producers→propagation-drain chain fires and drains
   correctly, but for the majority of what producers write there is no edge to invalidate
   against, so the drain reports a false-clean "0 invalidated", spec 08 §2.2's own named
   failure mode. See *loop-harness-flywheel-one-unit.md §4 item 4*; *W3-W4-sourcing-propagation.md
   §"Corridor seeding" table*. **Workstream: W4.1.**

7. **`statutory_computations` and `estimated_values` remain at 0 rows**, months after the
   plan's own sequence table claimed a first live FuelEU Annex IV writer would land by T38/T42;
   the one rows-file present in the tree is explicitly self-labeled a non-production fixture,
   at a different path than the one `propagation-drain.yml` looks for. See *W3-W4-sourcing-
   propagation.md §"Spec-08 clause-by-clause" row "§4, FuelEU Annex IV"*;
   *loop-harness-flywheel-one-unit.md §"Prior claims refuted" item 8*. **Workstream: W4.2.**

8. **Two live promotion mechanisms coexist in the community schema; only one is wired.**
   `community_promotion_transitions`'s 5-gate machine (migration 295, `promotion.mjs`) has
   zero production callers; the actually-live path is the older `post_promotions` table
   (migration 041), wired into `POST /api/community/posts/[id]/promote`. Building the newer
   machine without retiring or superseding the older one risks the "two writers for one
   concept" pattern the closure gate's WRITER-READER check exists to catch. See *W5-W6-W7-
   surfaces-community-discipline.md §W6, row "`community_promotion_transitions` writer"*.
   **Workstream: W6.2.** Needs an explicit ADR on which is canonical.

9. **User-started community rooms exist but are not region/entity-bound as §W6.2 specifies.**
   `POST /api/community/groups` creates a real, wired, member-owned group, but every live
   group is a vertical, cross-regional room (`region: 'GLOBAL'` hardcoded); no region-scoped or
   entity-bound room-creation path exists anywhere in `src/app/api/community/**`. This also
   **refutes** a narrower first-pass grep this same lane ran that would have concluded no
   creation flow exists at all. See *W5-W6-W7-surfaces-community-discipline.md §W6, row
   "User-started room / group creation flow"*. **Workstream: W6.2.**

10. **The closure gate is genuinely green today, but seven STALE-NEXT allowlist entries are one
    train-landing away from flipping red with no code change**, because `currentTrain()` reads
    the highest `waveNN`/`trainNN` token in the branch's own git log and the comparison is
    strict (`currentTrain > expiryTrain`); at `currentTrain=46` these do not yet fail, and they
    will the instant a train-47 commit lands on the branch's history. Separately, ASSEMBLE-47
    re-granted ~49 F25/F38 entries (whose `expiry:46` all tripped simultaneously the moment
    train 46 landed) to wave52 rather than resolving them, "the exact anti-pattern the build
    plan's own root-cause section describes." See *W5-W6-W7-surfaces-community-discipline.md
    §"Gate runs, pasted verbatim" and §W7*; *loop-harness-flywheel-one-unit.md §6*.
    **Workstream: W7.1, W7.5.** **Note for the next reader**: this is exactly the state lane
    W7.1-CLOSE is now running against (see `docs/PROGRAM-BOARD.md` and the session-log
    postscript this folder's own INDEX line neighbors).

11. **Spec-09's CSV upload route would error live today.** `logic.ts` stamps every insert with
    `org_id`, depending on migration 311's org-scoped SELECT policies, but at audit time
    migration 311 was not applied and `surcharge_audits` had zero `org_id` columns live. A
    two-track-policy violation (code shipped ahead of its DDL) at audit time. See *W5-W6-W7-
    surfaces-community-discipline.md §W5, row "Spec-09 CSV upload flow"*. **Note for the next
    reader**: migration 311 has since been applied live (via the MIG311-FIX rewrite, see
    `docs/inventories/migrations.md`), closing the schema half of this finding; the route's own
    live end-to-end behavior was not re-tested by this audit folder. **Workstream: W5.**

## Prior claims each Sonnet file refuted

Beyond the two Haiku-file refutations above, each Sonnet file refuted specific claims from
`docs/audits/wiring-audit-2026-09-04/` or the build plan's own sequencing table, see each
file's own "Prior claims refuted" section for the full list with evidence. Headline
refutations: `ledger-consume.yml` **has** been dispatched (two real chained runs exist, both
`mode:"plan"`), the 2026-09-04 finding "NEVER DISPATCHED" is false, though the deeper gap
(no apply ever) persists; `institution-canonicalize`'s apply **has** run for real
(`sources.effective_tier` updated live); `RecordGradeBadge` **is** mounted on all four detail
surfaces today (the 2026-09-04 "3 of 4, Operations excluded" claim is refuted), the real,
narrower gap is list/ledger rows, not detail pages; `review-digests.mjs` **exists** as a file
(the 2026-09-04 "does NOT exist" claim is refuted) though its dispatch history is unconfirmed;
and the closure gate itself, the mechanism the build plan's own "root cause" section said did
not exist, **is now built, wired into CI, and passes green**, the single most consequential
refuted-prior-claim finding across all six files.

## Gate

`node fsi-app/scripts/verify/audit-finding-status.mjs` run against this tree: 0 unlabeled
finding-shaped lines under this folder (204 total across `docs/audits/`, all 204 outside this
folder, in pre-existing older audit files this folder does not touch).

## See also

- [docs/plans/complete-system-build-plan-2026-09-04.md](../../plans/complete-system-build-plan-2026-09-04.md), the plan every file above checks against.
- [docs/audits/wiring-audit-2026-09-04/](../wiring-audit-2026-09-04/), the prior audit these six files re-verify rather than trust.
- [docs/ops/handoff-2026-09-05.md](../../ops/handoff-2026-09-05.md), records the tree's actual landing state (PR #594, migrations 308-311 applied) since this audit's own tree (`1e6d9e8b`).
- [docs/PROGRAM-BOARD.md](../../PROGRAM-BOARD.md), the resume state; lane W7.1-CLOSE runs against the closure-gate state finding 10 above describes.
