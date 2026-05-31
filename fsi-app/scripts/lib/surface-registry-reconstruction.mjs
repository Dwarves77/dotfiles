// D3 (b) — surface registry LAYER 3 (real-artifact reconstruction). READ-ONLY.
//
// Proves (b) against THIS SESSION's real miss, not synthetics. Two binding obligations:
//
//   OBLIGATION 1 (A carry-forward): findRawSourceFetch MUST catch the real ~10 drift
//     files (findings doc S1). Run it on each; assert every one is flagged. Negative
//     control: a real production file with zero source fetch -> 0 hits (the lint is
//     non-vacuous; "caught the 10" means something).
//
//   OBLIGATION 2 (the real miss): run the surface ENUMERATION against the real
//     codebase and confirm workers / crons / build-runners are WALKED — surfacing
//     check-sources + the population/discovery runners — and that migrations-sql /
//     test-fixtures are DECLARED not_walked with a reason. The cron + build-runner
//     miss (the highest-impact drift, in an un-enumerated path) becomes structurally
//     impossible: covered, or visibly declared uncovered. Coverage must validate
//     COMPLETE (every class accounted).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import {
  discoverSurfaces, auditContentFetch, validateCoverage, SURFACE_CLASSES,
} from "./surface-registry.mjs";
import { findRawSourceFetch } from "./verify.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail = "") => {
  console.log(`  [${cond ? "OK" : "FAIL"}] ${label}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
};

console.log("=== (b) L3 — real-artifact reconstruction (root: fsi-app) ===\n");

// ── OBLIGATION 1 — findRawSourceFetch catches the real ~10 drift files ─────────
console.log("OBLIGATION 1 — findRawSourceFetch vs the real drift files (findings S1):");
const DRIFT_FILES = [
  "src/app/api/worker/check-sources/route.ts",            // #1 cron near-miss
  "src/lib/sources/verification.ts",                      // #2 production classification/discovery
  "src/lib/sources/recommend-source-tier.ts",             // #3 Phase 1.5 (plain-first->fallback)
  "src/app/api/admin/spot-check/recurring/route.ts",      // #4 second divergent fetchContent
  "src/app/api/admin/sources/bulk-import/route.ts",       // #5 import validation
  "supabase/seed/tier1-population-runner.mjs",            // #6 build runner
  "supabase/seed/canonical-source-discover.mjs",          // #7 discovery build runner
  "supabase/seed/california-pilot.mjs",                   // #8 build runner
  "scripts/wave1-api-discovery.mjs",                      // #9a script
  "scripts/audit-optionc-reachability.mjs",               // #9b script
  "supabase/seed/generate-eu-missing-briefs.mjs",         // #10 inlined duplicate browserlessRender
];
let caught = 0;
for (const rel of DRIFT_FILES) {
  let text; try { text = readFileSync(resolve(ROOT, rel), "utf8"); } catch { ok(`read ${rel}`, false, "unreadable"); continue; }
  const hits = findRawSourceFetch(text, { canonicalToken: "browserlessRender" });
  const got = hits.length > 0;
  if (got) caught++;
  ok(`catch ${rel}`, got, got ? `${hits.length} raw-fetch line(s) e.g. L${hits[0].line}` : "MISSED");
}
ok(`ALL ${DRIFT_FILES.length} drift files caught`, caught === DRIFT_FILES.length, `${caught}/${DRIFT_FILES.length}`);

// negative control — a real production file with zero source fetch must be clean
const cleanHits = findRawSourceFetch(readFileSync(resolve(ROOT, "src/lib/trust.ts"), "utf8"), { canonicalToken: "browserlessRender" });
ok("negative control: src/lib/trust.ts is clean (non-vacuous)", cleanHits.length === 0, `${cleanHits.length} hits`);

// honest false-DRIFT disclosure — the canonical sites ALSO flag (api/rss access-method
// fetch alongside their correct browserlessRender scrape path). Accepted, safe direction.
console.log("\n  false-DRIFT disclosure (accepted per gap #2 — clears on human review):");
for (const rel of ["src/app/api/admin/sources/[id]/fetch-now/route.ts", "src/app/api/worker/drain-first-fetch/route.ts"]) {
  const hits = findRawSourceFetch(readFileSync(resolve(ROOT, rel), "utf8"), { canonicalToken: "browserlessRender" });
  console.log(`    ${rel}: ${hits.length} flag(s) — has browserlessRender scrape path; ${hits.length} access-method fetch(es) false-DRIFT (never false-IMPLEMENT)`);
}

// ── OBLIGATION 2 — surface enumeration catches the real cron + build-runners ────
console.log("\nOBLIGATION 2 — surface enumeration vs the real cron/worker/build-runner miss:");
const surfaces = discoverSurfaces(ROOT);

const workers = surfaces.workers;
ok("workers WALKED includes check-sources", workers.includes("src/app/api/worker/check-sources/route.ts"));
ok("workers WALKED includes drain-first-fetch", workers.includes("src/app/api/worker/drain-first-fetch/route.ts"));

const runners = surfaces["build-seed-runners"];
for (const r of ["supabase/seed/tier1-population-runner.mjs", "supabase/seed/canonical-source-discover.mjs",
                 "supabase/seed/california-pilot.mjs", "supabase/seed/generate-eu-missing-briefs.mjs"])
  ok(`build-runners WALKED includes ${r.replace("supabase/seed/", "")}`, runners.includes(r));

const { coverage } = auditContentFetch(ROOT, { canonicalToken: "browserlessRender" });
const walkedClasses = new Set(coverage.walked.map((w) => w.class));
const notWalkedClasses = new Set(coverage.not_walked.map((w) => w.class));
ok("coverage WALKED: workers", walkedClasses.has("workers"));
ok("coverage WALKED: build-seed-runners", walkedClasses.has("build-seed-runners"));
ok("coverage WALKED: crons", walkedClasses.has("crons"));
ok("coverage NOT_WALKED (declared, with reason): migrations-sql", notWalkedClasses.has("migrations-sql") && !!coverage.not_walked.find((w) => w.class === "migrations-sql").reason);
ok("coverage NOT_WALKED (declared, with reason): test-fixtures", notWalkedClasses.has("test-fixtures") && !!coverage.not_walked.find((w) => w.class === "test-fixtures").reason);

const cronWalk = coverage.walked.find((w) => w.class === "crons");
const schedulesQ7 = (cronWalk.scheduled || []).some((s) => /q7-daily-recompute/.test(s.surface || ""));
ok("crons walk surfaces the scheduled q7-daily-recompute (vercel.json)", schedulesQ7,
   JSON.stringify(cronWalk.scheduled));

const cov = validateCoverage(coverage);
ok("coverage is COMPLETE — every surface class accounted (no silent omission)", cov.complete, cov.complete ? `${SURFACE_CLASSES.length}/${SURFACE_CLASSES.length} classes` : `missing: ${cov.missing.join(", ")}`);

// the content-fetch audit must also FLAG the raw-fetch sites it walked
const flaggedFiles = new Set(auditContentFetch(ROOT).flagged.map((f) => f.file));
for (const rel of ["src/app/api/worker/check-sources/route.ts", "src/lib/sources/verification.ts", "supabase/seed/tier1-population-runner.mjs"])
  ok(`audit flagged walked drift site ${rel.split("/").pop()}`, flaggedFiles.has(rel));

console.log(`\n  surface census: ${SURFACE_CLASSES.map((c) => `${c.id}=${surfaces[c.id].length}`).join("  ")}`);
console.log(`\n${fails === 0
  ? "(b) L3 PASS — findRawSourceFetch caught all 11 real drift files (clean control = 0); surface enumeration WALKED workers/crons/build-runners (the real miss now covered) and DECLARED migrations/test-fixtures not_walked; coverage COMPLETE."
  : fails + " (b) L3 FAILURE(S)"}`);
process.exitCode = fails === 0 ? 0 : 1;
