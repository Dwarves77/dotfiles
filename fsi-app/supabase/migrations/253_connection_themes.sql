-- Migration 253: connection_themes + connection_theme_runs (flywheel U2, 2026-08-10).
--
-- APPLIED LIVE via Supabase MCP ahead of this commit (two-track migration policy, CLAUDE.md rule 3) —
-- audit record, not a pending apply.
--
-- Persists the output of src/lib/connections/cluster.mjs (U1) so the operator command
-- scripts/connections/analyze-corpus.mjs (U2) has somewhere to write, and the themes surface (U3) has
-- something to read without recomputing at read time. Derived, recomputable data: each analyze-corpus
-- pass fully REPLACES the prior contents of connection_themes (guardedDelete-all + guardedInsertMany),
-- so this table is a cache of the last run, not an append-only history — connection_theme_runs is the
-- append-only audit trail of every pass (rule 15: the runs ledger is the execution record).
--
-- id IS the theme's natural cluster anchor (cluster.mjs's `theme.id` — the lexicographically smallest
-- member id, itself a real intelligence_items.id, guaranteed unique within one clustering pass since
-- themes are disjoint components). Reusing it as the primary key (rather than a fresh gen_random_uuid()
-- per pass) gives cross-pass identity for the SAME real-world cluster: on a stable corpus the fixpoint
-- guarantee means the same members converge to the same anchor, so the same gap's subject_ref (built
-- from this id in gaps.mjs) stays stable across reruns — the property U2's dedup-before-insert needs.
--
-- Reversible: DROP TABLE connection_theme_runs; DROP TABLE connection_themes;

CREATE TABLE IF NOT EXISTS public.connection_themes (
  id                UUID PRIMARY KEY,
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  member_ids        UUID[] NOT NULL,
  dominant_signals  JSONB NOT NULL DEFAULT '[]'::jsonb,
  surfaces          TEXT[] NOT NULL DEFAULT '{}',
  density           REAL NOT NULL,
  convergence       REAL NOT NULL,
  pivots            JSONB NOT NULL DEFAULT '[]'::jsonb,
  CHECK (array_length(member_ids, 1) >= 2)
);

COMMENT ON TABLE public.connection_themes IS
  'Cache of the last connection-cluster pass (flywheel U1/U2). Fully replaced every analyze-corpus run — not append-only. See connection_theme_runs for the audit trail.';
COMMENT ON COLUMN public.connection_themes.id IS
  'The theme''s natural anchor: cluster.mjs sets this to the lexicographically smallest member id. Stable across reruns on a stable corpus (fixpoint guarantee) — gaps.mjs keys coverage_gap subject_ref off this.';
COMMENT ON COLUMN public.connection_themes.member_ids IS
  'intelligence_items.id[] belonging to this theme, F4-basic ordered (date ascending, undated last) by cluster.mjs.';
COMMENT ON COLUMN public.connection_themes.dominant_signals IS
  'Array of {signal, weight} aggregated from intra-theme edge basis (cluster.mjs), strongest first.';
COMMENT ON COLUMN public.connection_themes.pivots IS
  'Array of {id, centrality} — top members by weighted-degree centrality (F2, cluster.mjs).';

CREATE INDEX IF NOT EXISTS idx_connection_themes_convergence ON public.connection_themes (convergence DESC);

CREATE TABLE IF NOT EXISTS public.connection_theme_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at        TIMESTAMPTZ NOT NULL,
  finished_at       TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'error')),
  args              JSONB NOT NULL DEFAULT '{}'::jsonb,
  nodes_read        INTEGER,
  edges_read        INTEGER,
  nodes_clustered   INTEGER,
  edges_used        INTEGER,
  themes_written    INTEGER,
  gaps_flagged      INTEGER,
  rounds            INTEGER,
  error_message     TEXT
);

COMMENT ON TABLE public.connection_theme_runs IS
  'Append-only ledger: one row per analyze-corpus.mjs invocation (flywheel U2). started/finished + full counts, so every pass is auditable (rule 15 — the runs ledger is the execution record, not the code that cites it).';
COMMENT ON COLUMN public.connection_theme_runs.args IS
  'The CLI args the pass ran with (threshold, limit, dry, etc.) — the reproducibility record.';

CREATE INDEX IF NOT EXISTS idx_connection_theme_runs_started ON public.connection_theme_runs (started_at DESC);

ALTER TABLE public.connection_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_theme_runs ENABLE ROW LEVEL SECURITY;

-- Public read (same posture as item_cross_references — derived analytics, not PII; migration 005).
CREATE POLICY "connection_themes_read" ON public.connection_themes FOR SELECT USING (true);
CREATE POLICY "connection_theme_runs_read" ON public.connection_theme_runs FOR SELECT USING (true);

-- Service-role-only write (guarded path only — analyze-corpus.mjs via scripts/lib/db.mjs).
CREATE POLICY "connection_themes_admin_write" ON public.connection_themes FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "connection_theme_runs_admin_write" ON public.connection_theme_runs FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
