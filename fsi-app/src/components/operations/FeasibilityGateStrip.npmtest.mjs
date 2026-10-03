// Structural regression test for FeasibilityGateStrip.tsx (same convention as LabourChain.npmtest.mjs).
// The mount-and-measure proof is the UX smoke spec (.discipline/rendering/smoke/feasibility-gate-strip-smoke.mjs).
// The type-level barrier is proven by tsc via the @ts-expect-error in the component file; the runtime
// assertions here pin that no code path turns gate states into a number (acceptance criterion 7).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(HERE, "FeasibilityGateStrip.tsx"), "utf8");
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the gate type has no numeric member and the barrier proof is present", () => {
  const iface = CODE.match(/export interface FeasibilityGate \{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(iface, /:\s*number\b/);
  assert.match(SOURCE, /@ts-expect-error a gate has no numeric member/);
});

test("no arithmetic, reduce or numeric rank over gate states", () => {
  assert.doesNotMatch(CODE, /\.reduce\(/);
  assert.doesNotMatch(CODE, /Number\(|parseInt|parseFloat/);
  assert.doesNotMatch(CODE, /\.state\s*[+\-*/]|[+\-*/]\s*g\.state/);
  assert.doesNotMatch(CODE, /gates\.length/, "no gate count is rendered");
});

test("a class with no supplied gate renders Absence, never a default clear", () => {
  assert.match(SOURCE, /<Absence reason="not in primary source" \/>/);
  assert.match(CODE, /data-gate-state=\{gate \? gate\.state : "not-evaluated"\}/);
});

test("the title carries data-guard-title via SectionHeading, and all five gate classes are listed", () => {
  assert.match(SOURCE, /<SectionHeading/);
  assert.doesNotMatch(CODE, /<h1|<h2|<h3/);
  for (const c of ["ppwr_thresholds", "epr_registration", "pfas_limits", "national_permitting", "ets2"]) {
    assert.match(SOURCE, new RegExp(`"${c}"`));
  }
});

test("headline order is blocked, incomplete, conditional, clear, and an unassessed class never headlines clear", () => {
  const fn = CODE.match(/export function gateHeadline[\s\S]*?\n\}/)[0];
  const order = ['"blocked"', '"incomplete"', '"conditional"', '"clear"'].map((t) => fn.indexOf(`return ${t}`));
  assert.ok(order.every((i) => i > -1));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(fn, /GATE_CLASS_ORDER\.some\(\(cls\) => !gates\.some/);
});

test("styling uses design tokens only, no hex literals", () => {
  assert.doesNotMatch(CODE, /#[0-9a-fA-F]{3,8}/);
});
