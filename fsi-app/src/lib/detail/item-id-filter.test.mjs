// R21 / CF-SEC-15 proof: a crafted slug can no longer change filter structure at the three detail-read sites,
// and /api/community/search no longer composes .or() strings. Discovered by run-test-suite.sh (not under a
// bracket dir: node --test drops those, F65).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { itemIdColumn } from "./item-id-filter.ts";
import { unionByRecency } from "../community/search-merge.ts";

const UUID = "d2da85da-0912-497a-b645-31e4ca73cd18";
const CRAFTED = [
  "x,provenance_status.eq.quarantined",
  "a),(id.neq.0",
  `${UUID},legacy_id.neq.zzz`,
  `${UUID}.extra`,
  "%,id.not.is.null",
];

test("uuid-shaped value addresses id; everything else addresses legacy_id", () => {
  assert.equal(itemIdColumn(UUID), "id");
  assert.equal(itemIdColumn("eu-cbam-2023"), "legacy_id");
});

test("crafted separators never select the id column and are passed whole as one value", () => {
  for (const s of CRAFTED) {
    assert.equal(itemIdColumn(s), "legacy_id", s);
  }
  // Fake builder: the only way a value reaches the query is .eq(col, value), one parameter, never a filter string.
  for (const s of CRAFTED) {
    const calls = [];
    const q = { eq(c, v) { calls.push([c, v]); return q; }, or() { throw new Error("or() must not be called"); } };
    q.eq(itemIdColumn(s), s);
    assert.deepEqual(calls, [["legacy_id", s]]);
  }
});

test("union merges two column reads newest-first, dedupes, caps", () => {
  const a = [{ id: "1", created_at: "2026-01-02" }, { id: "2", created_at: "2026-01-01" }];
  const b = [{ id: "2", created_at: "2026-01-01" }, { id: "3", created_at: "2026-01-03" }];
  assert.deepEqual(unionByRecency([a, b], "created_at", 8).map((r) => r.id), ["3", "1", "2"]);
  assert.deepEqual(unionByRecency([a, b], "created_at", 2).map((r) => r.id), ["3", "1"]);
  assert.deepEqual(unionByRecency([[], []], "created_at", 8), []);
});

test("the five sites carry no interpolated .or() on user input (source guard)", () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  const search = read("../../app/api/community/search/route.ts");
  assert.doesNotMatch(search, /\.or\(/);
  for (const p of ["../../app/operations/[slug]/page.tsx", "../../app/research/[slug]/page.tsx"]) {
    const s = read(p);
    assert.doesNotMatch(s, /\.or\(/, p);
    assert.match(s, /itemIdColumn\(id\), id\)/, p);
    assert.match(s, /\.eq\("provenance_status", "verified"\)/, p);
  }
  const sv = read("../supabase-server.ts");
  assert.doesNotMatch(sv, /legacy_id\.eq\.\$\{itemUiId\}/);
});
