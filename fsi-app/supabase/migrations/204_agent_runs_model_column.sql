-- 204 — agent_runs.model column (operator ruling 2026-07-15, from the build-phase spend-regime ledger findings).
-- Per-MODEL actuals are a BUILD-PHASE MEASUREMENT REQUIREMENT (spend-regime: actuals per item/class/MODEL). The
-- model was already known at the spend chokepoint (recordSpendCall) but stashed in errors[].telemetry.model — a
-- documented "NO-DDL, queued" workaround. This lands the queued column so per-model cost is first-class, not
-- JSON-buried. Nullable + backfill-friendly; the model-tier rule (Sonnet full-ground vs Haiku classify) reads it.
ALTER TABLE public.agent_runs ADD COLUMN IF NOT EXISTS model text;

COMMENT ON COLUMN public.agent_runs.model IS
  'Model id for a paid call row (e.g. claude-sonnet-4-6, claude-haiku-4-5-20251001). First-class per-model actuals (operator ruling 2026-07-15, build-phase measurement). Cost-0 marker/aggregate rows may leave it null.';
