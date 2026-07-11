-- Rollback for migration 181 — recreates the vendor table family (tables, indexes, endorsement-count
-- trigger fn + trigger, updated_at trigger, RLS + policies) from migration 007 DDL + live policy
-- definitions captured 2026-07-11. Apply only to undo migration 181. Tables come back EMPTY (they
-- held 0 rows at drop time).

BEGIN;

CREATE TABLE public.vendors (
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

CREATE TABLE public.vendor_regulations (
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  regulation_id UUID REFERENCES intelligence_items(id) ON DELETE CASCADE,
  compliance_type TEXT
    CHECK (compliance_type IN ('supports', 'certifies', 'reports', 'replaces')),
  notes TEXT,
  PRIMARY KEY (vendor_id, regulation_id)
);

CREATE TABLE public.vendor_technologies (
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  taxonomy_node_id UUID REFERENCES taxonomy_nodes(id) ON DELETE CASCADE,
  PRIMARY KEY (vendor_id, taxonomy_node_id)
);

CREATE TABLE public.vendor_endorsements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  endorser_id UUID REFERENCES profiles(id),
  endorsement_text TEXT,
  experience_context TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vendor_id, endorser_id)
);
CREATE INDEX idx_endorsements_vendor ON vendor_endorsements(vendor_id);

-- Trigger function + triggers
CREATE OR REPLACE FUNCTION public.update_vendor_endorsement_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE vendors SET peer_endorsement_count = peer_endorsement_count + 1
    WHERE id = NEW.vendor_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE vendors SET peer_endorsement_count = GREATEST(0, peer_endorsement_count - 1)
    WHERE id = OLD.vendor_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vendors_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER vendor_endorsement_count_trigger
  AFTER INSERT OR DELETE ON vendor_endorsements
  FOR EACH ROW EXECUTE FUNCTION update_vendor_endorsement_count();

-- RLS + policies (live definitions 2026-07-11)
ALTER TABLE public.vendors             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_regulations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_technologies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_endorsements ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendors_read   ON public.vendors FOR SELECT USING (true);
CREATE POLICY vendors_insert ON public.vendors FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY vendors_update ON public.vendors FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY vendor_regs_read  ON public.vendor_regulations FOR SELECT USING (true);
CREATE POLICY vendor_regs_write ON public.vendor_regulations FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY vendor_techs_read  ON public.vendor_technologies FOR SELECT USING (true);
CREATE POLICY vendor_techs_write ON public.vendor_technologies FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY endorsements_read   ON public.vendor_endorsements FOR SELECT USING (true);
CREATE POLICY endorsements_insert ON public.vendor_endorsements FOR INSERT
  WITH CHECK ((auth.uid() IS NOT NULL) AND (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.verification_tier = ANY (ARRAY['linkedin_verified','staff_verified']))));

COMMIT;
