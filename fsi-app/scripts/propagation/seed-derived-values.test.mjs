// seed-derived-values.test.mjs, proves the carbon-intensity seed path's planning/counting logic and the write shape
// each sends, against hand-rolled fake clients (no real database — same posture as drain.test.mjs /
// register-derivation.test.mjs / superseded-notices.test.mjs). NOT wired into .discipline/run-test-suite.sh
// (scripts/propagation/ is not one of its covered globs today, and this lane's write set does not include
// that file) — a documented, known gap, not an oversight; see the lane's final report. Still runnable
// directly: `node --test scripts/propagation/seed-derived-values.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, seedCarbonIntensity } from "./seed-derived-values.mjs";

function fakeClient(tables, { rpcHandler } = {}) {
  return {
    calls: [],
    from(table) {
      const rows = tables[table] || [];
      const builder = {
        _filters: [],
        select() { return this; },
        eq(col, value) { this._filters.push((r) => r[col] === value); return this; },
        in(col, values) { this._filters.push((r) => values.includes(r[col])); return this; },
        order() { return this; },
        limit() { return this; },
        maybeSingle: async () => {
          const matched = rows.filter((r) => builder._filters.every((f) => f(r)));
          return { data: matched[0] ?? null, error: null };
        },
        then(onfulfilled) {
          const data = rows.filter((r) => this._filters.every((f) => f(r)));
          return Promise.resolve(onfulfilled({ data, error: null }));
        },
      };
      return builder;
    },
    rpc(fn, args) {
      this.calls.push({ fn, args });
      return Promise.resolve(rpcHandler ? rpcHandler(fn, args) : { data: "11111111-1111-1111-1111-111111111111", error: null });
    },
  };
}

// ── parseArgs ────────────────────────────────────────────────────────────────────────────────────────

test("parseArgs: --dry alone selects dry mode", () => {
  assert.deepEqual(parseArgs(["--dry"]), { ok: true, mode: "dry" });
});
test("parseArgs: --apply alone selects apply mode", () => {
  assert.deepEqual(parseArgs(["--apply"]), { ok: true, mode: "apply" });
});
test("parseArgs RED: neither flag is an error", () => {
  const r = parseArgs([]);
  assert.equal(r.ok, false);
});
test("parseArgs RED: both flags together is an error", () => {
  const r = parseArgs(["--dry", "--apply"]);
  assert.equal(r.ok, false);
});

// ── seedCarbonIntensity ──────────────────────────────────────────────────────────────────────────────

const EMBEDDABLE_FACTOR = {
  factor_id: "f-1", quantity_basis: "tonne_km", ttw_co2e: 0.062, wtw_co2e: 0.074, wtt_co2e: 0.012,
  source_key: "desnz_ghg_factors", origin_class: "official", pedigree: 2,
};
const UNSUPPORTED_BASIS_FACTOR = { ...EMBEDDABLE_FACTOR, factor_id: "f-2", quantity_basis: "teu_km" };
const NON_EMBEDDABLE_FACTOR = { ...EMBEDDABLE_FACTOR, factor_id: "f-3", source_key: "iea" }; // IEA: redistribution prohibited

test("seedCarbonIntensity dry: counts wouldCreate for an embeddable, supported-basis factor, writes nothing", async () => {
  const sb = fakeClient({ emission_factors: [EMBEDDABLE_FACTOR] });
  const r = await seedCarbonIntensity(sb, "dry");
  assert.equal(r.total, 1);
  assert.equal(r.wouldCreate, 1);
  assert.equal(r.created, 0);
  assert.equal(sb.calls.length, 0, "dry mode issues no rpc calls");
});

test("seedCarbonIntensity: an unsupported quantity_basis is counted as refused, not created", async () => {
  const sb = fakeClient({ emission_factors: [UNSUPPORTED_BASIS_FACTOR] });
  const r = await seedCarbonIntensity(sb, "dry");
  assert.equal(r.refused, 1);
  assert.equal(r.wouldCreate, 0);
});

test("seedCarbonIntensity: a non-embeddable source is counted as licenceBlocked, never even evaluated", async () => {
  const sb = fakeClient({ emission_factors: [NON_EMBEDDABLE_FACTOR] });
  const r = await seedCarbonIntensity(sb, "dry");
  assert.equal(r.licenceBlocked, 1);
  assert.equal(r.wouldCreate, 0);
  assert.equal(r.refused, 0);
});

test("seedCarbonIntensity apply: calls registerDerivedValue's RPC once per created row, with the right method id/version", async () => {
  const sb = fakeClient({ emission_factors: [EMBEDDABLE_FACTOR] });
  const r = await seedCarbonIntensity(sb, "apply", () => "2026-09-02T00:00:00.000Z");
  assert.equal(r.created, 1);
  assert.equal(sb.calls.length, 1);
  assert.equal(sb.calls[0].fn, "register_derived_value");
  assert.equal(sb.calls[0].args.p_method_id, "carbon_intensity_tkm");
  assert.equal(sb.calls[0].args.p_method_version, "1.0.0");
  assert.equal(sb.calls[0].args.p_entity_id, null);
  assert.equal(sb.calls[0].args.p_value, 62); // 0.062 kg/tonne-km -> 62 g/tonne-km
});

test("seedCarbonIntensity apply: a failed RPC call is counted as failed with the reason, not thrown", async () => {
  const sb = fakeClient({ emission_factors: [EMBEDDABLE_FACTOR] }, { rpcHandler: () => ({ data: null, error: { message: "boom" } }) });
  const r = await seedCarbonIntensity(sb, "apply");
  assert.equal(r.failed, 1);
  assert.match(r.errors[0], /boom/);
});

test("seedCarbonIntensity: a read error yields a zeroed, error-carrying result rather than throwing", async () => {
  const sb = { from: () => ({ select() { return this; }, then(f) { return Promise.resolve(f({ data: null, error: { message: "db down" } })); } }) };
  const r = await seedCarbonIntensity(sb, "dry");
  assert.equal(r.total, 0);
  assert.match(r.errors[0], /db down/);
});
