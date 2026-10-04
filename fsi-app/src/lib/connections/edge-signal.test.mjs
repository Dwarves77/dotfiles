// edge-signal.test.mjs -- contract test (lane s2a-typed-edges, 2026-10-04): the strongest signal discovery
// computes for a pair is NOT discarded at write time. item_cross_references.basis (migration 252) stores one
// {signal, detail, weight} entry per grounded signal, so the strongest signal's name is recoverable from the
// stored edge as the highest-weight basis entry, and `relationship` stays 'related' (its CHECK vocabulary is
// legal lineage). This is why no new `signal` column was added: a second copy of data basis already holds.
// If a writer ever drops basis, or a basis entry loses its signal name, this fails.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runConnectionDiscovery } from "./run-discovery.mjs";
import { scoreConnection } from "./discover.mjs";
import { buildAutoAdoptEdges, classifySignalCandidates } from "./signal-confidence.mjs";

const strongest = (basis) => basis.slice().sort((a, b) => b.weight - a.weight)[0].signal;

const NEW_ITEM = { id: "new", item_type: "market_signal", source_id: "s1", operational_scenario_tags: ["emissions-reporting-Scope3"], compliance_object_tags: [], jurisdictions: [], jurisdiction_iso: [], topic_tags: [] };
const OTHER = { id: "other", item_type: "regulation", source_id: "s1", operational_scenario_tags: ["emissions-reporting-Scope3"], compliance_object_tags: [], jurisdictions: [], jurisdiction_iso: [], topic_tags: [] };

function fakeSb(corpus) {
  const writes = [];
  const chain = (rows) => {
    const b = { select() { return b; }, eq() { return b; }, neq() { return b; }, order() { return b; }, range() { return b; },
      then(res, rej) { return Promise.resolve({ data: rows, error: null }).then(res, rej); } };
    return b;
  };
  return {
    writes,
    from(t) {
      if (t === "intelligence_items") return chain(corpus);
      const b = chain([]);
      b.upsert = async (rows) => { writes.push(...rows); return { error: null }; };
      return b;
    },
  };
}

test("run-discovery: the written edge keeps relationship 'related' AND a basis whose strongest entry is the signal scoreConnection named", async () => {
  const sb = fakeSb([OTHER]);
  const n = await runConnectionDiscovery(sb, "new", NEW_ITEM);
  assert.equal(n, 1);
  const edge = sb.writes[0];
  assert.equal(edge.relationship, "related");
  assert.equal(edge.origin, "provenance_discovery");
  const scored = scoreConnection(NEW_ITEM, OTHER);
  assert.ok(Array.isArray(edge.basis) && edge.basis.length >= 2, "both shared_source and shared_scenario are stored");
  assert.ok(edge.basis.every((b) => typeof b.signal === "string" && b.signal));
  assert.equal(strongest(edge.basis), scored.relationship, "the stored basis recovers the strongest signal discovery computed");
  assert.equal(scored.relationship, "shared_source");
});

test("signal-confidence auto-adopt edges: every basis entry names its signal; relationship stays 'related'", () => {
  const classified = classifySignalCandidates([
    { itemA: "a", itemB: "b", signalKind: "shared_regulation_identifier", value: "2023/1805", subject_ref: "a|b|2023/1805" },
  ]);
  const edges = buildAutoAdoptEdges(classified);
  assert.equal(edges.length, 2, "both directions at rest (ADR-018)");
  for (const e of edges) {
    assert.equal(e.relationship, "related");
    assert.equal(strongest(e.basis), "shared_regulation_identifier");
  }
});
