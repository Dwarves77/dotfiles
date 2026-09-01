// export-corpus-for-extraction.test.mjs — proves the pure arg-parse and corpus-shaping functions.
// Importing this module never invokes main() (IS_MAIN checks process.argv[1] against the running file).
import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, chunk, buildCorpusItems } from "./export-corpus-for-extraction.mjs";

// ── parseArgs ────────────────────────────────────────────────────────────────────────────────────

test("parseArgs: --out is required", () => {
  const r = parseArgs([]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--out/);
});

test("parseArgs: --out alone is valid, defaults since=null and a bounded limit", () => {
  const r = parseArgs(["--out", "x.json"]);
  assert.equal(r.ok, true);
  assert.equal(r.out, "x.json");
  assert.equal(r.since, null);
  assert.ok(r.limit > 0);
});

test("parseArgs: bad --since is refused", () => {
  const r = parseArgs(["--out", "x.json", "--since", "not-a-date"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--since/);
});

test("parseArgs: valid --since is accepted verbatim", () => {
  const r = parseArgs(["--out", "x.json", "--since", "2026-08-01"]);
  assert.equal(r.ok, true);
  assert.equal(r.since, "2026-08-01");
});

test("parseArgs: --limit must be a positive number", () => {
  assert.equal(parseArgs(["--out", "x.json", "--limit", "0"]).ok, false);
  assert.equal(parseArgs(["--out", "x.json", "--limit", "-5"]).ok, false);
  assert.equal(parseArgs(["--out", "x.json", "--limit", "abc"]).ok, false);
  const r = parseArgs(["--out", "x.json", "--limit", "50"]);
  assert.equal(r.ok, true);
  assert.equal(r.limit, 50);
});

// ── chunk ────────────────────────────────────────────────────────────────────────────────────────

test("chunk: splits into groups of the given size, last group may be short", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 2), []);
  assert.deepEqual(chunk([1], 10), [[1]]);
});

// ── buildCorpusItems ─────────────────────────────────────────────────────────────────────────────

test("buildCorpusItems: groups claims/sections by parent item id, maps column names to the extractor's shape", () => {
  const items = [{ id: "item-1" }, { id: "item-2" }];
  const claimRows = [
    { id: "claim-1", intelligence_item_id: "item-1", claim_kind: "FACT", claim_text: "text a", source_span: "span a" },
    { id: "claim-2", intelligence_item_id: "item-1", claim_kind: "GAP", claim_text: "text b", source_span: null },
  ];
  const sectionRows = [
    { id: "sec-1", item_id: "item-2", section_key: "compliance_chain", content_md: "## md" },
  ];
  const out = buildCorpusItems(items, claimRows, sectionRows);
  assert.deepEqual(out, [
    {
      id: "item-1",
      claims: [
        { claim_id: "claim-1", kind: "FACT", text: "text a", span: "span a" },
        { claim_id: "claim-2", kind: "GAP", text: "text b", span: null },
      ],
      sections: [],
    },
    {
      id: "item-2",
      claims: [],
      sections: [{ section_id: "sec-1", key: "compliance_chain", md: "## md" }],
    },
  ]);
});

test("buildCorpusItems: an item with no claims/sections gets empty arrays, never omitted", () => {
  const out = buildCorpusItems([{ id: "lonely" }], [], []);
  assert.deepEqual(out, [{ id: "lonely", claims: [], sections: [] }]);
});

test("buildCorpusItems: content_md null coerces to empty string, never null (extractor's own contract)", () => {
  const out = buildCorpusItems([{ id: "i" }], [], [{ id: "s", item_id: "i", section_key: "k", content_md: null }]);
  assert.equal(out[0].sections[0].md, "");
});
