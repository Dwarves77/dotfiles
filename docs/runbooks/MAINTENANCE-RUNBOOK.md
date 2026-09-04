# Maintenance runtime runbook

The dispatch-only runtime for the coordinator-only applies `docs/plans/finish-plan-2026-09-02.md`'s
MAINT paragraph names, one section per step below, in dispatch order, added as each was built
dry-by-default with no runtime to run it from. The section list grows as new MAINT steps land; do not
assume a fixed count, read the numbered headings below for the current set.
Workflow: `.github/workflows/maintenance.yml`. Modeled on `.github/workflows/producers.yml` (secrets
verification, `mode` choice, per-step gating, population BEFORE/AFTER, artifact upload) and
`.github/workflows/population-turn.yml` (dispatch-only, no schedule). Every wrapper lives under
`fsi-app/scripts/maintenance/` and writes a `summary.json` into its own out-dir on every run.

## How to dispatch

Actions tab → **Maintenance** → Run workflow. Three inputs:

- **mode** — `dry` (default; reads/plans, writes nothing) or `apply` (writes through the guarded path
  in `fsi-app/scripts/lib/db.mjs`, when the step makes any write at all).
- **step** — one of the names below (see the numbered section headings for the current list), or `all`
  (fans out every step in one dispatch, **dry only** — the workflow refuses `all` with `apply`; a single
  dispatch cannot carry every step's own ruling's worth of `arg` tokens, and naming one step per apply
  is the point).
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

**Purpose**: apply TAG proposals — `integrity_flags` rows `propose-tags.mjs` opened (§6a, above writes
them; before this lane, `population-turn.yml`'s `--dry` run only ever previewed them in a log — see
§6a) — either (a) resolved by an operator with `ratify:tags` in `resolution_note` (the `arg`-id path,
unchanged since 2026-09-02), or (b) auto-adopted at/above `apply-tags.mjs`'s `AUTO_ADOPT_THRESHOLD`
without waiting for ratification (the `arg="auto"` path, added 2026-09-03).

**Upstream, everything already exists**: `fsi-app/scripts/connections/propose-tags.mjs` (proposes; §6a
is now its write dispatch, `population-turn.yml`'s own dispatch stays `--dry`-only, a log preview) and
`fsi-app/scripts/connections/apply-tags.mjs` (both apply halves — `evaluateApplication`/`applyTags` for
the ratify path, `evaluateAutoAdoption`/`partitionByConfidence`/`autoAdoptTags` for the auto-adoption
path, all imported unmodified). This wrapper is orchestration only; no logic is reimplemented here.

**Ruling (id path)**: none named directly — gated by the per-flag `ratify:tags` marker itself (an
operator resolving a flag IS the ratification), not a single planwide ruling token.

**Ruling (auto path, 2026-09-03, CONFIRMED in session)**: the flywheel's own design spec closes its
second loop "without a human in the path" (`docs/specs/08-flywheel-design.md:128`), and 339 of 619
verified live items sat untagged with zero tag flags ever ratified — the ratify-only gate was a dead
end in practice. New rule: a DETERMINISTIC derivation (derive-tags.mjs's `confidence: "high"` tier — a
keyword matched in the item's own title/instrument-key, not just its body text) auto-adopts with
provenance recorded on the flag row (`resolution_note = auto-adopted:tags:<threshold>`,
`resolved_by='apply-tags.mjs'`); lower-confidence (`medium`) proposals stay on an open flag for review
exactly as before. Full reasoning + the measured threshold justification: `apply-tags.mjs`'s own header.

**Dispatch, id path (unchanged)**:
- `mode=dry` — lists every `status='resolved'` flag in the TAG namespace, split into `ratifiable`
  (carries the `ratify:tags` marker + a parseable non-empty proposal list) and
  `not_ratifiable_reasons` (resolved for some other reason).
- `mode=apply` requires `arg` = a comma-separated list of `integrity_flags` ids to apply this run
  (never "apply everything ratified" from one dispatch — the coordinator names exactly which proposals
  land). Each id runs through `apply-tags.mjs`'s own `applyTags({execute:true})` (merge-only tag write,
  cited, snapshotted).

**Dispatch, auto path (new)**:
- `arg=auto` (case-insensitive) with `mode=dry` — lists every OPEN TAG_NAMESPACE flag, split into
  `eligible` (>=1 proposal at/above threshold, with its `eligible_count`/`residue_count`) and
  `below_threshold_count`/`not_adoptable_count`. Writes nothing.
- `arg=auto` with `mode=apply` — runs every eligible flag through `autoAdoptTags({execute:true})`: this
  is the one dispatch shape where "apply everything eligible" is intentional (eligibility is
  derive-tags.mjs's own deterministic evidence, not a per-flag operator judgment call). Writes ONLY the
  eligible (>= threshold) tags per flag (merge-only, never removes an existing tag); a flag whose every
  proposal cleared the threshold is resolved (`auto-adopted:tags:<threshold>`); a flag with some
  below-threshold residue is left OPEN, untouched, with the eligible tags already written — a human can
  still ratify the residue later via the ordinary `ratify:tags` id path (a harmless no-op merge for the
  part already applied). Idempotent — safe to re-dispatch; an already-resolved flag is skipped, and a
  still-open partial flag recomputes the same split and writes a no-op the second time.

**Discovery re-run**: not repeated by either path (`apply-tags.mjs`'s own optional step 6) — each
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
`still_failing`, plus the second-pass counters below) and `per_item` (every step's outcome + evidence,
per item). Confirm against
`SELECT provenance_status, count(*) FROM intelligence_items WHERE is_archived=false GROUP BY 1` and
`SELECT count(*) FROM intelligence_items WHERE is_archived AND archive_reason IS NULL` before/after.

**Second pass (lane HEAL-2, 2026-09-03)**: the first pass's own `provenance-heal --arg quarantined-live
apply` run (coordinator-confirmed, live, 2026-09-03) landed gate-A state and slot claims on the 97
quarantined-live items (gate A written for 97, 79 slot claims, 4 spans re-grounded) but only 2 items came
back `verified` — the survivors were, in order of volume: criterion 3 `fact_below_authority_floor` (the
FACT's own `source_id` resolves to a tier ABOVE the item's floor, or `source_id` is NULL) — 596 claims on
tiers 3-7 plus 218 with a NULL `source_id`, floor = tier 2 unconditional for the reg family (migration
158); criterion 7 `gate_a_unproven_or_stale` (a prose fact with no span-proven claim) — 82 items;
criterion 4 `analysis_missing_label_syntax` (190) + `unlabeled_assertion` (29); a residue of criterion 3
`fact_span_not_in_source` (24), criterion 2 `ungrounded_url` (5), and criteria 5/6 (4+1). Operator ruling
this second pass builds (verbatim, same day): "if items are being flagged as not credible for the site
because of not having sources that is an issue with finding the source not that item. you need to attach
a source." Five new steps, run inside the SAME `healOneItem` pass, after CAPTURE/GROUND/SLOTS and before
the (now single, final) GATE A + RE-DERIVE:
- **B, OWN-BODY** — when the item's own registered source carries no `institution_id` (migration 122; a
  brand-new writer surface — nothing else in the codebase has ever written it), resolve one by the SAME
  identity rule `institution-key.mjs`/`registerSource` already dedup the `sources` registry by, and write
  it through the guarded path. Targets the 7 items whose own-body standard-floor scoping (migration 202)
  was defeated by a NULL institution.
- **A, RESOURCE** — a FACT claim failing the authority floor or carrying a NULL `source_id` gets
  `source_id`/`search_result_id` re-pointed to a floor-qualifying capture, found across three ranked
  buckets: the item's own canonical capture, another of the item's captures from a floor-qualifying
  source, then the corpus pool (OTHER items' captures of the SAME canonical URL — a batch-scoped
  `.in("result_url", ...)` read, never a whole-table `agent_run_searches` scan). `source_span` is
  rewritten to the verbatim match; `claim_text` is never touched.
- **E, RECLASSIFY** — the residue A and GROUND could verify nowhere: re-kind FACT -> ANALYSIS (the
  labeling discipline's own honest escape hatch), `claim_text` unchanged.
- **C, ORPHANS** — a Gate-A orphan (criterion 7) searched across STEP A's same capture pool; found ->
  a new FACT claim (verbatim span = the token); found nowhere -> reported `unprovable`, never invented —
  the brief is NEVER edited by this step.
- **D, RELABEL** — the ONLY step that edits prose, and only by PREPENDING one of the four label forms to
  a paragraph an ANALYSIS claim or an unlabeled-assertion section's modal sentence already lives in.
  Nothing reworded, deleted, or moved.
New `counts`: `own_body_resolved`, `resourced`/`unresourced`, `orphans_grounded`/`orphans_unprovable`,
`relabeled_paragraphs`, `refactored_to_analysis`. New writes: `sources.institution_id` (UPDATE) and
`institutions` (INSERT, find-or-create) — both recorded narratively in
`fsi-app/docs/inventories/shared-dataset-ownership.md`'s "Open leaks summary" rather than the enforced
JSON allowlist, the SAME basis that document already applies to `sources` itself (not a harness/flywheel
shared-8 table). Per-step expected effect on the 95 survivors is `[INFERRED]` from the coordinator's own
failure-count breakdown above until the coordinator's own apply dispatch measures it.

**Third pass (lane HEAL-3, 2026-09-03)**: the second pass's own `provenance-heal --arg quarantined-live
apply` run (coordinator-confirmed against the run artifact and the live table, run 33797952379) landed on
the 95 quarantined-live survivors — `resourced 57, unresourced 616, own_body_resolved 6, orphans_grounded
130, orphans_unprovable 862, relabeled_paragraphs 228, refactored_to_analysis 638, gate_a_written 95,
healed_verified 0, still_failing 95` — and RE-DERIVED to a WORSE label/slot shape than the run started
with: `analysis_missing_label_syntax` 594 (up from 190), `gate_a_unproven_or_stale` 88,
`fact_below_authority_floor` 81, `missing_required_slot` 28 (up from 4), `ungrounded_url` 5,
`missing_full_brief` 1. Live verified count unchanged at 621. Three defects fixed, one broadening, all in
`scripts/mint/heal-provenance.mjs` (HEAL_VERSION `hp3-2026-09-03.1`):

1. **RELABEL never applying, mis-attributed to step order.** The dispatch attributed the tripled
   `analysis_missing_label_syntax` count to RELABEL (D) running before RECLASSIFY (E) — re-reading the
   file's own step sequence (STEP B → STEP A → STEP E → STEP C → STEP D, unchanged since the second pass)
   shows E already runs before D; that premise is **[REFUTED]**, corrected in place per rule 14. The real
   mechanism: RELABEL's owning-section/paragraph lookup used a raw case-folded `.includes()`, never the
   normalizer GROUND itself uses (whitespace runs, curly/straight quotes, HTML entities) — a re-kinded
   claim whose `claim_text` differed from its own paragraph by that drift matched neither lookup, and the
   miss was silently swallowed with no report entry at all. Fixed: both lookups now go through
   `locateSpanInText` (the same three-tier exact/normalized/normalized_ci matcher GROUND already uses),
   and every miss — no owning section, or an owning section whose paragraph never matches even under
   normalization — reports `no_owning_section_found` with the claim id.
2. **Slot FACT residue re-kinded to ANALYSIS, dropping criterion-5 coverage.** RECLASSIFY had no awareness
   of the `"[<slot_key>] "` marker (migrations 114/119/121, migration 299's own self-check) and re-kinded
   slot-claim residue the same as any other claim, which is how `missing_required_slot` went from 4 to 28.
   Fixed two ways: a new **SLOT-REPAIR** step (before RELABEL) retroactively converts every already
   mis-kinded ANALYSIS claim carrying a required-slot marker back to the kit's own honest GAP for that
   slot; RECLASSIFY itself now branches the same way prospectively — a required-slot FACT claim's
   unrecoverable residue becomes GAP, never ANALYSIS. Both paths call `buildSlotClaim` (with
   `capturedText=""`) for the GAP text, so it is byte-identical to a fresh honest-absence write, never
   hand-duplicated.
3. **Gate A vs. labels — a finding, not a fix** (`gate-a-scan.mjs` is a mint governing file, out of this
   lane's write set). Code path: `scanBrief` (`fsi-app/scripts/mint/lib/gate-a-scan.mjs`) takes only
   `fullBrief` + `factClaims`; it has no reference anywhere to `ANALYSIS_LABEL_RE` or any label form, and
   its only coverage test is a literal-substring check against the FACT-claim corpus (`isBacked`). A
   figure/date token inside an already-labeled `*Analytical inference:*` paragraph is therefore still
   counted as a Gate-A orphan — the label satisfies criterion 4 only, never criterion 7. Compounding this:
   `item.full_brief` (what `scanBrief` scans, per `validate-mint-payload.mjs` criterion 7 and this file's
   own `planGateA`) and a section's `content_md` (what RELABEL edits, and what criterion 4 itself scans)
   are two SEPARATE stored fields — RELABEL's own prose edits never touch `full_brief`, so even a
   successfully labeled paragraph has zero effect on the Gate-A orphan count. Measurement the dispatch
   asked for (862 unprovable orphans, full_brief prose vs. section prose): **100% full_brief, 0% section
   prose**, established analytically from the scanner's own signature (`scanBrief(fullBrief, factClaims,
   ...)` never receives section content at all) rather than from the run artifact, which this lane's
   worktree has neither DB nor artifact access to.
4. **CAPTURE-CITED (broadening).** STEP 1's CAPTURE only ever fetched when an item had NO usable capture
   at all. A new step, CAPTURE-CITED, runs before RESOURCE/ORPHANS and fetches every URL an item's
   sections/claims already cite that is not yet captured for that item: URLs literally present in section
   `content_md` (criterion 2's own parenthesis-balanced `URL_RE`, mirrored verbatim) plus each claim's
   registered source URL (resolved via `source_id` → the `sources` registry, since a claim carries no
   `source_url` column of its own). `intelligence_items.source_urls`, named in the brief as a third URL
   source, does **not exist** as a column or array anywhere in `supabase/migrations` (grepped in full,
   2026-09-03) and is never read. Bounded to 25 fetches/item/run (`CAPTURE_CITED_MAX_PER_ITEM`), reported
   with the overflow count. Adds a PDF branch (`src/lib/sources/pdf-extract.mjs`'s `pdfToText`, imported
   unmodified) the "plain GET otherwise" family never had; a mislabeled/corrupt PDF is held
   `pdf_unsupported`, never retried blind. New capture rows land in the same shared `captures` array
   RESOURCE/ORPHANS's own bucket builders already iterate, so no further wiring broadens their pool; this
   also directly targets criterion 2's `ungrounded_url` failure (a cited URL becomes a captured
   `agent_run_searches` row).

New `counts`: `slot_repaired_to_gap`, `reclassified_to_gap` (was folded into `refactored_to_analysis`
before this pass), `relabel_no_owning_section`, `cited_captured`/`cited_held`/`cited_bound_hit_items`. New
top-level summary field: `final_failures_by_item` (`{id, item_type, outcome, failures}` per item) — the
per-item residue the dispatch asked for, so the coordinator can read exactly which criterion each
still-failing item is stuck on without re-querying. No new table written (CAPTURE-CITED reuses the
existing `agent_run_searches`/`insertSearch` writer surface, distinguished only by `search_query =
"heal-provenance:capture-cited"`), so `shared-dataset-ownership.md` is unchanged by this pass. No mint
governing file touched (`gate-a-scan.mjs` read only, for the criterion-3 finding above).

**[CONFIRMED, coordinator-reported] Run #20, the first apply run under HEAL-5** (quarantined-live, the
same 95 items, adding the Wayback archive fallback + OJ-issue resolution — see
`scripts/mint/heal-provenance.mjs`'s own FIFTH PASS header) **ran 15m20s and was CANCELLED** by the
`maintain` job's then-`timeout-minutes: 15` — never finished. Because `scripts/maintenance/lib/cli.mjs`'s
own `writeSummary()` runs exactly once, after `main()` returns, a killed run wrote **no `summary.json` at
all**: no artifact content, no per-item residue, and no record of which of the run's own per-item DB
writes (each already applied through the guarded path, before the kill) actually landed on which items.

**Sixth pass (lane HEAL-BUDGET, 2026-09-04, `HEAL_VERSION` now `hp5-2026-09-04.2`)** fixes this, entirely
inside `heal-provenance.mjs` and its wrapper — `.github/workflows/maintenance.yml`'s "Upload this run's
step artifact(s)" step already carried `if: always()` before this pass (re-verified; GitHub's own docs
confirm `always()` runs even on a cancelled/timed-out job), so the observed "no artifact" was an *empty*
directory being uploaded honestly (`if-no-files-found: warn`), never a missing conditional — that step is
unchanged by this pass. Four changes:

1. **Job timeout raised 15 → 30 minutes**, with the arithmetic in the workflow file's own comment: HEAL-4
   (run #17, no archive fallback) measured 6.84s/item (650s / 95 items) cleanly; HEAL-5 adds, per the SAME
   60 `capture_blocked`/`capture_thin` cited urls the PRIOR run itself measured, up to 2 more
   politeness-paced (1 req/s) fetches each, plus up to 2 more per each of the 5
   `canonical_key_unresolved` OJ-issue items — ~130 extra 1s-paced requests, ≥130s of added wall time from
   pacing alone before real latency/PDF-extraction time is counted, which is why run #20's 920s (and
   counting — it had NOT finished) already overran HEAL-4's clean 650s by more than that floor. 30 minutes
   gives ~2× headroom over the already-insufficient 920s this job actually observed.
2. **Time budget.** `provenance-heal`'s step now sets `HEAL_TIME_BUDGET_SECONDS: '1500'` (25 min — 5
   minutes of margin under the 30-minute job timeout for Install/Population-BEFORE/AFTER/upload). The
   wrapper derives `deps.timeBudgetSeconds` from it; `heal-provenance.mjs`'s `main()` checks the budget
   **before starting each item** (never mid-item — an item's own ten-step sequence always runs to
   completion or not at all) and, once spent, stops cleanly: `summary.json` gets `stopped_at_budget: true`,
   `items_processed`, `items_remaining` (the ids never reached), exits **0** (a budget stop is an orderly
   partial completion, never a failure), with a console line naming the counts. A local by-hand run with no
   `HEAL_TIME_BUDGET_SECONDS` set is unbounded, unchanged from every prior pass.
3. **Checkpoint.** `main()` now writes `summary.json` **atomically** (temp file, then an os-level rename —
   POSIX-atomic on the runner's own `$RUNNER_TEMP`) **after every item**, not only once at the end — so a
   run killed by the runner itself (not just one that hits its own time budget and exits cleanly) still
   leaves the true, complete state of every item processed so far on disk. `cli.mjs`'s own final
   `writeSummary()` (unmodified) is still the last word on a run that finishes normally; the per-item
   checkpoint is a strictly additive safety net under it.
4. **Resume.** No new selection mode: a budget-stopped run's `items_remaining` is exactly the id list
   `parseSelection`'s existing `"ids:<uuid,...>"` shape already accepts. **Coordinator procedure**: if a
   dispatched `provenance-heal apply` run's artifact shows `stopped_at_budget: true`, re-dispatch
   immediately with `arg: "ids:<items_remaining joined by comma>"` (apply mode, same as any `ids:` dispatch)
   to finish the rest — repeat until a run's `summary.json` carries no `stopped_at_budget` key at all.
5. **Waste measured and removed** (no politeness/evidence change): CAPTURE-CITED fetched each cited url
   independently per item, with no run-level memory — two different items citing the SAME url (a shared
   regulatory source; the exact case STEP A's own "corpus pool of OTHER items' captures of the SAME
   canonical URL" bucket already exists to exploit) paid the full cost twice, up to 4 politeness-paced
   requests (direct fetch + Wayback availability + snapshot) for a url this run had already fully resolved.
   A run-level `citedUrlCache` (one `Map` per `main()` call, keyed by `canonicalizeCitationUrl` — the same
   equality rule `unfetchedCitedUrls` already uses) makes `captureCitedUrl` idempotent per run: a repeat
   url reuses the prior outcome's evidence with **zero** additional network calls, while every citing item
   still gets its **own** `agent_run_searches` evidence row (caching removes duplicate fetches, never
   duplicate evidence). Scoped to `captureCitedUrl` only, never STEP 1's `captureItem` (the two resolve an
   eurlex url's canonical key DIFFERENTLY on purpose — from the item's own `instrument_identifier` vs. from
   the url alone — merging their caches would let one item's identifier silently answer for another's
   citation). New per-item field: `steps.capture_cited.results[].cache_hit` and
   `steps.capture_cited.cache_hits`. Two other waste hypotheses were checked and **not** found:
   `makePoliteFetch`'s own 1 req/s gap is untouched (no over-long sleep), and no second pacing authority
   exists anywhere in this file — every fetch in every step already goes through the ONE shared
   `deps.fetchImpl` instance the wrapper wires once per run.

New `counts`/summary fields: `stopped_at_budget` (bool, present only on a budget-stopped run),
`items_processed`, `items_remaining` (same run); no change to any existing counter's meaning.

**[CONFIRMED, coordinator-reported] Run 33829526120, Maintenance #21 (HEAL_VERSION `hp5-2026-09-04.2`,
master `1356b381`, `provenance-heal apply`, `quarantined-live`, 11m56s, exit 0)**: 94 candidates, **0
`healed_verified`**, 94 `still_failing`, 88 `gate_a_written` with `orphan_count > 0`. Final failures by
criterion: (7, `gate_a_unproven_or_stale`) 88 items; (4, `analysis_missing_label_syntax`) 38 items; (3,
`fact_below_authority_floor`) 2; (2, `ungrounded_url`) 1; (6, `missing_full_brief`) 1; (5,
`missing_required_slot`) 1.

**Seventh pass (lane HEAL-6, 2026-09-04, `HEAL_VERSION` now `hp6-2026-09-04.1`)** diagnoses and fixes the
two largest of the six residual criteria above — see `scripts/mint/heal-provenance.mjs`'s own SEVENTH PASS
header for the full diagnosis, exact live SQL quoted, and measured counts. Neither
`validate_item_provenance` nor the scanner (`gate-a-scan.mjs`/`gate-a-match.mjs`) needed to change; both
bugs are entirely in `heal-provenance.mjs`'s own call sites — no new migration, no scanner edit, no
`PENDING-RUN.md` re-pin.

1. **Criterion 7 (88 items) — Gate B was never wired.** The live scanner has two coverage arms: LITERAL
   (a token verbatim in the FACT-claim corpus) and DERIVED/"Gate B" (a token covered by a valid,
   basis-grounded, non-stale `claim_kind='DERIVED'` claim — `gate-a-derived.mjs`'s own
   `derivedCoveredTokens`). `planGateA` never passed `derivedCovered` to `buildGateARow`, defaulting to an
   empty Set — every HEAL apply run's own Gate-A rewrite silently stripped legitimate Gate-B coverage the
   mint-time pipeline had already established. Measured live (read-only SQL, 2026-09-04): 16 real orphan
   tokens across 5 items (`ff4064ab-…`, `15f63ea9-…`, `3af75490-…`, `5b2c6655-…`, `bced4406-…`) would clear
   under this fix, `ff4064ab-…` alone going from 9 orphans to 1. **Fix**: `computeDerivedCovered(claims,
   captures)` (new, pure) mirrors `derivedCoveredTokens`'s own query shape entirely in memory, over data
   this file already holds — no new `deps` call. `planGateA(item, claims, derivedCovered = new Set())` now
   threads it through at all three call sites, each recomputed FRESH from the claims/captures in scope at
   that point (matching `canonical-pipeline.ts`'s own "recompute right before the write" discipline).
   **REFUSED, dormant in production**: `computeDerivedCovered` reads `d.basis_claim_id` off each DERIVED
   claim — `scripts/maintenance/provenance-heal.mjs`'s own `readClaims` SELECT (`id, claim_kind, claim_text,
   source_span, source_id, search_result_id, section_row_id`) does not project `basis_claim_id`, so every
   live DERIVED claim reads it as `undefined` and the computed Set stays empty in production until that
   column is added to the SELECT — a one-line change outside lane HEAL-6's write set
   (`scripts/maintenance/**`). The fix is written, tested (fixtures supply `basis_claim_id` directly, as a
   pure-function test constructs its own claim objects), and correct; it activates the moment that column is
   added, with no further code change.
2. **Criterion 4 (38 items / 148 claims) — RECLASSIFY/RETROFIT scoped narrower than the validator.**
   Criterion 4's own SQL checks, for every ANALYSIS claim, whether SOME paragraph in **any** of the item's
   sections (never scoped to one) both matches a label regex and `ILIKE`-contains `claim_text` verbatim.
   STEP E (RECLASSIFY, FOURTH PASS) and RETROFIT both scoped their own paragraph search to the claim's OWN
   `section_row_id`. Measured live (read-only SQL + this file's own code, 2026-09-04, all 148
   currently-failing ANALYSIS claims across the 38 affected items): 0/148 findable in the claim's own
   section; widening to every section of the item, guarded against heading/label-only false-accepts
   (`isSubstantiveParagraph`: ≥ `MIN_SUBSTANTIVE_TOKENS`=6 scoreable tokens AND a sentence-ending mark),
   finds a home for **100/148 (68%)**; 3 of the 4 items failing criterion 4 alone (`007f42b1-…`,
   `45f85547-…`, `87ed781c-…`) would have EVERY failing claim resolved, flipping fully to `verified` on the
   next apply run. **Fix**: `findOwningParagraphAcrossSections`/`planOwningParagraphRewriteAcrossSections`
   (new, pure) run the same Jaccard-overlap/sentence-pick/marker-strip pipeline across every section, tried
   ONLY after the existing own-section search refuses. A claim whose winning paragraph lives in a different
   section than its current `section_row_id` gets that column rewritten too (never `claim_kind`, for
   RETROFIT — its "patches `claim_text` only" contract, already asserted by an existing test, is preserved).
   A claim found nowhere — own section or any other — is refused exactly as before, reporting the better of
   the two searches' own best score.
3. **Not touched, per diagnosis**: STEP C's own inability to ground 386 of criterion 7's 824 measured
   orphan tokens (found in some non-canonical capture, zero in the item's own canonical capture, and — of
   those — zero qualifying for a floor-qualifying source: 167 have no `sources` registry row, 179 have one
   above the item's authority floor) is criterion 3 (the authority floor) working as designed, not a defect
   this lane's write set can or should close — grounding them would write a FACT claim whose source tier
   violates the floor, which the "no claims ahead of evidence" rule and this file's own header both forbid.
   **Superseded below (lane HEAL-7)**: the operator's ruling of 2026-09-04 overrules the REFUSAL half of
   this floor (never the grounding requirement) — see the EIGHTH PASS subsection.

**Next dry-run dispatch** (verify both fixes against the live 94-item quarantine before an apply run):
`provenance-heal`, `mode: dry`, `arg: "quarantined-live"` — expect `gate_a_written` orphan counts to drop
for the 5 named items above, and `reclassify`/`retrofit` entries to show `cross_section: true` for a
material share of the 38 criterion-4 items' claims. Follow with `mode: apply` on the same selection once
the dry run confirms.

**Eighth pass (lane HEAL-7, 2026-09-04, `HEAL_VERSION` now `hp7-2026-09-04.1`)** builds THE RULING
[CONFIRMED, operator, 2026-09-04, verbatim]: "get the source. then rate the source. it's that simple.
this isn't hard, find the source and then publish the data on the site." The ruling overrules the
REFUSAL half of criterion 3's authority floor — never the grounding requirement — for the 386 Gate-A
orphan figures HEAL-6 measured with no floor-qualifying source (167 with no `sources` row at all for the
figure's URL, 179 with a `sources` row above the item-type floor). See `scripts/mint/heal-provenance.mjs`'s
own EIGHTH PASS header for the complete mechanism.

1. **New step, SOURCE**, runs after CAPTURE-CITED/STEP A/E/RETROFIT, before STEP C/ORPHANS, so a token it
   grounds is simply not an orphan by the time ORPHANS' own fresh scan runs. For every current Gate-A
   orphan STEP A's own three buckets could not locate: finds the candidate cited URL(s) (the token's
   owning section, or every URL the item cites when it has no owning section — `candidateUrlsForOrphan`,
   bounded `SOURCE_MAX_CANDIDATE_URLS_PER_ORPHAN=5`), classifies each (`classifyCitedUrlForOrphan`) as
   `already_registered` (the 179 case — grounds on the existing source, no new row), `registerable` (the
   167 case — `classTierForHost`, SC-13's own deterministic host class table, NEVER a guessed tier;
   registered through `deps.registerSource`, the SAME guarded/institutionKey-deduped path
   `run-source-sweep.mjs`'s own registerSource use goes through), or `worklist_ambiguous_host` (SC-13
   forbids inventing a tier — reported, never forced; the token stays an honest orphan). A `registerable`
   or `already_registered` candidate is captured (`captureCitedUrl`, the SAME per-family resolution with
   the Wayback fallback CAPTURE-CITED already uses) unless already captured this run, then
   `locateSpanInText` on the captured page grounds a NEW FACT claim exactly as ORPHANS already does —
   `source_tier_at_grounding` is the REAL read-back tier (`deps.readSourceByUrl`), never the class table's
   own predicted tier alone. Bounded per item (`SOURCE_MAX_PER_ITEM=25`), overflow reported `bound_hit`,
   never silently dropped. Dry mode plans every candidate (`would_register_and_capture` /
   `would_capture_and_ground`) with zero writes and zero fetches.
2. **Migration 302** (`fsi-app/supabase/migrations/302_criterion3_rating_not_refusal.sql`, written,
   **NOT applied** — no DB write credential in this lane) patches `validate_item_provenance` in place: the
   `fact_below_authority_floor` check moves from `v_failures` to a new non-blocking `v_result.warnings`
   composite attribute (`{below_floor_facts, claims:[...]}`, same payload shape). `fact_missing_source_span`
   / `fact_span_not_in_source` / `fact_mint_hold` are UNCHANGED — an ungrounded claim still quarantines.
   `scripts/mint/validate-mint-payload.mjs` mirrors this in the same lane (its own `fact_below_authority_floor`
   push moves `failures` → `warnings`, `VALIDATE_MINT_PAYLOAD_KIT_VERSION` bumped to `vmp-2026-09-04.2`) so
   the kit and the function agree on what blocks.
3. **New deps wired** into `scripts/maintenance/provenance-heal.mjs` (its own write set, edited in this
   same lane): `registerSource(source)` → `db.mjs`'s own guarded, institutionKey-deduped registration, and
   `readSourceByUrl(url)` → the matching `sources` row (or null), same institutionKey identity rule.
   Neither is called in dry mode.
4. **Coordinator dispatch, once migration 302 is applied**: `provenance-heal`, `mode: dry`,
   `arg: "quarantined-live"` — expect `steps.source[]` entries across the 94-item quarantine naming
   `source_registered_and_grounded` (the 167 case) / `grounded_on_existing_source` (the 179 case) for a
   material share of the 386 measured tokens, `worklist_ambiguous_host` for any host SC-13 forbids
   registering, and `unfetchable` for a URL this container's own egress allowlist or the publisher itself
   refuses (see this lane's own report for which). Follow with `mode: apply` once the dry run confirms.
5. **UI**: the credibility/tier chip already renders on item surfaces (grepped: `src/components` — no
   `.tsx` edit in this lane's write set). Confirm at apply time that a FACT claim carrying a below-floor
   `source_tier_at_grounding` shows its chip on the regulations detail page the same way an above-floor
   FACT already does; if it does not, the fix is in whichever component renders
   `section_claim_provenance.source_tier_at_grounding` for that page, named in this lane's own report.

**Ninth pass (lane HEAL-8, 2026-09-04, `HEAL_VERSION` now `hp8-2026-09-04.1`)** diagnoses STEP SOURCE's own
live apply run (Actions 33844146038, `quarantined-live`, `HEAL_VERSION hp7-2026-09-04.1` — measured
read-only via Supabase MCP SELECT against the real rows, `summary.json` not on disk) and fixes the measured
causes. 359 `unresolved`, 302 `bound_hit`; a `token_not_in_page` sample (>=60 tokens across >=20 items)
classified: (A) NUMERIC-FORM MISMATCH — a different surface form of the same figure — ~1.4% of the sample;
(B) ELSEWHERE ON THE SITE — a linked PDF/sub-page one hop away carries the figure; (C) PAGE CHANGED/CAPTURE
THIN — a cookie wall/JS shell/404/shorter earlier capture; (D) NOWHERE — the honest terminal state. The
single largest, best-evidenced cause in the broader sample: STEP SOURCE's own `sourceAttempts` budget
charged a zero-cost "already captured, no fetch" lookup the same as a real fetch, starving free groundings
on high-orphan items (one sampled item: 51 orphans, 47 free-lookup groundings available, most never even
attempted). See `scripts/mint/heal-provenance.mjs`'s own NINTH PASS header for the complete mechanism,
fetch-count arithmetic against `HEAL_TIME_BUDGET_SECONDS`, and the confirmed scope limit on one-hop
cross-host institution follows (below).

1. **Budget split (STEP SOURCE).** `sourceAttempts` no longer charges an already-captured, USABLE
   (>200-char) row for the exact candidate URL — a zero-cost, zero-network lookup. It still charges a
   `worklist_ambiguous_host`/`unresolvable_host` classification-only decision, a dry-mode plan, and every
   genuine new fetch (direct or one-hop) — the EIGHTH PASS `bound_hit` test's own accounting is unchanged.
   `SOURCE_MAX_PER_ITEM` itself is left at 25: fetch-count arithmetic (`HEAL_TIME_BUDGET_SECONDS=1500` @
   1 req/s shared across ~89 items; 89×25=2225>1500, so the cap already assumes not every item spends its
   full budget on real fetches) shows the ceiling was never the bottleneck for the measured 47/51 case — the
   accounting was. Raising the ceiling further is a separate, still-open lever if this fix alone does not
   clear the residue in one more pass.
2. **Class C thin-recapture.** The "already captured" lookup now requires >200 usable trimmed chars (the
   file's own established floor) to count as captured at all; a thin/blocked pre-existing row is treated as
   not-yet-captured and falls through to a real, Wayback-aware re-fetch via the unmodified `captureCitedUrl`.
3. **Class A numeric-tolerant matcher.** `locateSpanInText` gains a fourth tier (`numeric_tolerant`,
   digit-gated) plus a trailing-punctuation retry, built on a new `buildNumericNormalizedIndex` (currency
   symbol↔code, decimal/thousands separators, super/subscript digits, %-spacing, dash variants). The STORED
   `source_span` stays byte-exact from the capture (ADR-016) — only the SEARCH tolerates a different surface
   form. Gate-A's own literal-and-exact `containsToken` (`gate-a-match.mjs`, a governing file) is untouched:
   `buildOrphanClaimText` already embeds the orphan token verbatim into `claim_text`, and `scanBrief` checks
   `claim_text + " " + source_span` concatenated, so a tolerant search never needs to defeat the coverage
   doctrine, only prove genuine grounding.
4. **Class B one-hop follow.** When a page STEP SOURCE fetched live THIS run (directly, or via
   CAPTURE-CITED's own fetch earlier the same run — both now carry `html` as an additive, never-persisted,
   in-memory-only field) does not itself carry the token, up to `SOURCE_MAX_HOP_LINKS_PER_TOKEN=3`
   SAME-INSTITUTION links (`institutionKey`, the one identity rule STEP B/OWN-BODY and the source registry's
   own dedup already use) extracted from that page's own `<a href>`s are tried, each captured via the same
   `captureCitedUrl` path and grounded with its OWN registered+rated source. **Confirmed scope limit**: this
   is same-host (or same shared-portal institution) only — `institutionKey` is host-prefixed by construction
   and can never bridge two genuinely different hosts, so a true cross-host institution hop (the dispatch's
   own "Cellar/EUR-Lex link from a Commission press page" example, and this lane's own sampled CINEA/Clean
   Hydrogen Partnership case) is NOT reachable by this pass — it would need an async DB institution lookup,
   left as a separate, still-open lever rather than silently claimed done. A real bug was caught and fixed
   in this same mechanism before landing: a naive same-host eligibility check is WRONG on a shared
   government portal (`nj.gov/dep` vs `nj.gov/other` share a host but are different institutions per
   `institutionKey`) — `classifyHopLink` now uses `institutionKey` equality as the one rule, never a second
   `hostOf` compare.
5. **Class D reporting.** `no_candidate_url` and `unresolved` (STEP SOURCE), and `unprovable` (STEP
   C/ORPHANS), now carry `sentence` — the orphan token's own literal enclosing sentence from `full_brief`
   (new `extractSentenceContext`, never invented) — so the coordinator hands the operator an actual sentence,
   not a bare token. `full_brief` has no editor path anywhere in this file (RELABEL only ever touches a
   section's `content_md`, by construction never `full_brief`), so a bare orphan token has no
   RECLASSIFY/RETROFIT path the way an existing FACT claim does; this is the honest, buildable version of
   "refactor if the paragraph exists, else report."
6. **`summarizeReports` gap fixed.** The `no_candidate_url` STEP SOURCE outcome had NO counter anywhere in
   this function before now (silently absent from every summary this file has ever produced) — added
   (`source_no_candidate_url`), alongside a new `source_grounded_one_hop` counter (a subset of
   `source_grounded`/`grounded_after_register`, both still increment for a one-hop grounding too).
7. **No new deps.** `scripts/maintenance/provenance-heal.mjs` needed no changes — every capability above
   (one-hop, thin-recapture, sentence context) reuses `captureCitedUrl`/`registerSource`/`readSourceByUrl`/
   `insertSearch`/`insertClaim`, all already wired by the EIGHTH PASS.
8. **`PENDING-RUN.md` not touched.** `scripts/mint/heal-provenance.mjs` is confirmed absent from
   `F28-harness-run-integrity.mjs`'s `GOVERNING_FILES.mint` list — this lane's edits do not move the mint
   family's `harness_version`, so no re-pin is needed or made.
9. **Coordinator dispatch**: `provenance-heal`, `mode: dry`, `arg: "quarantined-live"` — expect
   `steps.source[]` entries naming `grounded_after_register` (now including a `source_grounded_one_hop`
   share), `source_token_not_in_page` materially lower than the hp7 baseline (numeric-tolerant + thin-
   recapture + one-hop), `source_no_candidate_url` newly visible in the summary, and `source_bound_hit`
   materially lower (the budget-split fix). Follow with `mode: apply` once the dry run confirms; then
   re-measure the 359/302/token_not_in_page counts the same way this lane did (Supabase MCP SELECT against
   the real post-apply rows) to size what residue, if any, needs a raised `SOURCE_MAX_PER_ITEM` or a
   DB-backed cross-host one-hop as a follow-on lane.

**Tenth pass (lane HEAL-10, 2026-09-04, `HEAL_VERSION` now `hp10-2026-09-04.2`)** closes the run's own COST
(the actual bottleneck maintenance #31 hit, below) and builds the two steps HEAL-6 named but never built —
see `scripts/mint/heal-provenance.mjs`'s own TENTH PASS header for the complete mechanism and evidence.

1. **Cost attribution — `[CONFIRMED]`, maintenance #31 (run 33855060659) vs. #28 (run 33851505474, DRY).**
   #31's 15 processed items averaged ~100s/item (1500s / 15). #28's DRY run — which makes **zero** network
   fetches by construction (`main()` never writes or fetches unless `apply`) — still averaged ~63s/item
   (1776s / 28), proving the dominant cost is CPU, not the 1 req/s politeness pacing (already low: #31's own
   `capture_cited.fetched` sums to 9 across all 15 items). Root cause: `locateSpanInText`
   (`planGroundingForClaim`/`planResourceForClaim`/`planOrphanGrounding`) rebuilt its normalized/numeric
   index from scratch, from an O(n) pass over the FULL capture text, on **every** call — once per CLAIM
   (GROUND/RESOURCE) or per Gate-A ORPHAN TOKEN, TWICE for any orphan STEP SOURCE could not resolve (its own
   precheck, then STEP C's fresh scan). Measured live (read-only SQL): item `15f63ea9-…` (one of #31's 15)
   carries 32 captures totalling 2,833,138 chars and 10 orphan tokens — its own pool is re-normalized on the
   order of ~1,280 full-text passes over ~2.8M chars combined. **Fix**: `buildCaptureIndex`/`getCaptureIndex`
   precompute a capture's normalized forms ONCE, memoized by `capture.id` in a `Map` threaded run-wide
   (`healOneItem`'s new `captureIndexCache` option, the same convention as the SIXTH PASS's own
   `citedUrlCache`) — turns the per-item cost from O(claims-or-tokens × captures × chars) into O(captures ×
   chars). Fully additive: every existing call/test keeps its own isolated cache when the new parameter is
   omitted.
2. **Per-item wall-clock backstop** (defensive, under fix 1). `computeItemTimeBudgetSeconds(runBudget)` (new,
   pure) derives `clamp(runBudget/10, 30, 120)` seconds from the SAME `HEAL_TIME_BUDGET_SECONDS` the run-level
   budget already reads — no new workflow env line. `healOneItem` checks it BETWEEN orphan tokens (never
   mid-token) in STEP SOURCE's and STEP C's own loops, reporting `item_bound_hit` (never silently dropped;
   new `summarizeReports` counters `source_item_bound_hit`/`orphans_item_bound_hit`) for anything skipped.
3. **Job-timeout arithmetic.** `.github/workflows/maintenance.yml`'s `maintain` job `timeout-minutes` raised
   30 → 35: #31's own measured pre-step setup was 5m21s (321s), not the ~1-2min a prior comment assumed —
   the 30-minute job timeout fired 8s BEFORE `HEAL_TIME_BUDGET_SECONDS`'s own 1500s internal deadline could
   stop the run cleanly (08:51:57 + 1500s = 09:16:57; job killed at 09:16:49). New arithmetic (see that
   file's own comment): 2100s job − 321s setup − 1500s step budget − 3s Population-AFTER − 3s artifact
   upload = 273s (4m33s) headroom. `HEAL_TIME_BUDGET_SECONDS` itself is UNCHANGED at 1500 — fix 1/2 cut the
   cost the budget is spent on, not the budget.
4. **BRIEF-HONEST STRIP (Task 3, criterion 7's `gate_a_unproven_or_stale` residue — 13 of #31's 15 items).**
   Once STEP SOURCE has exhausted every cited URL and STEP C has exhausted every capture for an orphan token
   and it is still `unprovable`, a new step (right after STEP C) PLANS removing exactly that token's own
   enclosing sentence — or, when the sentence carries another still-tracked token, exactly the middle clause
   (first/last-clause cuts are always refused, never guessed) — from `full_brief`. Never invents, never
   paraphrases, only deletes a located literal span (`sentenceSpans`/`findSentenceSpanForToken`/
   `removeSentenceSpan`/`planStripUnprovableClause`/`planStripUnprovableSentence`, all pure). Acceptance
   re-runs the LIVE Gate A scanner (`buildGateARow`) on the rewritten brief and requires `orphan_count === 0`
   — a stray unrelated orphan (untouched this run) rejects the whole plan, nothing partial ever writes.
   **DRY BY DEFAULT**: the plan is always computed and reported (`report.steps.brief_honest`,
   `summary.brief_honest`, with per-item before/after excerpts and a `restore_sql`); the write itself
   (`deps.updateItemBrief`, new wrapper dep) fires ONLY when `apply=true` AND the dispatch's `--arg` carries
   the new `parseSelection` suffix **`+strip-unprovable`** (every existing selection form's own mode/ids
   meaning is unchanged — the suffix only sets `selection.stripUnprovable`). `item_grade` doctrine (migration
   278 / `docs/plans/record-tier-population-plan-2026-09-01.md` §2/§7, grepped): UNCHANGED either way — a
   record-grade item has no full_brief-driven Gate A orphans to strip in the first place (FACT/GAP-only, no
   synthesized prose), and a brief-grade item stays brief-grade (this step only ever removes prose from a
   full_brief it already has).
5. **CRITERION 4 RESIDUE (Task 4) — measured, not assumed.** Pulled `validate_item_provenance`'s live
   definition via `pg_get_functiondef` (read-only) rather than trusting this file's own label-regex mirror:
   criterion 4's ANALYSIS check is item-wide (every section of the item, never scoped to a claim's own
   `section_row_id`) and reads **only** `intelligence_item_sections.content_md` — it never reads
   `full_brief` at all. Re-measured heal31.json's full 159-claim `relabel_no_owning_section` residue against
   the LIVE DB with this exact predicate: **148/159 (93%) already pass today** — inspection of a sample
   confirms `planRelabelParagraph`'s own "already labeled" guard is correctly no-oping on a paragraph an
   earlier pass already labeled (the run's own snapshot was stale relative to today's DB, not a live defect);
   **3/159** (one item, `27dfbe4c-…`, one section) are exactly the case lane HEAL-6 named: `claim_text`
   absent from every section's `content_md` but a literal substring of `full_brief`; **8/159** are nowhere
   at all, not even in `full_brief` (a paraphrase, not a quote) — genuinely unrecoverable, reported, never
   invented. **Fix**: `planRelabelFromFullBrief` (STEP D) — for the 3/159 case only — APPENDS a new labeled
   paragraph (`*Analytical inference:* ` + the claim's own verbatim `claim_text`) to the claim's own
   registered section (never edits `full_brief`, since criterion 4 never reads it), gated behind the SAME
   `+strip-unprovable` token as the strip step above (new prose beyond the established prepend-a-label
   pattern gets the same explicit-opt-in treatment). New `relabel` outcomes: `relabeled_from_full_brief` /
   `would_relabel_from_full_brief`; new counters `relabeled_from_full_brief`/`would_relabel_from_full_brief`.

New `counts`: `brief_honest_applied`/`brief_honest_would_apply`/`brief_honest_rejected`/
`brief_honest_refused_tokens`, `relabeled_from_full_brief`/`would_relabel_from_full_brief`. New summary
field: `summary.brief_honest` (per-item before/after, present whenever an item had ≥1 exhausted-unprovable
token this run, dry or apply). New wrapper dep: `updateItemBrief(itemId, full_brief)` →
`guardedUpdate("intelligence_items", …)`, called only when `apply && stripUnprovable`.

**Coordinator dispatch — two runs, in order**:
1. **Dry run (plan review, no token)**: `provenance-heal`, `mode: dry`, `arg: "quarantined-live"` — expect
   `summary.brief_honest` to list a per-item strip plan for the 13 criterion-7 items above (`outcome:
   "accepted"`, `applied: false`) and `steps.relabel[]` to show `would_relabel_from_full_brief` for the
   `27dfbe4c-…` item's 3 claims; review both before deciding to apply.
2. **Apply run (writes the reviewed plan)**: `provenance-heal`, `mode: apply`,
   `arg: "quarantined-live+strip-unprovable"` — same selection, now with the explicit token: `applied: true`
   in `summary.brief_honest`, `relabeled_from_full_brief` in the counts, and a `restore_sql` recorded per
   item in case any strip needs undoing by hand. An apply run WITHOUT the suffix (`arg: "quarantined-live"`)
   still reports the identical plan but writes nothing for either step — the dry-by-default contract this
   lane's own tests assert directly (`healOneItem`'s default-apply-mode test: `applied: false`, zero
   `updateItemBrief` calls, `item.full_brief` unchanged).

---

## 9. `reopen-validation-holds`

**Purpose**: re-admit `census_worklist` rows a mint-batch-report held (`dryrun_disposition='hold'`,
`hold_reason` starting `validation_failed:`) back to `dryrun_disposition='would_mint'`, so the next
population run's real capture+validate pass re-decides the row's fate — never re-validated here. The
symmetric reversal of `apply-mint-batch.mjs`'s validation-failed hold-back (see that file's
`resolveValidationFailedHolds`).

**Upstream**: `scripts/mint/reopen-validation-holds.mjs` (Lane URL-GUIL, 2026-09-03) — its own exported
`main({reasonContains, apply})` does the read, the selection (`isReopenTarget`, a pure predicate — never
matches a non-`hold` row, a hold outside this lane's `validation_failed:` vocabulary, or an empty/missing
scope), and the write (`guardedUpdate`, cited there), imported and called UNMODIFIED by this wrapper;
nothing is reimplemented. **No prior runtime existed to invoke it from**: the ONLY place with database
credentials is GitHub Actions (the cloud container has no egress to Supabase, the Codespace has no
secrets) — this step is that missing runtime, the same gap `origin-class-backfill`/`tag-ratification`
closed for their own upstream scripts.

**Ruling**: none named directly — gated by the upstream tool's own standing rule (its header, verbatim):
never a blanket, unscoped, or scheduled re-admission. This step enforces that one layer earlier: `arg`
(the `--reason-contains` scope) is **required in BOTH modes**, unlike every other `arg`-gated step above
which gates `apply` only — a blank `arg` is refused (exit 1, no DB read at all) before dry mode would even
list anything, because a dry listing of "every held row" is itself the blanket view the tool's header
forbids.

**Dispatch**: `arg` = a substring of the `hold_reason` to reopen (case-insensitive), e.g.
`ungrounded_url`. `mode=dry` returns the full per-row plan — row id, `hold_reason`, and a truncated
`notes` head (the held evidence JSON can be long; the plan previews it, never dumps it whole) — for every
matching row, plus the matched count; writes nothing. `mode=apply` writes through the upstream tool's own
guarded path, then re-reads exactly the rows this run touched (`writtenIds`) and reports their post-write
`dryrun_disposition`/`hold_reason`/notes head as `read_back`. A per-row write failure is reported in the
summary `note` and sets `exitCode=1` without aborting the rest of the batch (matches the upstream tool's
own per-row try/catch). Idempotent: re-dispatching with the same `arg` after a successful apply finds 0
matching rows (the reopened rows no longer carry `dryrun_disposition='hold'`).

**Live state at authoring** (coordinator-confirmed, Supabase, 2026-09-04 00:40 UTC): exactly 1 row held
`validation_failed:2:ungrounded_url` — the guillemet-URL row whose fix landed in the same #557 as the
upstream tool. Coordinator dispatch for that row: `mode=dry, step=reopen-validation-holds,
arg=ungrounded_url` first (confirm the plan names exactly that one row), then `mode=apply,
step=reopen-validation-holds, arg=ungrounded_url`.

**Artifact / read back**: `summary.json`'s `plan` (dry) or `read_back.reopened` (apply) — confirm against
`SELECT id, dryrun_disposition, hold_reason FROM census_worklist WHERE id = ANY(<writtenIds>)`. Never
dispatched from `all` in apply mode (per this workflow's own "all" ⇒ dry-only rule) — a named apply always
carries its own explicit `arg`.

**Registration**: `docs/inventories/shared-dataset-ownership.md`'s `census_worklist` section and its "Open
leaks summary" item 9 — the wrapper is deliberately **not** added to the enforced JSON allowlist, because
it delegates the write entirely (no `guardedUpdate`/`.from("census_worklist")...update(` call site of its
own) rather than re-implementing a second one; verified by re-running
`.discipline/shared-writer-registry.test.mjs` after adding the wrapper file, which still passes.

---

## 10. `record-hollow-sweep`

**Purpose**: take live verified record-grade intelligence_items off every customer surface when their
FACT claims are title-only, and route the document back through the mint so it returns with real facts.

**The defect** [CONFIRMED, live SQL, 2026-09-04]: 551 of 1,230 live verified (`is_archived=false`,
`provenance_status='verified'`) `item_grade='record'` items carry only the `[title]` FACT claim
(`record-facts.mjs`'s `extractIdentityFact`) — every required slot a GAP, or (201 of the 551) no FACT
claim at all. They render on every customer surface with an empty Summary. By `item_type`: `initiative`
390, `regulation` 158, `framework` 2, `guidance` 1. By source host: `eur-lex.europa.eu` 379,
`legislation.gov.uk` 149, `federalregister.gov` 21, `climate.ec.europa.eu` 1, `sdir.no` 1. Exact selection
SQL: the step's own `SELECTION_SQL` export (identical to what `planSelection` computes from two `readAll`
reads — no live SQL round trip at apply time).

**Which flag hides an item from every customer surface** [CONFIRMED, read this session — not
`hidden_reason`, not `pipeline_stage`]: `is_archived` (+ `archive_reason`), the SAME gate
`db.mjs`'s own `archivePatch()` comment already names ("the customer read gate — `is_archived=false AND
provenance_status='verified'`"). Every direct route filter (`research/[slug]`, `operations/[slug]`,
`api/ask`, `api/admin/intersections`, `api/admin/forward-events`, `api/admin/b2-progress`,
`api/health/surfaces`) gates on `is_archived`; every RPC-routed list/dashboard/regulations/operations/
market/map surface reads `effective_archived = COALESCE(workspace_item_overrides.is_archived,
intelligence_items.is_archived)` (migrations 007/047/064/066/070/071/073/077/108/110/117/120/125/133/134/
164/269/272) and `src/lib/supabase-server.ts`'s `fetchWorkspaceResources` exposes only the non-archived
bucket as `resources`. `hidden_reason` (migration 062) has **zero readers anywhere in `src/`** — dead.
`pipeline_stage` is read only by an admin queue view and passed through for display, never a hide gate.

**Archive mechanism, and why**: `archive_reason='record_hollow'` via `guardedUpdateByIds`, matching
`db.mjs`'s own `archivePatch()` shape (`is_archived=true`, `provenance_status→'unverified'`). This is a
NEW vocabulary value, not one of `db.mjs`'s five `SOURCEY_ARCHIVE_REASONS` — rule 019 and migration 135's
`_guard_source_archive` trigger are both scoped to exactly those five (read in full) and never fire here,
so the raw guarded-archive path is sanctioned (no `reclassifyToSource` detour — this is not a
source-not-item reclassification).

**The re-mint-blocked-by-its-own-archived-twin defect, and this step's fix** [CONFIRMED, read in full]:
`apply-mint-batch.mjs`'s `checkM4`/`buildItemsIndex` and `export-census-rows.mjs`'s
`buildHeldKeyIndex`/`partitionExcludeHeldByKey` both index ARCHIVED rows as blockers too (their own
comments: "any row, archived or not, holding this exact key blocks the mint"; an archived holder is
recorded only as an informational `holder_archived`/`archived` flag — the block itself is identical).
Archiving the hollow item alone therefore does **nothing** to unblock its own re-mint: the row still
carries the same `canonical_instrument_key`/`source_url` a fresh payload for the SAME document will
derive. Neither governing file is in this lane's write set, so the fix is DATA, in the SAME archive write:
the patch additionally sets `canonical_instrument_key=null`, `instrument_identifier=null`,
`source_url=''`. Migration 200's `trg_set_canonical_instrument_key` (BEFORE INSERT OR UPDATE) only
overwrites `canonical_instrument_key` when it can re-derive a non-null value from those two inputs — with
both blanked in the same UPDATE, every derivation branch misses and the trigger leaves the explicit NULL
untouched. Post-write the row drops out of `buildHeldKeyIndex` (key-only) and can never match a real
`document_url` via `checkM4`'s URL fallback (`''` is the schema's own NOT-NULL-DEFAULT sentinel, migration
004) — the re-mint is admitted on the next population pass with zero code changes to either governing
file.

**census_worklist side** [CONFIRMED, live SQL]: every one of the 551 targets' matching row (by
`document_url = source_url`) is already `dryrun_disposition='would_mint'` (550 at
`enumeration_status='reconciled'`, 1 at `'dry_run_complete'` — `selectCensusRows` filters only on
`dryrun_disposition`, never `enumeration_status`, so a `'reconciled'` row is still a live export
candidate). So the disposition write is idempotent for the live population; the substantive write is
`notes`, **appended, never overwritten** (same convention `reopen-validation-holds.mjs`'s own header
documents for this table), naming this sweep so a re-selected `'reconciled'` row is traceable.

**Dispatch**: `mode=dry` reports `counts.target_total`/`by_item_type`/`by_source_host` and `target_ids`;
writes nothing. `mode=apply` (no `--arg` required) archives every target, returns its matching
`census_worklist` row(s) to `would_mint` with the sweep note, and reads back both. Nothing is deleted —
claims, sections, and edges stay attached to the archived row untouched.

**Reversal**: two paths, both because `scripts/_snapshots/` (db.mjs's own automatic prior-state snapshot)
is `.gitignore`'d and does not survive a separate GitHub Actions dispatch (fresh checkout each run) — see
the step's own file header for the full reasoning:
- **Durable, artifact-based** (preferred): `summary.json`'s `per_item[].restore_sql` — one self-contained
  `UPDATE intelligence_items SET is_archived=false, archive_reason=..., canonical_instrument_key=...,
  instrument_identifier=..., source_url=... WHERE id='...'` statement per archived item, from THIS run's
  own "before" values. Deliberately never sets `provenance_status` — the `set_provenance_status` trigger
  re-derives it from the row's own (unchanged) claims on the same UPDATE. **[HYPOTHESIS, untested this
  session]**: whether that re-derivation can flip back to `'verified'` from a plain service-role UPDATE,
  or needs the same bound-`reconciler` credential ADR-118 requires for a reconciliation flip of a
  pre-existing row, is not exercised here.
- **Best-effort, same-disk-only**: `mode=apply, arg=restore:<id,id,...>` (this same script) — scans
  `scripts/_snapshots/*.jsonl` for this sweep's own prior-state entries and replays them via
  `guardedUpdate`; refuses (never guesses) any id with no matching snapshot entry, listed in
  `missing_ids`.

**Artifact / read back**: `summary.json`'s `counts` (`target_total`, `by_item_type`, `by_source_host`,
`census_rows_matched`, `census_rows_returned`), `per_item` (before/after + `restore_sql` per archived
item), and `read_back` (`archived_record_hollow_total`, `not_confirmed_archived_ids`). Confirm against
`SELECT count(*) FROM intelligence_items WHERE archive_reason='record_hollow'` and
`SELECT id, dryrun_disposition, notes FROM census_worklist WHERE id = ANY(<matched row ids>)`.

**Registration**: `docs/inventories/shared-dataset-ownership.md`'s `intelligence_items` and
`census_worklist` sections (this step writes both, added to the enforced JSON allowlist and the narrative
detail tables).

## 11. `canonical-key-dedup`

**Purpose**: enforce invariant EP-11 (ADR-021) by keeping the single live verified row per
`canonical_instrument_key`, archiving the others so they stop blocking re-mint.

**The defect** [CONFIRMED, live SQL, 2026-09-04]: Two `canonical_instrument_key` values
(`32015R0757`, `32023R1804`) each carry TWO live (is_archived=false) intelligence_items rows, violating
EP-11 ("migration 200's partial unique index `uq_intelligence_items_canonical_key_verified_live` plus
invariant EP-11 forbids two verified, non-archived items sharing a key"). Measured:
- `32015R0757`: 2 live rows (1 verified, 1 quarantined). Verified created 2026-09-01.
- `32023R1804`: 2 live rows (1 verified, 1 quarantined). Verified created 2026-05-05. 1 additional archived
  row (duplicate_of_verified).
- Inconsistent stamps (archive_reason set, is_archived=false): 1 row (ff95b385, archive_reason='duplicate_instrument').

**Keep rule**: For each canonical key group, keep the single live verified row (exactly one verified per
live group in this population) and archive the others. Failure modes:
- Zero verified in a group → REFUSE to decide (report, no archive).
- Multiple verified in a group → REFUSE to decide (report, no archive; violates the index already).

Both are reported in summary but NOT archived. This population shows exactly one verified per group, so
both failure modes are PLAUSIBLE but not exercised here.

**Archive mechanism, and why**: `archive_reason='duplicate_of_verified'` via `guardedUpdateByIds`, matching
`db.mjs`'s own `archivePatch()` shape (`is_archived=true`, `provenance_status→'unverified'`). This is a
NEW vocabulary value, not one of `db.mjs`'s five `SOURCEY_ARCHIVE_REASONS` — rule 019 and migration 135's
`_guard_source_archive` trigger are both scoped to exactly those five and never fire here, so the raw
guarded-archive path is sanctioned.

**The re-mint-blocked-by-its-own-archived-twin defect, and this step's fix**: same as record-hollow-sweep
above — `apply-mint-batch.mjs`'s `checkM4` and `export-census-rows.mjs`'s `buildHeldKeyIndex` both index
archived rows as blockers. The fix is DATA, in the same archive write: the patch additionally sets
`canonical_instrument_key=null`, `instrument_identifier=null`, `source_url=''`. The row then drops out of
`buildHeldKeyIndex` and the re-mint is admitted on the next population pass.

**Inconsistent archive_reason clearing**: One live keeper (ff95b385) carries `archive_reason='duplicate_instrument'`
while is_archived=false. A live row must not carry an archive reason (it misreports itself as the duplicate to
every reader of `archive_reason`), so the apply clears it on any keeper whose stamp is non-null, records the
prior value in `summary.keepers[].before` with a per-keeper `restore_sql`, and writes nothing for a keeper
whose `archive_reason` is already null.

**census_worklist side** [CONFIRMED, dry run 2026-09-04]: Both duplicate canonical keys have no matching
`census_worklist` rows (no `document_url` match). No census_worklist writes needed.

**Dispatch**: `mode=dry` reports `counts.canonical_keys_with_duplicates`, `duplicate_groups_with_exactly_one_verified`,
`duplicate_groups_with_zero_verified`, `duplicate_groups_with_multiple_verified`, `target_total`, and
`keeper_ids`/`target_ids`; writes nothing. `mode=apply` (no `--arg` required) archives every target and
clears any non-null `archive_reason` on a keeper (recorded in `summary.keepers[]` with `restore_sql`), then reads
back. Nothing is deleted — claims, sections, and edges stay attached.

**Reversal**: two paths, same as record-hollow-sweep above:
- **Durable, artifact-based** (preferred): `summary.json`'s `per_item[].restore_sql`.
- **Best-effort, same-disk-only**: `mode=apply, arg=restore:<id,id,...>`.

**Artifact / read back**: `summary.json`'s `counts` (`canonical_keys_with_duplicates`,
`duplicate_groups_with_exactly_one_verified`, `target_total`, `keepers_total`, `keepers_updated`),
`per_item` (before/after + `restore_sql` per archived item), `refusals` (groups with zero/multiple verified),
and `read_back` (`archived_duplicate_of_verified_total`, `not_confirmed_archived_ids`). Confirm against
`SELECT count(*) FROM intelligence_items WHERE archive_reason='duplicate_of_verified'` and verify that
every keeper's `archive_reason` is null (`summary.keepers[]` lists the ones this run cleared and their prior stamp).

**Registration**: `docs/inventories/shared-dataset-ownership.md`'s `intelligence_items` and
`census_worklist` sections (this step writes both, added to the enforced JSON allowlist and the narrative
detail tables).

## 12. `forward-events-retext`

**Purpose**: correct `item_forward_events.obligation_text` on rows that already render garbled — the
producer-side bug that made them, never the display — without touching `event_date`, `event_kind`,
`source_span`, `confidence`, or any FK column.

**The defect** [CONFIRMED, live customer surface https://carosledge.com/regulations "Upcoming
obligations" strip, 2026-09-04 ~08:15 UTC]: of 8 events shown, several rendered garbled
`obligation_text` — starting mid-word (`"re|venues generated from fines. By 25 September 2026..."`), a
leaked source-URL tail plus a markdown bold label (`"7/oj/eng **Primary headline compliance deadline —
FACT:** \"It shall apply from 29 November 2026...\""`), and a markdown table pipe/cell fragment plus a
label (`"hicles (M₂, M₃, N₂, N₃) | MONITORING **FACT — deadline:** \"By 29 November 2026...\""`). One
Euro 7 item carried the SAME date `2026-11-29` five/six times, with at least one duplicate pair — the
identical sentence once via a claim (clean) and once via a section's rendered markdown (garbled).

**Root cause** [CONFIRMED, read `src/lib/forward-events/extract-forward-events.mjs` lines 262-271
pre-fix]: `clauseAround`'s leading edge (`from = max(0, start - 60)`) was a fixed byte offset, never
snapped to a sentence/clause boundary, so a section-derived context window could start mid-word or
mid-markdown-artifact. Fixed in that module, lane FWD-TEXT (`EXTRACTOR_VERSION` `fe1-2026-09-04.1`): a new
`clauseStart` snapped the leading edge to the nearest sentence/clause terminator within `maxBefore` bytes
(whitespace fallback only when a hard truncation genuinely occurred; never mid-word), plus a
`normalizeObligationText` pass (display text only — `source_span` stays byte-verbatim, `assertVerbatim`
still enforced) that stripped a leaked URL tail, a markdown bold label, or a table pipe/cell fragment. A
new `dedupeEvents` collapses same-run (event_date, event_kind) hits whose text is the SAME obligation
under a content-similarity check (never a blind date+kind collapse — see that module's own header for
why: the NZIA item's `(2030-01-01, other)` group holds 4 genuinely distinct section-sourced obligations
plus 1 unrelated claim, so a blind collapse would have destroyed real content, the same "content loss,
not deduplication" failure migration 275's own header already names).

**Lane FWD-TEXT-2 (2026-09-04) rebuild — `obligation_text` as a readable, self-contained unit**
[CONFIRMED, measured over all 654 `retext_targets[]` in `scripts/_snapshots/retext32.json`, the dry-run
summary of Maintenance #32]: lane FWD-TEXT's own fix above still left residue in the `after` text it
produced — **316/654 lowercase-start, 149 non-letter-start, 65 star-residue (unstripped `**`/`*`), 11
bare (unbolded) label, 11 pipe/table-cell fragment, 1 URL-tail; 46 ending in `;`, 161 with no terminal
punctuation at all**. A 30-row live-Supabase sample additionally surfaced a genuine **non-idempotence
bug** — `normalizeObligationText(normalizeObligationText(x)) !== normalizeObligationText(x)` for at least
one stored row — caused by the leading URL-tail stripper matching only on a SECOND pass once an earlier
strip step had merged what were previously two separate whitespace-delimited runs into one.
`EXTRACTOR_VERSION` bumped `fe1-2026-09-04.1` → `fe1-2026-09-04.2`. `clauseStart` rewritten to require a
genuine SENTENCE start (`.`/`!`/`?` + whitespace + an uppercase letter/quote/digit — never a bare `;`/`:`),
a paragraph break, or a markdown list/heading-item start; `DEFAULT_MAX_BEFORE` raised `60` → `300` bytes
(measured: the true sentence start for this corpus routinely sits well past the old 60-byte cap). Past the
cap, falls back to the nearest `;` then a bare whitespace boundary and marks the result an **honest
fragment** — `normalizeObligationText` prefixes it with `"…"` rather than capitalizing or inventing
anything. The trailing edge no longer stops at `;`; any window still lacking a terminal `.`/`!`/`?`/quote
gets `"…"` appended instead. New exported `selectDateCell(text, dateSpan)` distinguishes a genuine
multi-column date table (short date-only cell → keep the cell AFTER it) from a single stray table-pipe
artifact (long, already-prose date-bearing cell → keep it, drop the rest). All strip rules now run as a
**fixed-point loop** (bounded at 6 passes) specifically to close the non-idempotence bug, verified
idempotent over all 654 corpus rows. Post-fix property sweep over all 654 `before` texts: **zero**
non-letter starts (other than quote/digit/`(`/`"…"`), **zero** `*`, **zero** `' | '`/leading-pipe, **zero**
bare `http`, **zero** missing-terminal-punctuation rows — the only remaining lowercase starts are the
honest `"…"`-prefixed fragments. `sentenceStart` (the separate deontic-window helper) and the
`source_span`/`assertVerbatim` verbatim law are both completely unchanged by this lane.

**This step is the one-time (and re-runnable) catch-up, forward-only otherwise**: the extractor fix
changes what a FUTURE extraction produces; migration 274/275's idempotency guarantee is about not
duplicating rows on a re-run, not about correcting text already stored. For every `intelligence_item`
that already carries `item_forward_events` rows, this step re-reads that item's CURRENT grounded
claims/sections (the same shape `src/lib/forward-events/read-and-extract.mjs` builds) and re-runs the
SAME pure, unmodified `extractForwardEvents` every writer already calls. Three findings, all read-only in
dry mode:
1. **Retext targets** — an existing row whose `(source_claim_id ?? source_section_id, event_date,
   event_kind)` identity still matches a freshly-extracted event, but whose `obligation_text` differs.
   The fresh text becomes the new `obligation_text`; every other column is untouched.
2. **Duplicate groups** — an existing row the fresh extraction's own within-run `dedupeEvents` would now
   drop as a content-duplicate of another existing row it keeps. `item_forward_events` (migration
   274/275, read in full) has **no `is_archived`/`superseded`/status column of any kind** — 13 columns
   total, none a lifecycle flag — so there is nowhere to mark a row superseded and no sanctioned way for
   this script to make it stop rendering. **This finding never deletes a row.** It reports every group
   (`would_drop_id`, `would_keep_id`, both `event_date`/`event_kind`, both obligation texts, the dedupe
   reason) so the coordinator can put an explicit deletion decision to the operator — a schema gap, not a
   policy choice made here. A row can be BOTH a retext target and half of a reported duplicate group at
   once; the duplicate finding never suppresses the retext finding, since the row's stored text still
   needs correcting as long as it stays live.
3. **Collisions** [added lane RETEXT-COLLIDE, 2026-09-04] — see the dedicated subsection immediately
   below. Unlike (2), this finding **is** applied automatically in `apply` mode: it is the live unique
   index's own requirement once text is honest, not an operator policy call.

**Lane RETEXT-COLLIDE (2026-09-04) — the retext rewrite collides with itself** [CONFIRMED, Maintenance #35,
run `33864089323`, `master` `e1a0287` = FWD-TEXT-2's normaliser, APPLY]: the step died 6 seconds in —
`db.mjs update failed: duplicate key value violates unique constraint uq_item_forward_events_dedupe`. The
live index [CONFIRMED, `pg_indexes`]: `CREATE UNIQUE INDEX uq_item_forward_events_dedupe ON
public.item_forward_events USING btree (intelligence_item_id, event_date, event_kind,
md5(obligation_text), COALESCE(source_claim_id, source_section_id))` (migration 275). Root cause: two
EXISTING rows can already share `(intelligence_item_id, event_date, event_kind, coalesce(source_claim_id,
source_section_id))` pre-fix — legitimately, since 275's own key also discriminates on `obligation_text`,
and their texts differ — but once BOTH are honestly retexted to the SAME fresh sentence (the section's
one date appears twice, so the extractor emitted two rows from the one section, pre-fix garbled two
different ways, post-fix identical), the second per-row `guardedUpdate` collides with the first. The dry
run #33's own `retext_targets` grouped by `(item, date, kind, after)` — no source column — over-counts
(≈154 groups / 324 rows), since that grouping cannot tell two-DIFFERENT-source rows that happen to share
text apart from a real collision; the real key (below) requires the SAME source object too, exactly the
column 275 itself added.

**The fix**: for **every** row of the table (target or not, per **DO** above — not only `retext_targets`),
this step computes the row's post-rewrite key exactly as Postgres computes the live index —
`(intelligence_item_id, event_date, event_kind, md5(after_text), coalesce(source_claim_id,
source_section_id))`, `md5` computed the way Postgres does (`node:crypto`, UTF-8 bytes, lowercase hex) —
where `after_text` is the freshly-extracted text for a retext target and the row's own current
`obligation_text` for every other row (so a row already retexted by a prior half-applied run, or never a
target at all, is still checked for collision against everything else). A group of more than one row under
that key is exactly what the live index would reject once written, so it cannot all survive: **one
survivor is kept** (a row already carrying its own after-text is preferred — nothing to rewrite for it;
otherwise earliest `created_at`, then lowest `id`, both deterministic), **the rest are `collide_delete`d**.
`item_forward_events` is DERIVED (regenerable from claims/sections by the extractor, never a primary
record — confirmed not in `scripts/lib/db.mjs`'s `DELETE_PROTECTED_TABLES`), so this delete is sanctioned,
but only ever through `guardedDelete` — chunked, cited (a dedicated `DELETE_CITE`), and snapshotted (the
snapshot captures the FULL prior row, `select("*")`, unlike the text-only `guardedUpdate` snapshot). Apply
order is delete-then-rewrite in the same pass: every `collide_delete` runs BEFORE any `guardedUpdate`, so
no rewrite can recreate the very key its own collision resolution just cleared a spot for. The rewrite
loop is tolerant of a target whose row no longer exists (this run's own delete, or a prior half-applied
run) or already carries its planned text — both count as `no_op`, never a failure. Live baseline
[CONFIRMED, read-only SQL against `kwrsbpiseruzbfwjpvsp`, 2026-09-04]: `item_forward_events` carries 1,017
rows across 160 items; 541 (535 strict-clean + 6 already `"…"`-fragment-marked, both by a SQL
approximation of `classifyAfterResidue`) already read as post-fix-normalized — the idempotence baseline a
re-run should reproduce. Grouping the live table by the collision key's non-text columns alone
(`intelligence_item_id, event_date, event_kind, coalesce(source_claim_id, source_section_id)`) — the
necessary precondition for any collision, since those columns are shared verbatim between
`forwardEventIdentityKey` and the collision key — finds 111 candidate groups / 235 rows already sharing
that identity pre-fix (0 of them already share identical text, confirming the live index is intact today);
this is an **upper bound** on real post-rewrite collisions (some groups hold genuinely distinct obligations
under different `source_span`s within one shared source, which migration 275's own key was built to
preserve — see that migration's NZIA precedent). The exact collision count requires running the actual
`extractForwardEvents` against each item's live claims/sections, which happens at MAINT dispatch time
(this environment has read-only DB access only); `planCollisions`/`postRewriteKey` are unit-tested against
fixtures shaped on this exact failure (two rows, one source, converging after-text; one retext target
colliding with an untouched row; a half-applied table where one side is already correct).

**Why the obligations register (migration 290) needs no companion run** [CONFIRMED, read
`supabase/migrations/290_obligations.sql` in full]: the `obligations` table has no `obligation_text`
column and no `source_span` column — the migration's own header states it explicitly, one home per fact,
reached via `forward_event_id`. A register row's own denormalized columns are unchanged by an
`obligation_text` edit, so `scripts/obligations/derive-obligations.mjs` is out of this step's scope and
out of this lane's write set.

**Dispatch**: `mode=dry` reports `counts` (`items_scanned`, `retext_target_total`, `by_defect_class`,
`by_after_defect_class`, `duplicate_group_total`, `collision_group_total`, `collision_delete_total`),
`retext_targets` (before/after/defect classes per row, each row's `after` also classified by the new
`classifyAfterResidue` — lane FWD-TEXT-2 — under `after_defect_classes`, so a dry run proves the
fixed-producer property test against itself: every non-empty class there is a residual case worth looking
at, and `classifyAfterResidue` returning only `["honest_fragment_marked"]` and/or `["clean"]` across the
sweep is the expected steady state), `duplicate_groups`, and `collisions` (`groups`, `survivors`,
`deletions` — full row JSON per `collide_delete`, plus a restore note); writes nothing. `mode=apply` (no
`--arg` required beyond an optional scope) first `guardedDelete`s every `collisions.deletions` row
(chunked at 200, cited, snapshotted), THEN rewrites `obligation_text` on every remaining retext target
through the guarded `db.mjs` path (cite + snapshot, one single-row `guardedUpdate` per target — each
carries a *different* new text, unlike `canonical-key-dedup.mjs`/`record-hollow-sweep.mjs`'s one shared
patch — tolerant of a target already gone or already correct, counted `no_op`, never a failure), records
`per_item[]` (before/after + `restore_sql`), and reads back both the deletes (`collisions.read_back`) and
the survivors (`read_back`). `--arg ids:<id,id,...>` scopes the sweep (and collision detection) to named
`intelligence_item` ids (dry or apply). `duplicate_groups` is reported in every mode, including apply, and
stays a report only — `collisions` is the one finding this step actually applies.

**Reversal**: two paths, same convention as record-hollow-sweep/canonical-key-dedup above:
- **Durable, artifact-based** (preferred): `summary.json`'s `per_item[].restore_sql` — one self-contained
  `UPDATE item_forward_events SET obligation_text = '...' WHERE id = '...'` per rewritten row, from THIS
  run's own "before" value. A `collide_delete` has no `restore_sql` (a `DELETE` has no single-statement
  undo without the row's full prior state) — use the snapshot path below for those.
- **Best-effort, same-disk-only**: `mode=apply, arg=restore:<id,id,...>` (this same script) — scans
  `scripts/_snapshots/*.jsonl` for this step's own prior-state entries (cite-reason substring `"MAINT
  forward-events-retext dispatch (Lane FWD-TEXT"`, which both `CITE` and `DELETE_CITE` carry) and replays
  the LATEST one per id: a `guardedUpdate` snapshot (text-only) replays via `guardedUpdate`; a
  `guardedDelete` snapshot (always the FULL prior row, `select("*")`) replays via `guardedInsert` — same
  id, every column, verbatim. Refuses (never guesses) any id with no matching snapshot entry, listed in
  `missing_ids`.

**Artifact / read back**: `summary.json`'s `counts` (`items_scanned`, `retext_target_total`,
`by_defect_class`, `by_after_defect_class`, `duplicate_group_total`, `collision_group_total`,
`collision_delete_total`, `no_op_total`), `retext_targets`, `duplicate_groups`, `collisions` (`groups`,
`survivors`, `deletions`, and in apply mode `deleted`/`read_back`), `per_item` (before/after +
`restore_sql` per rewritten row, apply only), `no_op_ids`, and `read_back` (`retexted_total`,
`not_confirmed_ids` — computed over every surviving target, applied or `no_op`). Confirm against `SELECT
id, obligation_text FROM item_forward_events WHERE id = ANY(<retext target ids>)` (should equal the
planned `after` text for every id) and `SELECT id FROM item_forward_events WHERE id = ANY(<collide_delete
ids>)` (should return zero rows).

**Registration**: `docs/inventories/shared-dataset-ownership.md`'s `item_forward_events` section (this
step's file added to the enforced JSON allowlist and the narrative writer-path list as write path 4; that
entry's prose updated by lane RETEXT-COLLIDE to describe the DELETE path — the JSON allowlist itself is
unchanged, since it gates by file, not by write verb, and this file was already listed there).
