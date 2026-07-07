# Multi-Tenant Foundation Follow-Ups, 2026-05-15

Companion to:
- `multi-tenant-foundation-prework-2026-05-15.md` (decisions made before code)
- PRs #114, #115, #116 (the three workstreams as merged + deployed 2026-05-15 21:05 UTC)
- `caros-ledge-supabase-schema-audit-2026-05-15.md` (Corrections section)
- `caros-ledge-product-audit-2026-05-15.md` (v2)

This doc tracks work the multi-tenant dispatch deferred or surfaced for later.

---

## 1. Phase 3 of the profiles consolidation (CRITICAL)

**Trigger:** PR #114's Phase 1+2 (migration 075) has been stable in production for at least one deploy cycle (typically 24-48 hours of normal traffic without errors in profiles dual-write triggers).

**Scope of the Phase 3 PR:**

1. **Drop the dual-write triggers** added in migration 075:
   - `_mirror_user_profiles_to_profiles` (the trigger that copies user_profiles writes to profiles)
   - `_mirror_profiles_to_user_profiles` (the inverse, for any code still writing to profiles)

2. **Drop the `user_profiles` table.** All readers should be on `profiles` after Phase 1+2. Verify with `Grep` for `from\s*\(?["']user_profiles` in `fsi-app/src` before dropping.

3. **Onboarding data redistribution (CARRY THIS REQUIREMENT, DO NOT LOSE).**
   The OnboardingWizard previously had phantom writes for `pronouns`, `role`, `employer`, `region`, `work_email` that wrote to non-existent columns on `user_profiles` (the data went nowhere). Migration A correctly dropped the dead writes. The underlying requirement is real and now homeless: onboarding legitimately needs to capture that data. Under the three-layer architecture established in the multi-tenant foundation, the data distributes:

   | Field | Destination table | Column | Rationale |
   |---|---|---|---|
   | `pronouns` | `profiles` | new column or extend profile JSONB | Person identity. Belongs with the auth-bound user record. |
   | `role` | `org_memberships` | new column `title` or `job_title` | Role within THIS org. A person can have different roles in different orgs (e.g., founder at one workspace, advisor at another). Distinct from `org_memberships.role` which is the platform RBAC enum (owner/admin/member/viewer). |
   | `employer` | `organizations` | the org IS the employer | This is not a user-level field. The org row IS the employer. The onboarding wizard either creates/joins an existing org or onboards into an existing one; the employer identity comes from the org name. |
   | `region` | depends on intent | `profiles.region` (person locale) OR `workspace_settings.operational_jurisdictions[]` (workspace freight context) | Disambiguate at the form level: "where are you located" → profiles; "where does the workspace operate" → workspace_settings. |
   | `work_email` | `profiles` | new column `work_email` distinct from auth email | Used for invitation matching and for showing in workspace member directory. Stored on the person's profile, separate from their Supabase auth email (which may be personal). |

   The Phase 3 PR adds the columns and switches the OnboardingWizard form fields to write to the correct destinations. Otherwise the onboarding form keeps collecting data that goes nowhere (a UX bug hiding behind a fixed schema bug).

**Branch convention:** `feat/multi-tenant-A-phase3-drop-user_profiles`.

**Acceptance test for Phase 3:**
- `user_profiles` table no longer exists
- Triggers dropped
- OnboardingWizard write path verified end-to-end against the new destinations
- No code references to `user_profiles` remain (grep clean)
- A new user completing onboarding successfully populates: `profiles` row (pronouns, work_email), `organizations` row (employer), `org_memberships` row with title (role), and either `profiles.region` or `workspace_settings.operational_jurisdictions[]` per form intent

---

## 2. Deferred dispatch: source registry hygiene + audit cleanup

**Bundles:** migrations 048 (`integrity_flags_platform`) and 050 (`integrity_flags_workflow_gap`) were never applied to the live DB. They sit on disk but have no row in `schema_migrations`. The `apply-pending.mjs` MIN_VERSION=052 floor sidesteps them.

**Reason for deferral:** they're operator-data-quality infrastructure (the `integrity_flags` table that admin notifications and the integrity flag trigger system reference). Per dispatch decision E, they belong in a source-registry-hygiene + audit-cleanup dispatch, not their own dispatch and not in the multi-tenant work.

**Status when bundling:** they've been broken for weeks without cascade. Not urgent-blocking. Bundle into the next read of the schema audit's Section 6 recommendations (likely the source-registry hygiene dispatch).

**Cost note (per [[rule-cost-weighted-recommendations]]):** one-time agent work to investigate + apply, ~low. No ongoing runtime cost. No infrastructure cost. Value frame: polish; revenue-blocking only if a future feature depends on `integrity_flags`.

---

## 3. Deferred dispatch: invitation polish (Resend + expiry + reminders)

**Current state:** invitation creation logs the URL to console, returns it in the API response, and the admin chrome renders a copy button. Real email delivery is intentionally stubbed.

**What an invitation polish dispatch covers:**
- Resend integration (~$20/mo, low cost, revenue-accelerating but not revenue-blocking per the cost-weighted frame)
- Expiry handling (invitations should expire after 14 days)
- Reminder emails (7 days before expiry)
- Bounce handling (mark invitations as undeliverable when the address bounces)
- Resend-from-admin flow (admin can re-trigger an invitation send if the user reports not receiving it)

**Reason for deferral:** at current tenant count (zero to few), manual URL relay via the admin chrome copy button works. Resend at $20/mo is the canonical example of "polish that fits inside the per-workspace cost envelope but doesn't block revenue today." Bundle when:
- Tenant count exceeds ~3, OR
- A specific tenant requests it, OR
- A user reports having missed an invitation due to the manual relay step

---

## 4. Deferred follow-up: jurisdictions entity layer (data ingest)

**Per v2 audit Section 6.1.** The current `intelligence_items.jurisdictions` text[] and `jurisdiction_iso[]` columns hold ad-hoc canonical IDs. The skill `reference-jurisdictions` describes the entity model; the data (~5,000-10,000 canonical jurisdiction entries with hierarchy, aliases, and ISO codes) lives in a database table that does not yet exist.

**Scope of the dispatch:**
- Create `jurisdictions` entity table with the schema described in `reference-jurisdictions`
- Ingest from ISO 3166-1 alpha-2 (countries), ISO 3166-2 (subnationals), UN M49 (regional groupings), MarineRegions.org (maritime zones)
- Hand-curate treaty blocs (EU, EEA, Schengen, USMCA, Mercosur, ASEAN, GCC, etc.), free trade zones, indigenous nations
- Update the migration 072 jurisdiction normalizer to use the new table for alias resolution
- Backfill `intelligence_items.jurisdictions` and `jurisdiction_iso[]` to use canonical IDs from the new table

**Cost note:** medium one-time (the ingest is the bulk of the work; ~$50-200 in Claude API for hand-curation passes). Low ongoing (jurisdictions don't change often). No infrastructure cost beyond the table itself.

**Trigger:** any feature work that touches per-jurisdiction filtering, scoping, or ranking will be easier with the entity table than without. Not a Phase 0 blocker; bundle when the next jurisdiction-aware feature lands.

---

## 5. Open items the multi-tenant work explicitly did NOT cover

For the record, so future dispatches can scope around them:

- **Per-frame surface routes (v2 audit Section 6.9).** The four pages currently render from the same canonical fetch; per-surface framing as a derived view is unbuilt. The data plumbing is now in place after PRs #114-116; the rendering layer work is the next step.
- **Sector relevance scoring math (v2 audit Section 6.8 ranking).** The data fields exist (`workspace_settings.sector_profile`, `intelligence_items.verticals[]`, `intelligence_items.transport_modes[]`); the scoring formula and the rendering of relevance scores is unbuilt.
- **Versioning and changelog (v2 audit Section 6.6).** Three storage shapes today, one canonical version table prescribed. Not touched.
- **Knowledge graph layer (v2 audit Section 6.4).** Five overlapping link mechanisms today, one canonical `item_relationships` table prescribed. Not touched.
- **Structured fact extraction (v2 audit Section 6.5).** Phantom columns on `intelligence_items` (penalty_range, cost_mechanism, enforcement_body, etc.) are referenced by code but don't exist. Adding them is its own dispatch with its own cost ($900-1200 one-time per the cost-discipline reference).

---

## Audit cross-reference

- `caros-ledge-product-audit-2026-05-15.md` (v2)
- `caros-ledge-supabase-schema-audit-2026-05-15.md` (with Corrections section added 2026-05-15)
- `multi-tenant-foundation-prework-2026-05-15.md` (decision rationale)

## Related

- [[caros-ledge-supabase-schema-audit-2026-05-15]] — Cited companion whose Corrections section and Section 6 recommendations drive the deferred integrity_flags and jurisdictions dispatches here
- [[worktrees]] — The three multi-tenant workstreams ran in the mt-A/B/C worktrees that landed as PRs #114/115/116 — the worktrees inventory records their disposition
- [[multi-tenant-foundation-prework-2026-05-15]] — Explicitly named companion — the prework doc holds the decisions made before code that this followups doc continues
- [[migrations]] — Migrations 075/076/077 (multi-tenant) plus the unapplied 048/050 flagged in the followups doc are the same migration set
- [[caros-ledge-product-audit-2026-05-15]] — The v2 product audit is referenced throughout (Sections 6.1/6.4/6.5/6.8/6.9) as the source of the deferred/uncovered items
