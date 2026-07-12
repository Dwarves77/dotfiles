// @ts-check
// RED-THEN-GREEN for the generation pause gate — pause-is-prohibition / dormancy-is-schedule (RULED 2026-07-12).
//
// THE RED (live, before this fix): the manual-intake path (runIntakeCycle, F16 signed caller "manual-intake-run")
// MINTED eFTI 2020/1056 + waste 2024/1157 but its grounding HALTED at the old preflight — isGloballyPaused()
// returns true whenever cadence==='off', with no manual-caller exception. Two live T9 runs proved it: FLOW 2/8,
// $0 spent, both "workflow halted". A manual run could mint but never verify in the dormant state it was built for.
//
// THE GREEN (this file): evaluateGenerationPause splits the two states. The pair the ruling demands —
//   (a) the signed manual caller PASSES cadence-off (dormancy is a schedule, an operator-fired run is the bidding);
//   (b) the signed manual caller is BLOCKED under emergencyPaused (the operator's stop is inviolable — NO caller
//       identity overrides it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { evaluateGenerationPause } = await jiti.import("./pause.ts");

const MANUAL = "manual-intake-run";
const DORMANT = { cadence: "off", emergencyPaused: false };
const EMERGENCY = { cadence: "off", emergencyPaused: true };
const LIVE = { cadence: "weekly", emergencyPaused: false };

// ── (a) dormancy is a schedule: the signed manual caller PASSES cadence-off ──
test("GREEN: signed manual caller PASSES cadence-off (dormant)", () => {
  const r = evaluateGenerationPause(DORMANT, MANUAL);
  assert.equal(r.halt, false, "manual-intake-run must ground in the dormant state it was built for");
});

test("unit3-remediation is also a signed manual caller → passes cadence-off", () => {
  assert.equal(evaluateGenerationPause(DORMANT, "unit3-remediation").halt, false);
});

// ── (b) the operator's stop is inviolable: manual caller BLOCKED under emergencyPaused ──
test("RED-GUARD: signed manual caller BLOCKED under emergencyPaused (hard stop, no override)", () => {
  const r = evaluateGenerationPause(EMERGENCY, MANUAL);
  assert.equal(r.halt, true, "emergencyPaused is a HARD stop for ALL callers, including the manual caller");
  assert.match(r.reason, /hard stop for all callers/i);
});

test("emergencyPaused hard-stops the manual caller even when a cadence IS set", () => {
  assert.equal(evaluateGenerationPause({ cadence: "weekly", emergencyPaused: true }, MANUAL).halt, true);
});

// ── autonomous / unsigned callers stay gated by dormancy ──
test("autonomous (null caller) is BLOCKED under cadence-off", () => {
  assert.equal(evaluateGenerationPause(DORMANT, null).halt, true);
});

test("an unsigned caller is BLOCKED under cadence-off (identity must be an authorized signed caller)", () => {
  assert.equal(evaluateGenerationPause(DORMANT, "scheduled-worker").halt, true);
});

// ── everyone runs when a cadence is set and no emergency stop ──
test("cadence set + no emergency → every caller proceeds", () => {
  assert.equal(evaluateGenerationPause(LIVE, null).halt, false);
  assert.equal(evaluateGenerationPause(LIVE, MANUAL).halt, false);
});
