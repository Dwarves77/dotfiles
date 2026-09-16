// Structural proof for migrations 322/323's SQL bodies (D32, defect-fix-plan-2026-09-12.md, lane L21). No
// live database in this worktree; the same text-based SQL contract-check precedent
// claim-versions-321.test.mjs already uses for migration 321's constraint bodies.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SQL_322_PATH = resolve(HERE, "../../../supabase/migrations/322_agent_run_searches_result_chars.sql");
const SQL_323_PATH = resolve(
  HERE,
  "../../../supabase/migrations/323_agent_run_searches_result_chars_backfill.sql",
);
const SQL_322 = readFileSync(SQL_322_PATH, "utf8");
const SQL_323 = readFileSync(SQL_323_PATH, "utf8");

test("322: agent_run_searches gains result_chars (ADD COLUMN IF NOT EXISTS)", () => {
  assert.match(SQL_322, /ALTER TABLE public\.agent_run_searches ADD COLUMN IF NOT EXISTS result_chars integer;/);
});

test("322: the trigger fires BEFORE INSERT OR UPDATE OF result_content, FOR EACH ROW", () => {
  assert.match(
    SQL_322,
    /BEFORE INSERT OR UPDATE OF result_content ON public\.agent_run_searches\s*\n\s*FOR EACH ROW/,
  );
  assert.match(SQL_322, /CREATE TRIGGER agent_run_searches_result_chars_trg/);
  assert.match(SQL_322, /EXECUTE FUNCTION public\.agent_run_searches_set_result_chars\(\);/);
});

test("322: the trigger function assigns NEW.result_chars from the length of NEW.result_content", () => {
  assert.match(SQL_322, /CREATE OR REPLACE FUNCTION public\.agent_run_searches_set_result_chars\(\)/);
  assert.match(SQL_322, /NEW\.result_chars := length\(NEW\.result_content\);/);
});

test("322: the (intelligence_item_id, result_chars) index exists", () => {
  assert.match(
    SQL_322,
    /CREATE INDEX IF NOT EXISTS idx_agent_run_searches_item_chars\s*\n\s*ON public\.agent_run_searches \(intelligence_item_id, result_chars\);/,
  );
});

test("322: the result_chars column comment names it trigger-maintained and points readers off computing the length of result_content in SQL, without spelling the banned call form itself", () => {
  const commentMatch = SQL_322.match(/COMMENT ON COLUMN public\.agent_run_searches\.result_chars IS([\s\S]*?);/);
  assert.ok(commentMatch, "expected a COMMENT ON COLUMN for result_chars");
  const comment = commentMatch[1];
  assert.match(comment, /[Tt]rigger-maintained/);
  assert.match(comment, /instead of computing the length of result_content in SQL/);
  // The comment must NOT itself carry the banned call-form (the structural guard,
  // scripts/verify/capture-length-scan.test.mjs, would otherwise flag this very migration outside its
  // one sanctioned trigger site).
  assert.doesNotMatch(comment, /\blength\(\s*(?:\w+\.)?result_content\s*\)/i);
});

test("322: brief_apply_runs table carries the exact column set the driver/pre-flight check need", () => {
  assert.match(SQL_322, /CREATE TABLE IF NOT EXISTS public\.brief_apply_runs \(/);
  assert.match(SQL_322, /run_id\s+text primary key/);
  assert.match(SQL_322, /mode\s+text not null check \(mode in \('dry', 'apply'\)\)/);
  assert.match(SQL_322, /started_at\s+timestamptz not null/);
  assert.match(SQL_322, /finished_at\s+timestamptz/);
  assert.match(SQL_322, /bytes_read\s+bigint not null default 0/);
  assert.match(SQL_322, /items_applied\s+integer not null default 0/);
  assert.match(SQL_322, /stop_reason\s+text/);
});

test("322: brief_apply_runs has RLS enabled and NO policy (service-role only)", () => {
  assert.match(SQL_322, /ALTER TABLE public\.brief_apply_runs ENABLE ROW LEVEL SECURITY;/);
  assert.doesNotMatch(SQL_322, /CREATE POLICY[^;]*brief_apply_runs/i);
});

test("323: the backfill walks the table in a chunk loop, ordered by id, keyset-paginated (never OFFSET)", () => {
  assert.match(SQL_323, /DO \$\$/);
  assert.match(SQL_323, /LOOP/);
  assert.match(SQL_323, /ORDER BY id\s*\n\s*LIMIT 200/);
  assert.doesNotMatch(SQL_323, /OFFSET/i);
  assert.match(SQL_323, /WHERE id = ANY\(chunk_ids\) AND result_chars IS NULL/);
});

test("323: pg_sleep(0.5) runs between chunks", () => {
  assert.match(SQL_323, /PERFORM pg_sleep\(0\.5\);/);
});

test("323: RAISE NOTICE names the chunk number and the row count per chunk", () => {
  assert.match(SQL_323, /RAISE NOTICE 'agent_run_searches result_chars backfill: chunk % updated % row\(s\)', chunk_number, rows_in_chunk;/);
});

test("323: the backfill computes result_chars the SAME way the trigger does (the length of result_content)", () => {
  assert.match(SQL_323, /SET result_chars = length\(result_content\)/);
});
