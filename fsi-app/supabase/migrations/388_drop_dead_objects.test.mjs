// 388_drop_dead_objects.test.mjs -- static proof of migration 388 (lane DB-2), by parsing the SQL file directly: no
// database. The behavioural proof is the migration's own pre-check and self-check, which run at apply time, and the
// PR's migration-proof job, which applies the file on a local stack.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { headerProblems } from "./_lib/applied-status.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const FILE = "388_drop_dead_objects.sql";
const RAW = readFileSync(join(HERE, FILE), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");

const DROPPED_FUNCTIONS = ["get_workspace_intelligence_aggregates_scoped", "reorder_user_list_item"];
const DROPPED_VIEWS = ["census_rollup_by_surface"];
const DROPPED = [...DROPPED_FUNCTIONS, ...DROPPED_VIEWS];
// Held by this lane, each with the reason in the migration header and the session log: they must NOT be dropped here.
const HELD_FUNCTIONS = [
  "gate_a_health_compute", "gate_a_health_refresh", "move_override_notes_to_item_notes",
  "publish_aggregate", "bucket_value", "bucket_width_multiplier",
];
const HELD_VIEWS = ["derived_values_admissible", "propagation_queue_depth"];
const HELD_TABLES = ["coverage_gap_candidates", "coverage_gap_census_findings", "sensitive_field_policy", "aggregate_query_log"];

/** Mask // and block comments in js/ts text so a name in prose is not a reference. A string is kept whole. */
function maskJsComments(text) {
  let out = "";
  for (let i = 0; i < text.length; ) {
    const c = text[i], n = text[i + 1];
    if (c === "/" && n === "/") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; out += c; i++;
      while (i < text.length && text[i] !== q) { if (text[i] === "\\") { out += text[i++]; } out += text[i++]; }
      out += q; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

/** Code references to any of `names` in `text` (comments masked). Returns the names found. */
function codeReferences(text, names) {
  const code = maskJsComments(text);
  return names.filter((n) => new RegExp(`(^|[^A-Za-z0-9_])${n}([^A-Za-z0-9_]|$)`).test(code));
}

function walkCode(root, dirs) {
  const files = [];
  const skip = new Set(["node_modules", ".next", "tmp", "fixtures"]);
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|mjs|js|json)$/.test(e.name) && !/\.(test|npmtest)\.mjs$/.test(e.name)) files.push(p);
    }
  };
  for (const d of dirs) if (existsSync(join(root, d))) walk(join(root, d));
  return files;
}

test("header: subject line, NOT APPLIED as the map says, names what it does not do", () => {
  assert.match(RAW, /^-- subject: Migration 388 /);
  assert.deepEqual(headerProblems(RAW, FILE), []);
  assert.match(RAW, /WHAT THIS DOES NOT DROP/);
});

test("drops exactly the two caller-less functions and the one unread view, plain DROP (no CASCADE), one transaction", () => {
  const fns = [...SQL.matchAll(/DROP FUNCTION IF EXISTS public\.([a-z_]+)\(([^)]*)\)\s*;/gi)];
  assert.deepEqual(fns.map((m) => m[1]), DROPPED_FUNCTIONS);
  assert.equal(fns[0][2].replace(/\s+/g, ""), "uuid,jsonb");
  assert.equal(fns[1][2].replace(/\s+/g, ""), "uuid,text,text,text,text,text[]");
  const views = [...SQL.matchAll(/DROP VIEW IF EXISTS public\.([a-z_]+)\s*;/gi)];
  assert.deepEqual(views.map((m) => m[1]), DROPPED_VIEWS);
  assert.doesNotMatch(SQL, /CASCADE/i);
  assert.doesNotMatch(SQL, /\bDROP\s+(TABLE|COLUMN|TRIGGER|POLICY)/i);
  assert.doesNotMatch(SQL, /\b(DELETE\s+FROM|TRUNCATE|UPDATE\s+public\.|INSERT\s+INTO)/i);
  assert.equal((SQL.match(/^\s*BEGIN;/gm) ?? []).length, 1);
  assert.equal((SQL.match(/^\s*COMMIT;/gm) ?? []).length, 1);
});

test("held objects are NOT dropped here: no DROP statement names a held function, view or table", () => {
  const drops = [...SQL.matchAll(/\bDROP\s+(?:FUNCTION|VIEW|TABLE)\b[^;]*;/gi)].map((m) => m[0]);
  for (const n of [...HELD_FUNCTIONS, ...HELD_VIEWS, ...HELD_TABLES]) {
    assert.ok(!drops.some((d) => d.includes(n)), `${n} is held by this lane and must not be dropped`);
  }
});

test("pre-check aborts on a function body or view that names a dropped object; self-check asserts gone and kept", () => {
  assert.match(SQL, /RAISE EXCEPTION 'ABORT: function public\.% names a dropped object/);
  assert.match(SQL, /RAISE EXCEPTION 'ABORT: view public\.% names a dropped object/);
  assert.match(SQL, /SELF-CHECK FAILED: public\.% still exists/);
  assert.match(SQL, /SELF-CHECK FAILED: public\.% is missing; it must be untouched/);
  for (const n of DROPPED) assert.ok(SQL.includes(`'${n}'`), `${n} named in the checks`);
  // The kept neighbours the self-check asserts (the held set plus the base table of the dropped view).
  for (const n of [...HELD_FUNCTIONS, ...HELD_VIEWS, "census_worklist", "coverage_gap_census_findings"]) {
    assert.ok(SQL.includes(`'${n}'`), `${n} asserted kept`);
  }
});

test("scanner self-test: a code reference is found, a comment or prose mention is not (red-then-green for the no-reference gate)", () => {
  const n = ["get_workspace_intelligence_aggregates_scoped"];
  assert.deepEqual(codeReferences('const r = await sb.rpc("get_workspace_intelligence_aggregates_scoped", { p_org_id });', n), n);
  assert.deepEqual(codeReferences("await pg.query(`SELECT * FROM public.census_rollup_by_surface`)", ["census_rollup_by_surface"]), ["census_rollup_by_surface"]);
  assert.deepEqual(codeReferences("// falls back to get_workspace_intelligence_aggregates_scoped (069)\nconst x = 1;", n), []);
  assert.deepEqual(codeReferences("/* get_workspace_intelligence_aggregates_scoped */ const x = 1;", n), []);
  assert.deepEqual(codeReferences('const s = "get_workspace_intelligence_aggregates_scoped_v2";', n), []);
});

test("no file under fsi-app/src or fsi-app/scripts references a dropped name in code (comments, tests and fixtures excluded)", () => {
  const hits = [];
  for (const p of walkCode(ROOT, ["src", "scripts"])) {
    const found = codeReferences(readFileSync(p, "utf8"), DROPPED);
    for (const n of found) hits.push(`${p.slice(ROOT.length + 1)}: ${n}`);
  }
  assert.deepEqual(hits, []);
});

test("no section-sign or dash glyph in the new file", () => {
  for (const c of [0xa7, 0x2013, 0x2014]) assert.ok(!RAW.includes(String.fromCharCode(c)), `glyph U+${c.toString(16)} present`);
});
