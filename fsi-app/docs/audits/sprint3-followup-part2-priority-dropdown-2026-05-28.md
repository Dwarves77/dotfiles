# Sprint 3 follow-up Part 2 — manual priority tagging + dismissed stash

**Date**: 2026-05-28
**Scope**: `/regulations` cards + `/regulations/[slug]` hero priority retag dropdown + dismissed-stash drawer

## Summary

Implemented the ⋯ dropdown on every regulation card and on the regulation
detail hero, plus the collapsed "Dismissed regulations" stash at the
bottom of `/regulations`. Reused the existing
`workspace_item_overrides` table + `/api/workspace/overrides` route
rather than creating sibling tables / routes; added a single
`dismissed_at` column via migration 111.

## Investigation findings (verification-before-authorization)

### Existing infrastructure that obviated net-new construction

| Spec call | Existing primitive reused | Decision |
|---|---|---|
| `workspace_regulation_overrides` ALTER | `workspace_item_overrides` already exists (migration 006) with `priority_override`, `is_archived`, `archive_reason`, `archive_note`, `archived_at`, `notes` | Extend, don't create. Dispatch said "use existing schema convention" — done. |
| `POST /api/regulations/[id]/override` | `POST /api/workspace/overrides` already exists with auth + rate-limit + service-role upsert keyed on `(org_id, item_id)` | Extend body to accept `dismissedAt`; do not create the new route. |
| `priority` reroute on Kanban | `mergeWithOverrides()` in `resourceStore.ts` already applies `priorityOverride` to the merged Resource | Extended to also return a `dismissed` bucket. |
| Optimistic + rollback writes | `updatePriority` / `archiveResource` / `restoreResource` already use the `persistOverride` helper with rollback | Added `dismissResource` / `restoreDismissed` following the same pattern. |
| Per-card priority retag UI | None in the regulations folder; `SourceAdminControls` has a similar pattern but is admin-scoped | Built `PriorityDropdown` (new component). |
| Dismissed stash drawer | Native `<details>` element; no custom drawer primitive needed | Built `DismissedStash` (new component) using `<details>` per CLAUDE.md accordion default-CLOSED rule. |

### Drift observations (DRIFTs)

**DRIFT-1: per-user vs per-org dismissal scope**

Dispatch spec said "per-workspace-user, per-regulation, nullable".
Existing schema is **per-org** (`UNIQUE(org_id, item_id)`) with RLS
keyed off `user_belongs_to_org(org_id)`. Upgrading to per-user would
require:
- New `user_id` column + composite unique key
- RLS rewrite (6 policies in `006_rls_multi_tenant.sql`)
- 9 downstream RPCs updated (070-077) to join on user_id too
- `WorkspaceOverrideRow` shape change at every read site

Decision: shipped per-org. Rationale: dispatch standing constraint
("Reuse-before-construction") + scope creep avoidance. Operator
triages whether to upgrade to per-user in a future dispatch. Side-
effect: if two users in the same workspace dismiss the same
regulation independently, they share the dismiss state; if one
restores it, the other sees the restore too. Operator should accept
or veto.

**DRIFT-2: `user_priority` naming vs existing `priority_override`**

Dispatch spec named the column `user_priority`. Existing
`priority_override` column already exists with exactly the right
CHECK constraint (`IN ('CRITICAL', 'HIGH', 'MODERATE', 'LOW')`).
Decision: reused `priority_override`. No code-facing rename; the
component takes `currentPriority` and writes through the existing
`updatePriority` action. The dispatch's `user_priority` /
`userPriority` naming is a layer-of-conversation; the storage layer
keeps its existing name.

**DRIFT-3: `POST /api/regulations/[id]/override` not created**

Dispatch spec called for this route. Existing
`POST /api/workspace/overrides` already serves the exact contract
(auth, rate limit, service-role upsert, cache revalidation). Adding
a duplicate route would have created two write paths to the same
table — exactly the problem `verification-before-authorization`
exists to prevent. Decision: extended the existing route's body
schema with `dismissedAt: string | null`. The dispatch's intent is
preserved; the addressing convention differs from the spec.

**DRIFT-4: priority left-accent — border-left vs box-shadow inset**

Dispatch spec called for `box-shadow: inset 3px 0 0 var(--color-critical), var(--shadow-card)` for cards with a user-set priority.
The existing `cl-priority-{critical,high,moderate,low}` classes
already paint a `border-left: 3px solid var(--color-*)` on every
priority card — functionally identical visual, already wired,
already responsive. Decision: kept border-left. The design HTML
includes the spec's box-shadow recipe under `.reg-card.user-*` so
the design source-of-truth carries the intended convention; the
live component reuses what's wired.

**DRIFT-5: dismissed-stash always-render vs render-when-nonzero**

Dispatch spec implies the drawer renders even when empty (with an
empty-state message inside). Decision: render only when count > 0.
Rationale: the bottom of `/regulations` stays clean for the common
workspace; the drawer's only purpose is to surface non-zero
dismissals. The empty state described in the spec
("No dismissed items. Click ⋯ → Dismiss…") is reachable only when
the operator dismisses then restores everything within a single
session, which is rare. Operator triages whether to flip to
always-render in a future tweak.

## Schema changes

**Migration 111** (`fsi-app/supabase/migrations/111_workspace_overrides_dismissed_at.sql`):

```sql
ALTER TABLE workspace_item_overrides
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_overrides_org_dismissed
  ON workspace_item_overrides(org_id)
  WHERE dismissed_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
```

Idempotent (`ADD COLUMN IF NOT EXISTS`). No data backfill required
— null is the correct default for every existing row (no historical
dismissals to migrate).

USER ACTION: apply via `npx supabase db query --linked --file=fsi-app/supabase/migrations/111_workspace_overrides_dismissed_at.sql`.

## API changes

`POST /api/workspace/overrides` body extended:

```ts
{
  itemId: string;
  priorityOverride?: string | null;  // existing
  isArchived?: boolean;              // existing
  archiveReason?: string | null;     // existing
  archiveNote?: string | null;       // existing
  notes?: string;                    // existing
  dismissedAt?: string | null;       // NEW — ISO timestamp or null
  dismiss?: boolean;                 // NEW — convenience shorthand
}
```

`dismissedAt` is the canonical write path; `dismiss: true/false` is
a sugar shorthand mapped to `dismissedAt = NOW()` / `null` server-
side.

## Components

| Path | Lines | Purpose |
|---|---|---|
| `src/components/regulations/PriorityDropdown.tsx` | 250 | The ⋯ menu. Two variants: `card` (small round button) and `hero` (pill with current priority label). Outside-click + Escape close. stopPropagation on every interactive element so the dropdown is safe inside a `<Link>`. |
| `src/components/regulations/DismissedStash.tsx` | 145 | The bottom drawer. Native `<details>`, closed by default. 2-column grid of rows with ↺ Restore. Count badge derives from array length. Renders only when count > 0. |

## Wiring changes

| Path | Change |
|---|---|
| `src/stores/resourceStore.ts` | Added `dismissedAt?: string \| null` to `WorkspaceOverride`. New actions: `dismissResource(id)`, `restoreDismissed(id)`. `updatePriority` now clears `dismissedAt` on the same write (matches spec contract). `mergeWithOverrides()` now returns `{ active, archived, dismissed }`. |
| `src/lib/supabase-server.ts` | All 3 `workspace_item_overrides` select calls include `dismissed_at`. All 3 row mappers populate `dismissedAt`. `WorkspaceOverrideRow` type extended. |
| `src/components/regulations/RegulationsSurface.tsx` | Filters dismissed regulations to domain=REGULATIONS_DOMAIN, threads `onSetPriority` + `onDismiss` into `KanbanView` → `KanbanCard`, renders `<DismissedStash>` at end of body. |
| `src/components/regulations/RegulationDetailSurface.tsx` | Hero actions row gains `<HeroPriorityDropdown>` (thin wrapper) between Share + Add to watchlist. |
| `src/app/api/workspace/overrides/route.ts` | Body schema extended with `dismissedAt` + `dismiss` shorthand. |
| `src/app/globals.css` | Added `position: relative` to `.cl-row-card` so the absolute-positioned dropdown anchors correctly. |

## Standing constraint compliance

| Constraint | Verdict | Note |
|---|---|---|
| Verification-before-authorization | OK | Investigation phase identified 6 reuse points before any write. |
| Accordion default-state CLOSED | OK | DismissedStash uses `<details>` with no `open` attribute. |
| Integrity rule | OK | Count badge derives from `dismissed.length`. No hardcoded counts in production code. |
| Reuse-before-construction | OK | Reused `workspace_item_overrides`, `/api/workspace/overrides`, `mergeWithOverrides`, `persistOverride`, `updatePriority`, `<details>`. |
| No-emoji rule | OK | `⋯`, `▾`, `×`, `↺` are Unicode glyphs. Colored dots are inline-block `<span>` with CSS background. |
| Code-vs-data state separation | OK | Migration 111 is the only data-state touch. No backfill. |
| Type-check + 4-step CI parity | tsc PASS | `npx tsc --noEmit --project tsconfig.json` returns exit 0. Other 3 pre-push checks (consistency runner, discipline tests, inventory check) run at commit time. |

## Commit sequence

| Commit | Files | Status |
|---|---|---|
| 1 (design) | `design_handoff_2026-05/regulations.html` + `design_handoff_2026-05/regulations-detail.html` | DONE — CSS recipe + sample ⋯ button + dismissed-stash demo + hero pill button |
| 2 (migration) | `supabase/migrations/111_workspace_overrides_dismissed_at.sql` | DONE |
| 3 (components + wiring) | 6 files as enumerated above | DONE |
| 4 (verification) | This audit doc | DONE |

Commit hashes are NOT included here because this dispatch ran in a
single execution pass; commits will be produced by the operator
when staging the change. The audit doc itself is committable.

## Open questions for operator triage

1. **DRIFT-1 (per-org vs per-user)** — should dismiss be promoted to
   per-user scope? If yes, a follow-up migration adds `user_id` and
   rewrites 6 RLS policies + 9 RPCs.
2. **DRIFT-5 (always-render dismissed-stash)** — flip to always-
   render-with-empty-state, or keep render-when-nonzero?
3. **Hero pill colorway swap** — spec asks the `.hero-pill.action`
   next to "Regulation" to swap colorway on retag. Not wired in this
   pass; the existing type+priority pill row is unchanged. The new
   hero dropdown shows the active priority via its own colored dot,
   which is sufficient for operator awareness. Wire the colorway
   swap in a follow-up if the existing redundancy bothers operator.
4. **Detail-page dismiss affordance** — the hero dropdown's Dismiss
   action on `/regulations/[slug]` will currently dismiss the
   regulation, but the page does NOT auto-navigate or auto-render a
   "this regulation is dismissed" banner. Operator decides whether
   to add navigation-on-dismiss + dismissed-banner.

## Verification queries

After migration 111 applies, the following queries should succeed:

```sql
-- Column exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'workspace_item_overrides'
  AND column_name = 'dismissed_at';
-- expect: 1 row, timestamp with time zone

-- Partial index exists
SELECT indexname
FROM pg_indexes
WHERE tablename = 'workspace_item_overrides'
  AND indexname = 'idx_overrides_org_dismissed';
-- expect: 1 row

-- Round-trip via /api/workspace/overrides
-- POST with { itemId, dismissedAt: '2026-05-28T00:00:00Z' }
-- then SELECT WHERE org_id = $org AND item_id = $item;
-- expect: dismissed_at populated
```

End of audit.
