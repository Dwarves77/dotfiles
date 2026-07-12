/** VERIFIER (read-only, 0 Browserless): SOURCE-LINK LIVE-DATA INVARIANT (Fix A, RD-22) over live data.
 *  GOVERNING SKILLS: remediation-discipline (§4 — the intake-gate family: a mint cannot produce a
 *  source-less LIVE item, the sibling of the transport-hold RD-11 / url-canon RD-13 / staged-transit RD-20
 *  gates) + environmental-policy-and-innovation (Layer-1/Layer-2 model: intelligence items live INSIDE
 *  sources; an item with no source cannot ground).
 *
 *  DOCTRINE (no-source-less-live-mint, operator ruling 2026-07-12): grounding grounds a brief against the
 *  item's source, so a source_id=NULL item can never verify. The mint chokepoint now REJECTS a source-less
 *  mint (register the source first); this live-data audit is the belt to that suspenders — it proves no
 *  source-less LIVE row exists beyond the documented pre-cutover grandfather (the two T9 orphans, Unit 3).
 *
 *  Exit 0 = invariant holds. Exit 1 = a source-less LIVE row exists that is NOT grandfathered (a new orphan
 *  slipped the chokepoint). Reads only. Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *  Gates in the CI-with-secrets / ops lane; pre-push (no DB secrets) validates WIRING via the meta-gate. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";
import { findSourceLessLiveViolations, GRANDFATHERED_SOURCELESS } from "../../src/lib/intake/source-link-invariant.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* env may be pre-loaded in CI */ }

let rows;
try {
  rows = await readAll("intelligence_items", "id,source_id,is_archived,provenance_status,title,created_at");
} catch (e) { console.error(`source-link-audit: read failed: ${e.message}`); process.exit(2); }

const sourceLessLive = (rows || []).filter((r) => r.source_id == null && r.is_archived === false);
const violations = findSourceLessLiveViolations(rows);
const grandfathered = sourceLessLive.filter((r) => GRANDFATHERED_SOURCELESS.includes(r.id));

console.log(`\n===== SOURCE-LINK LIVE-DATA INVARIANT (read-only) =====`);
console.log(`intelligence_items: ${(rows || []).length}  |  source-less LIVE (source_id NULL, not archived): ${sourceLessLive.length}`);
console.log(`  grandfathered (pre-cutover, Unit 3 re-source): ${grandfathered.length}  |  VIOLATIONS (new orphans): ${violations.length}`);

if (grandfathered.length) {
  console.log(`\n── grandfathered pre-cutover orphans (reported, NOT a fail — Unit 3 re-sources them) ──`);
  for (const r of grandfathered) console.log(`  ${String(r.id).slice(0, 8)}  ${String(r.provenance_status).padEnd(12)} ${String(r.title || "").slice(0, 46)}`);
}

if (violations.length) {
  console.log(`\n── VIOLATIONS: source-less LIVE rows NOT grandfathered (a mint slipped the chokepoint) ──`);
  for (const r of violations.slice(0, 40)) {
    console.log(`  ${String(r.id).slice(0, 8)}  ${String(r.provenance_status).padEnd(12)} ${String(r.created_at || "").slice(0, 10)}  ${String(r.title || "").slice(0, 44)}`);
  }
  if (violations.length > 40) console.log(`  … +${violations.length - 40} more`);
  console.log(`\nLANE-FAIL: ${violations.length} source-less LIVE item(s) exist that the mint chokepoint should have rejected.`);
  console.log(`FIX: the mint gate (mint-item.ts sourceLinkDecision) rejects a source-less mint; a violation here means`);
  console.log(`either a pre-cutover orphan needs adding to the grandfather list (with a Unit-3 re-source plan) or the`);
  console.log(`gate was bypassed. Register/link the source and re-ground, or archive via the eligibility gate.`);
  process.exit(1);
}
console.log(`invariant holds: every LIVE intelligence_items row has a source_id (grandfather aside).`);
process.exit(0);
