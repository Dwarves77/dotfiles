// Run: node --test src/lib/health/gate-a-gauges.test.mjs -- no DB, no network (fake client).
// Lane OPS-1 (F-RED-2): a Gate A gauge is never a bare null; the probe fails only on unreadable or a
// computed alarm above 0, passes on not_computed with a warning naming the age.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GAUGE_NAMES, ALARM_GAUGES, shapeGateAHealth, readGateAHealth, decideGateAProbe,
} from "./gate-a-gauges.mjs";
import { runProbe } from "../../../scripts/health/gate-a-probe.mjs";

const NOW = new Date("2026-10-07T12:00:00Z");
const FRESH = {
  invariant_violations: 0, briefless_verified: 0, no_gatestate_verified: 0,
  verified_failing_revalidation: 0, verified_gen_ver_null_info: 7, computed_at: "2026-10-07T11:50:00Z",
};
const fake = (result) => ({ rpc: async (name) => { assert.equal(name, "gate_a_health"); if (result instanceof Error) throw result; return result; } });

test("endpoint shape: every gauge is an object with value/state/computed_at/reason, never null", async () => {
  const cases = [
    { data: FRESH, error: null },
    { data: { error: "gate_a_health cache stale since 2026-10-07 09:00:00+00" }, error: null },
    { data: { error: "gate_a_health cache empty; refresh has never run" }, error: null },
    { data: null, error: { message: "boom" } },
    new Error("network down"),
  ];
  for (const c of cases) {
    const g = await readGateAHealth(fake(c), NOW);
    assert.deepEqual(Object.keys(g), [...GAUGE_NAMES]);
    for (const n of GAUGE_NAMES) {
      assert.equal(typeof g[n], "object");
      assert.notEqual(g[n], null);
      assert.deepEqual(Object.keys(g[n]).sort(), ["computed_at", "reason", "state", "value"]);
      assert.ok(["computed", "not_computed", "unreadable"].includes(g[n].state));
    }
  }
});

test("fresh cache: computed with numeric values and computed_at", () => {
  const g = shapeGateAHealth({ data: FRESH, now: NOW });
  assert.deepEqual(g.briefless_verified, { value: 0, state: "computed", computed_at: FRESH.computed_at, reason: null });
  assert.equal(g.verified_gen_ver_null_info.value, 7);
});

test("stale cache: not_computed, value null, reason names the age and the TTL", () => {
  const g = shapeGateAHealth({ data: { error: "gate_a_health cache stale since 2026-10-07 09:00:00+00" }, now: NOW });
  assert.equal(g.invariant_violations.state, "not_computed");
  assert.equal(g.invariant_violations.value, null);
  assert.match(g.invariant_violations.reason, /age 3 hours|age 180 minutes|age \d+ (hours|minutes)/);
  assert.match(g.invariant_violations.reason, /TTL 30 minutes/);
});

test("empty cache: not_computed", () => {
  const g = shapeGateAHealth({ data: { error: "gate_a_health cache empty; refresh has never run" }, now: NOW });
  assert.equal(g.no_gatestate_verified.state, "not_computed");
});

test("rpc error, thrown error, unknown error text, non-object: all unreadable", () => {
  assert.equal(shapeGateAHealth({ error: { message: "x" } }).briefless_verified.state, "unreadable");
  assert.equal(shapeGateAHealth({ thrown: "x" }).briefless_verified.state, "unreadable");
  assert.equal(shapeGateAHealth({ data: { error: "permission denied" } }).briefless_verified.state, "unreadable");
  assert.equal(shapeGateAHealth({ data: null }).briefless_verified.state, "unreadable");
  assert.equal(shapeGateAHealth({ data: [1] }).briefless_verified.state, "unreadable");
});

test("a malformed gauge in an otherwise fresh payload is unreadable for that gauge only", () => {
  const g = shapeGateAHealth({ data: { ...FRESH, briefless_verified: "3", no_gatestate_verified: -1 }, now: NOW });
  assert.equal(g.briefless_verified.state, "unreadable");
  assert.equal(g.no_gatestate_verified.state, "unreadable");
  assert.equal(g.invariant_violations.state, "computed");
});

test("probe: all computed zero passes", () => {
  const r = decideGateAProbe(shapeGateAHealth({ data: FRESH, now: NOW }));
  assert.equal(r.fail, false);
  assert.ok(r.lines.every((l) => l.startsWith("ok ")));
});

test("probe: not_computed passes with a warning line naming the age", () => {
  const r = decideGateAProbe(shapeGateAHealth({ data: { error: "gate_a_health cache stale since 2026-10-07 09:00:00+00" }, now: NOW }));
  assert.equal(r.fail, false);
  assert.ok(r.lines.some((l) => l.startsWith("WARNING gate_a.invariant_violations state=not_computed") && /age \d+ (hours|minutes)/.test(l)));
  assert.ok(r.lines.some((l) => /4 of 4 Gate A alarms are not_computed/.test(l)));
});

test("ATTACK: a truly unreadable gauge still fails the probe", () => {
  for (const shaped of [
    shapeGateAHealth({ error: { message: "db down" } }),
    shapeGateAHealth({ thrown: "timeout" }),
    shapeGateAHealth({ data: { ...FRESH, verified_failing_revalidation: null }, now: NOW }),
  ]) {
    const r = decideGateAProbe(shaped);
    assert.equal(r.fail, true);
    assert.ok(r.lines.some((l) => l.includes("state=unreadable") || l.includes("fail-closed")));
  }
});

test("ATTACK: one unreadable gauge among not_computed ones fails; a computed alarm above 0 fails", () => {
  const g = shapeGateAHealth({ data: { error: "gate_a_health cache empty; refresh has never run" }, now: NOW });
  g.briefless_verified = { value: null, state: "unreadable", computed_at: null, reason: "x" };
  assert.equal(decideGateAProbe(g).fail, true);
  const alarm = shapeGateAHealth({ data: { ...FRESH, invariant_violations: 2 }, now: NOW });
  const r = decideGateAProbe(alarm);
  assert.equal(r.fail, true);
  assert.ok(r.lines.some((l) => l.includes("ALARM value=2")));
});

test("ATTACK: the old bare-null / bare-number shape and a missing gate_a object fail closed", () => {
  assert.equal(decideGateAProbe({ invariant_violations: null, briefless_verified: 0 }).fail, true);
  assert.equal(decideGateAProbe(undefined).fail, true);
  assert.equal(decideGateAProbe({}).fail, true);
  const lie = Object.fromEntries(GAUGE_NAMES.map((n) => [n, { value: "0", state: "computed", computed_at: "t", reason: null }]));
  assert.equal(decideGateAProbe(lie).fail, true);
});

test("probe script end to end: exit codes over a response file", () => {
  const dir = mkdtempSync(join(tmpdir(), "gate-a-probe-"));
  const write = (name, body) => { const f = join(dir, name); writeFileSync(f, JSON.stringify(body)); return f; };
  const quiet = () => {};
  assert.equal(runProbe(write("ok.json", { gate_a: shapeGateAHealth({ data: FRESH, now: NOW }) }), quiet), 0);
  assert.equal(runProbe(write("nc.json", { gate_a: shapeGateAHealth({ data: { error: "gate_a_health cache empty; refresh has never run" } }) }), quiet), 0);
  assert.equal(runProbe(write("bad.json", { gate_a: shapeGateAHealth({ error: { message: "x" } }) }), quiet), 1);
  assert.equal(runProbe(join(dir, "missing.json"), quiet), 1);
  assert.equal(ALARM_GAUGES.length, 4);
});
