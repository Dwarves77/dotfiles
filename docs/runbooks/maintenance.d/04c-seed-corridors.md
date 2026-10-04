## 4c. `seed-corridors`

**Purpose**: corridor identity rows on the entity spine (`entities.kind = 'corridor'`, id
`cl:corridor:<ORIGIN>-<DEST>:<mode>` per ADR-024 section 4). Read by the Market Intel carbon-cost overlay.

**Upstream**: `fsi-app/scripts/entities/seed-corridors.mjs` (Lane CORR). Candidates come from what the
corpus names (`market_series.series_key`, `regional_data_facts.fact_label` under the `corridor:` convention);
when nothing does, the ADR-024 worked example (CNSHA-NLRTM, ocean) is planned and `using_fallback` is true.

**Ruling**: none.

**Dispatch**: `mode=dry` lists candidates and which would be created; `mode=apply` inserts the missing
ones through the guarded path and reads back every `kind='corridor'` entity id.

**Artifact / read back**: `summary.json`'s `read_back.entity_ids` against
`SELECT entity_id FROM entities WHERE kind = 'corridor'`.

---

