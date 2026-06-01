// D3 Acceptance Test 1 — bootstrap suite. Re-catch this session's KNOWN failures, but
// ONLY as a CONSEQUENCE of the general category checks tripping on SYNTHETIC category
// fixtures — never by signature-matching the specific failure (design doc section 4
// ANTI-GAMING). A 10/10 that secretly pattern-matches is worse than an honest 9/10.
//
// THE BAR (operator tightening 2026-05-31): each line needs TWO fixtures —
//   POSITIVE: a synthetic category INSTANCE -> MUST be caught.
//   NEGATIVE: a structurally-similar legitimate NON-instance -> MUST be left clean.
// A check that fires on its negative is VACUOUS (flags everything) and is a FAILURE,
// not a catch. Same positive+negative-control bar every component met at L3
// (findRawSourceFetch caught 11 AND left trust.ts clean; (c) surfaced 420 AND left the
// 357 dedup clean). The real failure is named as an INSTANCE of the category.
import { VERDICT, assertReadBack, fetchOk, observeFired, findRawSourceFetch } from "./verify.mjs";
import { DRIFT, evalPredicate } from "./drift-check.mjs";
import { classifyPath } from "./surface-registry.mjs";
import { crossProduct } from "./exclusion-audit.mjs";

async function tryFetchOk(status) {
  try { await fetchOk("http://x", {}, async () => ({ status, text: async () => "" })); return { threw: false, verdict: null }; }
  catch (e) { return { threw: true, verdict: e.verdict }; }
}

// Each case returns { caught, clean, ... }. caught = positive tripped the general check;
// clean = negative was left alone. #10 reports symptomCaught + rootGap (NOT caught).
const CASES = [
  {
    n: 1, failure: "fail-open hook (loaded != fires)", check: "observeFired",
    run: async () => {
      const pos = await observeFired("loaded-but-inert", async () => ({ fired: false }));
      const neg = await observeFired("gate-that-fires", async () => ({ fired: true }));
      return { caught: pos.verdict === VERDICT.FAIL, clean: neg.verdict === VERDICT.PASS,
        pos: `fired:false -> ${pos.verdict}`, neg: `fired:true -> ${neg.verdict}`,
        instance: "the jq hook: visible in /hooks, exit 0 every time, never asked" };
    },
  },
  {
    n: 2, failure: "criterion-6 revert (200 success, state unchanged)", check: "assertReadBack",
    run: async () => {
      const pos = await assertReadBack("m", async () => "pending_human_verify", "verified");
      const neg = await assertReadBack("m", async () => "verified", "verified");
      return { caught: pos.verdict === VERDICT.FAIL, clean: neg.verdict === VERDICT.PASS,
        pos: `claimed verified / stored pending -> ${pos.verdict}`, neg: `claimed verified / stored verified -> ${neg.verdict}`,
        instance: "the trigger reverted the human-verify flip in the same txn" };
    },
  },
  {
    n: 3, failure: "401 false-positive (non-2xx absence read as pass)", check: "fetchOk",
    run: async () => {
      const pos = await tryFetchOk(401), neg = await tryFetchOk(200);
      return { caught: pos.threw && pos.verdict === VERDICT.INCONCLUSIVE, clean: !neg.threw,
        pos: `status 401 -> ${pos.verdict}`, neg: `status 200 -> returned`,
        instance: "the expired-token 401 printed 'FLIPPED' off an empty body" };
    },
  },
  {
    n: 4, failure: "dry-run wrong-path (non-prod raw fetch)", check: "findRawSourceFetch",
    run: async () => {
      const pos = findRawSourceFetch("const r = await fetch(src.url, { signal });", { canonicalToken: "browserlessRender" });
      const neg = findRawSourceFetch("const r = await browserlessRender(src.url);", { canonicalToken: "browserlessRender" });
      return { caught: pos.length > 0, clean: neg.length === 0,
        pos: `fetch(src.url) -> ${pos.length} hit`, neg: `browserlessRender(src.url) -> ${neg.length} hit`,
        instance: "Phase-1.5 dry-run measured a plain-fetch path, not the canonical one" };
    },
  },
  {
    n: 5, failure: "~10 fetch drifts (raw source fetch)", check: "drift noRawSourceFetch",
    run: async () => {
      const pos = evalPredicate("async function f(){ const r = await fetch(src.url); return r; }", { kind: "noRawSourceFetch" }).verdict;
      const neg = evalPredicate("async function f(){ const r = await browserlessRender(src.url); return r; }", { kind: "noRawSourceFetch" }).verdict;
      return { caught: pos === DRIFT.DRIFTED, clean: neg === DRIFT.IMPLEMENTED,
        pos: `fetch(var) -> ${pos}`, neg: `browserlessRender(var) -> ${neg}`,
        instance: "verification.ts, check-sources, tier1-population-runner, +8" };
    },
  },
  {
    n: 6, failure: "cron near-miss (in an un-enumerated worker path)", check: "surface classifyPath",
    run: async () => {
      const pos = classifyPath("src/app/api/worker/check-sources/route.ts");
      const neg = classifyPath("scripts/lib/x.selftest.mjs");
      return { caught: pos.includes("workers"), clean: !neg.includes("workers"),
        pos: `worker route -> [${pos.join(",")}]`, neg: `selftest fixture -> [${neg.join(",")}]`,
        instance: "check-sources, a worker the original audit never enumerated" };
    },
  },
  {
    n: 7, failure: "build-runner defect (in an un-enumerated runner)", check: "surface classifyPath",
    run: async () => {
      const pos = classifyPath("supabase/seed/tier1-population-runner.mjs");
      const neg = classifyPath("supabase/migrations/063_source_role.sql");
      return { caught: pos.includes("build-seed-runners"), clean: !neg.includes("build-seed-runners"),
        pos: `seed runner -> [${pos.join(",")}]`, neg: `SQL migration -> [${neg.join(",")}]`,
        instance: "tier1-population-runner, classified off the broken fetch" };
    },
  },
  {
    n: 8, failure: "~420 reachability-exclusions", check: "exclusion cross-product",
    run: async () => {
      const pos = crossProduct([{ surface: "source_verifications", method: "plain-fetch-reachability", rawSignal: "reachability", count: 420 }]);
      const neg = crossProduct([{ surface: "source_verifications", method: "dedup", rawSignal: "duplicate", count: 357 }]);
      return { caught: pos.flagged.length === 1, clean: neg.flagged.length === 0,
        pos: `method=plain-fetch-reachability -> ${pos.flagged.length} flagged`, neg: `method=dedup -> ${neg.flagged.length} flagged`,
        instance: "420 candidates rejected on reachability via the now-unreliable fetch" };
    },
  },
  {
    n: 9, failure: "all-Browserless decision drift", check: "drift calls()",
    run: async () => {
      const pos = evalPredicate("// browserlessRender is overkill here; we use plain fetch.\nasync function f(){ return await fetch(u); }", { kind: "calls", callee: "browserlessRender" }).verdict;
      const neg = evalPredicate("async function f(){ return await browserlessRender(u); }", { kind: "calls", callee: "browserlessRender" }).verdict;
      return { caught: pos === DRIFT.DRIFTED, clean: neg === DRIFT.IMPLEMENTED,
        pos: `token-in-comment-not-called -> ${pos}`, neg: `real call -> ${neg}`,
        instance: "the all-Browserless decision while fetch() remained on the scrape path" };
    },
  },
  {
    n: 10, failure: "publisher error-swallow (.select() drops error -> silent null)", check: "fetchOk (SYMPTOM only)",
    rootGap: true,
    run: async () => {
      const pos = await tryFetchOk(500), neg = await tryFetchOk(200);
      return { caught: false, // ROOT not caught by any general check today
        symptomCaught: pos.threw && pos.verdict === VERDICT.INCONCLUSIVE, clean: !neg.threw,
        pos: `the 500 SYMPTOM -> ${pos.verdict}`, neg: `status 200 -> returned`,
        instance: "recommendSourceTier selected a non-existent column -> swallowed error -> null -> 500",
        gapNote: "the ROOT (error-dropped .select() destructure) has NO general check. First entry in the living set 'shapes D3 does not catch yet'; future-probe candidate (silent error-swallow is a whole bug category)." };
    },
  },
];

export async function runBootstrap() {
  const rows = [];
  for (const c of CASES) rows.push({ ...c, ...(await c.run()) });
  // A case PASSES if: positive caught AND negative clean. #10 passes if its SYMPTOM
  // discriminates (symptomCaught AND clean) and the root-gap is declared (not rounded up).
  for (const r of rows) {
    if (r.rootGap) r.ok = r.symptomCaught === true && r.clean === true && r.caught === false;
    else r.ok = r.caught === true && r.clean === true;
    // a check that fires on its negative is VACUOUS — explicitly a failure
    r.vacuous = r.clean === false;
  }
  const fullyCaught = rows.filter((r) => !r.rootGap && r.caught && r.clean).length;
  const vacuous = rows.filter((r) => r.vacuous);
  const allOk = rows.every((r) => r.ok);
  return { rows, fullyCaught, total: CASES.length, vacuous, allOk };
}

// Standalone entry (also invoked by d3-run --scope=bootstrap).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("bootstrap-test1.mjs")) {
  const { rows, fullyCaught, total, vacuous, allOk } = await runBootstrap();
  console.log("=== Test 1 bootstrap matrix (positive caught + negative clean) ===\n");
  for (const r of rows) {
    const verdict = r.rootGap ? (r.ok ? "SYMPTOM-CAUGHT / ROOT-GAP" : "FAIL") : (r.ok ? "CAUGHT+DISCRIMINATES" : (r.vacuous ? "VACUOUS-FAIL" : "MISSED"));
    console.log(`  #${r.n} [${verdict}] ${r.failure}`);
    console.log(`        check=${r.check}  +pos: ${r.pos}  -neg: ${r.neg}`);
    console.log(`        instance: ${r.instance}${r.gapNote ? "\n        GAP: " + r.gapNote : ""}`);
  }
  console.log(`\nScore: ${fullyCaught}/${total} fully caught (positive+negative); #10 symptom-caught + root-gap flagged (honest partial).`);
  if (vacuous.length) console.log(`VACUOUS checks (fired on their negative): ${vacuous.map((r) => "#" + r.n).join(", ")}`);
  console.log(allOk ? "\nTest 1 PASS — every line caught its instance AND left the look-alike clean; #10 honest; no vacuous check." : "\nTest 1 FAILURE(S)");
  process.exitCode = allOk ? 0 : 1;
}
