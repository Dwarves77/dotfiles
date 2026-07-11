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

// ── OBLIGATION 1 — findRawSourceFetch detector fitness (revised 2026-07-11) ─────
// The original 2026-06 known-answer list (the "~10 real drift files", findings S1) has
// been REMEDIATED in the tree — those files migrated to the canonical browserless.ts
// wrapper, so the detector now correctly returns 0 hits on them and asserting "caught"
// against cured files failed the fixture on every re-run (audit F-5a-5: stale L3
// expectation). Also removed: scripts/wave1-api-discovery.mjs (gitignored, absent on a
// fresh checkout — F-5a-14). The list below is retained as a dated audit RECORD and
// REPORTED, not asserted; detector fitness is asserted via live controls instead:
// a positive control (fetch-now's access-method fetch lines still flag) and the
// negative control (trust.ts clean).
console.log("OBLIGATION 1 — findRawSourceFetch detector fitness (2026-06 drift list = remediated record):");
const DRIFT_FILES_2026_06_RECORD = [
  "src/app/api/worker/check-sources/route.ts",            // #1 cron near-miss (cured)
  "src/lib/sources/verification.ts",                      // #2 production classification/discovery (cured)
  "src/lib/sources/recommend-source-tier.ts",             // #3 Phase 1.5 (cured)
  "src/app/api/admin/spot-check/recurring/route.ts",      // #4 second divergent fetchContent (cured)
  "src/app/api/admin/sources/bulk-import/route.ts",       // #5 import validation (cured)
  "supabase/seed/tier1-population-runner.mjs",            // #6 build runner (cured)
  "supabase/seed/canonical-source-discover.mjs",          // #7 discovery build runner (cured)
  "supabase/seed/california-pilot.mjs",                   // #8 build runner (cured)
  "scripts/audit-optionc-reachability.mjs",               // #9b script (cured)
  "supabase/seed/generate-eu-missing-briefs.mjs",         // #10 inlined duplicate (cured)
];
let residualDrift = 0;
for (const rel of DRIFT_FILES_2026_06_RECORD) {
  let text; try { text = readFileSync(resolve(ROOT, rel), "utf8"); } catch { console.log(`  [--] ${rel} — absent`); continue; }
  const hits = findRawSourceFetch(text, { canonicalToken: "browserlessRender" });
  if (hits.length > 0) residualDrift++;
  console.log(`  [${hits.length > 0 ? "DRIFT" : "clean"}] ${rel}${hits.length > 0 ? ` — ${hits.length} raw-fetch line(s) e.g. L${hits[0].line}` : ""}`);
}
console.log(`  2026-06 drift set residual: ${residualDrift}/${DRIFT_FILES_2026_06_RECORD.length} still drifting (0 = fully remediated)`);

// positive control — fetch-now's access-method fetch lines are a REAL raw-fetch shape the
// detector must still flag (proves the detector fires on this tree; not a cured no-op)
const posHits = findRawSourceFetch(
  readFileSync(resolve(ROOT, "src/app/api/admin/sources/[id]/fetch-now/route.ts"), "utf8"),
  { canonicalToken: "browserlessRender" });
ok("positive control: fetch-now access-method fetch lines flag (detector non-vacuous)", posHits.length > 0, `${posHits.length} hits`);

// negative control — a real production file with zero source fetch must be clean
const cleanHits = findRawSourceFetch(readFileSync(resolve(ROOT, "src/lib/trust.ts"), "utf8"), { canonicalToken: "browserlessRender" });
ok("negative control: src/lib/trust.ts is clean (non-vacuous)", cleanHits.length === 0, `${cleanHits.length} hits`);

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

// vercel.json declares NO crons since the 2026-06-28 Phase-1 retirement (the q7 nightly
// recompute moved into growSourcesFromBrief; the manual scripts/cron/q7-daily-recompute.mjs
// one-shot was deleted 2026-07-11, Wave-α Track E). The truthful L3 assertion is that the
// crons class is WALKED and the walk reports the cronless state — not that a q7 cron exists.
const cronWalk = coverage.walked.find((w) => w.class === "crons");
const schedulesQ7 = (cronWalk.scheduled || []).some((s) => /q7-daily-recompute/.test(s.surface || ""));
ok("crons walk reflects cronless vercel.json (q7 nightly retired 2026-06-28; no phantom schedule)", !schedulesQ7,
   JSON.stringify(cronWalk.scheduled));

const cov = validateCoverage(coverage);
ok("coverage is COMPLETE — every surface class accounted (no silent omission)", cov.complete, cov.complete ? `${SURFACE_CLASSES.length}/${SURFACE_CLASSES.length} classes` : `missing: ${cov.missing.join(", ")}`);

// the content-fetch audit must still FLAG at least one real raw-fetch site it walked
// (2026-07-11: the original 3 named sites are cured — see OBLIGATION 1 note; the audit's
// flag channel is proven live via the fetch-now positive control's file)
const flaggedFiles = new Set(auditContentFetch(ROOT).flagged.map((f) => f.file));
ok("audit flag channel fires on a walked raw-fetch site (fetch-now)",
   flaggedFiles.has("src/app/api/admin/sources/[id]/fetch-now/route.ts"), `${flaggedFiles.size} flagged total`);

console.log(`\n  surface census: ${SURFACE_CLASSES.map((c) => `${c.id}=${surfaces[c.id].length}`).join("  ")}`);
console.log(`\n${fails === 0
  ? "(b) L3 PASS — detector controls hold (positive fires, clean control = 0; 2026-06 drift set reported as remediated record); surface enumeration WALKED workers/crons/build-runners and DECLARED migrations/test-fixtures not_walked; coverage COMPLETE; vercel.json truthfully cronless."
  : fails + " (b) L3 FAILURE(S)"}`);
process.exitCode = fails === 0 ? 0 : 1;
