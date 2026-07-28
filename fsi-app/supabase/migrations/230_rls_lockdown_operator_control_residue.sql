-- 230 — RLS lockdown of the anon-writable operator-control residue (P2 structural gate, 2026-07-28).
--
-- FINDING (RLS residue audit, per the promotion-admin dispatch): 8 public tables had RLS DISABLED *and*
-- full DELETE/INSERT/UPDATE/TRUNCATE/SELECT grants to both `anon` and `authenticated` → anon-key writable
-- through PostgREST. The anon key ships in the client bundle, so this is a real hole. Operator-control
-- tables in the set: funded_pass_runlock (the SPEND runlock), disposition_ledger (the pipeline audit
-- trail), mutation_leases (lease coordination) — plus corpus_census, coverage_gap_candidates,
-- coverage_gap_census_findings, drain_worklist, claim_versions.
--
-- FIX: ENABLE ROW LEVEL SECURITY with NO policies = deny-all to anon/authenticated; service_role has
-- BYPASSRLS so every internal write (scripts, the agent runtime — canonical-pipeline uses
-- SUPABASE_SERVICE_ROLE_KEY) is unaffected. Same proven posture as census_worklist (RLS on, no policies).
--
-- VERIFIED no legitimate anon/cookie-client path before applying: 7/8 have zero src references; the one
-- exception, claim_versions, is written only by the agent runtime via the service-role client. APPLIED
-- 2026-07-28 via apply_migration. Reversible (ALTER TABLE ... DISABLE ROW LEVEL SECURITY).

BEGIN;
ALTER TABLE public.claim_versions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corpus_census                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coverage_gap_candidates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coverage_gap_census_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disposition_ledger           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drain_worklist               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funded_pass_runlock          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mutation_leases              ENABLE ROW LEVEL SECURITY;
COMMIT;
