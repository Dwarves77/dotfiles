// item-corrections.test.mjs , proves the read-side semantics of the correction layer (lane G7-CORR). The rules
// here mirror migration 356's SQL (latest active wins; a connection pair is tombstoned when the newest active
// connection correction in either direction is a remove). Portable: node: builtins and relative imports only.
import test from "node:test";
import assert from "node:assert/strict";
import {
  OPS_BY_KIND, activeCorrections, latestPerTarget, tombstonedPairKeys, isPairTombstoned, removedTagsFor,
  filterTagProposals, suppressedClaimMatcher, validateCorrectionInput, readItemCorrections, readAllCorrections, readConnectionCorrectionsFor, parseTagRef,
} from "./item-corrections.mjs";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const SR = "44444444-4444-4444-8444-444444444444";
let n = 0;
const corr = (over) => ({
  id: `c${String(++n).padStart(4, "0")}`, item_id: A, target_kind: "tag", target_ref: "topic_tags:x", op: "remove",
  value: null, machine_value: null, reason: "r", created_by: "u", created_at: `2026-10-0${1 + (n % 8)}T00:00:00Z`,
  revoked_at: null, revoked_by: null, ...over,
});

test("the kind/op matrix mirrors the migration CHECK", () => {
  assert.deepEqual(OPS_BY_KIND.fact, ["suppress", "replace"]);
  assert.deepEqual(OPS_BY_KIND.tag, ["add", "remove"]);
  assert.deepEqual(OPS_BY_KIND.connection, ["add", "remove"]);
  assert.deepEqual(OPS_BY_KIND.section_text, ["replace"]);
  assert.deepEqual(OPS_BY_KIND.full_brief, ["replace"]);
});

test("revoked corrections are not active; latestPerTarget takes the newest active per target", () => {
  const rows = [
    corr({ target_ref: "topic_tags:a", op: "remove", created_at: "2026-10-01T00:00:00Z" }),
    corr({ target_ref: "topic_tags:a", op: "add", created_at: "2026-10-02T00:00:00Z" }),
    corr({ target_ref: "topic_tags:a", op: "remove", created_at: "2026-10-03T00:00:00Z", revoked_at: "2026-10-04T00:00:00Z", revoked_by: "u" }),
  ];
  assert.equal(activeCorrections(rows).length, 2);
  const latest = latestPerTarget(rows);
  assert.equal(latest.size, 1);
  assert.equal([...latest.values()][0].op, "add", "the revoked newest remove is ignored; the active add is the latest");
});

test("tombstones: a remove tombstones the pair in BOTH directions; a newer add lifts it; a revoke lifts it", () => {
  const rm = corr({ target_kind: "connection", item_id: A, target_ref: B, op: "remove", created_at: "2026-10-01T00:00:00Z" });
  let t = tombstonedPairKeys([rm]);
  assert.equal(isPairTombstoned(t, A, B), true);
  assert.equal(isPairTombstoned(t, B, A), true, "the reverse direction is the same pair");
  assert.equal(isPairTombstoned(t, A, C), false);
  const add = corr({ target_kind: "connection", item_id: B, target_ref: A, op: "add", created_at: "2026-10-02T00:00:00Z" });
  t = tombstonedPairKeys([rm, add]);
  assert.equal(isPairTombstoned(t, A, B), false, "a newer add on the other direction wins");
  t = tombstonedPairKeys([{ ...rm, revoked_at: "2026-10-03T00:00:00Z", revoked_by: "u" }]);
  assert.equal(isPairTombstoned(t, A, B), false, "a revoked remove is no tombstone");
  assert.equal(isPairTombstoned(undefined, A, B), false);
});

test("removed tags are per item and per column; filterTagProposals blocks exactly those", () => {
  const rows = [
    corr({ item_id: A, target_ref: "topic_tags:carbon", op: "remove" }),
    corr({ item_id: A, target_ref: "operational_scenario_tags:air", op: "add" }),
    corr({ item_id: B, target_ref: "topic_tags:water", op: "remove" }),
  ];
  const removed = removedTagsFor(rows, A);
  assert.deepEqual([...removed.topic_tags], ["carbon"]);
  assert.equal(removed.operational_scenario_tags.size, 0, "an add is not a removal");
  const { kept, blocked } = filterTagProposals(
    [{ field: "topic_tags", tag: "carbon" }, { field: "topic_tags", tag: "water" }, { field: "operational_scenario_tags", tag: "air" }],
    removed,
  );
  assert.deepEqual(blocked.map((p) => p.tag), ["carbon"]);
  assert.deepEqual(kept.map((p) => p.tag), ["water", "air"], "item B's removal of water does not block item A");
  assert.deepEqual(parseTagRef("topic_tags:a:b"), { column: "topic_tags", tag: "a:b" });
  assert.equal(parseTagRef("nope:x"), null);
});

test("suppressedClaimMatcher: matches by id or by the captured machine claim_text; replace after suppress un-suppresses", () => {
  const sup = corr({ item_id: A, target_kind: "fact", target_ref: SR, op: "suppress", machine_value: { claim_text: "T1" }, created_at: "2026-10-01T00:00:00Z" });
  const m = suppressedClaimMatcher([sup], A);
  assert.equal(m({ id: SR, claim_text: "other" }), true, "by id");
  assert.equal(m({ id: "regenerated-id", claim_text: "T1" }), true, "by captured machine text after a regeneration");
  assert.equal(m({ id: "x", claim_text: "T2" }), false);
  assert.equal(suppressedClaimMatcher([sup], B)({ id: SR }), false, "another item's claim is untouched");
  const rep = corr({ item_id: A, target_kind: "fact", target_ref: SR, op: "replace", machine_value: { claim_text: "T1" }, created_at: "2026-10-02T00:00:00Z" });
  assert.equal(suppressedClaimMatcher([sup, rep], A)({ id: SR }), false, "the newer replace on the same claim wins");
  assert.equal(suppressedClaimMatcher([{ ...sup, revoked_at: "2026-10-05T00:00:00Z", revoked_by: "u" }], A)({ id: SR }), false, "a revoked suppress shows the claim again");
});

test("validateCorrectionInput: reason is mandatory, created_by is never read, the matrix and shapes are enforced", () => {
  const ok = validateCorrectionInput({ target_kind: "tag", target_ref: "topic_tags:carbon", op: "remove", reason: " too broad ", created_by: "forged" });
  assert.equal(ok.ok, true);
  assert.equal(ok.input.reason, "too broad");
  assert.equal("created_by" in ok.input, false, "the actor is never taken from the body");
  assert.equal(validateCorrectionInput({ target_kind: "tag", target_ref: "topic_tags:x", op: "remove" }).code, "reason_required");
  assert.equal(validateCorrectionInput({ target_kind: "tag", target_ref: "topic_tags:x", op: "remove", reason: "  " }).code, "reason_required");
  assert.equal(validateCorrectionInput({ target_kind: "nope", target_ref: "x", op: "add", reason: "r" }).code, "target_kind_invalid");
  assert.equal(validateCorrectionInput({ target_kind: "tag", target_ref: "topic_tags:x", op: "replace", reason: "r" }).code, "op_invalid");
  assert.equal(validateCorrectionInput({ target_kind: "fact", target_ref: "not-a-uuid", op: "suppress", reason: "r" }).code, "target_ref_invalid");
  assert.equal(validateCorrectionInput({ target_kind: "fact", target_ref: SR, op: "replace", reason: "r", value: { claim_text: "x" } }).code, "fact_needs_span");
  assert.equal(validateCorrectionInput({ target_kind: "fact", target_ref: SR, op: "replace", reason: "r", value: { source_span: "s", search_result_id: SR } }).ok, true);
  assert.equal(validateCorrectionInput({ target_kind: "full_brief", target_ref: "full_brief", op: "replace", reason: "r" }).code, "value_invalid");
  assert.equal(validateCorrectionInput({ target_kind: "connection", target_ref: B, op: "add", reason: "r", value: { relationship: "bogus" } }).code, "value_invalid");
});

test("reads: a read error throws (fail closed); readAllCorrections paginates", async () => {
  const bad = { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: null, error: { message: "boom" } }) }) }) };
  await assert.rejects(() => readItemCorrections(bad, A), /item_corrections read failed: boom/);
  const rows = [corr({}), corr({})];
  const sb = { from: () => ({ select() { return this; }, order() { return this; }, range(f) { return Promise.resolve({ data: f === 0 ? rows : [], error: null }); } }) };
  assert.equal((await readAllCorrections(sb)).length, 2);
});

test("readConnectionCorrectionsFor merges corrections recorded against the item and corrections naming it as the other end", async () => {
  const mine = corr({ item_id: A, target_kind: "connection", target_ref: B });
  const theirs = corr({ item_id: C, target_kind: "connection", target_ref: A });
  const tag = corr({ item_id: A, target_kind: "tag" });
  const sb = {
    from: () => {
      const f = [];
      const b = {
        select() { return b; },
        eq(c, v) { f.push([c, v]); return b; },
        then(res) { res({ data: [mine, theirs, tag].filter((r) => f.every(([c, v]) => r[c] === v)), error: null }); },
      };
      return b;
    },
  };
  const rows = await readConnectionCorrectionsFor(sb, A);
  assert.deepEqual(rows.map((r) => r.id).sort(), [mine.id, theirs.id].sort());
});
