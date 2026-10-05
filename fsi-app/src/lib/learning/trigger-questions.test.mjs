// trigger-questions.test.mjs, fixtures for every template (PRODUCT_QUESTIONS x a surface per domain),
// the namespace registration, and the dedup-before-insert MAINT-step shape.
import test from "node:test";
import assert from "node:assert/strict";
import {
  generateTriggerQuestions, triggerQuestionFlagRow, isTriggerQuestionFlag, surfacesForDomain,
  main, MINTED_OR_TOUCHED,
} from "./trigger-questions.mjs";
import { PRODUCT_QUESTIONS } from "./constants.mjs";
import { QUESTION_NAMESPACE } from "../connections/flag-namespaces.mjs";

const REG_ITEM = { id: "item-reg-1", title: "Bonded-warehouse climate-control amendment", domain: 1, item_type: "regulation" };
const MARKET_ITEM = { id: "item-mkt-1", title: "War-risk premium spike, named corridor", domain: 4, item_type: "market_signal" };
const RESEARCH_ITEM = { id: "item-res-1", title: "New emissions-factor methodology study", domain: 7, item_type: "research_finding" };
const OPS_ITEM = { id: "item-ops-1", title: "Warehouse facility capacity update", domain: 6, item_type: "regional_data" };
const UNROUTED_ITEM = { id: "item-legacy-1", title: "Legacy row", domain: 5 };

test("surfacesForDomain: routes every live domain to exactly one surface; domain 5 (legacy) and null route to none", () => {
  assert.deepEqual(surfacesForDomain(1), ["regulations"]);
  assert.deepEqual(surfacesForDomain(2), ["market_intel"]);
  assert.deepEqual(surfacesForDomain(3), ["operations"]);
  assert.deepEqual(surfacesForDomain(4), ["market_intel"]);
  assert.deepEqual(surfacesForDomain(6), ["operations"]);
  assert.deepEqual(surfacesForDomain(7), ["research"]);
  assert.deepEqual(surfacesForDomain(5), []);
  assert.deepEqual(surfacesForDomain(null), []);
  assert.deepEqual(surfacesForDomain(undefined), []);
});

test("generateTriggerQuestions: every PRODUCT_QUESTIONS template fires, for a Regulations-domain item (fixture 1 of 4, coverage beyond the walk-through examples, CLAUDE.md rule 19)", () => {
  const qs = generateTriggerQuestions(REG_ITEM);
  assert.equal(qs.length, PRODUCT_QUESTIONS.length);
  const productQuestions = qs.map((q) => q.productQuestion).sort();
  assert.deepEqual(productQuestions, [...PRODUCT_QUESTIONS].sort());
  for (const q of qs) {
    assert.equal(q.itemId, REG_ITEM.id);
    assert.equal(q.surface, "regulations");
    assert.equal(q.eventType, MINTED_OR_TOUCHED);
    assert.ok(q.questionText.length > 0);
    assert.ok(q.questionText.includes(REG_ITEM.title));
    assert.equal(q.subjectRef, `${REG_ITEM.id}:regulations:${q.productQuestion}`);
    assert.equal(q.createdBy, `${QUESTION_NAMESPACE}${q.productQuestion}`);
  }
});

test("generateTriggerQuestions: fixture 2 of 4 (Market Intel, distinct vertical from the design doc's own worked walk-through)", () => {
  const qs = generateTriggerQuestions(MARKET_ITEM);
  assert.equal(qs.length, 4);
  assert.ok(qs.every((q) => q.surface === "market_intel"));
});

test("generateTriggerQuestions: fixture 3 of 4 (Research)", () => {
  const qs = generateTriggerQuestions(RESEARCH_ITEM);
  assert.equal(qs.length, 4);
  assert.ok(qs.every((q) => q.surface === "research"));
});

test("generateTriggerQuestions: fixture 4 of 4 (Operations)", () => {
  const qs = generateTriggerQuestions(OPS_ITEM);
  assert.equal(qs.length, 4);
  assert.ok(qs.every((q) => q.surface === "operations"));
});

test("generateTriggerQuestions: an unrouted domain generates zero questions, never a guessed surface", () => {
  assert.deepEqual(generateTriggerQuestions(UNROUTED_ITEM), []);
});

test("generateTriggerQuestions: an item with no id yields []", () => {
  assert.deepEqual(generateTriggerQuestions({ title: "no id" }), []);
  assert.deepEqual(generateTriggerQuestions(null), []);
});

test("generateTriggerQuestions: deterministic, same item, same output", () => {
  assert.deepEqual(generateTriggerQuestions(REG_ITEM), generateTriggerQuestions(REG_ITEM));
});

test("triggerQuestionFlagRow: shape matches integrity_flags contract, category coverage_gap, subject_type item", () => {
  const [q] = generateTriggerQuestions(REG_ITEM);
  const row = triggerQuestionFlagRow(q);
  assert.equal(row.category, "coverage_gap");
  assert.equal(row.subject_type, "item");
  assert.equal(row.subject_ref, q.subjectRef);
  assert.equal(row.status, "open");
  assert.equal(row.created_by, q.createdBy);
  assert.ok(row.description.length > 0);
  assert.ok(Array.isArray(row.recommended_actions));
  assert.equal(row.recommended_actions[0].action, "answer-seeking");
});

test("isTriggerQuestionFlag: true only for the question: namespace", () => {
  assert.ok(isTriggerQuestionFlag("question:what"));
  assert.ok(!isTriggerQuestionFlag("flywheel-tag:empty-signature"));
  assert.ok(!isTriggerQuestionFlag(null));
});

// ── main(), the dedup-before-insert MAINT-step shape ─────────────────────────────────────────────────

test("main: dry mode computes the plan, writes nothing", async () => {
  let inserted = false;
  const deps = {
    readExistingOpen: async () => [],
    insertMany: async () => { inserted = true; return { inserted: 0, snapshot: null }; },
  };
  const summary = await main({ mode: "dry", items: [REG_ITEM, MARKET_ITEM] }, deps);
  assert.equal(summary.exitCode, 0);
  assert.equal(summary.counts.items_considered, 2);
  assert.equal(summary.counts.questions_generated, 8);
  assert.equal(summary.counts.new, 8);
  assert.equal(inserted, false);
});

test("main: apply mode inserts only the NEW rows, skipping subject_refs already open", async () => {
  const [alreadyOpen] = generateTriggerQuestions(REG_ITEM);
  const existing = [{ subject_ref: alreadyOpen.subjectRef, created_by: alreadyOpen.createdBy }];
  let insertedRows = null;
  const deps = {
    readExistingOpen: async () => existing,
    insertMany: async (rows) => { insertedRows = rows; return { inserted: rows.length, snapshot: "cite-abc" }; },
  };
  const summary = await main({ mode: "apply", items: [REG_ITEM] }, deps);
  assert.equal(summary.counts.questions_generated, 4);
  assert.equal(summary.counts.already_open, 1);
  assert.equal(summary.counts.new, 3);
  assert.equal(summary.applied, 3);
  assert.equal(insertedRows.length, 3);
  assert.ok(!insertedRows.some((r) => r.subject_ref === alreadyOpen.subjectRef));
  assert.equal(summary.read_back.snapshot, "cite-abc");
});

test("main: zero items generated (empty batch or every item unrouted) writes nothing in either mode", async () => {
  const deps = {
    readExistingOpen: async () => { throw new Error("should not be called, nothing generated"); },
    insertMany: async () => { throw new Error("should not be called, nothing generated"); },
  };
  const dry = await main({ mode: "dry", items: [] }, deps);
  assert.equal(dry.counts.questions_generated, 0);
  const apply = await main({ mode: "apply", items: [UNROUTED_ITEM] }, deps);
  assert.equal(apply.counts.questions_generated, 0);
  assert.equal(apply.applied, 0);
});

// ── ADR-044 posture and the change-time generation (lane L4-A, 2026-10-05) ───────────────────────────

import { QUESTION_ACQUISITION } from "./constants.mjs";
import { mainForQuestions, CITE } from "./trigger-questions.mjs";

test("posture: questions are answered from holdings by a session batch, not operator-priced or parked (ADR-044 decision 1)", () => {
  assert.equal(QUESTION_ACQUISITION, "holdings-session-batch");
  const row = triggerQuestionFlagRow(generateTriggerQuestions(REG_ITEM)[0]);
  const text = `${CITE.reason} ${row.recommended_actions[0].rationale}`;
  assert.match(text, /session batch/);
  assert.ok(!/operator-priced-only|for operator review|never auto-answered/.test(text), text);
});

test("generateTriggerQuestions: a change-time call carries the event type, says what changed in plain words, and keeps the event id", () => {
  const qs = generateTriggerQuestions(REG_ITEM, {
    eventType: "value_revised", eventId: 42, change: "a derived value (val-1) was revised on Fixture jurisdiction",
  });
  assert.equal(qs.length, 4);
  for (const q of qs) {
    assert.equal(q.eventType, "value_revised");
    assert.equal(q.eventId, 42);
    assert.match(q.questionText, /a derived value \(val-1\) was revised on Fixture jurisdiction/);
    assert.match(q.questionText, new RegExp(REG_ITEM.title));
  }
  const row = triggerQuestionFlagRow(qs[0]);
  assert.match(row.recommended_actions[0].rationale, /event_type=value_revised event_id=42/);
});

test("mainForQuestions: the same key twice in one batch is written once and counted", async () => {
  const q = generateTriggerQuestions(REG_ITEM);
  let rows = null;
  const deps = { readExistingOpen: async () => [], insertMany: async (r) => { rows = r; return { inserted: r.length, snapshot: null }; } };
  const s = await mainForQuestions({ mode: "apply", questions: [...q, ...q], itemsConsidered: 1 }, deps);
  assert.equal(rows.length, 4);
  assert.equal(s.counts.deduped_in_batch, 4);
  assert.equal(s.counts.new, 4);
});
