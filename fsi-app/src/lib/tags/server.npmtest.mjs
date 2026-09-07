// Unit tests for src/lib/tags/server.ts — the pure/testable helpers behind
// the two workspace-tags API routes (lane uitags, 2026-09-07, migration
// 313). jiti (@/ alias resolution) needed the same way src/lib/api/
// org.npmtest.mjs does, since route.ts imports next/server value exports
// this module itself does not depend on, but sibling test files in this
// repo consistently resolve through jiti for the "@/" alias.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { resolveItemUuid, normalizeTagName, tagNameKey, buildTagCountsMap } = await jiti.import("./server.ts");

// ── normalizeTagName ──
test("normalizeTagName: trims and collapses internal whitespace", () => {
  assert.equal(normalizeTagName("  High  Priority  "), "High Priority");
});
test("normalizeTagName: empty/whitespace-only input is rejected", () => {
  assert.equal(normalizeTagName(""), null);
  assert.equal(normalizeTagName("   "), null);
});
test("normalizeTagName: over 60 chars is rejected", () => {
  assert.equal(normalizeTagName("x".repeat(61)), null);
});
test("normalizeTagName: exactly 60 chars is accepted", () => {
  assert.equal(normalizeTagName("x".repeat(60)), "x".repeat(60));
});
test("normalizeTagName: non-string input is rejected", () => {
  assert.equal(normalizeTagName(42), null);
  assert.equal(normalizeTagName(null), null);
  assert.equal(normalizeTagName(undefined), null);
});

// ── tagNameKey ──
test("tagNameKey: lowercases and trims, matching the DB's generated name_key column", () => {
  assert.equal(tagNameKey("  High Priority  "), "high priority");
});

// ── buildTagCountsMap ──
test("buildTagCountsMap: counts links per tag_id", () => {
  const counts = buildTagCountsMap([
    { tag_id: "a" }, { tag_id: "a" }, { tag_id: "b" }, { tag_id: "a" },
  ]);
  assert.equal(counts.get("a"), 3);
  assert.equal(counts.get("b"), 1);
  assert.equal(counts.get("missing"), undefined);
});
test("buildTagCountsMap: empty input → empty map", () => {
  const counts = buildTagCountsMap([]);
  assert.equal(counts.size, 0);
});

// ── resolveItemUuid ──
test("resolveItemUuid: a well-formed UUID passes through without a query", () => {
  const supabase = { from() { throw new Error("must not query when input is already a UUID"); } };
  return resolveItemUuid(supabase, "11111111-1111-1111-1111-111111111111").then((id) => {
    assert.equal(id, "11111111-1111-1111-1111-111111111111");
  });
});
test("resolveItemUuid: a legacy_id resolves via intelligence_items lookup", async () => {
  const supabase = {
    from(table) {
      assert.equal(table, "intelligence_items");
      return {
        select(cols) {
          assert.match(cols, /id/);
          return {
            eq(col, val) {
              assert.equal(col, "legacy_id");
              assert.equal(val, "o3");
              return { maybeSingle: async () => ({ data: { id: "22222222-2222-2222-2222-222222222222" }, error: null }) };
            },
          };
        },
      };
    },
  };
  const id = await resolveItemUuid(supabase, "o3");
  assert.equal(id, "22222222-2222-2222-2222-222222222222");
});
test("resolveItemUuid: not found → null", async () => {
  const supabase = {
    from() {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    },
  };
  const id = await resolveItemUuid(supabase, "does-not-exist");
  assert.equal(id, null);
});
