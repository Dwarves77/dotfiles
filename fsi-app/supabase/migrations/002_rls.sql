-- FSI Phase 2: Row Level Security
-- Public read on all tables, writes require service_role key

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE timelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE changelog ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE supersessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE staged_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Public read policies (anon key can SELECT)
CREATE POLICY "Public read" ON resources FOR SELECT USING (true);
CREATE POLICY "Public read" ON timelines FOR SELECT USING (true);
CREATE POLICY "Public read" ON changelog FOR SELECT USING (true);
CREATE POLICY "Public read" ON disputes FOR SELECT USING (true);
CREATE POLICY "Public read" ON cross_references FOR SELECT USING (true);
CREATE POLICY "Public read" ON supersessions FOR SELECT USING (true);
CREATE POLICY "Public read" ON source_registry FOR SELECT USING (true);
CREATE POLICY "Public read" ON briefings FOR SELECT USING (true);
CREATE POLICY "Public read" ON staged_updates FOR SELECT USING (true);
CREATE POLICY "Public read" ON profiles FOR SELECT USING (true);
