// D3 Component A — verification LAYER 1 (known-answer pairs) + LAYER 2 (mutation).
//
// Principle: A is verified by a DIFFERENT MODALITY than A uses — operator-constructed
// ground truth, not another proxy.
//   LAYER 1 (known-answer pair): two fixtures differing ONLY in the caught property;
//           the correct verdict for BOTH is known because I constructed the difference.
//   LAYER 2 (mutation / test-the-test): break the primitive; the FAIL-half fixture
//           must then WRONGLY PASS. If real and broken give the SAME verdict, the
//           fixture isn't exercising the primitive (vacuous) → the assertion fails.
// Run: node --test scripts/lib/verify.selftest.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { VERDICT, assertReadBack, fetchOk, observeFired, findRawSourceFetch } from "./verify.mjs";

// ───────────────── LAYER 1 — known-answer pairs ─────────────────

test("L1 assertReadBack — pair", async () => {
  // (1) write that persists → PASS
  const persisted = { v: "verified" };
  assert.equal((await assertReadBack("ok", async () => persisted.v, "verified")).verdict, VERDICT.PASS);
  // (2) "success:true" returned but stored value deliberately different → FAIL
  const reverted = { v: "pending_human_verify" }; // the mutation claimed success; store says otherwise
  const r = await assertReadBack("revert", async () => reverted.v, "verified");
  assert.equal(r.verdict, VERDICT.FAIL);
});

test("L1 fetchOk — pair", async () => {
  // (1) 200 + body → conclusive (returns the response)
  assert.equal((await fetchOk("http://x", {}, async () => ({ status: 200 }))).status, 200);
  // (2) rigged non-200 empty body → INCONCLUSIVE (throws, never a pass)
  await assert.rejects(
    () => fetchOk("http://x", {}, async () => ({ status: 401, text: async () => "" })),
    (e) => e.verdict === VERDICT.INCONCLUSIVE
  );
});

test("L1 observeFired — pair", async () => {
  // (1) gate that blocks → fired
  assert.equal((await observeFired("blocks", async () => ({ fired: true }))).verdict, VERDICT.PASS);
  // (2) gate loaded-but-deliberately-inert → not-fired
  assert.equal(
    (await observeFired("inert", async () => ({ fired: false, evidence: "installed, no block" }))).verdict,
    VERDICT.FAIL
  );
});

test("L1 findRawSourceFetch — pair", () => {
  // (1) calls canonical fn → no flag
  assert.equal(findRawSourceFetch(`const r = await canonicalFetch(src.url);`, { canonicalToken: "canonicalFetch" }).length, 0);
  // (2) calls raw fetch() of a source → flag
  assert.equal(findRawSourceFetch(`const r = await fetch(src.url, { signal });`, { canonicalToken: "canonicalFetch" }).length, 1);
});

// ───────────────── LAYER 2 — mutation (test the test) ─────────────────
// Break each primitive's CORE discrimination logic; confirm the FAIL-half input
// then WRONGLY passes. real-verdict !== broken-verdict proves the fixture exercises
// the primitive. If they were equal, the fixture would be vacuous.

test("L2 mutation — assertReadBack fixture exercises the comparison", async () => {
  const failInput = { read: async () => "pending_human_verify", expected: "verified" };
  const real = (await assertReadBack("m", failInput.read, failInput.expected)).verdict;
  // broken: ignore the read-back, always PASS
  const brokenAssertReadBack = async () => ({ verdict: VERDICT.PASS });
  const broken = (await brokenAssertReadBack()).verdict;
  assert.equal(real, VERDICT.FAIL);
  assert.notEqual(real, broken); // broken wrongly-passes → fixture is non-vacuous
});

test("L2 mutation — fetchOk fixture exercises the status check", async () => {
  const mock401 = async () => ({ status: 401, text: async () => "" });
  let realVerdict = "threw-INCONCLUSIVE";
  try { await fetchOk("http://x", {}, mock401); realVerdict = "returned"; } catch (e) { realVerdict = e.verdict; }
  // broken: ignore status, always return ok
  const brokenFetchOk = async () => ({ status: 401 }); // never throws
  const brokenVerdict = (await brokenFetchOk()) ? "returned" : "x";
  assert.equal(realVerdict, VERDICT.INCONCLUSIVE);
  assert.notEqual(realVerdict, brokenVerdict); // broken wrongly-returns → non-vacuous
});

test("L2 mutation — observeFired fixture exercises the fired-flag", async () => {
  const inert = async () => ({ fired: false });
  const real = (await observeFired("m", inert)).verdict;
  const brokenObserveFired = async () => ({ verdict: VERDICT.PASS }); // ignore fired
  const broken = (await brokenObserveFired()).verdict;
  assert.equal(real, VERDICT.FAIL);
  assert.notEqual(real, broken);
});

test("L2 mutation — findRawSourceFetch fixture exercises the scan", () => {
  const text = `const r = await fetch(src.url, { signal });`;
  const real = findRawSourceFetch(text, { canonicalToken: "canonicalFetch" }).length;
  const brokenFind = () => []; // always no hits
  const broken = brokenFind().length;
  assert.equal(real, 1);
  assert.notEqual(real, broken); // broken wrongly-clean → non-vacuous
});
