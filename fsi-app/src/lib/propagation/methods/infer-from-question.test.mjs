import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeInferFromQuestion, registerInferenceRecord, validateRegisterInferenceRecordInput,
  INFERENCE_METHODS, METHOD_ID, METHOD_VERSION,
} from "./infer-from-question.ts";

const NOW = new Date("2026-09-29T00:00:00Z");
const PRIOR = { inference_id: "inf-1", claim_text: "What changed: amendment?", cited_item_ids: ["item-a", "item-b"], trigger_question_ref: "item-1:regulations:what" };

test("INFERENCE_METHODS: infer-from-question@v1 is registered, parallel to (never merged with) the numeric METHODS registry", () => {
  assert.equal(METHOD_ID, "infer-from-question");
  assert.equal(METHOD_VERSION, "v1");
  assert.ok(INFERENCE_METHODS.has(METHOD_ID, METHOD_VERSION));
  assert.equal(INFERENCE_METHODS.get(METHOD_ID, METHOD_VERSION), computeInferFromQuestion);
  assert.ok(INFERENCE_METHODS.registeredKeys().includes("infer-from-question@v1"));
});

test("computeInferFromQuestion: no prior row is refused, never fabricated", () => {
  const res = computeInferFromQuestion({ entityId: null, inputs: [], priorValue: null, now: NOW });
  assert.equal(res.ok, false);
  assert.match(res.reason, /no prior inference_records row/);
});

test("computeInferFromQuestion: a prior row with zero cited_item_ids is refused", () => {
  const res = computeInferFromQuestion({
    entityId: null, inputs: [], priorValue: { ...PRIOR, cited_item_ids: [] }, now: NOW,
  });
  assert.equal(res.ok, false);
  assert.match(res.reason, /cited_item_ids/);
});

test("computeInferFromQuestion: declared inputs exist but every one is unresolvable is refused", () => {
  const res = computeInferFromQuestion({
    entityId: null,
    inputs: [{ table: "derived_values", pk: "gone", version: null, row: null }],
    priorValue: PRIOR,
    now: NOW,
  });
  assert.equal(res.ok, false);
  assert.match(res.reason, /unresolvable/);
});

test("computeInferFromQuestion: no declared inputs at all (empty array) still recomputes from the prior claim/citations", () => {
  const res = computeInferFromQuestion({ entityId: "cl:instr:abc", inputs: [], priorValue: PRIOR, now: NOW });
  assert.equal(res.ok, true);
  assert.equal(res.statusToken, "HYPOTHESIS");
  assert.equal(res.originClass, "derived");
  assert.equal(res.confidence, 0.5); // FLOOR.analysis
  assert.deepEqual(res.citedItemIds, PRIOR.cited_item_ids);
  assert.ok(res.claimText.includes(PRIOR.claim_text));
  assert.ok(res.claimText.includes("0 resolved input"));
});

test("computeInferFromQuestion: at least one resolvable declared input recomputes with the resolved count", () => {
  const res = computeInferFromQuestion({
    entityId: null,
    inputs: [
      { table: "derived_values", pk: "dv-1", version: null, row: { value_id: "dv-1", value: 42 } },
      { table: "derived_values", pk: "gone", version: null, row: null },
    ],
    priorValue: PRIOR,
    now: NOW,
  });
  assert.equal(res.ok, true);
  assert.ok(res.claimText.includes("1 resolved input"));
});

test("computeInferFromQuestion: never emits status_token CONFIRMED, a machine never self-labels CONFIRMED", () => {
  const res = computeInferFromQuestion({ entityId: null, inputs: [], priorValue: PRIOR, now: NOW });
  assert.equal(res.ok, true);
  assert.notEqual(res.statusToken, "CONFIRMED");
});

test("validateRegisterInferenceRecordInput: catches every missing/invalid field", () => {
  const problems = validateRegisterInferenceRecordInput({
    subjectId: null, claimText: "", statusToken: "MAYBE", confidence: 2, citedItemIds: [],
    originClass: "verified", methodId: "", methodVersion: "", computedBy: "",
  });
  assert.ok(problems.some((p) => p.includes("claimText")));
  assert.ok(problems.some((p) => p.includes("statusToken")));
  assert.ok(problems.some((p) => p.includes("confidence")));
  assert.ok(problems.some((p) => p.includes("citedItemIds")));
  assert.ok(problems.some((p) => p.includes("originClass")));
  assert.ok(problems.some((p) => p.includes("methodId")));
  assert.ok(problems.some((p) => p.includes("methodVersion")));
  assert.ok(problems.some((p) => p.includes("computedBy")));
});

test("validateRegisterInferenceRecordInput: a well-formed input has zero problems", () => {
  const problems = validateRegisterInferenceRecordInput({
    subjectId: "cl:instr:abc", claimText: "a claim", statusToken: "HYPOTHESIS", confidence: 0.5,
    citedItemIds: ["item-a"], originClass: "derived", methodId: "infer-from-question", methodVersion: "v1",
    computedBy: "infer-from-question@v1",
  });
  assert.deepEqual(problems, []);
});

function fakeRpcClient(recorder, response = { data: "new-inference-id", error: null }) {
  return { async rpc(fn, args) { recorder.push({ fn, args }); return response; } };
}

test("registerInferenceRecord: throws on invalid input without calling the RPC", async () => {
  const calls = [];
  await assert.rejects(
    () => registerInferenceRecord(fakeRpcClient(calls), {
      subjectId: null, claimText: "", statusToken: "HYPOTHESIS", confidence: 0.5, citedItemIds: [],
      originClass: "derived", methodId: "infer-from-question", methodVersion: "v1", computedBy: "x",
    }),
    /invalid input/,
  );
  assert.equal(calls.length, 0);
});

test("registerInferenceRecord: calls register_inference_record with the full param shape, returns the new id", async () => {
  const calls = [];
  const id = await registerInferenceRecord(fakeRpcClient(calls), {
    subjectId: "cl:instr:abc", claimText: "a claim", statusToken: "HYPOTHESIS", confidence: 0.5,
    citedItemIds: ["item-a"], originClass: "derived", methodId: "infer-from-question", methodVersion: "v1",
    computedBy: "infer-from-question@v1", triggerQuestionRef: "item-1:regulations:what",
    inputs: [{ table: "derived_values", pk: "dv-1" }], supersedes: "inf-1",
  });
  assert.equal(id, "new-inference-id");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fn, "register_inference_record");
  assert.equal(calls[0].args.p_subject_id, "cl:instr:abc");
  assert.equal(calls[0].args.p_status_token, "HYPOTHESIS");
  assert.deepEqual(calls[0].args.p_cited_item_ids, ["item-a"]);
  assert.equal(calls[0].args.p_trigger_question_ref, "item-1:regulations:what");
  assert.deepEqual(calls[0].args.p_inputs, [{ table: "derived_values", pk: "dv-1" }]);
  assert.equal(calls[0].args.p_supersedes, "inf-1");
});

test("registerInferenceRecord: surfaces the DB error rather than throwing an unrelated one, on an RPC failure", async () => {
  const calls = [];
  await assert.rejects(
    () => registerInferenceRecord(fakeRpcClient(calls, { data: null, error: { message: "constraint violated" } }), {
      subjectId: null, claimText: "a claim", statusToken: "HYPOTHESIS", confidence: 0.5, citedItemIds: ["item-a"],
      originClass: "derived", methodId: "infer-from-question", methodVersion: "v1", computedBy: "x",
    }),
    /constraint violated/,
  );
});
