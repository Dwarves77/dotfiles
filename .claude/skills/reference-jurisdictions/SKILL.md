---
name: reference-jurisdictions
description: Entity MODEL contract for the jurisdiction layer. Eleven entity types, hierarchy and bloc-membership rules, alias resolution. The actual data (5,000-10,000 canonical jurisdiction entries: countries, subnationals, supranational blocs, maritime zones, ports, free zones, indigenous nations) lives in the jurisdictions entity table per v2 audit Section 6.1. The data-ingest dispatch builds the table against this spec; writers and classifiers query the table at runtime, NOT this skill file.
---

# Reference: Jurisdictions (entity model spec)

## What this skill is, and what it is NOT

This skill describes the entity MODEL for jurisdictions. It is the contract that the to-be-built `jurisdictions` entity table conforms to. It is NOT the data.

The data (~5,000-10,000 canonical entries) is too large to live in markdown and would create a [[rule-cross-reference-integrity]] failure mode if it did (two stores for the same fact: the skill file and the database table). Per operator instruction 2026-05-15:

> The skill should describe the table shape as a SPEC, not as canonical SQL. The migration file is the canonical source for the actual DDL when it lands. If the skill carries literal SQL too, you've created the same cross-reference-integrity problem the v2 audit kept naming: two stores for the same fact, drift inevitable.

This skill is the model contract. The migration that creates the table is the canonical source for the DDL. The data-ingest dispatch (see `docs/multi-tenant-foundation-followups-2026-05-15.md` item 4) builds the table against this spec.

Writers and classifiers query the database table at runtime. They do NOT read this skill file for jurisdiction data.

## The eleven entity types

A jurisdiction entity is one of:

1. **country** — sovereign or sovereign-equivalent state, ISO 3166-1 alpha-2
2. **subnational** — principal subdivision of a country (state, province, region, prefecture, canton, Land, autonomous community, federal subject); ISO 3166-2
3. **supranational_bloc** — multi-country grouping whose rule reach is the union of members (EU, EEA, Schengen, USMCA, Mercosur, ASEAN, GCC, EAEU, AfCFTA, CPTPP, Pacific Alliance, ECOWAS, COMESA, African Union, Commonwealth)
4. **treaty_zone** — rule scope defined by treaty, distinct from bloc membership (e.g., a treaty governing transit rights through a specific corridor that is not a bloc membership)
5. **maritime_zone** — non-land jurisdiction where maritime rules apply (SECAs, NECAs, EEZs, PSSAs, Polar Code areas, strategic waterways such as Suez, Panama, Hormuz, Malacca, Bab-el-Mandeb, Bosphorus, Dover)
6. **airspace_zone** — flight information region or air traffic control zone with cargo-relevant rules (used sparingly; most airspace rules attach to country or to airport via city/port entries)
7. **port** — sea or river port; UN/LOCODE; rules attach when the port has shore-power, sulfur-cap, congestion, or other port-level requirements distinct from the surrounding country
8. **city** — municipal jurisdiction with cargo-relevant rules (low-emission zones, congestion charging, noise curfews); city of operation, not city of incorporation
9. **free_zone** — free trade zone or special economic zone with customs treatment distinct from the surrounding country (China SEZs, India SEZs, UAE free zones, Panama Colon, Philippines Subic)
10. **indigenous_nation** — sovereign tribe with freight-relevant jurisdiction (US Native American tribes with port operations or fishing rights, Canadian First Nations, Aboriginal communities with port or land-route control)
11. **regulatory_body_global** — IMO, ICAO; rules carry global jurisdictional weight on flag-state vessels and civil aviation. Not jurisdictions in the territorial sense but the model treats them as canonical entities so items can attach to them.

## Entity row shape (spec, not canonical SQL)

Each entity in the `jurisdictions` table has these fields. The canonical implementation lives in the migration that creates the table; this is the spec the data-ingest dispatch builds against.

| Field | Type sketch | Purpose |
|---|---|---|
| canonical_id | text, primary key | Stable identifier: ISO code where applicable (US, US-CA, EU), MarineRegions MRGID for maritime zones, UN/LOCODE for ports, hand-curated for blocs and indigenous nations (e.g., MARINE-SECA-BALTIC, FZ-UAE-DXB) |
| display_name | text, required | Human-readable name in the canonical language for the entity |
| entity_type | text, required, constrained to the eleven types above | The kind of jurisdiction |
| parent_ids | text array | Materialized closure of canonical containment (US-CA → [US, NORTH-AMERICA]); used for ancestor-traversal queries without recursion |
| member_ids | text array | Bloc membership fan-out (EU → [AT, BE, BG, ...]); used for member-expansion queries on supranational_bloc entities |
| covers_ids | text array | For cross-cutting zones that affect specific countries (a SECA's covers_ids lists the coastal countries whose vessels are bound by the SECA); distinct from parent_ids |
| iso_codes | structured (JSON) | ISO 3166-1 alpha-2, ISO 3166-2, UN M49, MarineRegions MRGID, UN/LOCODE — whichever applies; null for entities without a registered ISO code |
| aliases | text array | All known surface forms ("California", "Calif", "CA", "Cal") that resolve to canonical_id; used for fuzzy lookup |
| notes | text | Free-text disambiguation (e.g., "Hong Kong distinct from PRC for freight purposes; both HK and CN-HK records exist with cross-link") |
| source | text | Where this row's data came from: "ISO 3166-1", "UN M49", "MarineRegions", "hand-curated", "ICAO doc 7474" |
| source_version | text | Version of the source registry at ingest time (e.g., "ISO 3166-1:2020"); used for re-ingest decisions |
| created_at | timestamp | Standard audit |
| updated_at | timestamp | Standard audit |

Index recommendations for the migration:
- GIN index on `aliases` (alias lookup is the hot path for the classifier)
- GIN index on `parent_ids` (ancestor traversal)
- GIN index on `member_ids` (bloc fan-out)
- Unique index on `canonical_id` (primary key implies this)
- B-tree on `entity_type` (filter by kind)

These are recommendations to the data-ingest migration, not committed schema decisions. The migration author makes the final call based on query patterns at ingest time.

## Hierarchical containment rules

- A child entity's `parent_ids` is the CLOSURE of its canonical containment, not just the immediate parent (US-CA → [US, NORTH-AMERICA], not just [US]).
- Items tagged with a child match queries for any ancestor: `WHERE 'US' = ANY(parent_ids)` returns US-CA rows.
- The closure is materialized in `parent_ids` (not computed at query time) for read performance; the trade is recompute cost on parent-rename or hierarchy restructure, which is rare.
- The root of the hierarchy is a synthetic GLOBAL entity (entity_type = `supranational_bloc` or a dedicated `root` type, decided at migration time); every other entity has GLOBAL somewhere in its parent_ids closure.

## Bloc membership resolution

- Bloc membership is distinct from containment. A country can be a member of multiple blocs (Germany is in EU and Schengen and Eurozone and NATO; only the freight-relevant ones are tracked).
- An item tagged with a bloc (e.g., `EU`) expands to the bloc's `member_ids` for downstream queries that need the country list ("show me items applicable to any EU member").
- Members of a bloc carry the bloc in their `parent_ids` only when the bloc's rules bind the member (EU is a parent of DE for binding regulations; Schengen is a parent of DE for free-movement rules; NATO membership does not appear in parent_ids because NATO has no freight-relevant rules in this model).
- A bloc's `member_ids` is the canonical source for "who is in this bloc"; do not infer from countries' `parent_ids`.

## Cross-cutting zones

Maritime zones, free zones, indigenous nations, and regulatory bodies do not fit the country-then-subnational hierarchy. They have their own structure:

- **Maritime zones**: parent_ids = [GLOBAL] or [GLOBAL, OCEAN-name]; covers_ids lists the coastal countries bound by the zone. A vessel transiting a SECA gets the SECA rule regardless of flag state.
- **Free zones**: parent_ids = [country, subnational_if_applicable]; the zone is geographically inside its host country but operates under distinct customs and tax treatment.
- **Indigenous nations**: parent_ids = [country] (sovereignty is shared with the host country in most cases; the indigenous nation may have specific freight-relevant rights within the host).
- **Regulatory bodies (IMO, ICAO)**: parent_ids = [GLOBAL]; covers_ids is implicit (IMO covers all flag states; ICAO covers all civil aviation). Items attach to these entities when the rule is set by the body rather than by a national regulator.

## Alias resolution

- Any text form ("California", "Calif", "CA", "Cal", "US-CA", "the State of California") resolves to canonical via the GIN-indexed `aliases` field.
- Resolution is case-insensitive and trim-tolerant. Lookup is via `LOWER(alias) = ANY(aliases)` after the GIN search.
- Ambiguity (e.g., "CA" → Canada or California) requires context. [[classifier-jurisdiction]] provides the context (surrounding freight terms: if "CARB" is nearby, "CA" is California; if "USMCA" is nearby, "CA" might be Canada). The lookup function returns multiple matches when context is missing and lets the caller decide or escalate.
- New aliases land via the data-ingest dispatch (initial seed) plus hand-curation as the corpus surfaces unmapped surface forms.

## Source authorities

- **ISO 3166-1 alpha-2** for countries (~195 UN-recognized plus a handful of non-UN entities like Taiwan, Kosovo, Palestine where freight context matters)
- **ISO 3166-2** for subnationals (~2,500-3,000 entries covering US states, Canadian provinces, Mexican states, Brazilian states, Indian states, Australian states/territories, Chinese provinces, German Länder, Spanish autonomous communities, French regions including overseas, Italian regions, Swiss cantons, Japanese prefectures, South Korean provinces, Russian federal subjects, Indonesian provinces, Argentinian provinces, plus subnationals for South Africa, Saudi Arabia, UAE, Nigeria, Thailand, Vietnam, Malaysia, Philippines, anywhere customs or environmental rules differ at the subnational level)
- **UN M49** for regional groupings (continents, subregions)
- **MarineRegions.org Marine Gazetteer** for maritime zones, EEZs, IHO sea areas (canonical MRGID identifiers)
- **ICAO doc 7474** for airspace zones if needed
- **UN/LOCODE** for ports and cities
- **Hand-curated** for treaty blocs, free trade zones, indigenous nations (no global registry; sourced from operator-curated lists, government publications, and treaty texts)

## Writer and classifier query contract

- All canonical lookups go through the database table, not the skill file
- The skill file is the contract for table shape; it is NOT the source of jurisdiction data at runtime
- [[classifier-jurisdiction]] resolves source-text mentions to canonical_id via the table's alias index
- [[writer-yaml-emission]] emits canonical_id values only; raw text mentions in prose are permitted but the structured fields hold canonical_id
- Queries for "items in EU" expand via the bloc's member_ids fan-out
- Queries for "items in US-CA or any ancestor" use parent_ids GIN index

## What this skill replaces

The migration 072 `_normalize_jurisdictions()` trigger does limited alias normalization at write time without consulting a canonical table. When the data-ingest dispatch lands, the trigger gets retired in favor of table-based resolution at the classifier layer. The trigger's existing alias map seeds the initial table content.

## Data-ingest follow-up dispatch

Per `docs/multi-tenant-foundation-followups-2026-05-15.md` item 4, the data ingest is its own dispatch. Scope:

- Create the `jurisdictions` entity table conforming to this spec
- Ingest from the source authorities listed above
- Hand-curate the bloc, free-zone, and indigenous-nation entries
- Backfill `intelligence_items.jurisdictions` and `jurisdiction_iso[]` to use canonical_id values from the new table
- Retire migration 072's normalizer trigger

Cost frame per [[rule-cost-weighted-recommendations]]:
- One-time agent work: medium (the ingest is the bulk of the work; ~$50-200 in Claude API spend for hand-curation passes)
- Ongoing runtime: low (jurisdictions data changes slowly; updates are rare)
- Ongoing infrastructure: none beyond the table itself
- Inheritance: high (every jurisdiction-aware feature reads this table; per-jurisdiction filtering and ranking become canonical)
- Value frame: revenue-accelerating (jurisdiction-aware features are operator-facing premium capabilities); not revenue-blocking today, defers cleanly until a jurisdiction-aware feature requires it
- Manual gating: not applicable (the table is read-only at runtime; ingest is operator-initiated)

## Composition

- Inherits from: [[rule-cross-reference-integrity]] (the table is canonical; the skill file is the spec, not a parallel store)
- Composed with: [[classifier-jurisdiction]] (the classifier queries the table for alias resolution), [[writer-yaml-emission]] (emits canonical_id values), [[operational-entity-resolution]] (the table is the seed data for the jurisdictions entity layer)
- Cross-referenced by: [[reference-priority-source-registry]] (priority sources are typed with the jurisdictions they cover)

## Audit cross-reference

- v2 audit Section 6.1 (master data and entity resolution; jurisdictions is the canonical example)
- v2 audit Section 3 / S3 (jurisdiction field overloaded with agency names, continents, cities; canonical table fixes this)
- Migration 072 `jurisdiction_normalizer` trigger (retires when the table lands)
- `docs/multi-tenant-foundation-followups-2026-05-15.md` item 4 (the data-ingest follow-up dispatch)
- Operator instruction 2026-05-15 (post multi-tenant deploy): "The skill should describe the table shape as a SPEC, not as canonical SQL. The migration file is the canonical source for the actual DDL when it lands."
