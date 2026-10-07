// Tests for the screen's two reads (lane G7-UI, 2026-10-06), on a fake PostgREST client: the tab's list of every
// correction with orphaned taken from the contract's per-item route, and the item screen's current target values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAllCorrections, MAX_ORPHAN_CHECKS } from "./load-all.mjs";
import { loadItemTargets } from "./load-item-targets.mjs";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

/** A fake client: tables are arrays; supports select/eq/in/order/range/maybeSingle and awaiting the chain. */
function fakeClient(tables) {
  return {
    from(name) {
      let rows = [...(tables[name] ?? [])];
      let single = false;
      const q = {
        select: () => q,
        eq: (c, v) => { rows = rows.filter((r) => r[c] === v); return q; },
        in: (c, vs) => { rows = rows.filter((r) => vs.includes(r[c])); return q; },
        order: () => q,
        range: (from, to) => { rows = rows.slice(from, to + 1); return q; },
        maybeSingle: () => { single = true; return q; },
        then: (res, rej) => Promise.resolve({ data: single ? (rows[0] ?? null) : rows, error: null }).then(res, rej),
      };
      return q;
    },
  };
}

const corr = (id, item, kind, over = {}) => ({ id, item_id: item, target_kind: kind, target_ref: `${id}-ref`, op: "suppress", reason: "r", created_at: `2026-10-0${id}T00:00:00Z`, revoked_at: null, ...over });

test("the tab lists every correction with titles and takes orphaned from the per-item route", async () => {
  const sb = fakeClient({
    item_corrections: [corr("1", A, "fact"), corr("2", B, "tag", { op: "add" }), corr("3", A, "fact", { revoked_at: "2026-10-05T00:00:00Z" })],
    intelligence_items: [{ id: A, title: "Item A" }, { id: B, title: "Item B" }],
  });
  const asked = [];
  const fetcher = async (url) => {
    asked.push(url);
    return { ok: true, status: 200, json: async () => ({ corrections: [{ id: "1", orphaned: true }] }) };
  };
  const { rows, unchecked } = await loadAllCorrections(sb, fetcher);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.id), ["3", "2", "1"], "newest first");
  assert.equal(rows.find((r) => r.id === "1").orphaned, true);
  assert.equal(rows.find((r) => r.id === "1").item_title, "Item A");
  assert.equal(rows.find((r) => r.id === "3").active, false);
  assert.deepEqual(asked, [`/api/admin/items/${A}/corrections`], "only the item with an active fact correction is asked");
  assert.equal(unchecked, 0);
});

test("a failed orphan check is counted, not hidden, and the list still loads", async () => {
  const sb = fakeClient({ item_corrections: [corr("1", A, "fact")], intelligence_items: [{ id: A, title: "Item A" }] });
  const { rows, unchecked } = await loadAllCorrections(sb, async () => ({ ok: false, status: 429, json: async () => ({ error: "Rate limit exceeded" }) }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].orphaned, false);
  assert.equal(unchecked, 1);
});

test("items over the orphan check cap are reported as unchecked", async () => {
  const n = MAX_ORPHAN_CHECKS + 3;
  const ids = Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  const sb = fakeClient({ item_corrections: ids.map((id, i) => corr(String(i), id, "fact")), intelligence_items: [] });
  let calls = 0;
  const { unchecked } = await loadAllCorrections(sb, async () => { calls += 1; return { ok: true, status: 200, json: async () => ({ corrections: [] }) }; });
  assert.equal(calls, MAX_ORPHAN_CHECKS);
  assert.equal(unchecked, 3);
});

test("the item screen reads current values: facts only, both edge directions, sorted sections", async () => {
  const sb = fakeClient({
    intelligence_items: [
      { id: A, title: "Item A", full_brief: "Brief", topic_tags: ["packaging"], operational_scenario_tags: null, compliance_object_tags: [] },
      { id: B, title: "Item B" },
    ],
    intelligence_item_sections: [
      { id: "s2", item_id: A, section_key: "second", section_order: 2, content_md: "two" },
      { id: "s1", item_id: A, section_key: "first", section_order: 1, content_md: "one" },
    ],
    section_claim_provenance: [
      { id: "c1", intelligence_item_id: A, claim_kind: "FACT", claim_text: "A fact", source_span: "span", section_row_id: "s1" },
      { id: "c2", intelligence_item_id: A, claim_kind: "ANALYSIS", claim_text: "Not a fact", source_span: null, section_row_id: "s1" },
    ],
    item_cross_references: [{ id: "e1", source_item_id: A, target_item_id: B, relationship: "amends" }],
  });
  const t = await loadItemTargets(sb, A);
  assert.equal(t.title, "Item A");
  assert.deepEqual(t.tags, { topic_tags: ["packaging"], operational_scenario_tags: [], compliance_object_tags: [] });
  assert.deepEqual(t.facts.map((f) => f.id), ["c1"]);
  assert.deepEqual(t.sections.map((s) => s.section_key), ["first", "second"]);
  assert.deepEqual(t.connections, [{ other_item_id: B, other_title: "Item B", relationship: "amends" }]);
  assert.equal(await loadItemTargets(sb, "99999999-9999-4999-8999-999999999999"), null);
});
