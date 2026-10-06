// term-recurrence.test.mjs (lane G5-TERMS): fixture proofs for the pure counting, proposal and adoption.
// node:test, node: builtins and relative imports only (no-npm discipline glob).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DETECTORS,
  TERM_KINDS,
  normaliseTermKey,
  validateMentionedTerms,
  decideAdoption,
  adoptionRuleText,
  mentionsFromEntityLinkFlags,
  mentionsFromThemeCandidates,
  mentionsFromScenarioTags,
  mentionsFromComplianceCandidates,
  mentionsFromBriefTerms,
  buildTermPlan,
  applyTermPlan,
  recordBriefTerms,
} from "./term-recurrence.mjs";

const NOW = "2026-10-06T00:00:00.000Z";
const MIN = 3;

test("normaliseTermKey: lower case, single spaces, wrapping punctuation stripped", () => {
  assert.equal(normaliseTermKey("  ISO   14083. "), "iso 14083");
  assert.equal(normaliseTermKey('"Bio-LNG"'), "bio-lng");
  assert.equal(normaliseTermKey("   "), "");
});

test("every kind and detector is named once", () => {
  assert.equal(new Set(TERM_KINDS).size, 6);
  assert.deepEqual([...DETECTORS], ["entity-link", "theme-candidate", "scenario-tag", "compliance-object", "brief-terms"]);
});

// ---- detectors: one fixture each, right kind ----

test("detector 1: unresolved, ambiguous and unknown-standard mentions in an intake-entity-link flag become kind standard", () => {
  const flags = [
    {
      id: "f1", subject_ref: "item-a", created_by: "intake-entity-link",
      recommended_actions: [
        { action: "review_entity_mention", rationale: "shaped:ISO 14064 resolved to 0 item(s)" },
        { action: "review_entity_mention", rationale: "named:CBAM resolved to 2 item(s)" },
        { action: "review_entity_mention", rationale: "identifier:2023/1805 resolved to 0 item(s)" },
        { action: "something_else", rationale: "shaped:IGNORED resolved to 0 item(s)" },
        { action: "review_entity_mention", rationale: "unparseable" },
      ],
    },
    { id: "f2", subject_ref: "item-b", created_by: "lineage-gap:absent-parent", recommended_actions: [{ action: "review_entity_mention", rationale: "shaped:NOPE resolved to 0 item(s)" }] },
    { id: "f3", subject_ref: "item-archived", created_by: "intake-entity-link", recommended_actions: [{ action: "review_entity_mention", rationale: "shaped:ISO 14064 resolved to 0 item(s)" }] },
  ];
  const eligible = new Map([["item-a", "src-1"], ["item-b", "src-2"]]);
  const ms = mentionsFromEntityLinkFlags(flags, eligible);
  assert.equal(ms.length, 3);
  assert.ok(ms.every((m) => m.kind === "standard" && m.detector === "entity-link" && m.source_id === "src-1" && m.item_id === "item-a"));
  assert.deepEqual(ms.map((m) => m.term_key), ["iso 14064", "cbam", "2023/1805"]);
});

test("detector 1: recommended_actions stored as a JSON string is read too", () => {
  const flags = [{ id: "f", subject_ref: "i", created_by: "intake-entity-link", recommended_actions: JSON.stringify([{ action: "review_entity_mention", rationale: "shaped:GRI 305 resolved to 0 item(s)" }]) }];
  const ms = mentionsFromEntityLinkFlags(flags, new Map([["i", null]]));
  assert.equal(ms.length, 1);
  assert.equal(ms[0].source_id, null);
});

test("detector 2: theme_candidate other than unclassified becomes kind theme", () => {
  const ms = mentionsFromThemeCandidates([
    { id: "a", source_id: "s1", theme_candidate: "Transport" },
    { id: "b", source_id: "s1", theme_candidate: "unclassified" },
    { id: "c", source_id: "s2", theme_candidate: null },
  ]);
  assert.equal(ms.length, 1);
  assert.deepEqual([ms[0].kind, ms[0].term_key, ms[0].detector], ["theme", "transport", "theme-candidate"]);
});

test("detector 3: scenario tags outside the glossary become kind scenario; glossary tags do not", () => {
  const ms = mentionsFromScenarioTags(
    [{ id: "a", source_id: "s1", operational_scenario_tags: ["ocean-bunkering", "reefer-plug-in-at-berth"] }],
    new Set(["ocean-bunkering"]),
  );
  assert.equal(ms.length, 1);
  assert.deepEqual([ms[0].kind, ms[0].term_key, ms[0].detector], ["scenario", "reefer-plug-in-at-berth", "scenario-tag"]);
});

test("detector 4: compliance_object_candidates become kind compliance_object", () => {
  const ms = mentionsFromComplianceCandidates([{ id: "a", source_id: "s1", compliance_object_candidates: ["Charterer", "ship-agent"] }, { id: "b", source_id: null, compliance_object_candidates: null }]);
  assert.deepEqual(ms.map((m) => [m.kind, m.term_key, m.detector]), [["compliance_object", "charterer", "compliance-object"], ["compliance_object", "ship-agent", "compliance-object"]]);
});

test("detector 5: mentioned_terms keep the kind the author named (material, term, standard)", () => {
  const ms = mentionsFromBriefTerms({
    itemId: "a", sourceId: "s1",
    terms: [{ kind: "material", text: "Lithium iron phosphate" }, { kind: "term", text: "Book and claim" }, { kind: "standard", text: "ISO 14083" }, { kind: "material", text: "lithium  iron phosphate" }],
  });
  assert.deepEqual(ms.map((m) => [m.kind, m.term_key, m.detector]), [
    ["material", "lithium iron phosphate", "brief-terms"],
    ["term", "book and claim", "brief-terms"],
    ["standard", "iso 14083", "brief-terms"],
  ]);
});

test("validateMentionedTerms: refuses a bad kind, empty text, too long text, a non-array", () => {
  assert.equal(validateMentionedTerms(null).errors.length, 0);
  assert.match(validateMentionedTerms({}).errors[0], /JSON array/);
  assert.match(validateMentionedTerms([{ kind: "theme", text: "x" }]).errors[0], /kind must be one of/);
  assert.match(validateMentionedTerms([{ kind: "term", text: " " }]).errors[0], /non-empty/);
  assert.match(validateMentionedTerms([{ kind: "term", text: "x".repeat(121) }]).errors[0], /exceeds 120/);
  assert.match(validateMentionedTerms(Array.from({ length: 26 }, (_, i) => ({ kind: "term", text: `t${i}` }))).errors[0], /exceeds 25/);
});

// ---- adoption rule ----

test("decideAdoption: 3 items and 2 sources adopts; 3 items and 1 source stays proposed; 2 items and 2 sources stays proposed", () => {
  assert.equal(decideAdoption({ distinct_items: 3, distinct_sources: 2 }, { minItems: MIN }).adopt, true);
  assert.equal(decideAdoption({ distinct_items: 3, distinct_sources: 1 }, { minItems: MIN }).adopt, false);
  assert.equal(decideAdoption({ distinct_items: 2, distinct_sources: 2 }, { minItems: MIN }).adopt, false);
  assert.equal(decideAdoption({ distinct_items: 3, distinct_sources: 2 }, { minItems: MIN }).rule, adoptionRuleText(MIN));
  assert.throws(() => decideAdoption({ distinct_items: 1, distinct_sources: 1 }, { minItems: 0 }));
});

function m(term, item, source, detector = "brief-terms", kind = "material") {
  return { kind, term_key: term, label: term, item_id: item, source_id: source, detector, surface_text: term };
}

test("buildTermPlan: 3 items and 2 sources adopts; 3 items and 1 source stays proposed", () => {
  const derived = [
    m("alpha", "i1", "s1"), m("alpha", "i2", "s1"), m("alpha", "i3", "s2"),
    m("beta", "i1", "s1"), m("beta", "i2", "s1"), m("beta", "i3", "s1"),
  ];
  const plan = buildTermPlan({ derived, persisted: [], existingTerms: [], now: NOW, minItems: MIN });
  const by = Object.fromEntries(plan.terms.map((t) => [t.term_key, t]));
  assert.equal(by.alpha.next.status, "adopted");
  assert.equal(by.alpha.next.adoption_rule, adoptionRuleText(MIN));
  assert.equal(by.alpha.next.adopted_at, NOW);
  assert.equal(by.beta.next.status, "proposed");
  assert.equal(by.beta.next.adopted_at, null);
  assert.equal(plan.counts.adopted, 1);
  assert.equal(plan.counts.proposed, 1);
  assert.equal(plan.counts.newly_adopted, 1);
  assert.equal(plan.counts.inserted, 2);
  assert.equal(plan.newMentions.length, 6);
});

test("buildTermPlan: the same item twice counts once; an item with no source adds no source", () => {
  const plan = buildTermPlan({
    derived: [m("gamma", "i1", "s1", "brief-terms"), m("gamma", "i1", "s1", "theme-candidate"), m("gamma", "i2", null), m("gamma", "i3", null)],
    persisted: [], existingTerms: [], now: NOW, minItems: MIN,
  });
  assert.equal(plan.terms[0].next.distinct_items, 3);
  assert.equal(plan.terms[0].next.distinct_sources, 1);
  assert.equal(plan.terms[0].next.status, "proposed");
});

test("buildTermPlan: detected_by_detector counts every detector, persisted brief-terms included", () => {
  const plan = buildTermPlan({
    derived: [m("a", "i1", "s", "theme-candidate", "theme"), m("b", "i1", "s", "scenario-tag", "scenario")],
    persisted: [m("c", "i2", "s", "brief-terms")],
    existingTerms: [], now: NOW, minItems: MIN,
  });
  assert.deepEqual(plan.counts.detected_by_detector, { "entity-link": 0, "theme-candidate": 1, "scenario-tag": 1, "compliance-object": 0, "brief-terms": 1 });
  assert.equal(plan.counts.new_mentions, 2);
});

test("buildTermPlan: a second pass over the same data writes nothing (idempotent)", () => {
  const derived = [m("alpha", "i1", "s1"), m("alpha", "i2", "s1"), m("alpha", "i3", "s2")];
  const first = buildTermPlan({ derived, persisted: [], existingTerms: [], now: NOW, minItems: MIN });
  const stored = first.terms.map((t, i) => ({ id: `t${i}`, ...t.next }));
  const persisted = first.newMentions.map((x) => ({ ...x, label: "alpha" }));
  const second = buildTermPlan({ derived, persisted, existingTerms: stored, now: "2026-10-07T00:00:00.000Z", minItems: MIN });
  assert.equal(second.counts.unchanged, 1);
  assert.equal(second.counts.updated, 0);
  assert.equal(second.counts.inserted, 0);
  assert.equal(second.newMentions.length, 0);
});

test("buildTermPlan: an adopted term stays adopted when its count dips; its adoption stamp is kept", () => {
  const existing = [{ id: "t1", kind: "material", term_key: "alpha", label: "alpha", status: "adopted", distinct_items: 3, distinct_sources: 2, first_seen_at: "2026-09-01T00:00:00.000Z", last_seen_at: "2026-09-01T00:00:00.000Z", adopted_at: "2026-09-02T00:00:00.000Z", adoption_rule: "old rule", evidence: {} }];
  const plan = buildTermPlan({ derived: [], persisted: [m("alpha", "i1", "s1")], existingTerms: existing, now: NOW, minItems: MIN });
  assert.equal(plan.terms[0].next.status, "adopted");
  assert.equal(plan.terms[0].next.adopted_at, "2026-09-02T00:00:00.000Z");
  assert.equal(plan.terms[0].next.adoption_rule, "old rule");
  assert.equal(plan.terms[0].next.distinct_items, 1);
  assert.equal(plan.terms[0].newly_adopted, false);
});

test("buildTermPlan: a retired term is never touched and its new mentions are not written", () => {
  const existing = [{ id: "t1", kind: "material", term_key: "alpha", label: "alpha", status: "retired", distinct_items: 0, distinct_sources: 0, first_seen_at: NOW, last_seen_at: NOW, adopted_at: null, adoption_rule: null, evidence: {} }];
  const plan = buildTermPlan({ derived: [m("alpha", "i1", "s1"), m("alpha", "i2", "s2"), m("alpha", "i3", "s3")], persisted: [], existingTerms: existing, now: NOW, minItems: MIN });
  assert.equal(plan.terms.length, 0);
  assert.equal(plan.newMentions.length, 0);
  assert.equal(plan.counts.skipped_retired, 1);
});

// ---- writers, through injected fakes (an apply-only path is exercised, not only dry) ----

test("applyTermPlan: inserts new terms, patches changed ones, inserts mentions with the returned term ids", async () => {
  const existing = [{ id: "t-old", kind: "material", term_key: "old", label: "old", status: "proposed", distinct_items: 1, distinct_sources: 1, first_seen_at: NOW, last_seen_at: NOW, adopted_at: null, adoption_rule: null, evidence: {} }];
  const plan = buildTermPlan({
    derived: [m("old", "i2", "s2"), m("new", "i1", "s1")],
    persisted: [m("old", "i1", "s1")],
    existingTerms: existing, now: "2026-10-07T00:00:00.000Z", minItems: MIN,
  });
  const calls = { insertTerms: [], updateTerm: [], insertMentions: [] };
  const res = await applyTermPlan(plan, {
    insertTerms: async (rows) => { calls.insertTerms.push(rows); return { rows: rows.map((r) => ({ id: `id-${r.term_key}`, kind: r.kind, term_key: r.term_key })) }; },
    updateTerm: async (id, patch) => { calls.updateTerm.push({ id, patch }); },
    insertMentions: async (rows) => { calls.insertMentions.push(rows); },
  });
  assert.deepEqual(res, { terms_inserted: 1, terms_updated: 1, mentions_inserted: 2 });
  assert.equal(calls.insertTerms[0][0].term_key, "new");
  assert.equal(calls.updateTerm[0].id, "t-old");
  assert.equal(calls.updateTerm[0].patch.distinct_items, 2);
  assert.ok(!("label" in calls.updateTerm[0].patch) && !("term_key" in calls.updateTerm[0].patch), "an update never rewrites label or key");
  assert.deepEqual(calls.insertMentions[0].map((r) => r.term_id).sort(), ["id-new", "t-old"]);
});

test("recordBriefTerms: inserts missing terms as proposed, reuses existing, skips retired, upserts one mention each", async () => {
  const existing = [
    { id: "t-known", kind: "term", term_key: "book and claim", status: "proposed" },
    { id: "t-ret", kind: "standard", term_key: "iso 14083", status: "retired" },
  ];
  const calls = { insertTerms: [], upsertMentions: [] };
  const out = await recordBriefTerms(
    { itemId: "item-1", sourceId: "src-1", now: NOW, terms: [{ kind: "material", text: "Lithium iron phosphate" }, { kind: "term", text: "Book and claim" }, { kind: "standard", text: "ISO 14083" }] },
    {
      readTerms: async () => existing,
      insertTerms: async (rows) => { calls.insertTerms.push(rows); return { rows: rows.map((r) => ({ id: `id-${r.term_key}`, kind: r.kind, term_key: r.term_key })) }; },
      upsertMentions: async (rows) => { calls.upsertMentions.push(rows); },
    },
  );
  assert.deepEqual(out, { mentioned: 3, terms_inserted: 1, mentions_written: 2, skipped_retired: 1 });
  assert.equal(calls.insertTerms[0][0].status, "proposed");
  assert.deepEqual(calls.upsertMentions[0].map((r) => r.term_id).sort(), ["id-lithium iron phosphate", "t-known"]);
  assert.ok(calls.upsertMentions[0].every((r) => r.detector === "brief-terms" && r.item_id === "item-1" && r.source_id === "src-1"));
});

test("recordBriefTerms: no terms means no read and no write", async () => {
  const out = await recordBriefTerms({ itemId: "i", sourceId: null, terms: [], now: NOW }, {
    readTerms: async () => { throw new Error("must not read"); },
    insertTerms: async () => { throw new Error("must not write"); },
    upsertMentions: async () => { throw new Error("must not write"); },
  });
  assert.equal(out.mentioned, 0);
});
