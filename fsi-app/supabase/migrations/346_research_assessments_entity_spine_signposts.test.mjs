// 346_research_assessments_entity_spine_signposts.test.mjs -- proves migration 346's two self-checks
// (the `research_assessments` column-count RAISE EXCEPTION and the `signposts` column-count RAISE
// EXCEPTION) would not abort on a healthy apply, by parsing the SQL file directly rather than trusting a
// hand-count -- same discipline as migration 344's own test (344_research_assessments.test.mjs), which
// this file follows line-for-line for its parsing helpers (depth-aware top-level split, so nested parens
// in CHECK(...) expressions and the jsonb `?` operator in `predicate_is_evaluable` never confuse the
// boundary). Also proves migration 283's "additive-only" self-check pattern this migration copies: the
// post-check block asserts zero non-null entity_id and zero non-default lifecycle_state at apply time.
//
// PURE TEXT PARSING, NO DATABASE, NO SQL PARSER DEPENDENCY.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SQL = readFileSync(
  fileURLToPath(new URL("./346_research_assessments_entity_spine_signposts.sql", import.meta.url)),
  "utf8",
);

/** Strip a trailing `-- ...` line comment. Never inside a string literal in this file's own DDL. */
function stripLineComment(line) {
  const idx = line.indexOf("--");
  return idx === -1 ? line : line.slice(0, idx);
}

/** Extract the balanced-paren substring between the first "(" after a CREATE TABLE marker and its
 *  matching ")". Copied from 344_research_assessments.test.mjs's extractCreateTableBody, generalised to
 *  take the marker regex as a parameter (this file needs it twice: once for `signposts`). */
function extractParenBody(sql, startMarker) {
  const m = startMarker.exec(sql);
  assert.ok(m, `marker not found in migration 346: ${startMarker}`);
  const openIdx = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = openIdx; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") {
      depth--;
      if (depth === 0) return sql.slice(openIdx + 1, i);
    }
  }
  throw new Error(`unbalanced parens after marker: ${startMarker}`);
}

/** Split a paren body into top-level comma-separated items, respecting nested parens (CHECK(...), the
 *  jsonb `?` containment operator never introduces a paren, but CHECK(predicate ? 'op') still nests one
 *  pair) -- copied from 344's splitTopLevelItems. */
function splitTopLevelItems(body) {
  const cleaned = body.split("\n").map(stripLineComment).join("\n");
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

function isColumnItem(item) {
  return !/^CONSTRAINT\b/i.test(item);
}

test("migration 346: signposts' self-check column-count literal matches its own CREATE TABLE", () => {
  const body = extractParenBody(SQL, /CREATE TABLE IF NOT EXISTS public\.signposts\s*\(/);
  const items = splitTopLevelItems(body);
  const columnItems = items.filter(isColumnItem);
  const constraintItems = items.filter((i) => !isColumnItem(i));

  const expectedColumnNames = ["entity_id", "assessment_id", "watches", "predicate", "direction", "fired_at"];
  const actualColumnNames = columnItems.map((c) => c.split(/\s+/)[0]);
  assert.deepEqual(actualColumnNames, expectedColumnNames, "signposts' CREATE TABLE column order/names drifted from this test's pinned list");
  assert.equal(constraintItems.length, 1, "expected exactly 1 CONSTRAINT clause (predicate_is_evaluable)");

  const m = /signposts has % columns, expected (\d+)/.exec(SQL);
  assert.ok(m, "signposts self-check's expected-count literal not found");
  assert.equal(Number(m[1]), columnItems.length, "signposts self-check expects a different count than CREATE TABLE declares -- an apply would abort at RAISE EXCEPTION");
});

test("migration 346: research_assessments gains exactly entity_id + lifecycle_state (2 new ALTER TABLE ADD COLUMN statements)", () => {
  const addColumnMatches = [
    ...SQL.matchAll(/ALTER TABLE public\.research_assessments\s+ADD COLUMN IF NOT EXISTS (\w+)/g),
  ].map((m) => m[1]);
  assert.deepEqual(addColumnMatches, ["entity_id", "lifecycle_state"], "expected exactly entity_id then lifecycle_state added to research_assessments, in that order");

  const m = /research_assessments has % columns, expected (\d+) \(24 from migration 344/.exec(SQL);
  assert.ok(m, "research_assessments self-check's expected-count literal not found");
  assert.equal(Number(m[1]), 26, "research_assessments self-check must expect 24 (migration 344) + 2 (this migration) = 26");
});

test("migration 346: assessment_id is a direct uuid FK to research_assessments(id), not a detour through the entity spine (the coordinator's schema ruling)", () => {
  assert.match(SQL, /assessment_id uuid NOT NULL REFERENCES public\.research_assessments\(id\)/);
  assert.doesNotMatch(SQL, /assessment_id\s+text\s+NOT NULL\s+REFERENCES\s+public\.entities/);
});

test("migration 346: watches keeps its original text FK into entities(entity_id), unchanged by the ruling", () => {
  assert.match(SQL, /watches\s+text NOT NULL REFERENCES public\.entities\(entity_id\)/);
});

test("migration 346: entity_id progressive-re-keying column is nullable (no NOT NULL), mirroring migration 283's pattern", () => {
  assert.match(SQL, /ADD COLUMN IF NOT EXISTS entity_id text REFERENCES public\.entities\(entity_id\);/);
  assert.doesNotMatch(SQL, /entity_id text NOT NULL REFERENCES public\.entities\(entity_id\)/);
});

test("migration 346: additive-only self-check asserts zero non-null entity_id, zero non-default lifecycle_state, zero signposts rows (pattern: migration 283's post-check)", () => {
  assert.match(SQL, /WHERE entity_id IS NOT NULL.*INTO n_entity_id_nonnull/s);
  // lifecycle_state's literal is inside an EXECUTE '...' string, so the embedded 'emerging' literal is
  // SQL-escaped as doubled quotes (''emerging''') -- match loosely on quote-run length rather than
  // assuming exactly one quote each side.
  assert.match(SQL, /WHERE lifecycle_state <> '+emerging'+.*INTO n_lifecycle_nondefault/s);
  assert.match(SQL, /SELECT count\(\*\) FROM public\.signposts.*INTO n_signposts_rows/s);
  assert.match(SQL, /n_entity_id_nonnull <> 0 OR n_lifecycle_nondefault <> 0 OR n_signposts_rows <> 0/);
});

test("migration 346: lifecycle_state CHECK enumerates spec 08 section 3.1's exact 8-value lifecycle vocabulary, not a narrower invented list", () => {
  const m = /lifecycle_state text NOT NULL DEFAULT 'emerging'\s*\n?\s*CHECK \(lifecycle_state IN \(([^)]+)\)\)/.exec(SQL);
  assert.ok(m, "lifecycle_state CHECK clause not found");
  const values = m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
  assert.deepEqual(
    values,
    ["emerging", "strengthening", "corroborated", "verified", "stalled", "falsified", "superseded", "obsolete"],
    "lifecycle_state's CHECK must match src/lib/propagation/types.ts's Lifecycle union exactly (reuse, not a second vocabulary)",
  );
});

test("migration 346 does not CREATE or ALTER the entity_kind type (a precondition SELECT against pg_type is fine and expected; a type-mutating statement is not)", () => {
  // Deliberately NOT comment-stripped: this migration's own prose (header + COMMENT ON string bodies)
  // legitimately contains " -- " (rule 022's em-dash substitute) inside quoted text, which a naive
  // per-line "--"-strip would mis-treat as a SQL comment start and corrupt. Scoped instead to the two
  // DDL verbs that could actually mutate the type -- CREATE TYPE and ALTER TYPE -- neither of which this
  // migration issues against entity_kind (it only SELECTs from pg_type to confirm the type exists).
  assert.doesNotMatch(SQL, /CREATE TYPE[^;]*entity_kind/i, "migration 346 must not CREATE the entity_kind type -- ADR-039(e) closed the spine at its existing kind count");
  assert.doesNotMatch(SQL, /ALTER TYPE[^;]*entity_kind/i, "migration 346 must not ALTER the entity_kind type -- this migration gives the signpost kind its attribute TABLE only, never a new enum value");
  assert.match(SQL, /SELECT 1 FROM pg_type WHERE typname = 'entity_kind'/, "expected the precondition check reading entity_kind to still be present (confirms it is read, never mutated)");
});
