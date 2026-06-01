// D3 (b) — surface registry LAYER 1 (known-answer pairs) + LAYER 2 (mutation).
// Run: node --test scripts/lib/surface-registry.selftest.mjs
//
// Verified by a DIFFERENT modality than the registry uses: operator-constructed
// ground-truth paths whose correct class is known because I constructed them, and
// mutations that make the cron/worker miss possible again — confirming the class
// distinction is load-bearing, not decorative.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SURFACE_CLASSES, classifyPath, matchesGlob,
  emptyCoverage, validateCoverage,
} from "./surface-registry.mjs";

// ───────── LAYER 1 — known-answer pairs ─────────

test("L1 classifyPath — worker route is BOTH routes AND workers; a SQL migration is neither (pair)", () => {
  const worker = classifyPath("src/app/api/worker/check-sources/route.ts");
  assert.ok(worker.includes("routes") && worker.includes("workers"));
  // the pair: a class that genuinely cannot host a fetch
  assert.deepEqual(classifyPath("supabase/migrations/063_source_role_tier.sql"), ["migrations-sql"]);
});

test("L1 classifyPath — a real corpus runner is build-seed-runners; a selftest fixture is NOT (exclusion pair)", () => {
  assert.ok(classifyPath("supabase/seed/b2-runner.mjs").includes("build-seed-runners"));
  // scripts/**/*.mjs would match the runner glob — but the exclusion keeps fixtures
  // and D3 infra OUT of the production runner set, classified as test-fixtures only.
  const fixture = classifyPath("scripts/lib/surface-registry.selftest.mjs");
  assert.ok(fixture.includes("test-fixtures"));
  assert.ok(!fixture.includes("build-seed-runners"));
  // D3 infra (scripts/lib/*.mjs, not a fixture) is in NO production class — not a runner.
  assert.ok(!classifyPath("scripts/lib/surface-registry.mjs").includes("build-seed-runners"));
});

test("L1 matchesGlob — ** spans directories; * does not cross /", () => {
  assert.ok(matchesGlob("src/app/api/admin/sources/[id]/fetch-now/route.ts", "src/app/api/**/route.ts"));
  assert.ok(matchesGlob("supabase/migrations/063_x.sql", "supabase/migrations/*.sql"));
  assert.ok(!matchesGlob("supabase/migrations/sub/063_x.sql", "supabase/migrations/*.sql")); // * stops at /
});

test("L1 validateCoverage — a block that accounts every class is COMPLETE; dropping one is INCOMPLETE (pair)", () => {
  const full = emptyCoverage("m");
  for (const c of SURFACE_CLASSES) full.walked.push({ class: c.id });
  assert.deepEqual(validateCoverage(full), { complete: true, missing: [] });

  const holed = emptyCoverage("m");
  for (const c of SURFACE_CLASSES) if (c.id !== "crons") holed.walked.push({ class: c.id });
  const v = validateCoverage(holed);
  assert.equal(v.complete, false);
  assert.deepEqual(v.missing, ["crons"]); // the un-accounted class is VISIBLE, not silent
});

// ───────── LAYER 2 — mutation (test the test) ─────────
// Break the discrimination that makes the cron/worker miss impossible; confirm the
// miss-half input then WRONGLY passes. real != broken proves the fixture is non-vacuous.

test("L2 mutation — the `workers` class is load-bearing (drop it -> the worker path goes uncovered)", () => {
  const real = classifyPath("src/app/api/worker/check-sources/route.ts");
  assert.ok(real.includes("workers"));
  // mutation: classify with the workers class removed (the original audit's blind spot)
  const mutatedClasses = SURFACE_CLASSES.filter((c) => c.id !== "workers");
  const brokenClassify = (p) =>
    mutatedClasses.filter((cls) => cls.globs.some((g) => matchesGlob(p, g))).map((c) => c.id);
  const broken = brokenClassify("src/app/api/worker/check-sources/route.ts");
  assert.ok(!broken.includes("workers"));     // the miss is back under the mutation
  assert.notDeepEqual(real, broken);          // fixture exercises the workers distinction
});

test("L2 mutation — completeness gate is non-vacuous (always-complete wrongly passes a holed block)", () => {
  const holed = emptyCoverage("m");
  for (const c of SURFACE_CLASSES) if (c.id !== "build-seed-runners") holed.walked.push({ class: c.id });
  const real = validateCoverage(holed).complete;          // false — the runner class is unaccounted
  const brokenAlwaysComplete = true;                       // mutation: ignore the partition, always pass
  assert.equal(real, false);
  assert.notEqual(real, brokenAlwaysComplete);             // broken wrongly-passes -> non-vacuous
});
