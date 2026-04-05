-- ══════════════════════════════════════════════════════════════
-- Migration 005: RLS Policies for Source Trust Framework
-- ══════════════════════════════════════════════════════════════

-- Enable RLS on all new tables
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_timelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_changelog ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_cross_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_supersessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_trust_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE provisional_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE staged_updates ENABLE ROW LEVEL SECURITY;

-- ── Public read access (anon key) ──
-- All intelligence data is readable by authenticated and anonymous users

CREATE POLICY "sources_read" ON sources FOR SELECT USING (true);
CREATE POLICY "intelligence_items_read" ON intelligence_items FOR SELECT USING (true);
CREATE POLICY "item_timelines_read" ON item_timelines FOR SELECT USING (true);
CREATE POLICY "item_changelog_read" ON item_changelog FOR SELECT USING (true);
CREATE POLICY "item_disputes_read" ON item_disputes FOR SELECT USING (true);
CREATE POLICY "item_cross_references_read" ON item_cross_references FOR SELECT USING (true);
CREATE POLICY "item_supersessions_read" ON item_supersessions FOR SELECT USING (true);
CREATE POLICY "source_trust_events_read" ON source_trust_events FOR SELECT USING (true);
CREATE POLICY "source_conflicts_read" ON source_conflicts FOR SELECT USING (true);
CREATE POLICY "source_citations_read" ON source_citations FOR SELECT USING (true);
CREATE POLICY "provisional_sources_read" ON provisional_sources FOR SELECT USING (true);

-- Monitoring queue: read-only for anon, worker writes
CREATE POLICY "monitoring_queue_read" ON monitoring_queue FOR SELECT USING (true);

-- Staged updates: read-only for anon
CREATE POLICY "staged_updates_read" ON staged_updates FOR SELECT USING (true);

-- ── Admin write access ──
-- Only service_role (backend/worker) can write to these tables
-- The anon key cannot insert, update, or delete

CREATE POLICY "sources_admin_insert" ON sources FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "sources_admin_update" ON sources FOR UPDATE
  USING (auth.role() = 'service_role');
CREATE POLICY "sources_admin_delete" ON sources FOR DELETE
  USING (auth.role() = 'service_role');

CREATE POLICY "intelligence_items_admin_insert" ON intelligence_items FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "intelligence_items_admin_update" ON intelligence_items FOR UPDATE
  USING (auth.role() = 'service_role');
CREATE POLICY "intelligence_items_admin_delete" ON intelligence_items FOR DELETE
  USING (auth.role() = 'service_role');

CREATE POLICY "item_timelines_admin_write" ON item_timelines FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "item_timelines_admin_update" ON item_timelines FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "item_changelog_admin_write" ON item_changelog FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "item_disputes_admin_write" ON item_disputes FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "item_disputes_admin_update" ON item_disputes FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "item_cross_references_admin_write" ON item_cross_references FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "item_cross_references_admin_delete" ON item_cross_references FOR DELETE
  USING (auth.role() = 'service_role');

CREATE POLICY "item_supersessions_admin_write" ON item_supersessions FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Trust events: INSERT only (immutable audit trail)
CREATE POLICY "source_trust_events_admin_insert" ON source_trust_events FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
-- No update or delete — trust events are immutable

CREATE POLICY "source_conflicts_admin_write" ON source_conflicts FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "source_conflicts_admin_update" ON source_conflicts FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "source_citations_admin_write" ON source_citations FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "monitoring_queue_admin_write" ON monitoring_queue FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "monitoring_queue_admin_update" ON monitoring_queue FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "provisional_sources_admin_write" ON provisional_sources FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "provisional_sources_admin_update" ON provisional_sources FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "staged_updates_admin_write" ON staged_updates FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "staged_updates_admin_update" ON staged_updates FOR UPDATE
  USING (auth.role() = 'service_role');
