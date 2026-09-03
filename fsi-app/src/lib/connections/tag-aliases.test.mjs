// tag-aliases.test.mjs — proves the ALIAS_MAP self-check binds to the REAL live vocabularies (never a
// stale/invented tag), deriveAliasTags() matches/tiers/caps identically to derive-tags.mjs's own
// deriveTags(), and mergeTagProposals() combines both tables' output correctly.
import test from "node:test";
import assert from "node:assert/strict";
import { deriveTags, TOPIC_TAG_VALUES, COMPLIANCE_OBJECT_VALUES, SCENARIO_TAG_VALUES, FIELD_CAPS } from "./derive-tags.mjs";
import { ALIAS_MAP, deriveAliasTags, mergeTagProposals } from "./tag-aliases.mjs";

test("ALIAS_MAP self-check: every mapped tag is a real member of its field's live vocabulary (module already threw at import if not)", () => {
  const topic = new Set(TOPIC_TAG_VALUES), compliance = new Set(COMPLIANCE_OBJECT_VALUES), scenario = new Set(SCENARIO_TAG_VALUES);
  assert.ok(ALIAS_MAP.length > 0, "ALIAS_MAP must not be empty");
  for (const entry of ALIAS_MAP) {
    const set = entry.field === "topic_tags" ? topic : entry.field === "compliance_object_tags" ? compliance : scenario;
    assert.ok(set.has(entry.tag), `${entry.field}:${entry.tag} must exist in the live vocabulary`);
  }
});

test("ALIAS_MAP: no entry introduces a tag absent from the closed vocabularies (topic_tags, compliance_object_tags exactness)", () => {
  for (const entry of ALIAS_MAP) {
    if (entry.field === "topic_tags") assert.ok(TOPIC_TAG_VALUES.includes(entry.tag));
    if (entry.field === "compliance_object_tags") assert.ok(COMPLIANCE_OBJECT_VALUES.includes(entry.tag));
  }
});

test("ALIAS_MAP: never reintroduces the ADR-020-retired customs-declaration-*/dangerous-goods-* scenario families", () => {
  for (const entry of ALIAS_MAP) {
    for (const kw of entry.keywords) {
      assert.doesNotMatch(kw.toLowerCase(), /customs.declaration|dangerous.goods/);
    }
  }
});

test("deriveAliasTags: title-level alias phrase scores HIGH, body-level scores MEDIUM", () => {
  const highItem = { id: "a1", title: "A directive on packaging waste management", full_brief: "" };
  const high = deriveAliasTags(highItem);
  assert.ok(high.proposals.some((p) => p.tag === "packaging" && p.confidence === "high"));

  const mediumItem = { id: "a2", title: "An unrelated title", full_brief: "This directive concerns packaging waste targets." };
  const medium = deriveAliasTags(mediumItem);
  assert.ok(medium.proposals.some((p) => p.tag === "packaging" && p.confidence === "medium"));
});

test("deriveAliasTags: evidence is a real matched substring of the item's own text (never invented)", () => {
  const item = { id: "a3", title: "T", full_brief: "The directive concerns biofuel blending targets." };
  const res = deriveAliasTags(item);
  const fuelsProposal = res.proposals.find((p) => p.tag === "fuels");
  assert.ok(fuelsProposal);
  assert.match(item.full_brief.toLowerCase(), new RegExp(fuelsProposal.evidence.toLowerCase()));
});

test("deriveAliasTags: negative case — text with no alias phrase produces zero proposals", () => {
  const item = { id: "a4", title: "An unrelated administrative notice", full_brief: "This concerns filing deadlines only." };
  const res = deriveAliasTags(item);
  assert.deepEqual(res.proposals, []);
});

test("deriveAliasTags: respects the SAME per-field caps as deriveTags() (FIELD_CAPS imported, never hand-copied)", () => {
  // topic_tags cap is 3 (FIELD_CAPS.topic_tags) — construct text that could hit every topic_tags alias.
  const item = {
    id: "a5",
    title: "T",
    full_brief: "packaging waste, greenhouse gas emissions, emission trading, biofuel, heavy-duty vehicle all mentioned.",
  };
  const res = deriveAliasTags(item);
  const topicProposals = res.proposals.filter((p) => p.field === "topic_tags");
  assert.ok(topicProposals.length <= FIELD_CAPS.topic_tags);
});

test("deriveAliasTags: pure — never mutates the item, deterministic across calls", () => {
  const item = { id: "a6", title: "T", full_brief: "packaging waste" };
  const frozen = JSON.parse(JSON.stringify(item));
  const r1 = deriveAliasTags(item);
  const r2 = deriveAliasTags(item);
  assert.deepEqual(item, frozen);
  assert.deepEqual(r1, r2);
});

test("mergeTagProposals: unions two disjoint proposal sets", () => {
  const base = [{ field: "topic_tags", tag: "emissions", evidence: "carbon pricing", confidence: "high" }];
  const alias = [{ field: "topic_tags", tag: "fuels", evidence: "biofuel", confidence: "medium" }];
  const merged = mergeTagProposals(base, alias);
  assert.deepEqual(merged.map((p) => p.tag).sort(), ["emissions", "fuels"]);
});

test("mergeTagProposals: same field+tag from both — higher confidence wins", () => {
  const base = [{ field: "topic_tags", tag: "emissions", evidence: "x", confidence: "medium" }];
  const alias = [{ field: "topic_tags", tag: "emissions", evidence: "y", confidence: "high" }];
  const merged = mergeTagProposals(base, alias);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].confidence, "high");
  assert.equal(merged[0].evidence, "y");
});

test("mergeTagProposals: same field+tag, same confidence — base wins the tie (stronger-grounded table)", () => {
  const base = [{ field: "topic_tags", tag: "emissions", evidence: "BASE_EVIDENCE", confidence: "high" }];
  const alias = [{ field: "topic_tags", tag: "emissions", evidence: "ALIAS_EVIDENCE", confidence: "high" }];
  const merged = mergeTagProposals(base, alias);
  assert.equal(merged[0].evidence, "BASE_EVIDENCE");
});

test("mergeTagProposals: re-caps the union per field at FIELD_CAPS, highest-confidence-first, tag ascending tiebreak", () => {
  const mk = (tag, confidence) => ({ field: "topic_tags", tag, evidence: tag, confidence });
  const base = [mk("emissions", "high"), mk("fuels", "high")];
  const alias = [mk("transport", "high"), mk("reporting", "high"), mk("packaging", "medium")];
  // 5 candidates, cap is 3 (FIELD_CAPS.topic_tags) — all "high" except packaging, so packaging (medium) is dropped,
  // and the remaining 4 "high" ties break tag-ascending: emissions, fuels, reporting, transport -> keep first 3.
  const merged = mergeTagProposals(base, alias);
  assert.equal(merged.length, FIELD_CAPS.topic_tags);
  assert.deepEqual(merged.map((p) => p.tag), ["emissions", "fuels", "reporting"]);
});

test("mergeTagProposals: empty/missing inputs never throw", () => {
  assert.deepEqual(mergeTagProposals([], []), []);
  assert.deepEqual(mergeTagProposals(undefined, undefined), []);
  assert.deepEqual(mergeTagProposals(null, [{ field: "topic_tags", tag: "emissions", evidence: "x", confidence: "high" }]).map((p) => p.tag), ["emissions"]);
});

test("integration: merged output for a real record-grade shape matches what deriveTags() alone would miss", () => {
  const item = {
    id: "i1",
    title: "Directive on packaging waste",
    full_brief: "A short catalogue stub carrying no closed-vocabulary phrase for this topic.",
  };
  const baseOnly = deriveTags(item);
  assert.equal(baseOnly.proposals.length, 0, "existing KEYWORD_MAP alone must miss this real-world phrasing");
  const aliasOnly = deriveAliasTags(item);
  assert.ok(aliasOnly.proposals.some((p) => p.tag === "packaging"));
  const merged = mergeTagProposals(baseOnly.proposals, aliasOnly.proposals);
  assert.ok(merged.some((p) => p.tag === "packaging"));
});
