#!/usr/bin/env node
// apply-provisional-sources.mjs — applies a ruled digest for the provisional-sources queue (`sources`
// WHERE status='provisional'; keep -> status='active', suspend -> status='suspended') (Lane R1,
// 2026-09-02). Dry by default; --apply writes through scripts/lib/db.mjs's guardedUpdateByIds only.
//
// USAGE:
//   node scripts/review/apply-provisional-sources.mjs --ruling docs/ratifications/2026-09/provisional-sources.ruling.json
//   node scripts/review/apply-provisional-sources.mjs --ruling <file> --apply
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as ProvisionalSources from "./lib/provisional-sources.mjs";
import { applySimpleQueue } from "./lib/apply-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

export const CITE = Object.freeze({
  skill: "review-queue-ratification-digest",
  reason:
    "Apply an operator-ruled group decision from the provisional-sources ratification digest (Lane R1, " +
    "2026-09-02, docs/ratifications/2026-09/README.md): keep -> status='active', suspend -> status='suspended'. " +
    "Groups are (officialness tier x reachability); the ruling file names which rows and which decision.",
});

/** @param {{rulingPath: string, apply?: boolean}} opts */
export async function main({ rulingPath, apply = false } = {}, deps) {
  const ruling = JSON.parse(readFileSync(rulingPath, "utf8"));
  return applySimpleQueue({ module: ProvisionalSources, ruling, apply, deps, cite: CITE });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--ruling");
  const rulingPath = idx >= 0 ? args[idx + 1] : undefined;
  if (!rulingPath) {
    console.error("[apply-provisional-sources] --ruling <file.json> is required.");
    process.exit(2);
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[apply-provisional-sources] no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }
  const { readAll, guardedUpdateByIds } = await import("../lib/db.mjs");
  main({ rulingPath, apply: args.includes("--apply") }, { readAll, guardedUpdateByIds }).catch((e) => {
    console.error("[apply-provisional-sources] fatal:", e);
    process.exit(1);
  });
}
