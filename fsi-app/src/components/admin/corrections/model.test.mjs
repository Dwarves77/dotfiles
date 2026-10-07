// Tests for the admin corrections screen's pure core (lane G7-UI, 2026-10-06): every action posts the contract's
// request shape through a STUBBED fetch and carries the reason, the API's own refusal text is shown (never a
// generic error), revoke needs a confirmed reason, and a non-admin never reaches a read.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCorrectionBody, valueFor, postCorrection, postRevoke, fetchItemCorrections, loadItemScreen,
  stateOf, filterCorrections, countByState, describeCorrection, activeFor, machineValueOf, ORPHAN_EXPLANATION,
} from "./model.mjs";

const ITEM = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const CLAIM = "33333333-3333-4333-8333-333333333333";
const CAPTURE = "44444444-4444-4444-8444-444444444444";
const CID = "55555555-5555-4555-8555-555555555555";

/** A stub fetcher that records each call and answers with a canned response. */
function stub(status, body) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fetcher, calls };
}

const ACTIONS = [
  { name: "suppress a fact", d: { kind: "fact", op: "suppress", ref: CLAIM, reason: "Wrong figure" }, want: { target_kind: "fact", target_ref: CLAIM, op: "suppress" } },
  {
    name: "replace a fact",
    d: { kind: "fact", op: "replace", ref: CLAIM, reason: "Source says 12", value: valueFor("fact", "replace", { source_span: " twelve days ", search_result_id: CAPTURE, claim_text: " Twelve days " }) },
    want: { target_kind: "fact", target_ref: CLAIM, op: "replace", value: { source_span: "twelve days", search_result_id: CAPTURE, claim_text: "Twelve days" } },
  },
  { name: "add a tag", d: { kind: "tag", op: "add", ref: "topic_tags:packaging", reason: "Missing" }, want: { target_kind: "tag", target_ref: "topic_tags:packaging", op: "add" } },
  { name: "remove a tag", d: { kind: "tag", op: "remove", ref: "compliance_object_tags:battery", reason: "Not relevant" }, want: { target_kind: "tag", target_ref: "compliance_object_tags:battery", op: "remove" } },
  {
    name: "add a connection",
    d: { kind: "connection", op: "add", ref: OTHER, reason: "Same scheme", value: valueFor("connection", "add", { relationship: "amends" }) },
    want: { target_kind: "connection", target_ref: OTHER, op: "add", value: { relationship: "amends" } },
  },
  { name: "remove a connection", d: { kind: "connection", op: "remove", ref: OTHER, reason: "Unrelated" }, want: { target_kind: "connection", target_ref: OTHER, op: "remove" } },
  {
    name: "replace section text",
    d: { kind: "section_text", op: "replace", ref: "what_changed", reason: "Typo", value: valueFor("section_text", "replace", { content_md: "New text" }) },
    want: { target_kind: "section_text", target_ref: "what_changed", op: "replace", value: { content_md: "New text" } },
  },
  {
    name: "replace the full brief",
    d: { kind: "full_brief", op: "replace", ref: "full_brief", reason: "Rewrite", value: valueFor("full_brief", "replace", { text: "Whole brief" }) },
    want: { target_kind: "full_brief", target_ref: "full_brief", op: "replace", value: { text: "Whole brief" } },
  },
];

for (const a of ACTIONS) {
  test(`posts the contract request shape with the reason: ${a.name}`, async () => {
    const { fetcher, calls } = stub(201, { id: CID, item_id: ITEM, applied: true });
    const out = await postCorrection(fetcher, ITEM, a.d);
    assert.equal(out.ok, true);
    assert.equal(out.id, CID);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `/api/admin/items/${ITEM}/corrections`);
    assert.equal(calls[0].init.method, "POST");
    const sent = JSON.parse(calls[0].init.body);
    assert.deepEqual(sent, { ...a.want, reason: a.d.reason });
    assert.equal("created_by" in sent, false, "created_by is never sent; the API takes the session user");
  });
}

test("a missing or blank reason never leaves the browser, for every action", async () => {
  for (const a of ACTIONS) {
    for (const reason of ["", "   ", undefined]) {
      const { fetcher, calls } = stub(201, {});
      const out = await postCorrection(fetcher, ITEM, { ...a.d, reason });
      assert.equal(out.ok, false, a.name);
      assert.equal(out.code, "reason_required");
      assert.match(out.message, /reason is required/i);
      assert.equal(calls.length, 0, `${a.name}: no request without a reason`);
    }
  }
});

test("a fact replace without a span is refused in the browser with a plain message", () => {
  const r = buildCorrectionBody({ kind: "fact", op: "replace", ref: CLAIM, reason: "x", value: valueFor("fact", "replace", { claim_text: "x" }) });
  assert.equal(r.ok, false);
  assert.equal(r.code, "fact_needs_span");
  assert.match(r.message, /source span/);
});

test("a non-verbatim span shows the API's own refusal message, not a generic error", async () => {
  const apiMessage = "the source span is not verbatim in the held capture";
  const { fetcher } = stub(422, { error: apiMessage, code: "fact_span_not_verbatim" });
  const out = await postCorrection(fetcher, ITEM, ACTIONS[1].d);
  assert.equal(out.ok, false);
  assert.equal(out.status, 422);
  assert.equal(out.code, "fact_span_not_verbatim");
  assert.equal(out.message, apiMessage);
});

test("a network failure keeps the input and says so", async () => {
  const out = await postCorrection(async () => { throw new Error("offline"); }, ITEM, ACTIONS[0].d);
  assert.equal(out.ok, false);
  assert.equal(out.code, "network");
  assert.match(out.message, /input is kept/);
});

test("revoke posts to the revoke route with the reason, and requires one", async () => {
  const { fetcher, calls } = stub(200, { id: CID, item_id: ITEM, revoked: true });
  const out = await postRevoke(fetcher, ITEM, CID, "  Admin changed their mind ");
  assert.equal(out.ok, true);
  assert.equal(calls[0].url, `/api/admin/items/${ITEM}/corrections/${CID}/revoke`);
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), { reason: "Admin changed their mind" });

  const none = stub(200, {});
  const refused = await postRevoke(none.fetcher, ITEM, CID, "  ");
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "reason_required");
  assert.equal(none.calls.length, 0);
});

test("revoke surfaces the API's 409 message", async () => {
  const { fetcher } = stub(409, { error: "correction is not active", code: "correction_not_active" });
  const out = await postRevoke(fetcher, ITEM, CID, "why");
  assert.equal(out.ok, false);
  assert.equal(out.message, "correction is not active");
});

test("fetchItemCorrections reads the list route and returns its rows", async () => {
  const rows = [{ id: CID, target_kind: "tag", op: "add", active: true }];
  const { fetcher, calls } = stub(200, { item_id: ITEM, counts: { active: 1, revoked: 0, orphaned: 0 }, corrections: rows });
  const out = await fetchItemCorrections(fetcher, ITEM);
  assert.equal(calls[0].url, `/api/admin/items/${ITEM}/corrections`);
  assert.equal(calls[0].init, undefined);
  assert.equal(out.ok, true);
  assert.deepEqual(out.corrections, rows);
  const bad = await fetchItemCorrections(stub(403, { error: "Platform admin access required" }).fetcher, ITEM);
  assert.equal(bad.ok, false);
  assert.equal(bad.message, "Platform admin access required");
});

test("state, filters and counts: active, revoked and orphaned are told apart", () => {
  const rows = [
    { id: "a", target_kind: "fact", active: true, orphaned: false, revoked_at: null },
    { id: "b", target_kind: "fact", active: true, orphaned: true, revoked_at: null },
    { id: "c", target_kind: "tag", active: false, orphaned: false, revoked_at: "2026-10-06T00:00:00Z" },
    { id: "d", target_kind: "tag", active: true, orphaned: false, revoked_at: null },
  ];
  assert.deepEqual(rows.map(stateOf), ["active", "orphaned", "revoked", "active"]);
  assert.deepEqual(countByState(rows), { active: 2, revoked: 1, orphaned: 1 });
  assert.deepEqual(filterCorrections(rows, { state: "orphaned" }).map((r) => r.id), ["b"]);
  assert.deepEqual(filterCorrections(rows, { kind: "tag" }).map((r) => r.id), ["c", "d"]);
  assert.deepEqual(filterCorrections(rows, { state: "active", kind: "tag" }).map((r) => r.id), ["d"]);
  assert.equal(filterCorrections(rows, {}).length, 4);
});

test("activeFor picks the newest live correction; machineValueOf prefers what a writer last tried", () => {
  const rows = [
    { id: "old", target_kind: "tag", target_ref: "topic_tags:x", active: false, revoked_at: "x", created_at: "2026-10-01T00:00:00Z" },
    { id: "mid", target_kind: "tag", target_ref: "topic_tags:x", active: true, superseded: true, created_at: "2026-10-02T00:00:00Z" },
    { id: "new", target_kind: "tag", target_ref: "topic_tags:x", active: true, superseded: false, created_at: "2026-10-03T00:00:00Z" },
  ];
  assert.equal(activeFor(rows, "tag", "topic_tags:x").id, "new");
  assert.equal(activeFor(rows, "tag", "topic_tags:y"), null);
  assert.deepEqual(machineValueOf({ latest_machine_value: { a: 1 }, machine_value: { a: 0 } }), { a: 1 });
  assert.deepEqual(machineValueOf({ latest_machine_value: null, machine_value: { a: 0 } }), { a: 0 });
});

test("text is plain: no dash glyphs, no internal slugs in the labels or sentences", () => {
  const samples = [
    ORPHAN_EXPLANATION,
    describeCorrection({ target_kind: "fact", op: "suppress" }),
    describeCorrection({ target_kind: "fact", op: "replace" }),
    describeCorrection({ target_kind: "tag", op: "add", target_ref: "topic_tags:packaging" }),
    describeCorrection({ target_kind: "connection", op: "remove" }),
    describeCorrection({ target_kind: "section_text", op: "replace" }),
    describeCorrection({ target_kind: "full_brief", op: "replace" }),
  ];
  for (const s of samples) {
    assert.equal(/[\u2013\u2014]/.test(s), false, s);
    assert.equal(/_/.test(s), false, `internal slug in: ${s}`);
  }
});

test("a non-admin never reaches a read: the gate runs first and a refusal means the loader is never called", async () => {
  let loaded = 0;
  const refusal = new Error("NEXT_REDIRECT");
  await assert.rejects(
    loadItemScreen({ requireAdmin: async () => { throw refusal; }, load: async () => { loaded += 1; return {}; } }),
    /NEXT_REDIRECT/,
  );
  assert.equal(loaded, 0);
  const order = [];
  const out = await loadItemScreen({
    requireAdmin: async () => { order.push("gate"); },
    load: async () => { order.push("load"); return { ok: 1 }; },
  });
  assert.deepEqual(order, ["gate", "load"]);
  assert.deepEqual(out, { ok: 1 });
});
