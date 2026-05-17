# Sprint 1 Phase 3: Operator Decision (Authorization Packet)

**Date:** 2026-05-16
**Source:** operator decision delivered after reviewing `docs/sprint-1/phase-3-jurisdiction-vocabulary.md`
**Status:** Authorized to proceed to Phase 4, conditional on Phase 4 scope confirmation (see § "Phase 4 dependency" below)

This document archives the operator's verbatim authorization, captured for the sprint folder so future readers see the authoritative resolution alongside Phase 3's classification proposal.

## Architecture

Confirm Option A: extend migration 072 CASE table. Standalone jurisdictions table deferred per `multi-tenant-foundation-followups-2026-05-15.md` item 4 and the `reference-jurisdictions` skill spec from PR #118.

## 8 Decision Points, Resolved

1. **Platform extensions (US-NYC / US-LAX): KEEP.** Tier-1 freight gateways carry distinct municipal compliance (e.g., NYC LL97) and operational profiles that must remain isolated from state and federal tiers. Policy gate documented in `reference-jurisdictions` skill: platform city extensions only for tier-1 freight gateways with distinct regulatory authority.

2. **Continents (48 rows): REJECT.** Not regulatory bodies. Existing 48 items routed to reclassification queue. Going forward, ingest rejects continent strings.

3. **Region buckets, LATAM/MEAF/ASIA-PACIFIC (24 rows): REJECT.** Industry shorthand, not jurisdictions. Existing 24 items routed to reclassification queue.

4. **Org groups (OECD / ASEAN / DEVELOPING COUNTRIES, 12 rows): ACCEPT OECD and ASEAN as canonical, REJECT DEVELOPING COUNTRIES.** Consistent with the existing IMO canonical precedent for policy-issuing international bodies.

5. **RC-7 fragments (49 distinct, 50 rows): REJECT at ingest.** Route to new `ingest_rejections` table for manual triage.

6. **Long-tail cities (~50 rows): MAP to country parent, or state parent if applicable** (e.g., Biloxi → US-MS, not US). Preserves ISO 3166-2 granularity where it exists. City-level retention only via tier-1 freight gateway exception per decision 1.

7. **Backfill scope: BOTH columns.** Backfill `jurisdictions` and `jurisdiction_iso`. The 460 ISO-empty rows fill via the extended CASE.

8. **`sources.jurisdictions` normalization: OUT OF SCOPE for Sprint 1.** Stay strictly on `intelligence_items`. Add "normalize sources.jurisdictions, extend trigger" as its own dispatch on the followups doc.

## Additional Canonical Addition: ICAO

Add ICAO to the canonical free-text set alongside EU, GLOBAL, IMO, OECD, ASEAN. ICAO is the aviation analog to IMO (CORSIA, ICAO Annexes). Omitting it creates the same air vs ocean asymmetry this exercise is meant to eliminate.

**Action for the agent:** before finalizing the CASE table, count occurrences in `intelligence_items.jurisdictions` matching ICAO, CORSIA, or aviation-standards content currently tagged inconsistently. Add to CASE. Report count in the migration PR.

**Principle to document in `reference-jurisdictions` skill spec:** international bodies qualify as canonical when their outputs are operationally treated as compliance frameworks by freight forwarders. Current set: EU, IMO, OECD, ASEAN, ICAO. Future candidates requiring explicit operator decision: WCO, WTO, CITES, UNFCCC, IATA.

## `ingest_rejections` Table Spec

**Layer:** platform-level operational. Not org-scoped, not community-scoped.

**Schema sketch** (agent to finalize column types and indexes):

```sql
CREATE TABLE ingest_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_value text NOT NULL,
  rejection_reason text NOT NULL,
  source_url text,
  source_id uuid REFERENCES sources(id),
  ingest_attempted_at timestamptz NOT NULL DEFAULT now(),
  triaged_by uuid REFERENCES auth.users(id),
  triaged_at timestamptz,
  triage_action text,
  triage_notes text,
  CONSTRAINT valid_rejection_reason CHECK (
    rejection_reason IN ('below_granularity', 'non_geographic', 'institutional', 'unparseable')
  ),
  CONSTRAINT valid_triage_action CHECK (
    triage_action IS NULL OR triage_action IN ('discarded', 'reclassified', 'escalated')
  )
);
```

**RLS policies** (ship in same migration):

- Default: deny all.
- Read: platform_admin role only.
- Write (insert): service_role only, no client-side writes.
- Update (triage fields): platform_admin role only.
- Delete: forbidden, audit integrity.

**Role gate (CORRECTED 2026-05-16):** apply RLS policies referencing `profiles.is_platform_admin`, consistent with Phase 1 Option C single-signal model. Do NOT create a Postgres role. The original packet's wording "Create platform_admin Postgres role if not present" was loose shorthand for "establish an admin-only access gate, do not lean on service_role" and was corrected during Phase 4 prework (Q2). RLS policy shape:

```sql
EXISTS (
  SELECT 1 FROM profiles
  WHERE id = auth.uid()
    AND is_platform_admin = true
)
```

Introducing a Postgres role would re-open the two-signal problem that Phase 1 resolved. Auth binding requires no new work: `auth.uid()` + `profiles.is_platform_admin` is already wired against the existing Supabase auth surface. No JWT hook, no session GUC, no new auth code.

**Retention:** indefinite for Sprint 1. Add 90-day archive policy as a follow-up if table volume exceeds 5,000 rows.

## Reclassification Queue for the 84 Existing Items (decisions 2, 3, 4)

Separate table from `ingest_rejections`. These are existing `intelligence_items` rows needing field correction, not raw ingest rejections.

**Recommended:**

```sql
CREATE TABLE pending_jurisdiction_review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intelligence_item_id uuid NOT NULL REFERENCES intelligence_items(id) ON DELETE CASCADE,
  current_value text NOT NULL,
  flagged_reason text NOT NULL,
  flagged_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  resolution_value text,
  CONSTRAINT valid_flagged_reason CHECK (
    flagged_reason IN ('continent', 'region_bucket', 'undefined_group')
  )
);
```

Same RLS posture as `ingest_rejections`. Backfill migration populates this table with the 84 items, sets their `jurisdictions` field to a transitional NULL or `__PENDING_REVIEW__` sentinel until operator triages.

## Migration Contents (Phase 3-derived; Phase 4 ships)

1. Extended CASE table covering ~210 canonical mappings including OECD, ASEAN, ICAO additions.
2. Backfill of `jurisdictions` and `jurisdiction_iso` on `intelligence_items` (the 460 ISO-empty rows plus the variant collapses).
3. `ingest_rejections` table with RLS policies.
4. `pending_jurisdiction_review` table with RLS policies.
5. RLS policies on the two new tables referencing `profiles.is_platform_admin` (see Q2 correction above). No Postgres role created.
6. Populate `pending_jurisdiction_review` with the 84 flagged items.
7. Ingest pipeline guard: reject RC-7 fragments at the trigger, write to `ingest_rejections`.

No migration content for `sources.jurisdictions`. Deferred.

## Phase 4 Dependency

**Settled:**

- Two operator-facing tables exist after migration: `ingest_rejections` (RC-7 triage) and `pending_jurisdiction_review` (84-item reclassification).
- The migration can ship without UI. Tables exist, data is staged, backfill is partial (the 84 items remain in `__PENDING_REVIEW__` state until operator triages via UI).
- Backfill is not blocked by UI absence. The migration completes. The 84 items just sit in the queue.

**Open, needs Phase 4 scope confirmation:**

- Does Phase 4 include an admin queue UI covering both `ingest_rejections` and `pending_jurisdiction_review`? Recommended as a single unified admin queue with two tabs or a filtered list view, not two separate UIs.
- Does Phase 4 include the `platform_admin` role binding to the existing auth surface (how does the operator log in as platform_admin, is it a Supabase role claim, a custom JWT claim, or a separate admin auth surface)?
- Acceptance criterion for Phase 3 completion: the 84 items can be triaged to canonical values within Phase 4. If Phase 4 does not deliver UI, the 84 items are stranded in `__PENDING_REVIEW__` and the audit's count discrepancy is only partially resolved.

**Authorization:** proceed with migration. If Phase 4 scope does not currently include the admin queue UI and `platform_admin` auth binding, surface that gap before starting Phase 4 build so scope can be amended. Migration ship is not blocked. Audit closure is.

## Summary for Sprint Branch Commit Message

```
sprint-1/phase-3: jurisdiction vocabulary normalization

- Extend migration 072 CASE: ~210 canonical mappings
- Add OECD, ASEAN, ICAO to canonical free-text set
- Backfill jurisdictions and jurisdiction_iso (460 rows)
- Add ingest_rejections table (RC-7 triage, 49 fragments)
- Add pending_jurisdiction_review table (84 items: continents,
  region buckets, undefined org groups)
- Add RLS policies on operator tables referencing profiles.is_platform_admin (Q2 corrected)
- Ingest pipeline: reject RC-7 at trigger, write to ingest_rejections

Refs: docs/sprint-1/phase-3-jurisdiction-vocabulary.md
Followups: multi-tenant-foundation-followups-2026-05-15.md (items
4 standalone jurisdictions table; new item: sources.jurisdictions
normalization)

Phase 4 dependency: admin queue UI + platform_admin auth binding
required to triage 84 pending_jurisdiction_review rows and close
audit count discrepancy.
```
