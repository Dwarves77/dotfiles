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

## OBS-14: Triage UI lacks inline source metadata; every triage decision is a multi-tab workflow

**Source:** Operator mid-Phase-5-turn-2 walkthrough of /admin at carosledge.com (2026-05-18)
**Phase:** 7 (admin chrome + triage UI; natural integration point per `docs/sprint-1/phase-7-scope-amendment.md`)
**Priority:** Medium

The operator observed during a /admin walkthrough that the integrity flag UI shows the flag itself but does not show the underlying source's metadata (paywall status, tier, access type, ingestion endpoint, last verified date). To fully handle a flag, the operator must open SOURCE REGISTRY in a separate tab, locate the source, update its metadata, then return to the triage view. Every triage decision becomes a multi-tab workflow.

The same pattern applies platform-wide to all three operator queues: integrity flags, `pending_jurisdiction_review`, `ingest_rejections`. Each queue surfaces the flagged record but not the source-side context the operator needs to act on it.

**Underlying design principle.** This OBS is a specific manifestation of **DP-1: Single-Pane Operator Review** (`docs/design-principles.md`). DP-1 forbids tab-switching across the admin surface to handle related decisions on the same item. The integrity-flag triage workflow described above is the canonical Sprint 1 violation example cited in DP-1. Compliance with DP-1 on the Phase 7 design is binding, not aspirational.

**Cross-references.**

- **DP-1 (Single-Pane Operator Review):** the underlying axiom. Phase 7 triage UI design must demonstrate DP-1 compliance.
- **OBS-4:** the `source_column` tracking added in migration 082 already gives the reclassification flow the column-scoped read-write coupling it needs; the operator-experience gap is the layer above that, source metadata visibility next to the column scope.
- **OBS-13:** the all-rejected-jurisdictions rows that fail gate 7.2a are another surface where the triage UI gap matters; whichever option the Phase 7 design takes for those rows inherits the same source-metadata-inline expectation and is itself subject to DP-1.
- **OBS-9 (Sprint 2 classifier feedback loop):** this finding is characteristic of the broader queue-friction pattern that loop is designed to relieve; operator decisions today do not feed back into the system, so each decision starts from zero context.

**Action.** Surface this expectation at Phase 7 design time as part of the triage-UI scope, with DP-1 cited as the binding constraint. Implementation path is Phase 7 designer territory; this entry records the operator-experience requirement, not a prescribed solution.

---

## OBS-15: Briefs cite journal homepages without article-level source context

**Source:** Operator mid-Phase-5-turn-2 walkthrough of /admin at carosledge.com (2026-05-18)
**Phase:** 6 (ingest wiring, brief generation) primary; 7 dependency for triage UI display of any new article-level fields
**Priority:** Medium

The operator observed that when the agent generates a brief citing a journal source, the citation points to the journal homepage rather than the specific article or articles consulted. Journal article metadata (DOI, title, authors, abstract, publication date) is freely accessible from publisher sites before any paywall; the agent does not pull it.

Effect on the operator triaging the brief: the operator cannot determine what article was actually cited, what it said, or whether full-text access was required versus metadata-only. The brief's source list is technically populated but operationally opaque.

**Underlying design principle.** The Phase 7 display half of this OBS (operator triaging a brief needs DOI, authors, and abstract inline so they can act without leaving the triage surface) is a specific manifestation of **DP-1: Single-Pane Operator Review** (`docs/design-principles.md`). The Phase 6 generation half (the brief must populate article-level fields in the first place) is the upstream dependency that makes Phase 7 DP-1 compliance possible. Phase 6 design owes the field contract; Phase 7 design owes the inline rendering.

**Cross-references.**

- **DP-1 (Single-Pane Operator Review):** the underlying axiom for the Phase 7 display half. Phase 6 design must deliver the article-level fields Phase 7 needs to inline.
- **OBS-14:** the triage UI gap and this one share the operator-experience theme that platform surfaces show records without the source-side context needed to act on them; both compound at scale; both are DP-1 manifestations.
- **OBS-9 (Sprint 2 classifier feedback loop):** this finding is also characteristic of the broader pattern that loop addresses; article-level provenance is exactly the kind of decision context that, once captured, should feed back into source tier and verification status downstream.

**Action.** Surface this expectation at Phase 6 design time as part of the brief-generation scope, with the Phase 7 triage UI as the downstream consumer of any new article-level fields and DP-1 cited as the binding constraint on the Phase 7 display. Implementation path is Phase 6 and Phase 7 designer territory.

---

## OBS-16: Carryforward from earlier phases (placeholder)

Reserved for items surfaced during Phase 6, 7, 8, 9, 10, 11 verification gates. Edit in place when adding entries.

---

## OBS-17: `/admin` route gates on workspace role but renders platform-wide data

**Source:** System audit 2026-05-18 post-PR-#122, Section D drift finding DRIFT-D.1
**Phase:** 7 (admin chrome) BINDING CONSTRAINT
**Priority:** High (potential cross-tenant exposure)

The single `/admin` route at `fsi-app/src/app/admin/page.tsx` gates on inline `org_memberships.role IN ('owner','admin')` (workspace-membership-derived) but renders platform-wide data: all orgs via `OrganizationsTable`, all sources via `fetchSourceData(includeAdminOnly=true)`, platform `integrity_flags`. Banner copy says "you are looking at platform-wide controls," but the gate is workspace-membership-derived. No `is_platform_admin` check is performed in the route file. RLS may compensate at the data layer; the route-level gate does not match the surface's stated scope.

**Binding constraint for Phase 7.** Phase 7 admin chrome MUST implement `requirePlatformAdmin()` per the RC-1 plan from [[OBS-1]] and close this cross-tenant exposure. The fix replaces the inline `org_memberships.role` check with the platform-scoped helper authored in Phase 1's Option C split-helpers work.

**Cross-references.**

- **OBS-1 (cleared):** Phase 1 split-helpers (Option C) established the `requirePlatformAdmin()` design intent; Phase 7 is the consumer that closes the loop.
- **OBS-14:** the triage UI inline-source-metadata scope inherits whichever gate Phase 7 selects; if the gate is correct (platform-admin only), the consolidated single-pane surface inherits the correct scope.
- **DP-1:** the consolidated single-pane surface required by DP-1 inherits whichever role gate Phase 7 implements; getting the gate right is upstream of DP-1 compliance.

**Action.** Phase 7 design dispatch MUST cite OBS-17 in its OBS coverage table and demonstrate that the redesigned `/admin` route gates on `requirePlatformAdmin()` (or an equivalent platform-scoped helper). RLS-only compensation is NOT acceptable as the sole defense; the route-level gate must match the surface scope.

---

## OBS-18: `/market` "Watch this week" alerts SideCard is non-interactive

**Source:** System audit 2026-05-18 post-PR-#122, Section G drift finding DRIFT-G.1
**Phase:** 7 (admin chrome and customer-facing surfaces) BINDING CONSTRAINT
**Priority:** Medium (customer-facing value-delivery gap)

`MarketPage.tsx:368-384` SideCard renders `{watchCount + elevatedCount}` followed by "alerts" (data-driven, not hard-coded). Clickthrough wiring is BROKEN: the SideCard is a static `<div>` with no `onClick`, no `<Link>`, no `href`. The summary text below names categories ("technologies" / "price signals") but provides no navigation. The operator sees a number, cannot act on it, and must cross-reference the StatStrip tiles manually to find the alert items.

**Binding constraint for Phase 7.** Phase 7 design dispatch MUST address the alerts card clickthrough. Two acceptable patterns: (1) wire the SideCard as a button that activates the matching priority filter on the same page, OR (2) wire it as a `<Link>` to a filtered view. The operator must be able to reach the alert items from the count in one click.

**Cross-references.**

- **DP-1 (Single-Pane Operator Review):** customer-facing pages are OUT of DP-1 scope per the principle's exclusions, BUT this finding shares the operator-experience theme that surfaces show counts without click-through. Treat the spirit of DP-1 (decisions are reachable from where the operator sees them) as guidance.
- **OBS-14:** same operator-experience theme on operator surfaces; both manifest from the same UI debt pattern.

**Action.** Phase 7 design dispatch addresses the alerts card and the related "Coverage snapshot unavailable" and other non-interactive customer-facing summaries.

---

## OBS-19: `/operations` region-level "Coming soon Phase D" banner mis-attributes wiring gap as coverage gap

**Source:** System audit 2026-05-18 post-PR-#122, Section G drift finding DRIFT-G.2
**Phase:** 7 (customer-facing) or Phase 6 (ingest wiring) BINDING CONSTRAINT
**Priority:** Medium (customer-facing value-delivery gap; data exists but UI does not show it)

`OperationsPage.tsx:446-450` fires a `ComingSoonBanner` labeled "Phase D" when an open region exists but `chips.every(c => c.items.length === 0)`. The region IS in the `regions` array (so it has items), but none of the 5 chip regex matchers (Solar, Electricity, Labor, EV Charging, Green Building from CHIP_DEFS at lines 64-70) caught any of the items. Real ingested items slot nowhere visible. The banner mis-communicates the cause: the user reads "coming soon" and assumes coverage gap, but the actual cause is a wiring gap (matcher regex coverage).

**Binding constraint.** Phase 7 (or Phase 6 if the fix lives in the ingest layer) MUST address one of:
1. Surface an "Uncategorized" fallback chip that renders any items that didn't match Solar/Electricity/Labor/EV/Green Building.
2. Relax the chip matchers to catch the actual ingested-item title patterns.
3. Replace the "Phase D" banner copy with accurate language ("Items present but not categorized by current matchers; review needed") in the interim.

**Cross-references.**

- **OBS-15:** both findings share the theme of UI surfaces under-displaying real ingested data; OBS-15 is the brief-citation manifestation, OBS-19 is the operations-page manifestation.
- **OBS-13 (gate 7.2a):** OBS-13 captures a similar pattern at the jurisdiction layer (items with all-rejected jurisdictions have no per-item triage path); OBS-19 captures the analogous pattern at the operations chip layer.

**Action.** Phase 7 design dispatch (or Phase 6 if scoped to ingest) cites OBS-19 and chooses one of the three remediation options. The "Phase D" banner copy MUST NOT be retained for rows where items exist but matchers missed them.

---

## OBS-20: `/market` EmptyState exposes internal worker-language to end users

**Source:** System audit 2026-05-18 post-PR-#122, Section G drift finding DRIFT-G.5
**Phase:** Skill-compliance finding (not phase-bound; any UI dispatch that touches the EmptyState should fix)
**Priority:** Medium (skill-compliance violation)

`/market` EmptyState body mentions "the worker writes item_type = 'technology' records" (or equivalent). This violates the `environmental-policy-and-innovation` skill's workspace-anchored rule: the output never names internal worker mechanics or schema-level identifiers to the end user. Operator-facing language only.

**Cross-references.**

- **environmental-policy-and-innovation SKILL.md:** the workspace-anchored rule section. The skill mandates that every customer-facing output is anchored to the workspace's role and operations, expressed in generic terms. Schema-language like `item_type = 'technology'` is internal mechanics and must not appear.
- **OBS-15:** OBS-15 captures a different manifestation of the same general theme (briefs lacking article-level context); both are workspace-anchored-rule adjacencies.

**Action.** Rewrite the EmptyState copy in workspace-anchored language. Example replacement: "Technology intelligence has not yet been ingested for the current filter. Adjust the filter or expand source coverage in the registry." This is a small UI-copy follow-up that any UI dispatch touching the EmptyState may fix; not phase-bound.

---

## OBS-21: Migration 078 gap in `supabase_migrations.schema_migrations`

**Source:** System audit 2026-05-18 post-PR-#122, Section A drift finding DRIFT-A.1
**Phase:** Non-blocking observation (likely PR sequencing artifact)
**Priority:** Low (expected to resolve when PR #117 merges)

Migrations 071, 072, 073, 074, 075, 076, 077, 079, 080, 081, 082 are present in `supabase_migrations.schema_migrations`. Migration 078 is missing. Per the migration 079 header note (and operator note 2026-05-18), this is expected: migration 078 is authored on an unmerged branch (PR #117) and will land in the schema_migrations log when that PR merges. Until then, the gap is a PR sequencing artifact, not a schema integrity failure.

**Cross-references.**

- **Migration 079 header:** notes the 078 dependency.
- **PR #117:** the PR that introduces migration 078.

**Action.** Monitor: when PR #117 merges, confirm migration 078 appears in `supabase_migrations.schema_migrations`. If 078 does NOT appear at that point, escalate (migration may have failed to apply). No action required pre-merge.

---

## OBS-22: Ingest scheduler idle since pause-OFF

**Source:** System audit 2026-05-18 post-PR-#122, Section C drift finding DRIFT-C.2
**Phase:** Monitoring (investigate if it persists)
**Priority:** Low (may be normal scheduler timing)

22+ minutes elapsed between pause-OFF (2026-05-18T18:16:54Z) and audit time (~2026-05-18T18:39Z) with zero writes to `ingest_rejections`, `pending_jurisdiction_review`, or `intelligence_items`. May be normal scheduler timing (next cron tick had not yet fired) OR a higher-layer pause that is independent of `system_state.global_processing_paused`.

**Cross-references.**

- **OBS-10:** post-Phase-7 drift event rate monitoring; OBS-22 is the pre-Phase-7 analogue (monitoring whether ingest is actually running).
- **system_state.global_processing_paused:** confirmed `false` at audit time; the database-layer flag is correct.

**Action.** Monitor. If at the next operator session (or within 24 hours) ingest still shows zero activity, dispatch a separate investigation: check the GitHub Actions cron schedules at `.github/workflows/`, check whether the drain-first-fetch worker has been invoked, check whether wave1 daemon is alive. If activity has resumed by the next session, close OBS-22 as steady-state.

---

## OBS-23: `/admin` audit log tab is a reachable ComingSoonBanner placeholder

**Source:** System audit 2026-05-18 post-PR-#122, Section D drift finding DRIFT-D.2
**Phase:** 7 (admin chrome) planned UI debt
**Priority:** Low (planned per code comment "Phase D")

`AdminDashboard.tsx` declares an `audit` tab in the tab strip (`count: 0`) that renders a `ComingSoonBanner` placeholder. Comment at `AdminDashboard.tsx:836` states "Workspace-wide audit log lands in Phase D... captured at the database level and will surface here once the audit_log read endpoint ships." Operator has a navigable affordance with no functional surface behind it.

**Cross-references.**

- **OBS-17:** the `/admin` route gate scope-mismatch and the audit log placeholder both live on the same surface; whichever Phase 7 design redesigns the route also decides the audit log tab fate.
- **DP-1:** the consolidated single-pane operator review surface required by DP-1 will eventually need the audit log inline; the current placeholder is the precursor.

**Action.** Phase 7 design dispatch chooses: (1) hide the tab until the audit_log read endpoint ships, OR (2) implement a minimal read view. Tab strip should not advertise functionality that does not exist.
