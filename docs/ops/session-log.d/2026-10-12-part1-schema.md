# 2026-10-12, lane P1-11: schema Keep/Refactor/Trash register

Accomplished:
- Read whole: the production schema dump (docs/plans/rebuild/schema-2026-10-12.sql, PG 15.14, schema only) and fsi-app/supabase/functions/capture-worker/index.ts (614 lines); prior registers named in the brief and the hand-overs from the other Part 1 registers.
- Wrote docs/plans/rebuild/part1/schema.md (sections 1 to 8): verdict REFACTOR AND PORT; 865 objects today, 832 clean; current code LOC 15,200 (dump 9,734, capture-worker 398, seeds 5,068) vs about 8,461 clean. Section 2 carries one verdict row per relation (128 rows: 98 KEEP, 21 REFACTOR, 9 TRASH).
- Appended INV-299 to INV-307 to docs/plans/rebuild/data-invariants.md and updated the Count line.
- Wrote 252 BACKLOG STATUS cells under fsi-app/supabase: 179 TRASH, 50 CONFIRMED-P1, 18 CLOSED: PR 1160, 5 REFUTED.

Decisions: none new; the register records eight rulings owed (schema.md section 8), each with a recommendation and mechanism.

Blockers: none for the lane. The chain-proof oracle (apply-schema-dump.mjs) fails 10/10 with 8 fatal errors (C3:L42); INV-307 makes the new schema file apply clean on an empty PG of the prod major the gate.

Next steps: coordinator merges; the port lane builds schema.sql from section 8 in the port order given there; operator rulings 1 to 8 in section 8.
