-- 277 — corpus_turn_requests: a queue of "this item needs a flywheel turn" markers, plus the trigger that
-- fills it mechanically. Lane EV (event-driven processing), 2026-09-01.
--
-- WHY THIS EXISTS. Rule 16 (contract v2.2, "the forward-participation clause") already wires connection
-- discovery + forward-event extraction into the two IN-APP write chokepoints — mint-item.ts (INSERT) and
-- apply-staged-update.ts (UPDATE `update_item`/`status_change`/`archive_item`). That covers a mint or a
-- staged-update-approval. It does NOT cover every other way an intelligence_items row changes: coordinator
-- SQL applies (a migration or a direct apply_migration/execute_sql INSERT), an un-archive restoring a row
-- to live, a provenance flip performed by the `set_provenance_status` trigger itself (migration 115/209 —
-- fired from a claims/sections write, not from a top-level intelligence_items statement), or an operator
-- tag-correction script. None of those paths call runConnectionDiscovery/readAndExtractForwardEvents, and
-- today there is no record anywhere that any of them ever happened — "what needs a turn" has no answer
-- except "remember to re-run the backfill scripts by hand." This migration is the mechanical fix: a table
-- that records the fact ("item X changed in a way that matters"), and a trigger that writes it — not a
-- flywheel action itself. This migration NEVER calls discovery or extraction; it only PRODUCES the request
-- another consumer (the GitHub Actions corpus-turn workflow, a sibling lane's build) reads and clears.
--
-- WHAT THIS CREATES.
--   1. `corpus_turn_requests` — one open row per item awaiting a turn. `reason` records WHY (inserted /
--      verified / unarchived / updated / tags_applied / manual — manual is the only value never written by
--      the trigger; it is reserved for the admin "Request corpus turn" action landing in the same commit).
--      `consumed_at`/`consumed_by` are stamped by the consumer (scripts/turns/consume-turn-requests.mjs) —
--      NULL means still open. A UNIQUE PARTIAL INDEX on `(intelligence_item_id) WHERE consumed_at IS NULL`
--      enforces "one open request per item" at the DB layer: an item that changes five times before anyone
--      consumes the queue gets ONE open row, not five, and does not need de-duplication logic downstream.
--   2. `enqueue_corpus_turn_request()` — an AFTER INSERT OR UPDATE OF (provenance_status, is_archived,
--      operational_scenario_tags, compliance_object_tags, topic_tags) trigger on `intelligence_items` that
--      INSERTs the request. `UPDATE OF <cols>` is what makes this mechanical rather than a broad "any
--      write" hook: it fires only when one of the five columns that can plausibly change WHAT the flywheel
--      would compute (verification state, live/archived state, or the tag vocabularies discovery/theming
--      score against) is in the statement's SET list — a row edited by, say, sources/decide's `source_id`
--      patch never touches this trigger at all (see the per-writer table logged in this session's own
--      report; that route's write is correctly NOT caught here — it is not one of the five columns and it
--      does not, on its own, flip provenance_status either, so there is genuinely nothing here for a turn
--      to act on).
--
-- THE SKIP GATE: `NEW.is_archived OR NEW.provenance_status <> 'verified'` -> RETURN NEW, no insert. An
-- item that is archived, or not (yet) verified, is not live/customer-visible — the same gate migration
-- 103's/274's own SELECT policy encodes (`is_archived = false`) and the same terminal state
-- `validate_item_provenance` computes. There is nothing for connection discovery or forward-event
-- extraction to usefully do against a row the customer surfaces never show, so the trigger does not queue
-- one. Concretely: a fresh INSERT almost always defaults `provenance_status = 'unverified'` (migration 112)
-- and is skipped at birth — its request lands later, on the SAME item id, the moment `set_provenance_status`
-- (below) flips it to verified.
--
-- REASON DERIVATION — priority order, each branch comparing OLD vs NEW so a same-value column
-- reassignment (`UPDATE t SET col = col`, which still fires an `UPDATE OF col` trigger) never
-- mis-reports: TG_OP='INSERT' -> 'inserted'; else an `is_archived` flip (only reachable here as
-- true->false, since the skip gate above already returned on NEW.is_archived=true) -> 'unarchived'; else a
-- `provenance_status` flip -> 'verified' (the skip gate guarantees the NEW side is 'verified', so a
-- distinct OLD side means this write, or a nested write it cascaded into, IS the verification event); else
-- any of the three tag columns changed -> 'tags_applied'; else 'updated' (an OF-listed column was
-- reassigned without a value change, or the firing is itself a nested cascade one level further removed
-- than the branches above can name precisely — still a real "this item changed" event, just a less
-- specific reason string).
--
-- ON WHETHER TO GUARD BY pg_trigger_depth() — READ MIGRATION 115/209 FIRST, THEN A DELIBERATE DEVIATION.
-- Migration 115's `set_provenance_status_trg` on `intelligence_items` carries `WHEN (pg_trigger_depth() =
-- 0)` for a specific, narrow reason stated in its own header: that trigger's OWN action is an UPDATE of
-- `intelligence_items` itself, which would otherwise re-enter the SAME trigger recursively. This trigger's
-- action is an INSERT into a DIFFERENT table (`corpus_turn_requests`) — it cannot recurse into itself no
-- matter how deep pg_trigger_depth() reads, so the recursion hazard 115's guard exists for does not apply
-- here, and copying that literal guard would be cargo-culting the syntax while missing the reason.
-- Worse, a depth=0 guard would actively BREAK this migration's own stated purpose: gap (b) this migration
-- exists to close is exactly "a provenance flip performed by the set_provenance_status trigger" — and that
-- flip, when it originates from a claims/sections write (INSERT/UPDATE on `section_claim_provenance` or
-- `intelligence_item_sections`, which is how most re-verifications actually happen — grounding a new claim,
-- not touching intelligence_items directly), reaches `intelligence_items.provenance_status` through
-- `set_provenance_status()`'s own internal UPDATE, which necessarily fires at pg_trigger_depth() >= 1 (it
-- is a nested trigger-caused write, by construction). A depth=0-restricted version of THIS trigger would
-- silently never see that UPDATE and would never queue the very "verified via claims write" case the
-- dispatching brief named as a gap to close. So: no `WHEN` clause is added here. The ON CONFLICT DO
-- NOTHING against the partial-open-request index is what actually keeps this safe under repeated/nested
-- firing for the same item within one statement or transaction — the first INSERT within an open request
-- window wins, every later one (whatever depth it fires at) is a harmless no-op, which is the correct
-- behavior for a queue whose whole point is "one open ticket per item," not "one ticket per write."
--
-- ADDITIVE AND SAFE. A brand-new table (`corpus_turn_requests`), zero existing consumers, zero existing
-- rows at apply time. `intelligence_items` is a read-only FK target here (ON DELETE CASCADE — a deleted
-- item's open request is meaningless and disappears with it, same posture item_forward_events.
-- intelligence_item_id takes per migration 274). The new AFTER trigger's own action (INSERT into a
-- brand-new empty table, guarded by ON CONFLICT DO NOTHING) can raise only on a genuine FK/CHECK violation
-- against data this migration itself defines — it never writes back to `intelligence_items` or blocks an
-- existing write path from committing (the trigger is AFTER, not BEFORE, so it cannot veto the row change
-- it is reacting to; if the INSERT itself somehow errored, the raise propagates and rolls back the
-- triggering statement exactly like any other AFTER-trigger failure would — the same fail-closed shape
-- migration 115/209's own trigger already carries, not a new risk this migration introduces). No existing
-- table, function, view, RLS policy, or trigger is touched or dropped.
--
-- RLS — MIRRORS MIGRATION 195 (`error_events`): service-role write, platform-admin read. RLS enabled; NO
-- INSERT/UPDATE/DELETE policy at all (every current writer — the trigger itself, which runs under
-- whichever role performed the triggering intelligence_items write, and every route/script in this repo
-- that writes intelligence_items uses `getServiceSupabase()`/`scripts/lib/db.mjs`'s service-role client,
-- verified by reading all 15 registered `intelligence_items` writers this session — is service_role or a
-- superuser migration/coordinator session, both of which bypass RLS by default; there is no session-scoped
-- browser write path to this table anywhere). One SELECT policy gated on `profiles.is_platform_admin`
-- (migration 075/249 pattern), so the admin route (`/api/admin/corpus-turn-requests`, same commit) and
-- `scripts/turns/consume-turn-requests.mjs` (service-role script client, which bypasses this policy
-- entirely) both have a working read path.
--
-- TWO-TRACK POLICY (CLAUDE.md standing rule 3): schema DDL, so it applies via the sanctioned lane BEFORE
-- the dependent code (the admin route, the consumer script, the corpus-turn workflow another lane is
-- building) reaches a live invocation — this migration performs no data write of its own. Authored by
-- lane EV, left UNAPPLIED. Applied only by the coordinator.
--
-- REVERSAL / ROLLBACK FILE. None shipped, following the exact convention migration 274's header
-- documents and re-verifies (not re-asserted on faith): a from-scratch `CREATE TABLE` with zero rows and
-- zero existing consumers at apply time is its own reversal. Unconditionally safe if the coordinator wants
-- one anyway: `DROP TRIGGER IF EXISTS enqueue_corpus_turn_request_trg ON public.intelligence_items;
-- DROP FUNCTION IF EXISTS public.enqueue_corpus_turn_request(); DROP TABLE IF EXISTS
-- public.corpus_turn_requests;` — noted here rather than authored speculatively, matching 274/276's
-- convention for this exact migration shape.

BEGIN;

-- ── Table ────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.corpus_turn_requests (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  intelligence_item_id  uuid        NOT NULL REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  reason                text        NOT NULL,
  requested_at          timestamptz NOT NULL DEFAULT now(),
  consumed_at           timestamptz NULL,
  consumed_by           text        NULL,

  CONSTRAINT corpus_turn_requests_reason_check
    CHECK (reason IN ('inserted', 'verified', 'unarchived', 'updated', 'tags_applied', 'manual')),

  -- An open request carries neither consumed_at nor consumed_by; a consumed one carries both. Enforced as
  -- DDL (274's own "grounding rule" posture) rather than trusted of every future writer to keep paired.
  CONSTRAINT corpus_turn_requests_consumed_pair_check
    CHECK ((consumed_at IS NULL) = (consumed_by IS NULL))
);

COMMENT ON TABLE public.corpus_turn_requests IS
  'One row per "this item needs a flywheel turn" ticket. Written mechanically by '
  'enqueue_corpus_turn_request() (this migration''s trigger on intelligence_items) for every producer that '
  'writes provenance_status/is_archived/the three tag columns outside the in-app rule-16 chokepoints '
  '(mint-item.ts, apply-staged-update.ts), plus reason=''manual'' rows from the admin "Request corpus '
  'turn" action. Consumed by scripts/turns/consume-turn-requests.mjs, which the corpus-turn GitHub Actions '
  'workflow (a sibling lane) runs to feed discover-for-items --ids. NULL consumed_at = still open.';

COMMENT ON COLUMN public.corpus_turn_requests.reason IS
  'inserted (new mint) | verified (provenance_status flipped to verified) | unarchived (is_archived '
  'true->false) | tags_applied (operational_scenario_tags/compliance_object_tags/topic_tags changed) | '
  'updated (an OF-listed column was touched without matching one of the above precisely) | manual '
  '(operator-requested via the admin route — the only value the trigger itself never writes).';

COMMENT ON COLUMN public.corpus_turn_requests.consumed_at IS
  'NULL = open (awaiting a turn). Stamped by consume-turn-requests.mjs --mark-consumed, never by this '
  'table''s own trigger.';

COMMENT ON COLUMN public.corpus_turn_requests.consumed_by IS
  'Free-text label for whatever consumed this request (e.g. a corpus-turn workflow run id, an operator '
  'handle). NULL exactly when consumed_at is NULL (corpus_turn_requests_consumed_pair_check).';

-- ── The one-open-request-per-item invariant ─────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_corpus_turn_requests_open_per_item
  ON public.corpus_turn_requests (intelligence_item_id)
  WHERE consumed_at IS NULL;

-- "list open requests, oldest first" — the admin route's GET and the consumer script's readAll both scan
-- open requests in request order; this serves that scan without a sequential fallback to the PK index.
CREATE INDEX IF NOT EXISTS idx_corpus_turn_requests_open_requested_at
  ON public.corpus_turn_requests (requested_at)
  WHERE consumed_at IS NULL;

-- ── Trigger function ─────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enqueue_corpus_turn_request()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_reason text;
BEGIN
  -- Skip gate: an archived, or not-(yet)-verified, item has nothing for the flywheel to act on today.
  -- NEW is always populated here (AFTER INSERT OR UPDATE only; this function carries no DELETE trigger).
  IF NEW.is_archived OR NEW.provenance_status <> 'verified' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_reason := 'inserted';
  ELSIF (OLD.is_archived IS DISTINCT FROM NEW.is_archived) THEN
    -- Only reachable as true->false here: the skip gate above already returned when NEW.is_archived is
    -- true, so a distinct OLD value at this point means OLD was true and NEW is false.
    v_reason := 'unarchived';
  ELSIF (OLD.provenance_status IS DISTINCT FROM NEW.provenance_status) THEN
    -- The skip gate guarantees NEW.provenance_status = 'verified' here, so a distinct OLD value means
    -- this write (top-level or a nested set_provenance_status cascade) IS the verification event.
    v_reason := 'verified';
  ELSIF (OLD.operational_scenario_tags IS DISTINCT FROM NEW.operational_scenario_tags
      OR OLD.compliance_object_tags   IS DISTINCT FROM NEW.compliance_object_tags
      OR OLD.topic_tags               IS DISTINCT FROM NEW.topic_tags) THEN
    v_reason := 'tags_applied';
  ELSE
    v_reason := 'updated';
  END IF;

  -- Idempotent against the partial-unique open-request index: a partial index's conflict target must
  -- repeat its own WHERE predicate (verified PostgreSQL syntax — ON CONFLICT (col) WHERE <predicate> DO
  -- NOTHING is the documented form for inferring a partial unique/exclusion constraint as the arbiter).
  INSERT INTO public.corpus_turn_requests (intelligence_item_id, reason)
  VALUES (NEW.id, v_reason)
  ON CONFLICT (intelligence_item_id) WHERE consumed_at IS NULL DO NOTHING;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.enqueue_corpus_turn_request() IS
  'Migration 277. AFTER INSERT OR UPDATE OF (provenance_status, is_archived, operational_scenario_tags, '
  'compliance_object_tags, topic_tags) ON intelligence_items. Skips archived/not-verified rows; otherwise '
  'inserts one open corpus_turn_requests row per item (ON CONFLICT DO NOTHING against the partial-unique '
  'open-request index), reason derived from which tracked column actually changed. Deliberately carries no '
  'pg_trigger_depth() guard — see this migration''s header for why mirroring migration 115''s guard here '
  'would silently drop the nested set_provenance_status-cascade case this migration exists to catch.';

-- ── Trigger ──────────────────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS enqueue_corpus_turn_request_trg ON public.intelligence_items;
CREATE TRIGGER enqueue_corpus_turn_request_trg
  AFTER INSERT OR UPDATE OF
    provenance_status, is_archived, operational_scenario_tags, compliance_object_tags, topic_tags
  ON public.intelligence_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_corpus_turn_request();

-- ── RLS — mirrors migration 195 (error_events): service-role write (no policy = no non-bypass writer), ──
-- ── platform-admin read ─────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.corpus_turn_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS corpus_turn_requests_admin_read ON public.corpus_turn_requests;
CREATE POLICY corpus_turn_requests_admin_read ON public.corpus_turn_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_platform_admin = true
    )
  );

-- Service-role bypass via the Supabase service key (no policy needed; RLS is bypassed for service_role by
-- default) — same note migrations 103/195/274 record for their own tables, unchanged here.

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_cols  int;
  n_check int;
  n_uniq  int;
  n_idx   int;
  n_rows  int;
  rls_on  boolean;
  n_trg   int;
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'corpus_turn_requests';
  IF n_cols <> 6 THEN
    RAISE EXCEPTION 'ABORT: corpus_turn_requests has % columns, expected 6', n_cols;
  END IF;

  SELECT count(*) INTO n_check FROM pg_constraint
    WHERE conrelid = 'public.corpus_turn_requests'::regclass AND contype = 'c';
  IF n_check <> 2 THEN
    RAISE EXCEPTION 'ABORT: corpus_turn_requests has % CHECK constraints, expected 2', n_check;
  END IF;

  SELECT count(*) INTO n_uniq FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'corpus_turn_requests'
      AND indexname = 'uq_corpus_turn_requests_open_per_item';
  IF n_uniq <> 1 THEN
    RAISE EXCEPTION 'ABORT: corpus_turn_requests is missing the partial-unique open-request index';
  END IF;

  SELECT count(*) INTO n_idx FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'corpus_turn_requests'
      AND indexname = 'idx_corpus_turn_requests_open_requested_at';
  IF n_idx <> 1 THEN
    RAISE EXCEPTION 'ABORT: corpus_turn_requests is missing the open-requested_at lookup index';
  END IF;

  SELECT relrowsecurity INTO rls_on FROM pg_class
    WHERE oid = 'public.corpus_turn_requests'::regclass;
  IF NOT rls_on THEN
    RAISE EXCEPTION 'ABORT: corpus_turn_requests does not have RLS enabled';
  END IF;

  SELECT count(*) INTO n_trg FROM pg_trigger
    WHERE tgrelid = 'public.intelligence_items'::regclass
      AND tgname = 'enqueue_corpus_turn_request_trg'
      AND NOT tgisinternal;
  IF n_trg <> 1 THEN
    RAISE EXCEPTION 'ABORT: enqueue_corpus_turn_request_trg is not attached to intelligence_items (found %)', n_trg;
  END IF;

  SELECT count(*) INTO n_rows FROM public.corpus_turn_requests;
  IF n_rows <> 0 THEN
    RAISE EXCEPTION 'ABORT: corpus_turn_requests is not empty (% rows) — this migration must ship schema-only', n_rows;
  END IF;

  RAISE NOTICE 'migration 277 OK: corpus_turn_requests created, 6 columns, 2 CHECKs, 1 partial-unique index, 1 lookup index, RLS enabled, trigger attached, 0 rows (schema only)';
END $$;

COMMIT;
