-- 208_claim_versions_nondestructive_grounding.sql
-- GROUNDING IS NON-DESTRUCTIVE (operator doctrine 2026-07-16). A new grounding COMPARES against the prior
-- claim ledger; it never delete-and-replaces it. The CURRENT ledger stays in section_claim_provenance
-- (consumers unchanged). This sibling table is the PRESERVED HISTORY: the prior state of a claim whenever a
-- ground CHANGES its attribution (supersede_reason='changed'), and the final state of a claim erased on
-- PROVEN inaccuracy (supersede_reason='proven_inaccurate', with the proof). So the new-vs-old diff always
-- survives a ground and no data is lost.
--
-- NO cascading FK to section_claim_provenance or intelligence_items: erasing/deleting a current claim row or
-- its item must NOT cascade-delete the preserved history (that would defeat the entire point). current_claim_id
-- and intelligence_item_id are SOFT references (plain uuid), not foreign keys. This table is append-only.
-- Idempotent.

create table if not exists public.claim_versions (
  id uuid primary key default gen_random_uuid(),
  current_claim_id uuid,                 -- soft ref to the live section_claim_provenance row; NULL once that row is erased
  intelligence_item_id uuid not null,    -- soft ref (no FK: history survives item deletion)
  section_row_id uuid,
  claim_text text,
  claim_kind text,
  source_span text,
  source_id uuid,
  search_result_id uuid,
  source_tier_at_grounding int,
  mint_hold_reason text,
  version_number int not null default 1,
  supersede_reason text not null,        -- 'changed' | 'proven_inaccurate'
  inaccuracy_proof jsonb,                -- populated ONLY for proven_inaccurate (the proof: contradicting span / superseded source)
  superseded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists claim_versions_item_idx on public.claim_versions (intelligence_item_id);
create index if not exists claim_versions_current_idx on public.claim_versions (current_claim_id);

-- Vocabulary guard on supersede_reason.
alter table public.claim_versions drop constraint if exists claim_versions_supersede_reason_chk;
alter table public.claim_versions add constraint claim_versions_supersede_reason_chk
  check (supersede_reason in ('changed', 'proven_inaccurate'));

-- erase-only-on-proven-inaccuracy: a proven_inaccurate archive MUST carry its proof (the contradicting evidence).
alter table public.claim_versions drop constraint if exists claim_versions_proof_required;
alter table public.claim_versions add constraint claim_versions_proof_required
  check (supersede_reason <> 'proven_inaccurate' or inaccuracy_proof is not null);

comment on table public.claim_versions is
  'Preserved claim history (non-destructive grounding doctrine 2026-07-16). Append-only. current_claim_id / intelligence_item_id are SOFT refs (no cascading FK) so history survives current-row/item deletion. supersede_reason=changed (old state before a re-attribution) | proven_inaccurate (final state + inaccuracy_proof of an erased claim).';
