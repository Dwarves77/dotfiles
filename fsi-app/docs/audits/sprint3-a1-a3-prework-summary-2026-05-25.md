# Sprint 3 Group A Phase 1 Prework Summary

**Date:** 2026-05-25
**Investigations:** A1 (classifier-quality), A2 (agent prompt extension), A3 (profiles projection completion)
**Status:** AWAITING OPERATOR GREEN-LIGHT BEFORE ANY WRITE.

All three investigations completed read-only. No DB writes. No code changes applied yet. Surfaces below for operator review per the dispatch brief Section 8 instruction: "Surface for green-light BEFORE any write."

---

## A1 — Classifier-quality batch cost estimate

**Per dispatch brief expectation:** 468 rows targeted, ~$1.17 estimated, cost ceiling $5.

**Actual counts (read-only query):**

| Bucket | Expected | Actual | Delta |
|---|---|---|---|
| `category IS NULL` (ambiguous, Phase 3D deferral) | 409 | **409** | 0 |
| `domain=1 AND category='research'` | 24 | **28** | +4 |
| Non-canonical category (NOT NULL AND NOT IN TOPICS) | 32 | **32** | 0 |
| Specific surfaced misclassifications (Green Corridors, UNDP, EcoVadis x5) | 3 | **7** | +4 |
| **Total rows for Haiku batch** | 468 | **469** | +1 |

**Non-canonical category histogram** (all 32 rows):
- Output file: `docs/audits/sprint3-a1-prework-2026-05-25.json`
- Surfaced for inspection if needed; not pasting full list here for length.

**Specific misclassification hits** (7 rows):
- 1 Green Corridors initiative
- 1 UNDP Environmental Finance
- 5 EcoVadis (matches "5x EcoVadis inconsistency" in dispatch brief)
- The dispatch brief's "3 specific" count was the count of DISTINCT entities; the actual row count is 7 because EcoVadis has 5 instances. Total still aligns.

**Cost estimate:**
- Per-call rate: $0.0025 (Step 2 v3 calibration)
- Total rows: 469
- **Estimated total: $1.17**
- Ceiling per dispatch brief: $5.00
- Headroom: $3.83 (well under)

**Note on dispatch brief delta** (+4 on d=1 research, +4 specific hits): the +4 d=1 'research' rows likely emerged between the brief authoring and this investigation as new ingestion landed. The +4 specific hits reflects EcoVadis counting as 5 instances (5 vs 1 in the brief's distinct-entity count). Neither delta moves cost meaningfully ($1.17 vs $1.17 effectively).

**Authorization request:** approve Haiku batch invocation at $1.17 estimated cost?

---

## A2 — Agent prompt extension diff

Full diff document: `docs/audits/sprint3-a2-prework-2026-05-25.md`

**Summary of proposed changes:**

1. **`src/lib/agent/system-prompt.ts`** — 5 edits:
   - Update "13 fields" → "15 fields" (line 234)
   - Add `signal_band` + `theme` field descriptions (after topic_tags)
   - Add `signal_band` vocabulary (3 values: price | corporate | corridor) + `theme` vocabulary (mirrors topic_tags 7 values)
   - Update YAML example block to include new fields
   - Bump `regeneration_skill_version` from "2026-04-29" to "2026-05-25"

2. **`src/lib/agent/parse-output.ts`** — 5 edits:
   - Add `SIGNAL_BAND_VALUES` + `THEME_VALUES` constants
   - Add fields to `AgentMetadata` interface
   - Add to required-fields list
   - Add validation block (null OR enum value, AND only when format_type allows)
   - Add to return metadata object

3. **`src/app/api/worker/drain-first-fetch/route.ts`** — 1 edit:
   - Extend `seedRow` to write `signal_band` + `theme` from `enrichment` (line 304-314)

4. **MarketPage.tsx + ResearchView.tsx** — 2 edits each:
   - `deriveBand` reads `r.signal_band` column-first, regex fallback for NULL
   - `deriveTheme` reads `item.theme` column-first, regex fallback for NULL
   - Resource / ResearchPipelineItem types extended with new fields

**Verdict needed from operator:** Should Haiku first-fetch enrichment ALSO emit `signal_band` + `theme`? My recommendation: NO. The full Sonnet regeneration is the canonical write path; Haiku first-fetch leaves them NULL initially; columns populate on first Sonnet regeneration. Reduces Haiku enrichment scope.

**Commit plan:** Two atomic commits.
- Commit 1: system-prompt.ts + parse-output.ts + drain-first-fetch route (the agent contract change).
- Commit 2: MarketPage.tsx + ResearchView.tsx (the column-first refactor).

**Authorization request:** approve diff + commit plan?

---

## A3 — Profiles projection completion

**Per dispatch brief expectation:** Verify migration 105 columns populated; backfill via `org_memberships + workspace_settings` join if gaps.

**Actual state (read-only query):**

| Column | Total profiles | NULL/empty count |
|---|---|---|
| `org_id` | 1 | **1** |
| `workspace_role` | 1 | **1** |
| `sector` (array) | 1 | **1 empty** |
| `region` (array) | 1 | **1 empty** |

All 4 projection columns are unpopulated on the only profile in dev. Migration 105 ran the ALTER TABLE but did not backfill data.

**org_memberships state:**
- 1 membership row: user `2b7d21eb-…` is `owner` of `Dietl / Rockit` org
- Multi-org users: 0
- Single-org users: 1
- No-org users: 0

**workspace_settings for that org:**
- `sector_profile`: `["fine-art", "live-events", "luxury-goods", "film-tv", "automotive", "humanitarian"]` (6 sectors)
- `jurisdiction_weights`: 30 keys with various weights 0.3-1.0

### Proposed backfill SQL

```sql
-- A3 backfill — Sprint 3 prework.
-- Idempotent: WHERE clauses guard against re-running.
-- Service-role required. RLS bypassed via service-role auth.

BEGIN;

-- 1. profiles.org_id ← oldest org_membership.org_id per user
--    Rationale: per dispatch brief Section 8, org_memberships is the
--    source of truth; profiles.org_id is the "active org" pointer.
--    Oldest membership is the deterministic default; user can switch
--    via the C1 multi-org-switcher dispatch when that ships.
UPDATE profiles p
SET org_id = sub.org_id
FROM (
  SELECT DISTINCT ON (user_id)
    user_id, org_id
  FROM org_memberships
  ORDER BY user_id, created_at ASC
) AS sub
WHERE p.id = sub.user_id
  AND p.org_id IS NULL;

-- 2. profiles.workspace_role ← role from the SAME membership row
--    chosen for org_id above. Keeps role aligned with active org.
UPDATE profiles p
SET workspace_role = sub.role
FROM (
  SELECT DISTINCT ON (m.user_id)
    m.user_id, m.role
  FROM org_memberships m
  ORDER BY m.user_id, m.created_at ASC
) AS sub
WHERE p.id = sub.user_id
  AND p.workspace_role IS NULL;

-- 3. profiles.sector ← workspace_settings.sector_profile for the
--    user's active org. Multi-sector workspaces project the full set.
UPDATE profiles p
SET sector = ws.sector_profile
FROM workspace_settings ws
WHERE p.org_id = ws.org_id
  AND (p.sector IS NULL OR array_length(p.sector, 1) IS NULL OR array_length(p.sector, 1) = 0);

-- 4. profiles.region — DEFERRED, see "Region backfill ambiguity" below.
--    Leaving empty array for now; surfaced for operator decision.

COMMIT;
```

### Region backfill ambiguity (operator decision required)

`profiles.region` is `TEXT[]` per migration 105 with the comment: "Multi-region workspaces. text[] because operators serve multiple regions (e.g. NYC + LA + London)."

Three possible backfill sources for region, each with different semantics:

**Option A.** Derive from `workspace_settings.jurisdiction_weights` keys with weight ≥ 0.7 — the "primary regions" interpretation. For Dietl / Rockit that yields: `["eu", "us", "uk", "china", "imo", "icao", "global", "asia", "india", "japan", "korea", "canada", "australia", "singapore"]` — 14 entries. Likely too many.

**Option B.** Leave empty until user populates via Profile UI. Honest — no semantic guess. Surface gap on /community author identity until user fills it.

**Option C.** Derive from a yet-to-be-decided "operating regions" subset of jurisdiction_weights — e.g., the top 3 keys by weight. For Dietl / Rockit that yields: `["eu", "imo", "icao"]` — but IMO/ICAO are institutions, not regions, so this collapses to 1 meaningful region.

**My recommendation:** Option B. The jurisdiction_weights are urgency-scoring weights, not declarations of where the workspace operates. Conflating them risks the H1 trajectory pattern (engagement-as-urgency). Operator can populate region explicitly via Profile editing UI in a separate step.

**Authorization request:** approve A3 backfill SQL for org_id + workspace_role + sector (Option B implicit on region)?

### Multi-org future-proofing flag

Currently 0 multi-org users. The dispatch brief's PAY ATTENTION note ("A3 profiles projection completion may surface profiles that should have been multi-org but were silently single-org") doesn't bite in dev. When production scales to N users with M orgs each, the "oldest membership = active org" default will silently lock multi-org users to their first-joined org. C1 multi-org-switcher dispatch fixes the UX.

---

## Combined ask of operator

Three green-lights to proceed:

1. **A1**: approve Haiku batch invocation at $1.17 estimated cost over 469 rows? Output `docs/audits/sprint3-classifier-quality-batch-2026-05-25.json` for 10% spot-check.

2. **A2**: approve the diff plan (5 edits to system-prompt.ts + 5 to parse-output.ts + 1 to drain-first-fetch + 2 each to MarketPage/ResearchView)? Two atomic commits as described.

3. **A3**: approve the 3-step backfill SQL (org_id + workspace_role + sector)? `profiles.region` deferred to operator-explicit population per Option B.

Three independent verdicts. Any can move forward independently; A1/A2/A3 are not chained.

Holding until each has a verdict.
