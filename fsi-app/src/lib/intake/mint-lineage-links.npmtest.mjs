// @ts-check
// MINT-TIME TYPED LINEAGE LINKS (lane s2a-typed-edges, 2026-10-04): mint-item.ts runs linkItems (the same
// function the generate path used) as one more post-insert hop over the text the new item already carries.
// Proves, end to end through the real chokepoint on an injected fake client: an amending/implementing
// item gets its typed edge at birth; a pair owned by a manual origin is untouched; an item whose text
// names no entity issues no item_cross_references query at all; a failing hop is recorded as a flywheel
// defect and never fails the mint; a dry mint writes nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { mintIntelligenceItem } = await jiti.import("./mint-item.ts");

const PARENT = { id: "parent-1", title: "EU Regulation 2023/1805 - FuelEU Maritime", instrument_identifier: "2023/1805", source_url: "https://example.org/fueleu" };

/** Table-aware fake covering exactly what a successful mint issues. */
function fakeClient({ existingEdges = [], edgeReadError = null } = {}) {
  const edgeWrites = [];
  const flagInserts = [];
  const insertedItems = [];
  const empty = () => {
    const b = {
      select() { return b; }, eq() { return b; }, neq() { return b; }, in() { return b; }, order() { return b; }, range() { return b; }, limit() { return b; },
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
      then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); },
    };
    return b;
  };
  return {
    edgeWrites: () => edgeWrites,
    flagInserts: () => flagInserts,
    insertedItems: () => insertedItems,
    from(table) {
      if (table === "intelligence_items") {
        const b = {
          select() { return b; }, eq() { return b; }, neq() { return b; }, order() { return b; }, range() { return b; },
          maybeSingle: async () => ({ data: null, error: null }),
          single: async () => ({ data: { compliance_deadline: null }, error: null }),
          update() { return { eq: async () => ({ error: null }) }; },
          insert(row) { insertedItems.push(row); return { select() { return this; }, single: async () => ({ data: { id: "new-1" }, error: null }) }; },
          then(res, rej) { return Promise.resolve({ data: [PARENT], error: null }).then(res, rej); },
        };
        return b;
      }
      if (table === "item_cross_references") {
        const b = {
          select() { return b; }, eq() { return b; }, order() { return b; }, range() { return b; },
          then(res, rej) { return Promise.resolve({ data: edgeReadError ? null : existingEdges, error: edgeReadError }).then(res, rej); },
          async upsert(rows) { edgeWrites.push({ op: "upsert", rows: [].concat(rows) }); return { error: null }; },
          update(patch) { return { eq: async () => { edgeWrites.push({ op: "update", patch }); return { error: null }; } }; },
        };
        return b;
      }
      if (table === "integrity_flags") {
        const b = {
          select() { return b; }, eq() { return b; },
          maybeSingle: async () => ({ data: null, error: null }),
          insert(row) { flagInserts.push(row); return { then(res, rej) { return Promise.resolve({ error: null }).then(res, rej); } }; },
        };
        return b;
      }
      return empty();
    },
  };
}

function plan(title, extra = {}) {
  return {
    origin: "staged_materialization",
    seed: {
      title, instrument_identifier: "2026/394", item_type: "regulation", domain: 1,
      source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026R0394", source_id: "src-1",
      ...extra,
    },
  };
}

const IMPLEMENTING = "Commission Implementing Regulation (EU) 2026/394 laying down rules for the application of Regulation (EU) 2023/1805 as regards reporting";
const AMENDING = "Commission Regulation (EU) 2026/394 amending Regulation (EU) 2023/1805 as regards reporting";

test("mint: an implementing act gets its TYPED implements edge to the held parent at birth", async () => {
  const sb = fakeClient();
  const r = await mintIntelligenceItem(sb, plan(IMPLEMENTING));
  assert.equal(r.ok, true);
  const up = sb.edgeWrites().find((w) => w.op === "upsert");
  assert.ok(up, "an edge was written");
  assert.equal(up.rows[0].relationship, "implements");
  assert.equal(up.rows[0].origin, "entity_extraction");
  assert.equal(up.rows[0].source_item_id, "new-1");
  assert.equal(up.rows[0].target_item_id, "parent-1");
  assert.ok(r.flags.includes("lineage:1(typed:1)"), `flags: ${r.flags.join(",")}`);
});

test("mint: an amending act gets an amends edge (text from the record-grade full_brief is read too)", async () => {
  const sb = fakeClient();
  const r = await mintIntelligenceItem(sb, plan("Regulation 2026/394", { full_brief: AMENDING, item_grade: "record" }));
  assert.equal(r.ok, true);
  assert.equal(sb.edgeWrites().find((w) => w.op === "upsert").rows[0].relationship, "amends");
});

test("mint: a pair already owned by a manual origin is untouched", async () => {
  const sb = fakeClient({ existingEdges: [{ id: "m1", source_item_id: "new-1", target_item_id: "parent-1", origin: "manual", relationship: "related", basis: null }] });
  const r = await mintIntelligenceItem(sb, plan(AMENDING));
  assert.equal(r.ok, true);
  assert.deepEqual(sb.edgeWrites(), []);
  assert.ok(!r.flags.some((f) => f.startsWith("lineage")));
});

test("mint: text that names no entity issues no item_cross_references query at all", async () => {
  const sb = fakeClient({ edgeReadError: { message: "must not be read" } });
  const r = await mintIntelligenceItem(sb, plan("A general overview of freight decarbonisation trends"));
  assert.equal(r.ok, true);
  assert.deepEqual(sb.edgeWrites(), []);
  assert.ok(!r.flags.includes("lineage-failed"), "no read was attempted, so nothing failed");
});

test("mint: a failing lineage hop is a RECORDED flywheel defect and the mint still succeeds", async () => {
  const sb = fakeClient({ edgeReadError: { message: "boom" } });
  const r = await mintIntelligenceItem(sb, plan(IMPLEMENTING));
  assert.equal(r.ok, true);
  assert.equal(r.itemId, "new-1");
  assert.ok(r.flags.includes("lineage-failed"));
  const defect = sb.flagInserts().find((f) => String(f.description).includes("lineage-links: "));
  assert.ok(defect, "defect recorded through recordFlywheelDefect");
  assert.equal(defect.status, "open");
});

test("mint: a DRY mint writes nothing (no item insert, no edge, no flag)", async () => {
  const sb = fakeClient();
  const r = await mintIntelligenceItem(sb, plan(IMPLEMENTING), { dryRun: true });
  assert.equal(r.ok, true);
  assert.equal(r.dryRun, true);
  assert.deepEqual(sb.insertedItems(), []);
  assert.deepEqual(sb.edgeWrites(), []);
  assert.deepEqual(sb.flagInserts(), []);
});
