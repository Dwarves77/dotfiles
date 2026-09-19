-- subject: Defect D23 part (e), `docs/plans/defect-fix-plan-2026-09-12.md` (lane L15, 2026-09-13): backfills `item_changelog` for brief regenerations that landed before part (a)'s `scripts/lib/changelog.mjs` began recording new ones going forward, so migration 319's widened feed has rows to union in for batches 001 and 002 and any other regeneration since. Inserts one UPDATED / full_brief row per verified, non-archived item with `last_regenerated_at` at or after 2026-09-11, `detected_by` 'record-briefs backfill', `impact_level` mapped from severity (action_required and cost_alert to HIGH, window_closing to CRITICAL, competitive_edge to MODERATE, monitoring to LOW, default MODERATE). Deliberately does NOT backfill timeline rows: `item_timelines` carries no writer column, so a retroactive row cannot be honestly attributed to one cause (coordinator correction, 2026-09-13); timeline changes are recorded going forward only, by the same helper. Idempotent via `NOT EXISTS` on `(item_id, field, detected_by)`. Two-track policy (standing rule 3): a data migration, committed with this lane's consumer code and applied by the coordinator AFTER 319 and AFTER this lane's code merges.
-- 320: item_changelog backfill for brief regenerations already live before this lane's
-- scripts/lib/changelog.mjs (part (a)) began recording new ones going forward.
--
-- D23, docs/plans/defect-fix-plan-2026-09-12.md: the 21 briefs applied by batches 001 and 002
-- (and any regenerated since) are live on the site, but item_changelog never recorded them, so
-- migration 319's widened "What changed" feed has nothing to union in for these items until this
-- backfill runs once.
--
-- CORRECTION (coordinator, 2026-09-13, binding on this migration): backfills ONLY brief
-- regenerations (field full_brief). Timeline rows are NOT backfilled here: live SQL shows 1,471
-- distinct items received item_timelines rows since 2026-09-12 from several writers (the
-- maintenance backfill, the batch applies, the section-14 sync), and item_timelines carries no
-- writer column of its own, so a retroactive row cannot be honestly attributed to any one cause
-- and would flood the What-changed card with mechanical backfill noise. Timeline changes are
-- recorded going forward only, by scripts/lib/changelog.mjs's recordItemChange, called from
-- timeline-backfill.mjs (part (a)) - never retroactively.
--
-- IDEMPOTENT: NOT EXISTS on (item_id, field, detected_by) - a re-run of this file inserts nothing
-- once it has applied once.
--
-- COUNT, read live via Supabase MCP execute_sql (read-only) during this lane, 2026-09-13:
--   select count(*) from intelligence_items where provenance_status='verified' and
--     is_archived=false and last_regenerated_at >= '2026-09-11';
--   First read: 20. Second read, moments later: 21 - CONFIRMING this is a genuinely live-moving
--   count (concurrent regeneration activity elsewhere), not a stable fact this migration can pin.
--   This header states 21 (this lane's own most recent read) as INFORMATIONAL ONLY, per rule 15
--   "attack, don't assert presence" and migration 319's own precedent for a pre-check number: the
--   coordinator re-reads the live count immediately before applying and that re-read is the gate,
--   not a hardcoded assertion in this file (a COUNT check here would make an inherently moving
--   number a spurious migration failure the moment one more item regenerates).

insert into public.item_changelog (item_id, change_date, change_type, field, new_value, impact, impact_level, detected_by)
select
  ii.id,
  ii.last_regenerated_at::date,
  'UPDATED',
  'full_brief',
  'record-briefs backfill',
  'Brief regenerated (backfilled by migration 320, D23).',
  case ii.severity
    when 'action_required' then 'HIGH'
    when 'cost_alert' then 'HIGH'
    when 'window_closing' then 'CRITICAL'
    when 'competitive_edge' then 'MODERATE'
    when 'monitoring' then 'LOW'
    else 'MODERATE'
  end,
  'record-briefs backfill'
from public.intelligence_items ii
where ii.provenance_status = 'verified'
  and ii.is_archived = false
  and ii.last_regenerated_at >= '2026-09-11'
  and not exists (
    select 1 from public.item_changelog c
    where c.item_id = ii.id
      and c.field = 'full_brief'
      and c.detected_by = 'record-briefs backfill'
  );
