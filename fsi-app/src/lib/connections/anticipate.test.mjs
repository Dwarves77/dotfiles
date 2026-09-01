// anticipate.test.mjs — proves computeAnticipatedTargets' coverage-counting, future-only filter,
// precision-honesty (verbatim restatement, never fabrication), and graceful degradation without topics.
import test from "node:test";
import assert from "node:assert/strict";
import { computeAnticipatedTargets } from "./anticipate.mjs";

const NOW = "2026-09-01T00:00:00Z";

function ev(overrides = {}) {
  return {
    id: "ev-1",
    intelligence_item_id: "item-a",
    event_date: "2026-12-31",
    date_precision: "day",
    event_kind: "compliance_deadline",
    obligation_text: "shall comply by 31 December 2026",
    source_span: "31 December 2026",
    confidence: "high",
    ...overrides,
  };
}

test("no other item shares the topic -> no_coverage", () => {
  const targets = computeAnticipatedTargets([ev()], { itemTopics: { "item-a": ["emissions-reporting"] } }, { now: NOW });
  assert.equal(targets.length, 1);
  assert.equal(targets[0].reason, "no_coverage");
  assert.equal(targets[0].other_coverage_count, 0);
  assert.deepEqual(targets[0].topics, ["emissions-reporting"]);
});

test("exactly one other item shares the topic (thinThreshold default 1) -> thin_coverage", () => {
  const targets = computeAnticipatedTargets(
    [ev()],
    { itemTopics: { "item-a": ["emissions-reporting"], "item-b": ["emissions-reporting"] } },
    { now: NOW },
  );
  assert.equal(targets.length, 1);
  assert.equal(targets[0].reason, "thin_coverage");
  assert.equal(targets[0].other_coverage_count, 1);
});

test("real coverage (more than thinThreshold other items) -> not a target", () => {
  const targets = computeAnticipatedTargets(
    [ev()],
    { itemTopics: { "item-a": ["t"], "item-b": ["t"], "item-c": ["t"] } },
    { now: NOW, thinThreshold: 1 },
  );
  assert.equal(targets.length, 0, "2 other items > thinThreshold(1) -> real coverage, no target");
});

test("past events are never anticipated (future-only filter)", () => {
  const targets = computeAnticipatedTargets(
    [ev({ event_date: "2020-01-01" })],
    { itemTopics: { "item-a": ["t"] } },
    { now: NOW },
  );
  assert.equal(targets.length, 0);
});

test("an event dated exactly `now` is not future (strict >)", () => {
  const targets = computeAnticipatedTargets([ev({ event_date: NOW })], { itemTopics: { "item-a": ["t"] } }, { now: NOW });
  assert.equal(targets.length, 0);
});

test("no topic_tags on the item -> skipped (degrade, never guess)", () => {
  const targets = computeAnticipatedTargets([ev()], { itemTopics: { "item-a": [] } }, { now: NOW });
  assert.equal(targets.length, 0);
  const targets2 = computeAnticipatedTargets([ev()], { itemTopics: {} }, { now: NOW });
  assert.equal(targets2.length, 0);
});

test("precision-honest: every field is restated verbatim from the event, never re-derived", () => {
  const e = ev({ obligation_text: "the Commission shall report by 2028", source_span: "2028", date_precision: "year", confidence: "medium" });
  const [t] = computeAnticipatedTargets([e], { itemTopics: { "item-a": ["t"] } }, { now: NOW });
  assert.equal(t.event_date, e.event_date);
  assert.equal(t.date_precision, e.date_precision);
  assert.equal(t.event_kind, e.event_kind);
  assert.equal(t.obligation_text, e.obligation_text);
  assert.equal(t.source_span, e.source_span);
  assert.equal(t.confidence, e.confidence);
  assert.ok(t.description.includes(e.obligation_text), "description restates obligation_text verbatim");
});

test("instrument_key is restated only when the caller supplies one; never fabricated, never used for coverage counting", () => {
  const withKey = computeAnticipatedTargets(
    [ev()],
    { itemTopics: { "item-a": ["t"] }, itemInstrumentKeys: { "item-a": "32023R1804" } },
    { now: NOW },
  );
  assert.equal(withKey[0].instrument_key, "32023R1804");
  assert.ok(withKey[0].description.includes("32023R1804"));

  const withoutKey = computeAnticipatedTargets([ev()], { itemTopics: { "item-a": ["t"] } }, { now: NOW });
  assert.equal(withoutKey[0].instrument_key, null);
});

test("deterministic output order: sorted by event_id", () => {
  const events = [
    ev({ id: "ev-z", intelligence_item_id: "item-a" }),
    ev({ id: "ev-a", intelligence_item_id: "item-a" }),
  ];
  const targets = computeAnticipatedTargets(events, { itemTopics: { "item-a": ["t"] } }, { now: NOW });
  assert.deepEqual(targets.map((t) => t.event_id), ["ev-a", "ev-z"]);
});

test("malformed rows are skipped, not thrown: missing id, missing item id, missing event_date", () => {
  const targets = computeAnticipatedTargets(
    [ev({ id: undefined }), ev({ intelligence_item_id: undefined }), ev({ event_date: undefined }), null, undefined],
    { itemTopics: { "item-a": ["t"] } },
    { now: NOW },
  );
  assert.equal(targets.length, 0);
});

test("non-array forwardEvents degrades to empty output", () => {
  assert.deepEqual(computeAnticipatedTargets(null, {}, { now: NOW }), []);
  assert.deepEqual(computeAnticipatedTargets(undefined, {}, { now: NOW }), []);
});
