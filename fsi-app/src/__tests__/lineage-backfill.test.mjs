// Unit proof for the WO-28 phase D backfill's pure decision core (src/lib/entities/lineage-backfill.mjs).
// Node builtins only -> runs in the depless discipline CI.
//
// Run standalone:
//   node --test fsi-app/src/__tests__/lineage-backfill.test.mjs
// Covered by the `fsi-app/src/__tests__/*.test.mjs` glob in run-test-suite.sh.
//
// WHAT THIS LOCKS. The backfill and the live linkStep runtime both write item_cross_references with
// origin='entity_extraction' — the ONE origin this module is allowed to touch. Every other origin
// (manual / agent_semantic / provenance_discovery) must survive a backfill run UNTOUCHED even when
// planLinkWrites would happily propose an edge for that exact pair. The four cases below are the whole
// contract: absent -> insert, ours-but-stale -> upgrade, ours-and-current -> no-op, foreign -> skip+count.

import { test } from "node:test";
import assert from "node:assert/strict";
import { partitionLineageWrites, pairKey, LINEAGE_BACKFILL_ORIGIN, planLineageGapTargets, parseLineageGapFlag, LINEAGE_GAP_CREATED_BY } from "../lib/entities/lineage-backfill.mjs";
import { planLinkWrites } from "../lib/entities/entity-resolve.mjs";

// Build a planLinkWrites()-shaped write list from a small set of edge intents, mirroring the real function's
// row shape (entity-resolve.mjs's planLinkWrites) closely enough to drive the partitioner under test.
function edgeWrite(source_item_id, target_item_id, relationship, basis = null) {
  return { table: "item_cross_references", row: { source_item_id, target_item_id, relationship, origin: "entity_extraction", ...(basis ? { basis } : {}) } };
}
function flagWrite(subject_ref) {
  return { table: "integrity_flags", row: { subject_ref, created_by: "intake-entity-link", status: "open" } };
}

test("LINEAGE_BACKFILL_ORIGIN is entity_extraction (the origin this module and the live linkStep both write)", () => {
  assert.equal(LINEAGE_BACKFILL_ORIGIN, "entity_extraction");
});

test("absent pair -> INSERT (nothing in the live edge set for this source/target)", () => {
  const writes = [edgeWrite("child", "parent", "implements", [{ signal: "lineage", detail: "implements parent", weight: 0 }])];
  const { inserts, upgrades, skippedForeign, unchanged } = partitionLineageWrites(writes, new Map());
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].relationship, "implements");
  assert.deepEqual(upgrades, []);
  assert.deepEqual(skippedForeign, []);
  assert.deepEqual(unchanged, []);
});

test("OURS (entity_extraction) but stale relationship -> UPGRADE, relationship+basis both replaced", () => {
  const existing = new Map([[pairKey("child", "parent"), { id: "edge-1", origin: "entity_extraction", relationship: "related", basis: null }]]);
  const writes = [edgeWrite("child", "parent", "amends", [{ signal: "lineage", detail: "amends parent", weight: 0 }])];
  const { inserts, upgrades, skippedForeign, unchanged } = partitionLineageWrites(writes, existing);
  assert.deepEqual(inserts, []);
  assert.equal(upgrades.length, 1);
  assert.deepEqual(upgrades[0], { id: "edge-1", source_item_id: "child", target_item_id: "parent", relationship: "amends", basis: [{ signal: "lineage", detail: "amends parent", weight: 0 }] });
  assert.deepEqual(skippedForeign, []);
  assert.deepEqual(unchanged, []);
});

test("OURS (entity_extraction) and ALREADY the target relationship+basis -> UNCHANGED, no write (idempotent re-run)", () => {
  const basis = [{ signal: "lineage", detail: "implements parent", weight: 0 }];
  const existing = new Map([[pairKey("child", "parent"), { id: "edge-2", origin: "entity_extraction", relationship: "implements", basis }]]);
  const writes = [edgeWrite("child", "parent", "implements", basis)];
  const { inserts, upgrades, skippedForeign, unchanged } = partitionLineageWrites(writes, existing);
  assert.deepEqual(inserts, []);
  assert.deepEqual(upgrades, [], "a second run over unchanged content must write NOTHING");
  assert.deepEqual(skippedForeign, []);
  assert.equal(unchanged.length, 1);
  assert.equal(unchanged[0].id, "edge-2");
});

test("undefined basis on the incoming row === stored null basis (relationship 'related' carries no basis key at all)", () => {
  const existing = new Map([[pairKey("child", "parent"), { id: "edge-3", origin: "entity_extraction", relationship: "related", basis: null }]]);
  const writes = [edgeWrite("child", "parent", "related", null)]; // basis=null -> edgeWrite omits the key, same as real planLinkWrites
  const { upgrades, unchanged } = partitionLineageWrites(writes, existing);
  assert.deepEqual(upgrades, [], "null-vs-undefined basis must not be treated as a change");
  assert.equal(unchanged.length, 1);
});

test("FOREIGN origin (manual/agent_semantic/provenance_discovery) -> SKIPPED, NEVER clobbered, even though planLinkWrites proposes a typed edge for the same pair", () => {
  for (const foreignOrigin of ["manual", "agent_semantic", "provenance_discovery"]) {
    const existing = new Map([[pairKey("child", "parent"), { id: "edge-x", origin: foreignOrigin, relationship: "related", basis: null }]]);
    const writes = [edgeWrite("child", "parent", "implements", [{ signal: "lineage", detail: "implements parent", weight: 0 }])];
    const { inserts, upgrades, skippedForeign, unchanged } = partitionLineageWrites(writes, existing);
    assert.deepEqual(inserts, [], `${foreignOrigin}: must not insert`);
    assert.deepEqual(upgrades, [], `${foreignOrigin}: must not upgrade — this is the clobber this module exists to prevent`);
    assert.deepEqual(unchanged, [], `${foreignOrigin}: not "unchanged" either — it was never ours to judge`);
    assert.equal(skippedForeign.length, 1);
    assert.equal(skippedForeign[0].foreignOrigin, foreignOrigin);
  }
});

test("integrity_flags rows in the write plan are ignored by the edge partitioner (flags have their own dedup rule)", () => {
  const writes = [edgeWrite("child", "parent", "implements"), flagWrite("child")];
  const { inserts } = partitionLineageWrites(writes, new Map());
  assert.equal(inserts.length, 1, "only the edge write is partitioned; the flag write passes through untouched");
});

test("mixed batch: insert + upgrade + skip-foreign + unchanged all resolved independently in one call", () => {
  const existing = new Map([
    [pairKey("a", "p1"), { id: "e1", origin: "entity_extraction", relationship: "related", basis: null }], // -> upgrade
    [pairKey("a", "p2"), { id: "e2", origin: "manual", relationship: "supersedes", basis: null }],          // -> skip
    [pairKey("b", "p3"), { id: "e3", origin: "entity_extraction", relationship: "depends_on", basis: [{ signal: "lineage", detail: "d", weight: 0 }] }], // -> unchanged
  ]);
  const writes = [
    edgeWrite("a", "p1", "implements", [{ signal: "lineage", detail: "implements p1", weight: 0 }]),
    edgeWrite("a", "p2", "amends", [{ signal: "lineage", detail: "amends p2", weight: 0 }]),
    edgeWrite("b", "p3", "depends_on", [{ signal: "lineage", detail: "d", weight: 0 }]),
    edgeWrite("c", "p4", "implements", [{ signal: "lineage", detail: "implements p4", weight: 0 }]),
  ];
  const { inserts, upgrades, skippedForeign, unchanged } = partitionLineageWrites(writes, existing);
  assert.equal(inserts.length, 1); assert.equal(pairKey(inserts[0].source_item_id, inserts[0].target_item_id), "c|p4");
  assert.equal(upgrades.length, 1); assert.equal(upgrades[0].id, "e1");
  assert.equal(skippedForeign.length, 1); assert.equal(skippedForeign[0].foreignOrigin, "manual");
  assert.equal(unchanged.length, 1); assert.equal(unchanged[0].id, "e3");
});

test("DETERMINISTIC ORDERING: output is sorted by source|target pair regardless of Map iteration order or input order", () => {
  const existing = new Map([
    [pairKey("z", "p"), { id: "e-z", origin: "entity_extraction", relationship: "related", basis: null }],
    [pairKey("a", "p"), { id: "e-a", origin: "entity_extraction", relationship: "related", basis: null }],
  ]);
  const writes = [
    edgeWrite("z", "p", "amends", [{ signal: "lineage", detail: "z", weight: 0 }]),
    edgeWrite("a", "p", "implements", [{ signal: "lineage", detail: "a", weight: 0 }]),
    edgeWrite("m", "p", "amends", [{ signal: "lineage", detail: "m", weight: 0 }]), // insert, absent
  ];
  const { inserts, upgrades } = partitionLineageWrites(writes, existing);
  assert.deepEqual(upgrades.map((u) => u.source_item_id), ["a", "z"], "upgrades sorted a-before-z");
  assert.deepEqual(inserts.map((i) => i.source_item_id), ["m"]);
});

test("pairKey is the same join used to key the existing-edge Map (a|b, literal, order-sensitive)", () => {
  assert.equal(pairKey("A", "B"), "A|B");
  assert.notEqual(pairKey("A", "B"), pairKey("B", "A"), "directionality matters — child->parent must not collide with parent->child");
});

// ── absent-parent gap flags -> discovery targets (lane s2a-typed-edges) ─────────────────────────────────
// The flag rows come from the REAL planLinkWrites so the parser can never drift from the writer's format.
const CHILD_TEXT = "Commission Implementing Regulation (EU) 2026/394 laying down rules for the application of Regulation (EU) 2023/1805. " + "Background recitals follow. ".repeat(20) + "Separately, this act is amending Regulation (EU) 2015/757.";
function gapFlagFor(itemId, corpus) {
  const w = planLinkWrites(CHILD_TEXT, corpus, itemId).find((x) => x.table === "integrity_flags" && x.row.created_by === LINEAGE_GAP_CREATED_BY);
  return w ? { id: `flag-${itemId}`, subject_ref: itemId, status: "open", ...w.row } : null;
}
const CHILD = { id: "child", title: "Implementing Regulation 2026/394", instrument_identifier: "2026/394" };

test("gap planner: a parent that is NOT held becomes a discovery target (identifier, citing item, relationship)", () => {
  const flag = gapFlagFor("child", [CHILD]);
  assert.ok(flag, "planLinkWrites raised the absent-parent flag");
  const { targets, resolvable, residue } = planLineageGapTargets([flag], [CHILD]);
  assert.deepEqual(resolvable, []);
  assert.deepEqual(residue, []);
  assert.ok(targets.length >= 1);
  const t = targets.find((x) => x.identifier === "2023/1805");
  assert.deepEqual(t, { identifier: "2023/1805", relationship: "implements", citing_item_id: "child", flag_id: "flag-child" });
});

test("gap planner: a flag whose every parent is now held is RESOLVABLE, naming the held parent ids; nothing is a target", () => {
  const flag = gapFlagFor("child", [CHILD]);
  const parents = [
    { id: "p1", title: "FuelEU Maritime", instrument_identifier: "2023/1805" },
    { id: "p2", title: "EU MRV", instrument_identifier: "2015/757" },
  ];
  const { targets, resolvable } = planLineageGapTargets([flag], [CHILD, ...parents]);
  assert.deepEqual(targets, []);
  assert.equal(resolvable.length, 1);
  assert.equal(resolvable[0].flag_id, "flag-child");
  assert.deepEqual(resolvable[0].parents.map((p) => p.parent_item_ids).flat().sort(), ["p1", "p2"]);
});

test("gap planner: partially held flag stays open, only the still-absent parent is a target", () => {
  const flag = gapFlagFor("child", [CHILD]);
  const { targets, resolvable } = planLineageGapTargets([flag], [CHILD, { id: "p1", title: "FuelEU Maritime", instrument_identifier: "2023/1805" }]);
  assert.deepEqual(resolvable, []);
  assert.ok(targets.length >= 1 && targets.every((t) => t.identifier !== "2023/1805"));
});

test("gap planner: the citing item itself never counts as its own parent", () => {
  const flag = { id: "f", subject_ref: "child", created_by: LINEAGE_GAP_CREATED_BY, recommended_actions: [{ action: "acquire_parent_instrument", rationale: "item implements 2026/394, which does not resolve to any item in the corpus" }] };
  const { targets, resolvable } = planLineageGapTargets([flag], [CHILD]);
  assert.equal(resolvable.length, 0);
  assert.equal(targets.length, 1);
});

test("gap planner: an unparseable or subject-less flag is residue with a reason, never dropped, never a throw", () => {
  const { residue, targets } = planLineageGapTargets([
    { id: "a", subject_ref: "x", created_by: LINEAGE_GAP_CREATED_BY, description: "nothing useful", recommended_actions: [] },
    { id: "b", subject_ref: null, created_by: LINEAGE_GAP_CREATED_BY, description: "x: 2023/1805 (implements)" },
  ], []);
  assert.deepEqual(targets, []);
  assert.deepEqual(residue.map((r) => r.flag_id), ["a", "b"]);
  assert.ok(residue.every((r) => r.reason));
});

test("gap planner: description fallback parses when recommended_actions is absent; other namespaces are ignored", () => {
  assert.deepEqual(parseLineageGapFlag({ description: "Enabling/parent instrument(s) named but absent from the corpus: 2003/96 (depends_on), 2023/1805 (implements)" }),
    [{ identifier: "2003/96", relationship: "depends_on" }, { identifier: "2023/1805", relationship: "implements" }]);
  const { targets } = planLineageGapTargets([{ id: "z", subject_ref: "x", created_by: "intake-entity-link", description: "y: 2003/96 (depends_on)" }], []);
  assert.deepEqual(targets, []);
});

test("gap planner: output is deterministic regardless of input order", () => {
  const mk = (id) => ({ id, subject_ref: id, created_by: LINEAGE_GAP_CREATED_BY, recommended_actions: [{ rationale: "item amends 2001/1, which does not resolve to any item in the corpus" }] });
  const a = planLineageGapTargets([mk("b"), mk("a")], []);
  const b = planLineageGapTargets([mk("a"), mk("b")], []);
  assert.deepEqual(a, b);
  assert.deepEqual(a.targets.map((t) => t.citing_item_id), ["a", "b"]);
});
