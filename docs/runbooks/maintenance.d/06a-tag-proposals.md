## 6a. `tag-proposals`

**Purpose**: write the TAG proposal flags that make untagged items VISIBLE to an operator - the write
half `tag-ratification` (section 7, below) has always had a caller for, but that `propose-tags.mjs` itself
never had until this step. **The defect this closes** (coordinator-confirmed, 2026-09-03): 339 of 619
verified, live `intelligence_items` carry all three connection-signature tag arrays empty
(`topic_tags`, `compliance_object_tags`, `operational_scenario_tags`), so `discover.mjs` scores them 0
edges - see `propose-tags.mjs`'s own header for the exact mechanism. `population-turn.yml` has always
run `propose-tags.mjs --dry --since <run start>` unconditionally, which computes the same plan but
writes nothing (`--dry` is that script's own default and its DRY RUN branch writes nothing, by
construction); no maintenance step ever called its `--execute` path. Live, before this step: 0 open and
0 resolved `flywheel-tag:` `integrity_flags` rows have ever existed.

**Upstream**: `fsi-app/scripts/connections/propose-tags.mjs`'s own `proposeTags()` core - extracted from
that file's former inline `main()` body (Lane TAG-PROPOSALS, 2026-09-03) into a DB-injected, exported
function so this step could import and call it unmodified, the same "logic lives once, deps injected"
shape `apply-tags.mjs`'s `applyTags()` already established for section 7. Nothing is reimplemented; the CLI's
own stdout is byte-for-byte unchanged by that extraction.

**Ruling**: none needed. Writing a proposal flag IS the visibility; it is **not** tagging. This step
**never writes `intelligence_items`** - only `integrity_flags` proposal rows. A proposal becomes a written
tag when section 7 (`tag-ratification`) decides it by rule (auto-adoption, operator ruling 2026-09-03). The
original operator path, a flag resolved with the `ratify:tags` marker, was DELETED by lane G6-GATES
(2026-10-05): nothing in the data machine waits on a typed token.

**Dispatch**: `arg` selects the population, exactly as `propose-tags.mjs`'s own CLI selectors do:
- (blank) or `untagged` - every verified, live item with all three signature tag arrays empty (the
  default, matching `propose-tags.mjs`'s own default).
- `since:<ISO-date>` - items `created_at >=` that timestamp (narrow scope; stale-resolution is scoped to
  this run's own selection, never global).
- `ids:<uuid,uuid,...>` - exactly these items (selected regardless of tag state; narrowed to
  empty-signature items before any flag is built).

`mode=dry` reports counts per selection, a per-item proposal preview (item id + the proposals
`derive-tags.mjs` found), and the exact apply command for this selection; writes nothing. `mode=apply`
does **not** require `arg` - an unqualified apply runs the same `untagged` default `propose-tags.mjs`'s
own `--execute` (no selector) runs; this mirrors that script's own CLI rather than `tag-ratification`'s
per-id-required gate, because writing a PROPOSAL is not the higher-blast-radius action a blanket
apply-and-ratify would be. Writes new proposal rows via the guarded insert path and auto-resolves stale
ones no longer reproduced by the fresh computation (rule 015).

**Artifact / read back**: `summary.json`'s `counts.preview` (per-item proposals this run would/did
write) and `counts.plan` (`new_count` / `stale_count` / `unchanged`). `read_back` is always empty - this
step changes no `intelligence_items` row, only `integrity_flags`; confirm against
`SELECT count(*) FROM integrity_flags WHERE status = 'open' AND created_by LIKE 'flywheel-tag:%'`.

---

