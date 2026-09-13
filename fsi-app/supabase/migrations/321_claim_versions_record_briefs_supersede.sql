-- 321_claim_versions_record_briefs_supersede.sql
-- D29 (defect-fix-plan-2026-09-12, lane L19). Overwriting an existing brief with a record-briefs entry
-- (--allow-brief-overwrite) delivers a COMPLETE, author-checked ledger -- unlike a paid re-ground (a partial
-- re-extract, re-grounds-never-destroy doctrine, migration 208), a prior claim the entry does not reproduce
-- was DELIBERATELY left out by the author (below the floor / not verbatim), not merely missed. Keeping such
-- a claim in the current ledger left a regenerated item quarantined for claims its own new authoring
-- rejected (evidence: batch 003 apply run 34747318946, items 87ed781c/bec305e1/fabda0e7).
--
-- groundBriefImpl's replaceLedger mode (src/lib/agent/canonical-pipeline.ts, via
-- src/lib/agent/ledger-apply.mjs's applyLedgerDiff opts.replaceLedger) archives such a claim to
-- claim_versions instead of leaving it current -- STILL NEVER A DELETE OF DATA: the archived row is the
-- claim's full prior state, exactly as retrievable as a 'changed' version. Two schema changes support it:
--   (1) extend the supersede_reason vocabulary with 'superseded_by_record_briefs' (never remove a value);
--   (2) add `note` (free text) for the record-briefs batch id apply-record-briefs.mjs stamps on every
--       archive it writes under this reason -- unused (null) for every other reason.
--
-- Idempotent. AUTHORED, NOT YET APPLIED as of this lane (no DB access in this worktree; migration
-- two-track policy, CLAUDE.md standing rule 3 -- schema DDL applies via Supabase CLI before the dependent
-- code path is exercised live). The code in canonical-pipeline.ts/ledger-apply.mjs is unit-tested against a
-- fake `sb` (ledger-apply.test.mjs) that does not depend on this migration being live; the live write path
-- needs it applied before an --allow-brief-overwrite batch runs.

alter table public.claim_versions add column if not exists note text;

comment on column public.claim_versions.note is
  'Free-text context for a version row -- e.g. the record-briefs batch id for supersede_reason=''superseded_by_record_briefs'' (migration 321, D29). Null for every other reason.';

alter table public.claim_versions drop constraint if exists claim_versions_supersede_reason_chk;
alter table public.claim_versions add constraint claim_versions_supersede_reason_chk
  check (supersede_reason in ('changed', 'proven_inaccurate', 'superseded_by_record_briefs'));
