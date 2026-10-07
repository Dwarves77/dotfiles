// raise-term-needs.test.mjs (lane G5-NEED, 2026-10-07): the need raiser end to end over an in-memory
// database. Dry and apply both run through injected deps; apply goes through a fake writer so a missing import
// cannot pass dry and fail live.
import test from "node:test";
import assert from "node:assert/strict";
import { main, STEP, RESOLVE_NOTE } from "./raise-term-needs.mjs";

const T1 = "11111111-0000-4000-8000-000000000001";
const T2 = "11111111-0000-4000-8000-000000000002";
const clone = (x) => JSON.parse(JSON.stringify(x));

function world(over = {}) {
  const db = {
    terms: [
      { id: T1, kind: "standard", term_key: "iso 14083", label: "ISO 14083", status: "adopted", distinct_items: 3, distinct_sources: 2 },
      { id: T2, kind: "material", term_key: "recycled aluminium", label: "recycled aluminium", status: "proposed", distinct_items: 1, distinct_sources: 1 },
    ],
    mentions: [{ term_id: T1, item_id: "i1" }, { term_id: T1, item_id: "i2" }],
    items: [
      { id: "i1", item_type: "regulation", provenance_status: "verified", is_archived: false, origin_class: "primary", source_id: "s1" },
      { id: "i2", item_type: "regulation", provenance_status: "verified", is_archived: false, origin_class: "primary", source_id: "s2" },
    ],
    sources: [{ id: "s1", base_tier: 5, tier_override: null }, { id: "s2", base_tier: 4, tier_override: null }],
    needFlags: [],
    lineageFlags: [],
    corpus: [],
    ...clone(over),
  };
  let seq = 0;
  const deps = {
    readTerms: async () => db.terms,
    readMentions: async () => db.mentions,
    readItemsByIds: async (ids) => db.items.filter((i) => ids.includes(i.id)),
    readSourcesByIds: async (ids) => db.sources.filter((s) => ids.includes(s.id)),
    readOpenNeeds: async () => db.needFlags.filter((f) => f.status === "open"),
    readLineageFlags: async () => db.lineageFlags,
    readCorpus: async () => db.corpus,
    insertMany: async (rows) => {
      for (const r of rows) db.needFlags.push({ id: `flag-${++seq}`, ...r });
      return { inserted: rows.length, snapshot: "snap-1" };
    },
    resolveIds: async (ids, note) => {
      for (const f of db.needFlags) if (ids.includes(f.id)) Object.assign(f, { status: "resolved", resolution_note: note });
      return { updated: ids.length, snapshot: "snap-2" };
    },
    todayIso: "2026-10-07",
  };
  return { db, deps };
}

test("an adopted term without an authoritative holding raises one need (dry: counted, nothing written)", async () => {
  const { db, deps } = world();
  const s = await main({ mode: "dry" }, deps);
  assert.equal(s.step, STEP);
  assert.equal(s.counts.term_needs, 1);
  assert.equal(s.counts.would_insert, 1);
  assert.equal(db.needFlags.length, 0, "dry writes nothing");
  assert.equal(s.exitCode, 0);
});

test("apply inserts the need through the writer, a second pass is a no-op", async () => {
  const { db, deps } = world();
  const a = await main({ mode: "apply" }, deps);
  assert.equal(a.applied, 1);
  assert.equal(db.needFlags.length, 1);
  assert.deepEqual([db.needFlags[0].created_by, db.needFlags[0].subject_ref, db.needFlags[0].status], ["term-need:standard", T1, "open"]);
  assert.equal(db.needFlags[0].recommended_actions[0].need, "ISO 14083 standard authoritative source");
  const b = await main({ mode: "apply" }, deps);
  assert.equal(b.applied, 0);
  assert.equal(b.counts.unchanged, 1);
  assert.equal(db.needFlags.length, 1, "one open need per term");
});

test("an adopted term WITH an authoritative holding raises none and closes an open one", async () => {
  const { db, deps } = world();
  await main({ mode: "apply" }, deps);
  assert.equal(db.needFlags.filter((f) => f.status === "open").length, 1);
  db.sources.find((s) => s.id === "s1").base_tier = 2; // the source of a mentioning item is now at the floor
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.counts.term_needs, 0);
  assert.equal(s.counts.would_resolve, 1);
  assert.equal(s.applied, 1);
  const f = db.needFlags[0];
  assert.equal(f.status, "resolved");
  assert.equal(f.resolution_note, RESOLVE_NOTE);
  assert.equal(s.read_back.open_needs, 0);
});

test("a retired term's open need closes by rule", async () => {
  const { db, deps } = world();
  await main({ mode: "apply" }, deps);
  db.terms.find((t) => t.id === T1).status = "retired";
  const s = await main({ mode: "apply" }, deps);
  assert.equal(db.needFlags[0].status, "resolved");
  assert.equal(s.counts.would_resolve, 1);
});

test("lineage: a CELEX parent is an explicit register target, any other shape becomes a standard need", async () => {
  const flag = (id, citing, rationale) => ({
    id, subject_ref: citing, created_by: "lineage-gap:absent-parent", status: "open", description: "x",
    recommended_actions: [{ action: "x", rationale }],
  });
  const { db, deps } = world({
    terms: [], mentions: [],
    lineageFlags: [
      flag("lg1", "item-a", "item implements 32023R1805, which does not resolve to any item in the corpus"),
      flag("lg2", "item-b", "item amends 2019/1242, which does not resolve to any item in the corpus"),
    ],
    corpus: [{ id: "item-a", title: "A", instrument_identifier: null }, { id: "item-b", title: "B", instrument_identifier: null }],
  });
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.counts.lineage_celex_targets, 1);
  assert.deepEqual(s.celex_targets, ["32023R1805"]);
  assert.equal(s.counts.lineage_non_celex_needs, 1);
  assert.equal(db.needFlags.length, 1);
  assert.equal(db.needFlags[0].subject_ref, "lineage:2019/1242");
  assert.equal(db.needFlags[0].created_by, "term-need:standard");
});

test("tables absent (migration 355 not applied): dry reports it, apply refuses and writes nothing", async () => {
  const { db, deps } = world();
  deps.readTerms = async () => { throw new Error('relation "vocabulary_terms" does not exist'); };
  const d = await main({ mode: "dry" }, deps);
  assert.ok(d.counts.notes.includes("tables_absent"));
  assert.equal(d.exitCode, 0);
  const a = await main({ mode: "apply" }, deps);
  assert.equal(a.exitCode, 1);
  assert.equal(db.needFlags.length, 0);
});

test("an insert that writes fewer rows than planned is a nonzero exit", async () => {
  const { deps } = world();
  deps.insertMany = async () => ({ inserted: 0, snapshot: null });
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.exitCode, 1);
});
