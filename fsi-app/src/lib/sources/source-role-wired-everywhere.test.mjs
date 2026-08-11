// Fire-test: EVERY path that inserts into `sources` must classify the role at birth.
// Run: node --test fsi-app/src/lib/sources/source-role-wired-everywhere.test.mjs
//
// WHY THIS EXISTS (2026-08-11). classify-source-role.ts states its own contract in its header —
// "a source is never created with a NULL role + placeholder content-type" — and that contract was
// enforced NOWHERE. It held for the three admin onboarding routes by convention only. It did not
// hold for scripts/lib/db.mjs registerSource (fixed earlier today), and it did not hold for
// src/lib/intake/apply-staged-update.ts, which is the machine MINT CHOKEPOINT reached by
// runIntakeCycle and portalHarvest — i.e. the path that actually runs unattended and creates the
// most rows. It inserted `update.proposed_changes` raw.
//
// Cost of the gap, measured: 1,719 of 2,549 registry rows carried source_role IS NULL, and a
// 2026-08-10 triage then treated "no role" as evidence of inertness and demoted 869 live sources
// (SEC, eCFR, ESMA, NYS DEC, China MEE, Australia's Clean Energy Regulator) to provisional, which
// is gated out of every scrape/AI/index job.
//
// This test is deliberately a CENSUS, not a per-file check: it enumerates every `.from("sources")
// .insert(` in src/ and scripts/ and requires each enclosing file to reference classifySourceRole.
// A fourth creation path added later fails here rather than silently minting role-less rows again.
//
// RED-TEST PROOF (rule 15): remove the classifySourceRole import from apply-staged-update.ts (or
// add a new raw sources insert anywhere) and this test fails.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, "../../.."); // fsi-app/
const ROOTS = ["src", "scripts"];
const SKIP_DIRS = new Set(["node_modules", ".next", "archive", "_snapshots", "dist", "build"]);
const CODE = /\.(ts|tsx|mjs|js)$/;

function walk(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc);
    else if (CODE.test(e)) acc.push(p);
  }
  return acc;
}

// Matches .from("sources").insert( / .upsert( across whitespace and line breaks. The negative
// lookahead on `.from(` is load-bearing: without it, a `.from("sources").update(...)` followed
// later in the file by an unrelated `.from("source_trust_events").insert(...)` matches and reports
// a false positive (this exact case, check-sources/route.ts, was caught on the first run).
const SOURCES_WRITE =
  /\.from\(\s*["'`]sources["'`]\s*\)(?:(?!\.from\()[\s\S]){0,200}?\.(insert|upsert)\s*\(/;

// One-shot, ALREADY-EXECUTED region-population scripts (PR-A1/A2 and the tier1-* runners). Each ran
// once against the live DB and is kept only as an execution record; re-running them is not a thing,
// so wiring the classifier into them would change no data. They are listed EXPLICITLY rather than
// excluded by a glob so that a NEW script under scripts/ still fails this test. The rows they
// created are repaired by the backfill (scripts/source-role-cleanup.mjs), not by editing them.
const EXECUTED_ONE_SHOT = new Set([
  "scripts/pr-a1-execute.mjs",
  "scripts/pr-a2-execute.mjs",
  "scripts/tier1-au-apac-execute.mjs",
  "scripts/tier1-ca-provinces-execute.mjs",
  "scripts/tier1-eu-southern-eastern-execute.mjs",
  "scripts/tier1-eu-western-nordic-execute.mjs",
  "scripts/tier1-intl-cities-execute.mjs",
  "scripts/tier1-latam-mena-execute.mjs",
  "scripts/tier1-us-states-execute.mjs",
  "scripts/tier1-eu-2-clean-inserts-execute.mjs",
  "scripts/tier1-uk-nations-execute.mjs",
  "scripts/tier1-us-cities-execute.mjs",
  "scripts/tier1-us-dc-territories-execute.mjs",
  "scripts/tier1-us-midwest-execute.mjs",
  "scripts/tier1-us-northeast-execute.mjs",
  "scripts/tier1-us-south-execute.mjs",
  "scripts/tier1-us-west-execute.mjs",
  "scripts/wave2-cleanup-execute.mjs",
]);

test("every path that inserts into `sources` classifies source_role at birth", () => {
  const offenders = [];
  const covered = [];

  for (const root of ROOTS) {
    for (const file of walk(join(APP_ROOT, root))) {
      // A test file may legitimately contain the pattern as a fixture.
      if (/\.(test|selftest|spec)\.(ts|tsx|mjs|js)$/.test(file)) continue;
      const src = readFileSync(file, "utf8");
      if (!SOURCES_WRITE.test(src)) continue;
      const rel = relative(APP_ROOT, file).split("\\").join("/");
      if (src.includes("classifySourceRole")) covered.push(rel);
      else if (!EXECUTED_ONE_SHOT.has(rel)) offenders.push(rel);
    }
  }

  // Guard against the census silently matching nothing (e.g. a refactor changes the call shape),
  // which would make this test vacuously pass forever.
  assert.ok(
    covered.length >= 2,
    `Census found only ${covered.length} classified sources-insert path(s); the detection regex has ` +
      `probably gone stale. Re-check SOURCES_WRITE against the current call shape.`
  );

  assert.deepEqual(
    offenders,
    [],
    "These files INSERT into `sources` without classifying source_role at birth:\n" +
      offenders.map((f) => `  - ${f}`).join("\n") +
      "\n\nA row born with a NULL role is read downstream as 'no role' and then as 'inert'. " +
      "Call classifySourceRole(name, url) on the inserted row (explicit role wins; null stays null)."
  );
});
