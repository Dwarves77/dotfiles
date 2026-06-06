-- Migration 126: seed item_type_required_slots for research_finding (Research Summary format).
-- Mirrors migration 113 (regulatory slots) so validate_item_provenance criterion 5 stops passing
-- VACUOUSLY for research_finding (it had zero slots -> any shallow research brief passed). The
-- slots are the Research Summary's load-bearing, must-be-grounded content per the
-- analysis-construction-spec skill: the finding + its methodology/limits (S1), the decision
-- relevance / what it changes (S3), and what it does not resolve (S5). Each must be covered by a
-- FACT or GAP claim. ADDITIVE: INSERT-only, ON CONFLICT (item_type, slot_key) DO NOTHING.

INSERT INTO item_type_required_slots (item_type, slot_key, description)
VALUES
  ('research_finding', 'finding',            'The headline finding — what the research actually found, stated with its source'),
  ('research_finding', 'methodology_limits', 'Methodology in brief + scope and limitations (the analytical-honesty discriminator)'),
  ('research_finding', 'decision_relevance', 'What the finding changes for the workspace: claims it can or cannot make, decisions impacted'),
  ('research_finding', 'does_not_resolve',   'Limits, open questions, and convergent/contradictory research the finding does NOT settle')
ON CONFLICT (item_type, slot_key) DO NOTHING;
