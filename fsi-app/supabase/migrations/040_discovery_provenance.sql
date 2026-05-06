-- 038a_discovery_provenance.sql
-- W2.B — discovery agent provenance on provisional_sources.
--
-- Adds a single new column so query surfaces and audit views can filter
-- candidate sources by the jurisdiction the discovery agent was running
-- against when it surfaced them. The existing `discovered_via` column on
-- provisional_sources (migration 004) already captures the discovery
-- channel (worker_search / citation_detection / skill_recommendation /
-- manual_add), so this migration does not add a new channel CHECK — the
-- discovery agent uses `discovered_via='worker_search'` until a future
-- channel split is warranted.
--
-- Naming note: filename uses "038a" (not "038") because W2.A may also
-- reserve migration 038 in a concurrent worktree. If both 038s land
-- before integration, the orchestrator will rename one to 039. See
-- docs/W2B-discovery-agent-spec.md for the dependency note. If W2.A's
-- 038 turns out to overlap (i.e. it also adds discovered_for_jurisdiction
-- on provisional_sources), this migration becomes a no-op via the
-- IF NOT EXISTS guard.
--
-- The CHECK constraint on `discovered_via` from migration 004 is left
-- alone. The original spec for 038 proposed a parallel `discovered_via`
-- with allowed values agent/citation-extraction/manual/bulk-import; that
-- conflicts with the existing column and would require a constraint
-- swap. Reusing the existing column is the simpler path and keeps the
-- schema single-sourced.

ALTER TABLE provisional_sources
  ADD COLUMN IF NOT EXISTS discovered_for_jurisdiction TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_provisional_discovered_for_jurisdiction
  ON provisional_sources(discovered_for_jurisdiction)
  WHERE discovered_for_jurisdiction IS NOT NULL;

COMMENT ON COLUMN provisional_sources.discovered_for_jurisdiction IS
  'W2.B: ISO 3166-1 / 3166-2 / supranational code that the discovery agent was running against when this candidate was surfaced. NULL for rows added before W2.B or via channels that do not carry a jurisdiction context (citation extraction, manual add).';
