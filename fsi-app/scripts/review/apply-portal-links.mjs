#!/usr/bin/env node
// apply-portal-links.mjs — applies a ruled digest for the portal-links queue (`portal_link_candidates`
// WHERE status='candidate'; drop -> status='rejected', stamping disposition_reason/dispositioned_at per
// migration 220; link -> no mutation, the row stays 'candidate' for the real consume step to find) (Lane
// R1, 2026-09-02). Dry by default; --apply writes through scripts/lib/db.mjs's guardedUpdateByIds only.
// Never writes status='promoted' — that value means "minted, item_id stamped" to
// `scripts/turns/run-ledger-consume.mjs` (its `PROMOTED_LIKE_DISPOSITIONS`) and to
// `src/lib/intake/portal-harvest.ts`'s own stamp(); see lib/portal-links.mjs's header for why forging
// it here would hide these rows from that pipeline instead of clearing them for it.
//
// USAGE:
//   node scripts/review/apply-portal-links.mjs --ruling docs/ratifications/2026-09/portal-links.ruling.json
//   node scripts/review/apply-portal-links.mjs --ruling <file> --apply
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as PortalLinks from "./lib/portal-links.mjs";
import { applySimpleQueue } from "./lib/apply-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

export const CITE = Object.freeze({
  skill: "review-queue-ratification-digest",
  reason:
    "Apply an operator-ruled group decision from the portal-links ratification digest (Lane R1, " +
    "2026-09-02, docs/ratifications/2026-09/README.md): drop -> status='rejected' (migration 220 " +
    "disposition columns); link -> no mutation (row stays 'candidate'; status='promoted' means 'minted' " +
    "elsewhere and is never written here). Groups are (portal host x link pattern); the ruling file " +
    "names which rows and which decision. The classify/intake consume step is a separate, existing " +
    "pass (scripts/turns/run-ledger-consume.mjs), not performed here.",
});

/** @param {{rulingPath: string, apply?: boolean}} opts */
export async function main({ rulingPath, apply = false } = {}, deps) {
  const ruling = JSON.parse(readFileSync(rulingPath, "utf8"));
  return applySimpleQueue({
    module: PortalLinks,
    ruling,
    apply,
    deps,
    cite: CITE,
    extraForGroup: (group) => ({ reason: group.rationale ?? `ratification digest group ${group.key}: ${group.decision}` }),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--ruling");
  const rulingPath = idx >= 0 ? args[idx + 1] : undefined;
  if (!rulingPath) {
    console.error("[apply-portal-links] --ruling <file.json> is required.");
    process.exit(2);
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[apply-portal-links] no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }
  const { readAll, guardedUpdateByIds } = await import("../lib/db.mjs");
  main({ rulingPath, apply: args.includes("--apply") }, { readAll, guardedUpdateByIds }).catch((e) => {
    console.error("[apply-portal-links] fatal:", e);
    process.exit(1);
  });
}
