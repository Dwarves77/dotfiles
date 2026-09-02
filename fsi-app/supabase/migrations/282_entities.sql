-- 282 — the entity spine: entity_kind, entities, entity_identifiers, entity_scope
-- (docs/specs/08-flywheel-design.md §1.1, §1.2; lane DP-SPINE, system-completion train, 2026-09-02).
--
-- WHAT THIS IS. Spec §1.1: "Class-table inheritance over a single identity table. One `entities` row per
-- real-world thing, carrying the permanent primary key and the crosswalk". This migration ships the
-- IDENTITY TABLE (`entities`) and its CROSSWALK (`entity_identifiers`) plus the JOIN table that makes any
-- entity addressable from any surface (`entity_scope`, spec §1.2) — exactly the three tables spec §1.1/§1.2
-- give a complete `CREATE TABLE` for. The per-kind attribute tables spec §1.2 also shows (`corridors`,
-- `obligations`, `signposts`) are NOT created here: this migration is scoped to the spine proper (the
-- identity table + its crosswalk + the addressability join), not the v1 kind roster's attribute tables,
-- which are a separate, later build (system-completion-plan.md §2 names this lane's scope as exactly
-- "entity_kind enum, entities, entity_identifiers ... Add entity_scope from §1.2"). A `kind='corridor'`
-- row in `entities` is fully meaningful without a `corridors` attribute table, the same way migration
-- 258's `cl_corridor_id()` mints a self-validating content-addressed key with "no table dependency by
-- design" — see that migration's own header for the identical reasoning applied one level up here.
--
-- DDL IS BYTE-FAITHFUL TO SPEC §1.1/§1.2, deliberately. Every column, CHECK and index below is transcribed
-- from the spec's own `CREATE TABLE` blocks with NOTHING added (no extra CHECK on `entity_identifiers.scheme`
-- beyond what §1.1 shows, even though `src/lib/entities/crosswalk.mjs`'s `SCHEMES` frozen list is the
-- natural candidate for one — the spec's own DDL does not carry that CHECK, and this migration's job is to
-- match the spec, not to improve on it uninvited). The one addition beyond spec text is idempotency
-- machinery (`IF NOT EXISTS` / a `DO $$` guard for `CREATE TYPE`, which has no `IF NOT EXISTS` form) and RLS,
-- neither of which the spec's illustrative DDL block addresses.
--
-- RLS POSTURE mirrors `sources`/`regions`/`regional_data_facts` (004/106 — world-readable, no PII, no
-- explicit GRANT needed beyond the schema-level grant those migrations already establish) rather than
-- migration 258's narrower `TO authenticated` posture: entity identity (a jurisdiction code, an instrument's
-- CELEX key, an organisation's host) is exactly the same class of world-readable reference data `sources`
-- and `regions` already expose to anon, and restricting it would make every future customer-surface read of
-- an entity_id need a second, wider-scoped client for no security reason (entity rows carry no computed
-- figures, no licence-gated content — those stay behind their own tables' existing RLS untouched).
--
-- WRITES arrive through the guarded backfill path (`scripts/entities/backfill-entities.mjs`, same commit)
-- via the service-role client, which bypasses RLS — no INSERT/UPDATE/DELETE policy is created here, matching
-- migration 258's "writes arrive through the service role" posture for its own new tables.
--
-- PROGRESSIVE RE-KEYING (ADR-024, docs/decisions/ADR-024-decision-propagation.md): this migration creates
-- ONLY the spine tables. The nullable FK columns/join table that let existing rows POINT AT an entity
-- (`intelligence_items.instrument_entity_id`, `sources.organisation_entity_id`, `entity_refs`) are migration
-- 283, kept separate so a reviewer can read "the spine exists" and "existing rows now reference it" as two
-- independently-revertible steps.

-- ── Preconditions ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    RAISE EXCEPTION 'ABORT: pgcrypto is required (gen_random_uuid() elsewhere in this schema; kept as a standing precondition, mirroring migration 258)';
  END IF;
END $$;

-- ── entity_kind enum (spec §1.1, byte-identical to the spec's CREATE TYPE block) ───────────────────────
-- CREATE TYPE has no IF NOT EXISTS form; guard it explicitly so this migration is safe to re-run.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entity_kind') THEN
    CREATE TYPE public.entity_kind AS ENUM (
      'corridor','node','jurisdiction','organisation','asset',
      'instrument','obligation','method','technology','signpost','person'
    );
  END IF;
END $$;

-- ── entities (spec §1.1) ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.entities (
  entity_id      text PRIMARY KEY,              -- 'cl:corridor:7f3a9c21', permanent, NEVER reused
  kind           public.entity_kind NOT NULL,
  canonical_name text        NOT NULL,
  status         text        NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','merged','retired')),
  merged_into    text        REFERENCES public.entities(entity_id),  -- tombstone target, never a hard delete
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT id_matches_kind CHECK (entity_id LIKE 'cl:' || kind::text || ':%'),
  CONSTRAINT merged_has_target CHECK ((status = 'merged') = (merged_into IS NOT NULL))
);

COMMENT ON TABLE public.entities IS
  'The entity spine (spec 08 §1.1): one row per real-world thing, permanent id, never reused. Minted by '
  'entityId() in src/lib/entities/entity-id.mjs — never hand-assembled at a call site. Deletes are forbidden '
  'by convention (no DELETE RLS policy is ever intended for this table); an entity leaves circulation via '
  '`status=''retired''` or `status=''merged''`+`merged_into`, so an old id 301s at read time rather than 404ing '
  '(spec §1.3 rule 3).';
COMMENT ON COLUMN public.entities.entity_id IS
  'cl:<kind>:<16 lowercase hex>, minted by entityId(kind, seed) in src/lib/entities/entity-id.mjs. '
  'Deterministic from a normalized seed per kind — two independent callers mint the SAME id with zero '
  'coordination, which is what makes the backfill idempotent.';
COMMENT ON COLUMN public.entities.merged_into IS
  'Tombstone target when status=''merged''. A reader resolving an old id follows this to the live id — '
  '301, never 404 (spec §1.3 rule 3). NULL for every other status.';

-- ── entity_identifiers — the crosswalk (spec §1.1) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.entity_identifiers (
  entity_id  text NOT NULL REFERENCES public.entities(entity_id),
  scheme     text NOT NULL,   -- 'LEI','IMO_SHIP','IMO_COMPANY','UNLOCODE','IATA','ICAO','ISO3166_2',
                              -- 'NUTS','CELEX','ELI','ROR','ORCID','EORI','SCAC','ISO6346'
                              -- (plus ISO3166_1 and HOST — src/lib/entities/crosswalk.mjs SCHEMES is the
                              -- application-side single source of truth for the full closed vocabulary;
                              -- no DB-level CHECK here, matching spec §1.1's own DDL verbatim — see header)
  value      text NOT NULL,
  scheme_version text,        -- NUTS is versioned; pin it or comparisons silently break
  asserted_by text NOT NULL,  -- provenance on the ALIAS, not just the entity
  asserted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, scheme, value)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_entity_per_identifier
  ON public.entity_identifiers (scheme, value, coalesce(scheme_version,''));

COMMENT ON TABLE public.entity_identifiers IS
  'Crosswalk to published external identifier standards (spec 08 §1.1). ADOPT, never invent — this is what '
  'makes the spine joinable to a customer''s TMS and to third-party feeds already keyed on these schemes. '
  'Rows are built by identifierRow() in src/lib/entities/crosswalk.mjs, which validates the value against '
  'the scheme''s published format/check-digit rule before returning a row a caller may insert.';
COMMENT ON COLUMN public.entity_identifiers.asserted_by IS
  'Provenance on the ALIAS, never overwritten (spec §1.3 rule 2) — who/what asserted this crosswalk mapping '
  '(e.g. a script path, an editor identity), distinct from entities.created_at which is the entity''s own '
  'provenance.';
COMMENT ON INDEX public.one_entity_per_identifier IS
  'An external identifier value (within one scheme+version) resolves to at most ONE entity — the crosswalk '
  'integrity guarantee spec §8, falsification test 1 depends on ("every entity referenced on any surface '
  'resolves to a cl: ID" presumes the reverse mapping is unambiguous).';

-- ── entity_scope — cross-entity addressability (spec §1.2) ──────────────────────────────────────────
-- "The join table that makes any entity addressable from any surface. This is the mechanism behind
-- 'one corridor, five answers'" (spec §1.2). Columns transcribed byte-identical from the spec's own
-- CREATE TABLE block; the spec fully defines them, so this migration includes it per this lane's own
-- instruction ("Add entity_scope from §1.2 if the spec defines its columns; otherwise omit").
CREATE TABLE IF NOT EXISTS public.entity_scope (
  subject_id text NOT NULL REFERENCES public.entities(entity_id),
  scope_id   text NOT NULL REFERENCES public.entities(entity_id),
  relation   text NOT NULL,   -- closed vocabulary, each with a declared inverse — NOT enforced here; the
                              -- spec names this a "closed vocabulary" without giving the closed list, so no
                              -- CHECK is invented (same "transcribe, don't improve on" posture as above)
  confidence numeric(3,2),
  attributed_to text NOT NULL,   -- 'editor:jl' | 'rule:corridor-jurisdiction-v3' | 'model:xref-v2'
  PRIMARY KEY (subject_id, scope_id, relation)
);

COMMENT ON TABLE public.entity_scope IS
  'Cross-entity addressability join (spec 08 §1.2) — "the mechanism behind one corridor, five answers". '
  'Unpopulated by this lane''s backfill (spec §1.3: v1 scope is corridor/jurisdiction/organisation/'
  'instrument/obligation identity itself; the scoping RELATIONS between them are a later build). Schema '
  'lands now so a later lane is additive-only against it, never a DDL change riding the same commit as its '
  'first writer.';

-- ── Indexes beyond the spec's own UNIQUE/PK (read-path support; additive, not spec text) ───────────────
CREATE INDEX IF NOT EXISTS entities_kind_idx ON public.entities (kind);
CREATE INDEX IF NOT EXISTS entities_merged_into_idx ON public.entities (merged_into) WHERE merged_into IS NOT NULL;
CREATE INDEX IF NOT EXISTS entity_scope_scope_id_idx ON public.entity_scope (scope_id);

-- ── RLS — mirrors sources (004/005) / regions (106): world-readable, no PII, writes are service-role only ──
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_scope ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entities_read ON public.entities;
CREATE POLICY entities_read ON public.entities FOR SELECT USING (true);

DROP POLICY IF EXISTS entity_identifiers_read ON public.entity_identifiers;
CREATE POLICY entity_identifiers_read ON public.entity_identifiers FOR SELECT USING (true);

DROP POLICY IF EXISTS entity_scope_read ON public.entity_scope;
CREATE POLICY entity_scope_read ON public.entity_scope FOR SELECT USING (true);

-- No INSERT/UPDATE/DELETE policy on any of the three: writes arrive through the service-role client via
-- scripts/entities/backfill-entities.mjs's guarded path (scripts/lib/db.mjs), which bypasses RLS — the same
-- posture migration 258 states explicitly for data_sources/emission_factors.

-- ── Post-checks (mirrors migration 258's DO-block self-check pattern) ───────────────────────────────────
DO $$
DECLARE
  n_kinds int;
  n_cols_entities int;
  n_cols_identifiers int;
  n_cols_scope int;
  probe_a text;
BEGIN
  SELECT count(*) INTO n_kinds FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'entity_kind';
  IF n_kinds <> 11 THEN
    RAISE EXCEPTION 'ABORT: entity_kind has % values, expected 11 (spec §1.1 CREATE TYPE list)', n_kinds;
  END IF;

  SELECT count(*) INTO n_cols_entities FROM information_schema.columns
    WHERE table_schema='public' AND table_name='entities';
  IF n_cols_entities <> 6 THEN
    RAISE EXCEPTION 'ABORT: entities has % columns, expected 6 (entity_id,kind,canonical_name,status,merged_into,created_at)', n_cols_entities;
  END IF;

  SELECT count(*) INTO n_cols_identifiers FROM information_schema.columns
    WHERE table_schema='public' AND table_name='entity_identifiers';
  IF n_cols_identifiers <> 6 THEN
    RAISE EXCEPTION 'ABORT: entity_identifiers has % columns, expected 6', n_cols_identifiers;
  END IF;

  SELECT count(*) INTO n_cols_scope FROM information_schema.columns
    WHERE table_schema='public' AND table_name='entity_scope';
  IF n_cols_scope <> 5 THEN
    RAISE EXCEPTION 'ABORT: entity_scope has % columns, expected 5', n_cols_scope;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='one_entity_per_identifier') THEN
    RAISE EXCEPTION 'ABORT: one_entity_per_identifier unique index missing';
  END IF;

  -- id_matches_kind proves itself: a well-formed id for its own kind inserts; a cross-kind id would not
  -- (not executed here — that would leave a row behind in a schema-only migration; the CHECK's SQL form
  -- is exercised for real by entity-id.test.mjs's assertEntityId() parity, not by a live INSERT/ROLLBACK
  -- here, to keep this migration a pure schema change with zero data footprint, matching 258's "emission_factors
  -- empty by design" posture).
  probe_a := 'cl:jurisdiction:' || left(encode(digest('US','sha256'),'hex'),16);
  IF probe_a !~ '^cl:jurisdiction:[0-9a-f]{16}$' THEN
    RAISE EXCEPTION 'ABORT: sanity probe id shape check failed: %', probe_a;
  END IF;

  RAISE NOTICE 'migration 282 OK: entity_kind (% values), entities/entity_identifiers/entity_scope created, RLS on, 0 rows by design', n_kinds;
END $$;
