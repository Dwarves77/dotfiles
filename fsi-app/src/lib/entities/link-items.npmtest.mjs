// @ts-check
// linkItems (src/lib/entities/link-items.ts) -- typed edges on the free path and at mint (lane
// s2a-typed-edges, 2026-10-04). Proves, against an in-memory fake, that the executor follows
// partitionLineageWrites (insert / upgrade own / skip foreign / unchanged), that a manual-origin pair is
// untouched, that dry mode writes nothing anywhere, and that a content override and a caller-supplied
// corpus are honoured. jiti imports the TS module (npm-dependent, hence *.npmtest.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { linkItems } = await jiti.import("./link-items.ts");

/** Minimal in-memory client: only the chain shapes linkItems issues. Records every write. */
function fakeSb(seed) {
  const tables = {
    intelligence_items: [], agent_run_searches: [], item_cross_references: [], integrity_flags: [], item_corrections: [],
    ...Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))])),
  };
  const writes = [];
  let nextId = 1;
  function from(name) {
    const filters = [];
    let range = null;
    const rows = () => tables[name].filter((r) => filters.every(([c, v]) => r[c] === v));
    const b = {
      select() { return b; },
      eq(c, v) { filters.push([c, v]); return b; },
      order() { return b; },
      range(a, z) { range = [a, z]; return b; },
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then(res, rej) {
        let out = rows();
        if (range) out = out.slice(range[0], range[1] + 1);
        return Promise.resolve({ data: out, error: null }).then(res, rej);
      },
      async upsert(input, opts) {
        const list = Array.isArray(input) ? input : [input];
        writes.push({ op: "upsert", table: name, rows: list });
        for (const r of list) {
          const dup = tables[name].find((x) => x.source_item_id === r.source_item_id && x.target_item_id === r.target_item_id);
          if (!dup) tables[name].push({ id: `e${nextId++}`, ...r });
          else if (!opts?.ignoreDuplicates) Object.assign(dup, r);
        }
        return { error: null };
      },
      async insert(row) {
        writes.push({ op: "insert", table: name, rows: [row] });
        tables[name].push({ id: `i${nextId++}`, ...row });
        return { error: null };
      },
      update(patch) {
        return {
          eq: async (c, v) => {
            writes.push({ op: "update", table: name, patch, where: [c, v] });
            for (const r of tables[name]) if (r[c] === v) Object.assign(r, patch);
            return { error: null };
          },
        };
      },
    };
    return b;
  }
  return { from, tables, writes };
}

const PARENT = { id: "parent", title: "EU Regulation 2023/1805 - FuelEU", instrument_identifier: "2023/1805", is_archived: false };
const CHILD = { id: "child", title: "Commission Implementing Regulation (EU) 2026/394", instrument_identifier: "2026/394", is_archived: false, full_brief: "" };
const AMENDING = "This Regulation is amending Regulation (EU) 2023/1805 as regards reporting.";

function seed(extra = {}) {
  return { intelligence_items: [PARENT, CHILD], ...extra };
}

test("free path: stored text that amends a held instrument writes a TYPED amends edge (entity_extraction origin, lineage basis)", async () => {
  const sb = fakeSb(seed({ intelligence_items: [PARENT, { ...CHILD, full_brief: AMENDING }] }));
  const r = await linkItems(sb, "child");
  assert.equal(r.inserted, 1);
  assert.equal(r.typed, 1);
  const edge = sb.tables.item_cross_references.find((e) => e.target_item_id === "parent");
  assert.equal(edge.relationship, "amends");
  assert.equal(edge.origin, "entity_extraction");
  assert.equal(edge.basis[0].signal, "lineage");
});

test("a pair already owned by a MANUAL origin is untouched and counted", async () => {
  const sb = fakeSb(seed({
    intelligence_items: [PARENT, { ...CHILD, full_brief: AMENDING }],
    item_cross_references: [{ id: "x1", source_item_id: "child", target_item_id: "parent", relationship: "related", origin: "manual", basis: null }],
  }));
  const r = await linkItems(sb, "child");
  assert.equal(r.skippedForeign, 1);
  assert.equal(r.edges, 0);
  assert.deepEqual(sb.writes.filter((w) => w.table === "item_cross_references"), []);
  assert.equal(sb.tables.item_cross_references[0].relationship, "related");
});

test("ADR-022: a discovery 'related' row plus an amends mention becomes 'amends' with BOTH basis entries; origin and score kept", async () => {
  const disc = [{ signal: "shared_scenario", detail: "both touch x", weight: 0.3 }];
  const sb = fakeSb(seed({
    intelligence_items: [PARENT, { ...CHILD, full_brief: AMENDING }],
    item_cross_references: [{ id: "x1", source_item_id: "child", target_item_id: "parent", relationship: "related", origin: "provenance_discovery", basis: disc, score: 0.3 }],
  }));
  const r = await linkItems(sb, "child");
  assert.equal(r.upgraded, 1);
  assert.equal(r.typed, 1);
  const row = sb.tables.item_cross_references[0];
  assert.equal(row.relationship, "amends");
  assert.equal(row.origin, "provenance_discovery");
  assert.equal(row.score, 0.3);
  assert.deepEqual(row.basis.map((b) => b.signal), ["shared_scenario", "lineage"]);
  const upd = sb.writes.find((w) => w.op === "update");
  assert.deepEqual(Object.keys(upd.patch).sort(), ["basis", "relationship"], "the patch touches only relationship and basis");
});

test("a foreign row already typed differently is a CONFLICT: counted, not written", async () => {
  const sb = fakeSb(seed({
    intelligence_items: [PARENT, { ...CHILD, full_brief: AMENDING }],
    item_cross_references: [{ id: "x1", source_item_id: "child", target_item_id: "parent", relationship: "supersedes", origin: "agent_semantic", basis: null }],
  }));
  const r = await linkItems(sb, "child");
  assert.equal(r.conflicts, 1);
  assert.equal(r.edges, 0);
  assert.deepEqual(sb.writes.filter((w) => w.table === "item_cross_references"), []);
});

test("an own (entity_extraction) untyped 'related' edge is UPGRADED to the typed relationship; re-run is a no-op", async () => {
  const sb = fakeSb(seed({
    intelligence_items: [PARENT, { ...CHILD, full_brief: AMENDING }],
    item_cross_references: [{ id: "x1", source_item_id: "child", target_item_id: "parent", relationship: "related", origin: "entity_extraction", basis: null }],
  }));
  const first = await linkItems(sb, "child");
  assert.equal(first.upgraded, 1);
  assert.equal(sb.tables.item_cross_references[0].relationship, "amends");
  assert.equal(sb.tables.item_cross_references[0].origin, "entity_extraction", "origin never changes");
  const second = await linkItems(sb, "child");
  assert.equal(second.unchanged, 1);
  assert.equal(second.edges, 0);
});

test("DRY mode computes the same counts and writes nothing anywhere (edges, upgrades, flags)", async () => {
  const flagText = `${AMENDING} It also implements Regulation (EU) 2099/9999 which is not held.`;
  const sb = fakeSb(seed({
    intelligence_items: [PARENT, { ...CHILD, full_brief: flagText }],
    item_cross_references: [],
  }));
  const r = await linkItems(sb, "child", { dry: true });
  assert.equal(r.dry, true);
  assert.equal(r.edges, 1, "reports what WOULD be written");
  assert.equal(r.typed, 1);
  assert.ok(r.surfaced >= 1, "reports the flag it would open");
  assert.deepEqual(sb.writes, [], "dry: not one write");
  assert.equal(sb.tables.item_cross_references.length, 0);
  assert.equal(sb.tables.integrity_flags.length, 0);
});

test("content override is read INSTEAD of the stored brief, and a caller corpus skips the corpus read", async () => {
  const sb = fakeSb(seed()); // child has an empty stored brief
  const r = await linkItems(sb, "child", { content: AMENDING, corpus: [PARENT, CHILD] });
  assert.equal(r.typed, 1);
  assert.equal(sb.tables.item_cross_references[0].relationship, "amends");
});

test("text too short to read returns skipped before ANY query (mint hop on an item with nothing to read)", async () => {
  const calls = [];
  const sb = { from(t) { calls.push(t); throw new Error("no query expected"); } };
  const r = await linkItems(/** @type {any} */ (sb), "child", { content: "short" });
  assert.equal(r.skipped, true);
  assert.deepEqual(calls, []);
});

test("text with no entity mention places no edge and reads no existing edges", async () => {
  const sb = fakeSb(seed());
  const r = await linkItems(sb, "child", { content: "A general overview of freight decarbonisation trends and costs.", corpus: [PARENT, CHILD] });
  assert.equal(r.edges, 0);
  assert.deepEqual(sb.writes, []);
});

// ── lane G7-CORR: an admin-removed connection is never re-created (item_corrections tombstone, migration 356) ──
const tombRow = (item_id, target_ref, op = "remove", extra = {}) => ({
  id: `t-${item_id}-${target_ref}-${op}`, item_id, target_kind: "connection", target_ref, op,
  created_at: "2026-10-06T00:00:00Z", revoked_at: null, ...extra,
});

test("G7-CORR: a tombstone recorded against the OTHER item blocks the typed edge, which is counted and not written", async () => {
  const sb = fakeSb(seed({ intelligence_items: [PARENT, { ...CHILD, full_brief: AMENDING }], item_corrections: [tombRow("parent", "child")] }));
  const r = await linkItems(sb, "child");
  assert.equal(r.inserted, 0);
  assert.equal(r.skippedTombstoned, 1);
  assert.equal(sb.tables.item_cross_references.length, 0);
  assert.equal(sb.writes.filter((w) => w.table === "item_cross_references").length, 0);
});

test("G7-CORR: a revoked tombstone lets the edge through again", async () => {
  const sb = fakeSb(seed({
    intelligence_items: [PARENT, { ...CHILD, full_brief: AMENDING }],
    item_corrections: [tombRow("child", "parent", "remove", { revoked_at: "2026-10-07T00:00:00Z" })],
  }));
  const r = await linkItems(sb, "child");
  assert.equal(r.inserted, 1);
  assert.equal(r.skippedTombstoned, 0);
});
