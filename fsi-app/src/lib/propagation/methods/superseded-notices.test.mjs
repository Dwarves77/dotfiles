import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchSupersededNotices } from "./superseded-notices.ts";

function fakeClient(tables) {
  return {
    from(table) {
      const rows = tables[table] || [];
      const builder = {
        _filters: [],
        select() { return this; },
        in(col, values) {
          this._filters.push((r) => values.includes(r[col]));
          return this;
        },
        gte(col, value) {
          this._filters.push((r) => r[col] >= value);
          return this;
        },
        then(onfulfilled) {
          const data = rows.filter((r) => this._filters.every((f) => f(r)));
          return Promise.resolve(onfulfilled({ data, error: null }));
        },
      };
      return builder;
    },
  };
}

const OLD = {
  value_id: "old-1", entity_id: "cl:jurisdiction:1", method_id: "carbon_intensity_tkm", method_version: "1.0.0",
  value: 60, value_low: null, value_high: null, unit: "gCO2e/tonne-km", currency: null,
  supersedes: null, computed_at: "2026-08-01T00:00:00Z", invalidated_by_event: 42,
};
const NEW = {
  value_id: "new-1", entity_id: "cl:jurisdiction:1", method_id: "carbon_intensity_tkm", method_version: "1.0.0",
  value: 65, value_low: null, value_high: null, unit: "gCO2e/tonne-km", currency: null,
  supersedes: "old-1", computed_at: "2026-09-01T00:00:00Z", invalidated_by_event: null,
};
const EVENT = { event_id: 42, table_name: "emission_factors", row_pk: "f-1", change_kind: "update", occurred_at: "2026-08-31T00:00:00Z" };

test("returns [] for an empty entityIds list without querying", async () => {
  const sb = fakeClient({ derived_values: [OLD, NEW] });
  const notices = await fetchSupersededNotices(sb, [], "2026-01-01T00:00:00Z");
  assert.deepEqual(notices, []);
});

test("builds an old->new pair with the triggering event resolved from the OLD row's invalidated_by_event", async () => {
  const sb = fakeClient({ derived_values: [OLD, NEW], propagation_events: [EVENT] });
  const notices = await fetchSupersededNotices(sb, ["cl:jurisdiction:1"], "2026-01-01T00:00:00Z");
  assert.equal(notices.length, 1);
  const n = notices[0];
  assert.equal(n.entityId, "cl:jurisdiction:1");
  assert.equal(n.methodId, "carbon_intensity_tkm");
  assert.equal(n.oldValue, 60);
  assert.equal(n.newValue, 65);
  assert.equal(n.oldMethodVersion, "1.0.0");
  assert.equal(n.newMethodVersion, "1.0.0");
  assert.ok(n.triggeringEvent);
  assert.equal(n.triggeringEvent.table, "emission_factors");
  assert.equal(n.triggeringEvent.pk, "f-1");
});

test("respects the since filter — a supersede computed before sinceIso is excluded", async () => {
  const sb = fakeClient({ derived_values: [OLD, NEW], propagation_events: [EVENT] });
  const notices = await fetchSupersededNotices(sb, ["cl:jurisdiction:1"], "2026-09-02T00:00:00Z");
  assert.deepEqual(notices, []);
});

test("a NEW row with no resolvable OLD row is skipped, not half-rendered", async () => {
  const sb = fakeClient({ derived_values: [NEW] }); // OLD absent
  const notices = await fetchSupersededNotices(sb, ["cl:jurisdiction:1"], "2026-01-01T00:00:00Z");
  assert.deepEqual(notices, []);
});

test("triggeringEvent is null when invalidated_by_event does not resolve", async () => {
  const oldNoEvent = { ...OLD, invalidated_by_event: 999 };
  const sb = fakeClient({ derived_values: [oldNoEvent, NEW], propagation_events: [] });
  const notices = await fetchSupersededNotices(sb, ["cl:jurisdiction:1"], "2026-01-01T00:00:00Z");
  assert.equal(notices.length, 1);
  assert.equal(notices[0].triggeringEvent, null);
});

test("a query error on the NEW-rows read yields an empty list rather than throwing", async () => {
  const sb = { from: () => ({ select() { return this; }, in() { return this; }, gte() { return this; }, then(f) { return Promise.resolve(f({ data: null, error: { message: "boom" } })); } }) };
  const notices = await fetchSupersededNotices(sb, ["cl:jurisdiction:1"], "2026-01-01T00:00:00Z");
  assert.deepEqual(notices, []);
});
