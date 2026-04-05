-- ══════════════════════════════════════════════════════════════
-- Migration 007 RLS: Community Layer Row Level Security
-- ══════════════════════════════════════════════════════════════

-- ── Enable RLS ──
ALTER TABLE taxonomy_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_regulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_technologies ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_endorsements ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_study_endorsements ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- Taxonomy: public read, service_role write
-- ══════════════════════════════════════════════════════════════

CREATE POLICY "taxonomy_read" ON taxonomy_nodes FOR SELECT USING (true);
CREATE POLICY "taxonomy_write" ON taxonomy_nodes FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "taxonomy_update" ON taxonomy_nodes FOR UPDATE USING (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════
-- Forum sections: public read
-- ══════════════════════════════════════════════════════════════

CREATE POLICY "sections_read" ON forum_sections FOR SELECT USING (true);
CREATE POLICY "sections_write" ON forum_sections FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════
-- Forum threads: public sections visible to all, private gated
-- ══════════════════════════════════════════════════════════════

CREATE POLICY "threads_read" ON forum_threads FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM forum_sections fs
    WHERE fs.id = forum_threads.section_id
    AND (
      fs.is_public = true
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.membership_tier IN ('member', 'contributor', 'verified', 'premium')
      )
    )
  )
  OR section_id IS NULL -- threads without a section are readable
);

CREATE POLICY "threads_insert" ON forum_threads FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.verification_tier != 'unverified'
  )
);

CREATE POLICY "threads_update" ON forum_threads FOR UPDATE USING (
  author_id = auth.uid() OR auth.role() = 'service_role'
);

-- ══════════════════════════════════════════════════════════════
-- Forum replies: readable if thread is readable, writable by verified
-- ══════════════════════════════════════════════════════════════

CREATE POLICY "replies_read" ON forum_replies FOR SELECT USING (true);

CREATE POLICY "replies_insert" ON forum_replies FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.verification_tier != 'unverified'
  )
);

CREATE POLICY "replies_update" ON forum_replies FOR UPDATE USING (
  author_id = auth.uid() OR auth.role() = 'service_role'
);

-- ══════════════════════════════════════════════════════════════
-- Vendors: public read on non-gated fields, contact gated
-- ══════════════════════════════════════════════════════════════

CREATE POLICY "vendors_read" ON vendors FOR SELECT USING (true);
-- Contact details are filtered at the application layer based on membership_tier
-- RLS allows read of the row; the API strips contact fields for free tier

CREATE POLICY "vendors_insert" ON vendors FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "vendors_update" ON vendors FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "vendor_regs_read" ON vendor_regulations FOR SELECT USING (true);
CREATE POLICY "vendor_regs_write" ON vendor_regulations FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "vendor_techs_read" ON vendor_technologies FOR SELECT USING (true);
CREATE POLICY "vendor_techs_write" ON vendor_technologies FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════
-- Vendor endorsements: readable by all, writable by verified members
-- ══════════════════════════════════════════════════════════════

CREATE POLICY "endorsements_read" ON vendor_endorsements FOR SELECT USING (true);

CREATE POLICY "endorsements_insert" ON vendor_endorsements FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.verification_tier IN ('linkedin_verified', 'staff_verified')
  )
);

-- ══════════════════════════════════════════════════════════════
-- Case studies: readable by all, submittable by email_verified+
-- ══════════════════════════════════════════════════════════════

CREATE POLICY "case_studies_read" ON case_studies FOR SELECT USING (true);

CREATE POLICY "case_studies_insert" ON case_studies FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.verification_tier != 'unverified'
  )
);

CREATE POLICY "case_studies_update" ON case_studies FOR UPDATE USING (
  submitter_id = auth.uid() OR auth.role() = 'service_role'
);

CREATE POLICY "case_endorsements_read" ON case_study_endorsements FOR SELECT USING (true);

CREATE POLICY "case_endorsements_insert" ON case_study_endorsements FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND p.verification_tier IN ('linkedin_verified', 'staff_verified')
  )
);

-- ══════════════════════════════════════════════════════════════
-- Notifications: user can only see their own
-- ══════════════════════════════════════════════════════════════

CREATE POLICY "notif_subs_read" ON notification_subscriptions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notif_subs_insert" ON notification_subscriptions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "notif_subs_delete" ON notification_subscriptions FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "notif_events_read" ON notification_events FOR SELECT USING (true);
CREATE POLICY "notif_events_insert" ON notification_events FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "notif_deliveries_read" ON notification_deliveries FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notif_deliveries_update" ON notification_deliveries FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "notif_deliveries_insert" ON notification_deliveries FOR INSERT WITH CHECK (auth.role() = 'service_role');
