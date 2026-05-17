# Sprint 1 Followups

Operational items captured from verification gates, audits, and SQL reviews. Each entry has a phase context, owner trigger condition, recommended action, and priority.

This file is the single place to look for "what did we surface but defer." Phase-specific issues belong in their phase doc; cross-cutting or post-merge observations belong here.

---

## OBS-1: Phase 5 sequencing constraint (must apply 4b before Phase 5 backfill)

**Source:** PR #119 pre-merge SQL review (2026-05-17)
**Phase:** 5 (data migration)
**Priority:** Hard constraint, not optional

Migration 080's trigger function silently discards rejected tokens during the 4a-only window (the comment at the in-function discard explains the posture). The rejected array is computed but not routed because the `ingest_rejections` and `pending_jurisdiction_review` tables don't exist yet, they ship in migration 082 (Phase 4b).

If Phase 5 backfill runs between 4a apply and 4b apply, the trigger fires on each UPDATE and silently drops any unmapped tokens. Those tokens are then lost from the system, the audit gap stays open even though the data was touched.

**Action:** Phase 5 design doc must include an explicit dependency check: do not start Phase 5 backfill until migration 082 has applied. Acceptable alternatives:
1. Apply 4b first, then 5 (recommended).
2. Apply 5 first with explicit acknowledgment that pre-4b backfill accepts silent drop of unmapped tokens (and that operator queue tables will be empty until ingest fires after 4b).

Recommend option 1. Cost of waiting on 4b is ~1 PR cycle; cost of losing tokens is permanent audit gap reopening.

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

The CASE entry `WHEN 'icao member states (193)' THEN 'ICAO'` is a literal-string mapping. ICAO currently has 193 member states, but the count has changed historically (192, 191, ...). If ICAO membership changes and the source data updates the parenthetical count, the literal mapping fails and the token routes to the rejected array.

Pre-flight on current data confirms only one row carries this exact form, and it currently matches. Risk is low.

**Action:** When the ICAO mapping needs to change (or as opportunistic cleanup), replace the literal with a regex or substring match: `WHEN key ~ '^icao member states' THEN 'ICAO'`. PostgreSQL CASE supports regex via separate WHEN clauses (`WHEN (key ~ 'pattern')` is true), so this is a small refactor.

Even lower priority because the string is unlikely to appear in source data verbatim outside of operator-authored content.

---

## OBS-4: `jurisdiction_iso` normalization routes through the same trigger as `jurisdictions`

**Source:** PR #119 pre-merge SQL review (2026-05-17)
**Phase:** 4b (note in design doc)
**Priority:** Informational, not actionable

The migration 080 trigger runs `jurisdiction_iso` through `_normalize_jurisdictions` alongside `jurisdictions`. When migration 082 lands, rejected tokens from `jurisdiction_iso` will route to the operator queue (`ingest_rejections` or `pending_jurisdiction_review`) alongside rejected tokens from `jurisdictions`.

This is the right behavior, a malformed `jurisdiction_iso` is an equally valid audit signal. But it means the operator queue mixes signals from both columns. The triage UI in Phase 7 should either:
1. Show which column the rejected token came from (recommend `column_name` enum in the operator queue table), OR
2. Treat them uniformly (the operator picks a canonical replacement and the trigger writes it to whichever column held the bad token).

**Action:** Phase 4b design doc explicitly notes this. Phase 7 triage UI design picks one of the two approaches.

---

## OBS-5: Carryforward from earlier phases (placeholder)

Reserved for items surfaced during Phase 5, 6, 7, 8, 9, 10, 11 verification gates. Edit in place when adding entries.
