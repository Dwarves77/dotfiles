# Sprint 1 Followups

Operational items captured from verification gates, audits, and SQL reviews. Each entry has a phase context, owner trigger condition, recommended action, and priority.

This file is the single place to look for "what did we surface but defer." Phase-specific issues belong in their phase doc; cross-cutting or post-merge observations belong here.

---

## OBS-1: Phase 5 sequencing constraint (CLEARED 2026-05-17)

**Source:** PR #119 pre-merge SQL review (2026-05-17)
**Phase:** 5 (data migration)
**Priority:** Cleared
**Status:** RESOLVED, migration 082 applied 2026-05-17 18:34 UTC.

The 4a-only window during which migration 080's trigger silently discarded rejected tokens has closed. Migration 082 replaced the trigger with the routing version: rejected tokens now route to `ingest_rejections` or `pending_jurisdiction_review` per `_classify_jurisdiction_token`. Phase 5 is no longer blocked by this specific constraint.

**Replacement concern.** Phase 5 backfill introduces a different trigger-related issue captured as OBS-5 below. Phase 5 design must address OBS-5 before backfill starts.

---

## OBS-2: 2-letter and ISO-3166-2 pass-through soft validation gap

**Source:** PR #119 pre-merge SQL review (2026-05-17)
**Phase:** 5 (data migration audit), or standalone post-Sprint-1 cleanup
**Priority:** Low, pre-existing from migration 072

The `_normalize_jurisdictions` function passes any 2-letter uppercase string through unchanged (treating it as an ISO 3166-1 country code) and passes any string matching `^[A-Z]{2}-[A-Z0-9]{1,4}$` through unchanged (treating it as an ISO 3166-2 subdivision code). This means `XX` or `XX-YYZZ` would canonicalize to themselves without CASE validation.

Pre-existing from migration 072, not a 080 regression. The canonical array can therefore contain valid-shape-but-invalid-content tokens. Examples that would slip through: `ZZ`, `US-ZZZZ`, `XX-99`.

**Action:** During Phase 5 backfill or as a standalone audit, run a check against the canonical ISO 3166-1 / 3166-2 reference list. Surface any tokens that pass the shape regex but are not in the reference list as candidates for operator review. Reference list source: ISO 3166 Online Browsing Platform or the `i18n-iso-countries` npm package.

Could also be tightened at the function level by adding a CHECK against a CTE of valid codes, but that adds complexity to an `IMMUTABLE` function and increases the maintenance surface. Audit-and-flag is cheaper.

---

## OBS-3: ICAO literal-string fragility (`'icao member states (193)'`)

**Source:** PR #119 pre-merge SQL review (2026-05-17)
**Phase:** Post-Sprint-1 refactor candidate
**Priority:** Lowest

The CASE entry `WHEN 'icao member states (193)' THEN 'ICAO'` is a literal-string mapping. ICAO currently has 193 member states, but the count has changed historically. If ICAO membership changes and source data updates the parenthetical count, the literal mapping fails and the token routes to the rejected array.

Pre-flight on current data confirms only one row carries this exact form, and it currently matches. Risk is low.

**Action:** When the ICAO mapping needs to change, or as opportunistic cleanup, replace the literal with a regex or substring match: `WHEN key ~ '^icao member states' THEN 'ICAO'`. PostgreSQL CASE supports regex via separate WHEN clauses, so this is a small refactor.

Even lower priority because the string is unlikely to appear in source data verbatim outside of operator-authored content.

---

## OBS-4: `jurisdiction_iso` normalization routes through the same trigger as `jurisdictions` (IMPLEMENTED 2026-05-17)

**Source:** PR #119 pre-merge SQL review (2026-05-17)
**Phase:** 4b implementation (closed), Phase 7 triage UI (open)
**Priority:** Implemented at schema layer
**Status:** RESOLVED via migration 082.

Migration 082 added `pending_jurisdiction_review.source_column text NOT NULL DEFAULT 'jurisdictions'` with CHECK against `('jurisdictions', 'jurisdiction_iso')`. Approach 1 (explicit column tracking) was chosen over Approach 2 (uniform treatment). The trigger function in 082 writes the correct `source_column` for each rejected token from each column (migration 082 lines 261 and 282).

The same enum on `ingest_rejections` is NOT needed because that table's audit semantic does not depend on which column the bad value came from; it records the event, not the column scope.

**Phase 7 triage UI dependency.** The reclassification flow reads `source_column` and writes the operator's chosen canonical replacement back to that same column on `intelligence_items`. Phase 7 design doc must capture this read-write coupling explicitly.

---

## OBS-5: Trigger pollution on UPDATEs creates ingest_rejections rows for non-ingest events

**Source:** PR #120 pre-merge SQL review (2026-05-18)
**Phase:** 5 (data migration design must address before backfill starts)
**Priority:** Medium

Migration 082's trigger function `_intelligence_items_normalize_jurisdictions()` writes to `ingest_rejections` without `ON CONFLICT` for every rejected token on every INSERT or UPDATE. This is correct semantics for INSERT events (each ingest attempt is its own audit-worthy event). On UPDATE, if the intelligence_item still carries pre-existing rejected tokens (which Phase 5 has not yet cleaned up), the trigger creates new `ingest_rejections` rows even though no actual ingest occurred.

Phase 5 backfill is the exact workflow that triggers this pollution: every UPDATE on an item with bad jurisdictions tokens inflates the audit log with non-ingest events.

**Action.** Phase 5 design doc must pick one of three options:

1. **Disable the trigger during backfill**, route rejected tokens manually in the backfill script. `ALTER TABLE intelligence_items DISABLE TRIGGER trg_intelligence_items_normalize_jurisdictions;` Run backfill calling `_normalize_jurisdictions(...)` and `_classify_jurisdiction_token(...)` directly. Re-enable trigger. Pro: zero pollution, bounded scope. Con: backfill script duplicates routing logic, must stay in sync with the trigger.

2. **Add a `TG_OP` / `OLD` comparison guard to the trigger function**, restrict `ingest_rejections` INSERT to `TG_OP = 'INSERT'` only, or compare NEW.jurisdictions against OLD.jurisdictions on UPDATE to only INSERT for newly-rejected tokens. Pro: cleanest long-term semantics. Con: requires a migration 083.

3. **Accept the pollution as documented behavior**, filter at Phase 7 triage UI by `triage_action IS NULL` and treat duplicate untriaged rows as a single triage decision. Pro: zero migration churn. Con: UI complexity; audit log fidelity suffers.

**Recommendation.** Option 1 for Sprint 1 (Phase 5 backfill is bounded; trigger disable is acceptable for a one-time pass). Option 2 as a migration 083 candidate for Sprint 2 if ongoing UPDATE traffic on existing items proves to be a real source of pollution post-Phase-5.

---

## OBS-6: `item_supersessions.severity` value choice for Phase 5 dedup (informational)

**Source:** Phase 5 implementation pre-flight (2026-05-18)
**Phase:** 5 implementation choice; potential Sprint 2 vocabulary cleanup
**Priority:** Informational

Pre-flight observed existing `item_supersessions.severity` vocabulary as severity-LEVEL (`major` x4, `minor` x1), not domain-semantic. Per operator dispatch Q5 rule ("if existing rows follow a domain-semantic convention, match it; otherwise use 'duplicate_merge'"), Phase 5 writes `'duplicate_merge'` for the new RC-9 dedup supersessions. This creates a mixed-vocabulary column (severity-level values + a domain-semantic value).

**No action required for Phase 5.** Surfaced so the operator sees the inconsistency. Sprint 2 cleanup options if it bothers anyone: (a) add a separate `supersession_kind` column with a domain-semantic CHECK constraint, leaving `severity` for severity-level only, (b) backfill the existing 5 rows to the new domain-semantic vocabulary, (c) accept the mixed vocabulary and document it on the column.

---

## OBS-7: Norway Fjords instrument_type pending counsel review

**Source:** Phase 5 operator decision Q1 (2026-05-18)
**Phase:** Post-Phase-5; counsel review then UPDATE
**Priority:** Medium (blocks canonical-entity key coverage on this row)

Per Q1, the Phase 5 dedup transaction leaves Norway Fjords winner row `03b5f234...` with `instrument_type = NULL` pending counsel review. The audit proposed `national_regulation`; operator may prefer `agency_guidance` depending on legal status reading. While `instrument_type` is NULL, this row sits OUTSIDE the 079 partial unique index coverage (which requires both `instrument_type` AND `instrument_identifier` NOT NULL).

The `instrument_identifier` was populated (`'world-heritage-fjords-ZE-2026'`); only `instrument_type` is missing.

**Action.** When counsel review completes, single UPDATE applies the chosen value:

```
UPDATE public.intelligence_items
   SET instrument_type = '<chosen_value>'
 WHERE id::text LIKE '03b5f234%';
```

After the UPDATE, the row enters canonical-entity coverage and the unique index protects against future duplicates of this Norway regulation.

---

## OBS-8: OBS-2 broader audit deferred to Sprint 1 follow-up dispatch

**Source:** Phase 5 operator decision Q8 (2026-05-18)
**Phase:** Standalone Sprint 1 follow-up dispatch
**Priority:** Low

OBS-2 (2-letter and ISO-3166-2 pass-through soft validation gap) flagged that canonical arrays can contain valid-shape-but-invalid-content tokens. Phase 5 implementation pre-flight ran a sample audit (7 two-letter + 5 ISO-3166-2 reject patterns); zero hits. Per Q8, the broader audit (cross-reference all 46 distinct two-letter tokens + 60 ISO-3166-2 tokens in production data against the `i18n-iso-countries` reference list) is deferred to a separate Sprint 1 follow-up dispatch.

**Action.** Schedule a small Sprint 1 follow-up dispatch to run the broader audit. Bounded work (one introspect script + comparison against the reference list); approximately 30 minutes of agent work. Surfaces any items requiring operator review.

---

## OBS-9: Carryforward from earlier phases (placeholder)

Reserved for items surfaced during Phase 6, 7, 8, 9, 10, 11 verification gates. Edit in place when adding entries.
