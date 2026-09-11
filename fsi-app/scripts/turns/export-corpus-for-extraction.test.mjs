// export-corpus-for-extraction.test.mjs — proves the pure arg-parse and corpus-shaping functions.
// Importing this module never invokes main() (IS_MAIN checks process.argv[1] against the running file).
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseArgs, chunk, chunkByCharBudget, buildCorpusItems } from "./export-corpus-for-extraction.mjs";

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

// ── --ids (lane TURNREQ, 2026-09-04 — corpus-turn's ticket-queue selection) ────────────────────────

test("parseArgs: --out alone defaults ids=null (unchanged, --since-or-nothing shape preserved)", () => {
  const r = parseArgs(["--out", "x.json"]);
  assert.equal(r.ok, true);
  assert.equal(r.ids, null);
});

test("parseArgs: --ids splits, trims, and drops empty entries", () => {
  const r = parseArgs(["--out", "x.json", "--ids", "a, b ,,c"]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.ids, ["a", "b", "c"]);
  assert.equal(r.since, null);
});

test("parseArgs: --ids with an empty value is refused", () => {
  const r = parseArgs(["--out", "x.json", "--ids", " , , "]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--ids requires at least one uuid/);
});

test("parseArgs: --ids and --since together is refused (ambiguous selection, matches discover-for-items.mjs)", () => {
  const r = parseArgs(["--out", "x.json", "--ids", "a,b", "--since", "2026-08-01"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--ids OR --since, not both/);
});

test("parseArgs: --ids composes with --limit", () => {
  const r = parseArgs(["--out", "x.json", "--ids", "a,b,c", "--limit", "2"]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.ids, ["a", "b", "c"]);
  assert.equal(r.limit, 2);
});

// ── --with-pool-text / --char-budget (Part 3 task 3.1, W9 brief-chain plan 2026-09-11) ─────────────

test("parseArgs: --with-pool-text defaults to false, --char-budget defaults to 3,000,000", () => {
  const r = parseArgs(["--out", "x.json"]);
  assert.equal(r.ok, true);
  assert.equal(r.withPoolText, false);
  assert.equal(r.charBudget, 3_000_000);
});

test("parseArgs: --with-pool-text sets withPoolText true", () => {
  const r = parseArgs(["--out", "x.json", "--ids", "a", "--with-pool-text"]);
  assert.equal(r.ok, true);
  assert.equal(r.withPoolText, true);
});

test("parseArgs: --char-budget accepts a positive integer override", () => {
  const r = parseArgs(["--out", "x.json", "--char-budget", "500000"]);
  assert.equal(r.ok, true);
  assert.equal(r.charBudget, 500000);
});

test("parseArgs: --char-budget rejects zero, negative, and non-numeric values", () => {
  assert.equal(parseArgs(["--out", "x.json", "--char-budget", "0"]).ok, false);
  assert.equal(parseArgs(["--out", "x.json", "--char-budget", "-1"]).ok, false);
  assert.equal(parseArgs(["--out", "x.json", "--char-budget", "abc"]).ok, false);
});

// ── chunk ────────────────────────────────────────────────────────────────────────────────────────

test("chunk: splits into groups of the given size, last group may be short", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 2), []);
  assert.deepEqual(chunk([1], 10), [[1]]);
});

// ── chunkByCharBudget (Part 3 task 3.1) ─────────────────────────────────────────────────────────────
// Pure: items carry a pre-computed `size` field, no database, no real corpus-item shape required.

test("chunkByCharBudget: empty input yields no parts", () => {
  assert.deepEqual(chunkByCharBudget([], 1000), []);
});

test("chunkByCharBudget: packs items into a part while the running total stays within budget", () => {
  const items = [{ id: "a", size: 100 }, { id: "b", size: 100 }, { id: "c", size: 100 }];
  const parts = chunkByCharBudget(items, 250);
  assert.deepEqual(parts, [
    { part: 1, items: [items[0], items[1]] },
    { part: 2, items: [items[2]] },
  ]);
});

test("chunkByCharBudget: an item exactly at the budget starts (and fills) its own part, not flagged oversize", () => {
  const items = [{ id: "a", size: 300 }];
  const parts = chunkByCharBudget(items, 300);
  assert.deepEqual(parts, [{ part: 1, items: [items[0]] }]);
  assert.equal(parts[0].oversize, undefined);
});

test("chunkByCharBudget: an item larger than the budget goes alone in its own part with oversize: true", () => {
  const items = [{ id: "small", size: 50 }, { id: "huge", size: 5_000_000 }, { id: "small2", size: 50 }];
  const parts = chunkByCharBudget(items, 3_000_000);
  assert.deepEqual(parts, [
    { part: 1, items: [items[0]] },
    { part: 2, items: [items[1]], oversize: true },
    { part: 3, items: [items[2]] },
  ]);
});

test("chunkByCharBudget: consecutive oversize items each get their own part", () => {
  const items = [{ id: "a", size: 10 }, { id: "b", size: 10 }];
  const parts = chunkByCharBudget(items, 5);
  assert.deepEqual(parts, [
    { part: 1, items: [items[0]], oversize: true },
    { part: 2, items: [items[1]], oversize: true },
  ]);
});

test("chunkByCharBudget: a multi-item running total landing EXACTLY on the budget must NOT flush early", () => {
  // Fix round 1, minor (3): the boundary case current.length && currentSize + it.size > budget must use
  // strict > , never >=, so a third item that brings the running total to exactly the budget stays in the
  // SAME part as the first two, not a new one.
  const items = [{ id: "a", size: 100 }, { id: "b", size: 100 }, { id: "c", size: 100 }];
  const parts = chunkByCharBudget(items, 300);
  assert.deepEqual(parts, [{ part: 1, items: [items[0], items[1], items[2]] }]);
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

// ── buildCorpusItems: due_date slot context (lane FE-SLOT-2, 2026-09-04) ───────────────────────────
// The exporter's own header ("COLUMN MAPPING") points at read-and-extract.mjs's shared mapping/context
// functions for these — this block proves the exporter's own batched pool grouping wires them correctly,
// never re-deriving the context logic itself.

test("buildCorpusItems: a due_date slot FACT claim gains context from this item's own pool rows", () => {
  const items = [{ id: "item-1" }];
  const claimRows = [
    {
      id: "claim-due",
      intelligence_item_id: "item-1",
      claim_kind: "FACT",
      claim_text: "[due_date] The captured source states a due date, verbatim: «30 June 2026»",
      source_span: "30 June 2026",
    },
  ];
  const longSurround = "x".repeat(210);
  const poolRows = [
    {
      id: "search-1",
      intelligence_item_id: "item-1",
      result_content: `${longSurround} the operator shall provide data by 30 June 2026 on request.`,
      result_index: 0,
    },
  ];
  const out = buildCorpusItems(items, claimRows, [], poolRows);
  assert.equal(out[0].claims.length, 1);
  const claim = out[0].claims[0];
  assert.ok(claim.context, "expected a context object");
  assert.equal(claim.context.search_id, "search-1");
  assert.ok(claim.context.before.endsWith("the operator shall provide data by "));
  assert.equal(claim.context.after, " on request.");
});

test("buildCorpusItems: a due_date slot claim whose span is in no pool row gets context: null", () => {
  const items = [{ id: "item-1" }];
  const claimRows = [
    {
      id: "claim-due",
      intelligence_item_id: "item-1",
      claim_kind: "FACT",
      claim_text: "[due_date] The captured source states a due date, verbatim: «30 June 2026»",
      source_span: "30 June 2026",
    },
  ];
  const out = buildCorpusItems(items, claimRows, [], []);
  assert.equal(out[0].claims[0].context, null);
});

test("buildCorpusItems: an ordinary (non-due_date-slot) claim never gains a context field", () => {
  const items = [{ id: "item-1" }];
  const claimRows = [
    { id: "claim-1", intelligence_item_id: "item-1", claim_kind: "FACT", claim_text: "text a", source_span: "span a" },
  ];
  const out = buildCorpusItems(items, claimRows, [], []);
  assert.equal(Object.hasOwn(out[0].claims[0], "context"), false);
});

// ── the pool read is SCOPED to itemIdsNeedingContext (lane FE-SLOT-2b, 2026-09-04) ──────────────────
// main() itself has no dependency injection (a live readAll against real DB creds) so this can't be
// exercised end-to-end here; itemIdsNeedingContext (the function that decides the scope) has its own
// exhaustive unit tests in read-and-extract.test.mjs. This block proves the SOURCE actually wires it in
// rather than reverting to the old "read the pool for the whole chunk" shape.
describe("pool read is scoped to itemIdsNeedingContext, not the whole id chunk (source contract)", () => {
  const src = readFileSync(new URL("./export-corpus-for-extraction.mjs", import.meta.url), "utf8");

  test("imports itemIdsNeedingContext from read-and-extract.mjs", () => {
    assert.match(src, /\bitemIdsNeedingContext\b/);
  });

  test("computes the context-needing ids from THIS chunk's own claims before reading agent_run_searches", () => {
    const poolReadIdx = src.indexOf('readAll("agent_run_searches"');
    const contextIdsIdx = src.indexOf("itemIdsNeedingContext(claims)");
    assert.ok(contextIdsIdx >= 0, "expected a itemIdsNeedingContext(claims) call");
    assert.ok(poolReadIdx > contextIdsIdx, "the pool read must come after the context-ids are computed");
  });

  test("the agent_run_searches readAll's .in(\"intelligence_item_id\", ...) is scoped to a context-ids variable, never the raw idChunk", () => {
    // The claim/section reads are still scoped to idChunk directly; the DEFAULT (non-with-pool-text)
    // pool read must NOT be. Anchored on "const contextIds = ..." (unique to the default branch: Part 3
    // task 3.1 added a SECOND, textually earlier agent_run_searches read for --with-pool-text, correctly
    // scoped to the raw idChunk instead, which a non-anchored first-match search would wrongly hit here).
    const claimReadMatch = src.match(/readAll\("section_claim_provenance"[\s\S]*?q\.in\("intelligence_item_id",\s*(\w+)\)/);
    const defaultBranchIdx = src.indexOf("const contextIds = [...itemIdsNeedingContext(claims)];");
    assert.ok(defaultBranchIdx >= 0, "expected the default branch's own contextIds line");
    const poolReadMatch = src.slice(defaultBranchIdx).match(/readAll\(\s*"agent_run_searches"[\s\S]*?q\.in\("intelligence_item_id",\s*(\w+)\)/);
    assert.ok(claimReadMatch && poolReadMatch, "expected both readAll calls to be found");
    assert.equal(claimReadMatch[1], "idChunk");
    assert.notEqual(poolReadMatch[1], "idChunk");
  });
});

// ── buildCorpusItems: pool (Part 3 task 3.1, --with-pool-text) ─────────────────────────────────────

test("buildCorpusItems: pool is OMITTED by default (backward-compatible with run-extraction.mjs's loadCorpus)", () => {
  const out = buildCorpusItems([{ id: "item-1" }], [], [], [{ intelligence_item_id: "item-1", result_url: "https://x", result_content: "text" }]);
  assert.equal(Object.hasOwn(out[0], "pool"), false);
});

test("buildCorpusItems: withPoolText:true adds pool:[{url,text}] mapped from result_url/result_content", () => {
  const items = [{ id: "item-1" }];
  const textA = "full captured text a, ".repeat(15); // > 200 chars: clears the usable-capture floor
  const textB = "full captured text b, ".repeat(15);
  const poolRows = [
    { intelligence_item_id: "item-1", result_url: "https://a.example/doc", result_content: textA, result_index: 0 },
    { intelligence_item_id: "item-1", result_url: "https://b.example/doc", result_content: textB, result_index: 1 },
  ];
  const out = buildCorpusItems(items, [], [], poolRows, { withPoolText: true });
  assert.deepEqual(out[0].pool, [
    { url: "https://a.example/doc", text: textA },
    { url: "https://b.example/doc", text: textB },
  ]);
});

test("buildCorpusItems: withPoolText:true still yields pool: [] for an item with no pool rows, never omitted", () => {
  const out = buildCorpusItems([{ id: "lonely" }], [], [], [], { withPoolText: true });
  assert.deepEqual(out[0].pool, []);
});

test("buildCorpusItems: withPoolText:true drops pool rows missing a url, or below the usable-capture floor", () => {
  const longEnough = "y".repeat(250);
  const poolRows = [
    { intelligence_item_id: "item-1", result_url: "https://a.example/doc", result_content: "", result_index: 0 },
    { intelligence_item_id: "item-1", result_url: null, result_content: longEnough, result_index: 1 },
    { intelligence_item_id: "item-1", result_url: "https://ok.example/doc", result_content: longEnough, result_index: 2 },
  ];
  const out = buildCorpusItems([{ id: "item-1" }], [], [], poolRows, { withPoolText: true });
  assert.deepEqual(out[0].pool, [{ url: "https://ok.example/doc", text: longEnough }]);
});

// Fix round 1, important (2): the pool filter must reuse read-and-extract.mjs's own usable-capture floor
// (MIN_USABLE_POOL_CHARS = 200, via the exported usableCapturesOrdered), not restate the threshold, so the
// exported pool is exactly what canonical-pipeline.ts / the sectioner already treat as grounding-worthy.
test("buildCorpusItems: withPoolText:true excludes a 150-char row and includes a 250-char row (the 200-char usable-capture floor)", () => {
  const poolRows = [
    { intelligence_item_id: "item-1", result_url: "https://short.example/doc", result_content: "s".repeat(150), result_index: 0 },
    { intelligence_item_id: "item-1", result_url: "https://long.example/doc", result_content: "l".repeat(250), result_index: 1 },
  ];
  const out = buildCorpusItems([{ id: "item-1" }], [], [], poolRows, { withPoolText: true });
  assert.deepEqual(out[0].pool, [{ url: "https://long.example/doc", text: "l".repeat(250) }]);
});

// Fix round 1, critical (1): the per-part item shape needs 8 more fields than id/claims/sections/pool.
// Asserted key-by-key via a full deepEqual on the exported object (an unexpected extra or missing key
// fails this the same as a wrong value).
test("buildCorpusItems: withPoolText:true adds title/item_type/format_type/jurisdiction_iso/canonical_instrument_key/source_id/source_url/required_slots, key-by-key", () => {
  const items = [
    {
      id: "item-1",
      title: "Regulation (EU) 2024/0001",
      item_type: "regulation",
      format_type: "regulatory_fact_document",
      jurisdiction_iso: "EU",
      canonical_instrument_key: "eur-lex:32024R0001",
      source_id: "source-abc",
      source_url: "https://eur-lex.europa.eu/32024R0001",
      required_slots: ["effective_date", "jurisdictional_scope"],
    },
  ];
  const out = buildCorpusItems(items, [], [], [], { withPoolText: true });
  assert.deepEqual(out, [
    {
      id: "item-1",
      claims: [],
      sections: [],
      title: "Regulation (EU) 2024/0001",
      item_type: "regulation",
      format_type: "regulatory_fact_document",
      jurisdiction_iso: "EU",
      canonical_instrument_key: "eur-lex:32024R0001",
      source_id: "source-abc",
      source_url: "https://eur-lex.europa.eu/32024R0001",
      required_slots: ["effective_date", "jurisdictional_scope"],
      pool: [],
    },
  ]);
});

test("buildCorpusItems: withPoolText:true defaults the 7 metadata fields to null and required_slots to [] when absent on the input item", () => {
  const out = buildCorpusItems([{ id: "stub-item" }], [], [], [], { withPoolText: true });
  assert.deepEqual(out, [
    {
      id: "stub-item",
      claims: [],
      sections: [],
      title: null,
      item_type: null,
      format_type: null,
      jurisdiction_iso: null,
      canonical_instrument_key: null,
      source_id: null,
      source_url: null,
      required_slots: [],
      pool: [],
    },
  ]);
});

// ── source contract: --with-pool-text reads result_url (Part 3 task 3.1) ───────────────────────────
// Confirms the with-pool-text branch's own agent_run_searches read selects result_url (needed for the
// pool's `url` field) in addition to result_content: schema-audit-before-write's SELECT counterpart,
// the column is confirmed live against migration 112's CREATE TABLE / migration 264's rename (see this
// file's own header), and this test proves the SOURCE actually asks for it.
describe("source contract: the --with-pool-text agent_run_searches read selects result_url", () => {
  const src = readFileSync(new URL("./export-corpus-for-extraction.mjs", import.meta.url), "utf8");

  test("the withPoolText branch's readAll is scoped to the raw idChunk, deliberately NOT the context-ids subset", () => {
    // The whole point of --with-pool-text is the FULL pool for every target item, not the due-date-context
    // subset FE-SLOT-2b scopes the default path to.
    const idx = src.indexOf("Part 3 task 3.1: --with-pool-text is an explicit, deliberate request for the FULL grounding pool");
    assert.ok(idx >= 0);
    const after = src.slice(idx, idx + 1500);
    const poolReadMatch = after.match(/readAll\(\s*"agent_run_searches"[\s\S]*?q\.in\("intelligence_item_id",\s*(\w+)\)/);
    assert.ok(poolReadMatch, "expected an agent_run_searches readAll call");
    assert.equal(poolReadMatch[1], "idChunk");
  });

  test("the withPoolText branch's readAll select list includes result_url", () => {
    // Anchor on the loop's own pool-read branch specifically (main() also has an earlier, unrelated
    // `if (withPoolText)` for the targetItems filter): this comment string is unique to the read block.
    const idx = src.indexOf("Part 3 task 3.1: --with-pool-text is an explicit, deliberate request for the FULL grounding pool");
    assert.ok(idx >= 0, "expected the pool-read branch's own header comment");
    const after = src.slice(idx, idx + 1500);
    const selectMatch = after.match(/readAll\("agent_run_searches",\s*"([^"]+)"/);
    assert.ok(selectMatch, "expected an agent_run_searches readAll call in the withPoolText branch");
    assert.match(selectMatch[1], /\bresult_url\b/);
    assert.match(selectMatch[1], /\bresult_content\b/);
  });
});

// ── source contract: the intelligence_items read selects the 8 extra columns under --with-pool-text
// (Fix round 1, critical (1)) ───────────────────────────────────────────────────────────────────────
describe("source contract: --with-pool-text widens the intelligence_items column select", () => {
  const src = readFileSync(new URL("./export-corpus-for-extraction.mjs", import.meta.url), "utf8");

  test("ITEM_COLUMNS includes title, item_type, format_type, jurisdiction_iso, canonical_instrument_key, source_id, source_url when withPoolText", () => {
    const match = src.match(/const ITEM_COLUMNS = withPoolText\s*\?\s*"([^"]+)"/);
    assert.ok(match, "expected a withPoolText-conditional ITEM_COLUMNS constant");
    for (const col of ["title", "item_type", "format_type", "jurisdiction_iso", "canonical_instrument_key", "source_id", "source_url"]) {
      assert.match(match[1], new RegExp(`\\b${col}\\b`), `expected ITEM_COLUMNS to select ${col}`);
    }
  });

  test("both intelligence_items readAll calls (--ids path and the default path) use the same ITEM_COLUMNS variable, never a literal string", () => {
    const idsPathMatch = src.match(/readAll\("intelligence_items",\s*(\w+),\s*\{[\s\S]*?q\.in\("id",/);
    const defaultPathMatch = src.match(/readAll\("intelligence_items",\s*(\w+),\s*\{[\s\S]*?q\.eq\("provenance_status", "verified"\)\.eq\("is_archived", false\),?\s*\}\);/);
    assert.ok(idsPathMatch, "expected the --ids path's intelligence_items readAll call");
    assert.equal(idsPathMatch[1], "ITEM_COLUMNS");
    assert.ok(defaultPathMatch, "expected the default path's intelligence_items readAll call");
    assert.equal(defaultPathMatch[1], "ITEM_COLUMNS");
  });
});

// ── source contract: required_slots reuses canonical-pipeline.ts's own item_type_required_slots query
// shape (Fix round 1, critical (1)) ─────────────────────────────────────────────────────────────────
describe("source contract: required_slots is read from item_type_required_slots with the pipeline's own query shape", () => {
  const src = readFileSync(new URL("./export-corpus-for-extraction.mjs", import.meta.url), "utf8");

  test("reads item_type_required_slots selecting slot_key, filtered by item_type, only under withPoolText", () => {
    const idx = src.indexOf("required_slots per item (Fix round 1, --with-pool-text only)");
    assert.ok(idx >= 0, "expected the required_slots step's own comment");
    const after = src.slice(idx, idx + 1600);
    const readMatch = after.match(/readAll\("item_type_required_slots",\s*"([^"]+)"/);
    assert.ok(readMatch, "expected an item_type_required_slots readAll call");
    assert.match(readMatch[1], /\bslot_key\b/);
    assert.match(after, /q\.in\("item_type",\s*itemTypes\)/);
  });

  test("attaches required_slots onto targetItems before buildCorpusItems is called", () => {
    const attachIdx = src.indexOf("required_slots: requiredSlotsByType.get(it.item_type)");
    const buildCallIdx = src.indexOf("buildCorpusItems(targetItems, claimRows, sectionRows, poolRows");
    assert.ok(attachIdx >= 0 && buildCallIdx >= 0);
    assert.ok(attachIdx < buildCallIdx, "required_slots must be attached to targetItems before the buildCorpusItems call");
  });
});
