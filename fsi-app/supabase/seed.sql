-- FSI Seed Data
-- Generated from TypeScript/JSON seed files
-- 2026-03-02T06:24:45.114Z

BEGIN;

-- ═══ Resources (119 active) ═══
INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'o1', 'ocean', 'IMO Regulations', 'IMO GHG Strategy 2023', 'https://www.imo.org/en/MediaCentre/HotTopics/Pages/HotTopics.aspx',
  'Net-zero by ~2050. Checkpoints: 20% by 2030, 70% by 2040. Replaces 2018 strategy.', 'framework', 'CRITICAL', 'Sets the global trajectory for carrier fleet investment and green fuel adoption — every ocean freight contract is shaped by this.',
  ARRAY['IMO','net-zero','2050','global'], 'IMO''s revised strategy committing global shipping to net-zero GHG emissions by around 2050 with interim checkpoints.', 'This strategy determines carrier fleet investment direction over the next 25 years. Live events freight forwarders must understand which carriers are investing ahead of the curve to negotiate favorable long-term contracts. Green fuel surcharges will be directly linked to these targets.',
  ARRAY['Net-zero by or around 2050','20% reduction by 2030 (striving 30%)','70% by 2040 (striving 80%)','Pricing mechanism under negotiation','Replaces 2018 50%-by-2050 strategy'], ARRAY['ocean'],
  'emissions', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'o2', 'ocean', 'IMO Regulations', 'FuelEU Maritime', 'https://transport.ec.europa.eu/transport-modes/maritime/fueleu-maritime_en',
  'GHG intensity limits: 2% by 2025, 80% by 2050. Penalty €2,400/tonne VLSFO shortfall.', 'regulation', 'CRITICAL', 'Mandatory GHG intensity limits with €2,400/tonne penalties — direct fuel surcharge driver.',
  ARRAY['FuelEU','GHG intensity','EU ports','penalty'], 'EU mandate requiring GHG intensity of energy used onboard ships at EU ports to decrease progressively.', 'Carriers will pass through fuel compliance costs on every EU port call. High-value cargo operators must budget for escalating surcharges and compare green corridor premiums against conventional routing costs.',
  ARRAY['Penalty: €2,400/tonne VLSFO shortfall','2% GHG reduction by 2025','6% by 2030, 80% by 2050','Shore power mandate from 2030','Applies to all EU port calls'], ARRAY['ocean'],
  'fuels', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'o3', 'ocean', 'IMO Regulations', 'EU ETS for Shipping', 'https://climate.ec.europa.eu/eu-action/transport/reducing-emissions-shipping-sector_en',
  'Ships >5,000GT surrender ETS allowances: 40%(2024), 70%(2025), 100%(2026).', 'regulation', 'CRITICAL', 'Directly binding ETS obligation with financial penalties. Immediate cost pass-through on every EU shipment.',
  ARRAY['ETS','ocean','allowances','2024'], 'EU regulation extending the Emissions Trading System to maritime shipping for vessels over 5,000 gross tonnage.', 'Every ocean shipment via EU ports faces ETS surcharges passed through by carriers. Event logistics specialists must budget for escalating costs (40%→100%) and factor ETS into lane comparisons when routing equipment and staging materials.',
  ARRAY['Surrender: 40% (2024), 70% (2025), 100% (2026)','CH4 and N2O included from 2026','5,000+ vessels on THETIS-MRV','Applies to vessels >5,000 GT calling EU ports'], ARRAY['ocean'],
  'emissions', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'o4', 'ocean', 'IMO Regulations', 'CII (Carbon Intensity Indicator)', 'https://www.imo.org/en/OurWork/Environment/Pages/Carbon-Intensity-Code-rating.aspx',
  'Annual A-E rating; D for 3yrs or E for 1yr triggers corrective action. MEPC 83 completed Phase 1 review; Z-factors set for 2027-2030.', 'regulation', 'CRITICAL', 'Annual vessel ratings directly affect carrier fleet viability and charter market pricing. Phase 1 review complete — thresholds confirmed tightening.',
  ARRAY['CII','rating','vessel','annual'], 'IMO''s operational carbon intensity rating system assigning annual A-E grades to individual vessels. MEPC 83 completed Phase 1 review and set CII reduction (Z) factors for 2027-2030.', 'Vessels rated D or E face operational restrictions and corrective action requirements. Freight forwarders should verify carrier vessel CII ratings when booking — poorly rated vessels may face speed restrictions that affect transit times for time-sensitive event cargo. Z-factors for 2027-2030 now confirmed means predictable tightening schedule.',
  ARRAY['Annual rating A-E per vessel','D for 3 years or E for 1 year → corrective action plan','MEPC 83: Phase 1 review completed Apr 2025','Z-factors for 2027-2030 formally adopted','Phase 2 review: Jan 2026 → Spring 2027','Affects charter market vessel valuations'], ARRAY['ocean'],
  'transport', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'o5', 'ocean', 'IMO Regulations', 'IMO MARPOL Annex VI', 'https://www.imo.org/en/OurWork/Environment/Pages/Air-Pollution.aspx',
  'Sulphur cap 0.5% global, 0.1% ECA zones. NOx Tier III.', 'regulation', 'HIGH', 'Sulphur and NOx limits drive fuel choices and scrubber surcharges across all ocean routes.',
  ARRAY['MARPOL','sulphur','ECA','NOx'], 'International maritime air pollution rules setting limits on sulphur oxides, nitrogen oxides, and particulate matter from ships.', 'Sulphur compliance costs are embedded in every ocean freight rate. ECA zone surcharges apply on Northern European and North American routes frequently used for event equipment shipping.',
  ARRAY['Global sulphur cap: 0.5% (since 2020)','ECA zones: 0.1% limit','NOx Tier III for new engines','Compliance via low-sulphur fuel or scrubbers'], ARRAY['ocean'],
  'emissions', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'o6', 'ocean', 'IMO Regulations', 'EU MRV Regulation', 'https://mrv.emsa.europa.eu/',
  'Mandatory CO2 monitoring/reporting/verification for ships >5,000GT at EU ports.', 'tool', 'HIGH', 'Mandatory compliance portal — all EU ETS maritime data flows through THETIS-MRV.',
  ARRAY['MRV','EMSA','reporting','compliance'], 'EU regulation requiring monitoring, reporting and verification of CO2 emissions for large ships calling at EU ports.', 'Vessel-level emissions data determines carrier ETS exposure and surcharge legitimacy. Freight forwarders can verify carrier environmental claims and identify lowest-emission vessels for client sustainability reports.',
  ARRAY['5,000+ companies registered','Covers all EU port calls','Public company-level data','Required for ETS allowance calculations'], ARRAY['ocean'],
  'reporting', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'o7', 'ocean', 'Fuels & Technology', 'Getting to Zero Coalition', 'https://www.getzerocoalition.org/',
  'Industry alliance targeting zero-emission vessels by 2030.', 'initiative', 'HIGH', 'Green corridor pilots on major trade lanes inform surcharge viability by route.',
  ARRAY['green corridors','zero-emission','2030'], 'Industry coalition of 200+ companies working to deploy commercially viable zero-emission vessels by 2030.', 'Corridor pilots on routes like EU-Asia and transatlantic directly affect lane options for live events freight. Understanding pilot timelines helps price green shipping premiums for clients requesting low-carbon logistics.',
  ARRAY['200+ member companies','Target: commercially viable ZEV by 2030','6+ active corridor projects','Focus: ammonia, methanol, hydrogen'], ARRAY['ocean'],
  'corridors', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'o8', 'ocean', 'Fuels & Technology', 'Alternative Fuels Insight (IRENA/IMO)', 'https://www.irena.org/Energy-Transition/Technology/Maritime-transport',
  'Tracks LNG, methanol, ammonia, hydrogen adoption across global fleet.', 'data', 'HIGH', 'Fuel transition data essential for understanding which carriers are future-proofing fleets.',
  ARRAY['alternative fuels','LNG','methanol','ammonia'], 'IRENA''s tracking of alternative fuel adoption rates and technology readiness across the global shipping fleet.', 'Fuel transition rates indicate which carriers are investing in compliance. Event logistics specialists can identify forward-looking carrier partners and avoid those facing stranded asset risk.',
  ARRAY['LNG fleet growth tracking','Methanol-ready vessel orders','Ammonia engine development status','Hydrogen pilot projects'], ARRAY['ocean'],
  'fuels', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'o9', 'ocean', 'Fuels & Technology', 'Norway Zero-Emission Shipping', 'https://www.regjeringen.no/en/topics/transport-and-communications/innsiktsartikler-samferdsel/zero-emission-shipping/id2857855/',
  'World''s first zero-emission fjord requirements by 2026.', 'regulation', 'MODERATE', 'Norway leads with mandatory zero-emission requirements — signals direction for other jurisdictions.',
  ARRAY['Norway','fjords','zero-emission','2026'], 'Norway''s pioneering regulations requiring zero-emission vessel operations in Norwegian fjords from 2026.', 'Norway''s requirements signal the direction for other jurisdictions. Freight forwarders routing through Scandinavian ports should monitor for compliance implications on vessel selection.',
  ARRAY['Zero-emission fjord requirements by 2026','World''s first mandatory ZEV shipping zone','Applies to domestic ferry and cargo routes'], ARRAY['ocean'],
  'emissions', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'o10', 'ocean', 'Fuels & Technology', 'ESPO (European Sea Ports Organisation)', 'https://www.espo.be/',
  'EU port sustainability standards, shore power, cold ironing.', 'industry', 'MODERATE', 'Port sustainability standards affect dwell costs and operational requirements at EU hubs.',
  ARRAY['ports','shore power','cold ironing','EU'], 'European port industry body setting sustainability standards and tracking shore power deployment.', 'Port-level requirements (shore power mandates, emission zones) affect vessel selection and dwell costs at major European hubs used for event equipment import/export.',
  ARRAY['Shore power deployment tracking','Environmental Ship Index (ESI)','Port sustainability report','Cold ironing mandates'], ARRAY['ocean'],
  'corridors', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'o11', 'ocean', 'Fuels & Technology', 'Lloyd''s Register Decarbonisation Hub', 'https://www.lr.org/en/sustainability/decarbonisation/',
  'Technical guidance on fleet decarbonisation pathways.', 'guidance', 'HIGH', 'Classification society guidance shapes carrier fleet investment decisions and fuel transition timelines.',
  ARRAY['Lloyd''s Register','fleet','decarbonisation','technical'], 'Lloyd''s Register''s technical advisory platform for maritime fleet decarbonisation pathways and fuel transition.', 'Classification society guidance directly influences carrier fleet decisions. Understanding LR''s recommended pathways helps freight forwarders assess carrier readiness and negotiate informed contracts.',
  ARRAY['Fleet decarbonisation pathway modelling','Fuel transition technical guidance','Vessel retrofit advisory','Regulatory compliance support'], ARRAY['ocean'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'o12', 'ocean', 'Fuels & Technology', 'Blue Visby Solution', 'https://www.bluevisby.com/',
  'Speed optimisation reducing voyage emissions 10-15%.', 'tool', 'MODERATE', 'Operational efficiency tool — immediate emissions reduction without hardware changes.',
  ARRAY['speed optimisation','emissions','voyage','software'], 'Digital platform optimising vessel speed profiles to reduce voyage emissions by 10-15% without hardware modifications.', 'Speed optimisation tools offer immediate emissions reductions for ocean freight. Forwarders can ask carriers about Blue Visby or similar tools when clients request lower-carbon shipping options.',
  ARRAY['10-15% emission reduction per voyage','No hardware changes required','AI-driven speed profile optimisation'], ARRAY['ocean'],
  'corridors', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'a1', 'air', 'CORSIA & International', 'CORSIA (ICAO)', 'https://www.icao.int/environmental-protection/CORSIA/Pages/default.aspx',
  'Carbon offsetting for international aviation. Mandatory from 2027.', 'framework', 'CRITICAL', 'Global offsetting costs embedded in air cargo rates from 2027 mandatory phase.',
  ARRAY['CORSIA','offsetting','ICAO','2027'], 'ICAO''s Carbon Offsetting and Reduction Scheme for International Aviation — a global market-based measure for international flights.', 'CORSIA offset costs flow through to air cargo rates on international routes. Live events freight forwarders must factor offset costs into air freight quotes, especially for time-critical show equipment and high-value touring cargo.',
  ARRAY['Pilot phase 2021-2023','First phase 2024-2026, mandatory from 2027','Airlines offset growth above 2019 baseline','~$5-15/tonne CO2 offset price','Covers ~85% of international aviation emissions'], ARRAY['air'],
  'emissions', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'a2', 'air', 'CORSIA & International', 'EU Aviation ETS', 'https://climate.ec.europa.eu/eu-action/transport/reducing-emissions-aviation_en',
  'Aviation in EU ETS since 2012. Free allowances out by 2026. Scope expanding.', 'regulation', 'CRITICAL', 'Intra-EEA carbon costs already in rates; scope expansion would transform transatlantic air cargo pricing.',
  ARRAY['ETS','aviation','intra-EEA','2027'], 'EU Emissions Trading System applied to aviation — currently intra-EEA flights, expanding to 50% of international flights from 2027.', 'All intra-European air freight already carries ETS carbon cost. Scope expansion to international flights would significantly increase transatlantic and EU-Asia air cargo rates used for live events touring equipment.',
  ARRAY['Aviation in EU ETS since 2012','Free allowances phased out by 2026','Intra-EEA + 50% international from 2027','Full auctioning from 2026'], ARRAY['air'],
  'emissions', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'a3', 'air', 'CORSIA & International', 'ReFuelEU Aviation', 'https://transport.ec.europa.eu/transport-modes/air/fuel/refueleu-aviation_en',
  'SAF blending: 2% by 2025, 6% by 2030, 70% by 2050. All EU airports.', 'regulation', 'CRITICAL', 'Mandatory SAF blend directly increases air cargo fuel surcharges at all EU airports.',
  ARRAY['SAF','EU airports','blending','fuel cost'], 'EU regulation mandating minimum Sustainable Aviation Fuel blending percentages for all fuel uplifted at EU airports.', 'Every air cargo uplift at EU airports carries a SAF cost premium. Event logistics operators must pass through SAF surcharges and compare EU vs non-EU routing costs for time-sensitive show freight.',
  ARRAY['2% SAF mandate from Jan 2025','6% by 2030, 20% by 2035, 70% by 2050','Applies to ALL fuel uplifted at EU airports','Includes 0.7% synthetic fuel requirement'], ARRAY['air'],
  'fuels', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'a4', 'air', 'CORSIA & International', 'UK SAF Mandate', 'https://www.gov.uk/government/publications/sustainable-aviation-fuel-mandate',
  'UK: 2% SAF from 2025, 10% by 2030, 22% by 2040.', 'regulation', 'HIGH', 'Independent UK mandate means separate SAF surcharge layer for UK-departing event freight.',
  ARRAY['UK','SAF','mandate','2025'], 'UK''s independent Sustainable Aviation Fuel mandate applying to all UK-departing flights.', 'Post-Brexit UK has its own SAF mandate with different targets than the EU. Freight forwarders routing through UK airports face a separate surcharge structure — important for London-based event logistics.',
  ARRAY['2% SAF blend from 2025','10% by 2030, 22% by 2040','Applies to UK-departing flights','Separate from EU ReFuelEU'], ARRAY['air'],
  'fuels', 'uk',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'a5', 'air', 'CORSIA & International', 'SAFA (Sustainable Air Freight Alliance)', 'https://www.safa.aero/',
  'Industry body promoting SAF adoption for air cargo.', 'initiative', 'HIGH', 'Industry coalition driving SAF procurement — member commitments affect tender requirements.',
  ARRAY['SAFA','SAF','air cargo','industry'], 'Industry alliance promoting SAF adoption specifically for air cargo operations and Scope 3 accounting.', 'SAFA member companies increasingly require SAF usage in cargo tenders. Understanding alliance commitments helps freight forwarders anticipate client requirements for sustainable air logistics.',
  ARRAY['SAF procurement coalition','Scope 3 air cargo accounting','Member shipper commitments','Book-and-claim mechanisms'], ARRAY['air'],
  'reporting', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'a6', 'air', 'Emissions Accounting', 'ICAO Carbon Calculator', 'https://www.icao.int/environmental-protection/CarbonOffset/Pages/default.aspx',
  'Official methodology for aviation CO2 per cargo tonne.', 'tool', 'MODERATE', 'Standard calculator for air freight emissions — baseline for client reporting.',
  ARRAY['ICAO','calculator','CO2','methodology'], 'ICAO''s official methodology and calculator for quantifying aviation CO2 emissions per passenger or cargo tonne-kilometre.', 'Standard reference for air freight emissions calculations. Freight forwarders use this as baseline methodology when responding to client emissions data requests for air cargo shipments.',
  ARRAY['Official ICAO methodology','Per-tonne-km emission factors','Route-specific calculations','Accepted by CORSIA'], ARRAY['air'],
  'reporting', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'a7', 'air', 'Emissions Accounting', 'GLEC Framework (Air Freight)', 'https://www.smartfreightcentre.org/en/how-to-implement-glec-framework/',
  'ISO 14083-aligned air freight emissions accounting.', 'standard', 'HIGH', 'Industry standard methodology for logistics emissions — required in client tenders.',
  ARRAY['GLEC','ISO 14083','air freight','emissions'], 'Smart Freight Centre''s Global Logistics Emissions Council framework for calculating air freight emissions, aligned with ISO 14083.', 'GLEC is the methodology event logistics specialists actually use for shipment-level air freight emissions. Clients increasingly specify GLEC-compliant reporting in RFPs and tenders.',
  ARRAY['Aligned with ISO 14083','Default emission factors provided','Covers all transport modes','Accreditation programme available'], ARRAY['air'],
  'reporting', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'a8', 'air', 'Emissions Accounting', 'Aviation Week: Sustainability', 'https://aviationweek.com/',
  'Industry news on SAF, fleet transitions, carrier sustainability.', 'news', 'MODERATE', 'Industry intelligence on carrier sustainability moves — informs carrier selection.',
  ARRAY['aviation news','SAF deals','fleet','sustainability'], 'Leading aviation industry publication covering SAF developments, fleet transitions, and carrier sustainability programmes.', 'Trade press intelligence on which carriers are investing in SAF, ordering efficient aircraft, and setting sustainability targets — useful for carrier selection and client advisory.',
  ARRAY['SAF deal tracking','Fleet transition news','Carrier sustainability programmes','Regulatory analysis'], ARRAY['air'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'l1', 'land', 'EU & European Standards', 'EU CO2 Standards for Heavy Trucks', 'https://climate.ec.europa.eu/eu-action/transport/road-transport-reducing-co2-emissions-vehicles/co2-emission-performance-standards-heavy-duty-vehicles_en',
  '45% CO2 cut by 2030, 65% by 2035, 90% by 2040 vs 2019.', 'regulation', 'CRITICAL', 'Aggressive truck CO2 targets will reshape European road freight fleet composition and costs.',
  ARRAY['CO2 trucks','EU','2030','2040'], 'EU regulation setting CO2 emission performance standards for new heavy-duty vehicles with declining targets to 2040.', 'These targets determine when diesel trucks are phased out of European fleets. Live events freight forwarders relying on road transport for last-mile delivery and drayage must plan for fleet transition costs from subcontractors.',
  ARRAY['45% CO2 reduction by 2030 vs 2019','65% by 2035, 90% by 2040','Applies to new truck registrations','Affects all EU road freight subcontractors'], ARRAY['road'],
  'transport', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'l2', 'land', 'EU & European Standards', 'Euro 7 Standard', 'https://ec.europa.eu/commission/presscorner/detail/en/ip_22_6495',
  'New emission limits for trucks. Lower NOx/particulate thresholds.', 'regulation', 'HIGH', 'New pollutant limits affect drayage fleet procurement and LEZ access across EU.',
  ARRAY['Euro 7','NOx','particulates','trucks'], 'EU regulation setting new pollutant emission limits for vehicles including heavy-duty trucks, tightening NOx and particulate standards.', 'Non-compliant vehicles face Low Emission Zone restrictions across European cities — critical for last-mile event freight delivery. Subcontractor fleet compliance must be verified.',
  ARRAY['Tightens NOx by ~56% vs Euro VI','Includes brake and tyre particle emissions','Battery durability requirements','Applies to new vehicles from 2027'], ARRAY['road'],
  'transport', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'l3', 'land', 'EU & European Standards', 'EU AFIR (Alt Fuels Infrastructure)', 'https://transport.ec.europa.eu/transport-modes/road/infrastructure/alternative-fuels-infrastructure_en',
  'Mandatory EV charging + H2 refuelling every 60km on TEN-T by 2025-2027.', 'regulation', 'HIGH', 'Infrastructure rollout determines ZEV fleet feasibility for European road freight.',
  ARRAY['AFIR','EV charging','hydrogen','TEN-T'], 'EU regulation mandating deployment of EV charging and hydrogen refuelling infrastructure along the trans-European transport network.', 'Infrastructure availability determines whether zero-emission road freight is viable on specific corridors. Forwarders must track rollout to assess which routes can support electric trucks.',
  ARRAY['EV charging every 60km on TEN-T core by 2025','H2 refuelling every 200km by 2030','Minimum 350kW per charging station'], ARRAY['road'],
  'corridors', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'l4', 'land', 'EU & European Standards', 'CER (European Railways)', 'https://www.cer.be/',
  'EU rail decarbonisation, electrification targets, modal shift.', 'industry', 'MODERATE', 'Rail modal shift economics directly relevant when clients ask for lower-carbon alternatives.',
  ARRAY['rail','modal shift','electrification','EU'], 'Community of European Railways promoting rail decarbonisation and modal shift from road to rail.', 'Rail offers significantly lower emissions per tonne-km than road. When clients request green logistics options, rail alternatives for event equipment can reduce carbon footprint by 60-80%.',
  ARRAY['Rail produces ~75% less CO2 than road per tkm','EU electrification targets','Modal shift incentive programmes'], ARRAY['road'],
  'corridors', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'l5', 'land', 'EU & European Standards', 'European Clean Trucking Alliance', 'https://cleantruckingalliance.org/',
  'Advocacy for rapid ZEV truck adoption in Europe.', 'initiative', 'MODERATE', 'Tracks EU legislative progress on heavy-duty vehicle standards.',
  ARRAY['ZEV trucks','advocacy','Europe'], 'Advocacy coalition pushing for accelerated zero-emission truck adoption across Europe.', 'Policy signals from this alliance indicate direction of EU truck regulations. Useful for anticipating fleet transition timelines.',
  ARRAY['EU ZEV truck advocacy','Legislative progress tracking','Industry position papers'], ARRAY['road'],
  'transport', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'l6', 'land', 'US Standards', 'EPA Heavy-Duty Phase 3 Rule', 'https://www.epa.gov/regulations-emissions-vehicles-and-engines/heavy-duty-vehicle-greenhouse-gas-phase-3-standards',
  'GHG standards for MY2027-2032; ~60% new sleeper cabs ZEV by 2032.', 'regulation', 'HIGH', 'Stringent US truck standards under political uncertainty — affects drayage and interstate fleet planning.',
  ARRAY['EPA','Phase 3','GHG','trucks'], 'EPA''s stringent GHG performance standards for heavy-duty trucks covering model years 2027-2032.', 'These standards determine the US truck fleet transition timeline. Freight forwarders with US operations must plan for drayage fleet changes, especially at West Coast ports handling event equipment imports.',
  ARRAY['~60% of new sleeper cabs ZEV by 2032','Model years 2027-2032','Under political review — regulatory uncertainty','Affects Class 7-8 trucks'], ARRAY['road'],
  'transport', 'us',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'l7', 'land', 'US Standards', 'CARB Advanced Clean Trucks', 'https://ww2.arb.ca.gov/our-work/programs/advanced-clean-trucks',
  'California: 55% Class 4-8 ZEV sales by 2035. 12 states following.', 'regulation', 'HIGH', 'CARB rules control US West Coast port drayage — non-compliance means no port access.',
  ARRAY['CARB','ZEV','California','drayage'], 'California Air Resources Board mandate requiring increasing percentages of new truck sales to be zero-emission.', 'All drayage at LA/Long Beach — the primary US gateway for event equipment — must comply. Non-compliant trucks face port access restrictions. 12+ states follow California''s rules.',
  ARRAY['55% of Class 4-8 sales ZEV by 2035','12+ Section 177 states following CA','Federal waiver disputes ongoing'], ARRAY['road'],
  'transport', 'us',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'l8', 'land', 'US Standards', 'Drive Electric: Zero-Emission Freight', 'https://driveelectric.gov/',
  'US federal ZEV infrastructure funding and grant programmes.', 'tool', 'MODERATE', 'Federal funding programmes for fleet electrification — relevant for US subcontractor readiness.',
  ARRAY['federal','grants','electrification','US'], 'US federal government portal for zero-emission vehicle infrastructure funding and fleet electrification grants.', 'Federal grants can offset fleet transition costs for US road freight subcontractors. Understanding available programmes helps evaluate subcontractor investment timelines.',
  ARRAY['Federal ZEV infrastructure funding','Fleet electrification grants','National charging network plans'], ARRAY['road'],
  'fuels', 'us',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'l9', 'land', 'US Standards', 'American Trucking Associations', 'https://www.trucking.org/environment',
  'Industry positions on EPA rules, clean truck programmes.', 'industry', 'MODERATE', 'Industry body positions signal how US trucking will respond to ZEV mandates.',
  ARRAY['ATA','industry','EPA','clean trucks'], 'American Trucking Associations'' environment programme covering industry response to EPA regulations and clean truck programmes.', 'ATA positions indicate how the US trucking industry will respond to regulations — important context for freight forwarders managing US subcontractor relationships.',
  ARRAY['Industry positions on EPA rules','Clean truck programme advocacy','Fuel efficiency standards input'], ARRAY['road'],
  'research', 'us',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'l10', 'land', 'US Standards', 'DOT National Freight Strategic Plan', 'https://www.transportation.gov/freight/',
  'US multimodal freight policy including sustainability.', 'framework', 'MODERATE', 'Federal freight strategy sets priorities for infrastructure investment affecting routing decisions.',
  ARRAY['DOT','multimodal','freight','strategy'], 'US Department of Transportation''s national strategic plan for multimodal freight including sustainability components.', 'Federal freight strategy influences infrastructure investment that affects routing options. Useful background for US freight planning.',
  ARRAY['Multimodal freight policy','Sustainability components','Infrastructure investment priorities'], ARRAY['road'],
  'corridors', 'us',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  't1', 'cbam', 'EU CBAM', 'EU CBAM', 'https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism_en',
  'Carbon price on imported cement, steel, aluminium, fertilisers, electricity, hydrogen. Definitive phase from Jan 2026. Omnibus simplified: 50t de minimis, certificates from Feb 2027.', 'regulation', 'CRITICAL', 'CBAM definitive phase NOW — customs documentation and carbon costs on all covered EU imports. Direct operational impact for staging equipment containing steel/aluminium.',
  ARRAY['CBAM','EU imports','customs','carbon border','2026','de minimis'], 'EU''s Carbon Border Adjustment Mechanism imposing carbon costs on imports of carbon-intensive goods entering the EU. Omnibus simplification adopted Oct 2025.', 'CBAM creates new customs documentation for EU-bound freight. Event staging with steel/aluminium, film production rigs, automotive components, and humanitarian equipment using covered materials all affected. Only authorised CBAM declarants can import from Jan 2026. Freight forwarders must verify CBAM registration numbers before customs clearance.',
  ARRAY['Definitive phase: Jan 2026','Certificates purchase: from Feb 2027','50-tonne de minimis exemption (Omnibus)','Annual declaration by 30 Sep (was 31 May)','Downstream products expansion proposed for 2028','Delegated acts on 3rd-country carbon price still pending'], ARRAY['air','ocean','road'],
  'emissions', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  't2', 'cbam', 'EU CBAM', 'WTO Environment & Trade', 'https://www.wto.org/english/tratop_e/envir_e/envir_e.htm',
  'WTO compatibility of carbon border measures; trade dispute monitoring.', 'framework', 'HIGH', 'WTO challenges to CBAM could reshape global trade-linked climate rules.',
  ARRAY['WTO','trade','environment','disputes'], 'WTO''s framework governing the intersection of trade rules and environmental measures like carbon border adjustments.', 'If CBAM faces WTO challenges, outcomes affect long-term trade flows. Freight forwarders need background intelligence on dispute trajectories affecting cross-border carbon pricing.',
  ARRAY['GATT Article XX exceptions','CBAM WTO compatibility under scrutiny','Trade facilitation and environment'], ARRAY['air','ocean','road'],
  'emissions', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  't3', 'cbam', 'EU CBAM', 'OECD Environment', 'https://www.oecd.org/environment/',
  'Carbon pricing tracker across 70+ jurisdictions.', 'data', 'HIGH', 'Cross-jurisdictional carbon pricing comparison essential for route cost modelling.',
  ARRAY['OECD','carbon pricing','effective rates'], 'OECD''s environmental division tracking carbon pricing instruments and effective carbon rates across 70+ jurisdictions.', 'Effective carbon rates vary dramatically by jurisdiction. This data helps freight forwarders compare routing options based on carbon cost exposure.',
  ARRAY['70+ jurisdictions tracked','Effective Carbon Rates database','Policy implementation analysis'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  't4', 'cbam', 'EU CBAM', 'UNCTAD Sustainable Transport', 'https://unctad.org/topic/transport-and-trade-logistics/sustainable-freight-transport',
  'How carbon pricing affects trade competitiveness and shipping costs.', 'analysis', 'HIGH', 'UN analysis of carbon pricing impacts on freight trade competitiveness.',
  ARRAY['UNCTAD','trade','carbon','shipping costs'], 'UN Conference on Trade and Development tracking how carbon pricing affects trade competitiveness and shipping cost structures.', 'UNCTAD analysis shows how carbon pricing differentials between jurisdictions create trade distortions that affect routing economics.',
  ARRAY['Carbon pricing trade impact analysis','Shipping cost structure changes','Developing country vulnerability','Trade competitiveness effects'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  't5', 'cbam', 'Carbon Pricing', 'World Bank Carbon Pricing Dashboard', 'https://carbonpricingdashboard.worldbank.org/',
  'Live tracker of 73 carbon pricing instruments, 23% of global GHG.', 'data', 'CRITICAL', 'Global carbon price intelligence essential for forward pricing across all trade lanes.',
  ARRAY['carbon pricing','ETS','global','dashboard'], 'World Bank dashboard tracking all operational carbon pricing instruments worldwide — ETS markets and carbon taxes.', 'Carbon prices affect freight costs differently by jurisdiction. This is the essential tool for comparing carbon cost exposure across routing options and building forward pricing models.',
  ARRAY['73+ instruments tracked','Covers 23% of global GHG emissions','ETS price data updated regularly','Revenue tracking by jurisdiction'], ARRAY['air','ocean','road'],
  'emissions', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  't6', 'cbam', 'Carbon Pricing', 'ICAP ETS Map', 'https://icapcarbonaction.com/en/ets',
  'International Carbon Action Partnership — comprehensive ETS tracker.', 'tracker', 'HIGH', 'Most detailed ETS status tracker globally — covers all operational and planned schemes.',
  ARRAY['ICAP','ETS','global','carbon market'], 'International Carbon Action Partnership providing comprehensive status tracking of emissions trading systems worldwide.', 'Detailed ETS status information for every jurisdiction helps freight forwarders understand where carbon costs are rising and plan accordingly.',
  ARRAY['All operational ETS mapped','Planned and under-development schemes','Price tracking and comparison','Policy design features'], ARRAY['air','ocean','road'],
  'emissions', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  't7', 'cbam', 'Carbon Pricing', 'GEF (Global Environment Facility)', 'https://www.thegef.org/',
  'Environmental financing for developing markets.', 'finance', 'MODERATE', 'Financing for developing-market carbon commitments affects long-term trade lane carbon costs.',
  ARRAY['GEF','financing','developing markets'], 'Multilateral financing mechanism for environmental projects in developing countries.', 'GEF-funded programmes in developing markets can create new environmental requirements on trade lanes used for event logistics.',
  ARRAY['Environmental project financing','Developing market focus','Carbon market capacity building'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'c1', 'compliance', 'EU Mandatory Reporting', 'CSRD', 'https://finance.ec.europa.eu/capital-markets-union-and-financial-markets/company-reporting-and-auditing/company-reporting/corporate-sustainability-reporting_en',
  'Mandatory ESG reporting. Post-Omnibus: 1,000+ employees mandatory, 250-1,000 voluntary opt-in. Scope 1/2/3 required. Assurance shifted from reasonable to limited.', 'regulation', 'CRITICAL', 'CSRD drives client data requests — even if forwarders are below threshold, clients in scope demand Scope 3 transport data.',
  ARRAY['CSRD','reporting','EU','Scope 3','Omnibus'], 'EU Corporate Sustainability Reporting Directive requiring comprehensive sustainability disclosure including value chain emissions. Omnibus simplification adopted Feb 2026.', 'Even if a freight forwarder falls below the 1,000-employee Omnibus threshold, major clients subject to CSRD will require Scope 3 transport emissions data from logistics partners. The voluntary opt-in for 250-1,000 employee companies means some mid-size clients may CHOOSE to report, creating data requests even from below-threshold companies.',
  ARRAY['Post-Omnibus threshold: 1,000 employees mandatory','Voluntary opt-in: 250-1,000 employees','~5,000 companies in mandatory scope (was ~50,000)','ESRS standards require Scope 1, 2, 3','Assurance: limited (was moving to reasonable)','Wave 2 delayed by 2 years','Value chain (logistics) data still mandatory'], ARRAY['air','ocean','road'],
  'reporting', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'c2', 'compliance', 'EU Mandatory Reporting', 'EU Taxonomy', 'https://finance.ec.europa.eu/sustainable-finance/tools-and-standards/eu-taxonomy-sustainable-activities_en',
  'Classification of ''green'' economic activities. Transport categories defined.', 'regulation', 'HIGH', 'Taxonomy alignment unlocks green financing and client sustainable supply chain claims.',
  ARRAY['taxonomy','green finance','EU','classification'], 'EU classification system defining which economic activities qualify as environmentally sustainable for investment and disclosure.', 'If freight operations qualify as taxonomy-aligned, this unlocks green financing and allows clients to count logistics services toward their sustainable supply chain targets.',
  ARRAY['6 environmental objectives','Transport-specific technical criteria','Links to CSRD/ESRS reporting','Investor disclosure requirements'], ARRAY['air','ocean','road'],
  'reporting', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'c3', 'compliance', 'EU Mandatory Reporting', 'GRI Standards', 'https://www.globalreporting.org/',
  'Most widely used voluntary ESG framework globally.', 'standard', 'HIGH', 'Baseline for CSRD-aligned reporting — many clients already report using GRI.',
  ARRAY['GRI','ESG','voluntary','reporting'], 'Global Reporting Initiative standards — the most widely adopted voluntary sustainability reporting framework worldwide.', 'Many clients already use GRI for sustainability reporting. Understanding GRI indicators helps freight forwarders prepare data in formats clients need.',
  ARRAY['Most widely used ESG framework globally','Baseline for CSRD-aligned reporting','Transport-specific disclosure indicators'], ARRAY['air','ocean','road'],
  'reporting', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'c4', 'compliance', 'Emissions Accounting Standards', 'ISO 14083', 'https://www.iso.org/standard/78864.html',
  'International standard for transport chain GHG emissions. Effective 2023.', 'standard', 'CRITICAL', 'ISO 14083 is becoming the mandatory calculation methodology referenced by regulation and tenders.',
  ARRAY['ISO 14083','calculation','transport','GHG'], 'International standard providing methodology for calculating and reporting GHG emissions from transport chain operations.', 'ISO 14083 is the calculation methodology behind GLEC Framework and increasingly referenced in EU regulation. Freight forwarders must ensure emissions calculations are compliant for client reporting and regulatory requirements.',
  ARRAY['Published March 2023, replaces EN 16258','Covers all transport modes','Referenced by EU CountEmissions regulation','GLEC Framework v3 aligned'], ARRAY['air','ocean','road'],
  'reporting', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'c5', 'compliance', 'Emissions Accounting Standards', 'GLEC Framework v3', 'https://www.smartfreightcentre.org/en/how-to-implement-glec-framework/',
  'Industry standard for logistics emissions. Used for Scope 3 Cat 4 reporting.', 'standard', 'CRITICAL', 'The practical methodology freight forwarders actually use for shipment-level emissions calculations.',
  ARRAY['GLEC','emissions','Scope 3','RFQ'], 'Smart Freight Centre''s Global Logistics Emissions Council framework — the industry standard calculation methodology for logistics emissions.', 'GLEC is the tool event logistics specialists actually use to calculate shipment-level emissions. Clients increasingly specify GLEC-compliant reporting in tenders and RFPs. Essential for competitive positioning.',
  ARRAY['Version 3.2 (October 2025)','Aligned with ISO 14083','Default emission factors provided','Required in major shipper RFPs'], ARRAY['air','ocean','road'],
  'reporting', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'c6', 'compliance', 'Emissions Accounting Standards', 'GHG Protocol', 'https://ghgprotocol.org/',
  'Foundation for all corporate carbon accounting. Scope 1/2/3.', 'standard', 'HIGH', 'Category 4 (upstream transport) makes freight forwarders a Scope 3 source for virtually all clients.',
  ARRAY['GHG Protocol','Scope 3','Category 4'], 'WRI/WBCSD standard defining Scope 1, 2, and 3 emissions categories — the foundation for all corporate carbon accounting.', 'GHG Protocol Category 4 (Upstream transportation) is exactly what freight forwarders provide. Every client doing Scope 3 reporting needs logistics partners to supply emissions data in GHG Protocol format.',
  ARRAY['Category 4: Upstream transportation','Category 9: Downstream transportation','Under revision (2024-2025)','Foundation for CSRD/ISSB reporting'], ARRAY['air','ocean','road'],
  'reporting', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'c7', 'compliance', 'Emissions Accounting Standards', 'SBTi', 'https://sciencebasedtargets.org/',
  'Corporate net-zero target validation. Transport sector guidance.', 'guidance', 'HIGH', 'SBTi targets appear in client tenders — forwarders must understand methodology to respond credibly.',
  ARRAY['SBTi','targets','net-zero','tenders'], 'Science Based Targets initiative validating corporate emissions reduction targets aligned with climate science.', 'Client RFPs increasingly require logistics partners to hold or be working toward SBTi-validated targets. Understanding the methodology is essential for credible tender responses.',
  ARRAY['Near-term (5-10 year) targets','Long-term (2050) targets','Transport sector pathway defined','Increasingly required in freight tenders'], ARRAY['air','ocean','road'],
  'reporting', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'c8', 'compliance', 'Emissions Accounting Standards', 'ISSB IFRS S2', 'https://www.ifrs.org/groups/international-sustainability-standards-board/',
  'Global climate disclosure baseline. 20+ jurisdictions mandating.', 'standard', 'HIGH', 'ISSB adoption globally means converging disclosure demands from clients in all jurisdictions.',
  ARRAY['ISSB','IFRS S2','global','climate'], 'IFRS Sustainability Standards Board''s climate disclosure standard being adopted by 20+ jurisdictions as mandatory reporting baseline.', 'As jurisdictions worldwide adopt ISSB, freight forwarders face converging data requests from clients globally — not just in the EU. Data systems must be globally interoperable.',
  ARRAY['S2: Climate-related disclosures','20+ jurisdictions mandating','Scope 3 including freight required','Singapore adoption FY2026'], ARRAY['air','ocean','road'],
  'reporting', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'c9', 'compliance', 'Supply Chain Data', 'CDP Supply Chain', 'https://www.cdp.net/en/supply-chain',
  '700+ purchasing orgs requesting supplier emissions data. Forwarders scored.', 'tool', 'HIGH', 'CDP is the primary channel through which clients formally request emissions data from logistics suppliers.',
  ARRAY['CDP','supply chain','data requests'], 'CDP''s programme through which purchasing organisations formally request environmental performance data from their suppliers.', 'Over 700 purchasing organisations use CDP to request data from suppliers. Freight forwarders increasingly receive direct CDP questionnaires or must provide data that clients report through CDP.',
  ARRAY['700+ purchasing organisations requesting','26,000+ companies disclosing','Annual questionnaire cycle (Feb-July)','Scoring A to D-'], ARRAY['air','ocean','road'],
  'reporting', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'c10', 'compliance', 'Supply Chain Data', 'EcoVadis', 'https://ecovadis.com/',
  'Supplier sustainability scorecards. Freight forwarder ratings affect contracts.', 'tool', 'HIGH', 'EcoVadis scores directly gate contract eligibility with major shippers and event companies.',
  ARRAY['EcoVadis','ratings','supplier','contracts'], 'Sustainability rating platform used by global brands to assess and score supplier ESG performance.', 'EcoVadis scores directly affect contract eligibility. Major event companies and brands require minimum scores from logistics suppliers. A poor rating can mean losing business.',
  ARRAY['Supplier sustainability scorecards','Scores affect contract eligibility','Global brands require minimum ratings','Annual assessment cycle'], ARRAY['air','ocean','road'],
  'reporting', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'c11', 'compliance', 'Supply Chain Data', 'EcoVadis Blog', 'https://ecovadis.com/blog/',
  'Methodology changes, regulatory impacts on supply chain ESG.', 'news', 'MODERATE', 'Tracks methodology updates that change how freight forwarders are scored.',
  ARRAY['EcoVadis','methodology','trends'], 'Updates on supplier sustainability rating trends, methodology changes, and regulatory impacts.', 'Methodology changes can shift scoring criteria. Staying current helps freight forwarders maintain or improve their rating.',
  ARRAY['Rating methodology updates','Regulatory impact analysis','Best practice guidance'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g1', 'global', 'EU Policy', 'EU Fit for 55 Package', 'https://www.consilium.europa.eu/en/policies/green-deal/fit-for-55-the-eu-plan-for-a-green-transition/',
  'Umbrella of 13 laws: ETS, CBAM, ReFuelEU, FuelEU, truck CO2 standards.', 'package', 'CRITICAL', 'Parent package of every major EU climate regulation affecting freight — the single reference point.',
  ARRAY['Fit for 55','EU','Green Deal','umbrella'], 'EU''s umbrella legislative package of 13 interconnected measures targeting 55% GHG reduction by 2030.', 'This is the parent package containing ETS expansion, CBAM, ReFuelEU Aviation, FuelEU Maritime, and truck CO2 standards. Every major EU regulation affecting freight traces back here.',
  ARRAY['13 interconnected legislative measures','55% GHG reduction target by 2030','Parent of ETS, CBAM, FuelEU, ReFuelEU','CO2 truck standards, AFIR included'], ARRAY['air','ocean','road'],
  'emissions', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g2', 'global', 'EU Policy', 'EU PPWR 2025/40', 'https://environment.ec.europa.eu/topics/waste-and-recycling/packaging-and-packaging-waste_en',
  'Replaces 1994 Directive. All packaging recyclable by 2030. Single-use restrictions.', 'regulation', 'CRITICAL', 'Affects ALL EU shipment packaging — every carton, pallet wrap, protective material from Aug 2026.',
  ARRAY['PPWR','packaging','circular economy','2026'], 'EU regulation replacing the 1994 Packaging Directive with directly applicable rules on recyclability, reuse, and material restrictions.', 'Every piece of packaging on every EU-bound shipment must comply — cartons, pallet wrap, protective materials, exhibition crating. Non-compliant packaging may be rejected at EU borders. Critical for event staging, exhibition freight, and merchandise logistics.',
  ARRAY['In force: 11 Feb 2025, applies: 12 Aug 2026','All packaging recyclable by 2030','PFAS restrictions in food-contact packaging','Single-use restrictions','Reuse targets for transport packaging'], ARRAY['air','ocean','road'],
  'packaging', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g3', 'global', 'EU Policy', 'EEA (European Environment Agency)', 'https://www.eea.europa.eu/',
  'EU environmental data portal; transport emission trends.', 'data', 'HIGH', 'Official EU environmental data — policy progress tracking for transport sector.',
  ARRAY['EEA','data','EU','transport emissions'], 'EU agency providing environmental data, transport emission trends, and policy implementation tracking.', 'Official data source for EU transport emission trends and policy progress — useful for client briefings and benchmarking.',
  ARRAY['Transport emission trend data','Policy progress tracking','Indicator-based assessments'], ARRAY['air','ocean','road'],
  'research', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g4', 'global', 'EU Policy', 'EUR-Lex', 'https://eur-lex.europa.eu/',
  'Official EU legislation database — primary source for all regulations.', 'legal', 'HIGH', 'Daily EU law publication catches new delegated acts before industry sources.',
  ARRAY['EUR-Lex','EU law','legislation','primary'], 'Official Journal of the European Union and full legislation database — the authoritative source for all EU law.', 'Fastest official source for new EU environmental regulations. RSS monitoring catches delegated acts, implementing measures, and amendments as they publish.',
  ARRAY['Published daily','RSS feed available','All EU legislation searchable','Free public access'], ARRAY['air','ocean','road'],
  'research', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g5', 'global', 'EU Policy', 'European Clean Trucking Alliance', 'https://cleantruckingalliance.org/',
  'EU ZEV truck advocacy; legislative progress tracking.', 'initiative', 'MODERATE', 'Tracks EU legislative progress on heavy-duty vehicle standards.',
  ARRAY['ZEV trucks','EU','advocacy'], 'Coalition advocating for zero-emission truck standards in the EU; tracks legislative progress.', 'Useful for monitoring EU truck regulation development and policy signals.',
  ARRAY['EU ZEV truck legislative tracking','Industry coalition positions'], ARRAY['road'],
  'transport', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g6', 'global', 'EU Policy', 'UK DfT Decarbonisation', 'https://www.gov.uk/government/organisations/department-for-transport',
  'UK post-Brexit transport decarbonisation; independent SAF mandate, ZEV targets.', 'regulator', 'HIGH', 'Independent UK regulatory path post-Brexit means separate compliance requirements.',
  ARRAY['UK','DfT','post-Brexit','transport'], 'UK Department for Transport''s decarbonisation policy including independent SAF mandate and ZEV targets post-Brexit.', 'Post-Brexit UK has its own transport decarbonisation path. Freight forwarders serving UK events face separate compliance requirements from the EU.',
  ARRAY['Independent SAF mandate','ZEV targets','Port strategies','Separate from EU regulation'], ARRAY['air','ocean','road'],
  'transport', 'uk',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g7', 'global', 'EU Policy', 'Germany BMDV', 'https://www.bmdv.bund.de/EN/Home/home.html',
  'German federal transport; hydrogen corridors, LNG/NH3 shipping.', 'regulator', 'MODERATE', 'Germany leads EU on hydrogen corridors — signals infrastructure investment.',
  ARRAY['Germany','BMDV','hydrogen','transport'], 'German federal transport ministry leading on hydrogen corridor development and alternative maritime fuel infrastructure.', 'Germany''s hydrogen corridor investments affect infrastructure availability for green freight across Central Europe.',
  ARRAY['Hydrogen corridor development','LNG/NH3 shipping infrastructure','TEN-T investment'], ARRAY['air','ocean','road'],
  'transport', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g8', 'global', 'US Regulatory', 'EPA SmartWay', 'https://www.epa.gov/smartway',
  'US freight carrier certification. Required by major shippers. 3,500+ carriers.', 'certification', 'HIGH', 'Required by many US shippers for carrier qualification — effectively mandatory for US freight contracts.',
  ARRAY['SmartWay','EPA','US','certification'], 'EPA''s voluntary freight carrier environmental certification programme used by major US shippers for carrier selection.', 'SmartWay certification is effectively mandatory for major US freight contracts. Over 3,500 carriers enrolled. Event logistics operators need certification to serve US shippers requiring it.',
  ARRAY['3,500+ carriers enrolled','Required by major US shippers','Scope 3 reporting support','Annual reporting requirement'], ARRAY['road'],
  'reporting', 'us',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g9', 'global', 'US Regulatory', 'Sustainable Packaging Coalition', 'https://sustainablepackaging.org/',
  'US packaging sustainability standards; How2Recycle label.', 'standard', 'HIGH', 'US packaging standards for event merchandise and goods — How2Recycle label increasingly required.',
  ARRAY['SPC','packaging','How2Recycle','US'], 'US-led industry coalition setting packaging sustainability standards including the How2Recycle labelling system.', 'How2Recycle labels are increasingly required on event merchandise and goods packaging entering the US market.',
  ARRAY['How2Recycle label system','US packaging sustainability standards','Material circularity guidelines'], ARRAY['air','ocean','road'],
  'packaging', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g10', 'global', 'US Regulatory', 'NREL Transportation', 'https://www.nrel.gov/transportation/',
  'US DOE lab: ZEV trucks, hydrogen, SAF, freight electrification R&D.', 'research', 'HIGH', 'National lab R&D signals which green freight technologies will become commercially viable.',
  ARRAY['NREL','DOE','R&D','ZEV'], 'US National Renewable Energy Laboratory''s transportation research covering zero-emission trucks, hydrogen, SAF, and freight electrification.', 'NREL research signals which green freight technologies will reach commercial viability and when — essential for infrastructure planning.',
  ARRAY['ZEV truck testing and validation','Hydrogen fuel cell research','SAF technology pathways','Fleet electrification analysis'], ARRAY['air','ocean','road'],
  'research', 'us',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g11', 'global', 'US Regulatory', 'CEC North American Env Policy', 'https://www.cec.org/',
  'Canada-Mexico-US trilateral environmental cooperation.', 'framework', 'MODERATE', 'Trilateral cooperation affects cross-border freight environmental standards.',
  ARRAY['CEC','NAFTA','trilateral','environment'], 'Commission for Environmental Cooperation — Canada-Mexico-US trilateral body for environmental policy coordination.', 'Cross-border environmental standards affect USMCA freight operations.',
  ARRAY['Trilateral environmental cooperation','Cross-border freight standards'], ARRAY['air','ocean','road'],
  'research', 'us',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g12', 'global', 'US Regulatory', 'ECLAC (UN Latin America)', 'https://www.cepal.org/en',
  'UN ECLAC transport logistics data for Latin America.', 'data', 'MODERATE', 'LatAm logistics data for event freight routing through Brazil, Chile, Mexico.',
  ARRAY['ECLAC','LatAm','logistics','UN'], 'UN Economic Commission for Latin America tracking transport logistics data across the region.', 'Critical data source for event freight routing through Latin American markets.',
  ARRAY['LatAm transport logistics data','Infrastructure analysis','Trade facilitation tracking'], ARRAY['air','ocean','road'],
  'research', 'latam',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g13', 'global', 'Latin America', 'Brazil Logística Reversa', 'https://www.gov.br/mma/pt-br/assuntos/agendaambientalurbana/logistica-reversa',
  'Mandatory take-back for packaging, electronics, event materials.', 'regulation', 'HIGH', 'Brazil reverse logistics law directly affects event freight packaging and equipment entering Brazil.',
  ARRAY['Brazil','reverse logistics','packaging','take-back'], 'Brazil''s reverse logistics law requiring mandatory take-back programmes for packaging, electronics, and specified materials.', 'Mandatory take-back applies to event staging materials, packaging, and electronics entering Brazil — a key market for live events and touring. Freight forwarders must ensure compliance documentation.',
  ARRAY['Mandatory take-back for packaging','Electronics recycling requirements','Event materials included','Compliance documentation required'], ARRAY['ocean','road'],
  'packaging', 'latam',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g14', 'global', 'Latin America', 'Mexico SEMARNAT', 'https://www.gob.mx/semarnat',
  'Mexico environment ministry; packaging, carbon market, transport.', 'regulator', 'HIGH', 'Mexico environmental requirements affect cross-border event freight packaging and customs.',
  ARRAY['Mexico','SEMARNAT','environment','packaging'], 'Mexico''s environmental ministry overseeing packaging regulations, carbon market development, and transport emissions rules.', 'Mexican environmental requirements affect packaging and customs compliance for cross-border event freight.',
  ARRAY['Packaging regulations','Carbon market development','Transport emissions rules'], ARRAY['air','ocean','road'],
  'emissions', 'latam',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g15', 'global', 'Latin America', 'Colombian Ministry of Transport', 'https://www.mintransporte.gov.co/',
  'Colombia transport policy for Andean event freight.', 'regulator', 'MODERATE', 'Relevant for Andean event freight routing and last-mile compliance.',
  ARRAY['Colombia','transport','Andean'], 'Colombian ministry overseeing transport policy including sustainability requirements.', 'Relevant for event freight routing through Colombia and the Andean region.',
  ARRAY['Transport sustainability policy','Last-mile compliance requirements'], ARRAY['air','ocean','road'],
  'transport', 'latam',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g16', 'global', 'Latin America', 'IDB Sustainable LatAm Transport', 'https://www.iadb.org/en/sectors/transport/overview',
  'IDB green freight corridor funding in Latin America.', 'finance', 'MODERATE', 'Development bank financing for green freight corridors in LatAm event markets.',
  ARRAY['IDB','LatAm','green corridors','financing'], 'Inter-American Development Bank sustainable transport financing including green freight corridor development.', 'IDB-financed green corridors in LatAm can improve infrastructure for event freight operations.',
  ARRAY['Green freight corridor funding','Infrastructure development','Sustainable transport financing'], ARRAY['air','ocean','road'],
  'research', 'latam',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g17', 'global', 'Asia-Pacific', 'MPA Singapore Green Shipping', 'https://www.mpa.gov.sg/maritime-singapore/sustainability',
  'Singapore green fuel bunkering, port incentives. World''s largest bunkering hub.', 'regulator', 'CRITICAL', 'World''s largest bunkering hub — green shipping programme sets standards for Asia-Pacific routing.',
  ARRAY['Singapore','MPA','green shipping','bunkering'], 'Singapore Maritime and Port Authority''s Green Shipping Programme offering incentives for clean fuel bunkering at the world''s largest bunkering hub.', 'Singapore is the primary Asia-Pacific routing hub for ocean freight. MPA''s green shipping incentives and bunkering availability directly affect vessel selection and routing decisions for event cargo to/from Asia.',
  ARRAY['World''s largest bunkering hub','Green fuel availability (LNG, methanol)','Port incentive programmes','Green corridor anchor point'], ARRAY['ocean'],
  'corridors', 'asia',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g18', 'global', 'Asia-Pacific', 'Japan MLIT', 'https://www.mlit.go.jp/en/',
  'Japan transport: shipping decarbonisation, hydrogen port strategy.', 'regulator', 'HIGH', 'Japan''s hydrogen port strategy affects event logistics for Tokyo/Osaka destinations.',
  ARRAY['Japan','MLIT','hydrogen','shipping'], 'Japan Ministry of Land, Infrastructure, Transport and Tourism — shipping decarbonisation and hydrogen port strategy.', 'Japan''s hydrogen port investments and shipping decarbonisation policies affect event logistics for major touring destinations.',
  ARRAY['Hydrogen port strategy','Shipping decarbonisation policy','Green freight programmes'], ARRAY['ocean','road'],
  'transport', 'asia',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g19', 'global', 'Asia-Pacific', 'South Korea MOF', 'https://www.mof.go.kr/eng/index.do',
  'K-ETS includes shipping; ammonia/hydrogen vessel development.', 'regulator', 'HIGH', 'K-ETS carbon costs affect freight operations for Korean touring destinations.',
  ARRAY['Korea','K-ETS','ammonia','shipping'], 'South Korea Ministry of Oceans and Fisheries — K-ETS shipping inclusion and zero-emission vessel development.', 'South Korea''s carbon market includes shipping, and their vessel development programme signals future fuel availability.',
  ARRAY['K-ETS includes shipping','Ammonia vessel programme','Hydrogen development','Green port investments'], ARRAY['ocean'],
  'emissions', 'asia',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g20', 'global', 'Asia-Pacific', 'Singapore Green Plan 2030', 'https://www.greenplan.gov.sg/',
  'Singapore whole-of-government sustainability: maritime, aviation, packaging.', 'framework', 'HIGH', 'Comprehensive sustainability roadmap covering all transport modes through Singapore hub.',
  ARRAY['Singapore','Green Plan','sustainability','2030'], 'Singapore''s comprehensive government sustainability roadmap covering maritime, aviation, packaging, and green buildings.', 'Covers sustainability requirements across all transport modes used by freight forwarders routing through Singapore.',
  ARRAY['Maritime sustainability targets','Aviation decarbonisation','Sustainable packaging rules','Green building standards for event venues'], ARRAY['air','ocean','road'],
  'emissions', 'asia',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g21', 'global', 'Asia-Pacific', 'ADB Sustainable Transport', 'https://www.adb.org/sectors/transport/overview',
  'ADB green transport financing across Southeast Asia.', 'finance', 'MODERATE', 'Development bank financing affects infrastructure quality for event freight in SE Asia.',
  ARRAY['ADB','Southeast Asia','transport','financing'], 'Asian Development Bank financing green transport infrastructure across Southeast Asia.', 'ADB-financed transport infrastructure improves freight capacity and sustainability in SE Asian event markets.',
  ARRAY['Green transport financing','SE Asian infrastructure','Sustainable logistics investment'], ARRAY['air','ocean','road'],
  'research', 'asia',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g22', 'global', 'Asia-Pacific', 'China CCICED', 'https://www.cciced.net/',
  'Tracks China''s carbon policy trajectory.', 'advisory', 'MODERATE', 'China''s carbon policy evolution affects global shipping and manufacturing supply chains.',
  ARRAY['China','carbon','policy','CCICED'], 'China Council for International Cooperation on Environment and Development — advisory body tracking China''s environmental policy.', 'China''s carbon policy trajectory affects global shipping patterns and manufacturing supply chains relevant to event equipment sourcing.',
  ARRAY['China carbon market development','Environmental policy trajectory','Trade policy implications'], ARRAY['air','ocean','road'],
  'emissions', 'asia',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g23', 'global', 'Asia-Pacific', 'Australia Climate Change Authority', 'https://www.climatechangeauthority.gov.au/',
  'Australian climate policy; Pacific event routing.', 'regulator', 'MODERATE', 'Relevant for Pacific event routing and Australia/NZ freight compliance.',
  ARRAY['Australia','climate','Pacific'], 'Australian government advisory body on climate change policy.', 'Relevant for freight compliance when routing through Australia and the Pacific for events.',
  ARRAY['Australian climate targets','Transport emissions policy'], ARRAY['air','ocean','road'],
  'emissions', 'asia',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g24', 'global', 'Asia-Pacific', 'ASEAN Transport Strategic Plan', 'https://asean.org/our-communities/asean-economic-community/transport/',
  'ASEAN sustainable transport across 10 member states.', 'framework', 'MODERATE', 'Framework for sustainable transport across SE Asian event markets.',
  ARRAY['ASEAN','transport','Southeast Asia'], 'ASEAN sustainable transport framework covering 10 member states.', 'Provides context for transport sustainability requirements across SE Asian markets used for event logistics.',
  ARRAY['10 member states','Sustainable transport framework','Cross-border coordination'], ARRAY['air','ocean','road'],
  'transport', 'asia',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g25', 'global', 'Asia-Pacific', 'DP World Sustainability', 'https://www.dpworld.com/sustainability/',
  'Major port/logistics operator sustainability standards.', 'industry', 'MODERATE', 'Major port operator sustainability requirements affect carrier and forwarder operations.',
  ARRAY['DP World','ports','sustainability'], 'Global port and logistics operator setting sustainability standards across its network.', 'DP World''s sustainability requirements at its ports affect operational standards for freight forwarders using their facilities.',
  ARRAY['Port sustainability standards','Carbon reduction targets','Clean energy at terminals'], ARRAY['ocean'],
  'corridors', 'meaf',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g26', 'global', 'Asia-Pacific', 'IRENA Abu Dhabi', 'https://www.irena.org/',
  'Renewable energy in transport; Middle East event freight hubs.', 'research', 'MODERATE', 'Renewable energy transition data relevant for Middle East freight hub operations.',
  ARRAY['IRENA','renewable','transport','Middle East'], 'International Renewable Energy Agency tracking renewable energy adoption in transport.', 'IRENA data on renewable energy in transport is relevant for Middle East hub operations and green fuel availability.',
  ARRAY['Renewable energy in transport','Maritime fuel transition data','Middle East hub energy'], ARRAY['air','ocean','road'],
  'fuels', 'meaf',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g27', 'global', 'Packaging & Waste', 'UN SDGs 9 & 13', 'https://sdgs.un.org/goals',
  'Framework underpinning all national sustainability legislation.', 'framework', 'MODERATE', 'SDGs provide the global context that drives all national sustainability regulation.',
  ARRAY['SDGs','UN','sustainability','global'], 'UN Sustainable Development Goals 9 (Industry/Infrastructure) and 13 (Climate Action) underpinning national legislation.', 'SDGs provide the overarching framework that national governments reference when creating sustainability regulations affecting freight.',
  ARRAY['Goal 9: Industry, Innovation, Infrastructure','Goal 13: Climate Action','Referenced in national legislation worldwide'], ARRAY['air','ocean','road'],
  'reporting', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g28', 'global', 'Packaging & Waste', 'IPCC Climate Reports', 'https://www.ipcc.ch/',
  'Scientific basis for all climate policy worldwide.', 'science', 'HIGH', 'IPCC assessments are the scientific foundation for every climate regulation affecting freight.',
  ARRAY['IPCC','science','climate','authoritative'], 'Intergovernmental Panel on Climate Change providing the authoritative scientific basis for climate policy globally.', 'IPCC assessment reports determine the ambition level of all climate regulations worldwide. When regulators tighten targets, they cite IPCC science.',
  ARRAY['AR6 synthesis: 1.5°C requires 43% reduction by 2030','Transport sector pathways defined','Scientific basis for all regulation','Next assessment cycle ongoing'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g29', 'global', 'Packaging & Waste', 'IEA Policies & Measures', 'https://www.iea.org/policies/about',
  'Energy/transport policy implementation across 150+ countries.', 'tracker', 'HIGH', 'Tracks policy implementation across 150+ countries — essential for multi-jurisdiction compliance.',
  ARRAY['IEA','policies','energy','150+ countries'], 'International Energy Agency tracking energy and transport policy implementation across 150+ countries.', 'When freight forwarders operate across multiple jurisdictions, IEA''s database shows what environmental compliance requirements exist in each.',
  ARRAY['150+ countries tracked','Transport policy database','Implementation status','Energy transition monitoring'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g30', 'global', 'Packaging & Waste', 'World Bank Transport', 'https://www.worldbank.org/en/topic/transport',
  'Development financing for transport infrastructure globally.', 'finance', 'MODERATE', 'Infrastructure investment in emerging markets affects freight capacity for event logistics.',
  ARRAY['World Bank','transport','infrastructure'], 'World Bank transport division financing infrastructure development globally.', 'Development financing affects freight capacity and infrastructure quality in emerging markets used for events.',
  ARRAY['Transport infrastructure financing','Emerging market development','Sustainability criteria'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g31', 'global', 'Packaging & Waste', 'ITF International Transport Forum', 'https://www.itf-oecd.org/',
  'OECD transport think-tank; freight decarbonisation outlook.', 'analysis', 'HIGH', 'Annual outlook on freight decarbonisation, modal shift data, and volume projections.',
  ARRAY['ITF','OECD','outlook','modal shift'], 'OECD International Transport Forum providing annual outlook on freight decarbonisation, modal economics, and volume projections.', 'ITF''s annual Transport Outlook and freight decarbonisation reports provide essential context for long-range business planning in event logistics.',
  ARRAY['Annual Transport Outlook','Modal shift economics','Freight volume projections','Decarbonisation scenario modelling'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r1', 'research', 'Academic Institutions', 'MIT Center for Transportation & Logistics', 'https://ctl.mit.edu/',
  'Supply chain decarbonisation, freight futures, zero-emission logistics.', 'academic', 'HIGH', 'Leading academic source for freight decarbonisation technology readiness.',
  ARRAY['MIT','supply chain','decarbonisation'], 'MIT''s centre for transportation and logistics research covering supply chain sustainability and zero-emission freight futures.', 'MIT research provides technology readiness assessments that determine when zero-emission logistics options become commercially viable.',
  ARRAY['Supply chain decarbonisation research','Zero-emission logistics modelling','Technology readiness assessments'], ARRAY['air','ocean','road'],
  'research', 'us',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r2', 'research', 'Academic Institutions', 'Kuehne Climate Center', 'https://kuehneclimatecenter.org/',
  'Applied maritime/logistics climate research and decarbonisation pathways.', 'academic', 'HIGH', 'Applied logistics decarbonisation research directly applicable to freight operations.',
  ARRAY['Kuehne','maritime','logistics','climate'], 'Applied climate research centre focused on maritime and logistics decarbonisation pathways.', 'Directly applicable research on logistics decarbonisation pathways including green fuel economics and fleet transition scenarios.',
  ARRAY['Maritime decarbonisation pathways','Logistics climate research','Green fuel economics'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r3', 'research', 'Academic Institutions', 'Fraunhofer IML', 'https://www.iml.fraunhofer.de/en.html',
  'Logistics automation, green warehouse, EV freight, digital twins.', 'academic', 'HIGH', 'German applied research on logistics technology directly relevant to operational efficiency.',
  ARRAY['Fraunhofer','logistics','automation','EV'], 'Germany''s leading applied research institute for logistics covering automation, green warehousing, and electric freight.', 'Fraunhofer research signals which logistics technologies will become standard — useful for infrastructure planning and client advisory.',
  ARRAY['Green warehouse technology','EV freight testing','Digital twin applications','Logistics automation research'], ARRAY['air','ocean','road'],
  'research', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r4', 'research', 'Academic Institutions', 'World Resources Institute', 'https://www.wri.org/',
  'Transport decarbonisation, freight emissions, EV transition research.', 'research', 'HIGH', 'WRI research underpins GHG Protocol and major policy frameworks affecting freight.',
  ARRAY['WRI','transport','emissions','EV'], 'World Resources Institute conducting research on transport decarbonisation, freight emissions, and clean energy transition.', 'WRI is the co-convener of GHG Protocol. Their transport research directly shapes the emissions accounting standards freight forwarders must use.',
  ARRAY['Co-convener of GHG Protocol','Transport decarbonisation pathways','City logistics research','EV transition analysis'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r5', 'research', 'Academic Institutions', 'Stockholm Environment Institute', 'https://www.sei.org/',
  'Carbon markets, transport equity, freight fuel lifecycle analysis.', 'academic', 'MODERATE', 'Policy research on carbon markets and lifecycle analysis of freight fuels.',
  ARRAY['SEI','carbon markets','lifecycle','equity'], 'Research institute covering carbon markets, transport equity, and lifecycle analysis of freight fuels.', 'SEI''s lifecycle analysis of alternative fuels helps evaluate true environmental impact of green logistics options.',
  ARRAY['Carbon market analysis','Fuel lifecycle assessment','Transport equity research'], ARRAY['air','ocean','road'],
  'research', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r6', 'research', 'Academic Institutions', 'TNO Mobility & Logistics', 'https://www.tno.nl/en/',
  'Zero-emission trucks, smart freight, hydrogen logistics.', 'research', 'MODERATE', 'Dutch applied research on ZEV trucks and hydrogen logistics technology.',
  ARRAY['TNO','ZEV trucks','hydrogen','smart freight'], 'Netherlands applied research on zero-emission trucks, smart freight systems, and hydrogen logistics.', 'TNO testing data on ZEV trucks provides independent performance assessments relevant for fleet transition planning.',
  ARRAY['Zero-emission truck testing','Hydrogen logistics research','Smart freight systems'], ARRAY['air','ocean','road'],
  'research', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r7', 'research', 'Academic Institutions', 'Erasmus Smart Port', 'https://www.eur.nl/en/ese/research/smart-port',
  'Port digitalisation and sustainability; smart cargo handling.', 'academic', 'MODERATE', 'Port digitalisation research relevant to efficient cargo handling at green ports.',
  ARRAY['Erasmus','smart port','digitalisation'], 'Erasmus University research on port digitalisation and sustainability.', 'Smart port research signals operational improvements that can reduce both costs and emissions at major cargo ports.',
  ARRAY['Port digitalisation research','Sustainable cargo handling','Digital twin port operations'], ARRAY['ocean'],
  'research', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r8', 'research', 'Academic Institutions', 'Cranfield Sustainable Logistics', 'https://www.cranfield.ac.uk/',
  'UK hub for sustainable supply chains, aviation SAF, last-mile ZEV.', 'academic', 'MODERATE', 'UK logistics research directly applicable to sustainable event freight operations.',
  ARRAY['Cranfield','logistics','SAF','last-mile'], 'UK''s leading logistics research hub covering sustainable supply chains and zero-emission last-mile delivery.', 'Cranfield research on last-mile zero-emission delivery is directly relevant for event venue logistics.',
  ARRAY['Sustainable supply chain research','Aviation SAF research','Last-mile zero-emission'], ARRAY['air','ocean','road'],
  'research', 'uk',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r9', 'research', 'Academic Institutions', 'Transportation Research Part E', 'https://www.sciencedirect.com/journal/transportation-research-part-e-logistics-and-transportation-review',
  'Peer-reviewed logistics and supply chain sustainability journal.', 'journal', 'MODERATE', 'Leading peer-reviewed journal for logistics sustainability research.',
  ARRAY['journal','logistics','peer-reviewed'], 'Peer-reviewed academic journal covering logistics, transportation review, and supply chain sustainability.', 'Research here informs methodology updates that affect emissions calculation standards.',
  ARRAY['Peer-reviewed logistics research','Supply chain sustainability','Methodology development'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r10', 'research', 'Academic Institutions', 'Journal of Sustainable Transport', 'https://www.scdtl.com/',
  'Academic journal on sustainable freight and transport systems.', 'journal', 'MODERATE', 'Focused academic coverage of sustainable freight transport systems.',
  ARRAY['journal','sustainable transport','academic'], 'Academic journal focused specifically on sustainable freight and transport systems.', 'Emerging research on sustainable freight systems informing future industry standards.',
  ARRAY['Sustainable freight research','Transport system analysis'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r11', 'research', 'Think-Tanks & Policy Analysis', 'The Loadstar: Green Tech', 'https://theloadstar.com/section/green-tech/',
  'Freight industry news on sustainable tech and policy.', 'news', 'HIGH', 'Essential freight industry news source for sustainability developments.',
  ARRAY['Loadstar','freight news','green tech'], 'Leading freight industry publication covering sustainable technology, policy analysis, and carrier decarbonisation developments.', 'Real-time intelligence on carrier sustainability investments, SAF deals, and regulatory developments directly affecting freight operations.',
  ARRAY['Carrier decarbonisation moves','SAF deal tracking','Policy analysis','Technology adoption reporting'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r12', 'research', 'Think-Tanks & Policy Analysis', 'FreightWaves Sustainability', 'https://www.freightwaves.com/news/category/sustainability',
  'Real-time freight data and sustainability reporting.', 'news', 'HIGH', 'Real-time freight market data including SAF pricing and EV adoption rates.',
  ARRAY['FreightWaves','data','sustainability','SAF prices'], 'Real-time freight market data platform with dedicated sustainability coverage including SAF pricing and EV adoption tracking.', 'Market data on green freight pricing helps build forward-looking cost models for sustainable logistics offerings.',
  ARRAY['Real-time freight data','SAF price tracking','EV adoption rates','Sustainability market intelligence'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r13', 'research', 'Think-Tanks & Policy Analysis', 'GreenBiz Supply Chain', 'https://www.greenbiz.com/topic/supply-chain',
  'Corporate supply chain decarbonisation case studies.', 'analysis', 'HIGH', 'Corporate sustainability practice including Scope 3 solutions relevant to freight.',
  ARRAY['GreenBiz','supply chain','Scope 3','case studies'], 'Corporate sustainability publication covering supply chain decarbonisation case studies and Scope 3 solutions.', 'Case studies of how major brands are decarbonising their supply chains — directly relevant for understanding client expectations.',
  ARRAY['Supply chain decarbonisation cases','Scope 3 solution reporting','Corporate sustainability trends'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r14', 'research', 'Think-Tanks & Policy Analysis', 'Reuters Sustainable Business', 'https://www.reuters.com/sustainability/',
  'Breaking news on climate policy, carbon markets, shipping regulation.', 'news', 'HIGH', 'Breaking news on climate regulation that affects freight markets.',
  ARRAY['Reuters','climate','carbon markets','breaking news'], 'Reuters'' sustainability desk covering breaking news on climate policy, carbon markets, and transport regulation.', 'First to report major regulatory changes affecting freight markets — essential for time-sensitive intelligence.',
  ARRAY['Breaking regulatory news','Carbon market reporting','Shipping regulation coverage'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r15', 'research', 'Think-Tanks & Policy Analysis', 'Environmental Finance', 'https://www.environmental-finance.com/',
  'Carbon markets, green bonds, sustainable finance.', 'analysis', 'HIGH', 'Carbon market and green bond intelligence relevant to freight decarbonisation financing.',
  ARRAY['carbon markets','green bonds','finance'], 'Specialist publication on carbon markets, green bonds, and sustainable finance mechanisms.', 'Carbon market price intelligence and green financing developments directly affect freight decarbonisation economics.',
  ARRAY['Carbon market price analysis','Green bond issuance tracking','Sustainable finance regulation'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r16', 'research', 'Think-Tanks & Policy Analysis', 'Carbon Trust', 'https://www.carbontrust.com/news-and-events',
  'Carbon measurement, freight sector decarbonisation advisory.', 'advisory', 'MODERATE', 'Advisory updates on carbon measurement methodologies affecting freight.',
  ARRAY['Carbon Trust','measurement','advisory'], 'Carbon Trust updates on carbon measurement methodologies and freight sector decarbonisation programmes.', 'Methodology updates can change how freight emissions are calculated and reported.',
  ARRAY['Carbon measurement updates','Freight decarbonisation programmes','Methodology changes'], ARRAY['air','ocean','road'],
  'research', 'uk',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r17', 'research', 'Think-Tanks & Policy Analysis', 'Project Drawdown', 'https://drawdown.org/solutions',
  'Ranked climate solutions: shipping, aviation, land transport with quantified impact.', 'research', 'HIGH', 'Quantified impact data for climate solutions across all freight transport modes.',
  ARRAY['Drawdown','solutions','quantified','impact'], 'Compendium of ranked climate solutions with quantified emission reduction potential across sectors including transport.', 'Drawdown''s quantified impact data helps prioritise which decarbonisation actions deliver the most benefit for freight operations.',
  ARRAY['Shipping solutions ranked','Aviation decarbonisation options','Land transport alternatives','Quantified CO2 reduction potential'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r18', 'research', 'Think-Tanks & Policy Analysis', 'Splash247 Green', 'https://splash247.com/category/green/',
  'Maritime green tech news; alternative fuels, vessel technology.', 'news', 'MODERATE', 'Maritime-specific green technology and alternative fuel news.',
  ARRAY['Splash247','maritime','green tech','fuels'], 'Maritime industry publication covering green technology, alternative fuels, and vessel sustainability developments.', 'Maritime-specific intelligence on alternative fuel trials and green vessel technology.',
  ARRAY['Alternative fuel trials','Green vessel technology','Port sustainability news'], ARRAY['ocean'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r19', 'research', 'Think-Tanks & Policy Analysis', 'Supply Chain Digital', 'https://supplychaindigital.com/',
  'Digital transformation and sustainability in supply chains.', 'news', 'MODERATE', 'Supply chain technology and sustainability convergence reporting.',
  ARRAY['digital','supply chain','technology'], 'Publication covering digital transformation and sustainability convergence in supply chains.', 'Technology adoption trends affecting sustainable supply chain management.',
  ARRAY['Digital transformation trends','Sustainability technology','Supply chain innovation'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r20', 'research', 'Think-Tanks & Policy Analysis', 'JOC (Journal of Commerce)', 'https://www.joc.com/',
  'Container shipping, logistics news, trade lane analysis.', 'news', 'MODERATE', 'Industry standard for container shipping news and trade lane analysis.',
  ARRAY['JOC','container','shipping','trade lanes'], 'Leading container shipping and logistics publication covering trade lane analysis and carrier sustainability initiatives.', 'Standard industry reference for container shipping markets, carrier sustainability moves, and trade lane dynamics.',
  ARRAY['Container shipping markets','Trade lane analysis','Carrier sustainability initiatives'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r21', 'research', 'Think-Tanks & Policy Analysis', 'Sustainability Magazine', 'https://sustainabilitymag.com/',
  'Cross-sector sustainability including logistics and events.', 'news', 'MODERATE', 'Cross-sector sustainability coverage relevant to event logistics.',
  ARRAY['sustainability','events','cross-sector'], 'Cross-sector sustainability publication covering logistics, packaging, and events industry.', 'Coverage of sustainability trends across sectors relevant to event freight operations.',
  ARRAY['Logistics sustainability','Packaging innovation','Events industry coverage'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r22', 'research', 'Think-Tanks & Policy Analysis', 'EcoEnclose Blog', 'https://www.ecoenclose.com/blog/',
  'Sustainable packaging innovations for goods and merchandise.', 'blog', 'LOW', 'Practical sustainable packaging innovations for event merchandise and high-value goods.',
  ARRAY['packaging','sustainable','merchandise','innovation'], 'Blog covering sustainable packaging innovations relevant for merchandise and high-value product packaging.', 'Practical packaging innovation insights relevant for event merchandise, branded goods, and high-value product protection.',
  ARRAY['Sustainable packaging innovations','Eco-friendly materials','Merchandise packaging solutions'], ARRAY['air','ocean','road'],
  'research', 'us',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r23', 'research', 'Innovation Trackers', 'Mission Innovation Clean Shipping', 'https://mission-innovation.net/our-work/innovation-challenges/clean-shipping/',
  '23-country R&D initiative for zero-emission shipping fuels.', 'initiative', 'HIGH', 'Government-backed R&D accelerating zero-emission shipping fuels and vessels.',
  ARRAY['Mission Innovation','R&D','23 countries','clean shipping'], 'Multi-government R&D initiative with 23 countries collaborating to develop zero-emission shipping fuels and vessel technologies.', 'Government-backed research signals which technologies will receive policy support and public investment.',
  ARRAY['23-country R&D collaboration','Zero-emission fuel development','Vessel technology innovation'], ARRAY['ocean'],
  'fuels', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r24', 'research', 'Innovation Trackers', 'ZEMBA Maritime Buyers Alliance', 'https://www.zerocarbonshipping.com/zemba/',
  'Zero-emission buyer coalition driving demand for green shipping.', 'initiative', 'HIGH', 'Buyer coalition creating demand pull for green shipping — affects carrier offerings.',
  ARRAY['ZEMBA','zero-emission','buyers','demand'], 'Zero-emission maritime buyer coalition driving demand signals for green shipping services.', 'ZEMBA member commitments create demand pull that accelerates carrier investment in green vessels — affecting which shipping options become available.',
  ARRAY['Buyer coalition for green shipping','Demand signal aggregation','Carrier investment catalyst'], ARRAY['ocean'],
  'emissions', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r25', 'research', 'Innovation Trackers', 'First Movers Coalition', 'https://www.weforum.org/first-movers-coalition/',
  'WEF: corporate commitments to near-zero emission shipping, aviation, trucking.', 'initiative', 'HIGH', 'Major corporate purchasers committing to near-zero emission freight — signals future client requirements.',
  ARRAY['WEF','First Movers','corporate','commitments'], 'WEF initiative where major corporations commit to purchasing near-zero emission shipping, aviation, and trucking services.', 'First Movers Coalition members are likely clients for event logistics. Their commitments signal what sustainability requirements will appear in future freight tenders.',
  ARRAY['Corporate purchase commitments','Near-zero shipping, aviation, trucking','Demand signal for green logistics','WEF-backed initiative'], ARRAY['air','ocean','road'],
  'emissions', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r26', 'research', 'Innovation Trackers', 'E-Fuel Alliance', 'https://www.efuel-alliance.eu/',
  'European e-fuels industry: e-methanol, e-ammonia, e-kerosene.', 'industry', 'MODERATE', 'E-fuel technology tracking for maritime and aviation applications.',
  ARRAY['e-fuels','e-methanol','e-kerosene','EU'], 'European e-fuels industry alliance tracking synthetic fuel development for maritime and aviation applications.', 'E-fuel availability timelines determine when carriers can offer genuinely zero-carbon shipping and aviation fuel options.',
  ARRAY['E-methanol development','E-ammonia status','E-kerosene for aviation','Cost trajectory tracking'], ARRAY['air','ocean','road'],
  'fuels', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r27', 'research', 'Innovation Trackers', 'Yara Clean Ammonia', 'https://www.yara.com/chemical-and-fertilizer-sourcing/yara-clean-ammonia/',
  'Green ammonia for vessel bunkering trials and supply chain.', 'innovation', 'MODERATE', 'Leading green ammonia producer — bunkering trials signal fuel availability.',
  ARRAY['Yara','ammonia','bunkering','green'], 'Leading green ammonia producer conducting vessel bunkering trials and developing maritime fuel supply chains.', 'Yara''s ammonia bunkering trials signal when this fuel will be commercially available for ocean shipping.',
  ARRAY['Green ammonia production','Vessel bunkering trials','Supply chain development'], ARRAY['ocean'],
  'fuels', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r28', 'research', 'Innovation Trackers', 'H2 Accelerate', 'https://h2accelerate.eu/',
  'Hydrogen truck deployment across Europe; OEM+energy consortium.', 'initiative', 'MODERATE', 'Hydrogen truck technology consortium signals deployment timelines.',
  ARRAY['H2','hydrogen trucks','Europe','OEM'], 'European consortium of truck OEMs and energy companies deploying hydrogen trucks across the continent.', 'H2 Accelerate trials signal when hydrogen trucks will be commercially available for road freight operations.',
  ARRAY['OEM and energy company consortium','European hydrogen truck trials','Infrastructure development','Deployment timeline signals'], ARRAY['road'],
  'fuels', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r29', 'research', 'Innovation Trackers', 'NREL Transportation R&D', 'https://www.nrel.gov/transportation/',
  'US DOE lab: ZEV technology, hydrogen, SAF research.', 'research', 'HIGH', 'National lab R&D on zero-emission freight technology.',
  ARRAY['NREL','DOE','technology','R&D'], 'US National Renewable Energy Laboratory''s transportation research division.', 'NREL research provides independent technology validation for ZEV freight solutions.',
  ARRAY['ZEV technology validation','Hydrogen fuel cell research','SAF pathways','Independent testing'], ARRAY['air','ocean','road'],
  'research', 'us',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r30', 'research', 'Green Corridors & Ports', 'Getting to Zero: Green Corridors', 'https://www.getzerocoalition.org/green-shipping-corridors',
  'Directory of 62+ established green shipping corridors globally.', 'tracker', 'HIGH', 'Comprehensive directory of active green shipping corridors — directly affects lane options.',
  ARRAY['green corridors','directory','62+','global'], 'Global directory of 62+ established green shipping corridors across major trade routes.', 'Green corridor directory shows which trade routes have zero-emission vessel options or are developing them — directly affects routing decisions for event logistics.',
  ARRAY['62+ corridors established','Major trade routes covered','Zero-emission vessel availability','Bunkering infrastructure status'], ARRAY['ocean'],
  'corridors', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r31', 'research', 'Green Corridors & Ports', 'Port of Los Angeles Green', 'https://www.portoflosangeles.org/environment',
  'World''s busiest port for event equipment; Clean Air Action Plan.', 'regulator', 'HIGH', 'Primary US gateway for event equipment — zero-emission cargo handling targets directly affect operations.',
  ARRAY['LA port','Clean Air','zero-emission','drayage'], 'Port of Los Angeles environmental programmes including Clean Air Action Plan and zero-emission cargo handling targets.', 'As the busiest US port for event equipment imports, LA''s Clean Air Action Plan and zero-emission targets directly affect drayage and cargo handling operations.',
  ARRAY['Clean Air Action Plan','Zero-emission cargo handling targets','Truck clean-up requirements','Alternative fuel infrastructure'], ARRAY['ocean'],
  'corridors', 'us',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r32', 'research', 'Green Corridors & Ports', 'ESPO Green Ports', 'https://www.espo.be/',
  'European port sustainability index and best practices.', 'industry', 'MODERATE', 'European port sustainability standards — cross-referenced from Ocean Shipping.',
  ARRAY['ESPO','ports','sustainability','EU'], 'European Sea Ports Organisation sustainability index and best practice guidelines.', 'European port sustainability requirements affect operations at all major EU cargo ports.',
  ARRAY['Port sustainability index','Shore power deployment','Environmental best practices'], ARRAY['ocean'],
  'corridors', 'eu',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r33', 'research', 'Green Corridors & Ports', 'Lloyd''s Register Fleet Analytics', 'https://www.lr.org/en/sustainability/decarbonisation/',
  'Technical fleet transition pathways — cross-referenced from Ocean.', 'guidance', 'HIGH', 'Fleet transition data helping evaluate carrier decarbonisation readiness.',
  ARRAY['Lloyd''s Register','fleet','pathways','data'], 'Lloyd''s Register fleet analytics providing technical pathway data for fleet operators transitioning fuels.', 'Classification society data on fleet transition pathways helps assess carrier readiness when selecting shipping partners.',
  ARRAY['Fleet transition pathway data','Fuel technology assessment','Carrier readiness scoring'], ARRAY['ocean'],
  'research', 'global',
  '2026-02-28', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'o13', 'ocean', 'IMO Regulations', 'IMO Net-Zero Framework', 'https://www.imo.org/en/mediacentre/pressbriefings/pages/imo-approves-netzero-regulations.aspx',
  'Global fuel standard + GHG pricing for ships >5,000 GT. Approved MEPC 83 (63-16-24). Adoption Oct 2025, entry into force Mar 2027, enforcement 2028. US opposes.', 'regulation', 'CRITICAL', 'The single most consequential maritime regulation since MARPOL. Mandatory fuel standard + carbon pricing on every ocean shipment. US actively opposing — creates enforcement fragmentation risk.',
  ARRAY['IMO','NZF','carbon pricing','fuel standard','MEPC 83','2027','2028'], 'First binding framework combining mandatory GHG fuel intensity limits and a global carbon pricing mechanism for international shipping. Approved by majority vote at MEPC 83 in April 2025.', 'Every ocean shipment for live events, artwork, luxury goods, film sets, and automotive will face fuel standard compliance costs passed through by carriers. The pricing mechanism creates a new cost layer separate from ETS. US opposition means carriers on US-origin routes may face different enforcement, creating pricing divergence clients must understand.',
  ARRAY['Approved MEPC 83: 63 yes, 16 no, 24 abstained','US walked out, formally opposes as ''global carbon tax''','Entry into force: March 2027','Enforcement with penalties: 2028','Ships >5,000 GT (85% of global emissions)','IMO Net-Zero Fund for revenue disbursement','Well-to-wake lifecycle assessment basis'], ARRAY['ocean'],
  'emissions', 'global',
  '2026-03-01', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g32', 'global', 'EU Policy', 'EU ICS2 (Import Control System 2)', 'https://taxation-customs.ec.europa.eu/online-services/online-services-and-databases-customs/import-control-system-2-ics2_en',
  'Mandatory advance cargo data (ENS) for all EU-bound shipments. Operational now. All carriers and forwarders must submit Electronic Entry Summary before goods arrive.', 'regulation', 'CRITICAL', 'Operational NOW. Every EU-bound shipment requires advance ENS submission. Directly changes your daily customs workflow for every client.',
  ARRAY['ICS2','customs','ENS','advance data','EU','operational'], 'EU Import Control System requiring all carriers and freight forwarders to submit detailed Electronic Entry Summary Declarations before goods arrive at EU borders.', 'Every shipment to EU — event staging, artwork, luxury goods, film equipment, automotive, humanitarian — requires compliant ENS data BEFORE arrival. Errors detected upstream cause delays. Freight forwarders are now information managers, not just transport organisers. Data quality is operationally critical.',
  ARRAY['Mandatory ENS for ALL EU-bound cargo','Pre-arrival data submission required','Errors detected upstream → delays','All carriers and forwarders must comply','Links to CBAM registration number from Jan 2026'], ARRAY['air','ocean','road'],
  'corridors', 'eu',
  '2026-03-01', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g33', 'global', 'EU Policy', 'EUDR (EU Deforestation Regulation)', 'https://environment.ec.europa.eu/topics/forests/deforestation/regulation-deforestation-free-products_en',
  'Due diligence on 7 commodities (timber, rubber, cocoa, coffee, palm oil, soy, cattle). Large operators from Dec 2026. Geolocation traceability required.', 'regulation', 'HIGH', 'Affects any client shipping timber, rubber, leather, or palm-oil-derived packaging into/within EU. Freight forwarders verify documentation compliance.',
  ARRAY['EUDR','deforestation','timber','rubber','traceability','2026'], 'EU regulation requiring companies to prove products entering the EU market are not linked to deforestation. Covers timber, rubber, cocoa, coffee, palm oil, soy, and cattle derivatives.', 'Directly affects freight forwarders handling: timber crating for artwork/automotive, rubber components, leather goods (luxury, automotive interiors), palm-oil-derived packaging materials, and wooden pallets/staging for events and film sets. Forwarders must verify Due Diligence Statements accompany shipments. Penalties up to 4% of EU-wide turnover.',
  ARRAY['Large operators: Dec 30, 2026','SMEs: Jun 30, 2027','7 commodities + derivatives','Geolocation of production sites required','Fines up to 4% EU turnover','Simplification review by Apr 2026'], ARRAY['ocean','road'],
  'packaging', 'eu',
  '2026-03-01', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'g34', 'global', 'EU Policy', 'CountEmissions EU', 'https://transport.ec.europa.eu/transport-modes/countingeurope_en',
  'EU harmonised methodology for measuring transport GHG emissions. Built on ISO 14083. Will make emissions accounting legally referenced across EU.', 'regulation', 'HIGH', 'The regulation that makes ISO 14083/GLEC legally binding in the EU. Every freight quote will eventually need emissions calculation using this methodology.',
  ARRAY['CountEmissions','ISO 14083','GLEC','emissions accounting','EU'], 'Proposed EU regulation establishing a harmonised methodology for GHG accounting of transport services, built on ISO 14083.', 'This regulation transforms emissions accounting from voluntary to legally referenced across all EU transport. Every freight quotation for live events, film logistics, artwork, luxury goods, and automotive will need compliant emissions figures. Freight forwarders offering GLEC/ISO 14083 calculations now have a competitive advantage.',
  ARRAY['Built on ISO 14083','Well-to-wheel approach','Council position: Dec 2023','SME exemption from verification','Applies 42 months after entry into force'], ARRAY['air','ocean','road'],
  'reporting', 'eu',
  '2026-03-01', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r34', 'research', 'Think-Tanks & Policy Analysis', 'FIATA', 'https://fiata.org/',
  'Global federation of freight forwarders. CBAM compliance resources, CO₂ calculators, regulatory alerts for the forwarding industry.', 'industry', 'HIGH', 'Your industry''s peak body. FIATA provides CBAM compliance tools, CO₂ calculators, and regulatory interpretation specifically for freight forwarders.',
  ARRAY['FIATA','freight forwarding','industry body','CBAM','CO2 calculator'], 'International Federation of Freight Forwarders Associations — the global peak body representing the freight forwarding and logistics industry.', 'FIATA provides compliance resources built specifically for freight forwarders, not general industry. Their CBAM guidance, CO₂ calculator repository, and regulatory alerts are tailored to forwarding operations across live events, high-value, and general cargo.',
  ARRAY['Global freight forwarding federation','CBAM compliance resources','CO₂ calculator repository','Regulatory alerts for forwarders'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-03-01', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r35', 'research', 'Think-Tanks & Policy Analysis', 'ICCT', 'https://theicct.org/',
  'Independent research on vehicle, marine, and aviation emissions. Most-cited source in EU regulatory impact assessments.', 'research', 'HIGH', 'The most-cited independent research organisation in freight emissions policy. Referenced by virtually every EU regulatory impact assessment.',
  ARRAY['ICCT','independent','emissions','research','policy'], 'International Council on Clean Transportation providing independent research and analysis on vehicle, marine, and aviation emissions to regulators worldwide.', 'ICCT research underpins the data behind EU truck standards, maritime regulations, and aviation rules. Their projections inform the timeline expectations for every transport regulation in this dashboard.',
  ARRAY['Independent nonprofit research','Referenced in EU, US, China policy','Vehicle, marine, aviation coverage','Regulatory impact assessments'], ARRAY['air','ocean','road'],
  'research', 'global',
  '2026-03-01', FALSE
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived) VALUES (
  'r36', 'research', 'Think-Tanks & Policy Analysis', 'Maritime Carbon Intelligence', 'https://maritimecarbonintelligence.com/',
  'Weekly briefing on maritime carbon economy: IMO, EU ETS, FuelEU, green fuels, carbon pricing.', 'news', 'HIGH', 'Specialized weekly briefing focused specifically on maritime carbon economy. Highest signal-to-noise for ocean shipping ESG.',
  ARRAY['maritime','carbon economy','weekly','IMO','ETS'], 'Specialized weekly intelligence briefing covering the maritime carbon economy including IMO regulations, EU ETS shipping, FuelEU Maritime, and green fuel markets.', 'Purpose-built for tracking the financial and regulatory dimensions of maritime decarbonisation. Directly relevant for pricing ocean freight surcharges on event equipment, artwork, automotive, and humanitarian cargo.',
  ARRAY['Weekly Thursday briefing','IMO/EU ETS/FuelEU focus','Carbon pricing analysis','Green fuel market intelligence'], ARRAY['ocean'],
  'research', 'global',
  '2026-03-01', FALSE
);

-- ═══ Archived Resources (4) ═══
INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived, archived_date, archive_reason, archive_note, archive_replacement) VALUES (
  'arc1', 'global', '', 'EU PPWD 94/62/EC', '', 'Replaced by PPWR 2025/40',
  '', 'LOW', '', '{}', '', '', '{}', '{}',
  NULL, NULL, '2025-02-11', TRUE, '2025-02-11',
  'Superseded', 'Replaced by PPWR 2025/40', 'EU PPWR 2025/40'
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived, archived_date, archive_reason, archive_note, archive_replacement) VALUES (
  'arc2', 'compliance', '', 'CSRD 250+ employee threshold', '', 'Omnibus raised to 1,000',
  '', 'LOW', '', '{}', '', '', '{}', '{}',
  NULL, NULL, '2026-02-24', TRUE, '2026-02-24',
  'Superseded', 'Omnibus raised to 1,000', 'CSRD (Omnibus)'
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived, archived_date, archive_reason, archive_note, archive_replacement) VALUES (
  'arc3', 'global', '', 'EPA 2009 Endangerment Finding', '', 'Federal GHG basis rescinded',
  '', 'LOW', '', '{}', '', '', '{}', '{}',
  NULL, NULL, '2025-12-01', TRUE, '2025-12-01',
  'Repealed', 'Federal GHG basis rescinded', 'EPA SmartWay'
);

INSERT INTO resources (id, category, subcategory, title, url, note, type, priority, reasoning, tags, what_is_it, why_matters, key_data, modes, topic, jurisdiction, added_date, is_archived, archived_date, archive_reason, archive_note, archive_replacement) VALUES (
  'arc4', 'ocean', '', 'IMO 2018 GHG Strategy', '', 'Replaced by 2023 Revised Strategy',
  '', 'LOW', '', '{}', '', '', '{}', '{}',
  NULL, NULL, '2023-07-07', TRUE, '2023-07-07',
  'Superseded', 'Replaced by 2023 Revised Strategy', 'IMO GHG Strategy 2023'
);

-- ═══ Timelines ═══
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o1', '2023-07', 'Strategy adopted', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o1', '2025-04', 'MEPC 83: NZF approved', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o1', '2025-10', 'MEPC ES.2 adoption', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o1', '2027-03', 'NZF entry into force', NULL, 3);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o1', '2030-01', '20% checkpoint', NULL, 4);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o1', '2040-01', '70% checkpoint', NULL, 5);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o2', '2025-01', '2% reduction', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o2', '2030-01', '6% + shore power', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o2', '2050-01', '80% reduction', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o3', '2024-01', '40% phase-in', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o3', '2025-01', '70%', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o3', '2025-09', 'First surrendering', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o3', '2026-01', '100% + CH4/N2O', NULL, 3);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o4', '2023-01', 'CII ratings start', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o4', '2025-04', 'Phase 1 complete', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o4', '2026-01', 'Phase 2 starts', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o4', '2027-01', 'Z-factors apply', NULL, 3);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o4', '2030-01', 'Z-factors end', NULL, 4);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o5', '2020-01', '0.5% global cap', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o5', '2021-01', 'NOx Tier III', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o5', '2025-01', 'ECA review', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o7', '2019-09', 'Coalition formed', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o7', '2025-01', 'Pilot corridors', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o7', '2030-01', 'Viable ZEV target', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('a1', '2024-01', 'First phase', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('a1', '2027-01', 'Mandatory', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('a1', '2035-01', 'Full scope', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('a2', '2026-01', 'Full auctioning', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('a2', '2027-01', 'Scope expansion', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('a3', '2025-01', '2% SAF', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('a3', '2030-01', '6%', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('a3', '2035-01', '20%', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('a3', '2050-01', '70%', NULL, 3);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('a4', '2025-01', '2% SAF', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('a4', '2030-01', '10%', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('a4', '2040-01', '22%', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('l1', '2030-01', '45% cut', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('l1', '2035-01', '65%', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('l1', '2040-01', '90%', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('l2', '2025-04', 'Final text', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('l2', '2027-07', 'New trucks', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('l2', '2029-07', 'All vehicles', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('l3', '2025-01', 'Core EV charging', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('l3', '2027-01', 'Extended network', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('l3', '2030-01', 'H2 refuelling', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('l6', '2027-01', 'MY2027 starts', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('l6', '2030-01', 'Ramp-up', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('l6', '2032-01', '60% ZEV target', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('l7', '2024-01', 'Phase-in starts', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('l7', '2027-01', '40% ZEV', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('l7', '2035-01', '55% ZEV', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('t1', '2023-10', 'Transitional', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('t1', '2025-10', 'Omnibus simplification', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('t1', '2026-01', 'Definitive phase', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('t1', '2026-03', 'Auth deadline', NULL, 3);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('t1', '2027-02', 'Certificate sales', NULL, 4);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('t1', '2027-09', 'First declaration', NULL, 5);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c1', '2024-01', 'Wave 1 PIEs', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c1', '2026-02', 'Omnibus adopted', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c1', '2028-01', 'Wave 2 (delayed)', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c1', '2029-01', 'Wave 3', NULL, 3);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c2', '2022-01', 'Climate objectives', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c2', '2024-01', 'Env objectives', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c2', '2025-01', 'Transport criteria', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c4', '2023-03', 'ISO 14083 published', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c4', '2025-01', 'EU CountEmissions ref', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c4', '2026-01', 'Widespread adoption', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c5', '2023-03', 'v3 launched', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c5', '2025-10', 'v3.2 update', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c5', '2026-01', 'RFP standard', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c6', '2004-01', 'Scope 3 published', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c6', '2024-01', 'Revision starts', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c6', '2025-01', 'Draft update', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c6', '2026-01', 'Final revision', NULL, 3);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c8', '2024-01', 'S2 effective', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c8', '2025-01', 'Early adopters', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c8', '2026-01', 'Singapore mandatory', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c8', '2027-01', 'Broad adoption', NULL, 3);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c9', '2025-02', 'Questionnaire opens', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c9', '2025-07', 'Submission deadline', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('c9', '2025-11', 'Scores published', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g1', '2021-07', 'Package proposed', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g1', '2023-01', 'Laws adopted', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g1', '2025-01', 'Phase-ins begin', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g1', '2030-01', '55% target', NULL, 3);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g2', '2025-02', 'In force', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g2', '2026-08', 'Applies', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g2', '2030-01', 'All recyclable', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g2', '2035-01', 'Reuse targets', NULL, 3);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g17', '2024-01', 'Green incentives', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g17', '2026-01', 'LNG bunkering', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g17', '2030-01', 'Green hub target', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g20', '2021-02', 'Plan launched', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g20', '2025-01', 'Mid-term review', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g20', '2030-01', '2030 targets', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o13', '2025-04', 'MEPC 83 approved', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o13', '2025-10', 'MEPC ES.2 adoption', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o13', '2027-03', 'Entry into force', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('o13', '2028-01', 'Enforcement begins', NULL, 3);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g32', '2024-03', 'Air cargo phase', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g32', '2025-01', 'Maritime/road phase', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g32', '2026-01', 'CBAM integration', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g33', '2023-06', 'In force', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g33', '2026-04', 'Simplification review', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g33', '2026-12', 'Large operators apply', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g33', '2027-06', 'SME apply', NULL, 3);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g34', '2023-07', 'Proposed', NULL, 0);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g34', '2023-12', 'Council position', NULL, 1);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g34', '2026-01', 'Parliament vote expected', NULL, 2);
INSERT INTO timelines (resource_id, date, label, status, sort_order) VALUES ('g34', '2029-01', '~Application date', NULL, 3);
-- 110 timeline entries

-- ═══ Changelog ═══
INSERT INTO changelog (resource_id, date, type, fields, prev_value, now_value, impact) VALUES ('t1', '2026-03-01', 'UPDATED', ARRAY['Timeline'], 'CBAM transitional phase until Dec 2025', 'Definitive phase active Jan 2026. Authorised declarant registration deadline extended to March 2026', 'HIGH — registration is now the immediate compliance action');
INSERT INTO changelog (resource_id, date, type, fields, prev_value, now_value, impact) VALUES ('t1', '2026-03-01', 'UPDATED', ARRAY['Scope'], 'Scope limited to cement, iron, steel, aluminium, fertilisers, electricity, hydrogen', 'Unchanged scope but EU Commission reviewing potential expansion to organic chemicals and polymers by 2028', 'MODERATE — expansion may affect packaging materials');
INSERT INTO changelog (resource_id, date, type, fields, prev_value, now_value, impact) VALUES ('t1', '2026-03-01', 'UPDATED', ARRAY['Dispute status'], 'WTO challenge speculative', 'Multiple WTO members (India, China, Brazil) have formally signaled objections. Implementation proceeding but legal challenge is active', 'HIGH — dispute may alter scope or enforcement timeline');
INSERT INTO changelog (resource_id, date, type, fields, prev_value, now_value, impact) VALUES ('o1', '2026-03-01', 'UPDATED', ARRAY['Priority'], 'HIGH', 'CRITICAL', 'Urgency increased — enforcement timelines are within planning horizon');
INSERT INTO changelog (resource_id, date, type, fields, prev_value, now_value, impact) VALUES ('o1', '2026-03-01', 'UPDATED', ARRAY['Key data'], 'No specific packaging regulation link', 'Added PPWR interaction — packaging compliance required for goods shipped on ocean routes to EU', 'MODERATE — packaging + ocean compliance now linked');
INSERT INTO changelog (resource_id, date, type, fields, prev_value, now_value, impact) VALUES ('o1', '2026-03-01', 'UPDATED', ARRAY['Timeline'], 'ETS Phase 4 only', 'Added IMO NZF interaction milestones for dual ocean compliance tracking', 'HIGH — two parallel compliance tracks now active for ocean freight');
INSERT INTO changelog (resource_id, date, type, fields, prev_value, now_value, impact) VALUES ('o4', '2026-03-01', 'UPDATED', ARRAY['Status'], 'Draft proposal stage', 'Regulation published in Official Journal, directly applicable in all EU member states', 'CRITICAL — no longer draft; immediate legal obligation');
INSERT INTO changelog (resource_id, date, type, fields, prev_value, now_value, impact) VALUES ('o4', '2026-03-01', 'UPDATED', ARRAY['Key data'], 'Targets under negotiation', 'All packaging recyclable by 2030, PFAS restrictions confirmed, single-use bans from 2030, recycled content minimums set', 'HIGH — concrete targets now enforceable');
INSERT INTO changelog (resource_id, date, type, fields, prev_value, now_value, impact) VALUES ('o4', '2026-03-01', 'UPDATED', ARRAY['Timeline'], 'Estimated 2026 implementation', 'Phased implementation confirmed: labelling 2026, reuse targets 2030, recycled content 2030', 'HIGH — phase dates now firm for planning');

-- ═══ Disputes ═══
INSERT INTO disputes (resource_id, active, note, sources) VALUES ('l6', true, 'Regulatory survival uncertain. EPA Phase 3 under active political review — may be weakened, delayed, or rescinded. CARB standards (l7) remain independent but federal waiver also challenged. Sources conflict on timeline.', '[{"name":"EPA","url":""},{"name":"Industry groups","url":""},{"name":"Environmental Defense Fund","url":""}]'::jsonb);
INSERT INTO disputes (resource_id, active, note, sources) VALUES ('l7', true, 'Federal waiver for Section 177 states under legal challenge. 12+ states follow CARB rules, but if waiver is revoked, state-level mandates face uncertainty. Court ruling pending.', '[{"name":"CARB","url":""},{"name":"EPA","url":""},{"name":"State AG coalition","url":""}]'::jsonb);
INSERT INTO disputes (resource_id, active, note, sources) VALUES ('c1', true, 'CSRD Omnibus significantly changed scope in Feb 2026. Some sources still cite pre-Omnibus 250-employee threshold. Verify any CSRD reference uses post-Omnibus 1,000-employee threshold and delayed Wave 2 timeline.', '[{"name":"EU Commission","url":""},{"name":"Big 4 advisors","url":""}]'::jsonb);
INSERT INTO disputes (resource_id, active, note, sources) VALUES ('t1', true, 'WTO compatibility of CBAM is actively disputed. Multiple WTO members have filed or signaled objections. Implementation proceeding but legal challenge could alter scope.', '[{"name":"EU Commission","url":""},{"name":"WTO","url":""},{"name":"India/China trade ministries","url":""}]'::jsonb);
INSERT INTO disputes (resource_id, active, note, sources) VALUES ('g2', true, 'PPWR implementation guidance still being developed. Specific recyclability criteria and PFAS thresholds under delegated act development. Details may shift before Aug 2026 application date.', '[{"name":"EU Commission","url":""},{"name":"EUROPEN","url":""},{"name":"Plastics Europe","url":""}]'::jsonb);
INSERT INTO disputes (resource_id, active, note, sources) VALUES ('o13', true, 'US formally opposes IMO Net-Zero Framework as a ''global carbon tax''. US delegation walked out of MEPC 83 before vote. US State/Energy/Transport Secretaries issued joint ultimatum against countries voting yes at Oct 2025 adoption. Framework approved 63-16-24 but US enforcement non-participation creates compliance fragmentation on US-origin trade lanes.', '[{"name":"IMO","url":""},{"name":"US State Department","url":""},{"name":"Jones Walker LLP","url":""},{"name":"Maritime Carbon Intelligence","url":""}]'::jsonb);
INSERT INTO disputes (resource_id, active, note, sources) VALUES ('g33', true, 'EUDR delayed twice (Dec 2024 → Dec 2025 → Dec 2026). Simplification review due Apr 2026 may further change requirements. IT platform readiness uncertain. Some stakeholders argue simplifications amount to deregulation. Core obligations remain but implementation details still shifting.', '[{"name":"EU Commission","url":""},{"name":"Mayer Brown","url":""},{"name":"Bird & Bird","url":""},{"name":"WRI","url":""}]'::jsonb);

-- ═══ Cross References (50 pairs) ═══
INSERT INTO cross_references (source_id, target_id) VALUES ('o2', 'o1') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('o3', 'o1') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('o4', 'o1') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('o7', 'o1') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('o3', 'o6') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('o2', 'g1') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('o3', 'g1') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('a2', 'g1') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('a3', 'g1') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('l1', 'g1') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('l3', 'g1') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('t1', 'g1') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('g2', 'g1') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('a1', 'a6') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('a4', 'a3') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('c5', 'c4') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('a7', 'c4') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('c7', 'c6') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('c9', 'c6') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('c1', 'c6') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('c1', 'c2') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('c1', 'c3') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('c1', 'c8') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('c8', 'c3') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('c10', 'c9') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('t1', 'o3') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('t1', 't5') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('t5', 't6') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('l7', 'l6') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('o1', 'g28') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('g1', 'g28') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('r30', 'o7') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('r31', 'l7') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('g20', 'g17') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('g2', 'g1') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('c7', 'c4') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('g29', 't3') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('g31', 't3') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('o13', 'o1') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('o13', 'o2') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('o13', 'o3') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('g34', 'c4') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('g34', 'c5') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('g33', 'g1') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('g32', 't1') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('r34', 't1') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('l1', 'r35') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('o1', 'r35') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('r36', 'o13') ON CONFLICT DO NOTHING;
INSERT INTO cross_references (source_id, target_id) VALUES ('r36', 'o3') ON CONFLICT DO NOTHING;

-- ═══ Supersessions (5) ═══
INSERT INTO supersessions (old_id, old_title, old_url, new_id, new_title, severity, date, note, timeline) VALUES (
  'ss1', 'EU PPWD 94/62/EC', '', 'g2', 'EU PPWR 2025/40',
  'major', '2025-02', 'Directive replaced by directly applicable Regulation. No national transposition needed. All packaging recyclable by 2030, PFAS restrictions, single-use limits. Dramatically expands scope for transport and event packaging.', '[{"date":"1994-12","label":"PPWD adopted"},{"date":"2025-02","label":"PPWR in force"},{"date":"2026-08","label":"PPWR applies"},{"date":"2030-01","label":"All recyclable"}]'::jsonb
);

INSERT INTO supersessions (old_id, old_title, old_url, new_id, new_title, severity, date, note, timeline) VALUES (
  'ss2', 'CSRD 250+ employees threshold', '', 'c1', 'EU Omnibus CSRD 1,000+ employees',
  'major', '2026-02', 'Omnibus raised company size threshold from 250 to 1,000 employees. Companies in scope dropped from ~50,000 to ~5,000. Wave 2 delayed by 2 years. Remaining companies face stricter data granularity requirements including supply chain logistics emissions.', '[{"date":"2024-01","label":"Wave 1 PIEs"},{"date":"2026-02","label":"Omnibus adopted"},{"date":"2028-01","label":"Wave 2 delayed"}]'::jsonb
);

INSERT INTO supersessions (old_id, old_title, old_url, new_id, new_title, severity, date, note, timeline) VALUES (
  'ss3', 'EPA 2009 Endangerment Finding', '', 'g8', 'EPA GHG Rescission (2025)',
  'minor', '2025-12', 'Federal legal basis for ALL vehicle GHG regulation removed. Creates patchwork: California + 12 Section 177 states maintain independent standards. Federal rules collapse. Court challenges pending. Freight forwarders face divergent state-by-state compliance.', '[{"date":"2009-12","label":"Finding issued"},{"date":"2025-06","label":"Rescission proposed"},{"date":"2025-12","label":"Final rule"},{"date":"2026-06","label":"Court challenges"}]'::jsonb
);

INSERT INTO supersessions (old_id, old_title, old_url, new_id, new_title, severity, date, note, timeline) VALUES (
  'ss4', 'IMO 2018 GHG Strategy (50% by 2050)', '', 'o1', 'IMO 2023 Revised Strategy (Net-zero ~2050)',
  'major', '2023-07', 'Ambition doubled from 50% reduction to net-zero by ~2050. New interim checkpoints: 20% by 2030, 70% by 2040. GHG fuel intensity code and pricing mechanism under negotiation. Fundamentally reshapes carrier fleet investment timelines.', '[{"date":"2018-04","label":"Initial strategy"},{"date":"2023-07","label":"Revised adopted"},{"date":"2025-04","label":"MEPC 83"},{"date":"2030-01","label":"20% checkpoint"},{"date":"2040-01","label":"70% checkpoint"}]'::jsonb
);

INSERT INTO supersessions (old_id, old_title, old_url, new_id, new_title, severity, date, note, timeline) VALUES (
  'ss5', 'Voluntary IMO GHG measures only', '', 'o13', 'IMO Net-Zero Framework (binding fuel standard + pricing)',
  'major', '2025-04', 'First binding market-based measure for shipping: mandatory fuel GHG intensity standard + global carbon pricing mechanism. Approved MEPC 83 by 63-16-24 vote. US walked out and formally opposes. Adoption at MEPC ES.2 Oct 2025, entry into force Mar 2027, enforcement 2028. Creates new carrier cost layer on every ocean shipment.', '[{"date":"2025-04","label":"MEPC 83 approved"},{"date":"2025-10","label":"Adoption vote"},{"date":"2027-03","label":"Entry into force"},{"date":"2028-01","label":"Enforcement"}]'::jsonb
);

COMMIT;