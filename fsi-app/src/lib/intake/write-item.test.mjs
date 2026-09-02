// write-item.test.mjs — coverage for the shared guarded write sequence both mint tiers depend on (Lane
// WSEQ, 2026-09-02). node:test + node:assert/strict. No network, no DB: every DB interaction the
// writeGroundingSequence tests exercise is a fake object (guardedInsert/guardedInsertMany plain in-memory
// recorders), never scripts/lib/db.mjs's real client — the same discipline
// scripts/mint/apply-mint-batch.test.mjs already uses for these exact builders (they moved here
// verbatim; the row-shape/write-order tests below are the ones that moved with them).
// Run: node --test src/lib/intake/write-item.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGateARow,
  buildCitationEdges,
  buildCitationRows,
  classifyMintOutcome,
  buildAgentRunSearchRows,
  buildSectionRows,
  buildClaimRows,
  writeGroundingSequence,
} from "./write-item.ts";

// ── buildGateARow ────────────────────────────────────────────────────────────────────────────────────

test("buildGateARow: scans full_brief against factClaims via the live Gate-A scanner, returns the six-field row", () => {
  const row = buildGateARow({
    itemId: "item-1",
    fullBrief: "The fee is set at 12%.",
    factClaims: [{ claim_text: "the fee", source_span: "12%" }],
    nowIso: "2026-09-02T00:00:00Z",
  });
  assert.equal(row.intelligence_item_id, "item-1");
  assert.equal(row.orphan_count, 0, JSON.stringify(row.orphans));
  assert.deepEqual(row.orphans, []);
  assert.equal(typeof row.scanned_hash, "string");
  assert.equal(typeof row.gate_a_version, "string");
  assert.equal(row.scanned_at, "2026-09-02T00:00:00Z");
});

test("buildGateARow: an uncovered figure/date token in full_brief becomes an orphan (nothing hidden)", () => {
  const row = buildGateARow({ itemId: "item-1", fullBrief: "The fee is set at 12%.", factClaims: [] });
  assert.equal(row.orphan_count, 1);
  assert.equal(row.orphans[0].token, "12%");
});

test("buildGateARow: absent fullBrief scans as empty string, never throws", () => {
  const row = buildGateARow({ itemId: "item-1", fullBrief: undefined, factClaims: [] });
  assert.equal(row.orphan_count, 0);
});

test("buildGateARow: derivedCovered (Gate B) credits a token no FACT span backs", () => {
  const withoutDerived = buildGateARow({ itemId: "item-1", fullBrief: "Renewal is due 1 January 2027.", factClaims: [] });
  assert.ok(withoutDerived.orphan_count > 0);
  // gate-a-scan.mjs's deadlineTokens extracts BOTH the full date ("1 January 2027", FULL_DATE) and the
  // month-year it contains ("January 2027", MONTH_YEAR) as separate tokens from the same text — both must
  // be in derivedCovered for orphan_count to reach 0; crediting only the full date still leaves one orphan.
  const withDerived = buildGateARow({
    itemId: "item-1",
    fullBrief: "Renewal is due 1 January 2027.",
    factClaims: [],
    derivedCovered: new Set(["1 january 2027", "january 2027"]),
  });
  assert.equal(withDerived.orphan_count, 0, JSON.stringify(withDerived.orphans));
});

// ── buildCitationEdges / buildCitationRows ───────────────────────────────────────────────────────────

test("buildCitationEdges: dedups a source-id iterable, drops falsy ids, stamps origin agent_extraction", () => {
  const edges = buildCitationEdges("item-1", ["src-1", null, "src-1", "src-2", undefined], "2026-09-02T00:00:00Z");
  assert.equal(edges.length, 2);
  assert.deepEqual(edges.map((e) => e.source_id).sort(), ["src-1", "src-2"]);
  assert.ok(edges.every((e) => e.intelligence_item_id === "item-1" && e.origin === "agent_extraction" && e.detected_at === "2026-09-02T00:00:00Z"));
});

test("buildCitationEdges: accepts a Set directly (groundBrief's own citedSourceIds accumulator shape)", () => {
  const edges = buildCitationEdges("item-1", new Set(["src-1", "src-2"]));
  assert.deepEqual(edges.map((e) => e.source_id).sort(), ["src-1", "src-2"]);
});

test("buildCitationRows: one row per DISTINCT cited source_id across claim rows (record tier's own shape)", () => {
  const claimRows = [{ source_id: "src-1" }, { source_id: "src-1" }, { source_id: null }, { source_id: "src-2" }];
  const rows = buildCitationRows("item-1", claimRows, "2026-09-02T00:00:00Z");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.source_id).sort(), ["src-1", "src-2"]);
});

// ── classifyMintOutcome ──────────────────────────────────────────────────────────────────────────────

test("classifyMintOutcome: 'verified' -> minted_verified; anything else (including null/undefined) -> minted_unverified", () => {
  assert.equal(classifyMintOutcome("verified"), "minted_verified");
  assert.equal(classifyMintOutcome("quarantined"), "minted_unverified");
  assert.equal(classifyMintOutcome("unverified"), "minted_unverified");
  assert.equal(classifyMintOutcome(null), "minted_unverified");
  assert.equal(classifyMintOutcome(undefined), "minted_unverified");
});

// ── record-tier row builders ─────────────────────────────────────────────────────────────────────────

const PAYLOAD = {
  id: "cw-1",
  item: {
    source_url: "https://eur-lex.europa.eu/32024R0001",
    item_type: "regulation",
    title: "Regulation (EU) 2024/0001",
    full_brief: "*Catalogue record.*\n\n- [title] verbatim span here",
    grade: "record",
  },
  source: { id: "src-1", url: "https://eur-lex.europa.eu", status: "active", base_tier: 1 },
  sections: [
    { section_key: "identity", section_order: 1, content_md: "id" },
    { section_key: "record_facts", section_order: 2, content_md: "facts" },
  ],
  search_results: [
    { result_url: "https://eur-lex.europa.eu/32024R0001", result_title: "Regulation (EU) 2024/0001", search_query: "canonical:record-grade", result_index: 0, result_content: "x".repeat(500) },
  ],
  claims: [
    { section_key: "identity", claim_kind: "FACT", claim_text: "[title] verbatim span here", source_span: "verbatim span here", source_url: "https://eur-lex.europa.eu/32024R0001", slot_key: "title" },
    { section_key: "record_facts", claim_kind: "GAP", claim_text: "[effective_date] not stated", source_span: null, source_url: null, slot_key: "effective_date" },
  ],
};

test("buildAgentRunSearchRows: one row per search_results[] entry, result_content copied VERBATIM and in FULL (ADR-016)", () => {
  const rows = buildAgentRunSearchRows(PAYLOAD, "item-1", "2026-09-02T00:00:00Z");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].intelligence_item_id, "item-1");
  assert.equal(rows[0].result_content, PAYLOAD.search_results[0].result_content);
  assert.equal(rows[0].result_content.length, 500);
  assert.equal(rows[0].searched_at, "2026-09-02T00:00:00Z");
});

test("buildSectionRows: one row per sections[] entry, item_id stamped", () => {
  const rows = buildSectionRows(PAYLOAD, "item-1");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.section_key), ["identity", "record_facts"]);
  assert.ok(rows.every((r) => r.item_id === "item-1"));
});

test("buildClaimRows: a FACT claim resolves section_row_id + search_result_id; a GAP claim carries neither", () => {
  const sectionIdBySectionKey = new Map([["identity", "sec-1"], ["record_facts", "sec-2"]]);
  const searchIdByUrl = new Map([["https://eur-lex.europa.eu/32024R0001", "search-1"]]);
  const rows = buildClaimRows(PAYLOAD, "item-1", { sectionIdBySectionKey, searchIdByUrl, sourceId: "src-1", sourceTier: 1 });
  const fact = rows.find((r) => r.claim_text.startsWith("[title]"));
  const gap = rows.find((r) => r.claim_text.startsWith("[effective_date]"));
  assert.equal(fact.section_row_id, "sec-1");
  assert.equal(fact.source_id, "src-1");
  assert.equal(fact.search_result_id, "search-1");
  assert.equal(fact.source_tier_at_grounding, 1);
  assert.equal(gap.section_row_id, "sec-2");
  assert.equal(gap.source_id, null);
  assert.equal(gap.search_result_id, null);
  assert.equal(gap.source_tier_at_grounding, null);
});

// ── writeGroundingSequence ───────────────────────────────────────────────────────────────────────────

/** A fake guarded-db that records every call (table, row/rows) and hands back deterministic ids — the
 *  write-order + write-shape assertions below read this call log directly. No DB, no network. */
function fakeDeps() {
  const calls = [];
  let nextId = 1;
  return {
    calls,
    cite: { skill: "write-item-test", reason: "proof" },
    guardedInsert: async (table, row, opts) => {
      calls.push({ fn: "guardedInsert", table, row, opts });
      return { inserted: { id: `${table}-${nextId++}`, ...row } };
    },
    guardedInsertMany: async (table, rows, opts) => {
      calls.push({ fn: "guardedInsertMany", table, rows, opts });
      const out = rows.map((r) => ({ id: `${table}-${nextId++}`, ...r }));
      return { inserted: out.length, rows: out };
    },
  };
}

test("writeGroundingSequence: writes in order searches -> sections -> gate-A -> claims -> citations (run #8: gate after claims left every item quarantined)", async () => {
  const deps = fakeDeps();
  const result = await writeGroundingSequence(PAYLOAD, "item-1", { sourceId: "src-1", sourceTier: 1 }, deps);
  const order = deps.calls.map((c) => `${c.fn}:${c.table}`);
  assert.deepEqual(order, [
    "guardedInsertMany:agent_run_searches",
    "guardedInsertMany:intelligence_item_sections",
    "guardedInsert:item_gate_a_state",
    "guardedInsertMany:section_claim_provenance",
    "guardedInsertMany:intelligence_item_citations",
  ]);
  assert.ok(deps.calls.every((c) => c.opts?.cite?.skill && c.opts?.cite?.reason));
  assert.equal(result.insSearches.inserted, 1);
  assert.equal(result.insSections.inserted, 2);
  assert.equal(result.insClaims.inserted, 2);
  assert.equal(result.insCitations.inserted, 1); // one FACT cites src-1; the GAP cites nothing
  assert.equal(result.claimRows.length, 2);
});

test("writeGroundingSequence: an empty search_results[]/sections[]/claims[] payload never calls guardedInsertMany for that table (no zero-row insert)", async () => {
  const deps = fakeDeps();
  const bare = { item: { full_brief: "" }, source: {}, sections: [], search_results: [], claims: [] };
  const result = await writeGroundingSequence(bare, "item-1", { sourceId: null, sourceTier: null }, deps);
  const tablesCalled = deps.calls.map((c) => c.table);
  assert.ok(!tablesCalled.includes("agent_run_searches"));
  assert.ok(!tablesCalled.includes("intelligence_item_sections"));
  assert.ok(!tablesCalled.includes("section_claim_provenance"));
  assert.ok(!tablesCalled.includes("intelligence_item_citations"));
  assert.ok(tablesCalled.includes("item_gate_a_state")); // gate-A always writes, even over an empty ledger
  assert.deepEqual(result.insSearches, { inserted: 0, snapshot: null, rows: [] });
  assert.deepEqual(result.claimRows, []);
});

test("writeGroundingSequence: a mid-sequence write failure propagates (no swallow) — the caller (apply-mint-batch.mjs) owns cleanup", async () => {
  const deps = fakeDeps();
  const realMany = deps.guardedInsertMany;
  deps.guardedInsertMany = async (table, rows, opts) => {
    if (table === "agent_run_searches") throw new Error("boom: unsupported Unicode escape sequence");
    return realMany(table, rows, opts);
  };
  await assert.rejects(
    () => writeGroundingSequence(PAYLOAD, "item-1", { sourceId: "src-1", sourceTier: 1 }, deps),
    /boom: unsupported Unicode escape sequence/,
  );
  // nothing past the failed write ran
  assert.ok(!deps.calls.some((c) => c.table === "intelligence_item_sections"));
});
