// term-recurrence.test.mjs (lane G5-TERMS): the collector against fixtures with injected deps, in an
// in-memory store so an apply and a second pass are both exercised. node:test, node: builtins and relative
// imports only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main, CITE, STEP } from "./term-recurrence.mjs";

const NOW = "2026-10-06T00:00:00.000Z";
const HELD = new Set(["ocean-bunkering"]);

function flag(itemId, mentions) {
  return {
    id: `flag-${itemId}`, subject_ref: itemId, created_by: "intake-entity-link",
    recommended_actions: mentions.map((m) => ({ action: "review_entity_mention", rationale: `${m} resolved to 0 item(s)` })),
  };
}

/** A fixture corpus: six eligible items over three sources, one detector's worth of unknowns each. */
function corpus() {
  const items = [
    { id: "i1", source_id: "s1", theme_candidate: "transport", operational_scenario_tags: ["ocean-bunkering", "reefer-berth"], compliance_object_candidates: ["charterer"] },
    { id: "i2", source_id: "s1", theme_candidate: "transport", operational_scenario_tags: ["reefer-berth"], compliance_object_candidates: ["charterer"] },
    { id: "i3", source_id: "s2", theme_candidate: "transport", operational_scenario_tags: ["reefer-berth"], compliance_object_candidates: ["charterer"] },
    { id: "i4", source_id: "s2", theme_candidate: "unclassified", operational_scenario_tags: [], compliance_object_candidates: [] },
    { id: "i5", source_id: "s3", theme_candidate: null, operational_scenario_tags: [], compliance_object_candidates: [] },
    { id: "i6", source_id: "s3", theme_candidate: null, operational_scenario_tags: [], compliance_object_candidates: [] },
  ];
  const flags = [
    flag("i1", ["shaped:ISO 14064"]), flag("i2", ["shaped:ISO 14064"]), flag("i3", ["shaped:ISO 14064"]),
    flag("i4", ["shaped:GRI 305"]), flag("i5", ["shaped:GRI 305"]), flag("i6", ["shaped:GRI 305"]),
    flag("i-archived", ["shaped:ISO 14064"]),
  ];
  return { items, flags };
}

/** An in-memory store behind the deps, recording every write so dry can be proven to write nothing. */
function makeStore({ terms = [], mentions = [], itemsOverride = null } = {}) {
  const { items, flags } = corpus();
  const store = { terms: [...terms], mentions: [...mentions], writes: { insertTerms: 0, updateTerm: 0, insertMentions: 0 } };
  let seq = 0;
  const deps = {
    minItems: 3,
    heldScenarioTags: HELD,
    now: () => NOW,
    readItems: async (withCandidates) => (itemsOverride ?? items).map((it) => (withCandidates ? it : (({ compliance_object_candidates: _c, ...rest }) => rest)(it))),
    readEntityLinkFlags: async () => flags,
    readTerms: async () => store.terms.map((t) => ({ ...t })),
    readMentions: async () => store.mentions.map((m) => ({ ...m })),
    writers: {
      insertTerms: async (rows) => {
        store.writes.insertTerms += rows.length;
        const out = rows.map((r) => ({ id: `t${++seq}`, ...r }));
        store.terms.push(...out);
        return { rows: out.map((r) => ({ id: r.id, kind: r.kind, term_key: r.term_key })) };
      },
      updateTerm: async (id, patch) => {
        store.writes.updateTerm += 1;
        Object.assign(store.terms.find((t) => t.id === id), patch);
      },
      insertMentions: async (rows) => {
        store.writes.insertMentions += rows.length;
        store.mentions.push(...rows.map((r) => ({ ...r })));
      },
    },
    countTermsByStatus: async () => {
      const o = { proposed: 0, adopted: 0, retired: 0 };
      for (const t of store.terms) o[t.status] += 1;
      return o;
    },
  };
  return { store, deps };
}

test("STEP and CITE are named", () => {
  assert.equal(STEP, "term-recurrence");
  assert.ok(CITE.skill && CITE.reason);
});

test("dry: every detector lands mentions of the right kind and NOTHING is written", async () => {
  const { store, deps } = makeStore();
  const s = await main({ mode: "dry" }, deps);
  assert.equal(s.exitCode, 0);
  assert.deepEqual(store.writes, { insertTerms: 0, updateTerm: 0, insertMentions: 0 });
  // 6 flag mentions on eligible items (the archived item's flag does not count), 3 theme, 4 scenario (reefer-berth x3 + none for held), 3 compliance
  assert.deepEqual(s.counts.detected_by_detector, { "entity-link": 6, "theme-candidate": 3, "scenario-tag": 3, "compliance-object": 3, "brief-terms": 0 });
  const byKey = Object.fromEntries(s.counts.preview.map((p) => [`${p.kind}|${p.term_key}`, p]));
  assert.ok(byKey["standard|iso 14064"] && byKey["standard|gri 305"], "entity-link mentions become kind standard");
  assert.ok(byKey["theme|transport"], "theme_candidate becomes kind theme, unclassified is skipped");
  assert.ok(byKey["scenario|reefer-berth"], "a scenario tag outside the glossary becomes kind scenario");
  assert.ok(!byKey["scenario|ocean-bunkering"], "a glossary tag is held, not a term");
  assert.ok(byKey["compliance_object|charterer"], "compliance_object_candidates become kind compliance_object (the formerly dropped input)");
  assert.match(s.note, /^DRY/);
});

test("adoption fixture: 3 items over 2 sources adopt; 3 items over 1 source stay proposed", async () => {
  const { deps } = makeStore();
  const s = await main({ mode: "dry" }, deps);
  const by = Object.fromEntries(s.counts.preview.map((p) => [`${p.kind}|${p.term_key}`, p]));
  // iso 14064: items i1,i2,i3 over sources s1,s1,s2 -> 3 items, 2 sources -> adopts
  assert.equal(by["standard|iso 14064"].status, "adopted");
  // gri 305: items i4,i5,i6 over sources s2,s3,s3 -> 3 items, 2 sources -> adopts too; use a 1-source fixture below
  const one = makeStore({ itemsOverride: [
    { id: "i1", source_id: "s1", theme_candidate: "solo", operational_scenario_tags: [], compliance_object_candidates: [] },
    { id: "i2", source_id: "s1", theme_candidate: "solo", operational_scenario_tags: [], compliance_object_candidates: [] },
    { id: "i3", source_id: "s1", theme_candidate: "solo", operational_scenario_tags: [], compliance_object_candidates: [] },
  ] });
  const s1 = await main({ mode: "dry" }, one.deps);
  const solo = s1.counts.preview.find((p) => p.term_key === "solo");
  assert.deepEqual([solo.distinct_items, solo.distinct_sources, solo.status], [3, 1, "proposed"]);
  assert.equal(s1.counts.adopted, 0);
});

test("apply writes terms and mentions through the writers, adoption stamped; a second pass writes nothing", async () => {
  const { store, deps } = makeStore();
  const first = await main({ mode: "apply" }, deps);
  assert.equal(first.exitCode, 0);
  assert.ok(first.wrote.terms_inserted >= 5);
  assert.equal(store.writes.insertMentions, first.wrote.mentions_inserted);
  const iso = store.terms.find((t) => t.term_key === "iso 14064");
  assert.equal(iso.status, "adopted");
  assert.equal(iso.adoption_rule, "distinct_items>=3 AND distinct_sources>=2");
  assert.equal(iso.adopted_at, NOW);
  assert.ok(first.read_back.adopted >= 1);

  const before = JSON.stringify(store.writes);
  const second = await main({ mode: "apply" }, deps);
  assert.equal(JSON.stringify(store.writes), before, "an unchanged corpus writes nothing the second time");
  assert.equal(second.counts.plan.insert, 0);
  assert.equal(second.counts.plan.update, 0);
  assert.equal(second.counts.plan.new_mentions, 0);
});

test("a persisted brief-terms mention (written at apply) counts toward the recurrence and the detector tally", async () => {
  const seed = [{ id: "t-mat", kind: "material", term_key: "lfp", label: "LFP", status: "proposed", distinct_items: 1, distinct_sources: 1, first_seen_at: NOW, last_seen_at: NOW, adopted_at: null, adoption_rule: null, evidence: {} }];
  const mentions = [
    { term_id: "t-mat", item_id: "i1", source_id: "s1", detector: "brief-terms", surface_text: "LFP" },
    { term_id: "t-mat", item_id: "i2", source_id: "s1", detector: "brief-terms", surface_text: "LFP" },
    { term_id: "t-mat", item_id: "i3", source_id: "s2", detector: "brief-terms", surface_text: "LFP" },
    { term_id: "t-mat", item_id: "i-gone", source_id: "s9", detector: "brief-terms", surface_text: "LFP" },
  ];
  const { store, deps } = makeStore({ terms: seed, mentions });
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.counts.detected_by_detector["brief-terms"], 3, "a mention of an archived or absent item does not count");
  const lfp = store.terms.find((t) => t.term_key === "lfp");
  assert.equal(lfp.status, "adopted");
  assert.equal(lfp.distinct_items, 3);
  assert.equal(lfp.label, "LFP", "an update never rewrites the label");
});

test("a retired term is left alone: no update, no new mention", async () => {
  const seed = [{ id: "t-ret", kind: "standard", term_key: "iso 14064", label: "ISO 14064", status: "retired", distinct_items: 0, distinct_sources: 0, first_seen_at: NOW, last_seen_at: NOW, adopted_at: null, adoption_rule: null, evidence: {} }];
  const { store, deps } = makeStore({ terms: seed });
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.counts.plan.skipped_retired, 1);
  assert.equal(store.terms.find((t) => t.id === "t-ret").status, "retired");
  assert.ok(!store.mentions.some((m) => m.term_id === "t-ret"));
});

test("before migration 355: dry reports tables_absent and still counts; apply REFUSES with exit 1 and writes nothing", async () => {
  const { store, deps } = makeStore();
  const absent = async () => { throw new Error('relation "public.vocabulary_terms" does not exist'); };
  const dryDeps = { ...deps, readTerms: absent, readMentions: absent };
  const dry = await main({ mode: "dry" }, dryDeps);
  assert.equal(dry.exitCode, 0);
  assert.ok(dry.counts.notes.includes("tables_absent"));
  assert.ok(dry.counts.terms_total > 0);

  const applied = await main({ mode: "apply" }, dryDeps);
  assert.equal(applied.exitCode, 1);
  assert.match(applied.note, /migration 355 is not applied/);
  assert.deepEqual(store.writes, { insertTerms: 0, updateTerm: 0, insertMentions: 0 });
});

test("before the compliance column exists: the item read falls back without it and says so", async () => {
  const { deps } = makeStore();
  const noCol = { ...deps, readItems: async (withCandidates) => {
    if (withCandidates) throw new Error('column intelligence_items.compliance_object_candidates does not exist');
    return deps.readItems(false);
  } };
  const s = await main({ mode: "dry" }, noCol);
  assert.ok(s.counts.notes.includes("compliance_candidates_column_absent"));
  assert.equal(s.counts.detected_by_detector["compliance-object"], 0);
});

test("a real read failure (not an absence) is not swallowed", async () => {
  const { deps } = makeStore();
  await assert.rejects(() => main({ mode: "dry" }, { ...deps, readTerms: async () => { throw new Error("connection reset"); } }), /connection reset/);
});
