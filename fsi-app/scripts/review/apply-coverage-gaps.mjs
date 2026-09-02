#!/usr/bin/env node
// apply-coverage-gaps.mjs — applies a ruled digest for the coverage-gaps queue (`coverage_gap_candidates`
// WHERE disposition IS NULL; kept/declined/parked per migration 273's disposition CHECK) (Lane R1,
// 2026-09-02). Dry by default; --apply writes through scripts/lib/db.mjs's guardedUpdateByIds only.
// 'declined'/'parked' attach a uniform surface_test payload (see lib/coverage-gaps.mjs) — migration 273's
// coverage_gap_candidates_surface_test_required_check demands one for any non-null, non-'kept' disposition.
//
// USAGE:
//   node scripts/review/apply-coverage-gaps.mjs --ruling docs/ratifications/2026-09/coverage-gaps.ruling.json
//   node scripts/review/apply-coverage-gaps.mjs --ruling <file> --apply
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as CoverageGaps from "./lib/coverage-gaps.mjs";
import { applySimpleQueue } from "./lib/apply-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

export const CITE = Object.freeze({
  skill: "review-queue-ratification-digest",
  reason:
    "Apply an operator-ruled group decision from the coverage-gaps ratification digest (Lane R1, " +
    "2026-09-02, docs/ratifications/2026-09/README.md): kept/declined/parked -> coverage_gap_candidates.disposition " +
    "(migration 273). Groups are (coverage_class x jurisdiction x transport_mode); the ruling file names which " +
    "rows and which decision.",
});

/** @param {{rulingPath: string, apply?: boolean}} opts */
export async function main({ rulingPath, apply = false } = {}, deps) {
  const ruling = JSON.parse(readFileSync(rulingPath, "utf8"));
  return applySimpleQueue({
    module: CoverageGaps,
    ruling,
    apply,
    deps,
    cite: CITE,
    extraForGroup: (group) => ({ rationale: group.rationale ?? `ratification digest group ${group.key}: ${group.decision}` }),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--ruling");
  const rulingPath = idx >= 0 ? args[idx + 1] : undefined;
  if (!rulingPath) {
    console.error("[apply-coverage-gaps] --ruling <file.json> is required.");
    process.exit(2);
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[apply-coverage-gaps] no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }
  const { readAll, guardedUpdateByIds } = await import("../lib/db.mjs");
  main({ rulingPath, apply: args.includes("--apply") }, { readAll, guardedUpdateByIds }).catch((e) => {
    console.error("[apply-coverage-gaps] fatal:", e);
    process.exit(1);
  });
}
