-- ══════════════════════════════════════════════════════════════
-- Seed: Community Layer — Forum Sections + Taxonomy + Case Studies
-- ══════════════════════════════════════════════════════════════


-- ── Forum Sections: 8 Regional ──

INSERT INTO forum_sections (name, slug, description, section_type, primary_region_tag, features_enabled, sort_order) VALUES
('EU / Europe', 'eu-europe', 'European regulatory developments, EU ETS, CSRD, packaging, and green corridors.', 'regional', 'EU', ARRAY['posts', 'questions', 'intelligence_feed'], 1),
('United States', 'united-states', 'US federal and state regulations, EPA, CARB, IRA, and infrastructure.', 'regional', 'US', ARRAY['posts', 'questions', 'intelligence_feed'], 2),
('United Kingdom', 'united-kingdom', 'UK-specific regulations, ZEV mandate, UK ETS, SAF mandate, EPR.', 'regional', 'UK', ARRAY['posts', 'questions', 'intelligence_feed'], 3),
('Latin America', 'latin-america', 'LATAM regulatory landscape, Brazil PNRS, Chile, Colombia, Mexico.', 'regional', 'LATAM', ARRAY['posts', 'questions', 'intelligence_feed'], 4),
('Asia Pacific', 'asia-pacific', 'China, Japan, Korea, ASEAN, India, Australia — regional regulations and operations.', 'regional', 'APAC', ARRAY['posts', 'questions', 'intelligence_feed'], 5),
('Hong Kong', 'hong-kong', 'Hong Kong-specific regulations, EV policy, BEAM Plus, cross-border logistics.', 'regional', 'HONG_KONG', ARRAY['posts', 'questions', 'intelligence_feed'], 6),
('Middle East & Africa', 'middle-east-africa', 'DEWA, GCC regulations, African logistics, shore power, solar permitting.', 'regional', 'MEA', ARRAY['posts', 'questions', 'intelligence_feed'], 7),
('Global', 'global', 'IMO, ICAO, WTO, UNFCCC, and cross-jurisdictional regulatory topics.', 'regional', 'GLOBAL', ARRAY['posts', 'questions', 'intelligence_feed'], 8);


-- ── Forum Sections: 9 Topical ──

INSERT INTO forum_sections (name, slug, description, section_type, primary_topic_tag, features_enabled, sort_order) VALUES
('Sustainable Packaging & Crating', 'packaging-crating', 'EU PPWR, recyclability, reusable crating, honeycomb alternatives, ISPM 15.', 'topical', 'packaging', ARRAY['posts', 'questions', 'intelligence_feed'], 10),
('SAF & Air Freight Decarbonization', 'saf-air-freight', 'ReFuelEU Aviation, CORSIA, SAF mandates, air cargo fuel surcharges.', 'topical', 'saf', ARRAY['posts', 'questions', 'intelligence_feed'], 11),
('EV & Alternative Fuel Vehicles', 'ev-alternative-fuels', 'Battery technology, hydrogen, charging infrastructure, fleet electrification.', 'topical', 'ev', ARRAY['posts', 'questions', 'intelligence_feed'], 12),
('Carbon Reporting & Compliance', 'carbon-reporting', 'ISO 14083, GLEC Framework, CSRD, Scope 3, GHG Protocol, CBAM.', 'topical', 'carbon_pricing', ARRAY['posts', 'questions', 'intelligence_feed'], 13),
('Warehouse & Facility Optimization', 'warehouse-facilities', 'Rooftop solar, BESS, energy tariffs, green building certification.', 'topical', 'warehouse', ARRAY['posts', 'questions', 'intelligence_feed'], 14),
('Regulatory Watch', 'regulatory-watch', 'New rules, implementation questions, compliance deadlines, enforcement updates.', 'topical', 'regulation', ARRAY['posts', 'questions', 'intelligence_feed', 'announcements'], 15),
('Vendor Recommendations & Reviews', 'vendor-reviews', 'Peer recommendations for sustainable suppliers, operators, and products.', 'topical', 'innovation', ARRAY['posts', 'questions'], 16),
('University & Research Partnerships', 'research-partnerships', 'MIT ClimateMachine, Tyndall Centre, academic collaborations, research findings.', 'topical', 'research', ARRAY['posts', 'questions', 'intelligence_feed'], 17),
('Live Events Sustainability', 'live-events', 'Touring logistics, festival operations, venue decarbonization, modal shift.', 'topical', 'live_events', ARRAY['posts', 'questions', 'intelligence_feed'], 18);


-- ── Taxonomy Nodes: Top-level categories ──

INSERT INTO taxonomy_nodes (label, slug, node_type, path, sort_order) VALUES
-- Regulation hierarchy
('Regulation', 'regulation', 'regulation', 'regulation', 1),
('Emissions & Carbon Pricing', 'emissions-carbon-pricing', 'regulation', 'regulation.emissions', 2),
('Sustainable Fuels', 'sustainable-fuels', 'regulation', 'regulation.fuels', 3),
('Transport Standards', 'transport-standards', 'regulation', 'regulation.transport', 4),
('ESG Reporting', 'esg-reporting', 'regulation', 'regulation.reporting', 5),
('Packaging & Circular Economy', 'packaging-circular', 'regulation', 'regulation.packaging', 6),
('Customs & Trade', 'customs-trade', 'regulation', 'regulation.customs', 7),
('Dangerous Goods', 'dangerous-goods', 'regulation', 'regulation.dg', 8),

-- Technology hierarchy
('Technology', 'technology', 'technology', 'technology', 10),
('Battery & EV', 'battery-ev', 'technology', 'technology.battery_ev', 11),
('SAF', 'saf', 'technology', 'technology.saf', 12),
('Hydrogen', 'hydrogen', 'technology', 'technology.hydrogen', 13),
('Marine Fuels', 'marine-fuels', 'technology', 'technology.marine_fuels', 14),
('Solar & BESS', 'solar-bess', 'technology', 'technology.solar_bess', 15),
('Autonomous Freight', 'autonomous-freight', 'technology', 'technology.autonomous', 16),

-- Region hierarchy
('Region', 'region', 'region', 'region', 20),
('Europe', 'europe', 'region', 'region.europe', 21),
('Americas', 'americas', 'region', 'region.americas', 22),
('Asia Pacific', 'asia-pacific-region', 'region', 'region.apac', 23),
('Middle East & Africa', 'mea-region', 'region', 'region.mea', 24),

-- Transport modes
('Transport Mode', 'transport-mode', 'transport_mode', 'transport', 30),
('Air', 'air', 'transport_mode', 'transport.air', 31),
('Road', 'road', 'transport_mode', 'transport.road', 32),
('Ocean', 'ocean', 'transport_mode', 'transport.ocean', 33),
('Rail', 'rail', 'transport_mode', 'transport.rail', 34),

-- Industry segments
('Industry', 'industry', 'industry', 'industry', 40),
('Fine Art & Museums', 'fine-art-museums', 'industry', 'industry.fine_art', 41),
('Live Events & Touring', 'live-events-touring', 'industry', 'industry.live_events', 42),
('Luxury Goods', 'luxury-goods-industry', 'industry', 'industry.luxury', 43),
('Film & TV', 'film-tv-industry', 'industry', 'industry.film_tv', 44),
('Automotive', 'automotive-industry', 'industry', 'industry.automotive', 45),
('Humanitarian', 'humanitarian-industry', 'industry', 'industry.humanitarian', 46),
('Bulk Commodity', 'bulk-commodity', 'industry', 'industry.bulk', 47),
('Cold Chain', 'cold-chain', 'industry', 'industry.cold_chain', 48),
('Pharmaceuticals', 'pharma-industry', 'industry', 'industry.pharma', 49),
('E-Commerce', 'ecommerce-industry', 'industry', 'industry.ecommerce', 50),
('Industrial Equipment', 'industrial-equipment', 'industry', 'industry.industrial', 51),
('Chemicals & Hazmat', 'chemicals-hazmat', 'industry', 'industry.chemicals', 52);


-- ── Seed Case Studies (from validated research) ──

INSERT INTO case_studies (title, organization, industry_segment, challenge, solution, measurable_outcome, timeline, cost_reference, source_attribution, source_tier, region_tags, topic_tags, transport_mode_tags, vertical_tags, validation_status) VALUES

('Hauser & Wirth Travel Frame Redesign',
 'Mtec Fine Art / Queen''s / Constantine',
 'Fine Art & Museums',
 'Traditional softwood plywood travel frames are heavy, carbon-intensive, and expensive to produce and ship.',
 'Redesigned travel frame construction with three competing approaches: Mtec Fine Art softwood plywood optimization, Queen''s alternative construction, and Constantine premium approach.',
 '0.34 kg CO2e/unit at £146/unit (Mtec); £175/frame (Queen''s); £290/frame (Constantine)',
 'Completed',
 '£146-290 per frame depending on supplier and approach',
 'Direct operational data',
 2,
 ARRAY['EMEA', 'UK'],
 ARRAY['sustainable_materials', 'packaging', 'crating'],
 ARRAY['road', 'air'],
 ARRAY['fine_art'],
 'peer_validated'),

('White Cube Cardboard Honeycomb Crating Test',
 'White Cube',
 'Fine Art & Museums',
 'Traditional wooden crating for artwork is heavy, requires ISPM 15 compliance, and has high material cost. Testing if cardboard honeycomb provides adequate protection.',
 'Temperature monitoring during April 2022 transit to evaluate cardboard honeycomb as alternative to wooden crating for non-fragile artwork.',
 'Temperature data collected over transit period. Results used to evaluate material suitability.',
 'April 2022',
 'Not disclosed',
 'Gallery operational test',
 3,
 ARRAY['EMEA', 'UK'],
 ARRAY['sustainable_materials', 'packaging', 'crating'],
 ARRAY['road'],
 ARRAY['fine_art'],
 'submitted'),

('Coldplay Music of the Spheres Sustainability Roadmap',
 'Coldplay',
 'Live Events & Touring',
 'Major world tour with massive carbon footprint from equipment freight, travel, and production energy.',
 'Comprehensive sustainability roadmap: kinetic dance floors for energy generation, solar panels, EV batteries for show power, SAF for equipment freight, reduced truck count via production design.',
 'Claimed 59% reduction in direct CO2 emissions vs previous tour (independently verified by MIT).',
 '2022-2025',
 'Not publicly disclosed',
 'Published tour sustainability report + MIT ClimateMachine verification',
 2,
 ARRAY['GLOBAL'],
 ARRAY['live_events', 'saf', 'ev', 'solar'],
 ARRAY['air', 'road'],
 ARRAY['live_events'],
 'peer_validated'),

('Massive Attack ACT 1.5 Low-Carbon Concert',
 'Massive Attack / Tyndall Centre',
 'Live Events & Touring',
 'Demonstrate that a major concert can be produced with dramatically reduced emissions without compromising audience experience.',
 'ACT 1.5 concert model developed with Tyndall Centre: train-only audience transport mandate, local production sourcing, renewable energy, no air freight for equipment.',
 'Tyndall Centre published full emissions analysis (2025). Model validated for replication.',
 '2025',
 'Research-funded',
 'Tyndall Centre ACT 1.5 Report, 2025',
 2,
 ARRAY['EMEA', 'UK'],
 ARRAY['live_events', 'research'],
 ARRAY['road'],
 ARRAY['live_events'],
 'peer_validated'),

('Christie''s DNA Fine Art EV Sprinter Courier',
 'Christie''s / DNA Fine Art',
 'Fine Art & Museums',
 'Last-mile fine art courier service in London using diesel vans. Need to decarbonize without compromising handling standards.',
 'Deployed electric Mercedes Sprinter vans for fine art courier operations. Custom interior fit-out for art handling. Operating within London ULEZ zone.',
 'Zero direct emissions for covered routes. Operating cost reduction vs diesel.',
 'Operational',
 'Not publicly disclosed',
 'Industry knowledge',
 4,
 ARRAY['EMEA', 'UK'],
 ARRAY['ev', 'sustainable_materials'],
 ARRAY['road'],
 ARRAY['fine_art'],
 'submitted'),

('MIT ClimateMachine Phase 1: Air Freight Modal Shift',
 'MIT Environmental Solutions Initiative',
 'Research',
 'Quantify the emissions impact of air freight in the live music industry and model the reduction potential from modal shift to ocean freight.',
 'Phase 1 assessment covering 80,000+ events across US and UK. Measured air freight share of non-fan emissions and modeled 50-95% reduction from air-to-ocean modal shift.',
 'UK live music: 4.0 MtCO2e total, air freight = 35.4% of non-fan emissions (331,084 tCO2e). US: 14.3 MtCO2e. Modal shift potential: 50-95% reduction.',
 'Published December 11, 2025',
 'Research-funded (MIT ESI)',
 'Climate Machine (2025). Assessment Report — Phase 1: Live Music, UK and US. MIT ESI.',
 1,
 ARRAY['NA', 'UK', 'GLOBAL'],
 ARRAY['research', 'aviation', 'maritime'],
 ARRAY['air', 'ocean'],
 ARRAY['live_events'],
 'peer_validated');
