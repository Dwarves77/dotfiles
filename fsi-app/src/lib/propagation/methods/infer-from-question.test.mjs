import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeInferFromQuestion, runInferFromQuestion, INFERENCE_METHODS, METHOD_ID, METHOD_VERSION,
} from "./infer-from-question.ts";

const TQ = {
  itemId: "item-1", surface: "regulations", productQuestion: "what",
  questionText: 'What changed: "amendment"?', subjectRef: "item-1:regulations:what",
};
const NOW = new Date("2026-09-29T00:00:00Z");

function fakeInsertClient(recorder) {
  return {
    from(table) {
      return {
        async insert(row) {
          recorder.push({ table, row });
          return { data: null, error: null };
        },
      };
    },
  };
}

test("INFERENCE_METHODS: infer-from-question@v1 is registered, parallel to (never merged with) the numeric METHODS registry", () => {
  assert.equal(METHOD_ID, "infer-from-question");
  assert.equal(METHOD_VERSION, "v1");
  assert.ok(INFERENCE_METHODS.has(METHOD_ID, METHOD_VERSION));
  assert.equal(INFERENCE_METHODS.get(METHOD_ID, METHOD_VERSION), computeInferFromQuestion);
  assert.ok(INFERENCE_METHODS.registeredKeys().includes("infer-from-question@v1"));
});

test("computeInferFromQuestion: an unresolved answer (residual, no held-pool hit) is refused, never fabricated", () => {
  const res = computeInferFromQuestion({
    triggerQuestion: TQ, answer: { resolved: false, source: "none", candidates: [] },
    citedItemIds: [], subjectId: null, now: NOW,
  });
  assert.equal(res.ok, false);
  assert.match(res.reason, /not resolved/);
});

test("computeInferFromQuestion: a resolved answer with zero cited_item_ids is refused (mirrors migration 338's CHECK)", () => {
  const res = computeInferFromQuestion({
    triggerQuestion: TQ, answer: { resolved: true, source: "held-pool", candidates: [{ x: 1 }] },
    citedItemIds: [], subjectId: null, now: NOW,
  });
  assert.equal(res.ok, false);
  assert.match(res.reason, /cited_item_ids/);
});

test("computeInferFromQuestion: a resolved, cited answer produces a HYPOTHESIS claim at FLOOR.analysis, origin_class derived", () => {
  const res = computeInferFromQuestion({
    triggerQuestion: TQ, answer: { resolved: true, source: "held-pool", candidates: [{ x: 1 }, { x: 2 }] },
    citedItemIds: ["item-a", "item-b"], subjectId: "cl:instr:abc", now: NOW,
  });
  assert.equal(res.ok, true);
  assert.equal(res.statusToken, "HYPOTHESIS");
  assert.equal(res.originClass, "derived");
  assert.equal(res.confidence, 0.5); // FLOOR.analysis
  assert.deepEqual(res.citedItemIds, ["item-a", "item-b"]);
  assert.ok(res.claimText.includes(TQ.questionText));
});

test("computeInferFromQuestion: never emits status_token CONFIRMED, a machine never self-labels CONFIRMED", () => {
  const res = computeInferFromQuestion({
    triggerQuestion: TQ, answer: { resolved: true, source: "priced-candidates", candidates: ["https://x"] },
    citedItemIds: ["item-a"], subjectId: null, now: NOW,
  });
  assert.equal(res.ok, true);
  assert.notEqual(res.statusToken, "CONFIRMED");
});

test("runInferFromQuestion: refuses without writing when computeInferFromQuestion refuses", async () => {
  const inserts = [];
  const res = await runInferFromQuestion(fakeInsertClient(inserts), {
    triggerQuestion: TQ, answer: { resolved: false, source: "none", candidates: [] },
    citedItemIds: [], subjectId: null, now: NOW,
  });
  assert.equal(res.ok, false);
  assert.equal(inserts.length, 0);
});

test("runInferFromQuestion: writes exactly ONE inference_records row shaped for migration 338", async () => {
  const inserts = [];
  const res = await runInferFromQuestion(fakeInsertClient(inserts), {
    triggerQuestion: TQ, answer: { resolved: true, source: "held-pool", candidates: [{ x: 1 }] },
    citedItemIds: ["item-a"], subjectId: "cl:instr:abc", now: NOW,
  });
  assert.equal(res.ok, true);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].table, "inference_records");
  const row = inserts[0].row;
  assert.equal(row.subject_id, "cl:instr:abc");
  assert.equal(row.status_token, "HYPOTHESIS");
  assert.equal(row.origin_class, "derived");
  assert.deepEqual(row.cited_item_ids, ["item-a"]);
  assert.deepEqual(row.derived_from, []);
  assert.equal(row.trigger_question_ref, TQ.subjectRef);
  assert.equal(row.computed_by, "infer-from-question@v1");
});

test("runInferFromQuestion: surfaces the DB error rather than throwing, on an insert failure", async () => {
  const client = { from: () => ({ async insert() { return { data: null, error: { message: "constraint violated" } }; } }) };
  const res = await runInferFromQuestion(client, {
    triggerQuestion: TQ, answer: { resolved: true, source: "held-pool", candidates: [{ x: 1 }] },
    citedItemIds: ["item-a"], subjectId: null, now: NOW,
  });
  assert.equal(res.ok, false);
  assert.match(res.reason, /constraint violated/);
});
