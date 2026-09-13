// Structural proof for migration 319's SQL body (D23 part (b), defect-fix-plan-2026-09-12.md). No
// live database in this worktree; this is the same text-based SQL contract-check precedent
// supabase-server-category-rpc-paging.test.mjs already uses for migration 306's function bodies.
// The BEHAVIOURAL half (an updated item is labelled 'updated', a new one stays 'new', the newest
// change_date wins) is proven end to end against real query logic separately: read live via
// Supabase MCP execute_sql during this lane, and by brief-rows.npmtest.mjs's D23 suite for the
// TypeScript consumer side (buildChangedRows / computeAuditDate).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SQL_PATH = resolve(HERE, "../../supabase/migrations/319_recent_changes_include_updates.sql");
const SQL = readFileSync(SQL_PATH, "utf8");

test("319: DROPs the function before recreating it (RETURNS TABLE widened, CREATE OR REPLACE cannot do this)", () => {
  assert.match(SQL, /drop function if exists public\.get_workspace_recent_changes\(uuid, integer\);/);
});

test("319: RETURNS TABLE carries the original six columns unchanged, plus change_kind and change_date trailing", () => {
  const returnsMatch = SQL.match(/returns table\(([\s\S]*?)\)\nlanguage plpgsql/);
  assert.ok(returnsMatch, "expected a RETURNS TABLE(...) clause");
  const cols = returnsMatch[1];
  const order = ["id uuid", "legacy_id text", "title text", "priority text", "effective_priority text", "added_date date", "change_kind text", "change_date date"];
  let cursor = -1;
  for (const col of order) {
    const idx = cols.indexOf(col);
    assert.ok(idx !== -1, `expected column "${col}" in RETURNS TABLE`);
    assert.ok(idx > cursor, `column "${col}" must appear after the previous one (additive, trailing order)`);
    cursor = idx;
  }
});

test("319: the new_items branch labels change_kind 'new' and change_date = added_date, the original ONLY meaning this feed carried", () => {
  const newItemsBlock = SQL.slice(SQL.indexOf("new_items AS ("), SQL.indexOf("updated_items AS ("));
  assert.match(newItemsBlock, /'new'::text AS change_kind/);
  assert.match(newItemsBlock, /a\.added_date AS change_date/);
  assert.match(newItemsBlock, /a\.added_date >= \(current_date - GREATEST\(p_days, 1\)\)/, "the new-item window is unchanged from the original 232 body");
});

test("319: the updated_items branch reads item_changelog UPDATED rows in the window, and excludes ids already selected as new", () => {
  const updatedItemsBlock = SQL.slice(SQL.indexOf("updated_items AS ("), SQL.indexOf("unioned AS ("));
  assert.match(updatedItemsBlock, /'updated'::text AS change_kind/);
  assert.match(updatedItemsBlock, /JOIN public\.item_changelog c ON c\.item_id = a\.id/);
  assert.match(updatedItemsBlock, /c\.change_type = 'UPDATED'/);
  assert.match(updatedItemsBlock, /c\.change_date >= \(current_date - GREATEST\(p_days, 1\)\)/);
  assert.match(updatedItemsBlock, /a\.id NOT IN \(SELECT n\.id FROM new_items n\)/, "an item already counted as new must never also be counted as updated");
  assert.match(updatedItemsBlock, /MAX\(c\.change_date\) AS change_date/, "the item's newest in-window change_date wins when it has several");
});

test("319: the union orders by priority band then change_date DESC then id ASC (change_date replaces added_date as the ordering fact)", () => {
  const tailBlock = SQL.slice(SQL.indexOf("unioned AS ("));
  assert.match(tailBlock, /u\.change_date DESC,/);
  assert.match(tailBlock, /u\.id ASC/);
  assert.match(tailBlock, /LIMIT 500;/);
});

test("319: no GRANT statement (232's own body carried none - the default PUBLIC execute grant is unchanged by this migration)", () => {
  // Scoped to actual SQL lines, not the header prose (which discusses grants in English).
  const sqlLines = SQL.split("\n").filter((l) => !l.trimStart().startsWith("--"));
  assert.doesNotMatch(sqlLines.join("\n"), /\bgrant\b/i);
});
