-- subject: Defect D29, `docs/plans/defect-fix-plan-2026-09-12.md` (lane L19, 2026-09-13; fix round 1, review finding C2, 2026-09-13). Schema: adds `claim_versions.note` (free-text context, the record-briefs batch id) and widens the `supersede_reason` CHECK to admit `superseded_by_record_briefs`, the reason `ledger-apply.mjs` writes when a `--allow-brief-overwrite` apply archives a prior claim the author-checked entry does not reproduce (archive first, then remove the current row; the same shape as `proven_inaccurate`). Fix round 1 also widens the sibling `claim_versions_proof_required` constraint (migration 210) to exempt `superseded_by_record_briefs` from carrying `inaccuracy_proof` (the archive's `proof` argument is a literal `null` -- a deliberately-dropped claim is not a proven-wrong one), the same exemption `'changed'` already has; without it every replace-ledger archive insert would violate the live constraint. Idempotent (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS then re-add). Numbered 321 because 318 is lane L6 and 319/320 are lane L15. NOT APPLIED; the coordinator applies it before this lane merges (two-track policy) and before any overwrite batch apply.
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
-- claim's full prior state, exactly as retrievable as a 'changed' version. Three schema changes support it:
--   (1) extend the supersede_reason vocabulary with 'superseded_by_record_briefs' (never remove a value);
--   (2) add `note` (free text) for the record-briefs batch id apply-record-briefs.mjs stamps on every
--       archive it writes under this reason -- unused (null) for every other reason;
--   (3) widen the sibling `claim_versions_proof_required` constraint (migration 210) so this new reason is
--       exempt from carrying `inaccuracy_proof`, the same way 'changed' already is. Without this widening
--       the constraint reads "any supersede_reason other than 'changed' requires inaccuracy_proof IS NOT
--       NULL" -- ledger-apply.mjs's replace-ledger archive calls versionPayload(..., 'superseded_by_
--       record_briefs', proof=null, ...) (a not-reproduced claim was DELIBERATELY dropped by the author,
--       not proven wrong, so there is no "proof" object to carry), and every such insert would be rejected
--       live -- exactly the symptom D29 exists to fix (batch 003 apply run 34747318946), because the
--       fail-closed catch in ledger-apply.mjs keeps the claim current on any archive-write failure. Review
--       finding C2 (2026-09-13), fix round 1.
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
  check (supersede_reason in ('changed', 'proven_inaccurate', 'orphaned_no_prose_referent', 'superseded_by_record_briefs'));
-- 'orphaned_no_prose_referent' stays: migration 210 admitted it and 22 live rows carry it (verified 2026-09-13);
-- dropping it would make this ADD CONSTRAINT fail against the live table.

-- Widen the proof-required sibling constraint (migration 210) so a replace-ledger archive is exempt from
-- carrying inaccuracy_proof, the same way 'changed' already is -- a not-reproduced claim dropped by the
-- author is deliberately-omitted, not proven-wrong, so there is no proof object to attach (review finding C2).
alter table public.claim_versions drop constraint if exists claim_versions_proof_required;
alter table public.claim_versions add constraint claim_versions_proof_required
  check (supersede_reason in ('changed', 'superseded_by_record_briefs') or inaccuracy_proof is not null);
