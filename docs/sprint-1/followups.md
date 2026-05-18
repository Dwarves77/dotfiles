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

## OBS-6: `item_supersessions.severity` value: 'replacement' chosen (CHECK constraint reveal)

**Source:** Phase 5 turn-2 workload B failure (2026-05-18)
**Phase:** 5 implementation (resolved)
**Priority:** Informational (history of Q5 amendment)

**Original framing (now incorrect):** Pre-flight observed existing `item_supersessions.severity` vocabulary as severity-LEVEL (`major` x4, `minor` x1). I picked `'duplicate_merge'` per Q5's "otherwise" clause, expecting mixed vocabulary as the cost.

**CHECK constraint discovery:** Workload B's first cluster INSERT failed with `severity_check` violation. Constraint is `CHECK (severity = ANY(ARRAY['major', 'minor', 'replacement']))`. Pre-flight missed this because no existing rows used `'replacement'`. The constraint includes a domain-semantic value (`'replacement'`) that wasn't visible in the row sample.

**Amended choice:** `SEVERITY_VALUE = 'replacement'` in the backfill script. Per Q5 rule "if existing rows follow a domain-semantic convention, match it" — `'replacement'` IS the domain-semantic match (the canonical winner REPLACES the loser). The original Q5 fallback to a new value is no longer needed since the CHECK already has the right domain-semantic vocabulary.

**Lesson for future pre-flight:** vocabulary discovery must check the CHECK constraint definition, not just the values observed in existing rows. A CHECK constraint can allow values that no row currently uses.

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

## OBS-9: Classifier feedback loop Sprint 2 pre-implementation decisions

**Source:** Classifier feedback loop sequencing dispatch (2026-05-18)
**Phase:** Sprint 2 pre-work; not blocking now
**Priority:** Medium (Sprint 2 entry)

Operator authorized Sprint 2 placement for the classifier feedback loop. Three architectural decisions captured for the Sprint 2 implementation-design dispatch:

1. **Rule-promotion vs score-recalibration vs both.** Operator view: probably both. Rule-promotion for vocabulary (the 080 CASE table, sources tier list). Score-recalibration for threshold tuning (the 75/55 constants in `fsi-app/src/lib/sources/verification.ts:255-260`).

2. **Versioning posture.** Operator view: tracked entity for rule-promotion paths (CASE entries need history), file-versioned for thresholds. Implementation design should land a tracked-entity schema for vocabulary additions and keep thresholds in `verification.ts` with git history.

3. **Approval model.** Operator view: single-operator auto-apply with audit log for early Sprint 2. Revisit if Caro's Ledge grows multi-operator authority via Cliodhna / Caren / Jake delegation.

**Skill load reminder for the Sprint 2 implementation dispatch:** `environmental-policy-and-innovation` MUST be loaded before authoring loop mechanics. The skill's source-taxonomy + integrity rules govern how classifier decisions translate to canonical vocabulary changes.

---

## OBS-10: Spot-check drift event rate monitoring post-Phase-7

**Source:** Classifier feedback loop sequencing dispatch (2026-05-18)
**Phase:** Post-Phase-7 ship through Sprint 2 loop ship
**Priority:** Monitoring (escalates to "pull Sprint 2 loop earlier" if threshold trips)

Recurring spot-check at `fsi-app/src/app/api/admin/spot-check/recurring/route.ts:14-24` alerts on >5% false-positive drift but has no automated remediation. Between Phase 7 ship and Sprint 2 loop ship, every drift event becomes manual recalibration work (operator or whoever inherits triage delegation).

**Action.** After Phase 7 ships, track the drift event rate. **Threshold: if drift events fire faster than ~1 per week, pull the Sprint 2 loop sequencing earlier.** The "relief Sprint 2 was supposed to deliver" is already being felt as manual burden when the rate is that high.

No action required pre-Phase-7. Capture in operator dashboard once Phase 7 ships and triage UI begins emitting decisions.

---

## OBS-11: Phase 5 design § 6.1 rollback procedure missing trigger-bracket

**Source:** Phase 5 turn-2 incident (2026-05-18)
**Phase:** Phase 5 implementation (mitigated); future-design reference
**Priority:** Medium

(Operator instruction said "OBS-9"; on this branch OBS-9 was already taken by classifier-loop pre-decisions, so this entry takes OBS-11. Number difference is a doc-state mismatch between master and the in-flight implementation branch, not a content disagreement.)

Phase 5 design § 6.1 rollback procedure assumed `UPDATE intelligence_items SET jurisdictions = snap.jurisdictions, ...` could run with the trigger enabled. That assumption is wrong: `_intelligence_items_normalize_jurisdictions` fires on every UPDATE and re-normalizes the snapshot values, stripping unmapped tokens (e.g., ASIA, EUROPEAN_UNION) right back out AND writing new IR routing rows. The Phase 5 turn-2 first rollback attempt revealed this by growing `ingest_rejections` 30 → 60 mid-transaction (`fsi-app/scripts/tmp/phase-5-rollback.mjs` first run).

**Mitigation (applied 2026-05-18).** Any rollback path that UPDATEs `intelligence_items` requires a `DISABLE TRIGGER trg_intelligence_items_normalize_jurisdictions` / `ENABLE TRIGGER` bracket, same as workload A. The Phase 5 rollback script at `fsi-app/scripts/tmp/phase-5-rollback.mjs` carries this; the refactored backfill script at `fsi-app/scripts/phase-5-backfill.mjs` carries inline comments in the rollback section reminding future readers.

**Design doc NOT updated:** the Phase 5 design doc is archived; this followup is the canonical home for the finding.

**Future-design implication:** any migration or backfill that UPDATEs `intelligence_items` AND intends to preserve specific values (i.e., values that the trigger would otherwise normalize via the canonical CASE in migration 080) MUST use the DISABLE/ENABLE bracket. Capture this in any Sprint 2 / Phase 6 / Phase 11 design that touches the table.

---

## OBS-12: Per-row script pattern unsuitable for backfill scale; use CTE bulk SQL going forward

**Source:** Phase 5 turn-2 incident + refactor (2026-05-18)
**Phase:** Reference pattern for future backfills (Phase 5 carryforward, applies to Sprint 2+, Phase 6/8/11 if backfill needed)
**Priority:** Canonical-pattern guidance (not a defect)

The original Phase 5 design's per-row script pattern (one transaction per batch, ~5-10 round trips per row, ~1000 queries per 100-row batch) is unsuitable for production scale. First turn-2 execute failed mid-batch with "DbHandler exited" from the Supabase transaction-mode pooler.

**Canonical pattern going forward:** for any bulk processing on `intelligence_items` (or any table) that needs to mirror trigger semantics:

1. Use **session-mode pooler** (port 5432) for long-running scripts with multi-step transactions.
2. **Wrap inner work in a single CTE chain** per batch (normalize + UPDATE + classify + INSERT) using `LATERAL` joins on the SQL functions. One round trip per batch.
3. **Mirror the trigger function exactly** — cite the trigger function's line ranges in the SQL constant's comment. If the trigger changes, the bulk SQL must follow in lockstep.
4. **DISABLE/ENABLE TRIGGER bracket** around the UPDATE if the SQL would otherwise fire the trigger and recurse (see OBS-11).
5. **Batch size 50** as a default safety belt. The bulk SQL pattern is fast enough at 50; the smaller batch keeps the per-batch lock window short.

**Reference implementation:** `fsi-app/scripts/phase-5-backfill.mjs:BULK_NORMALIZE_AND_ROUTE_SQL` (commit `30ba022`). Per-row patterns SHOULD NOT be reused for future backfills.

---

## OBS-13: Six rows with all-rejected jurisdictions have no PJR routing path

**Source:** Phase 5 turn-2 workload A post-state inspection (2026-05-18)
**Phase:** 5 post-flight gap; Phase 7 design dependency
**Priority:** Medium

Workload A re-normalization left 6 rows with `jurisdictions = []`:

| ID prefix | Title | Original tokens | Classification |
|---|---|---|---|
| `0f93eb09` | ECLAC Regional Development Framework | CARIBBEAN, LATIN AMERICA, REGIONAL - MULTI-COUNTRY | All region_bucket / unparseable |
| `68af10b5` | Transportation 2050 LAC | CARIBBEAN, LATIN AMERICA | All region_bucket |
| `c3318232` | Hong Kong EPD Portal | HONG_KONG | unparseable (underscore variant not in CASE) |
| `ece93c54` | OECD Automated Driving | OECD_MEMBER_STATES | undefined_group |
| `5351d10b` | IADB Transport Framework | IDB_REGION | unparseable |
| `67c6e313` | ADB Asia Transport | ASIA_PACIFIC, EUROPE, MULTILATERAL | region_bucket + continent + undefined_group |

**Gap.** The tokens that classify as `continent` / `region_bucket` / `undefined_group` route to PJR (per-item flag, recoverable via Phase 7 triage). The tokens that classify as `unparseable` (HONG_KONG, IDB_REGION) route to IR (per-ingest-event audit, NOT keyed by item_id). For rows where the ONLY rejected token classifies as unparseable, there is no per-item triage path — the row is effectively orphaned.

**Post-flight gate 7.2a impact:** the gate checks "every row has canonical jurisdictions OR a PJR entry". 3 of the 6 rows (the ones with PJR-routed tokens) pass; the other 3 (HONG_KONG, IDB_REGION, possibly others) fail.

**Recommended action options:**

1. **Phase 7 design tweak.** Triage UI gains a third tab: "items with all-rejected jurisdictions" that queries `intelligence_items` directly for empty-jurisdictions rows and lets the operator manually pick canonical replacements. No new schema.
2. **Schema addition.** Add a `pending_item_review` table (or reuse PJR with a sentinel `current_value = '__ALL_REJECTED__'`) so the row is queryable by item_id in the same triage path as PJR.
3. **CASE table additions.** Add HONG_KONG → HK, IDB_REGION → undefined_group, and similar to migration 080's CASE. This shrinks the problem set but doesn't eliminate it (any future unmappable token recreates the gap).

**Recommendation:** option 1 for Phase 7 (Sprint 1 scope). Option 3 for opportunistic cleanup whenever a new pattern surfaces. Option 2 as a Sprint 2 design if volume justifies.

**Workaround for Phase 5 post-flight:** the script's gate 7.2a will FAIL on these 3 rows. Expected; not a Phase 5 implementation defect, a Phase 7 design dependency surfaced by Phase 5. Operator may want to soften the gate to log-and-continue rather than HALT.

---

## OBS-14: Carryforward from earlier phases (placeholder)

Reserved for items surfaced during Phase 6, 7, 8, 9, 10, 11 verification gates. Edit in place when adding entries.
