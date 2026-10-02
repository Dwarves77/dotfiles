// 344_research_assessments.test.mjs -- proves migration 344's own post-apply self-check (the
// `IF n_cols <> N THEN RAISE EXCEPTION` block) would not abort on a healthy apply, by parsing the SQL
// file DIRECTLY rather than trusting a hand-count. Coordinator-directed (2026-10-02): the first authored
// version of this file hardcoded the self-check's expected column count at 20 when the CREATE TABLE
// statement actually declares 24 (4 identity, 8 maturity, 6 horizon, 2 credibility, computed_by,
// computed_at, status_token, created_at) -- an apply against a real database would have run the whole
// migration, then aborted the entire transaction at the self-check's own RAISE EXCEPTION, rolling back
// everything inside the same BEGIN/COMMIT. This test is the mechanical guard against that class
// recurring: it parses the CREATE TABLE's top-level column list and the DO block's expected-count
// literal straight from the committed .sql text and asserts they are equal, so the two can never drift
// again without this test catching it before the file reaches the DB executor.
//
// PURE TEXT PARSING, NO DATABASE, NO SQL PARSER DEPENDENCY -- reads the one committed file and applies
// a depth-aware split so it tolerates nested parens (CHECK(...) expressions, the two multi-line
// CONSTRAINT blocks) without needing a real SQL grammar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SQL = readFileSync(fileURLToPath(new URL("./344_research_assessments.sql", import.meta.url)), "utf8");

/** Strip a trailing `-- ...` line comment (never inside a string literal in this file's own DDL). */
function stripLineComment(line) {
  const idx = line.indexOf("--");
  return idx === -1 ? line : line.slice(0, idx);
}

/**
 * Extract the balanced-paren substring between the first "(" after `CREATE TABLE ... research_assessments`
 * and its matching ")". Scans character-by-character so nested parens (CHECK(...), the corridor-order
 * CONSTRAINTs) never confuse the boundary.
 */
function extractCreateTableBody(sql) {
  const startMarker = /CREATE TABLE IF NOT EXISTS public\.research_assessments\s*\(/;
  const m = startMarker.exec(sql);
  assert.ok(m, "CREATE TABLE public.research_assessments not found in migration 344");
  const openIdx = m.index + m[0].length - 1; // index of the opening "("
  let depth = 0;
  for (let i = openIdx; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") {
      depth--;
      if (depth === 0) return sql.slice(openIdx + 1, i);
    }
  }
  throw new Error("unbalanced parens in migration 344's CREATE TABLE statement");
}

/**
 * Split a CREATE TABLE body into its top-level comma-separated items (each a column definition or a
 * CONSTRAINT clause), respecting nested parens so a comma inside e.g. `CHECK (a OR b)` or `text[]`
 * never splits early. Line comments are stripped before scanning so a `--` note mentioning a comma or
 * paren cannot perturb the depth count.
 */
function splitTopLevelItems(body) {
  const cleaned = body
    .split("\n")
    .map(stripLineComment)
    .join("\n");
  const items = [];
  let depth = 0;
  let current = "";
  for (const ch of cleaned) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      items.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) items.push(current);
  return items.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** A top-level item is a COLUMN unless its first token is the CONSTRAINT keyword. */
function isColumnItem(item) {
  return !/^CONSTRAINT\b/i.test(item);
}

function parseExpectedColumnCount(sql) {
  const m = /IF n_cols\s*<>\s*(\d+)\s*THEN/.exec(sql);
  assert.ok(m, "self-check's `IF n_cols <> N THEN` literal not found in migration 344");
  return Number(m[1]);
}

test("migration 344: the self-check's expected column count matches the CREATE TABLE's actual top-level column count", () => {
  const body = extractCreateTableBody(SQL);
  const items = splitTopLevelItems(body);
  const columnItems = items.filter(isColumnItem);
  const constraintItems = items.filter((i) => !isColumnItem(i));

  // Pinned, named list -- a future column add/remove must update this list in the SAME commit as the
  // CREATE TABLE edit, which is what makes a silent drift here loud rather than a passing-by-coincidence
  // count match.
  const expectedColumnNames = [
    "id", "item_id", "supersedes", "is_current",
    "technical_maturity_low", "technical_maturity_high", "technical_maturity_method", "technical_maturity_evidence_ids",
    "commercial_maturity_low", "commercial_maturity_high", "commercial_maturity_method", "commercial_maturity_evidence_ids",
    "horizon_kind", "horizon_band", "horizon_rule", "horizon_confidence", "horizon_trigger_note", "refusal_reason",
    "credibility_evidence_score", "credibility_authority_score",
    "computed_by", "computed_at", "status_token", "created_at",
  ];
  const actualColumnNames = columnItems.map((c) => c.split(/\s+/)[0]);
  assert.deepEqual(actualColumnNames, expectedColumnNames, "CREATE TABLE's column order/names drifted from this test's pinned list");

  assert.equal(columnItems.length, expectedColumnNames.length);
  assert.equal(constraintItems.length, 3, "expected exactly 3 CONSTRAINT clauses (2 corridor-order, 1 horizon-or-refusal)");

  const expectedByDoBlock = parseExpectedColumnCount(SQL);
  assert.equal(
    expectedByDoBlock,
    columnItems.length,
    `self-check expects ${expectedByDoBlock} columns but CREATE TABLE declares ${columnItems.length} -- ` +
      "an apply would run the whole migration then abort at this RAISE EXCEPTION, rolling back the transaction.",
  );
});
