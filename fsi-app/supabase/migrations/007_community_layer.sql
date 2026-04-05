-- ══════════════════════════════════════════════════════════════
-- Migration 007: Community Layer — Phase 1 Foundation
-- ══════════════════════════════════════════════════════════════
--
-- ARCHITECTURAL LAW: Section + Tag Duality
-- Every content type on this platform follows one rule:
-- Content lives in ONE canonical home (its type, section, or status tier).
-- Content is discoverable across ALL relevant views via shared tag arrays.
-- Tag vocabulary is controlled and shared across ALL content types.
-- New content types MUST implement: region_tags[], topic_tags[],
-- transport_mode_tags[], vertical_tags[] before being added to the platform.
-- The filter sidebar and unified search operate on this shared vocabulary.
--
-- The core innovation: intelligence items and community content share a
-- database with hard FK links. A regulatory update triggers community
-- notifications. A forum thread links back to the regulation that prompted it.
-- This bidirectionality is the product.
-- ══════════════════════════════════════════════════════════════

-- ── Required extensions ──
CREATE EXTENSION IF NOT EXISTS "ltree";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";


-- ══════════════════════════════════════════════════════════════
-- ALTER: profiles — add community fields
-- Existing profiles table has: id, email, display_name, role, settings
-- ══════════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS headline TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS organization TEXT,
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_sub TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS linkedin_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS linkedin_identity_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS linkedin_workplace_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS linkedin_verification_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_tier TEXT DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS affiliation_type TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS topic_interests TEXT[],
  ADD COLUMN IF NOT EXISTS membership_tier TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS contribution_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;


-- ══════════════════════════════════════════════════════════════
-- ALTER: intelligence_items — add bidirectional link arrays
-- ══════════════════════════════════════════════════════════════

ALTER TABLE intelligence_items
  ADD COLUMN IF NOT EXISTS linked_forum_thread_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_vendor_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_case_study_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_regulation_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS region_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS topic_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS vertical_tags TEXT[] DEFAULT '{}';

-- Note: transport_modes already exists on intelligence_items
-- Note: jurisdictions already exists — region_tags is the cross-type tag array

CREATE INDEX IF NOT EXISTS idx_items_region_tags ON intelligence_items USING GIN(region_tags);
CREATE INDEX IF NOT EXISTS idx_items_topic_tags ON intelligence_items USING GIN(topic_tags);
CREATE INDEX IF NOT EXISTS idx_items_vertical_tags ON intelligence_items USING GIN(vertical_tags);


-- ══════════════════════════════════════════════════════════════
-- ALTER: sources — add universal tag arrays
-- ══════════════════════════════════════════════════════════════

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS topic_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS vertical_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reliability_score NUMERIC(3,2) DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_sources_topic_tags ON sources USING GIN(topic_tags);
CREATE INDEX IF NOT EXISTS idx_sources_vertical_tags ON sources USING GIN(vertical_tags);


-- ══════════════════════════════════════════════════════════════
-- NEW TABLE: taxonomy_nodes — hierarchical taxonomy via ltree
-- ══════════════════════════════════════════════════════════════

CREATE TABLE taxonomy_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  node_type TEXT NOT NULL
    CHECK (node_type IN ('regulation', 'technology', 'region', 'topic', 'industry', 'transport_mode')),
  path LTREE NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES taxonomy_nodes(id),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX taxonomy_path_gist ON taxonomy_nodes USING GIST(path);
CREATE INDEX taxonomy_path_btree ON taxonomy_nodes USING BTREE(path);
CREATE INDEX taxonomy_slug ON taxonomy_nodes(slug);


-- ══════════════════════════════════════════════════════════════
-- NEW TABLE: forum_sections — configurable containers
-- ══════════════════════════════════════════════════════════════

CREATE TABLE forum_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  section_type TEXT DEFAULT 'regional'
    CHECK (section_type IN ('regional', 'topical', 'global', 'special')),
  primary_region_tag TEXT,
  primary_topic_tag TEXT,
  features_enabled TEXT[] DEFAULT ARRAY['posts', 'questions', 'intelligence_feed'],
  is_public BOOLEAN DEFAULT TRUE,
  minimum_membership_tier TEXT DEFAULT 'free',
  sort_order INTEGER DEFAULT 0,
  thread_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ══════════════════════════════════════════════════════════════
-- NEW TABLE: forum_threads
-- ══════════════════════════════════════════════════════════════

CREATE TABLE forum_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID REFERENCES forum_sections(id),
  title TEXT NOT NULL,
  body TEXT,
  author_id UUID REFERENCES profiles(id),
  thread_type TEXT DEFAULT 'discussion'
    CHECK (thread_type IN ('discussion', 'question', 'case_study_link', 'intelligence_alert', 'announcement')),
  -- Universal tag arrays (shared vocabulary)
  topic_tags TEXT[] DEFAULT '{}',
  region_tags TEXT[] DEFAULT '{}',
  transport_mode_tags TEXT[] DEFAULT '{}',
  vertical_tags TEXT[] DEFAULT '{}',
  -- Bidirectional links
  linked_intelligence_item_ids UUID[] DEFAULT '{}',
  linked_vendor_ids UUID[] DEFAULT '{}',
  linked_case_study_ids UUID[] DEFAULT '{}',
  linked_regulation_ids UUID[] DEFAULT '{}',
  -- Moderation
  is_pinned BOOLEAN DEFAULT FALSE,
  is_locked BOOLEAN DEFAULT FALSE,
  -- Counters
  reply_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  upvote_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_threads_section ON forum_threads(section_id);
CREATE INDEX idx_threads_author ON forum_threads(author_id);
CREATE INDEX idx_threads_topic ON forum_threads USING GIN(topic_tags);
CREATE INDEX idx_threads_region ON forum_threads USING GIN(region_tags);
CREATE INDEX idx_threads_transport ON forum_threads USING GIN(transport_mode_tags);
CREATE INDEX idx_threads_vertical ON forum_threads USING GIN(vertical_tags);
CREATE INDEX idx_threads_linked_items ON forum_threads USING GIN(linked_intelligence_item_ids);
CREATE INDEX idx_threads_created ON forum_threads(created_at DESC);


-- ══════════════════════════════════════════════════════════════
-- NEW TABLE: forum_replies — threaded replies
-- ══════════════════════════════════════════════════════════════

CREATE TABLE forum_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  parent_reply_id UUID REFERENCES forum_replies(id),
  author_id UUID REFERENCES profiles(id),
  body TEXT NOT NULL,
  upvote_count INTEGER DEFAULT 0,
  is_accepted_answer BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_replies_thread ON forum_replies(thread_id);
CREATE INDEX idx_replies_parent ON forum_replies(parent_reply_id);
CREATE INDEX idx_replies_author ON forum_replies(author_id);


-- ══════════════════════════════════════════════════════════════
-- NEW TABLE: vendors
-- ══════════════════════════════════════════════════════════════

CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  company_website TEXT,
  company_size TEXT,
  hq_region TEXT,
  service_regions TEXT[] DEFAULT '{}',
  founded_year INTEGER,
  logo_url TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  verification_status TEXT DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'peer_validated', 'staff_reviewed')),
  peer_endorsement_count INTEGER DEFAULT 0,
  listing_tier TEXT DEFAULT 'basic'
    CHECK (listing_tier IN ('basic', 'featured', 'premium')),
  -- Universal tag arrays
  topic_tags TEXT[] DEFAULT '{}',
  region_tags TEXT[] DEFAULT '{}',
  transport_mode_tags TEXT[] DEFAULT '{}',
  vertical_tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vendors_slug ON vendors(slug);
CREATE INDEX idx_vendors_name_trgm ON vendors USING GIN(name gin_trgm_ops);
CREATE INDEX idx_vendors_regions ON vendors USING GIN(service_regions);
CREATE INDEX idx_vendors_topic ON vendors USING GIN(topic_tags);
CREATE INDEX idx_vendors_vertical ON vendors USING GIN(vertical_tags);
CREATE INDEX idx_vendors_verification ON vendors(verification_status);


-- ══════════════════════════════════════════════════════════════
-- NEW TABLE: vendor_regulations — structured compliance mapping
-- ══════════════════════════════════════════════════════════════

CREATE TABLE vendor_regulations (
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  regulation_id UUID REFERENCES intelligence_items(id) ON DELETE CASCADE,
  compliance_type TEXT
    CHECK (compliance_type IN ('supports', 'certifies', 'reports', 'replaces')),
  notes TEXT,
  PRIMARY KEY (vendor_id, regulation_id)
);


-- ══════════════════════════════════════════════════════════════
-- NEW TABLE: vendor_technologies — vendor <-> taxonomy link
-- ══════════════════════════════════════════════════════════════

CREATE TABLE vendor_technologies (
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  taxonomy_node_id UUID REFERENCES taxonomy_nodes(id) ON DELETE CASCADE,
  PRIMARY KEY (vendor_id, taxonomy_node_id)
);


-- ══════════════════════════════════════════════════════════════
-- NEW TABLE: vendor_endorsements — peer validation
-- ══════════════════════════════════════════════════════════════

CREATE TABLE vendor_endorsements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  endorser_id UUID REFERENCES profiles(id),
  endorsement_text TEXT,
  experience_context TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vendor_id, endorser_id)
);

CREATE INDEX idx_endorsements_vendor ON vendor_endorsements(vendor_id);


-- ══════════════════════════════════════════════════════════════
-- NEW TABLE: case_studies
-- ══════════════════════════════════════════════════════════════

CREATE TABLE case_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  submitter_id UUID REFERENCES profiles(id),
  organization TEXT,
  industry_segment TEXT,
  challenge TEXT NOT NULL,
  solution TEXT NOT NULL,
  measurable_outcome TEXT,
  timeline TEXT,
  cost_reference TEXT,
  source_attribution TEXT,
  source_tier INTEGER,
  -- Universal tag arrays
  region_tags TEXT[] DEFAULT '{}',
  topic_tags TEXT[] DEFAULT '{}',
  transport_mode_tags TEXT[] DEFAULT '{}',
  vertical_tags TEXT[] DEFAULT '{}',
  -- Bidirectional links
  linked_regulation_ids UUID[] DEFAULT '{}',
  linked_vendor_ids UUID[] DEFAULT '{}',
  linked_technology_tags TEXT[] DEFAULT '{}',
  linked_thread_id UUID REFERENCES forum_threads(id),
  -- Validation
  peer_validation_count INTEGER DEFAULT 0,
  validation_status TEXT DEFAULT 'submitted'
    CHECK (validation_status IN ('submitted', 'under_review', 'peer_validated', 'featured')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_case_studies_region ON case_studies USING GIN(region_tags);
CREATE INDEX idx_case_studies_topic ON case_studies USING GIN(topic_tags);
CREATE INDEX idx_case_studies_validation ON case_studies(validation_status);
CREATE INDEX idx_case_studies_submitter ON case_studies(submitter_id);


-- ══════════════════════════════════════════════════════════════
-- NEW TABLE: case_study_endorsements
-- ══════════════════════════════════════════════════════════════

CREATE TABLE case_study_endorsements (
  case_study_id UUID REFERENCES case_studies(id) ON DELETE CASCADE,
  endorser_id UUID REFERENCES profiles(id),
  endorsement_type TEXT
    CHECK (endorsement_type IN ('technically_sound', 'replicated', 'recommended')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (case_study_id, endorser_id)
);


-- ══════════════════════════════════════════════════════════════
-- NEW TABLE: notification_subscriptions
-- ══════════════════════════════════════════════════════════════

CREATE TABLE notification_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  subscription_type TEXT NOT NULL
    CHECK (subscription_type IN ('regulation', 'vendor', 'topic', 'region', 'thread', 'source')),
  target_id UUID,
  target_tag TEXT,
  channels TEXT[] DEFAULT ARRAY['in_app'],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notif_subs_user ON notification_subscriptions(user_id);
CREATE INDEX idx_notif_subs_target ON notification_subscriptions(target_id);
CREATE INDEX idx_notif_subs_tag ON notification_subscriptions(target_tag);


-- ══════════════════════════════════════════════════════════════
-- NEW TABLE: notification_events
-- ══════════════════════════════════════════════════════════════

CREATE TABLE notification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'regulation_updated', 'new_thread', 'thread_reply',
      'vendor_endorsed', 'case_study_validated',
      'source_discovered', 'intelligence_alert'
    )),
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  payload JSONB DEFAULT '{}',
  dispatched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notif_events_type ON notification_events(event_type);
CREATE INDEX idx_notif_events_created ON notification_events(created_at DESC);


-- ══════════════════════════════════════════════════════════════
-- NEW TABLE: notification_deliveries
-- ══════════════════════════════════════════════════════════════

CREATE TABLE notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES notification_events(id),
  user_id UUID REFERENCES profiles(id),
  channel TEXT,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'read')),
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ
);

CREATE INDEX idx_notif_deliveries_user ON notification_deliveries(user_id);
CREATE INDEX idx_notif_deliveries_status ON notification_deliveries(status)
  WHERE status = 'pending';


-- ══════════════════════════════════════════════════════════════
-- TRIGGERS: Auto-update timestamps
-- ══════════════════════════════════════════════════════════════

CREATE TRIGGER forum_threads_updated_at
  BEFORE UPDATE ON forum_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER forum_replies_updated_at
  BEFORE UPDATE ON forum_replies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER vendors_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER case_studies_updated_at
  BEFORE UPDATE ON case_studies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ══════════════════════════════════════════════════════════════
-- TRIGGER: Auto-increment reply_count on forum_threads
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_thread_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE forum_threads SET reply_count = reply_count + 1, updated_at = NOW()
    WHERE id = NEW.thread_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE forum_threads SET reply_count = GREATEST(0, reply_count - 1)
    WHERE id = OLD.thread_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reply_count_trigger
  AFTER INSERT OR DELETE ON forum_replies
  FOR EACH ROW EXECUTE FUNCTION update_thread_reply_count();


-- ══════════════════════════════════════════════════════════════
-- TRIGGER: Auto-increment thread_count on forum_sections
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_section_thread_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.section_id IS NOT NULL THEN
    UPDATE forum_sections SET thread_count = thread_count + 1
    WHERE id = NEW.section_id;
  ELSIF TG_OP = 'DELETE' AND OLD.section_id IS NOT NULL THEN
    UPDATE forum_sections SET thread_count = GREATEST(0, thread_count - 1)
    WHERE id = OLD.section_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER section_thread_count_trigger
  AFTER INSERT OR DELETE ON forum_threads
  FOR EACH ROW EXECUTE FUNCTION update_section_thread_count();


-- ══════════════════════════════════════════════════════════════
-- TRIGGER: Auto-increment vendor peer_endorsement_count
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_vendor_endorsement_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE vendors SET peer_endorsement_count = peer_endorsement_count + 1
    WHERE id = NEW.vendor_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE vendors SET peer_endorsement_count = GREATEST(0, peer_endorsement_count - 1)
    WHERE id = OLD.vendor_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vendor_endorsement_count_trigger
  AFTER INSERT OR DELETE ON vendor_endorsements
  FOR EACH ROW EXECUTE FUNCTION update_vendor_endorsement_count();


-- ══════════════════════════════════════════════════════════════
-- TRIGGER: Auto-increment case_study peer_validation_count
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_case_study_validation_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE case_studies SET peer_validation_count = peer_validation_count + 1
    WHERE id = NEW.case_study_id;
    -- Auto-promote to peer_validated when count >= 2 with 'technically_sound'
    UPDATE case_studies SET validation_status = 'peer_validated'
    WHERE id = NEW.case_study_id
    AND validation_status = 'under_review'
    AND peer_validation_count >= 2;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE case_studies SET peer_validation_count = GREATEST(0, peer_validation_count - 1)
    WHERE id = OLD.case_study_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER case_study_validation_count_trigger
  AFTER INSERT OR DELETE ON case_study_endorsements
  FOR EACH ROW EXECUTE FUNCTION update_case_study_validation_count();


-- ══════════════════════════════════════════════════════════════
-- COMMENTS
-- ══════════════════════════════════════════════════════════════

COMMENT ON TABLE taxonomy_nodes IS 'Hierarchical taxonomy via ltree. Regulation hierarchy, technology categories, region codes, topic tags.';
COMMENT ON TABLE forum_sections IS 'Configurable forum containers. 8 regional + 9 topical sections. Features array controls what each section supports.';
COMMENT ON TABLE forum_threads IS 'Forum posts with universal tag arrays and bidirectional links to intelligence items, vendors, and case studies.';
COMMENT ON TABLE forum_replies IS 'Threaded replies. parent_reply_id enables nested threading.';
COMMENT ON TABLE vendors IS 'Vendor directory with peer validation. Contact details gated by RLS membership tier.';
COMMENT ON TABLE vendor_regulations IS 'Structured mapping: which vendors help comply with which regulations.';
COMMENT ON TABLE vendor_endorsements IS 'Peer endorsements. 3 endorsements from verified members = peer_validated status.';
COMMENT ON TABLE case_studies IS 'Peer-validated project documentation. Six structured fields required.';
COMMENT ON TABLE case_study_endorsements IS 'Peer validation of case studies. 2 technically_sound endorsements = peer_validated.';
COMMENT ON TABLE notification_subscriptions IS 'User subscription preferences for regulations, vendors, topics, regions, threads.';
COMMENT ON TABLE notification_events IS 'Event log for all notifications. Dispatched by Edge Function or worker.';
COMMENT ON TABLE notification_deliveries IS 'Per-user notification delivery tracking. Channels: in_app, email, push.';
