// 387_drop_caller_less_category_rpcs.test.mjs -- static proof of migration 387 (lane DEAD-1d), by parsing the SQL file
// directly: no database. The behavioural proof is the migration's own pre-check and self-check, which run at apply time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { headerProblems } from "./_lib/applied-status.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = readFileSync(join(HERE, "387_drop_caller_less_category_rpcs.sql"), "utf8");
const SQL = RAW.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
const DROPPED = ["get_operations_items", "get_research_items", "get_technology_items"];

test("header: subject line, applied status as the map says, names what it does not do", () => {
  assert.match(RAW, /^-- subject: Migration 387 /);
  assert.deepEqual(headerProblems(RAW, "387_drop_caller_less_category_rpcs.sql"), []);
  assert.match(RAW, /No table, row or column is touched/);
});

test("drops exactly the three caller-less org-scoped RPCs, plain DROP (no CASCADE), one transaction", () => {
  const drops = [...SQL.matchAll(/DROP FUNCTION IF EXISTS public\.([a-z_]+)\(([a-z]*)\)\s*;/gi)];
  assert.deepEqual(drops.map((m) => m[1]), DROPPED);
  for (const m of drops) assert.equal(m[2], "uuid");
  assert.doesNotMatch(SQL, /CASCADE/i);
  assert.doesNotMatch(SQL, /\bDROP\s+(TABLE|COLUMN|VIEW|TRIGGER)/i);
  assert.equal((SQL.match(/^\s*BEGIN;/gm) ?? []).length, 1);
  assert.equal((SQL.match(/^\s*COMMIT;/gm) ?? []).length, 1);
});

test("get_market_intel_items is NOT dropped (the health route calls it) and no live reader is dropped", () => {
  assert.doesNotMatch(SQL, /DROP FUNCTION[^;]*get_market_intel_items/i);
  assert.doesNotMatch(SQL, /DROP FUNCTION[^;]*_public/i);
  const route = readFileSync(resolve(HERE, "..", "..", "src", "app", "api", "health", "surfaces", "route.ts"), "utf8");
  assert.match(route, /rpc\("get_market_intel_items"/);
});

test("pre-check aborts on a dependent function and the self-check asserts the gone and kept sets", () => {
  assert.match(SQL, /RAISE EXCEPTION 'ABORT: function public\.% names one of the category RPCs/);
  for (const n of DROPPED) assert.ok(SQL.includes(`'${n}'`), `${n} named in the checks`);
  assert.match(SQL, /SELF-CHECK FAILED: public\.% still exists/);
  for (const n of ["get_market_intel_items", "get_market_intel_items_public", "get_operations_items_public", "get_research_items_public"]) {
    assert.ok(SQL.includes(`'${n}'`), `${n} asserted kept`);
  }
});

test("no code calls a dropped RPC: no .rpc() of any of the three under src, scripts or .discipline (non-test)", () => {
  const root = resolve(HERE, "..", "..");
  const hits = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".next" || e.name === "tmp") continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|mjs|js)$/.test(e.name) && !/\.(test|npmtest)\.mjs$/.test(e.name)) {
        const t = readFileSync(p, "utf8");
        for (const n of DROPPED) if (new RegExp(String.raw`\.rpc\(\s*["'\x60]${n}["'\x60]`).test(t)) hits.push(`${p}: ${n}`);
      }
    }
  };
  for (const d of ["src", "scripts", ".discipline"]) walk(join(root, d));
  assert.deepEqual(hits, []);
});

test("no section-sign or dash glyph in the new file", () => {
  for (const c of [0xa7, 0x2013, 0x2014]) assert.ok(!RAW.includes(String.fromCharCode(c)), `glyph U+${c.toString(16)} present`);
});
