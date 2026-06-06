-- Migration 130: seed item_type_required_slots for technology, innovation, tool.
--
-- Mirrors migration 126 (research_finding slots) so validate_item_provenance
-- criterion 5 stops passing VACUOUSLY for technology/innovation/tool items (they
-- previously had zero slots → any generated Technology Profile passed regardless
-- of content).
--
-- Slot selection rationale (Technology Profile, 8 sections, SKILL.md §8):
--
--   deployment_reality  → S1 "What's Being Tested or Deployed and By Whom"
--                          The FACT-groundable discriminator. claim_text must
--                          name a real operator/pilot with a quantified result.
--                          Token the ledger stamps: "[deployment_reality]"
--
--   supplier_access     → S3 "Supplier Access and Procurement Reality"
--                          Must name who can buy, at what scale, with a source.
--                          Exclusivity or lead-time claim is the discriminating
--                          FACT. Token: "[supplier_access]"
--
--   operational_fit     → S4 "Operational Fit by Transport Mode and Cargo Vertical"
--                          Verdict per mode (air/road/ocean). A FACT or GAP claim
--                          per the workspace's top mode. Token: "[operational_fit]"
--
--   procurement_window  → S7 "Time-to-Market, Procurement Window, and Action"
--                          When the workspace must commit, with an action. Often
--                          linked to a regulatory deadline or market shift (No-Vacuum
--                          rule). GAP acceptable when timeline is genuinely unknown;
--                          in that case claim_text restates the uncertainty.
--                          Token: "[procurement_window]"
--
-- S2, S5, S6, S8 are synthesis or transitive sections (SKILL.md §8 grounding map:
-- S2 transitive, S4 transitive, S5 span+transitive, S6 transitive, S7 transitive).
-- The four slots above cover the SPAN-groundable load-bearing sections plus the
-- action-oriented S7 which is the format's primary user-value section.
--
-- Note on 3 institutional-body rows typed 'tool' (known debt — see CLAUDE.md):
-- EEA (g3), ECLAC (g12), OECD Environment (t3). These are thin-content rows and
-- will GAP-fill these slots honestly (GAP claim_kind, claim_text states the gap).
-- Do not special-case them; the provenance gate will surface them for review on
-- their next generation pass, which is the correct outcome.
--
-- ADDITIVE ONLY: INSERT-only, ON CONFLICT (item_type, slot_key) DO NOTHING.

BEGIN;

INSERT INTO item_type_required_slots (item_type, slot_key, description)
VALUES
  ('technology',  'deployment_reality',  'Named operator or institution with a quantified deployment result, or explicit "no public deployment as of [date]" (S1 SPAN-groundable)'),
  ('technology',  'supplier_access',     'Who can buy, at what scale, exclusivity, and lead times — named and sourced (S3 SPAN-groundable)'),
  ('technology',  'operational_fit',     'Verdict per transport mode (air/road/ocean) in workspace priority order; "not applicable to [mode]" where true (S4)'),
  ('technology',  'procurement_window',  'When commercially available at scale and when the workspace must commit; GAP claim acceptable when timeline is genuinely unknown (S7 transitive)'),

  ('innovation',  'deployment_reality',  'Named operator or institution with a quantified deployment result, or explicit "no public deployment as of [date]" (S1 SPAN-groundable)'),
  ('innovation',  'supplier_access',     'Who can buy, at what scale, exclusivity, and lead times — named and sourced (S3 SPAN-groundable)'),
  ('innovation',  'operational_fit',     'Verdict per transport mode (air/road/ocean) in workspace priority order; "not applicable to [mode]" where true (S4)'),
  ('innovation',  'procurement_window',  'When commercially available at scale and when the workspace must commit; GAP claim acceptable when timeline is genuinely unknown (S7 transitive)'),

  ('tool',        'deployment_reality',  'Named operator or institution with a quantified deployment result, or explicit "no public deployment as of [date]" (S1 SPAN-groundable)'),
  ('tool',        'supplier_access',     'Who can buy, at what scale, exclusivity, and lead times — named and sourced (S3 SPAN-groundable)'),
  ('tool',        'operational_fit',     'Verdict per transport mode (air/road/ocean) in workspace priority order; "not applicable to [mode]" where true (S4)'),
  ('tool',        'procurement_window',  'When commercially available at scale and when the workspace must commit; GAP claim acceptable when timeline is genuinely unknown (S7 transitive)')

ON CONFLICT (item_type, slot_key) DO NOTHING;

COMMIT;
