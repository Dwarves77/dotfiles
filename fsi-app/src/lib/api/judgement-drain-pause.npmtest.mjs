// @ts-check
// RED-THEN-GREEN for the judgement drain readers in pause.ts (migration 354, lane G6-DRAIN): every read
// fails CLOSED, the fleet-budget-halt row halts, and the halt reason names the first layer that stops it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { getJudgementDrain, isFleetBudgetHalted, judgementDrainHaltReason } = await jiti.import("./pause.ts");

/** Minimal supabase fake: tables map -> {data, error} (or a thrown error). */
function fake(tables) {
  return {
    from(name) {
      const t = tables[name];
      const chain = {
        select: () => chain, eq: () => chain, limit: () => chain,
        maybeSingle: async () => { if (t instanceof Error) throw t; return t; },
        then: (res, rej) => (t instanceof Error ? Promise.reject(t) : Promise.resolve(t)).then(res, rej),
      };
      return chain;
    },
  };
}

const state = (o) => ({ data: { scrape_cadence: "weekly", scrape_start_date: null, global_processing_paused: false, judgement_drain: "on", ...o }, error: null });

test("getJudgementDrain: on only when the column says on", async () => {
  assert.equal(await getJudgementDrain(fake({ system_state: state({}) })), "on");
  assert.equal(await getJudgementDrain(fake({ system_state: state({ judgement_drain: "off" }) })), "off");
});

test("getJudgementDrain fails CLOSED: read error, missing column, unknown value, thrown error all read off", async () => {
  assert.equal(await getJudgementDrain(fake({ system_state: { data: null, error: { message: "column does not exist" } } })), "off");
  assert.equal(await getJudgementDrain(fake({ system_state: { data: {}, error: null } })), "off");
  assert.equal(await getJudgementDrain(fake({ system_state: state({ judgement_drain: "maybe" }) })), "off");
  assert.equal(await getJudgementDrain(fake({ system_state: new Error("network") })), "off");
});

test("isFleetBudgetHalted: an open row halts, none does not", async () => {
  assert.equal(await isFleetBudgetHalted(fake({ integrity_flags: { data: [{ id: "x" }], error: null } })), true);
  assert.equal(await isFleetBudgetHalted(fake({ integrity_flags: { data: [], error: null } })), false);
});

test("isFleetBudgetHalted fails CLOSED: a read error or a throw reports a halt", async () => {
  assert.equal(await isFleetBudgetHalted(fake({ integrity_flags: { data: null, error: { message: "boom" } } })), true);
  assert.equal(await isFleetBudgetHalted(fake({ integrity_flags: new Error("network") })), true);
});

test("judgementDrainHaltReason: null only when the drain is on, no emergency stop, no fleet halt", async () => {
  const clear = { system_state: state({}), integrity_flags: { data: [], error: null } };
  assert.equal(await judgementDrainHaltReason(fake(clear)), null);
  assert.match(await judgementDrainHaltReason(fake({ ...clear, system_state: state({ judgement_drain: "off" }) })), /judgement_drain is off/);
  assert.match(await judgementDrainHaltReason(fake({ ...clear, integrity_flags: { data: [{ id: "h" }], error: null } })), /fleet-budget-halt/);
  assert.match(await judgementDrainHaltReason(fake({ ...clear, system_state: state({ global_processing_paused: true }) })), /emergency pause/);
});
