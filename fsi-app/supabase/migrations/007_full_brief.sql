/* status: APPLIED OUTSIDE LEDGER (no schema_migrations row; evidence: replay run 37779804328: 035 depends on intelligence_items.full_brief, created only in 007_full_brief; siblings by the same shape) [HYPOTHESIS until objects verified] (as of 2026-10-08; see APPLIED-MAP.json) */
-- subject: Add full_brief column for skill-standard intelligence briefs
-- Add full_brief column for skill-standard intelligence briefs
-- This is the primary content field — rich markdown regulatory playbooks
-- whatIsIt/whyMatters/keyData remain as card preview summaries
--
-- 2026-10-08 (lane MIG-CI, ruling after replay run 37780736558, MIG-HIST-2 third ruled residue): the CREATE OR REPLACE FUNCTION
-- get_workspace_intelligence block (a 32 column form) was removed from this file because it cannot execute at its position in
-- any order. After 006_multi_tenant, which creates the function with 43 columns, Postgres refuses it (42P13, cannot change
-- return type of existing function; the same error 272_customer_rpcs_project_jurisdiction_iso.sql documents in its header
-- from a production apply, found by execution 2026-08-30). Before 006 the function body names tables 006 creates.
-- The three ADD COLUMN statements stay: intelligence_items.full_brief exists in production and nothing else creates it.
-- The function end state is set by 077_rpc_membership_checks.sql (DROP and re-CREATE) and the migrations after it; the schema
-- oracle compares pg_get_functiondef of every public function, so a wrong end state fails the oracle step.
-- [HYPOTHESIS] This file ran in production only as far as its ADD COLUMN statements.

ALTER TABLE intelligence_items ADD COLUMN IF NOT EXISTS full_brief TEXT;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS full_brief TEXT;
ALTER TABLE staged_updates ADD COLUMN IF NOT EXISTS full_brief TEXT;
