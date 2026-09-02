# Maintenance runtime runbook

The dispatch-only runtime for the coordinator-only applies `docs/plans/finish-plan-2026-09-02.md`'s
MAINT paragraph names — seven applies that were built dry-by-default with no runtime to run them from.
Workflow: `.github/workflows/maintenance.yml`. Modeled on `.github/workflows/producers.yml` (secrets
verification, `mode` choice, per-step gating, population BEFORE/AFTER, artifact upload) and
`.github/workflows/population-turn.yml` (dispatch-only, no schedule). Every wrapper lives under
`fsi-app/scripts/maintenance/` and writes a `summary.json` into its own out-dir on every run.

## How to dispatch

Actions tab → **Maintenance** → Run workflow. Three inputs:

- **mode** — `dry` (default; reads/plans, writes nothing) or `apply` (writes through the guarded path
  in `fsi-app/scripts/lib/db.mjs`, when the step makes any write at all).
- **step** — one of the seven names below, or `all` (fans out every step in one dispatch, **dry only**
  — the workflow refuses `all` with `apply`; a single dispatch cannot carry seven rulings' worth of
  `arg` tokens, and naming one step per apply is the point).
- **arg** — optional per-step argument; several steps *require* an exact value in `apply` mode (a
  ruling-acceptance token, an archive/park choice, or a comma-separated id list). Named per step below.

**Secrets** (repository secrets, verified at the top of every run, same pair every guarded script
already requires): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

**Artifact**: `maintenance-<step>-<run_id>` (or `maintenance-all-<run_id>` for a dry `all` run),
containing one `<step>/summary.json` per step that ran — `{ step, mode, counts, applied, read_back,
... }`. Read every artifact against the live table it claims to have changed before the next dispatch
(finish-plan-2026-09-02.md §4) — the sections below name what to read back for each step.

---

## 1. `community-topics-seed`

**Purpose**: seed the 7-topic freight-sustainability taxonomy (`community_topics` +
`community_topic_groups`) that `fsi-app/scripts/seed/community-topics-seed.mjs` already builds — that
script is real, tested, dry-by-default code whose own header says "coordinator applies; this lane does
not run --apply", and nothing had ever dispatched it. Live count before this runtime existed: 0
`community_topics` rows.

**Upstream**: `fsi-app/scripts/seed/community-topics-seed.mjs` — `TOPICS`, `CANONICAL_ROOM_SLUGS`,
`planTopicLinks` imported unmodified into `fsi-app/scripts/maintenance/community-topics-seed.mjs`;
`resolveOwner` is a 5-line, deliberate duplicate (the original never exports its own).

**Gating**: none — no ruling gates this step, no `arg` required.

**Dispatch**: `mode=dry` lists topics/links that would be created; `mode=apply` writes through
`guardedInsert` (rule 015).

**Artifact / read back**: `summary.json` counts (`topics_created`, `links_created`, ...) plus
`read_back.topics_live_for_owner` / `read_back.links_live_for_owner`. Confirm against
`community_topics` / `community_topic_groups` for the resolved owner.

---

## 2. `tier-opinions`

**Finding, not a build**: `source_tier_opinions` sits at 0 rows because its writer never ran, not
because it's missing or broken. `recordTierOpinion`
(`fsi-app/src/lib/sources/tier-opinion-writer.ts`) is called from `registerCitedSources`
(`fsi-app/src/lib/sources/source-growth.ts:139`), itself called only from `registerBriefSources` /
`growSourcesFromBrief` inside brief generation (`canonical-pipeline.ts` / `generate-brief.ts`).
`registerCitedSources` only records an opinion when `tier_estimate != null`, and `tier_estimate` is
populated exactly once in this codebase: by the LLM brief-generation agent's own "New Sources
Identified" table (insert stamped `opinion_source: "haiku_brief_classifier"`).

**Ruling**: the standing $0 / no-LLM build-mode ruling (finish-plan-2026-09-02.md header) — there is no
non-LLM path anywhere in this repo that produces a `tier_estimate`.

**Runnable today: NO.** This step does no DB work — it has nothing to dry-run or apply. Dispatching it
prints the finding above and exits 0 in `mode=dry`, exits 2 in `mode=apply` (by design — an expected
outcome, not a failure to fix).

**Dispatch**: no `arg`. `read_back` is always empty.

---

## 3. `w1-dispositions`

**Purpose**: turn the W1 unwired-module register (`docs/plans/unwired-disposition-2026-08-31.md`) into
a machine-derived worklist — parsed from the document's own per-row `### N. — **Recommendation: WORD**`
sections (the authoritative verdict; the summary table's own recommendation cell misreads row #1's
wordplay), not hand-transcribed.

**Ruling**: R-C (finish-plan-2026-09-02.md §1) — "W1 register: wire 8 / delete 8 / hold 6 / keep 3".

**FINDING, reported not silently reconciled**: reading each row's own body section over all 26 rows
gives **WIRE 8 / DELETE 10 / HOLD 6 / KEEP-NO-ACTION 2**, not the document's own stated
"WIRE 8 · DELETE 8 · HOLD 6 · KEEP-NO-ACTION 3" line. Module #4 (`metered-gate.mjs`, the row the doc
calls "linked" to #3) is itself a real KEEP-NO-ACTION row by its own body section. `split_mismatch` is
always reported in the summary rather than resolved by the script.

**This step makes NO code edit, in either mode.** Deleting/wiring a module is a code change reviewed
through a PR, not a database write a service-role key can make. `apply` only unlocks the full
wire/delete worklist (module + one-line basis) for a follow-up CODE lane to execute, once R-C is
accepted; `applied` is always 0 by design.

**Dispatch**: `mode=apply` requires `arg=R-C-accepted`; anything else is refused (exit 1), no report
unlocked.

**Artifact / read back**: `summary.json`'s `wire` / `delete` / `hold` / `keep_no_action` lists (module +
basis) are the worklist. Nothing to read back in the database — this is a report for a code lane, not a
DB apply.

---

## 4. `origin-class-backfill`

**Purpose**: stamp `intelligence_items.origin_class` from `item_type` + `sources.tier`, per
`docs/plans/wo19-origin-class-backfill-mapping.md` §2/§4.

**Upstream**: no script implemented this before this lane (`grep -rn origin_class fsi-app/scripts`
finds only consumers). The rule table is transcribed 1:1 into
`fsi-app/scripts/maintenance/lib/origin-class-map.mjs` (`originClassFor`, pinned cell-by-cell against
the plan's table in its own test), imported unmodified by the wrapper.

**Ruling**: R-E (finish-plan-2026-09-02 §1) — "origin_class backfill mapping ... accept".

**Dispatch**: `mode=dry` groups every `origin_class IS NULL` row by the origin_class it would resolve
to (plus `no_source_id_stays_null` / `no_rule_stays_null` counts — `item_type='tool'` is deliberately
unmapped, per the plan's own flagged row awaiting a separate ruling). `mode=apply` requires
`arg=R-E-accepted`; writes through `guardedUpdateByIds` per origin_class group, idempotent
(`WHERE origin_class IS NULL`, re-checked per chunk via `applyMatch`).

**Artifact / read back**: `summary.json`'s `read_back.by_origin_class` — confirm against
`SELECT origin_class, count(*) FROM intelligence_items GROUP BY origin_class`.

---

## 5. `census-off-vertical`

**Purpose**: what to do with the 1,676 `census_worklist` rows the relevance screen
(`fsi-app/scripts/mint/lib/screen-verdict.mjs`, via `export-census-rows.mjs`'s `partitionByScreen` +
`loadReviewedVerdicts`, imported unmodified) calls off-vertical.

**Ruling**: R-A (finish-plan-2026-09-02 §1, **open**) — archive (reversible) or park.

**Dispatch**:
- `mode=dry` — reads every `dryrun_disposition='would_mint'` row, partitions by the shared screen, and
  counts `on_vertical` / `off_vertical` / `ambiguous`.
- `mode=apply, arg=park` — no-op. The export gate (`export-census-rows.mjs`'s own `partitionByScreen`)
  already withholds these rows from minting; "park" is the status quo.
- `mode=apply, arg=archive` — **NOT RUNNABLE today.** `census_worklist` (migration 221) has no
  `is_archived` / `archive_reason` columns — only `flagged_reason`/`flagged_at` (a narrower
  "malformed/incomplete" vocabulary) and the `enumeration_status` ladder. `archivePatch("census_worklist",
  ...)` has nothing to set on this table. This step stays dry-only for `archive` until either a
  migration adds archive columns, or R-A is decided as `park` (no schema change needed).

**Artifact / read back**: `summary.json` counts. No write happens under either apply arg today, so
nothing to read back yet.

---

## 6. `review-digests`

**Purpose**: run `fsi-app/scripts/review/build-review-digests.mjs --out <dir>` — the
ratification-digest builder finish-plan-2026-09-02.md's **R1 paragraph** (a sibling lane) is building,
at the decision's unit (rules, not rows): 927 provisional sources, 331 canonical candidates, 1,457
portal links, 91 gap dispositions.

**This script does NOT exist in this worktree.** This step's whole job is to fail clearly instead of a
bare "command not found": `mode=dry` reports whether the script is present (and does nothing else);
`mode=apply` runs it with `--out <this run's artifact dir>` when present, or fails the step
(`exitCode=1`, note: `NOT PRESENT: ...`) when absent.

**Contract this step depends on** (so R1's lane knows what it must satisfy): the script must accept
`--out <dir>` and exit 0 on success, writing its digest files under `<dir>`. Nothing else is assumed.

**Ruling**: none directly — R1's own write set is what must land before this step can do anything.

**Artifact / read back**: whatever `build-review-digests.mjs` writes under the out-dir, uploaded
whole. `read_back` is always empty by design — this step changes no live table, only files.

---

## 7. `tag-ratification`

**Purpose**: apply operator-ratified TAG proposals — `integrity_flags` rows `propose-tags.mjs` opened,
resolved by an operator with `ratify:tags` in `resolution_note`.

**Upstream, both halves already exist**: `fsi-app/scripts/connections/propose-tags.mjs` (proposes,
already dispatched read-only from `population-turn.yml`) and `fsi-app/scripts/connections/apply-tags.mjs`
(the apply half — `evaluateApplication` / `applyTags`, imported unmodified). This wrapper is
orchestration only; no logic was reimplemented (the existing code already has an apply half).

**Ruling**: none named directly — gated by the per-flag `ratify:tags` marker itself (an operator
resolving a flag IS the ratification), not a single planwide ruling token.

**Dispatch**:
- `mode=dry` — lists every `status='resolved'` flag in the TAG namespace, split into `ratifiable`
  (carries the `ratify:tags` marker + a parseable non-empty proposal list) and
  `not_ratifiable_reasons` (resolved for some other reason).
- `mode=apply` requires `arg` = a comma-separated list of `integrity_flags` ids to apply this run
  (never "apply everything ratified" from one dispatch — the coordinator names exactly which proposals
  land). Each id runs through `apply-tags.mjs`'s own `applyTags({execute:true})` (merge-only tag write,
  cited, snapshotted).
- Discovery re-run (`apply-tags.mjs`'s own optional step 6) is **not** repeated by this step — the
  summary's `note` carries the documented fallback:
  `node scripts/connections/discover-for-items.mjs --ids <item id(s)> --execute`.

**Artifact / read back**: `summary.json`'s `read_back` — the touched items'
`operational_scenario_tags` / `compliance_object_tags` / `topic_tags` after the merge. Confirm against
`intelligence_items` for those ids.
