// domain-laundering.test.mjs — WO-4's lock on the null-domain trap.
//
// THE TRAP (spec 06 B-4; item-links.ts's IMPORTANT note): row mappers coalesced a missing `domain`
// to 1 (`row.domain || 1`), and domain 1 IS Regulations. The DB guarantees `domain` NOT NULL with
// CHECK 1-7 (verified live 2026-08-18: is_nullable=NO, CHECK ((domain >= 1) AND (domain <= 7)),
// 0 out-of-range rows), so the only value the coalesce could ever launder is "column not selected
// by this payload" — and a payload that did not fetch the column must read as UNCLASSIFIED, never
// as a Regulations verdict. This test locks the pattern out at the source-text level (the repo's
// established idiom for cross-file invariants without a component harness — vocab-drift-guard,
// F26) and pins surfaceOf's honest answer for the no-data case.
//
// NOTE what this test deliberately does NOT do: re-check TS-vs-SQL classifier parity. That guard
// already exists and runs in CI — vocab-drift-guard.test.mjs regenerates the migration-148
// surface_of() CASE from SURFACE_RULES and asserts byte-equality. Duplicating it here would be a
// second mechanism for one invariant.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { surfaceOf } from "../lib/surface-of.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

test("no mapper coalesces domain: the `row.domain || 1` pattern is out of supabase-server.ts", () => {
  const code = readFileSync(join(SRC, "lib/supabase-server.ts"), "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
  const offenders = code.filter((l) => /domain:\s*row\.domain\s*\|\|/.test(l));
  assert.deepEqual(offenders, [], `coalesced domain mapping reintroduced: ${offenders.join(" | ")}`);
});

test("an item with no domain and no matching item_type classifies as uncategorized, never regulations", () => {
  assert.equal(surfaceOf("mystery_type", null), "uncategorized");
  assert.equal(surfaceOf(null, null), "uncategorized");
  assert.equal(surfaceOf(undefined, undefined), "uncategorized");
});

test("the coalesce's laundering, reproduced: domain 1 answers regulations for ANY item_type — which is why a default of 1 was a verdict, not a fallback", () => {
  assert.equal(surfaceOf("market_signal", 1), "regulations",
    "precedence: domain 1 outranks market item_type — exactly what made `|| 1` dangerous");
  assert.equal(surfaceOf("market_signal", null), "market",
    "without the coalesce the same row classifies by its own item_type");
});
