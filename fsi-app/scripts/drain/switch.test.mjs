// switch.test.mjs: STEP 0's three-layer decision and its fail-closed reads (lane G6-DRAIN). No network: fetch is injected.
import test from "node:test";
import assert from "node:assert/strict";
import { decideDrainSwitch, readDrainSwitch } from "./switch.mjs";

const ok = (rows) => ({ ok: true, json: async () => rows });
const fetchFor = (map) => async (url) => {
  const key = Object.keys(map).find((k) => url.includes(k));
  const v = map[key];
  if (v instanceof Error) throw v;
  return v;
};
const CLEAN = { "system_state?": ok([{ judgement_drain: "on", global_processing_paused: false }]), "integrity_flags?": ok([]) };

test("decideDrainSwitch: on only when the switch is on, no emergency stop and no halt", () => {
  const s = decideDrainSwitch({ judgementDrain: "on", emergencyPaused: false, fleetHalted: false });
  assert.deepEqual([s.on, s.reason], [true, null]);
});

test("decideDrainSwitch: each layer halts alone, with its own reason", () => {
  assert.match(decideDrainSwitch({ judgementDrain: "off", emergencyPaused: false, fleetHalted: false }).reason, /judgement_drain is off/);
  assert.match(decideDrainSwitch({ judgementDrain: "on", emergencyPaused: true, fleetHalted: false }).reason, /emergency pause/);
  assert.match(decideDrainSwitch({ judgementDrain: "on", emergencyPaused: false, fleetHalted: true }).reason, /fleet-budget-halt is open/);
});

test("decideDrainSwitch: anything but a clean false halt value, and any value but 'on', is off (fail closed)", () => {
  for (const bad of [undefined, null, "false", 0]) assert.equal(decideDrainSwitch({ judgementDrain: "on", emergencyPaused: false, fleetHalted: bad }).on, false);
  for (const bad of [undefined, null, true, "ON", "maybe"]) assert.equal(decideDrainSwitch({ judgementDrain: bad, emergencyPaused: false, fleetHalted: false }).on, false);
});

test("readDrainSwitch: all clear reads on", async () => {
  const s = await readDrainSwitch("https://x.supabase.co", "k", fetchFor(CLEAN));
  assert.equal(s.on, true);
});

test("readDrainSwitch: an open fleet-budget-halt row halts a drain whose switch is on", async () => {
  const s = await readDrainSwitch("https://x.supabase.co", "k", fetchFor({ ...CLEAN, "integrity_flags?": ok([{ id: "h" }]) }));
  assert.equal(s.on, false);
  assert.match(s.reason, /fleet-budget-halt is open/);
});

test("readDrainSwitch: the halt query is the runbook's (subject_ref, status open)", async () => {
  const seen = [];
  await readDrainSwitch("https://x.supabase.co", "k", async (url) => { seen.push(url); return ok([]); });
  assert.ok(seen.some((u) => /integrity_flags\?.*subject_ref=eq\.fleet-budget-halt.*status=eq\.open/.test(u)));
});

test("readDrainSwitch fails CLOSED: missing creds, a non-ok response and a thrown error all read off, never throw", async () => {
  assert.equal((await readDrainSwitch("", "k", fetchFor(CLEAN))).on, false);
  assert.equal((await readDrainSwitch("https://x", "", fetchFor(CLEAN))).on, false);
  const missingColumn = await readDrainSwitch("https://x", "k", fetchFor({ ...CLEAN, "system_state?": { ok: false, json: async () => [] } }));
  assert.equal(missingColumn.on, false);
  assert.equal(missingColumn.judgementDrain, "off");
  assert.equal((await readDrainSwitch("https://x", "k", fetchFor({ ...CLEAN, "integrity_flags?": new Error("net") }))).on, false);
});
