// register-derivation.test.mjs — proves registerDerivedValue()'s validation and its RPC call shape against
// a hand-rolled fake client (no real database, no supabase-js — see register-derivation.ts's own header on
// why this module has zero npm dependencies at module scope). Pure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerDerivedValue, validateRegisterDerivedValueInput } from "./register-derivation.ts";

function validInput(overrides = {}) {
  return {
    entityId: null,
    methodId: "m",
    methodVersion: "1",
    value: 42,
    derivation: "calculated",
    originClass: "derived",
    lifecycle: "verified",
    admissibility: "analysis_ok",
    confidence: 0.8,
    assertedAt: "2026-09-02T00:00:00Z",
    inputs: [{ table: "emission_factors", pk: "ef-1" }],
    computedBy: "m@1",
    ...overrides,
  };
}

function fakeClient(handler) {
  return {
    calls: [],
    rpc(fn, args) {
      this.calls.push({ fn, args });
      return Promise.resolve(handler ? handler(fn, args) : { data: "22222222-2222-2222-2222-222222222222", error: null });
    },
  };
}

test("validateRegisterDerivedValueInput: a fully-formed input has no problems", () => {
  assert.deepEqual(validateRegisterDerivedValueInput(validInput()), []);
});

test("validateRegisterDerivedValueInput RED: missing required string fields are all named", () => {
  const problems = validateRegisterDerivedValueInput(validInput({ methodId: "", computedBy: "" }));
  assert.ok(problems.some((p) => p.includes("methodId")));
  assert.ok(problems.some((p) => p.includes("computedBy")));
});

test("validateRegisterDerivedValueInput RED: confidence out of [0,1] is refused", () => {
  assert.ok(validateRegisterDerivedValueInput(validInput({ confidence: 1.5 })).length > 0);
  assert.ok(validateRegisterDerivedValueInput(validInput({ confidence: -0.1 })).length > 0);
  assert.ok(validateRegisterDerivedValueInput(validInput({ confidence: NaN })).length > 0);
});

test("validateRegisterDerivedValueInput RED: an unparseable assertedAt is refused", () => {
  assert.ok(validateRegisterDerivedValueInput(validInput({ assertedAt: "not-a-date" })).length > 0);
});

test("validateRegisterDerivedValueInput: a Date object for assertedAt is accepted", () => {
  assert.deepEqual(validateRegisterDerivedValueInput(validInput({ assertedAt: new Date() })), []);
});

test("validateRegisterDerivedValueInput RED: a non-positive halfLifeDays is refused (null/undefined means no decay, not zero)", () => {
  assert.ok(validateRegisterDerivedValueInput(validInput({ halfLifeDays: 0 })).length > 0);
  assert.ok(validateRegisterDerivedValueInput(validInput({ halfLifeDays: -5 })).length > 0);
  assert.deepEqual(validateRegisterDerivedValueInput(validInput({ halfLifeDays: null })), []);
});

test("validateRegisterDerivedValueInput RED: an inputs entry missing table/pk is named per-index", () => {
  const problems = validateRegisterDerivedValueInput(validInput({ inputs: [{ table: "", pk: "x" }] }));
  assert.ok(problems.some((p) => p.includes("inputs[0].table")));
});

test("validateRegisterDerivedValueInput: an empty inputs array is valid (a value with no declared inputs)", () => {
  assert.deepEqual(validateRegisterDerivedValueInput(validInput({ inputs: [] })), []);
});

test("registerDerivedValue: calls register_derived_value with every field mapped to its p_ name", async () => {
  const sb = fakeClient();
  const id = await registerDerivedValue(sb, validInput());
  assert.equal(sb.calls.length, 1);
  assert.equal(sb.calls[0].fn, "register_derived_value");
  const args = sb.calls[0].args;
  assert.equal(args.p_method_id, "m");
  assert.equal(args.p_method_version, "1");
  assert.equal(args.p_value, 42);
  assert.equal(args.p_derivation, "calculated");
  assert.equal(args.p_origin_class, "derived");
  assert.equal(args.p_lifecycle, "verified");
  assert.equal(args.p_admissibility, "analysis_ok");
  assert.equal(args.p_base_confidence, 0.8);
  assert.equal(args.p_asserted_at, "2026-09-02T00:00:00Z");
  assert.equal(args.p_computed_by, "m@1");
  assert.deepEqual(args.p_inputs, [{ table: "emission_factors", pk: "ef-1" }]);
  assert.equal(args.p_supersedes, null);
  assert.equal(id, "22222222-2222-2222-2222-222222222222");
});

test("registerDerivedValue: a Date assertedAt is serialised to ISO before the RPC call", async () => {
  const sb = fakeClient();
  const d = new Date("2026-01-01T00:00:00.000Z");
  await registerDerivedValue(sb, validInput({ assertedAt: d }));
  assert.equal(sb.calls[0].args.p_asserted_at, d.toISOString());
});

test("registerDerivedValue: supersedes is passed through when provided (drain.ts's recompute path)", async () => {
  const sb = fakeClient();
  await registerDerivedValue(sb, validInput({ supersedes: "11111111-1111-1111-1111-111111111111" }));
  assert.equal(sb.calls[0].args.p_supersedes, "11111111-1111-1111-1111-111111111111");
});

test("registerDerivedValue RED: invalid input throws BEFORE any RPC call is made", async () => {
  const sb = fakeClient();
  await assert.rejects(() => registerDerivedValue(sb, validInput({ methodId: "" })), /invalid input/);
  assert.equal(sb.calls.length, 0);
});

test("registerDerivedValue RED: an RPC error is surfaced as a thrown Error naming the failure", async () => {
  const sb = fakeClient(() => ({ data: null, error: { message: "derivation cycle detected" } }));
  await assert.rejects(() => registerDerivedValue(sb, validInput()), /derivation cycle detected/);
});
