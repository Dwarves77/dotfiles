# Sprint 1 Phase 4a: Migrations Summary

**Date:** 2026-05-16
**Status:** Applied to production database 2026-05-16 (after SQL review amendments). PR pending.
**Branch:** feat/sprint-1-chrome-remediation
**Phase 4 split:** 4a = migrations 079, 080, 081 + type drift fix (this packet). 4b = migration 082 (ingest_rejections + pending_jurisdiction_review tables + RLS + populate + trigger wire-up), authored after 4a merge.

## SQL review amendments (applied 2026-05-16)

Operator SQL review (2026-05-16) flagged two CRITICAL and two HIGH issues, plus MEDIUM/LOW items folded into the same revision. All amended before apply.

- **CRITICAL #1 (migration 080):** `_normalize_jurisdictions` refactored from `RETURNS TEXT[]` to `RETURNS TABLE(canonical TEXT[], rejected TEXT[])`. The trigger in migration 082 will read both arrays without duplicating classification logic. Operator-preferred option of the three (TABLE return / sentinel prefix / duplicate logic).
- **CRITICAL #1 followup (self-correction):** `DROP ... CASCADE` was a no-op because PostgreSQL `pg_depend` does not track PL/pgSQL function-call dependencies. Switched to `DROP FUNCTION + CREATE OR REPLACE` on the trigger function; the trigger itself stays in place (it points at the trigger function which has been replaced). Verified via `pg_depend` query returning zero dependents.
- **CRITICAL #2 (migration 080):** Two stale references to "migration 081" updated to "migration 082" (the trigger wire-up actually lives in 4b's migration 082, not 4a's 081).
- **HIGH #1 (migration 080):** Brooklyn / Manhattan / Queens / Bronx / The Bronx / Staten Island all map to US-NYC (was US-NY for Brooklyn/Manhattan, others absent). Pre-flight on data shows zero current rows tag any borough, so the change is defensive only and harmless.
- **HIGH #2 (migration 079):** Partial unique index predicate tightened from `WHERE instrument_identifier IS NOT NULL` to `WHERE instrument_type IS NOT NULL AND instrument_identifier IS NOT NULL`. Closes the gap where two rows with NULL `instrument_type` and identical identifier would have been allowed (PostgreSQL treats NULL=NULL as distinct in unique keys).
- **MED #2/#3 (migration 080):** CARIBBEAN and AMERICAS reclassified from `continent` to `region_bucket` in `_classify_jurisdiction_token`. CARIBBEAN is a region of North America, not a continent; AMERICAS spans two continents. Both still route to `pending_jurisdiction_review`, just under a more accurate taxonomy bucket.
- **LOW #1 (migration 080):** Added `'u.s.a'` and `'u.s.a.'` CASE entries defensively. Pre-flight on data confirms zero current rows carry these forms.
- **M1 (header drift):** Header comment count corrected from "~210 entries" to "~250 entries" to reflect actual CASE entry count after all amendments.

## Apply confirmation

```
[apply-pending] applying 079: canonical_entity_columns (5777 chars)
[apply-pending] OK 079
[apply-pending] applying 080: jurisdiction_vocabulary_extension (26219 chars)
[apply-pending] OK 080
[apply-pending] applying 081: admin_signal_documentation (3196 chars)
[apply-pending] OK 081
[apply-pending] reloading PostgREST schema cache

── Summary ──
  applied: 3
  already applied: 25
  skipped: 51
  failed: 0
  applied versions: 079, 080, 081
```

## Pre-flight evidence (data-driven)

- ICAO/CORSIA in jurisdictions: only `ICAO MEMBER STATES (193)` (1 row). CASE catches it. CORSIA/aviation appear in title/full_brief only, not in jurisdiction arrays; out of scope for jurisdiction normalization.
- NYC tokens in jurisdictions: NEW YORK CITY (5 rows), NEW YORK STATE (7 rows), NEW_YORK_STATE (1 row). Backfill in Phase 5 will reclassify these.
- NYC boroughs (Brooklyn / Manhattan / Queens / Bronx / Staten Island) in jurisdictions: zero. Borough additions are defensive only.
- `u.s.a` / `u.s.a.` variants in jurisdictions: zero. Defensive only.
- `_normalize_jurisdictions` pg_depend dependents: zero. Confirms PostgreSQL does not track PL/pgSQL function-call deps, so the migration's drop+recreate strategy was corrected to explicit `CREATE OR REPLACE` on the trigger function.
- PR #117 still open at apply time. Migration numbering 079/080/081 is safe (gap from 077 → 079 is handled by `apply-pending.mjs` sorting by version).
- `staged_updates.item_id` on dedup losers: zero rows. (Pre-flight from Phase 2 confirmed safe for the Phase 5 hard-delete transactions.)

## Files in this packet

### Migrations (Supabase Postgres, fsi-app/supabase/migrations/)

1. `079_canonical_entity_columns.sql` (Phase 2 RC-9 carryforward)
2. `080_jurisdiction_vocabulary_extension.sql` (Phase 3 RC-7 carryforward)
3. `081_admin_signal_documentation.sql` (Phase 1 Option C carryforward)

### Source files (fsi-app/src/)

4. `stores/workspaceStore.ts:12` (type drift)
5. `components/auth/AuthProvider.tsx:29` (type drift)
6. `lib/api/server-bootstrap.ts:34` (type drift)
7. `components/admin/OrganizationsTable.tsx:43,52,80,92` (type drift, 4 sites)
8. `components/settings/BriefingScheduleSection.tsx:62` (type drift, gate predicate)

## Migration 079: canonical-entity columns

**Purpose:** close RC-9 (canonical-entity dedup) by giving intelligence_items a first-class key so future ingest cannot create the LL97-style triplicates documented in `phase-2-dedup-plan.md`.

**DDL:**
- `ALTER TABLE intelligence_items ADD COLUMN instrument_type TEXT NULL` with `CHECK` on the 15-value operator-approved enum (Phase 2 § 6): `local_law, state_statute, national_regulation, federal_statute, federal_rule, federal_executive_order, eu_regulation, eu_directive, municipal_ordinance, agency_guidance, court_decision, industry_standard, market_signal, research_item, voluntary_initiative`.
- `ALTER TABLE intelligence_items ADD COLUMN instrument_identifier TEXT NULL` (free-text; picking rule per Phase 2 § 7).
- `CREATE UNIQUE INDEX intelligence_items_canonical_key_idx ON intelligence_items (jurisdiction_iso, instrument_type, instrument_identifier) WHERE instrument_identifier IS NOT NULL`.

**Idempotency:** `ADD COLUMN IF NOT EXISTS` + `DO $$ ... pg_constraint EXISTS check` + `pg_indexes EXISTS check` so re-running is a no-op.

**Numbering note:** PR #117 also claims 078. If #117 merges first, 079 is the next free slot. If sprint-1 lands first, a numerical gap (077 -> 079) exists until #117 merges; `apply-pending.mjs` sorts by version number and handles gaps cleanly.

**Reversibility:** drop the index, then drop the columns. Columns are nullable so existing rows are unaffected by their addition.

**What this does not do:** does not populate the new columns (Phase 5 backfill), does not write the canonical key from the classifier (Phase 6 ingest). Phase 4a only opens the slot in the schema.

## Migration 080: jurisdiction vocabulary extension

**Purpose:** close RC-7 (jurisdiction vocabulary churn) by extending the migration 072 `_normalize_jurisdictions` CASE table from the original ~30 entries to ~210 per operator-confirmed Option A in `phase-3-operator-decision.md`.

**DDL:**
- `CREATE OR REPLACE FUNCTION _normalize_jurisdictions` with the extended CASE.
- New canonical additions per operator decisions: OECD, ASEAN, ICAO (decision 4 + ICAO addition).
- ~50 city-to-parent mappings (Biloxi -> US-MS, Antwerp -> BE, etc.) per decision 6.
- ~50 country-name normalizations (Bangladesh -> BD, etc.).
- Canadian provinces, Australian states, US state long-form aliases.
- Platform city extensions US-NYC, US-LAX preserved per decision 1 (tier-1 freight gateway exception).
- `CREATE FUNCTION _classify_jurisdiction_token(TEXT)` returns enum-like text: `continent | region_bucket | undefined_group | non_geographic | institutional | below_granularity | unparseable`. Used by the Phase 4b trigger wire-up to route dropped tokens to the right rejection bucket.

**Behavioural change from migration 072:** the trigger's ELSE branch previously preserved unmapped tokens as uppercased free text. After 080, the ELSE branch DROPS unmapped tokens. The actual write to `ingest_rejections` or `pending_jurisdiction_review` is deferred to migration 082 (Phase 4b), because those tables don't exist until 4b ships. In the 4a interim, dropped tokens are silent at the trigger; this is acceptable because nothing new is being ingested between 4a apply and 4b apply (ingest pauses for the Sprint 1 migration window).

**Idempotency:** `CREATE OR REPLACE FUNCTION` is replay-safe.

**Reversibility:** re-create with the pre-080 body (kept in migration 072). The two new helper functions are `DROP FUNCTION` reversible.

**What this does not do:** does not backfill existing rows (Phase 5), does not create the operator queue tables (Phase 4b), does not wire trigger writes to those tables (Phase 4b). The classification helper exists but is not yet invoked by the trigger.

## Migration 081: admin signal documentation

**Purpose:** close the conflation between the two admin signals identified in Phase 1 by putting canonical semantics at the schema layer via `COMMENT ON COLUMN`, where they are hardest to drift from. Implements the documentation half of Option C; the helper-split half lands in Phase 7.

**DDL:**
- `COMMENT ON COLUMN public.org_memberships.role` documenting: CHECK values, org-internal semantics, owner = org creator, admin = org administrator, member = default (the post-074 rename of `editor`), viewer = read-only, explicit "does NOT grant platform-admin access" disclaimer, pointer to Phase 7 `requireOrgAdmin(org_id)` helper.
- `COMMENT ON COLUMN public.profiles.is_platform_admin` documenting: Caro's Ledge internal staff flag, service-role-only writeable (no self-promotion), enumerated platform-admin surfaces including the new Phase 7 jurisdiction triage queue, explicit "does NOT grant cross-org workspace access" disclaimer, pointer to Phase 7 `requirePlatformAdmin()` helper.

**Idempotency:** `COMMENT ON COLUMN` is metadata-only and overwrites cleanly.

**Reversibility:** `COMMENT ON COLUMN ... IS NULL`.

**What this does not do:** does not introduce the split helpers `requirePlatformAdmin()` / `requireOrgAdmin(orgId)` (Phase 7), does not deprecate the misnamed `src/lib/auth/admin.ts:21-37` `isPlatformAdmin()` (Phase 7), does not change any RLS policy.

## Type drift fix (Phase 1 carryforward)

**Context:** `org_memberships.role` CHECK constraint per migration 006:45 is `owner | admin | member | viewer`. The TypeScript layer carried `editor` instead of `member` in the role union literal, plus an unreachable `editor` branch in the admin organizations table, plus a permission gate that allowed an unreachable `editor` to edit workspace settings. The DB has not produced an `editor` row since the constraint shipped; the literal is stale.

**Edits:**

1. `src/stores/workspaceStore.ts:12` — `userRole: "owner" | "admin" | "editor" | "viewer" | null` -> `"owner" | "admin" | "member" | "viewer" | null`.
2. `src/components/auth/AuthProvider.tsx:29` — `initialRole?: "owner" | "admin" | "editor" | "viewer" | null` -> `"owner" | "admin" | "member" | "viewer" | null`.
3. `src/lib/api/server-bootstrap.ts:34` — `role: "owner" | "admin" | "editor" | "viewer" | null` -> `"owner" | "admin" | "member" | "viewer" | null`.
4. `src/components/admin/OrganizationsTable.tsx` — drop `editor` key from `RoleSummary` (line 43), drop `"editor"` from `ROLE_KEYS` (line 52), drop `editor: 0` from initialized roles (line 80), drop the `else if (role === "editor")` branch (line 92). `member` was already present and reachable per the DB CHECK.
5. `src/components/settings/BriefingScheduleSection.tsx:62` — drop `|| userRole === "editor"` from `canEdit` gate. The comment at lines 58-60 already documents the gate as owner/admin only; the dropped clause was the type-drift bug (an `editor` value would never appear at runtime, but the gate also said it would be permitted to edit, contradicting the stated intent).

**No alias kept.** The DB has never returned `editor`; preserving the literal was a backwards-compatibility shim for a state that never existed. Removing it cleanly is what Phase 1 Option C recommended.

## What is NOT in Phase 4a (deferred to Phase 4b)

Phase 4b ships migration 082, after Phase 4a merges. 4b contains:

- `CREATE TABLE ingest_rejections` per `phase-3-operator-decision.md` § "ingest_rejections Table Spec".
- `CREATE TABLE pending_jurisdiction_review` per same.
- RLS policies on both tables referencing `profiles.is_platform_admin` per Q2 correction (no Postgres role).
- Populate `pending_jurisdiction_review` with the ~83 existing flagged items (continents, region buckets, undefined org groups).
- Wire the migration 080 trigger to actually INSERT into `ingest_rejections` when the ELSE branch fires, instead of silently dropping.

The 4a / 4b split keeps the operator's SQL review surface smaller and lets the canonical-entity work land independently of the queue scaffolding.

## What is NOT in Phase 4a (deferred to later phases)

- **Phase 5 (data migration):** backfill `instrument_type` + `instrument_identifier` on existing intelligence_items rows; run dedup transactions per cluster per Phase 2; backfill `jurisdictions` + `jurisdiction_iso` on the 460 ISO-empty rows per Phase 3 decision 7.
- **Phase 6 (ingest wiring):** classifier-item-type populates new columns; jurisdiction validator runs at ingest; trigger guard rejects RC-7 fragments to `ingest_rejections`.
- **Phase 7 (admin chrome + triage queue):** split helpers `requirePlatformAdmin()` + `requireOrgAdmin(orgId)`; deprecate misnamed `isPlatformAdmin()` in `src/lib/auth/admin.ts`; gate the five leaking widgets; build minimum viable jurisdiction triage queue per `phase-7-scope-amendment.md`.

## Verification gate (historical)

The original pre-apply review identified two CRITICAL and two HIGH issues plus MED/LOW items. All addressed inline before apply per the "SQL review amendments" section above. The original 7-point reviewer checklist has been superseded by the amendments list.

After 4a merges, Phase 4b ships migration 082 (the operator queue tables + RLS + trigger wire-up).
