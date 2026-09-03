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

## 4a. `source-type-backfill`

**Purpose**: populate `sources.source_type` (migration 288, applied live 2026-09-02) from the taxonomy
classifier, so `coverage-gaps.ts` reads the column instead of re-deriving types from regexes on every
cache miss.

**Upstream**: `fsi-app/scripts/sources/backfill-source-type.mjs` (`main`, `planBackfill`; Lane HYG-2),
which imports `src/lib/sources/source-type-taxonomy.mjs`'s `classifySourceType`. The wrapper
(`scripts/maintenance/source-type-backfill.mjs`, added by the coordinator after the Wave 1 train) adapts
it to the runtime's summary shape and reads back the classified count.

**Ruling**: none. The taxonomy is the fix the STOPGAP itself named
(`docs/plans/SOURCE-TYPE-TAXONOMY-PROPOSAL.md`); the classifier only fills `NULL` rows.

**Dispatch**: `mode=dry` prints the distribution, `to_write`, and the unclassifiable remainder (only
`environmental_body` and `legislature` are classifiable today, the STOPGAP's own regexes; everything
else stays `NULL`, which means "not yet classified", never "zero types"). `mode=apply` writes through
`guardedUpdateByIds` per type-combination group, `WHERE source_type IS NULL` re-checked per chunk.

**Artifact / read back**: `summary.json`'s `read_back.source_type_not_null_total` — confirm against
`SELECT count(*) FROM sources WHERE source_type IS NOT NULL`.

---

## 4b. `derive-obligations`

**Purpose**: populate `obligations` (migration 290, applied 2026-09-03) from `item_forward_events`: one
register row per dated forward event, carrying the parent item's jurisdiction, canonical modes and a
deterministically classified `binding_position` (NULL when the spec-01 §1 table does not name the
instrument). Read by `/regulations` (ObligationRegister).

**Upstream**: `fsi-app/scripts/obligations/derive-obligations.mjs` (Lane OBLIG); classifier
`src/lib/obligations/classify-binding-position.mjs`. Idempotent on `forward_event_id`.

**Ruling**: none.

**Dispatch**: `mode=dry` prints forward events, derived, already registered, to insert, and the
binding-position breakdown. `mode=apply` inserts through `guardedInsertMany` and reads back the register.

**Artifact / read back**: `summary.json`'s `read_back.obligations_total` / `by_binding_position` against
`SELECT binding_position, count(*) FROM obligations GROUP BY 1`.

---

## 4c. `seed-corridors`

**Purpose**: corridor identity rows on the entity spine (`entities.kind = 'corridor'`, id
`cl:corridor:<ORIGIN>-<DEST>:<mode>` per ADR-024 §4). Read by the Market Intel carbon-cost overlay.

**Upstream**: `fsi-app/scripts/entities/seed-corridors.mjs` (Lane CORR). Candidates come from what the
corpus names (`market_series.series_key`, `regional_data_facts.fact_label` under the `corridor:` convention);
when nothing does, the ADR-024 worked example (CNSHA–NLRTM, ocean) is planned and `using_fallback` is true.

**Ruling**: none.

**Dispatch**: `mode=dry` lists candidates and which would be created; `mode=apply` inserts the missing
ones through the guarded path and reads back every `kind='corridor'` entity id.

**Artifact / read back**: `summary.json`'s `read_back.entity_ids` against
`SELECT entity_id FROM entities WHERE kind = 'corridor'`.

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

## 6a. `tag-proposals`

**Purpose**: write the TAG proposal flags that make untagged items VISIBLE to an operator — the write
half `tag-ratification` (§7, below) has always had a caller for, but that `propose-tags.mjs` itself
never had until this step. **The defect this closes** (coordinator-confirmed, 2026-09-03): 339 of 619
verified, live `intelligence_items` carry all three connection-signature tag arrays empty
(`topic_tags`, `compliance_object_tags`, `operational_scenario_tags`), so `discover.mjs` scores them 0
edges — see `propose-tags.mjs`'s own header for the exact mechanism. `population-turn.yml` has always
run `propose-tags.mjs --dry --since <run start>` unconditionally, which computes the same plan but
writes nothing (`--dry` is that script's own default and its DRY RUN branch writes nothing, by
construction); no maintenance step ever called its `--execute` path. Live, before this step: 0 open and
0 resolved `flywheel-tag:` `integrity_flags` rows have ever existed.

**Upstream**: `fsi-app/scripts/connections/propose-tags.mjs`'s own `proposeTags()` core — extracted from
that file's former inline `main()` body (Lane TAG-PROPOSALS, 2026-09-03) into a DB-injected, exported
function so this step could import and call it unmodified, the same "logic lives once, deps injected"
shape `apply-tags.mjs`'s `applyTags()` already established for §7. Nothing is reimplemented; the CLI's
own stdout is byte-for-byte unchanged by that extraction.

**Ruling**: none — gated by the operator's own standing rule (`propose-tags.mjs`'s header): "NO
assumptions, NEVER silent auto-tagging; tag PROPOSALS go to operator ratification." Writing a proposal
flag IS the visibility that rule requires; it is **not** tagging. This step **never writes
`intelligence_items`** — only `integrity_flags` proposal rows. A proposal becomes a written tag only
once an operator resolves its flag with the `ratify:tags` marker and §7 (`tag-ratification`) applies it.

**Dispatch**: `arg` selects the population, exactly as `propose-tags.mjs`'s own CLI selectors do:
- (blank) or `untagged` — every verified, live item with all three signature tag arrays empty (the
  default, matching `propose-tags.mjs`'s own default).
- `since:<ISO-date>` — items `created_at >=` that timestamp (narrow scope; stale-resolution is scoped to
  this run's own selection, never global).
- `ids:<uuid,uuid,...>` — exactly these items (selected regardless of tag state; narrowed to
  empty-signature items before any flag is built).

`mode=dry` reports counts per selection, a per-item proposal preview (item id + the proposals
`derive-tags.mjs` found), and the exact apply command for this selection; writes nothing. `mode=apply`
does **not** require `arg` — an unqualified apply runs the same `untagged` default `propose-tags.mjs`'s
own `--execute` (no selector) runs; this mirrors that script's own CLI rather than `tag-ratification`'s
per-id-required gate, because writing a PROPOSAL is not the higher-blast-radius action a blanket
apply-and-ratify would be. Writes new proposal rows via the guarded insert path and auto-resolves stale
ones no longer reproduced by the fresh computation (rule 015).

**Artifact / read back**: `summary.json`'s `counts.preview` (per-item proposals this run would/did
write) and `counts.plan` (`new_count` / `stale_count` / `unchanged`). `read_back` is always empty — this
step changes no `intelligence_items` row, only `integrity_flags`; confirm against
`SELECT count(*) FROM integrity_flags WHERE status = 'open' AND created_by LIKE 'flywheel-tag:%'`.

---

## 7. `tag-ratification`

**Purpose**: apply operator-ratified TAG proposals — `integrity_flags` rows `propose-tags.mjs` opened
(§6a, above writes them; before this lane, `population-turn.yml`'s `--dry` run only ever previewed them
in a log — see §6a), resolved by an operator with `ratify:tags` in `resolution_note`.

**Upstream, both halves already exist**: `fsi-app/scripts/connections/propose-tags.mjs` (proposes; §6a
is now its write dispatch, `population-turn.yml`'s own dispatch stays `--dry`-only, a log preview) and
`fsi-app/scripts/connections/apply-tags.mjs` (the apply half — `evaluateApplication` / `applyTags`,
imported unmodified). This wrapper is orchestration only; no logic was reimplemented (the existing code
already has an apply half).

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

---

## 8. `provenance-heal`

**Purpose**: attach the grounding a quarantined or archived-unreasoned item was missing, per the
operator's ruling (verbatim, 2026-09-03): "if items are being flagged as not credible for the site
because of not having sources that is an issue with finding the source not that item. you need to attach
a source. the item isn't [bad] because you didn't do that." Live population this closes against
(coordinator-confirmed, Supabase, 2026-09-03): 97 live `quarantined` items (83 × criterion 7
`gate_a_unproven_or_stale`, ~36 × criterion 5 `missing_required_slot`, ~30 × criterion 3 ungrounded
claims — an item can fail more than one), 135 live items with no grounding capture at all, 58 archived
items with `archive_reason IS NULL` (51 `unverified` + 7 `quarantined`), and 149 verified
market_signal/initiative/research_finding items predating the wave-3 required slots (migration 299,
written and not yet applied — see §4 header note below).

**Upstream**: `scripts/mint/heal-provenance.mjs`'s own guarded `main()` — five steps, each reading what
the previous wrote (capture, ground, slots, Gate A, re-derive), importing every governing file unmodified:
`export-census-rows.mjs` (per-family capture resolution — Cellar-first for CELEX, the Federal Register
API for federalregister.gov, a plain polite GET otherwise), `record-facts.mjs` /
`record-facts-research.mjs` (slot extraction — the SAME extractors a fresh mint uses), `write-item.ts`'s
`buildGateARow` (the live Gate-A scanner), and `item-type-required-slots.json` (the slot vocabulary, read
only). This wrapper (`scripts/maintenance/provenance-heal.mjs`) re-exports that core's `main`/
`parseSelection` unmodified and wires the real `db.mjs` guarded writes + a 1 req/s polite fetch
(`export-census-rows.mjs`'s own `makePoliteFetch`) — see the core file's own header for the exact
per-step contract.

**Ruling**: the operator's ruling above is the gate — there is no separate R-token. `--arg` selects the
population:
- (blank) or `quarantined-live` — every live (`is_archived=false`), `quarantined` item (the default).
- `archived-unreasoned` — archived items with `archive_reason IS NULL` (the same ruling, archive side).
- `ids:<uuid,uuid,...>` — exactly these items, any current status.
- `slots-backfill` — every verified, live `market_signal`/`initiative`/`research_finding` item ACTUALLY
  missing a slot the kit's `item-type-required-slots.json` now requires (narrowed live, not just by
  item_type — an item already carrying the new slot's FACT-or-GAP claim is skipped). **Sequencing note**:
  migration 299 (the matching LIVE `item_type_required_slots` rows for `corridor_identity` /
  `evidence_agreement_signal` / `source_authority_signal`) is written but **not applied** — the kit
  (`item-type-required-slots.json`) is deliberately stricter than the live table until this selection has
  run once (see that migration's own header). Dispatch `slots-backfill --apply` BEFORE the migration
  lands, so criterion 5 never actually sees a gap on a live read once the migration applies.

**Dispatch**: `mode=dry` reads every selected item's REAL current captures/claims/sections live and plans
all five steps (which claims would ground, which slots would fill FACT vs GAP, what Gate A would say, what
`validate_item_provenance` says right now) with **no network fetch and no write** — it lists the fetches
it would make. `mode=apply` performs the plan through the guarded path (rule 015): `agent_run_searches`
inserts (full text, never truncated — ADR-016), `section_claim_provenance` span rewrites/inserts,
`intelligence_item_sections` inserts/updates, `item_gate_a_state` upserts, and the `intelligence_items`
touch that fires `set_provenance_status` (the same touch `rederive-record-provenance.mjs` uses; ADR-017
gates the `-> verified` escalation to `pg_trigger_depth() >= 2`, which this touch satisfies by
construction — never a direct status write). An item still failing after all five steps is left exactly
as it is, reported with the remaining criterion; nothing here forces a status or invents a fact. No
`--arg` beyond a valid selection is required for `apply` (unlike `tag-ratification`'s per-id gate): every
write this step makes is additive/reversible — grounding a span, filling an honest GAP, or un-archiving a
row `ADR-017`'s trigger-depth binding independently allows — never a downgrade or a deletion.

**Artifact / read back**: `summary.json`'s `counts` (`healed_verified`, `capture_held`,
`ungrounded_after_capture`, `slots_written_fact`/`slots_written_gap`, `gate_a_written`, `unarchived`,
`still_failing`) and `per_item` (every step's outcome + evidence, per item). Confirm against
`SELECT provenance_status, count(*) FROM intelligence_items WHERE is_archived=false GROUP BY 1` and
`SELECT count(*) FROM intelligence_items WHERE is_archived AND archive_reason IS NULL` before/after.
