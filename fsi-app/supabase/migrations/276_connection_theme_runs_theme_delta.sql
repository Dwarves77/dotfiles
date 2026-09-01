-- 276 — connection_theme_runs.theme_delta: a real column for the theme-set diff, replacing the
-- args.theme_delta side-pocket. Lane FIX (integration), 2026-09-01.
--
-- WHY THIS EXISTS. analyze-corpus.mjs's F6 unit (theme-delta.mjs, `diffThemes`) computes a structured
-- persisted/renamed/split/merged/dissolved/appeared digest BEFORE every run's guardedDelete-all replaces
-- connection_themes (migration 253's own comment: "not append-only"). That lane's write set did not
-- include supabase/migrations/** (parallel lanes building at the same time, number-collision risk), so
-- the digest was stapled onto the SAME run's connection_theme_runs row inside the already-JSONB `args`
-- column instead — `args: { dry, signals, theme_delta }` — and analyze-corpus.mjs's own header (lines
-- 33-36) and persist-step comment named this a placeholder: "TO-VERIFY … whether the coordinator wants a
-- dedicated connection_theme_runs.theme_delta jsonb column instead — trivial to add later (ALTER TABLE …
-- ADD COLUMN, additive, no backfill) without disturbing this digest's shape."
--
-- WHY A DEDICATED COLUMN AND NOT THE JSONB SIDE-POCKET. `args` is documented (migration 253, its own
-- COMMENT ON COLUMN) as "the CLI args the pass ran with (threshold, limit, dry, etc.) — the
-- reproducibility record": what analyze-corpus.mjs was INVOKED WITH. theme_delta is a computed RESULT of
-- the run, not an input argument — burying it inside `args` conflates the two, and a consumer that wants
-- "did the theme set change this run" has to know to reach into a column documented as holding something
-- else. A durable, independently-queryable/independently-indexable structure is the correct home; this
-- migration gives it one. No change to `args`' existing meaning — it goes back to holding only the CLI
-- args it was originally documented to hold (see the analyze-corpus.mjs write-site change riding with
-- this migration, same commit).
--
-- ADDITIVE AND SAFE. `theme_delta` is a single `ALTER TABLE … ADD COLUMN`, NULLABLE, no default beyond
-- SQL's implicit NULL, no CHECK, no backfill of historical rows (their digest already lives, historically,
-- inside their own `args.theme_delta` — this migration does not touch existing rows, so that history is
-- neither moved nor lost; only THIS COMMIT's write site stops writing NEW rows' digests into `args` and
-- starts writing them into this column). connection_theme_runs is service-role-write-only (migration 253:
-- `connection_theme_runs_admin_write`, `auth.role() = 'service_role'`) and public-read (`
-- connection_theme_runs_read`, `USING (true)`) — a new nullable column changes neither policy's predicate,
-- so no RLS change is needed here. No existing consumer of `connection_theme_runs` (grepped: only
-- analyze-corpus.mjs itself writes it; nothing else in src/ or scripts/ reads or writes this table today)
-- is broken by an additive column.
--
-- TWO-TRACK POLICY (CLAUDE.md standing rule 3): schema DDL, so it applies via the sanctioned lane BEFORE
-- the dependent write-site code lands — this migration performs no data write of its own. Authored by
-- lane FIX (integration), left UNAPPLIED. Applied only by the coordinator, before the write-site change
-- (already riding in this same commit) reaches a live pipeline invocation — a run between "code deployed"
-- and "migration applied" would otherwise attempt to write a column that does not yet exist and error the
-- whole pass. Ordering constraint stated so the coordinator's apply order is unambiguous.
--
-- REVERSAL / ROLLBACK FILE. None shipped, by the same established convention migration 274's header
-- documents in full and re-verifies here rather than re-asserting on faith: `supabase/rollbacks/` holds
-- 164-171, 180-185, 190-195, 200, 264, 267 — every one reverses either a data-mutating migration, a
-- trivially-invertible rename, or an ADD COLUMN on an already-live, POPULATED table where a bad addition
-- could plausibly need undoing under real rows (267). This migration's shape is different again: an ADD
-- COLUMN, NULLABLE, no CHECK, no backfill, on a table whose only writer is being changed in the SAME
-- commit to populate it — the comparable precedent is 267 itself, whose own header states the ADD COLUMN
-- portions are additive-and-nullable and does not carry a per-column rollback beyond the one file it
-- ships for its riskier envelope columns. Unconditionally safe if the coordinator wants one anyway:
-- `ALTER TABLE public.connection_theme_runs DROP COLUMN IF EXISTS theme_delta;` — noted here rather than
-- authored speculatively, matching 274's convention for a from-scratch additive change with no existing
-- risk surface.

BEGIN;

ALTER TABLE public.connection_theme_runs
  ADD COLUMN IF NOT EXISTS theme_delta JSONB;

COMMENT ON COLUMN public.connection_theme_runs.theme_delta IS
  'Structured theme-set diff for THIS run (src/lib/connections/theme-delta.mjs diffThemes output: '
  'persisted/renamed/split/merged/dissolved/appeared + summary counts), computed against the PRIOR '
  'connection_themes contents before this run''s guardedDelete-all replaced them. NULL for any run that '
  'predates this column (their digest, if computed, was recorded inside that row''s own args.theme_delta '
  '— a historical shape this migration does not backfill). Populated going forward by '
  'scripts/connections/analyze-corpus.mjs; `args` reverts to holding only the CLI args it is documented '
  '(migration 253) to hold.';

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_cols     int;
  col_type   text;
  col_null   text;
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'connection_theme_runs';
  IF n_cols <> 14 THEN
    RAISE EXCEPTION 'ABORT: connection_theme_runs has % columns, expected 14 (13 prior + theme_delta)', n_cols;
  END IF;

  SELECT data_type, is_nullable INTO col_type, col_null FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'connection_theme_runs' AND column_name = 'theme_delta';
  IF col_type IS NULL THEN
    RAISE EXCEPTION 'ABORT: connection_theme_runs.theme_delta was not created';
  END IF;
  IF col_type <> 'jsonb' THEN
    RAISE EXCEPTION 'ABORT: connection_theme_runs.theme_delta has type %, expected jsonb', col_type;
  END IF;
  IF col_null <> 'YES' THEN
    RAISE EXCEPTION 'ABORT: connection_theme_runs.theme_delta must be nullable (got is_nullable=%)', col_null;
  END IF;

  RAISE NOTICE 'migration 276 OK: connection_theme_runs.theme_delta added (jsonb, nullable, no backfill)';
END $$;

COMMIT;
