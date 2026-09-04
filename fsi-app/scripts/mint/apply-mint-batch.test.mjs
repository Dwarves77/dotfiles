// Tests for apply-mint-batch.mjs (Lane POP, 2026-09-02). node:test + node:assert/strict. No network, no
// DB: every DB interaction is a fake object injected as `ctx.db` / `deps` — guardedInsert/guardedInsertMany/
// guardedUpdate/registerSource/rpc are plain in-memory recorders, never the real scripts/lib/db.mjs client.
// This file (and apply-mint-batch.mjs's own imports — ./lib/gate-a-scan.mjs, ../lib/run-artifact.mjs,
// ../../src/lib/domains.ts) is portable: node: builtins + relative .mjs/.ts only, per
// .discipline/glob-portability.test.mjs's rule that fsi-app/scripts/mint/*.test.mjs runs with no npm ci.
// Run: node --test scripts/mint/apply-mint-batch.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildItemsIndex,
  checkM4,
  normalizeInstrumentIdentifier,
  sameInstrumentIdentity,
  censusRowIdSet,
  resolveCensusRowId,
  buildIntelligenceItemRow,
  buildAgentRunSearchRows,
  buildSectionRows,
  buildClaimRows,
  buildCitationRows,
  computeGateAState,
  enrichMintRunArtifact,
  applyOnePayload,
  resolveValidationFailedHolds,
  defaultReportPathFor,
  VALIDATION_FAILED_HOLD_REASON_PREFIX,
  run,
} from "./apply-mint-batch.mjs";
import { validateRunArtifact } from "../lib/run-artifact.mjs";

// ── buildItemsIndex / checkM4 ────────────────────────────────────────────────────────────────────────

test("buildItemsIndex: indexes by canonical_instrument_key (list, for collisions) AND by source_url (list, for a shared landing page) -- never a single-value overwrite", () => {
  const items = [
    { id: "i1", source_url: "https://x/a", canonical_instrument_key: "32024R0001", instrument_identifier: null, archive_reason: null },
    { id: "i2", source_url: "https://x/b", canonical_instrument_key: null, instrument_identifier: "series-one", archive_reason: null },
    { id: "i3", source_url: "https://x/b", canonical_instrument_key: null, instrument_identifier: "series-two", archive_reason: null }, // SAME url as i2, different identifier
  ];
  const idx = buildItemsIndex(items);
  assert.deepEqual(idx.byCanonicalKey.get("32024R0001").map((h) => h.id), ["i1"]);
  assert.deepEqual(idx.bySourceUrl.get("https://x/a").map((h) => h.id), ["i1"]);
  assert.deepEqual(idx.bySourceUrl.get("https://x/b").map((h) => h.id), ["i2", "i3"], "both holders at the SAME url are kept, not just the last one indexed");
});

// ── normalizeInstrumentIdentifier / sameInstrumentIdentity (the M4 same-URL identity rule) ─────────────

test("normalizeInstrumentIdentifier: trims + lowercases; null/undefined/empty/whitespace-only all normalize to null", () => {
  assert.equal(normalizeInstrumentIdentifier("  Eurosuper-95  "), "eurosuper-95");
  assert.equal(normalizeInstrumentIdentifier(null), null);
  assert.equal(normalizeInstrumentIdentifier(undefined), null);
  assert.equal(normalizeInstrumentIdentifier(""), null);
  assert.equal(normalizeInstrumentIdentifier("   "), null);
});

test("sameInstrumentIdentity: both unlabelled -> same (fail-closed, an older unlabelled row MAY be the same document)", () => {
  assert.equal(sameInstrumentIdentity(null, null), true);
  assert.equal(sameInstrumentIdentity(undefined, ""), true);
});

test("sameInstrumentIdentity: both labelled and equal (case-insensitive, trimmed) -> same", () => {
  assert.equal(sameInstrumentIdentity("eu-oil-bulletin:eurosuper-95", "  EU-Oil-Bulletin:Eurosuper-95  "), true);
});

test("sameInstrumentIdentity: both labelled and DIFFERENT -> not the same (a sibling series, not a duplicate)", () => {
  assert.equal(sameInstrumentIdentity("eu-oil-bulletin:eurosuper-95", "eu-oil-bulletin:automotive-diesel"), false);
});

test("sameInstrumentIdentity: one side labelled, the other unlabelled -> same, in BOTH directions (asymmetric information, symmetric fail-closed rule — see MINT-RUNBOOK.md's M4 paragraph)", () => {
  assert.equal(sameInstrumentIdentity("eu-oil-bulletin:eurosuper-95", null), true, "a payload with a real identifier against an unlabelled holder still blocks");
  assert.equal(sameInstrumentIdentity(null, "eu-oil-bulletin:eurosuper-95"), true, "an unlabelled payload against a labelled holder still blocks");
});

// ── checkM4 ───────────────────────────────────────────────────────────────────────────────────────────

test("checkM4: a canonical-key holder archived out_of_scope_wo26 -> not_applied_wo26_excluded", () => {
  const idx = buildItemsIndex([{ id: "holder-1", source_url: "https://x/held", canonical_instrument_key: "32024R0001", archive_reason: "out_of_scope_wo26" }]);
  const payload = { item: { canonical_instrument_key: "32024R0001", source_url: "https://x/new" } };
  assert.deepEqual(checkM4(payload, idx), { blocked: true, outcome: "not_applied_wo26_excluded", holderId: "holder-1" });
});

test("checkM4: a canonical-key holder with any OTHER archive_reason (or none) -> not_applied_holder_conflict (unconditional, untouched by the same-URL identity fix)", () => {
  const idx = buildItemsIndex([{ id: "holder-2", source_url: "https://x/held", canonical_instrument_key: "32024R0001", archive_reason: null }]);
  const payload = { item: { canonical_instrument_key: "32024R0001", source_url: "https://x/new" } };
  assert.deepEqual(checkM4(payload, idx), { blocked: true, outcome: "not_applied_holder_conflict", holderId: "holder-2" });
});

test("checkM4: TRUE DUPLICATE — no canonical-key holder, same source_url, SAME instrument_identifier (case-insensitive, trimmed) -> not_applied_url_holder", () => {
  const idx = buildItemsIndex([{ id: "holder-3", source_url: "https://x/same", canonical_instrument_key: null, instrument_identifier: "eu-oil-bulletin:eurosuper-95", archive_reason: null }]);
  const payload = { item: { canonical_instrument_key: null, source_url: "https://x/same", instrument_identifier: "  EU-Oil-Bulletin:Eurosuper-95  " } };
  assert.deepEqual(checkM4(payload, idx), { blocked: true, outcome: "not_applied_url_holder", holderId: "holder-3" });
});

test("checkM4: NULL-VS-NULL DUPLICATE — same source_url, neither side carries an instrument_identifier -> not_applied_url_holder (fail-closed)", () => {
  const idx = buildItemsIndex([{ id: "holder-4", source_url: "https://x/same", canonical_instrument_key: "32099R9999", instrument_identifier: null, archive_reason: null }]);
  const payload = { item: { canonical_instrument_key: "32024R0001", source_url: "https://x/same", instrument_identifier: null } };
  assert.deepEqual(checkM4(payload, idx), { blocked: true, outcome: "not_applied_url_holder", holderId: "holder-4" });
});

test("checkM4: NULL-HOLDER ASYMMETRY — a payload WITH a real instrument_identifier against a same-URL holder with NO identifier still blocks (the older unlabelled row may be the same document)", () => {
  const idx = buildItemsIndex([{ id: "holder-5", source_url: "https://x/same", canonical_instrument_key: null, instrument_identifier: null, archive_reason: null }]);
  const payload = { item: { canonical_instrument_key: null, source_url: "https://x/same", instrument_identifier: "eu-oil-bulletin:eurosuper-95" } };
  assert.deepEqual(checkM4(payload, idx), { blocked: true, outcome: "not_applied_url_holder", holderId: "holder-5" });
});

test("checkM4: SIBLING SERIES — same source_url, holder carries a DIFFERENT non-null instrument_identifier -> NOT blocked (ruling R-D's case: six series sharing one landing page)", () => {
  const idx = buildItemsIndex([{ id: "holder-6", source_url: "https://x/bulletin", canonical_instrument_key: null, instrument_identifier: "eu-oil-bulletin:eurosuper-95", archive_reason: null }]);
  const payload = { item: { canonical_instrument_key: null, source_url: "https://x/bulletin", instrument_identifier: "eu-oil-bulletin:automotive-diesel" } };
  assert.deepEqual(checkM4(payload, idx), { blocked: false });
});

test("checkM4: no key match, no url match -> not blocked", () => {
  const idx = buildItemsIndex([]);
  const payload = { item: { canonical_instrument_key: "32024R0001", source_url: "https://x/fresh" } };
  assert.deepEqual(checkM4(payload, idx), { blocked: false });
});

// ── censusRowIdSet / resolveCensusRowId ─────────────────────────────────────────────────────────────

test("censusRowIdSet / resolveCensusRowId: a payload traces back to its row ONLY when its id IS a real row_id", () => {
  const rowIdSet = censusRowIdSet([{ row_id: "cw-1" }, { row_id: "cw-2" }, {}]);
  assert.deepEqual([...rowIdSet].sort(), ["cw-1", "cw-2"]);
  assert.equal(resolveCensusRowId({ id: "cw-1" }, rowIdSet), "cw-1");
  assert.equal(resolveCensusRowId({ id: "CELEX:32024R0001" }, rowIdSet), null); // fell back to a non-row_id id
  assert.equal(resolveCensusRowId({}, rowIdSet), null);
});

// ── resolveValidationFailedHolds / defaultReportPathFor (lane URL-GUIL, 2026-09-03) ───────────────────

test("defaultReportPathFor: swaps the apply-ready suffix for the sibling mint-batch-report suffix", () => {
  assert.equal(
    defaultReportPathFor("/x/scripts/_snapshots/population-1/census-rows.apply-ready.json"),
    "/x/scripts/_snapshots/population-1/census-rows.mint-batch-report.json",
  );
});

test("resolveValidationFailedHolds: one hold per failed result that traces to a real census row_id; a valid result, an untraceable id, and a build_failed entry all produce nothing", () => {
  const rowIdSet = censusRowIdSet([{ row_id: "cw-1" }, { row_id: "cw-2" }]);
  const report = {
    results: [
      { id: "cw-1", valid: true, failures: [] },
      { id: "cw-2", valid: false, failures: [{ criterion: 2, reason: "ungrounded_url", url: "http://eur-lex»" }] },
      { id: "CELEX:32024R0001", valid: false, failures: [{ criterion: 3, reason: "fact_missing_source_span" }] }, // no row_id
      { id: "census-index-9", valid: false, failures: [{ criterion: "kit", reason: "record_build_failed" }] }, // untraceable
    ],
  };
  const holds = resolveValidationFailedHolds(report, rowIdSet);
  assert.equal(holds.length, 1);
  assert.equal(holds[0].rowId, "cw-2");
  assert.equal(holds[0].hold_reason, `${VALIDATION_FAILED_HOLD_REASON_PREFIX}2:ungrounded_url`);
  assert.deepEqual(holds[0].evidence, report.results[1].failures);
});

test("resolveValidationFailedHolds: multiple failures on one row comma-join into a single hold_reason, in report order", () => {
  const rowIdSet = censusRowIdSet([{ row_id: "cw-1" }]);
  const report = {
    results: [
      { id: "cw-1", valid: false, failures: [
        { criterion: 2, reason: "ungrounded_url" },
        { criterion: 3, reason: "fact_missing_source_span" },
      ] },
    ],
  };
  const holds = resolveValidationFailedHolds(report, rowIdSet);
  assert.equal(holds[0].hold_reason, `${VALIDATION_FAILED_HOLD_REASON_PREFIX}2:ungrounded_url,3:fact_missing_source_span`);
});

test("resolveValidationFailedHolds: an empty/missing report, or one with no failing traceable rows, holds nothing", () => {
  const rowIdSet = censusRowIdSet([{ row_id: "cw-1" }]);
  assert.deepEqual(resolveValidationFailedHolds(null, rowIdSet), []);
  assert.deepEqual(resolveValidationFailedHolds({ results: [] }, rowIdSet), []);
  assert.deepEqual(resolveValidationFailedHolds({ results: [{ id: "cw-1", valid: true }] }, rowIdSet), []);
});

// ── row builders ─────────────────────────────────────────────────────────────────────────────────────

const PAYLOAD = {
  id: "cw-1",
  item: {
    source_url: "https://eur-lex.europa.eu/32024R0001",
    item_type: "regulation",
    title: "Regulation (EU) 2024/0001",
    full_brief: "*Catalogue record.*\n\n- [title] verbatim span here",
    instrument_identifier: "32024R0001",
    canonical_instrument_key: "32024R0001",
    jurisdiction_iso: "EU",
    priority: "MODERATE",
    grade: "record",
  },
  source: { id: "src-1", url: "https://eur-lex.europa.eu", status: "active", base_tier: 1 },
  sections: [
    { section_key: "identity", section_order: 1, content_md: "id" },
    { section_key: "record_facts", section_order: 2, content_md: "facts" },
  ],
  search_results: [
    { result_url: "https://eur-lex.europa.eu/32024R0001", result_title: "Regulation (EU) 2024/0001", search_query: "canonical:record-grade", result_index: 0, result_content: "x".repeat(500), fetched_length: 500 },
  ],
  claims: [
    { section_key: "identity", claim_kind: "FACT", claim_text: "[title] verbatim span here", source_span: "verbatim span here", source_url: "https://eur-lex.europa.eu/32024R0001", slot_key: "title" },
    { section_key: "record_facts", claim_kind: "GAP", claim_text: "[effective_date] not stated", source_span: null, source_url: null, slot_key: "effective_date" },
  ],
};

test("buildIntelligenceItemRow: wraps jurisdiction_iso into an array (column is TEXT[], migration 033), defaults grade to record", () => {
  const row = buildIntelligenceItemRow(PAYLOAD, { sourceId: "src-1", domain: 1 });
  assert.equal(row.title, "Regulation (EU) 2024/0001");
  assert.equal(row.source_id, "src-1");
  assert.equal(row.domain, 1);
  assert.deepEqual(row.jurisdiction_iso, ["EU"]);
  assert.equal(row.item_grade, "record");
  assert.equal("provenance_status" in row, false, "provenance_status must be OMITTED — trigger-derived, never set by this script");
});

test("buildIntelligenceItemRow: absent jurisdiction_iso -> empty array, not null (column default)", () => {
  const row = buildIntelligenceItemRow({ item: { ...PAYLOAD.item, jurisdiction_iso: null } }, { sourceId: "src-1", domain: 1 });
  assert.deepEqual(row.jurisdiction_iso, []);
});

test("buildAgentRunSearchRows: one row per search_results[] entry, result_content copied VERBATIM and in FULL (ADR-016)", () => {
  const rows = buildAgentRunSearchRows(PAYLOAD, "item-1", "2026-09-02T00:00:00Z");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].intelligence_item_id, "item-1");
  assert.equal(rows[0].result_content, PAYLOAD.search_results[0].result_content);
  assert.equal(rows[0].result_content.length, 500);
  assert.equal(rows[0].result_url, "https://eur-lex.europa.eu/32024R0001");
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

test("buildClaimRows RED: a FACT claim whose source_url has no matching agent_run_searches row -> search_result_id null, not a crash", () => {
  const sectionIdBySectionKey = new Map([["identity", "sec-1"]]);
  const searchIdByUrl = new Map(); // no match
  const rows = buildClaimRows(PAYLOAD, "item-1", { sectionIdBySectionKey, searchIdByUrl, sourceId: "src-1", sourceTier: 1 });
  const fact = rows.find((r) => r.claim_text.startsWith("[title]"));
  assert.equal(fact.search_result_id, null);
});

test("buildCitationRows: one row per DISTINCT cited source_id, origin agent_extraction", () => {
  const claimRows = [
    { source_id: "src-1" }, { source_id: "src-1" }, { source_id: null }, { source_id: "src-2" },
  ];
  const rows = buildCitationRows("item-1", claimRows, "2026-09-02T00:00:00Z");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.source_id).sort(), ["src-1", "src-2"]);
  assert.ok(rows.every((r) => r.intelligence_item_id === "item-1" && r.origin === "agent_extraction"));
});

test("computeGateAState: scans full_brief against the payload's own FACT claims (record-tier plan §2's 'by construction' claim, measured not assumed)", () => {
  const ga = computeGateAState(PAYLOAD, "item-1", "2026-09-02T00:00:00Z");
  assert.equal(ga.intelligence_item_id, "item-1");
  assert.equal(typeof ga.orphan_count, "number");
  assert.ok(Array.isArray(ga.orphans));
  assert.equal(ga.scanned_at, "2026-09-02T00:00:00Z");
});

// ── enrichMintRunArtifact ────────────────────────────────────────────────────────────────────────────

function baseArtifact(overrides = {}) {
  return {
    harness_family: "mint",
    harness_version: "sha256:abc123",
    run_id: "mint-run-007",
    started_at: "2026-09-02T00:00:00Z",
    config: { phase: "census-rows" },
    inputs_ref: ["scripts/_snapshots/population-x/census-rows.json"],
    per_item: [{ id: "cw-1", outcome: "apply_ready" }],
    metrics: { attempted: 1, valid: 1, db_deltas: { items: 0, sections: 0, claims: 0, searches: 0, gate_a: 0, citations: 0, sources: 0 } },
    defects_found: [],
    full_trace_refs: ["scripts/_snapshots/population-x/census-rows.json"],
    proposer_notes: "",
    ...overrides,
  };
}

test("enrichMintRunArtifact: replaces an existing per_item id's entry, appends a new one, stays validateRunArtifact-clean", () => {
  const artifact = baseArtifact();
  const enriched = enrichMintRunArtifact(artifact, {
    perItemPatches: [
      { id: "cw-1", outcome: "minted_verified", item_id: "item-1" }, // replaces
      { id: "cw-2", outcome: "not_applied_holder_conflict" }, // appended
    ],
    metricsPatch: { db_deltas: { items: 1, sections: 2, claims: 3, searches: 1, gate_a: 1, citations: 1, sources: 0 }, minted: 1 },
  });
  assert.equal(enriched.per_item.length, 2);
  assert.equal(enriched.per_item.find((p) => p.id === "cw-1").outcome, "minted_verified");
  assert.equal(enriched.per_item.find((p) => p.id === "cw-2").outcome, "not_applied_holder_conflict");
  assert.equal(enriched.metrics.db_deltas.items, 1); // additive over the pre-existing 0
  assert.equal(enriched.metrics.minted, 1);
  assert.equal(enriched.metrics.attempted, 1); // untouched pre-existing key survives (additive, not wholesale replace)
  assert.deepEqual(validateRunArtifact(enriched), []);
});

test("enrichMintRunArtifact: never mutates its input artifact", () => {
  const artifact = baseArtifact();
  const before = JSON.stringify(artifact);
  enrichMintRunArtifact(artifact, { perItemPatches: [{ id: "cw-1", outcome: "minted_verified" }] });
  assert.equal(JSON.stringify(artifact), before);
});

test("enrichMintRunArtifact: db_deltas ADDS across two enrichment calls (batch's own metrics survive an apply pass)", () => {
  const artifact = baseArtifact({ metrics: { db_deltas: { items: 5, sections: 20 } } });
  const enriched = enrichMintRunArtifact(artifact, { metricsPatch: { db_deltas: { items: 1, sections: 4 } } });
  assert.equal(enriched.metrics.db_deltas.items, 6);
  assert.equal(enriched.metrics.db_deltas.sections, 24);
});

// ── applyOnePayload ──────────────────────────────────────────────────────────────────────────────────

function fakeDbThatThrows() {
  return {
    guardedInsert: async () => { throw new Error("guardedInsert should not be called in this test"); },
    guardedInsertMany: async () => { throw new Error("guardedInsertMany should not be called in this test"); },
    guardedUpdate: async () => { throw new Error("guardedUpdate should not be called in this test"); },
    registerSource: async () => { throw new Error("registerSource should not be called in this test"); },
  };
}

test("applyOnePayload: M4-blocked payload never touches ctx.db, in EITHER dry or apply mode", async () => {
  const idx = buildItemsIndex([{ id: "holder-1", source_url: "https://x/other", canonical_instrument_key: "32024R0001", archive_reason: "out_of_scope_wo26" }]);
  const payload = { id: "cw-1", item: { canonical_instrument_key: "32024R0001", source_url: "https://x/new" } };
  for (const apply of [false, true]) {
    const ctx = { db: fakeDbThatThrows(), rpc: async () => { throw new Error("rpc should not be called"); }, itemsIndex: idx, sourcesById: new Map(), rowIdSet: new Set(), cite: { skill: "x", reason: "y" }, apply };
    const result = await applyOnePayload(payload, ctx);
    assert.equal(result.perItem.outcome, "not_applied_wo26_excluded");
    assert.equal(result.perItem.holder_item_id, "holder-1");
    assert.deepEqual(result.dbDeltas, { items: 0, sections: 0, claims: 0, searches: 0, gate_a: 0, citations: 0, sources: 0 });
    assert.equal(result.censusStamped, false);
  }
});

test("applyOnePayload: DRY mode (not M4-blocked) plans and reports, never calls ctx.db", async () => {
  const idx = buildItemsIndex([]);
  const ctx = { db: fakeDbThatThrows(), rpc: async () => { throw new Error("rpc should not be called in dry mode"); }, itemsIndex: idx, sourcesById: new Map([["src-1", { id: "src-1", status: "active", category: "regulatory" }]]), rowIdSet: censusRowIdSet([{ row_id: "cw-1" }]), cite: { skill: "x", reason: "y" }, apply: false };
  const result = await applyOnePayload(PAYLOAD, ctx);
  assert.equal(result.perItem.outcome, "would_apply");
  assert.match(result.perItem.verdict, /2 section\(s\), 2 claim\(s\), 1 search result\(s\)/);
  assert.equal(result.censusStamped, false);
});

test("applyOnePayload: DRY mode reports would_apply_new_source when the payload's source needs inline registration", async () => {
  const idx = buildItemsIndex([]);
  const ctx = { db: fakeDbThatThrows(), rpc: async () => {}, itemsIndex: idx, sourcesById: new Map(), rowIdSet: new Set(), cite: { skill: "x", reason: "y" }, apply: false };
  const result = await applyOnePayload(PAYLOAD, ctx); // src-1 not in sourcesById
  assert.equal(result.perItem.outcome, "would_apply_new_source");
});

/** A fake guarded-db that records every call (table, row/rows/patch) and hands back deterministic ids —
 *  the write-order + write-shape assertions below read this call log directly. No DB, no network. */
function fakeAppliedDb() {
  const calls = [];
  let nextId = 1;
  return {
    calls,
    guardedInsert: async (table, row, opts) => {
      calls.push({ fn: "guardedInsert", table, row, opts });
      const id = `${table}-${nextId++}`;
      return { inserted: { id, ...row }, snapshot: "snap.jsonl" };
    },
    guardedInsertMany: async (table, rows, opts) => {
      calls.push({ fn: "guardedInsertMany", table, rows, opts });
      const out = rows.map((r, i) => ({ id: `${table}-${nextId++}`, ...r }));
      return { inserted: out.length, snapshot: "snap.jsonl", rows: out };
    },
    guardedUpdate: async (table, applyMatch, patch, opts) => {
      calls.push({ fn: "guardedUpdate", table, patch, opts });
      return { updated: 1, snapshot: "snap.jsonl", rows: [{ id: "cw-1", ...patch }] };
    },
    registerSource: async (source, opts) => {
      calls.push({ fn: "registerSource", source, opts });
      return { source_id: "src-registered-1", created: true, host: "eur-lex.europa.eu" };
    },
    guardedDelete: async (table, ids, opts) => {
      calls.push({ fn: "guardedDelete", table, ids, opts });
      return { deleted: ids.length, snapshot: "snap.jsonl", rows: ids.map((id) => ({ id })) };
    },
    // the row's own provenance_status after the write sequence (what the trigger derivation stamped)
    readItemProvenance: async (itemId) => { calls.push({ fn: "readItemProvenance", itemId }); return "verified"; },
  };
}

test("applyOnePayload APPLY: writes in the canonical-pipeline.ts order — intelligence_items, agent_run_searches, intelligence_item_sections, item_gate_a_state BEFORE section_claim_provenance, intelligence_item_citations (run #8: gate after claims left every item quarantined)", async () => {
  const idx = buildItemsIndex([]);
  const db = fakeAppliedDb();
  const rpc = async () => ({ valid: true, recommended_status: "verified" });
  const ctx = { db, rpc, itemsIndex: idx, sourcesById: new Map([["src-1", { id: "src-1", status: "active", category: "regulatory", base_tier: 1 }]]), rowIdSet: censusRowIdSet([{ row_id: "cw-1" }]), cite: { skill: "record-tier-population-plan", reason: "test" }, apply: true };
  const result = await applyOnePayload(PAYLOAD, ctx);

  const order = db.calls.map((c) => `${c.fn}:${c.table ?? ""}`);
  assert.deepEqual(order, [
    "guardedInsert:intelligence_items",
    "guardedInsertMany:agent_run_searches",
    "guardedInsertMany:intelligence_item_sections",
    "guardedInsert:item_gate_a_state",
    "guardedInsertMany:section_claim_provenance",
    "guardedInsertMany:intelligence_item_citations",
    "readItemProvenance:",
    "guardedUpdate:census_worklist",
  ]);
  // every write carries the cite (db.mjs requireCite would refuse a write with none — this proves the
  // caller always supplies one, not that the fake enforces it).
  assert.ok(db.calls.filter((c) => c.fn !== "readItemProvenance").every((c) => c.opts?.cite?.skill && c.opts?.cite?.reason));

  assert.equal(result.perItem.outcome, "minted_verified");
  assert.equal(result.perItem.item_id, "intelligence_items-1");
  assert.equal(result.perItem.error, null);
  assert.deepEqual(result.dbDeltas, { items: 1, sections: 2, claims: 2, searches: 1, gate_a: 1, citations: 1, sources: 0 });
  assert.equal(result.censusStamped, true);
  assert.equal(result.censusRowId, "cw-1");
});

test("applyOnePayload APPLY: a row left non-verified by the trigger derivation records minted_unverified with the row status AND the rpc failures, never deletes/retries", async () => {
  const idx = buildItemsIndex([]);
  const db = fakeAppliedDb();
  db.readItemProvenance = async () => "quarantined";
  const rpc = async () => ({ valid: false, recommended_status: "quarantined", failures: [{ criterion: "C3", reason: "fact_span_not_in_source" }] });
  const ctx = { db, rpc, itemsIndex: idx, sourcesById: new Map([["src-1", { id: "src-1", status: "active", category: "regulatory", base_tier: 1 }]]), rowIdSet: new Set(), cite: { skill: "x", reason: "y" }, apply: true };
  const result = await applyOnePayload(PAYLOAD, ctx);
  assert.equal(result.perItem.outcome, "minted_unverified");
  assert.match(result.perItem.error, /fact_span_not_in_source/);
  assert.match(result.perItem.error, /"row_provenance_status":"quarantined"/);
  // no delete/retry call of any kind appears in the write log — only the inserts/update above ran.
  assert.ok(!db.calls.some((c) => c.fn.toLowerCase().includes("delete")));
});

test("applyOnePayload APPLY: run #8's shape — the rpc says valid but the ROW is quarantined -> minted_unverified (the row wins; the artifact never reports verified against a quarantined row)", async () => {
  const idx = buildItemsIndex([]);
  const db = fakeAppliedDb();
  db.readItemProvenance = async () => "quarantined";
  const rpc = async () => ({ valid: true, recommended_status: "verified" });
  const ctx = { db, rpc, itemsIndex: idx, sourcesById: new Map([["src-1", { id: "src-1", status: "active", category: "regulatory", base_tier: 1 }]]), rowIdSet: new Set(), cite: { skill: "x", reason: "y" }, apply: true };
  const result = await applyOnePayload(PAYLOAD, ctx);
  assert.equal(result.perItem.outcome, "minted_unverified");
  assert.match(result.perItem.verdict, /row provenance_status=quarantined; rpc recommended_status=verified/);
});

test("applyOnePayload APPLY: a write failure after the item row (run #8: U+0000 in a search result) -> apply_failed, the partial item is deleted through the guarded path, the batch is not aborted", async () => {
  const idx = buildItemsIndex([]);
  const db = fakeAppliedDb();
  const realMany = db.guardedInsertMany;
  db.guardedInsertMany = async (table, rows, opts) => {
    if (table === "agent_run_searches") throw new Error("guardedInsertMany failed (chunk 0): unsupported Unicode escape sequence");
    return realMany(table, rows, opts);
  };
  const rpc = async () => { throw new Error("rpc must not run after a failed write sequence"); };
  const ctx = { db, rpc, itemsIndex: idx, sourcesById: new Map([["src-1", { id: "src-1", status: "active", category: "regulatory", base_tier: 1 }]]), rowIdSet: censusRowIdSet([{ row_id: "cw-1" }]), cite: { skill: "x", reason: "y" }, apply: true };
  const result = await applyOnePayload(PAYLOAD, ctx);
  assert.equal(result.perItem.outcome, "apply_failed");
  assert.equal(result.perItem.item_id, "intelligence_items-1");
  assert.match(result.perItem.error, /unsupported Unicode escape sequence/);
  assert.equal(result.perItem.cleanup, "partial_item_deleted");
  const del = db.calls.find((c) => c.fn === "guardedDelete");
  assert.deepEqual(del.ids, ["intelligence_items-1"]);
  assert.ok(del.opts?.cite?.skill);
  assert.equal(result.censusStamped, false, "a failed apply never reconciles the census row");
  assert.ok(!db.calls.some((c) => c.table === "census_worklist"));
  assert.deepEqual(result.dbDeltas, { items: 0, sections: 0, claims: 0, searches: 0, gate_a: 0, citations: 0, sources: 0 });
});

test("applyOnePayload APPLY: when the compensating delete itself fails, the outcome still says so honestly", async () => {
  const idx = buildItemsIndex([]);
  const db = fakeAppliedDb();
  db.guardedInsertMany = async () => { throw new Error("boom"); };
  db.guardedDelete = async () => { throw new Error("delete refused"); };
  const ctx = { db, rpc: async () => ({}), itemsIndex: idx, sourcesById: new Map([["src-1", { id: "src-1", status: "active", category: "regulatory", base_tier: 1 }]]), rowIdSet: new Set(), cite: { skill: "x", reason: "y" }, apply: true };
  const result = await applyOnePayload(PAYLOAD, ctx);
  assert.equal(result.perItem.outcome, "apply_failed");
  assert.match(result.perItem.cleanup, /partial_item_delete_failed: delete refused/);
});

test("applyOnePayload APPLY: source needing registration is registered inline via registerSource FIRST, and reused for the insert", async () => {
  const idx = buildItemsIndex([]);
  const db = fakeAppliedDb();
  const rpc = async () => ({ valid: true });
  const ctx = { db, rpc, itemsIndex: idx, sourcesById: new Map(), rowIdSet: new Set(), cite: { skill: "x", reason: "y" }, apply: true };
  const result = await applyOnePayload(PAYLOAD, ctx);
  assert.equal(db.calls[0].fn, "registerSource");
  assert.equal(db.calls[1].fn, "guardedInsert");
  assert.equal(db.calls[1].row.source_id, "src-registered-1");
  assert.deepEqual(result.dbDeltas.sources, 1); // a FRESH registration counts as a sources delta
});

test("applyOnePayload APPLY: a domainForItemType miss (unresolvable item_type/category pair) -> not_applied_domain_unresolved, no writes", async () => {
  const idx = buildItemsIndex([]);
  const db = fakeAppliedDb();
  const payload = { ...PAYLOAD, item: { ...PAYLOAD.item, item_type: "not-a-real-item-type" } };
  const ctx = { db, rpc: async () => { throw new Error("rpc should not be reached"); }, itemsIndex: idx, sourcesById: new Map([["src-1", { id: "src-1", status: "active", category: "regulatory" }]]), rowIdSet: new Set(), cite: { skill: "x", reason: "y" }, apply: true };
  const result = await applyOnePayload(payload, ctx);
  assert.equal(result.perItem.outcome, "not_applied_domain_unresolved");
  assert.equal(db.calls.length, 0);
});

test("applyOnePayload APPLY: a later payload in the SAME batch sees an already-minted item as an M4 holder", async () => {
  const idx = buildItemsIndex([]);
  const db = fakeAppliedDb();
  const rpc = async () => ({ valid: true });
  const ctx = { db, rpc, itemsIndex: idx, sourcesById: new Map([["src-1", { id: "src-1", status: "active", category: "regulatory", base_tier: 1 }]]), rowIdSet: new Set(), cite: { skill: "x", reason: "y" }, apply: true };
  await applyOnePayload(PAYLOAD, ctx); // mints CELEX 32024R0001

  const secondPayload = { ...PAYLOAD, id: "cw-2" }; // SAME canonical_instrument_key, a different census row
  const second = await applyOnePayload(secondPayload, ctx);
  assert.equal(second.perItem.outcome, "not_applied_holder_conflict");
});

test("applyOnePayload APPLY: SIX-SERIES BATCH — one series mints, its five same-URL siblings (distinct instrument_identifier, canonical_instrument_key null) all pass the pre-check and mint too (population apply #34's real shape, fixed)", async () => {
  const idx = buildItemsIndex([]);
  const db = fakeAppliedDb();
  const rpc = async () => ({ valid: true, recommended_status: "verified" });
  const ctx = { db, rpc, itemsIndex: idx, sourcesById: new Map([["src-1", { id: "src-1", status: "active", category: "regulatory", base_tier: 1 }]]), rowIdSet: new Set(), cite: { skill: "x", reason: "y" }, apply: true };

  const seriesKeys = ["eurosuper-95", "automotive-diesel", "heating-gas-oil", "lpg-motor-fuel", "residual-fuel-oil-1pct", "heavy-fuel-oil-3-5pct"];
  const bulletinUrl = "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en";
  const results = [];
  for (const key of seriesKeys) {
    const payload = {
      ...PAYLOAD,
      id: `cw-${key}`,
      item: { ...PAYLOAD.item, canonical_instrument_key: null, instrument_identifier: `eu-oil-bulletin:${key}`, source_url: bulletinUrl },
    };
    results.push(await applyOnePayload(payload, ctx));
  }
  assert.deepEqual(results.map((r) => r.perItem.outcome), Array(6).fill("minted_verified"), JSON.stringify(results.map((r) => r.perItem)));
  assert.deepEqual(idx.bySourceUrl.get(bulletinUrl).map((h) => h.instrument_identifier).sort(), seriesKeys.map((k) => `eu-oil-bulletin:${k}`).sort());
});

test("applyOnePayload APPLY: a later payload in the SAME batch at the SAME source_url with the SAME instrument_identifier IS blocked (a true duplicate minted twice in one run, not a sibling series)", async () => {
  const idx = buildItemsIndex([]);
  const db = fakeAppliedDb();
  const rpc = async () => ({ valid: true, recommended_status: "verified" });
  const ctx = { db, rpc, itemsIndex: idx, sourcesById: new Map([["src-1", { id: "src-1", status: "active", category: "regulatory", base_tier: 1 }]]), rowIdSet: new Set(), cite: { skill: "x", reason: "y" }, apply: true };
  const seriesPayload = { ...PAYLOAD, item: { ...PAYLOAD.item, canonical_instrument_key: null, instrument_identifier: "eu-oil-bulletin:eurosuper-95", source_url: "https://x/bulletin" } };

  const first = await applyOnePayload({ ...seriesPayload, id: "cw-1" }, ctx);
  assert.equal(first.perItem.outcome, "minted_verified");
  const second = await applyOnePayload({ ...seriesPayload, id: "cw-1-dup" }, ctx); // same identifier, same url
  assert.equal(second.perItem.outcome, "not_applied_url_holder");
  assert.equal(second.perItem.holder_item_id, first.perItem.item_id);
});

// ── run() — end to end over fake files + fake deps ──────────────────────────────────────────────────

async function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "apply-mint-batch-test-"));
  try { return await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

function writeJson(path, obj) { writeFileSync(path, JSON.stringify(obj, null, 2)); }

test("run(): DRY mode writes NOTHING — no DB write, no census stamp, no mint-run artifact enrichment", () => withTmpDir(async (dir) => {
  const applyReadyPath = join(dir, "batch.apply-ready.json");
  const censusRowsPath = join(dir, "census-rows.json");
  const mintRunPath = join(dir, "mint-run-900.json");
  writeJson(applyReadyPath, [PAYLOAD]);
  writeJson(censusRowsPath, [{ row_id: "cw-1" }]);
  const artifact = baseArtifact({ run_id: "mint-run-900" });
  writeJson(mintRunPath, artifact);
  const before = readFileSync(mintRunPath, "utf8");

  const db = fakeAppliedDb();
  const result = await run(
    { "apply-ready": applyReadyPath, "census-rows": censusRowsPath, "mint-run": mintRunPath, apply: false, dry: true },
    { readAll: async (table) => (table === "sources" ? [{ id: "src-1", url: "https://eur-lex.europa.eu", status: "active", category: "regulatory", base_tier: 1 }] : []), guardedInsert: db.guardedInsert, guardedInsertMany: db.guardedInsertMany, guardedUpdate: db.guardedUpdate, registerSource: db.registerSource, rpc: async () => { throw new Error("rpc must not run in dry mode"); } },
  );
  assert.equal(result.applied, false);
  assert.equal(db.calls.length, 0);
  assert.equal(readFileSync(mintRunPath, "utf8"), before, "the mint-run artifact file must be byte-unchanged after a dry run");
}));

test("run(): APPLY mode enriches the mint-run artifact in place and keeps it validateRunArtifact-clean", () => withTmpDir(async (dir) => {
  const applyReadyPath = join(dir, "batch.apply-ready.json");
  const censusRowsPath = join(dir, "census-rows.json");
  const mintRunPath = join(dir, "mint-run-901.json");
  writeJson(applyReadyPath, [PAYLOAD]);
  writeJson(censusRowsPath, [{ row_id: "cw-1" }]);
  writeJson(mintRunPath, baseArtifact({ run_id: "mint-run-901" }));

  const db = fakeAppliedDb();
  const result = await run(
    { "apply-ready": applyReadyPath, "census-rows": censusRowsPath, "mint-run": mintRunPath, apply: true },
    { readAll: async (table) => (table === "sources" ? [{ id: "src-1", url: "https://eur-lex.europa.eu", status: "active", category: "regulatory", base_tier: 1 }] : []), guardedInsert: db.guardedInsert, guardedInsertMany: db.guardedInsertMany, guardedUpdate: db.guardedUpdate, guardedDelete: db.guardedDelete, registerSource: db.registerSource, readItemProvenance: db.readItemProvenance, rpc: async () => ({ valid: true, recommended_status: "verified" }) },
  );
  assert.equal(result.applied, true);
  assert.equal(result.minted, 1);
  const onDisk = JSON.parse(readFileSync(mintRunPath, "utf8"));
  assert.deepEqual(validateRunArtifact(onDisk), []);
  assert.equal(onDisk.per_item.find((p) => p.id === "cw-1").outcome, "minted_verified");
  assert.equal(onDisk.metrics.minted, 1);
  assert.equal(onDisk.metrics.minted_verified, 1);
  assert.equal(onDisk.metrics.apply_failed, 0);
  assert.equal(onDisk.metrics.census_rows_reconciled, 1);
}));

test("run(): APPLY mode with minted>0 flushes PUBLIC_ITEMS_TAG alongside APP_DATA_TAG and the four surface-detail tags (PERF-10, 2026-09-04, ADR-026 Follow-up / migration 306) — a mint changes rows the org-independent public RPC cache serves, and that cache is keyed without orgId so nothing APP_DATA_TAG-tagged invalidates it", () => withTmpDir(async (dir) => {
  const applyReadyPath = join(dir, "batch.apply-ready.json");
  const censusRowsPath = join(dir, "census-rows.json");
  const mintRunPath = join(dir, "mint-run-950.json");
  writeJson(applyReadyPath, [PAYLOAD]);
  writeJson(censusRowsPath, [{ row_id: "cw-1" }]);
  writeJson(mintRunPath, baseArtifact({ run_id: "mint-run-950" }));

  const db = fakeAppliedDb();
  let capturedTags = null;
  const result = await run(
    { "apply-ready": applyReadyPath, "census-rows": censusRowsPath, "mint-run": mintRunPath, apply: true },
    {
      readAll: async (table) => (table === "sources" ? [{ id: "src-1", url: "https://eur-lex.europa.eu", status: "active", category: "regulatory", base_tier: 1 }] : []),
      guardedInsert: db.guardedInsert,
      guardedInsertMany: db.guardedInsertMany,
      guardedUpdate: db.guardedUpdate,
      guardedDelete: db.guardedDelete,
      registerSource: db.registerSource,
      readItemProvenance: db.readItemProvenance,
      rpc: async () => ({ valid: true, recommended_status: "verified" }),
      revalidateTags: async (tags, opts) => {
        capturedTags = tags;
        return { applied: true, tags, status: 200 };
      },
    },
  );
  assert.equal(result.applied, true);
  assert.equal(result.minted, 1);
  assert.ok(capturedTags, "revalidateTags must be called when minted > 0");
  assert.ok(capturedTags.includes("public-items"), `expected PUBLIC_ITEMS_TAG ("public-items") in flushed tags, got: ${capturedTags.join(", ")}`);
  assert.ok(capturedTags.includes("app-data"), "APP_DATA_TAG must still be flushed alongside PUBLIC_ITEMS_TAG");
  for (const surface of ["regulations", "market", "operations", "research"]) {
    assert.ok(capturedTags.includes(`${surface}-detail`), `expected ${surface}-detail in flushed tags`);
  }
}));

test("run(): APPLY mode holds every validation_failed census row named in the sibling mint-batch-report (default path), never touching a row that DID mint", () => withTmpDir(async (dir) => {
  const applyReadyPath = join(dir, "census-rows.apply-ready.json");
  const reportPath = join(dir, "census-rows.mint-batch-report.json"); // defaultReportPathFor's own naming
  const censusRowsPath = join(dir, "census-rows.json");
  const mintRunPath = join(dir, "mint-run-903.json");
  writeJson(applyReadyPath, [PAYLOAD]); // only cw-1 minted
  writeJson(censusRowsPath, [{ row_id: "cw-1" }, { row_id: "cw-2" }]);
  writeJson(reportPath, {
    generated_at: "2026-09-03T00:00:00Z",
    attempted: 2,
    results: [
      { id: "cw-1", valid: true, recommended_status: "verified", failures: [] },
      { id: "cw-2", valid: false, recommended_status: "quarantined", failures: [{ criterion: 2, reason: "ungrounded_url", url: "http://eur-lex»" }] },
    ],
  });
  writeJson(mintRunPath, baseArtifact({ run_id: "mint-run-903" }));

  const db = fakeAppliedDb();
  const result = await run(
    { "apply-ready": applyReadyPath, "census-rows": censusRowsPath, "mint-run": mintRunPath, apply: true },
    { readAll: async (table) => (table === "sources" ? [{ id: "src-1", url: "https://eur-lex.europa.eu", status: "active", category: "regulatory", base_tier: 1 }] : []), guardedInsert: db.guardedInsert, guardedInsertMany: db.guardedInsertMany, guardedUpdate: db.guardedUpdate, guardedDelete: db.guardedDelete, registerSource: db.registerSource, readItemProvenance: db.readItemProvenance, rpc: async () => ({ valid: true, recommended_status: "verified" }) },
  );
  assert.equal(result.validationFailedHeld, 1);
  assert.deepEqual(result.holdFailures, []);

  const holdCalls = db.calls.filter((c) => c.fn === "guardedUpdate" && c.table === "census_worklist" && c.patch.dryrun_disposition === "hold");
  assert.equal(holdCalls.length, 1, JSON.stringify(db.calls));
  assert.equal(holdCalls[0].patch.hold_reason, `${VALIDATION_FAILED_HOLD_REASON_PREFIX}2:ungrounded_url`);
  assert.deepEqual(JSON.parse(holdCalls[0].patch.notes), [{ criterion: 2, reason: "ungrounded_url", url: "http://eur-lex»" }]);
  // the minted row's own census stamp (enumeration_status='reconciled') is a SEPARATE guardedUpdate call —
  // never carries dryrun_disposition, and the held row's own guardedUpdate never carries enumeration_status.
  const reconcileCalls = db.calls.filter((c) => c.fn === "guardedUpdate" && c.table === "census_worklist" && c.patch.enumeration_status === "reconciled");
  assert.equal(reconcileCalls.length, 1);
  assert.equal(reconcileCalls[0].patch.dryrun_disposition, undefined);
  assert.equal(holdCalls[0].patch.enumeration_status, undefined);

  const onDisk = JSON.parse(readFileSync(mintRunPath, "utf8"));
  assert.equal(onDisk.metrics.validation_failed_held, 1);
  assert.match(onDisk.proposer_notes, /1 validation_failed census_worklist row\(s\) held/);
}));

test("run(): APPLY mode — no mint-batch-report at the default path holds nothing and does not fail the run", () => withTmpDir(async (dir) => {
  const applyReadyPath = join(dir, "batch.apply-ready.json"); // no sibling batch.mint-batch-report.json written
  const censusRowsPath = join(dir, "census-rows.json");
  const mintRunPath = join(dir, "mint-run-904.json");
  writeJson(applyReadyPath, [PAYLOAD]);
  writeJson(censusRowsPath, [{ row_id: "cw-1" }]);
  writeJson(mintRunPath, baseArtifact({ run_id: "mint-run-904" }));

  const db = fakeAppliedDb();
  const result = await run(
    { "apply-ready": applyReadyPath, "census-rows": censusRowsPath, "mint-run": mintRunPath, apply: true },
    { readAll: async (table) => (table === "sources" ? [{ id: "src-1", url: "https://eur-lex.europa.eu", status: "active", category: "regulatory", base_tier: 1 }] : []), guardedInsert: db.guardedInsert, guardedInsertMany: db.guardedInsertMany, guardedUpdate: db.guardedUpdate, guardedDelete: db.guardedDelete, registerSource: db.registerSource, readItemProvenance: db.readItemProvenance, rpc: async () => ({ valid: true, recommended_status: "verified" }) },
  );
  assert.equal(result.validationFailedHeld, 0);
  assert.equal(result.minted, 1, "the absence of a report must never block the real payloads from minting");
}));

test("run(): APPLY mode — a validation_failed hold write failure is recorded as a defect, never silently dropped", () => withTmpDir(async (dir) => {
  const applyReadyPath = join(dir, "census-rows.apply-ready.json");
  const reportPath = join(dir, "census-rows.mint-batch-report.json");
  const censusRowsPath = join(dir, "census-rows.json");
  const mintRunPath = join(dir, "mint-run-905.json");
  writeJson(applyReadyPath, []); // nothing to mint this run — only the hold path is under test
  writeJson(censusRowsPath, [{ row_id: "cw-9" }]);
  writeJson(reportPath, { results: [{ id: "cw-9", valid: false, failures: [{ criterion: 2, reason: "ungrounded_url" }] }] });
  writeJson(mintRunPath, baseArtifact({ run_id: "mint-run-905" }));

  const db = fakeAppliedDb();
  db.guardedUpdate = async (table) => { throw new Error(`${table} update refused (RLS)`); };
  const result = await run(
    { "apply-ready": applyReadyPath, "census-rows": censusRowsPath, "mint-run": mintRunPath, apply: true },
    { readAll: async () => [], guardedInsert: db.guardedInsert, guardedInsertMany: db.guardedInsertMany, guardedUpdate: db.guardedUpdate, guardedDelete: db.guardedDelete, registerSource: db.registerSource, readItemProvenance: db.readItemProvenance, rpc: async () => { throw new Error("no payloads, rpc must not run"); } },
  );
  assert.equal(result.validationFailedHeld, 0);
  assert.equal(result.holdFailures.length, 1);
  assert.equal(result.holdFailures[0].rowId, "cw-9");
  const onDisk = JSON.parse(readFileSync(mintRunPath, "utf8"));
  assert.ok(onDisk.defects_found.some((d) => /hold-back failure/.test(d.description) || /could not be held/.test(d.description)), JSON.stringify(onDisk.defects_found));
}));

test("run(): APPLY mode — a payload that fails part-way is recorded apply_failed with its cleanup, the batch continues, and the artifact carries the defect", () => withTmpDir(async (dir) => {
  const applyReadyPath = join(dir, "batch.apply-ready.json");
  const censusRowsPath = join(dir, "batch.json");
  const mintRunPath = join(dir, "mint-run-902.json");
  const p2 = { ...JSON.parse(JSON.stringify(PAYLOAD)), id: "cw-2" };
  p2.item = { ...p2.item, source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32011L0038", canonical_instrument_key: "32011L0038" };
  writeJson(applyReadyPath, [PAYLOAD, p2]);
  writeJson(censusRowsPath, [{ row_id: "cw-1" }, { row_id: "cw-2" }]);
  writeJson(mintRunPath, baseArtifact({ run_id: "mint-run-902" }));
  const db = fakeAppliedDb();
  const realMany = db.guardedInsertMany;
  let searchCalls = 0;
  db.guardedInsertMany = async (table, rows, opts) => {
    if (table === "agent_run_searches" && ++searchCalls === 1) throw new Error("guardedInsertMany failed (chunk 0): unsupported Unicode escape sequence");
    return realMany(table, rows, opts);
  };
  const result = await run(
    { "apply-ready": applyReadyPath, "census-rows": censusRowsPath, "mint-run": mintRunPath, apply: true },
    { readAll: async (table) => (table === "sources" ? [{ id: "src-1", url: "https://eur-lex.europa.eu", status: "active", category: "regulatory", base_tier: 1 }] : []), guardedInsert: db.guardedInsert, guardedInsertMany: db.guardedInsertMany, guardedUpdate: db.guardedUpdate, guardedDelete: db.guardedDelete, registerSource: db.registerSource, readItemProvenance: db.readItemProvenance, rpc: async () => ({ valid: true, recommended_status: "verified" }) },
  );
  assert.equal(result.minted, 1);
  const onDisk = JSON.parse(readFileSync(mintRunPath, "utf8"));
  assert.deepEqual(validateRunArtifact(onDisk), []);
  assert.equal(onDisk.per_item.find((p) => p.id === "cw-1").outcome, "apply_failed");
  assert.equal(onDisk.per_item.find((p) => p.id === "cw-2").outcome, "minted_verified");
  assert.equal(onDisk.metrics.apply_failed, 1);
  assert.ok(onDisk.defects_found.some((d) => /apply_failed/.test(d.description) && /partial_item_deleted/.test(d.description)));
}));

test("run(): --apply is a no-op flag without --dry cleared — `dry: true` always wins over `apply: true`", () => withTmpDir(async (dir) => {
  const applyReadyPath = join(dir, "batch.apply-ready.json");
  const censusRowsPath = join(dir, "census-rows.json");
  const mintRunPath = join(dir, "mint-run-902.json");
  writeJson(applyReadyPath, [PAYLOAD]);
  writeJson(censusRowsPath, [{ row_id: "cw-1" }]);
  writeJson(mintRunPath, baseArtifact({ run_id: "mint-run-902" }));

  const db = fakeAppliedDb();
  const result = await run(
    { "apply-ready": applyReadyPath, "census-rows": censusRowsPath, "mint-run": mintRunPath, apply: true, dry: true },
    { readAll: async () => [], guardedInsert: db.guardedInsert, guardedInsertMany: db.guardedInsertMany, guardedUpdate: db.guardedUpdate, registerSource: db.registerSource, rpc: async () => { throw new Error("rpc must not run"); } },
  );
  assert.equal(result.applied, false);
  assert.equal(db.calls.length, 0);
}));
