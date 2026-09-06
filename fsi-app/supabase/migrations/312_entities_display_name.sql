-- 312 — entities.display_name: the human-readable label for an entity, additive. Lane SCOPE-READER,
-- 2026-09-06 (operator ruling, same date: "keep spec 08's scoping table, build the reader, and make
-- every customer-facing corridor reference human-readable, because nobody knows what CNSHA-NLRTM
-- means").
--
-- WHY THIS COLUMN. `entities.canonical_name` (migration 282) is the SEED string a kind's constructor
-- (`entity-id.mjs`'s `entityId(kind, seed)`) minted the entity's id from — for a corridor, the literal
-- "ORIGIN-DEST:mode" UN/LOCODE string (e.g. "CNSHA-NLRTM:ocean"), never meant to be customer-facing (see
-- migration 282's own header: entities is the identity table, not a presentation table). This column is
-- the SEPARATE, optional, human-readable label a reader derives once from that seed
-- (`src/lib/entities/unlocode-names.mjs`'s `formatCorridorLabel()`, e.g. "Shanghai (CN) → Rotterdam
-- (NL), ocean") and PERSISTS on the entity, so every surface that renders an entity (the Market Intel
-- carbon-cost overlay's corridor selector, the regulation detail "Corridors this applies on" block, a
-- future corridor detail view) reads one column rather than re-deriving the label from canonical_name at
-- every call site — the exact "one canonical function, not a second reimplementation at a call site"
-- discipline ADR-024 §5 already states for entity identity, extended here to entity DISPLAY.
--
-- NULLABLE, ADDITIVE, ZERO BACKFILL IN THIS MIGRATION. `src/lib/entities/corridor-scope.ts`'s
-- `listCorridorScopes()` already falls back to composing the label live from `unlocode-names.mjs` when
-- `display_name IS NULL` (see that file's own `resolveLabel()`) — so this column landing before its
-- backfill runs is never a regression, only a cache the backfill later fills in. Per CLAUDE.md standing
-- rule 3 (two-track migration policy): schema DDL here, applied by the coordinator BEFORE the dependent
-- backfill step (`scripts/entities/seed-corridors.mjs`'s label-backfill addition, same lane, `--apply`)
-- runs. `write-entity-scope.mjs` remains the ONE writer of `entity_scope` itself; this column and its
-- backfill are written by `seed-corridors.mjs` (the corridor entity's own producer), never a second
-- writer for the same row — one writer per table, this migration adds a column, not a table.
--
-- WHY NOT SCOPED TO kind='corridor' ONLY. The column is entity-generic (any kind may carry a display
-- label — a jurisdiction's full country name, an instrument's plain-language title) because nothing
-- about the column's SHAPE is corridor-specific; only today's ONE writer (seed-corridors.mjs, corridor
-- rows only) is corridor-scoped. A future lane backfilling a jurisdiction's or instrument's display_name
-- needs no further DDL — this is the same "structure once, populate progressively" posture migration
-- 283's progressive re-keying columns already establish.
--
-- SAFE BY CONSTRUCTION: `entities` has 665+ live rows (instrument alone) but ADD COLUMN ... nullable,
-- no default, no rewrite of any existing value — a pure additive schema change, no backfill, no lock
-- beyond the brief metadata lock every ADD COLUMN takes.
--
-- NUMBER COLLISION, NOTED FOR THE RECORD: lane w71f14 (2026-09-05, unmerged, superseded by operator
-- ruling) also wrote a file numbered 312 (DROP entities_scope), which was NOT merged into any train and
-- must never be applied. This file (312_entities_display_name.sql, lane SCOPE-READER) is the only live
-- migration 312. See docs/inventories/migrations.md's 312 row for the disposition of the superseded file.
--
-- APPLIED LIVE 2026-09-06 by the coordinator via Supabase MCP immediately after lane SCOPE-READER
-- reported (schema_migrations version 20260906154322, read back via `select version from
-- supabase_migrations.schema_migrations order by version desc limit 1`); post-check passed
-- (entities.display_name confirmed nullable text via information_schema.columns).
--
-- ── Preconditions ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.entities') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.entities does not exist — migration 282 must be applied first';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'entities' AND column_name = 'display_name'
  ) THEN
    RAISE NOTICE 'entities.display_name already exists — this migration is a no-op re-run';
  END IF;
END $$;

ALTER TABLE public.entities
  ADD COLUMN IF NOT EXISTS display_name text;

COMMENT ON COLUMN public.entities.display_name IS
  'Optional human-readable label, distinct from canonical_name (the identity SEED string an entity''s id '
  'was minted from — see migration 282). NULL until a kind-specific backfill writes one; every reader '
  '(src/lib/entities/corridor-scope.ts''s listCorridorScopes()) falls back to composing a label live from '
  'canonical_name when this is NULL, so the column landing ahead of its backfill is never a regression. '
  'For kind=''corridor'', written by scripts/entities/seed-corridors.mjs (the corridor producer) via '
  'src/lib/entities/unlocode-names.mjs''s formatCorridorLabel() — one writer per row, same as every other '
  'progressive-re-keying column in this schema (ADR-024 §5).';

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_col int;
  col_type text;
  col_nullable text;
BEGIN
  SELECT count(*), max(data_type), max(is_nullable) INTO n_col, col_type, col_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'entities' AND column_name = 'display_name';
  IF n_col <> 1 THEN
    RAISE EXCEPTION 'ABORT: entities.display_name missing after ADD COLUMN';
  END IF;
  IF col_type <> 'text' THEN
    RAISE EXCEPTION 'ABORT: entities.display_name has type %, expected text', col_type;
  END IF;
  IF col_nullable <> 'YES' THEN
    RAISE EXCEPTION 'ABORT: entities.display_name must be nullable (additive, no backfill in this migration)';
  END IF;

  RAISE NOTICE 'migration 312 OK: entities.display_name added (nullable text), 0 rows populated by design';
END $$;
