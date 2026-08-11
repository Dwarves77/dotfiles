// CONFORMANCE PROOF: the code agrees with the RULING, host for host (2026-08-11 batched null-tier ruling).
//
// The ruling was applied to live data first (UPDATE sources SET base_tier/status) and codified into
// host-authority.ts second. That order is how a data-only fix rots: the rows carry the ruling, the code does
// not, and the next host of the same class re-worklists as though nothing was ever decided — or worse, a
// later restore/reseed silently reverts the rows and nothing notices.
//
// This test makes `scripts/_ruling/null-tier-host-ruling.mjs` the SINGLE record of the ruling and forces
// classTierForHost to match it for every one of the 57 hosts. Divergence in EITHER direction is a failure:
// a ruled tier the code will not produce, or a permanent-worklist host the code would mint a tier for.
//
// Runs in the no-npm discipline node --test glob (src/lib/sources/*.test.mjs): node builtins + a relative
// .ts (Node type-stripping) + a relative .mjs only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classTierForHost, permanentlyUnregisteredClass } from "./host-authority.ts";
import { RULING } from "../../../scripts/_ruling/null-tier-host-ruling.mjs";

// The SC-13 class vocabulary is CLOSED. Checking `typeof cls === "string"` is not a check — it passed a
// mechanical edit that shifted the reason text into the class column. Name the classes and their tiers.
const CLASS_TIER = new Map([
  ["legal", 1], ["gov", 2], ["intergov", 2],
  ["verifier", 4], ["academic", 4], ["association", 4],
  ["analysis", 6],
  ["lawfirm", 7], ["news", 7], ["vendor", 7], ["corporate", 7],
  ["aggregator", null], ["platform", null],
]);

test("the ruling file is intact — 57 hosts, no duplicates, closed class vocabulary, reason on every row", () => {
  assert.equal(RULING.length, 57, "the batched ruling covers exactly the 57 worklisted hosts");
  const hosts = RULING.map(([h]) => h);
  assert.equal(new Set(hosts).size, hosts.length, "no host is ruled twice");
  for (const [host, tier, cls, why] of RULING) {
    assert.ok(host && typeof host === "string" && /^[a-z0-9.-]+$/.test(host), `host: ${host}`);
    assert.ok(CLASS_TIER.has(cls), `${host}: "${cls}" is not an SC-13 class`);
    assert.equal(tier, CLASS_TIER.get(cls),
      `${host}: class "${cls}" carries tier ${CLASS_TIER.get(cls)}, row says ${tier} — a ruling may not set a
       per-host tier off its own class table; change the class or change the table, not one row`);
    assert.ok(typeof why === "string" && why.length > 8, `${host}: every ruling carries its reason`);
    assert.ok(why !== cls && !CLASS_TIER.has(why), `${host}: the reason column holds a reason, not a class name`);
  }
});

test("every REGISTERED ruling is reproducible by classTierForHost — the code carries the ruling, not just the rows", () => {
  const wrong = [];
  for (const [host, tier] of RULING) {
    if (tier === null) continue;
    const got = classTierForHost(host);
    if (got !== tier) wrong.push(`${host}: ruled T${tier}, code says ${got === null ? "worklist" : "T" + got}`);
  }
  assert.deepEqual(wrong, [], `the class table diverges from the ruling:\n  ${wrong.join("\n  ")}`);
});

test("every PERMANENT-WORKLIST ruling is enforced by the code — never a tier, and named as never-registerable", () => {
  const wrong = [];
  for (const [host, tier, cls] of RULING) {
    if (tier !== null) continue;
    if (classTierForHost(host) !== null) wrong.push(`${host}: ruled permanent worklist but code mints a tier`);
    const pc = permanentlyUnregisteredClass(host);
    if (pc == null) wrong.push(`${host}: ruled ${cls} but permanentlyUnregisteredClass() does not recognise it`);
  }
  assert.deepEqual(wrong, [], `permanent-worklist ruling not enforced:\n  ${wrong.join("\n  ")}`);
});

test("no REGISTERED ruling is also classed never-registerable — the two lists are disjoint", () => {
  for (const [host, tier] of RULING) {
    if (tier === null) continue;
    assert.equal(permanentlyUnregisteredClass(host), null,
      `${host} is ruled T${tier} AND matched as never-registerable — the ruling contradicts itself`);
  }
});
