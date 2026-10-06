// logic.test.mjs , the admin item-corrections API core (lane G7-CORR). Fake Supabase client, no network, no auth
// (the admin gate is proven in handlers.npmtest.mjs). Portable: node: builtins and relative imports only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listCorrections, createCorrection, revokeCorrection, mapDbError } from "./logic.mjs";

const ITEM = "11111111-1111-4111-8111-111111111111";
const CLAIM = "22222222-2222-4222-8222-222222222222";
const SR = "33333333-3333-4333-8333-333333333333";
const CID = "44444444-4444-4444-8444-444444444444";
const USER = "99999999-9999-4999-8999-999999999999";

function rpcClient(result = { data: CID, error: null }) {
  const calls = [];
  return { calls, rpc: async (name, args) => { calls.push({ name, args }); return result; } };
}

test("create: created_by comes from the session user, a forged body value is ignored (attack)", async () => {
  const sb = rpcClient();
  const r = await createCorrection(sb, {
    itemId: ITEM, userId: USER,
    body: { target_kind: "tag", target_ref: "topic_tags:carbon", op: "remove", reason: "too broad", created_by: "00000000-0000-4000-8000-000000000bad", p_created_by: "x" },
  });
  assert.equal(r.status, 201);
  assert.deepEqual(r.body, { id: CID, item_id: ITEM, applied: true });
  assert.equal(sb.calls.length, 1);
  assert.equal(sb.calls[0].name, "create_item_correction");
  assert.equal(sb.calls[0].args.p_created_by, USER);
  assert.equal(sb.calls[0].args.p_reason, "too broad");
});

test("create: a missing or blank reason is refused before the database is touched (attack)", async () => {
  for (const reason of [undefined, "", "   ", 42]) {
    const sb = rpcClient();
    const r = await createCorrection(sb, { itemId: ITEM, userId: USER, body: { target_kind: "tag", target_ref: "topic_tags:x", op: "remove", reason } });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "reason_required");
    assert.equal(sb.calls.length, 0);
  }
});

test("create: an op the kind does not allow, and a malformed ref, are refused with 400 and never reach the database", async () => {
  const sb = rpcClient();
  assert.equal((await createCorrection(sb, { itemId: ITEM, userId: USER, body: { target_kind: "tag", target_ref: "topic_tags:x", op: "replace", reason: "r" } })).body.code, "op_invalid");
  assert.equal((await createCorrection(sb, { itemId: ITEM, userId: USER, body: { target_kind: "fact", target_ref: "nope", op: "suppress", reason: "r" } })).body.code, "target_ref_invalid");
  assert.equal((await createCorrection(sb, { itemId: "not-a-uuid", userId: USER, body: {} })).body.code, "item_id_invalid");
  assert.equal(sb.calls.length, 0);
});

test("create: a fact replace whose span the database finds non-verbatim is refused with 422 fact_span_not_verbatim (attack)", async () => {
  const sb = rpcClient({ data: null, error: { message: "correction_fact_span_not_verbatim: the span is not verbatim in a held capture of item x (ADR-016, validate_item_provenance criterion 3)" } });
  const r = await createCorrection(sb, {
    itemId: ITEM, userId: USER,
    body: { target_kind: "fact", target_ref: CLAIM, op: "replace", reason: "fix figure", value: { source_span: "text that is not in the capture", search_result_id: SR } },
  });
  assert.equal(r.status, 422);
  assert.equal(r.body.code, "fact_span_not_verbatim");
  assert.match(r.body.error, /not verbatim/);
});

test("create: a fact replace without a span is refused up front (ADR-016), the database is never called", async () => {
  const sb = rpcClient();
  const r = await createCorrection(sb, { itemId: ITEM, userId: USER, body: { target_kind: "fact", target_ref: CLAIM, op: "replace", reason: "r", value: { claim_text: "new" } } });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, "fact_needs_span");
  assert.equal(sb.calls.length, 0);
});

test("mapDbError: not found is 404, not active is 409, a validation refusal is 422, anything else is 500", () => {
  assert.equal(mapDbError({ message: "correction_item_not_found: item x does not exist" }).status, 404);
  assert.equal(mapDbError({ message: "correction_claim_not_found: nope" }).status, 404);
  assert.equal(mapDbError({ message: "correction_not_active: no active correction" }).body.code, "correction_not_active");
  assert.equal(mapDbError({ message: "correction_not_active: no active correction" }).status, 409);
  assert.equal(mapDbError({ message: "correction_fact_failed_validation: rejected" }).status, 422);
  const other = mapDbError({ message: "connection reset" });
  assert.equal(other.status, 500);
  assert.equal(other.body.code, "database_error");
});

test("revoke: passes the session user as revoked_by and the optional reason; a stale id is a 409", async () => {
  const sb = rpcClient({ data: null, error: null });
  const r = await revokeCorrection(sb, { itemId: ITEM, correctionId: CID, userId: USER, body: { reason: " wrong call ", revoked_by: "forged" } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { id: CID, item_id: ITEM, revoked: true });
  assert.equal(sb.calls[0].name, "revoke_item_correction");
  assert.equal(sb.calls[0].args.p_revoked_by, USER);
  assert.equal(sb.calls[0].args.p_reason, "wrong call");
  const stale = await revokeCorrection(rpcClient({ data: null, error: { message: "correction_not_active: no active correction" } }), { itemId: ITEM, correctionId: CID, userId: USER, body: null });
  assert.equal(stale.status, 409);
  assert.equal((await revokeCorrection(sb, { itemId: ITEM, correctionId: "bad", userId: USER, body: null })).body.code, "correction_id_invalid");
});

function listClient({ item = { id: ITEM }, corrections = [], evidence = [] } = {}) {
  return {
    from(table) {
      const b = {
        select() { return b; },
        eq() { return b; },
        in() { return b; },
        maybeSingle: async () => ({ data: item, error: null }),
        then(res) { res({ data: table === "item_corrections" ? corrections : evidence, error: null }); },
      };
      return b;
    },
  };
}
const row = (id, ref, op, created_at, extra = {}) => ({ id, item_id: ITEM, target_kind: "tag", target_ref: ref, op, value: null, machine_value: ["a"], reason: "r", created_by: USER, created_at, revoked_at: null, revoked_by: null, ...extra });

test("list: newest first, active and superseded flags, machine evidence attached, counts", async () => {
  const corrections = [
    row("c1", "topic_tags:a", "remove", "2026-10-01T00:00:00Z"),
    row("c2", "topic_tags:a", "add", "2026-10-02T00:00:00Z"),
    row("c3", "topic_tags:b", "remove", "2026-10-03T00:00:00Z", { revoked_at: "2026-10-04T00:00:00Z", revoked_by: USER }),
  ];
  const evidence = [{ correction_id: "c2", latest_machine_value: ["x"], observed_count: 3, observed_at: "2026-10-05T00:00:00Z" }];
  const r = await listCorrections(listClient({ corrections, evidence }), ITEM);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.corrections.map((c) => c.id), ["c3", "c2", "c1"]);
  assert.deepEqual(r.body.counts, { active: 2, revoked: 1 });
  const byId = Object.fromEntries(r.body.corrections.map((c) => [c.id, c]));
  assert.equal(byId.c1.superseded, true, "the older remove is overridden by the newer add on the same tag");
  assert.equal(byId.c2.superseded, false);
  assert.equal(byId.c3.active, false);
  assert.deepEqual(byId.c2.latest_machine_value, ["x"]);
  assert.equal(byId.c2.machine_observed_count, 3);
  assert.equal(byId.c1.machine_observed_count, 0);
  assert.deepEqual(byId.c1.machine_value, ["a"], "the machine value captured at write is returned");
});

test("list: an unknown item is 404, a bad id is 400", async () => {
  assert.equal((await listCorrections(listClient({ item: null }), ITEM)).status, 404);
  assert.equal((await listCorrections(listClient(), "x")).status, 400);
});

test("the core never reads created_by from the body (static attack: a rewrite that does would match)", () => {
  const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "logic.mjs"), "utf8");
  const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.doesNotMatch(code, /body\??\.created_by|body\??\.revoked_by/);
});
