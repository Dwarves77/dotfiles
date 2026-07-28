-- 231 — Promotion policy engine: the policy record (P2, 2026-07-28). RLS-ENABLED FROM BIRTH (deny-all;
-- only the isPlatformAdmin-gated service-role admin API at /api/admin/promotion-policy reads/writes it).
-- The policy IS the authorization for promotion spend — same shape as a metered-gate amendment:
-- operator-authorized (authority, never blank), scoped (priority ordering), quality-floored (dual-verified
-- + firm-core), hard-capped (budget_envelope_usd), and EXPIRING (expires_at). FAIL-CLOSED DEFAULT: no
-- active, unexpired policy → no auto-promotion, no spend. The single-active partial unique index enforces
-- at most one active policy. Every promotion batch still independently passes the automated audit gate
-- (audit_sample_size/audit_min_accuracy), the metered gate + batch marker, Gate A/B per generated brief,
-- and a ledger projection that halts at envelope exhaustion. APPLIED 2026-07-28 via apply_migration before
-- the consumer route committed. Reversible (DROP TABLE promotion_policy).

BEGIN;

CREATE TABLE IF NOT EXISTS public.promotion_policy (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  authority              text NOT NULL,
  created_by             text NOT NULL,
  status                 text NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'paused', 'expired')),
  expires_at             timestamptz NOT NULL,
  priority_jurisdictions    text[] NOT NULL DEFAULT '{}',
  priority_topics           text[] NOT NULL DEFAULT '{}',
  priority_instrument_types text[] NOT NULL DEFAULT '{}',
  require_dual_verified  boolean NOT NULL DEFAULT true,
  require_firm_core      boolean NOT NULL DEFAULT true,
  budget_envelope_usd    numeric(10,2) NOT NULL CHECK (budget_envelope_usd >= 0),
  spent_usd              numeric(10,2) NOT NULL DEFAULT 0 CHECK (spent_usd >= 0),
  batch_size             integer NOT NULL DEFAULT 30 CHECK (batch_size > 0 AND batch_size <= 200),
  audit_sample_size      integer NOT NULL DEFAULT 30 CHECK (audit_sample_size > 0),
  audit_min_accuracy     numeric(4,3) NOT NULL DEFAULT 0.900 CHECK (audit_min_accuracy > 0 AND audit_min_accuracy <= 1),
  notes                  text
);

COMMENT ON TABLE public.promotion_policy IS
  'P2 promotion policy engine. The policy IS the authorization for promotion spend (fail-closed: no active/unexpired policy → no spend). RLS-enabled deny-all; only the isPlatformAdmin-gated service-role admin API touches it. Auto-selection reads the active policy to pick the next batch; every batch independently passes the audit gate, the metered gate + batch marker, Gate A/B per brief, and a ledger projection that halts at budget_envelope_usd exhaustion.';

CREATE UNIQUE INDEX IF NOT EXISTS uidx_promotion_policy_single_active
  ON public.promotion_policy ((status)) WHERE status = 'active';

ALTER TABLE public.promotion_policy ENABLE ROW LEVEL SECURITY;

COMMIT;
