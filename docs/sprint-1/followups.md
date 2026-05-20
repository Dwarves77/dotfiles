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

### 2026-05-19 Reopen

This OBS was closed by commit 6d18773 (Build 6 admin-gating sweep). Closure was premature.

The 2026-05-19 code-level positive-test audit (dispatched after seeding jasonlosh@hotmail.com with `is_platform_admin=true`) found 13 admin API routes that authenticate via `requireAuth()` but do NOT call `isPlatformAdmin()`; any authenticated user could hit them regardless of platform-admin status.

Track B-code re-enumeration (commit 4c7b546) applied enumerate-first discipline (Glob `src/app/api/admin/**/*.ts`, grep each for `requireAuth` and `isPlatformAdmin`) and found:

- The 13 routes from the prior audit's list
- **4 additional ungated routes** the prior audit missed: `sources/[id]/fetch-now`, `sources/[id]/pause`, `sources/[id]/regenerate-brief`, `sources/[id]/visibility`
- **2 routes the prior audit miscalled as `requireAuth`-only**: `recompute-trust`, `spot-check/recurring`; these gate via `x-worker-secret` header (cron-only endpoints called by GitHub Actions); adding `isPlatformAdmin` would break crons. Correctly excluded from fix scope.

Net fix scope: 15 routes gated in commit 4c7b546.

**Reopened because the methodological pattern that produced the original gap recurred in the verification audit itself.** This OBS now serves as audit-trail anchor for the methodology fix landed in this same dispatch (new Sweep-discipline rule in `fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md`).

**State:** Open (reopened 2026-05-19; tracking until full discipline closure observable on subsequent sweeps).

**Cross-references:** OBS-50 (this dispatch), Sweep-discipline rule in `fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md`.

---

## OBS-18: `/market` "Watch this week" alerts SideCard is non-interactive

**Source:** System audit 2026-05-18 post-PR-#122, Section G drift finding DRIFT-G.1
**Phase:** Sprint 2 Build 7 (Market Intel content + signal aggregation engine) per Sprint 2 plan
**Priority:** Medium (customer-facing value-delivery gap)

`MarketPage.tsx:368-384` SideCard renders `{watchCount + elevatedCount}` followed by "alerts" (data-driven, not hard-coded). Clickthrough wiring is BROKEN: the SideCard is a static `<div>` with no `onClick`, no `<Link>`, no `href`. The summary text below names categories ("technologies" / "price signals") but provides no navigation. The operator sees a number, cannot act on it, and must cross-reference the StatStrip tiles manually to find the alert items.

**Revised routing (2026-05-18 doc cleanup).** The original entry routed remediation to Phase 7 design. That routing was wrong. Phase 7 is admin chrome and operator triage UI per caros-ledge-platform-intent SKILL.md Section 4; not customer-facing. Routing customer-facing remediation to Phase 7 is an instance of the anti-pattern the platform-intent skill was rewritten to forbid (see skill Section 11). Correct owner is Sprint 2 Build 7 (Market Intel build) per Sprint 2 plan; the alerts SideCard interactivity is one element of the broader Market Intel feature build.

**Cross-references.**

- **OBS-26 (category routing wiring):** Build 7 depends on Build 4 (category routing) landing first; Market Intel cannot deliver differentiated alerts until /market stops sharing the unfiltered payload with /operations.
- **OBS-20:** /market EmptyState worker-language; another Market Intel build remediation item.
- **OBS-31:** the original Phase 7 routing on this entry is one of the anti-pattern instances catalogued for doc cleanup.

**Action.** Sprint 2 Build 7 (Market Intel) addresses the alerts card clickthrough as part of the signal aggregation engine build. Two acceptable patterns: (1) wire the SideCard as a button that activates the matching priority filter on the same page, OR (2) wire it as a `<Link>` to a filtered view. The operator must be able to reach the alert items from the count in one click. Build 7 dispatch owns design and implementation.

---

## OBS-19: `/operations` region-level "Coming soon Phase D" banner mis-attributes wiring gap as coverage gap

**Source:** System audit 2026-05-18 post-PR-#122, Section G drift finding DRIFT-G.2
**Phase:** Sprint 2 Build 9 (Operations content build) per Sprint 2 plan
**Priority:** Medium (customer-facing value-delivery gap; data exists but UI does not show it)

`OperationsPage.tsx:446-450` fires a `ComingSoonBanner` labeled "Phase D" when an open region exists but `chips.every(c => c.items.length === 0)`. The region IS in the `regions` array (so it has items), but none of the 5 chip regex matchers (Solar, Electricity, Labor, EV Charging, Green Building from CHIP_DEFS at lines 64-70) caught any of the items. Real ingested items slot nowhere visible. The banner mis-communicates the cause: the user reads "coming soon" and assumes coverage gap, but the actual cause is a wiring gap (matcher regex coverage).

**Revised routing (2026-05-18 doc cleanup).** The original entry routed remediation to Phase 7 (customer-facing) or Phase 6 (ingest wiring) as a binding constraint. That routing was wrong on two counts. First, Phase 7 is admin chrome and operator triage UI per caros-ledge-platform-intent SKILL.md Section 4, not customer-facing. Second, the chip-matcher remediations proposed (uncategorized fallback chip, relaxed regex, accurate banner copy) are content-surface fixes superseded by the deeper Operations build per Sprint 2 plan Build 9. Operations is structured content plus Intelligence Assistant plus customer judgment per skill Section 3, NOT a separate decision-engine UI build. The regex chip matchers themselves are the wrong product shape; Build 9 replaces them with structured content sections per the Operations Profile 8-section format defined in environmental-policy-and-innovation. The Tier 2 fixes already removed the "Coming soon Phase D" customer-facing copy leak.

**Cross-references.**

- **OBS-29 (Operations as content build):** the framing correction; the prior "separate decision-engine UI" framing was the same anti-pattern the platform-intent skill was rewritten to forbid.
- **OBS-26 (category routing wiring):** Build 9 depends on Build 4 (category routing) landing first; Operations cannot deliver structured content until /operations stops sharing the unfiltered payload with /market.
- **OBS-31:** the original Phase 7 / Phase 6 routing on this entry is one of the anti-pattern instances catalogued for doc cleanup.
- **OBS-15:** both findings share the theme of UI surfaces under-displaying real ingested data; OBS-15 is the brief-citation manifestation, OBS-19 is the operations-page manifestation.

**Action.** Sprint 2 Build 9 (Operations content build) supersedes the chip-matcher remediations. Build 9 replaces the chip matchers and the banner with structured content per the platform-intent skill Section 3 capabilities (regulatory feasibility by region, regional resource availability, labor markets, materials sourcing, infrastructure capacity, operational cost data). Build 9 is multi-sprint scope per Sprint 2 plan; the Intelligence Assistant (Build 5) handles cross-cutting questions during research.

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

---

## OBS-24: Trigger `_normalize_jurisdictions` does not derive `jurisdiction_iso` from canonical jurisdictions

**Source:** Critical investigations 2026-05-18 (Critical #1)
**Phase:** Sprint 2 Tier 3 Build 3 (migration 083) per Sprint 2 plan
**Priority:** HIGH

The trigger function `_intelligence_items_normalize_jurisdictions` normalizes the `jurisdictions` text array but does not derive `jurisdiction_iso` from it. 362 of 655 intelligence_items rows carry populated canonical `jurisdictions` tokens (alpha-2 country codes and ISO 3166-2 subdivision tokens that the canonical CASE map produced) but empty `jurisdiction_iso`. Phase 5 backfill did not cause this; the trigger semantic itself never wrote to `jurisdiction_iso`. The audit's 10-row sample extrapolated to 451 rows affected at first count; the precise post-backfill count is 362. Downstream effects: ISO-keyed queries (Map jurisdictional filters, region-scoped routing) miss rows that carry the canonical token but not the ISO derivation.

**Cross-references.**

- **OBS-4 (Implemented):** the `source_column` discriminator handles the column-scoped read-write coupling for triage; OBS-24 is orthogonal (derivation gap, not routing gap).
- **OBS-13:** the 5-row all-rejected-jurisdictions set is a different scope (rejected tokens with no canonical replacement); OBS-24 covers rows that DO have canonical tokens but no ISO derivation.
- **OBS-25:** Stage 2 schema reconciliation must complete first so migration 083 lands on a clean ledger.

**Action.** Sprint 2 Build 3 authors migration 083 extending `_normalize_jurisdictions` (or adding a helper called from the trigger) to derive `derived_iso` from canonical `jurisdictions` tokens. Alpha-2 token emits as-is; subdivision token emits parent country code; union and dedupe; merge into `jurisdiction_iso` only if empty (defensive choice; operator decides defensive-vs-aggressive). One-shot UPDATE on affected rows; idempotent. Build 3 dispatches after Build 1 (Stage 2 reconciliation) completes.

---

## OBS-25: 25-migration schema ledger drift (CLEARED via Schema Reconciliation Stage 1 Build, pending Stage 2 closure)

**Source:** Critical investigations 2026-05-18 (Critical #2), refined by Schema Reconciliation Stage 1 discovery 2026-05-18
**Phase:** Schema Reconciliation Stage 2 (Sprint 2 Tier 3 Build 1) per Sprint 2 plan
**Priority:** CRITICAL (Stage 1 closed the diagnostic; Stage 2 closes the remediation)

`supabase_migrations.schema_migrations` is missing 25 consecutive versions (026 to 050) plus version 070 (file deleted, ledger entry present) and version 078 (PR sequencing artifact, OBS-21). Stage 1 discovery (`docs/sprint-1/schema-reconciliation-discovery-2026-05-18.md`) determined the precise state: of the 026-050 block, 21 are FULLY APPLIED out-of-band (ledger does not know but schema objects exist), 2 are DML-only riders (045, 050), and 2 are GENUINELY UNAPPLIED (048 creates `integrity_flags` table; 049 creates 3 perf indexes). Migration 048 absence means production UI components (`IntegrityFlagsView`, `PlatformIntegrityFlagsView`) and three API surfaces silently return empty. The earlier framing of `recurring_spot_check_log` as a code-references-but-no-migration case was a false alarm; see OBS-N below for the Cleared annotation.

**Cross-references.**

- **OBS-17:** the `/admin` route gate scope-mismatch assumes `integrity_flags` exists; Stage 2 closure unblocks Build 6 (`requirePlatformAdmin()` + /admin gate fix).
- **OBS-14:** triage UI inline-source-metadata expectations also assume `integrity_flags` exists.
- **OBS-21:** migration 078 ledger gap (PR sequencing artifact); same root cause family.
- **OBS-40:** migration 070 file deletion (Stage 2 decides reconstruct vs accept).

**Action.** Sprint 2 Build 1 (Schema Reconciliation Stage 2) applies the HYBRID strategy per Stage 1 recommendation: backfill ledger entries 026-047 (21 entries; pure INSERT, no schema work), backfill ledger entries 045 + 050 (DML riders), apply migrations 048 + 049 + 050 in order on the live DB (CREATE TABLE / CREATE INDEX with IF NOT EXISTS guards), verify `recompute_agent_integrity_flag` body matches migration 044 not 035 before backfilling, decide migration 070 reconstruct-vs-accept-loss (OBS-40), decide migration 063 column-shadowing remediation path (OBS-30). Stage 1 closed the diagnostic; Stage 2 closes the remediation.

---

## OBS-26: Category-aware routing RPCs orphaned; intelligence pages share unfiltered payload (was REC-OBS-G)

**Source:** Alignment audit 2026-05-18 Section B, confirmed by Schema Reconciliation Stage 1 discovery
**Phase:** Sprint 2 Tier 3 Build 4 (foundation under Builds 7, 8, 9) per Sprint 2 plan
**Priority:** HIGH

Three category-aware RPCs exist in the live DB (`get_market_intel_items`, `get_research_items`, `get_operations_items`) and would route content to the correct intelligence page per source category if invoked. No code in `fsi-app/src` calls them. /market and /operations both call `get_workspace_intelligence_slim` and share the same unfiltered payload; /research has no category filter at all. The four intelligence pages therefore do not differentiate content by source category. This is foundation work: Sprint 2 Builds 7 (Market Intel), 8 (Research), and 9 (Operations) all depend on category routing landing first; without it, those builds rest on a payload that mixes all four source categories indiscriminately.

Additionally, the role-to-category mappings in the orphan RPCs would still misroute several sources per the rewritten platform-intent skill Section 3: IMO + ICAO route to Research in the orphan RPC but skill places intergovernmental binding-law bodies in Regulations; Carbon Trust + Project Drawdown route to Operations in the orphan RPC but skill places quantified-climate-research bodies in Research; FreightWaves + Loadstar + GreenBiz + Environmental Finance + Splash247 + Supply Chain Digital route to Market Intel in the orphan RPC but skill places industry analytical press with named editorial provenance in Research. Mapping refinement is part of Build 4 scope.

**Cross-references.**

- **OBS-9 (classifier feedback loop, Deferred to Sprint 2):** Sprint 2 pre-decisions on rule-promotion vs score-recalibration interact with category routing; the Sprint 2 classifier work informs whether `source_role` taxonomy gets refined (option a) or a canonical `classification_category` column is added to `sources` (option b).
- **OBS-14, OBS-17:** /admin surfaces that consume the category-aware payloads inherit the routing scope decision.
- **OBS-18, OBS-19, OBS-36:** all downstream of category routing wiring; Market Intel non-interactive alerts, Operations chip-matcher mis-attribution, and Regulations taxonomy bleed (Gallery Climate Coalition, Decarb Hub) all resolve as side effects when routing wires correctly.
- **OBS-27, OBS-28:** Intelligence Assistant quality (skill loading + citation surfacing) depends on category routing because the SELECT redesign should also route by category to deliver page-appropriate results.

**Action.** Sprint 2 Build 4 wires the three category-aware RPCs into application code (`getResourcesOnly` replacement or augmentation for /market and /operations; `getResearchPipeline` replacement or augmentation for /research). Operator decision required before dispatch: option a (refine role mapping in routing RPCs; faster, less correct long-term) vs option b (add canonical `classification_category` column to `sources`; slower, structurally correct, depends on classifier work OBS-9). Build 4 is foundation under Builds 7, 8, 9.

---

## OBS-27: Intelligence Assistant zero platform skill loading at query time (was Assistant F-1)

**Source:** Intelligence Assistant audit 2026-05-18 Section A
**Phase:** Sprint 2 Tier 3 Build 5 per Sprint 2 plan
**Priority:** HIGH

The Assistant's `/api/ask` route is a single-shot LLM proxy with a thin Supabase context injection. It loads zero platform skills at query time. The system prompt is a hardcoded string template; `environmental-policy-and-innovation` content (canonical taxonomy, integrity rule, severity vocabulary, format-mapping rules, intersection-detection contract, source-type hierarchy) never enters the prompt. A grep across `fsi-app/src` for `SKILL.md` or `environmental-policy-and-innovation` finds 9 matching files, none in `/api/ask`; the matches live in regeneration and classifier paths, not the user-facing Assistant. Per caros-ledge-platform-intent SKILL.md Section 4 the Assistant is required to be grounded in skill content. The current implementation is grounded only in Claude's training data plus 30 row summaries. Decision-engine behavior (F-2) was constrained in Tier 1 via prompt surgery; skill-grounding remains absent.

**Cross-references.**

- **OBS-26:** category routing wiring is upstream; the Assistant SELECT redesign in Build 5 should route by category so the Assistant returns page-appropriate items.
- **OBS-28:** structured citation surfacing requires the SELECT field additions Build 5 owns; the two findings co-deliver in Build 5.
- **OBS-29:** Operations as content build framing constrains the Assistant scope; the Assistant is the cross-cutting research helper, not the Operations decision engine.

**Action.** Sprint 2 Build 5 designs the skill-loading mechanism for Assistant runtime. Read environmental-policy-and-innovation SKILL.md (and possibly caros-ledge-platform-intent SKILL.md) at query time; embed relevant sections into system prompt context. Token-budget mitigation likely required (selective skill content loading based on query intent, possibly RAG retrieval over full skill inclusion). Verification: test against the Chrome audit's verified-failing queries ("What CBAM obligations are due in Q2 2026") to confirm response is grounded in platform content, not LLM training data.

---

## OBS-28: Intelligence Assistant citation surfacing structurally impossible (was Assistant F-3)

**Source:** Intelligence Assistant audit 2026-05-18 Sections B + C
**Phase:** Sprint 2 Tier 3 Build 5 per Sprint 2 plan
**Priority:** HIGH

The `/api/ask` route SELECTs from `intelligence_items` with the columns `title, summary, why_matters, key_data, category, jurisdictions, transport_modes, priority, status`. It omits `source_id`, `source_url`, `url`, `intersection_summary`, `related_items`, `full_brief`, `format_type`, `urgency_tier`, `topic_tags`. Per environmental-policy-and-innovation "Database Field Emission", these are the fields that ground a brief in a verifiable source and support intersection surfacing. None reach the Assistant. The sources query similarly omits URLs and the source_id linkage. The prompt instructs "Cite specific regulations and data points" as a string-level instruction but the LLM has no URLs or item IDs to cite that route back to platform records. Any cited URL would be a training-data hallucination, not a platform record. Post-processing is absent; the route returns the raw text verbatim with no citation validation. Response shape is `{answer, model}` free text; no `citations` field.

**Cross-references.**

- **OBS-27:** skill loading is the companion Tier 3 fix; both co-deliver in Build 5.
- **OBS-15 (Briefs cite journal homepages without article-level source context):** the Assistant inherits OBS-15's article-level opacity; Phase 6 ingest owner for field generation, but Build 5 must update the Assistant SELECT to consume the article-level fields once they land.
- **OBS-26:** category routing wiring is upstream; the SELECT redesign should integrate with category-aware payloads.

**Action.** Sprint 2 Build 5 redesigns the intelligence_items SELECT to include the source attribution and intersection-readiness fields. Adds citation post-processing that validates cited item_ids exist; rejects fabricated citations. Authors response shape that supports structured citations (item_id + source URL + title) routing to platform records. Frontend rendering updated to surface citations as links to /regulations/[slug] or equivalent. Verification: test queries on each page; confirm responses cite specific platform items by id; confirm citations route correctly; confirm response content matches what the user can verify on the linked page.

---

## OBS-29: Operations is a content build, NOT a separate decision-engine UI (was REC-OBS-H)

**Source:** Alignment audit 2026-05-18 Section G, codified in caros-ledge-platform-intent SKILL.md rewrite at 49628a0 (Sections 3, 4, 11)
**Phase:** Sprint 2 Tier 4 Build 9 (multi-sprint scope) per Sprint 2 plan
**Priority:** HIGH (framing correction; build scope correction)

The prior version of the platform-intent skill (commit 2429d4a) and the alignment audit authored against it both framed Operations as a separate cross-functional decision-engine UI build. That framing is wrong per the rewritten skill Section 3: Operations surfaces structured content; the customer reads the content and uses the Intelligence Assistant for cross-cutting questions during research; synthesis happens through structured content plus Assistant plus customer judgment, NOT through a separate decision-engine UI. Skill Section 11 lists "Operations as separate decision-engine UI build" as an explicit anti-pattern. Current state: 6 of 7 Operations capabilities per skill Section 3 are ABSENT (regulatory feasibility by region, regional resource availability, labor markets, materials sourcing, infrastructure capacity, operational cost data); only stub gallery with regex chip matchers exists. The Operations build is large because the content is large, not because the product shape requires a separate decision engine.

**Cross-references.**

- **OBS-19 (revised):** the prior Phase 7 / Phase 6 routing on OBS-19 was the same anti-pattern manifestation; the chip-matcher remediations are superseded by Build 9.
- **OBS-26:** Build 9 depends on Build 4 (category routing wiring) so /operations stops sharing the unfiltered payload with /market.
- **OBS-27, OBS-28:** the Intelligence Assistant is the cross-cutting answer helper for Operations decisions; Build 9 depends on Build 5 (Assistant quality).
- **OBS-31:** the original "separate decision-engine UI" framing is one of the anti-pattern instances catalogued for doc cleanup.

**Action.** Sprint 2 Build 9 scopes Operations as a structured content build per the Operations Profile 8-section format defined in environmental-policy-and-innovation. Each of the 7 capabilities is plausibly its own sub-build; total scope is Sprint 2 through Sprint 5 per the platform-intent skill. Anyone scoping a separate decision-engine UI is over-scoping per skill Section 11; surface for operator correction.

---

## OBS-30: Migration 063 column shadowing on `sources.tier` + `sources.jurisdictions`

**Source:** Schema Reconciliation Stage 1 discovery 2026-05-18
**Phase:** Sprint 2+ (decision required) per Sprint 2 plan
**Priority:** MEDIUM

Migration 063's `IF NOT EXISTS` column adds silently no-op for `sources.tier` and `sources.jurisdictions` because migration 004 already created them with incompatible types (INT vs TEXT, NOT NULL vs NULL). The 5-axis classification framework's intended schema change for these two columns never took effect. The columns exist; their types do not match what 063 intended. Downstream code that assumes the 063 types (TEXT-keyed tier values, nullable jurisdictions) interacts with 004 types (INT tier, NOT NULL jurisdictions).

**Cross-references.**

- **OBS-25:** discovered during Schema Reconciliation Stage 1; Stage 2 decides the remediation path.
- **OBS-26:** category routing wiring may inform whether `sources.tier` should align with the canonical four-category split or stay as the INT tier vocabulary.

**Action.** Sprint 2+ decision: option (a) ALTER fix to migrate existing columns to the 063 intended types (requires data migration); option (b) accept divergence and document; option (c) parallel columns with the 063 types living alongside the 004 types. Stage 2 Build 1 may surface a recommendation; operator decides.

---

## OBS-31: Sprint 1 docs contain anti-pattern framings the platform-intent skill was created to prevent (was REC-OBS-I)

**Source:** Alignment audit 2026-05-18 Section G, codified in caros-ledge-platform-intent SKILL.md rewrite at 49628a0
**Phase:** Sprint 1 doc cleanup pass (this dispatch closes the loop)
**Priority:** MEDIUM (governance hygiene)

Four Sprint 1 doc artifacts carry framings that the rewritten platform-intent skill Section 11 now lists as anti-patterns. (1) OBS-18 routed Market Intel customer-facing remediation to Phase 7 (admin chrome). (2) OBS-19 routed Operations customer-facing remediation to Phase 7 (admin chrome) or Phase 6 (ingest wiring) and proposed chip-matcher remediations rather than the deeper content build; the implicit framing was Operations as a separate decision-engine UI build. (3) `docs/sprint-1/system-audit-2026-05-18.md` conclusion (line ~314) states "Sprint 1 has shipped substantive infrastructure" without acknowledging the customer-facing value gap was understated. (4) `docs/sprint-1/critical-investigations-2026-05-18.md` sequencing language (lines ~237-252) absorbs customer-facing schedule slip silently. All four artifacts predate the skill rewrite at commit 49628a0.

**Cross-references.**

- **OBS-18, OBS-19:** revised in this doc cleanup dispatch (2026-05-18) to route to Sprint 2 Builds 7 + 9 respectively.
- **OBS-29:** the Operations as content build framing correction is the substantive resolution behind OBS-19's revision.
- **caros-ledge-platform-intent SKILL.md** Section 11 (Anti-Patterns): canonical list of forbidden framings.

**Action.** This dispatch (Sprint 2 Build 2 doc cleanup) covers the four artifacts: OBS-18 and OBS-19 revised in place; system-audit-2026-05-18.md gets a Post-Sprint-1 Acknowledgment postscript; critical-investigations-2026-05-18.md gets a Post-Sprint-1 Acknowledgment postscript. Future audits and dispatches inherit the corrected framings via the rewritten skill and the followups doc.

---

## OBS-32: Community sidebar placement contradicts co-equal surface model

**Source:** Alignment audit 2026-05-18 + Chrome live audit; codified by caros-ledge-platform-intent SKILL.md Section 3 (Community as core, co-equal with the four intelligence pages)
**Phase:** Sprint 2 Tier 4 Build 10 (structural alignment) per Sprint 2 plan
**Priority:** MEDIUM

The sidebar separates Community from the intelligence-pages block and places it in the account-chrome zone. This visually communicates Community as a sibling app or sub-feature rather than as a core customer-facing surface co-equal with Regulations, Market Intel, Research, and Operations. Per the rewritten platform-intent skill, Community is one of the five customer-facing surfaces and addresses the freight industry information-isolation problem; treating it as account-chrome contradicts the binding model. Chrome divergence on Community entry (OBS-33) compounds the placement issue.

**Cross-references.**

- **OBS-33:** chrome divergence on Community entry; both findings are Build 10 structural alignment scope.
- **OBS-34:** region taxonomy fork (Community uses friendly names; intelligence surfaces use ISO codes); structural unification under Build 10.
- **OBS-35:** Community cohort gap (all vendors art-logistics-specific); cohort expansion under Build 10.

**Action.** Sprint 2 Build 10 (Community structural alignment) moves Community from account-chrome zone to intelligence-pages block (co-equal with Regulations, Market Intel, Research, Operations).

---

## OBS-33: Community chrome divergence on entry ("← Back to Caro's Ledge" reflow)

**Source:** Chrome live audit 2026-05-18
**Phase:** Sprint 2 Tier 4 Build 10 (structural alignment) per Sprint 2 plan
**Priority:** MEDIUM

Community routes carry a "← Back to Caro's Ledge" navigation reflow that intelligence pages do not carry. The chrome divergence reinforces the placement issue captured in OBS-32: Community visually presents as a separate app the user must navigate back from, rather than as a co-equal surface within the platform.

**Cross-references.**

- **OBS-32:** sidebar placement; both findings are Build 10 structural alignment scope.

**Action.** Sprint 2 Build 10 unifies Community chrome with intelligence pages; the "Back to Caro's Ledge" reflow is removed; Community routes share the same chrome as the four intelligence pages.

---

## OBS-34: Region taxonomy fork between Community and intelligence surfaces

**Source:** Alignment audit 2026-05-18 + Chrome live audit
**Phase:** Sprint 2 (region taxonomy unification work; can run in Build 10 or as a parallel small dispatch) per Sprint 2 plan
**Priority:** MEDIUM

Community uses friendly region names (EU/Europe, United Kingdom). Intelligence surfaces use ISO codes (US-CA, AU-ACT). Two vocabularies for the same concept across the platform create cross-surface friction: a Community thread tagged "EU/Europe" does not surface alongside intelligence items tagged `eu`. Region taxonomy unification is required to support cross-surface routing and the eventual Map cross-cutting use (visualizing Community working group presence by region per skill Section 4).

**Cross-references.**

- **OBS-26 (category routing):** category routing wiring may also surface region-keyed filter requirements; coordinate unification with Build 4.
- **OBS-32, OBS-33:** Build 10 structural alignment; region unification is the data-layer companion to the chrome alignment.

**Action.** Sprint 2 region taxonomy unification: Community adopts ISO codes (or both adopt friendly names; operator decides). Future audit dispatch may surface additional jurisdictional content fields across intelligence_items that require alignment.

---

## OBS-35: Community cohort gap; all vendors art-logistics-specific

**Source:** Alignment audit 2026-05-18, Multi-Tenant Foundation Workstream B post-audit
**Phase:** Sprint 2+ Community cohort expansion per Sprint 2 plan
**Priority:** MEDIUM

Community vendor directory entries (Chenue, Mtec, Earthcrate, Rokbox) are all art-logistics-specific. Zero coverage for the broader cohorts the platform-intent skill names as architectural intent (live events, luxury goods, automotive, humanitarian; expansion: broader freight forwarding across air, road, ocean, rail). Working groups currently shipped per Workstream B carry the same cohort narrowness. This is a dual-posture narrowing per the platform-intent skill: Community serves current art-logistics scope only, not expansion-time users.

**Cross-references.**

- **OBS-32, OBS-33, OBS-34:** Build 10 structural alignment; cohort expansion is the content companion to structural alignment.
- **caros-ledge-platform-intent SKILL.md** "Dual posture is the default": narrowing without flagging is forbidden; this OBS surfaces the narrowing.

**Action.** Sprint 2+ Community cohort expansion: vendor directory and working-group taxonomy extended beyond current art-logistics cohort to cover the broader freight-forwarding cohort per ALL_SECTORS. Coordinates with sector_profile-driven Community group seeding for new workspaces (deferred per operator onboarding de-prioritization; cohort expansion is the prerequisite content work that does not depend on onboarding mechanics).

---

## OBS-36: Regulations taxonomy bleed (industry coalitions and initiatives surfacing under Regulations)

**Source:** Chrome live audit 2026-05-18
**Phase:** Downstream of OBS-26 category routing wiring (Sprint 2 Tier 3 Build 4) per Sprint 2 plan
**Priority:** MEDIUM

Gallery Climate Coalition and The Decarb Hub surface under /regulations. Both are industry coalitions/initiatives, not binding regulatory content; they belong under Market Intel or Research per the rewritten platform-intent skill Section 3 (`item_type` in `regulation, directive, standard, guidance, framework` for Regulations; `market_signal, initiative` for Market Intel; `research_finding` for Research). The bleed is a downstream symptom of OBS-26 (category-aware RPCs orphaned; all four intelligence pages share the unfiltered payload). Once Build 4 wires routing correctly with refined mappings, this OBS clears as a side effect.

**Cross-references.**

- **OBS-26:** root cause; Build 4 wires routing and refines mappings.

**Action.** No standalone action required. Build 4 verification includes sampling /regulations to confirm Gallery Climate Coalition + Decarb Hub no longer surface there. If items still bleed post-Build-4, surface as a new OBS for mapping refinement.

---

## OBS-37: Intelligence Assistant inline-interaction redesign (Option B per operator decision)

**Source:** Chrome live audit 2026-05-18, Intelligence Assistant audit Section B
**Phase:** Sprint 2+ Tier 4 (per-page vs floating Assistant unification) per Sprint 2 plan
**Priority:** MEDIUM

Per-page `AiPromptBar` instances on /market, /research, /operations, /regulations, /map look scoped (placeholder copy says "Ask anything about market intel" etc.) but the wire is identical to the global floating button. The bars dispatch CustomEvent `open-ask-assistant` with only `{question}` in detail; page, active filters, active tab, category are all dropped. Operator decision documented in Sprint 2 plan: Option B (inline-interaction redesign) is the chosen direction; per-page bars should pass page-scoped context (active filters, current category, item ids in view) into the Assistant payload, and the Assistant should respond in an inline panel rather than the global floating modal where context permits.

**Cross-references.**

- **OBS-27, OBS-28:** Tier 3 skill-loading + citation surfacing fixes are upstream of Tier 4 inline-interaction redesign; Build 5 lands first.

**Action.** Sprint 2+ Tier 4 dispatch redesigns per-page AiPromptBar instances to pass page-scoped context and renders responses inline where context permits.

---

## OBS-38: 26 SECURITY DEFINER functions in operator domain (privilege-escalation surface)

**Source:** Schema Reconciliation Stage 1 discovery 2026-05-18 (operator vs supabase_internal domain split)
**Phase:** Future audit dispatch (separate workstream) per Sprint 2 plan
**Priority:** LOW (bounded but worth scheduling)

The operator domain carries 26 SECURITY DEFINER project functions. Each is a privilege-escalation surface: functions execute with the definer's role rather than the caller's, which may bypass RLS in unintended paths. The set has not been audited row by row for whether each function's elevated privileges are necessary for its purpose. Risk is bounded (definer is platform-admin or service-role; functions are scoped to specific domain operations) but the surface area is non-trivial.

**Cross-references.**

- **OBS-17:** /admin route gate scope-mismatch is in the same security family; both surface RLS-vs-route-gate compensation patterns.

**Action.** Future audit dispatch enumerates the 26 functions, classifies each by purpose, flags any whose elevated privileges are not necessary, and proposes remediation (drop SECURITY DEFINER where unnecessary; restrict EXECUTE grants where necessary). Bounded scope; suitable for a separate small audit dispatch.

---

## OBS-39: Map mode toggle "Facility" scope drift per skill Section 4

**Source:** Chrome live audit 2026-05-18, codified by caros-ledge-platform-intent SKILL.md Section 4 (Map is a view of Regulations content; not a separate content category)
**Phase:** Operator decision (Sprint 2 small dispatch OR skill rescope) per Sprint 2 plan
**Priority:** LOW

The /map page exposes a "Facility" mode toggle. Per the rewritten platform-intent skill Section 4, Map is a geographic visual layer over Regulations content; it does not surface its own content category. A Facility mode exceeds Regulations scope (facilities are not regulatory content; they are operational entities). Two operator-decision paths: (a) remove "Facility" from the toggle and keep Map as a view of Regulations per skill; (b) formally rescope Map to include Facility data and update the skill Section 4 accordingly.

**Cross-references.**

- **caros-ledge-platform-intent SKILL.md** Section 4 (Map as view of Regulations): the binding framing.

**Action.** Operator decision. If option (a), small dispatch removes Facility from the toggle. If option (b), skill rewrite first (per skill authority grant; framing changes require operator-stated correction with strong emphasis).

---

## OBS-40: Migration 070 file deletion; RPCs intact via 071/073 CREATE OR REPLACE

**Source:** Schema Reconciliation Stage 1 discovery 2026-05-18
**Phase:** Schema Reconciliation Stage 2 (Sprint 2 Tier 3 Build 1) decision per Sprint 2 plan
**Priority:** LOW

Migration 070 is recorded in `supabase_migrations.schema_migrations` but the file is deleted from disk. The 5 RPCs that migration 071 references "from 070" all live in the live DB (created via CREATE OR REPLACE in 071 and 073). Schema state is intact; the loss is source-history only (operators cannot inspect the original 070 SQL to understand what was intended).

**Cross-references.**

- **OBS-25:** Schema Reconciliation Stage 2 closure includes this decision.

**Action.** Stage 2 Build 1 decides: (a) reconstruct migration 070 placeholder file from the live RPC definitions (preserves history; operator effort moderate); (b) accept the source-history loss and document. Operator decides during Build 1 dispatch.

---

## OBS-41: Dashboard regulation-centric; does not reflect five-surface model

**Source:** Chrome live audit 2026-05-18
**Phase:** Sprint 2+ Tier 4 Build 11 (Dashboard five-surface refactor) per Sprint 2 plan
**Priority:** LOW

The Dashboard surfaces Regulations content prominently with auxiliary tiles for the other surfaces; it does not present the five customer-facing surfaces (Regulations, Market Intel, Research, Operations, Community) as co-equal entry points. Per the rewritten platform-intent skill, the five-surface model is canonical; the Dashboard should reflect it as the entry-point overview rather than a Regulations-skewed view.

**Cross-references.**

- **OBS-26:** Build 11 depends on Build 4 (category routing) so the Dashboard can show differentiated content per surface.
- **OBS-32:** Build 11 depends on Build 10 (Community structural alignment) so Community appears as co-equal in Dashboard navigation.

**Action.** Sprint 2+ Build 11 (Dashboard five-surface refactor) restructures the Dashboard against the binding five-surface model. Prerequisites: Builds 4 and 10.

---

## OBS-42: `item_supersessions` joined `intelligence_items` rows have missing or test-quality titles

**Source:** Tier 2 UI hygiene investigation 2026-05-18 (surfaced by the "Title pending" fallback fix on Dashboard REPLACED rail)
**Phase:** Sprint 2 data-quality dispatch per Sprint 2 plan
**Priority:** LOW

The Tier 2 fix on the Dashboard REPLACED rail (ss1, ss2, ss3, ss5 entries) added a `title` projection to the fetch layer. The root cause was a missing `title` in the SELECT; the joined `intelligence_items` rows themselves may carry test-quality or missing titles that surface elsewhere if/when those rows appear in non-Dashboard contexts.

**Cross-references.**

- **Tier 2 commit (TBD):** the fetch-layer fix; data-layer follow-up is this OBS.

**Action.** Sprint 2 data-quality dispatch enumerates `item_supersessions` rows whose joined `intelligence_items` carry missing or test-quality titles; surfaces for operator triage (rename, archive, or accept).

---

## OBS-43: `/admin` audit log tab placeholder post-Tier-2 state

**Source:** System audit 2026-05-18 (OBS-23 already covers); this entry covers the post-Tier-2 state if it persists
**Phase:** Sprint 2 per Sprint 2 plan
**Priority:** LOW

OBS-23 captured the audit log tab placeholder. Tier 2 UI hygiene removed Phase-D leak copy but the tab itself remains a reachable ComingSoonBanner if no further build addresses it. This entry tracks the placeholder state post-Tier-2 for the Sprint 2 small dispatch that picks one of OBS-23's two options (hide the tab until the audit_log read endpoint ships, or implement a minimal read view).

**Cross-references.**

- **OBS-23:** parent finding; this entry is the post-Tier-2 continuation.
- **OBS-17:** /admin route gate is the upstream surface; Build 6 (`requirePlatformAdmin()`) lands before tab fate is decided.

**Action.** Sprint 2 small dispatch picks one of OBS-23's two options after Build 6 lands.

---

## OBS-44: Tier 1 Assistant decision-engine prompt constraint (Implemented)

**Source:** Intelligence Assistant audit 2026-05-18 (Assistant F-2); Tier 1 fix dispatch
**Phase:** Tier 1 (shipped)
**Priority:** Implemented
**Status:** IMPLEMENTED on `feat/tier1-assistant-constraint` at commit e0b1f98 (pending merge to main per operator decision D1).

The Assistant's `/api/ask` system prompt instructed decision-engine behavior (WHAT TO DO about it, owners, deadlines, per-sector risk grades). Tier 1 prompt surgery constrained the prompt to research-helper framing per caros-ledge-platform-intent SKILL.md Section 4. Live walkthrough evidence (CBAM response with action plan + owners + per-sector risk) confirmed the F-2 finding pre-fix.

**Cross-references.**

- **OBS-27, OBS-28:** Tier 3 fixes (skill loading + citation surfacing) remain open; Tier 1 closed only the prompt drift, not the underlying grounding gap.

**Action.** None pre-merge; operator authorizes merge per Sprint 2 plan operator decision point D1.

---

## OBS-45: Tier 2 UI hygiene fixes batch (Implemented)

**Source:** System audit + Chrome live audit 2026-05-18; Tier 2 fix dispatch
**Phase:** Tier 2 (shipped)
**Priority:** Implemented
**Status:** IMPLEMENTED on `feat/tier2-ui-hygiene` at commit 9b97c3c (pending merge to main per operator decision D1).

Tier 2 closed a batch of customer-facing UI hygiene findings surfaced across the audits:

- Phase-D copy leaks (14 instances): /research load-more, /research source coverage matrix, OnboardingWizard LinkedIn card, Community search toast, Community events backend, Community vendors backend, reactions API route copy, Settings notifications (Phase-C/D), BriefingScheduleSection, SavedSearchesSection, UserProfilePage (multiple), Community Post reactions, Moderation actions (PHASE_D_NOTE_MUTE constant + Phase D fallback toast), Operations ComingSoonBanner
- Database identifier leaks (4+ instances): /market intelligence_items.market_data, /market action_owner, "ingest" / "source monitoring system" leaks (WatchlistSidebar + RegionalIntelligence)
- Worker-language leaks (5+ instances): /market EmptyState (item_type), /regulations detail (ingestion worker populates penalty_range), /operations (regional_data + multiple), Affected Lanes worker-language /regulations detail (Tier 2 supplementary)
- Duplicate Technology category on /market: render-layer key collision between topic + fallback string
- Dashboard REPLACED rail test/seed data (ss1, ss2, ss3, ss5): fetch-layer omission of `title`; legacy_id leaked as display (root cause: missing `title` projection)
- Assistant static self-description omitted Research + Community surfaces (Tier 2 supplementary)

**Cross-references.**

- **OBS-20:** /market EmptyState worker-language; closed via Tier 2 (full sector-anchored copy remains Sprint 2 Build 7 follow-up).
- **OBS-42:** Dashboard REPLACED rail fix surfaces upstream data-quality follow-up.
- **caros-ledge-platform-intent SKILL.md** Section 11 (Anti-Patterns): phase-language leaking to customer-facing UI is an explicit anti-pattern; Tier 2 closed the leaks.

**Action.** None pre-merge; operator authorizes merge per Sprint 2 plan operator decision point D1.

---

## OBS-46: Onboarding sector destination fix (Implemented)

**Source:** Onboarding audit 2026-05-18; Onboarding fix dispatch
**Phase:** Onboarding fix (shipped)
**Priority:** Implemented
**Status:** IMPLEMENTED on `fix/onboarding-sector-destination` at commit c42db14 (pending merge to main per operator decision D1).

The OnboardingWizard wrote sector overrides to the wrong column (per-user composition layer was unwired). The fix corrects the persistence to `profiles.sector_overrides` and deletes the orphan SectorOnboarding.tsx. Other onboarding gaps remain DEFERRED per operator direction (email-delivered invitations, LinkedIn import, chrome polish on NoWorkspaceLanding, sector taxonomy expansion in wizard, invitation-accept includes wizard).

**Cross-references.**

- **caros-ledge-platform-intent SKILL.md** Section 4 (Onboarding flow): onboarding is cross-cutting; this fix preserves the sector_profile customization path for expansion-time users.

**Action.** None pre-merge; operator authorizes merge per Sprint 2 plan operator decision point D1.

---

## OBS-47: `recurring_spot_check_log` phantom finding (Cleared)

**Source:** Schema Reconciliation Stage 1 discovery 2026-05-18 (corrective source); earlier framing in critical-investigations-2026-05-18.md was incorrect
**Phase:** N/A
**Priority:** Cleared
**Status:** CLEARED 2026-05-18 doc cleanup pass.

The earlier critical investigation (`docs/sprint-1/critical-investigations-2026-05-18.md`) framed `recurring_spot_check_log` as a code-references-but-no-migration-source case requiring author migration or remove code references. Schema Reconciliation Stage 1 discovery confirmed the table is a phantom: no live table, no migration file anywhere, and a grep across `fsi-app/src` finds zero references. The audit-script's `expectedTables` array misframed it as a finding. No remediation required.

The corrective source is `docs/sprint-1/schema-reconciliation-discovery-2026-05-18.md` ("One alleged code-source drift is a phantom"). Future audits should not include `recurring_spot_check_log` in expected-tables enumeration.

**Cross-references.**

- **OBS-25:** Schema Reconciliation Stage 1/2 work; this Cleared annotation is the doc-loop closure for the phantom finding the original Critical #2 framing surfaced.

**Action.** None. Update any audit-script `expectedTables` array to remove `recurring_spot_check_log` if/when next touched.

---

## OBS-50: Build 6 admin-gating sweep methodology gap

**State:** Implemented (Track B-code commit 4c7b546 + Sweep-discipline rule in `fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md`)
**Captured:** 2026-05-19
**Cross-references:** OBS-17 (reopened with this dispatch), Sweep-discipline rule in `fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md`

### Finding

The Build 6 admin-gating sweep (commit 6d18773) closed OBS-17 prematurely. Sweep enumerated only routes the dispatcher recalled, not the full `/api/admin/**` route surface. 13 routes were missed.

A 2026-05-19 code-level positive-test audit (run after seeding `jasonlosh@hotmail.com` with `is_platform_admin=true`) found the 13 missed routes BUT also exhibited its own methodology errors: missed 4 additional ungated routes under `src/app/api/admin/sources/[id]/*` and miscalled 2 worker-secret routes (`recompute-trust`, `spot-check/recurring`) as `requireAuth`-only based on directory location rather than file content.

### Routes fixed (commit 4c7b546)

15 routes had `isPlatformAdmin(auth.userId, supabase)` check inserted after `requireAuth()`, matching the canonical pattern from `sources/bulk-import/route.ts:331`:

Originally on prior-audit list (11):

- `src/app/api/admin/b2-progress/route.ts`
- `src/app/api/admin/canonical-sources/bulk-classify/route.ts`
- `src/app/api/admin/canonical-sources/decide/route.ts`
- `src/app/api/admin/canonical-sources/pending/route.ts`
- `src/app/api/admin/canonical-sources/recommend-classification/route.ts`
- `src/app/api/admin/intersections/route.ts`
- `src/app/api/admin/scan/route.ts`
- `src/app/api/admin/sources/all/route.ts`
- `src/app/api/admin/sources/pause-global/route.ts` (both GET and POST handlers)
- `src/app/api/admin/sources/promote/route.ts`
- `src/app/api/admin/sources/recommend-classification/route.ts`

Newly discovered by Track B-code re-enumeration (4):

- `src/app/api/admin/sources/[id]/fetch-now/route.ts`
- `src/app/api/admin/sources/[id]/pause/route.ts`
- `src/app/api/admin/sources/[id]/regenerate-brief/route.ts`
- `src/app/api/admin/sources/[id]/visibility/route.ts`

Correctly EXCLUDED from fix scope (2 worker-secret routes):

- `src/app/api/admin/recompute-trust/route.ts`; gates via `x-worker-secret`; adding `isPlatformAdmin` would break GitHub Actions crons
- `src/app/api/admin/spot-check/recurring/route.ts`; same pattern

### Root cause

Both Build 6 sweep AND the 2026-05-19 audit relied on RECALLED or DIRECTORY-INFERRED scope rather than fully enumerating the surface via Glob and grep'ing each enumerated route.

### Durable fix

New binding rule added to `fsi-app/.claude/skills/sprint-followups-discipline/SKILL.md`: **Sweep-discipline rule: enumerate the full surface before claiming completeness**. Mandates that any sweep dispatch first enumerate the COMPLETE surface family (Glob, schema query, or equivalent) and verify each enumerated item against the audit criterion before claiming completeness. Worked example in the rule cites this specific Build 6 to 2026-05-19 audit to Track B-code re-enumeration sequence.

### Resolution

- Code fix: commit 4c7b546 (15 routes gated, typecheck clean)
- Methodology fix: Sweep-discipline rule in skill amendment (this dispatch's commit SHA, fill in after commit)
- Future sweeps now bound by the Sweep-discipline rule

---

## OBS-51: Sample-scale validation insufficient for batch-scale guarantees

**State**: Implemented (discipline note; future enforcement via dispatch brief patterns)
**Captured**: 2026-05-20
**Cross-references**: OBS-Q4 batch failure context (Q4 sample run was 20/20 clean; full batch failed at source 21+22 with two distinct error modes neither triggered at 20-source scale)

### Finding

The Q4 bias-classification batch script passed sample validation (20 sources, 0 failures) and was dispatched against the full 776-source batch. It failed at source 21 (Anthropic API timeout) and source 22 (pg connection terminated) — both error modes that don't reliably trigger at 20-source scale because:
- Anthropic API timeouts are intermittent network events; probability of hitting one in 20 calls is low
- Supabase pooler disconnects idle connections after a period; 20 fast calls don't expose this

### Discipline rule (going forward)

Any dispatch brief for a long-running batch script (>50 iterations, especially involving external API calls or persistent DB connections) MUST require the script to include from the start:
- Retry-with-backoff on external API errors (timeouts, network, 5xx)
- Reconnect-on-disconnect for persistent DB connections (or use connection pooling)
- Per-iteration error isolation (one source's failure does NOT crash the whole batch)
- Progress logging with idempotency-friendly state (so re-runs skip completed work)

Sample validation is necessary but NOT sufficient. The dispatch brief explicitly names the failure modes the sample WON'T reveal and demands them addressed.

### Resolution

Item 3 patch dispatch (feat/q4-batch-resilience) shipped:
- Anthropic-timeout retry with exponential backoff (1s/2s/4s, max 3 retries per source)
- pg reconnect-on-disconnect (or pg.Pool pattern) with max 3 reconnect attempts per operation
- Per-source error isolation: failures log and continue to next source

Discipline rule captured here as OBS-51 so future dispatch briefs for long-running batches reference it explicitly.
