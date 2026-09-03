-- 299 — item_type_required_slots: land the three Wave-2/3 slots the kit already required (Lane POP-PREP,
-- 2026-09-03, population-pass readiness). NOT APPLIED by this lane — no DB credentials here; the
-- coordinator applies it. See docs/plans/population-pass-2026-09-03.md for the full sequence.
--
-- WHY THIS EXISTS. Lane INTAKE (2026-09-02, Wave 2 "build the tools before populating" ruling) extended
-- `scripts/mint/item-type-required-slots.json` — the kit's own mirror of this table — with three new
-- REQUIRED slots: `corridor_identity` on `market_signal`/`initiative` (ADR-024 decision 4's UN/LOCODE
-- port-pair + mode), and `evidence_agreement_signal` + `source_authority_signal` on `research_finding`
-- (spec 03 §4's "two scores, never merged"). The coordinator DELIBERATELY withheld the matching rows from
-- this LIVE table (MINT-RUNBOOK.md §13's own "Coordinator disposition"): the live
-- `validate_item_provenance` trigger's criterion 5 re-evaluates on every section/claim insert touching an
-- item, and adding these rows before every existing item of these three types carries a claim mentioning
-- the new slot_key literally would flip those items to `quarantined` on their next touch. The kit staying
-- STRICTER than the live table was the safe direction until the population pass that re-mints the
-- existing corpus through the (now-current) extractor — this migration, and that pass, are that moment.
--
-- SEQUENCE THIS MIGRATION IS PART OF (do not apply out of order):
--   1. Run the self-check query below (as it stands, BEFORE this migration's INSERTs land) to get the
--      exact count N of currently-verified market_signal/initiative/research_finding items that carry no
--      claim mentioning the new slot_key — these are the items criterion 5 will start failing the moment
--      the INSERTs below commit.
--   2. Apply this migration (INSERT-only, ON CONFLICT DO NOTHING — additive, matches migrations 113/126/
--      129's own convention for this table).
--   3. In the SAME population pass, the batch selection (docs/plans/population-pass-2026-09-03.md's
--      dispatch table) includes those N items for re-mint — i.e. re-run through the current
--      record-facts.mjs (which already emits `corridor_identity`/`evidence_agreement_signal`/
--      `source_authority_signal` claims, honestly FACT or GAP) via the SAME guarded write path a fresh
--      mint uses, so every one of the N items gains a claim covering its new required slot(s) before or
--      immediately after the rows land, and criterion 5 is never actually seen to fail on a live read
--      (the trigger only re-fires on a write to that item, and the re-mint IS that write).
--   4. Read back: zero market_signal/initiative/research_finding item is `quarantined` for reason
--      `missing_required_slot` that was `verified` before step 1's count.
--
-- SELF-CHECK — run this BEFORE applying this migration, exactly the shape criterion 5 itself evaluates
-- (`claim_text ILIKE '%' || slot_key || '%'`, `claim_kind IN ('FACT','GAP')` — migration 113's own
-- comment states this pattern; section_claim_provenance's shape is migration 112's):
--
--   WITH new_required_slots(item_type, slot_key) AS (
--     VALUES
--       ('market_signal', 'corridor_identity'),
--       ('initiative', 'corridor_identity'),
--       ('research_finding', 'evidence_agreement_signal'),
--       ('research_finding', 'source_authority_signal')
--   )
--   SELECT i.item_type, s.slot_key, COUNT(DISTINCT i.id) AS items_missing_this_slot
--   FROM intelligence_items i
--   JOIN new_required_slots s ON s.item_type = i.item_type
--   WHERE i.provenance_status = 'verified'
--     AND NOT EXISTS (
--       SELECT 1 FROM section_claim_provenance c
--       WHERE c.intelligence_item_id = i.id
--         AND c.claim_kind IN ('FACT', 'GAP')
--         AND c.claim_text ILIKE '%' || s.slot_key || '%'
--     )
--   GROUP BY i.item_type, s.slot_key
--   ORDER BY i.item_type, s.slot_key;
--
--   -- the single number the sequence above calls N (distinct items, not slot-rows — a research_finding
--   -- item missing BOTH new slots still counts once):
--   WITH new_required_slots(item_type, slot_key) AS (
--     VALUES
--       ('market_signal', 'corridor_identity'),
--       ('initiative', 'corridor_identity'),
--       ('research_finding', 'evidence_agreement_signal'),
--       ('research_finding', 'source_authority_signal')
--   )
--   SELECT COUNT(DISTINCT i.id) AS n_would_fail
--   FROM intelligence_items i
--   JOIN new_required_slots s ON s.item_type = i.item_type
--   WHERE i.provenance_status = 'verified'
--     AND NOT EXISTS (
--       SELECT 1 FROM section_claim_provenance c
--       WHERE c.intelligence_item_id = i.id
--         AND c.claim_kind IN ('FACT', 'GAP')
--         AND c.claim_text ILIKE '%' || s.slot_key || '%'
--     );
--
-- [HYPOTHESIS, not read live — this lane has no DB credentials]: for market_signal/initiative, N is
-- expected to equal the FULL count of currently-verified items of those two types — every
-- `population-turn` run to date (through `mint-run-014.json`, the last landed run) exported ONLY from
-- `census_worklist`, whose exporter (`export-census-rows.mjs`) resolves item_type through
-- `resolveIdentity`'s EUR-Lex/UK-legislation/federal-register/registered-institution paths, none of which
-- ever return `market_signal` (grep-verified: that string does not appear in export-census-rows.mjs) — so
-- no record-grade market_signal/initiative item exists yet, and `corridor_identity` as a slot_key string
-- is new with Lane INTAKE (2026-09-02), never emitted by any prior mint path or brief-grade synthesis
-- (grep-verified: no occurrence outside record-facts.mjs, its tests, and the docs describing it).
--
-- For research_finding the same reasoning has ONE CAVEAT worth naming: a SECOND, separate extractor,
-- `src/lib/intake/record-facts-research.mjs` (`buildResearchRecordPayload`, Lane RSRCH, Wave 2), also
-- emits `evidence_agreement_signal`/`source_authority_signal` slot claims, and is the builder
-- `scripts/turns/research-sweep.mjs` (the `source-sweep` family's `research` subject) actually calls —
-- NOT this migration's own record-facts.mjs. If that subject has been dispatched in APPLY mode before
-- this migration lands, some verified research_finding items may already carry these claims and N for
-- research_finding could be LOWER than the full count. This lane found no evidence in
-- docs/PROGRAM-BOARD.md or docs/ops/session-log.md Addenda 84-85 that `source-sweep --subject research
-- --apply` has ever run (RSRCH's own board row describes what was BUILT, not a dispatch; R-D, the
-- adjacent market-series ruling, is still listed OPEN in finish-plan-2026-09-02.md §1, i.e. not
-- executed) — so N is still expected to equal the full verified research_finding count, but the
-- coordinator should confirm no `source-sweep` research apply has landed before trusting that without
-- running the query above.
--
-- REVERSIBLE: `DELETE FROM item_type_required_slots WHERE item_type IN ('market_signal','initiative',
-- 'research_finding') AND slot_key IN ('corridor_identity','evidence_agreement_signal',
-- 'source_authority_signal');` — additive only, no backfill, no dependent object; the kit file already
-- carries these rows regardless of live table state (kit stricter than DB is always safe), so a rollback
-- here only widens which existing items are exempt from the new criterion-5 checks again.
--
-- ADDITIVE ONLY, same convention as migrations 113/126/128/129: INSERT-only into the EXISTING
-- `item_type_required_slots` table (migration 112), idempotent via ON CONFLICT (item_type, slot_key) DO
-- NOTHING against that table's own UNIQUE constraint. No ALTER/DROP, no backfill of any existing
-- `intelligence_items` / `section_claim_provenance` row.

BEGIN;

INSERT INTO item_type_required_slots (item_type, slot_key, description)
VALUES
  ('market_signal', 'corridor_identity',
   'The UN/LOCODE origin-destination port pair and transport mode the signal names together (ADR-024 decision 4). Grounded by a verbatim span naming both ends and a mode together; GAP when the source names a lane without both ends and a mode stated together.'),

  ('initiative', 'corridor_identity',
   'The UN/LOCODE origin-destination port pair and transport mode the initiative names together (ADR-024 decision 4). Grounded by a verbatim span naming both ends and a mode together; GAP when the source names a lane without both ends and a mode stated together.'),

  ('research_finding', 'evidence_agreement_signal',
   'The source''s own language about how settled or contested the finding is (peer-reviewed, independently confirmed, disputed, preliminary — spec 03 §4''s evidence-agreement score input). Grounded by a verbatim span; GAP when the source states no such signal.'),

  ('research_finding', 'source_authority_signal',
   'The source''s own language about who published or issued the finding (published by, issued by, a named journal/laboratory/standards body — spec 03 §4''s source-authority score input). Grounded by a verbatim span; GAP when the source states no such signal.')

ON CONFLICT (item_type, slot_key) DO NOTHING;

COMMIT;
