-- One-shot insert of 16 integrity_flags rows for the items archived
-- by the Option C Part 1 B audit (2026-05-29) due to confirmed
-- fabricated citation evidence.
--
-- These rows pair with the is_archived = true update on intelligence_items.
-- Recommended action: regenerate under the new gated pipeline (Sprint 4
-- Block 1) before restoring.

INSERT INTO integrity_flags (
  category, subject_type, subject_ref, description, recommended_actions, status, created_by
) VALUES
  ('data_integrity', 'item', '09bdd3a0-4cd2-4ce5-8f7a-79454ae4f381',
   'B audit 2026-05-29: 1 fabricated-URL flag on s15 citation for IMO 2023 GHG Strategy framework item. Source URL not cited in s15.',
   '[{"action": "Regenerate under Sprint 4 Block 1 gated pipeline", "rationale": "B audit revealed unverifiable s15 citation; needs regeneration with agent_run_searches logging."}, {"action": "Verify URL-fab flags were not timeout artifacts before final disposition", "rationale": "Some FABRICATED_URL flags in the B audit were 15s timeout aborts that may resolve with longer timeout."}]'::jsonb,
   'open', 'b-audit-2026-05-29'),

  ('data_integrity', 'item', 'ab92d0c4-8995-484e-ae74-83ad64f8cffd',
   'B audit 2026-05-29: 2 fabricated-metadata flags on s15 citations for Brazilian Decree 10936/2022 (solid waste). Cited titles diverge from actual page content.',
   '[{"action": "Regenerate under Sprint 4 Block 1 gated pipeline", "rationale": "Unambiguous metadata fabrication in s15 citations."}]'::jsonb,
   'open', 'b-audit-2026-05-29'),

  ('data_integrity', 'item', '33ca228c-e966-4b35-9ec2-01cf0da9c80a',
   'B audit 2026-05-29: 2 fabricated-URL + 2 fabricated-metadata flags on s15 citations for EPA HDV GHG Phase 3 item. Cited titles do not match actual EPA pages.',
   '[{"action": "Regenerate under Sprint 4 Block 1 gated pipeline", "rationale": "Mixed URL and metadata fabrication; high-confidence quarantine."}]'::jsonb,
   'open', 'b-audit-2026-05-29'),

  ('data_integrity', 'item', 'e227e2c4-c486-4e33-a08f-7e500ec2d4fe',
   'B audit 2026-05-29: 1 fabricated-URL flag on s15 citations for EU Cross-Border Vans / IRU item. C audit also found 4 untraceable claims (German EUR 1500, Italian EUR 3328, EUR 2000/mo driver, Community licence EUR 1800/900, VDO device).',
   '[{"action": "Regenerate under Sprint 4 Block 1 gated pipeline with authority floor (CRITICAL item from secondary IRU source)", "rationale": "Item priority is CRITICAL but source is industry secondary; authority floor would require Tier 1-2 primary."}]'::jsonb,
   'open', 'b-audit-2026-05-29'),

  ('data_integrity', 'item', '8767e010-dc79-41e2-9fb8-53d7a0bf7b8a',
   'B audit 2026-05-29: 2 fabricated-metadata flags on s15 citations for ICAO CORSIA SAF item. Cited titles like "ICAO Sustainable Aviation Fuels (SAF) Main Framework Page" do not match actual ICAO page titles.',
   '[{"action": "Regenerate under Sprint 4 Block 1 gated pipeline", "rationale": "Unambiguous metadata fabrication in ICAO citations."}]'::jsonb,
   'open', 'b-audit-2026-05-29'),

  ('data_integrity', 'item', 'ef0c691a-4024-495b-bd7c-70be8f52c5ea',
   'B audit 2026-05-29: 1 fabricated-URL flag on s15 citations for IMO 2023 Revised GHG Strategy item (legacy_id: imo-2023-revised-ghg-strategy).',
   '[{"action": "Regenerate under Sprint 4 Block 1 gated pipeline", "rationale": "Sibling of 09bdd3a0; same IMO source family with citation fabrication."}]'::jsonb,
   'open', 'b-audit-2026-05-29'),

  ('data_integrity', 'item', 'b8b6fde3-2087-47c0-89c7-1b3bb944138c',
   'B audit 2026-05-29: 2 fabricated-metadata flags on s15 citations for NYC LL97 item. Cited "NYC Administrative Code section 28-320" -> actual page is "Greenhouse Gas Emission Reporting - Buildings". Cited "DOB Extends LL97 Deadline" -> actual is "Local Law 97 Compliance Guide for Building Owners | RAND".',
   '[{"action": "Regenerate under Sprint 4 Block 1 gated pipeline", "rationale": "Unambiguous metadata fabrication."}]'::jsonb,
   'open', 'b-audit-2026-05-29'),

  ('data_integrity', 'item', '4c26f34b-b525-4824-be5e-5891cd292fcf',
   'B audit 2026-05-29: 3 fabricated-URL + 2 fabricated-metadata flags on s15 citations for MARPOL framework item. Cited LR Class News and EC COM(2025) 431 URLs do not match actual landing pages.',
   '[{"action": "Regenerate under Sprint 4 Block 1 gated pipeline", "rationale": "Mixed URL and metadata fabrication on a CRITICAL PRIMARY item; high-priority remediation."}]'::jsonb,
   'open', 'b-audit-2026-05-29'),

  ('data_integrity', 'item', '661a3f9e-a820-4a10-af71-3e7683abb4bb',
   'B audit 2026-05-29: 1 fabricated-URL flag on s15 citations for UK MEES landlord guidance item.',
   '[{"action": "Regenerate under Sprint 4 Block 1 gated pipeline", "rationale": "Single fab flag; needs grounded regeneration."}]'::jsonb,
   'open', 'b-audit-2026-05-29'),

  ('data_integrity', 'item', '478ee79c-e2f6-4794-af47-32b8f9e4cc9f',
   'B audit 2026-05-29: 1 fabricated-URL + 2 fabricated-metadata flags on s15 citations for UK SAF Mandate item. Cited "The UKs SAF Bill and the Revenue Certainty" -> actual "Addleshaw Goddard - Unexpected Error" (clear error-page citation).',
   '[{"action": "Regenerate under Sprint 4 Block 1 gated pipeline", "rationale": "Citation pointed at an error page; unambiguous fabrication of citation accessibility."}]'::jsonb,
   'open', 'b-audit-2026-05-29'),

  ('data_integrity', 'item', 'e17717c9-cdfa-4886-8c8c-465309cfc15c',
   'B audit 2026-05-29: 1 fabricated-URL + 1 fabricated-metadata flag on s15 citations for DAERA NI Bluetongue item.',
   '[{"action": "Regenerate under Sprint 4 Block 1 gated pipeline", "rationale": "Mixed fabrication on HIGH-priority item."}]'::jsonb,
   'open', 'b-audit-2026-05-29'),

  ('data_integrity', 'item', 'c41f4c7d-8287-4b56-8036-0770a0e78a6f',
   'B audit 2026-05-29: 10 fabricated-URL flags on s15 citations for Australian CCA Act C2022C00255. C audit also found unsourced NGER threshold claim. NOTE: Most URL flags are 15s timeout aborts on .gov.au domains; some may resolve with longer timeout. NGER threshold inconsistency with sibling f249c2bc (25000 t vs ~50 kt) confirms factual fabrication.',
   '[{"action": "Regenerate under Sprint 4 Block 1 gated pipeline", "rationale": "Factual inconsistency (NGER threshold) plus extensive URL flags. Internal inconsistency with sibling item is unambiguous."}, {"action": "Retry timeout-affected URLs with longer timeout to distinguish fabrication from network issue", "rationale": "Many of the 10 URL flags may be Australian .gov.au timeouts, not fabrications."}]'::jsonb,
   'open', 'b-audit-2026-05-29'),

  ('data_integrity', 'item', 'f249c2bc-6766-42b0-935f-22f140cf2844',
   'B audit 2026-05-29: 9 fabricated-URL flags on s15 citations for Australian CCA Act No. 143 2011. Same NGER threshold inconsistency as sibling c41f4c7d (this item says ~50 kt; sibling says 25000 t for the same statutory threshold). Most URL flags are 15s timeout aborts on .gov.au domains.',
   '[{"action": "Regenerate under Sprint 4 Block 1 gated pipeline", "rationale": "Factual inconsistency with sibling c41f4c7d on NGER threshold confirms invented quantitative figure."}, {"action": "Retry timeout-affected URLs with longer timeout to distinguish fabrication from network issue", "rationale": "Australian .gov.au URLs may be slow."}]'::jsonb,
   'open', 'b-audit-2026-05-29'),

  ('data_integrity', 'item', '8c47cbb2-839d-4a88-8b92-7eb6e865ee5d',
   'B audit 2026-05-29: 4 fabricated-URL + 2 fabricated-metadata flags on s15 citations for Queensland legislation item. Cited "Trusts Act 2025 (Qld)" -> actual page is generic Queensland Legislation portal.',
   '[{"action": "Regenerate under Sprint 4 Block 1 gated pipeline", "rationale": "Multiple metadata fabrications plus URL fabrications."}]'::jsonb,
   'open', 'b-audit-2026-05-29'),

  ('data_integrity', 'item', 'd3e36935-75db-4652-90d4-2cab9d9a6cd3',
   'B audit 2026-05-29: 1 fabricated-URL flag on s15 citations for German Umweltbundesamt F-gas Regulation item.',
   '[{"action": "Regenerate under Sprint 4 Block 1 gated pipeline", "rationale": "Single fab flag on a HIGH-priority item from a secondary portal source."}]'::jsonb,
   'open', 'b-audit-2026-05-29'),

  ('data_integrity', 'item', '3f45b2aa-3d15-4e92-95d3-70dcc6f6bc44',
   'B audit 2026-05-29: 4 fabricated-URL flags on s15 citations for US EPA Clean Ports Program item (legacy_id: us-epa-clean-ports-program-port-emissions-standards).',
   '[{"action": "Regenerate under Sprint 4 Block 1 gated pipeline", "rationale": "Multiple URL fabrications. EPA primary source available; should re-anchor to it."}]'::jsonb,
   'open', 'b-audit-2026-05-29');
