/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILLS: environmental-policy-and-innovation + remediation-discipline.
 *
 *  INVARIANT EP-8 (substrate agreement / status-is-a-cache): for every non-archived item, the STORED
 *  provenance_status must AGREE with what validate_item_provenance() recommends RIGHT NOW — BOTH directions:
 *    - no stored 'verified' that validate() now says 'quarantined'  (STALE-VERIFIED — the dangerous one:
 *      a gate/stamp change silently left fabricated-certification on a customer surface), and
 *    - no stored 'quarantined' that validate() now says 'verified'  (STALE-QUARANTINED — a recoverable
 *      item never re-derived).
 *  Disagreement is the "status is a cache that was never recomputed" failure — which is exactly what a
 *  gate or slot migration causes if it does NOT ship a corpus revalidation in the same change (the
 *  standing rule). Exit 1 on any disagreement. Read-only (validate_item_provenance is STABLE). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const sb = readClient();

const items = await readAll("intelligence_items", "id,legacy_id,provenance_status,is_archived", { match: (q) => q.eq("is_archived", false) });
const checkable = items.filter((it) => it.provenance_status === "verified" || it.provenance_status === "quarantined");

let staleVerified = 0, staleQuarantined = 0; const sample = [];
for (const it of checkable) {
  const { data } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
  const row = Array.isArray(data) ? data[0] : data;
  const rec = row?.recommended_status;
  if (!rec) continue;
  if (it.provenance_status !== rec) {
    if (it.provenance_status === "verified" && rec === "quarantined") staleVerified++;
    else if (it.provenance_status === "quarantined" && rec === "verified") staleQuarantined++;
    if (sample.length < 20) sample.push(`${(it.legacy_id || it.id.slice(0, 8)).padEnd(16)} stored=${it.provenance_status} validate()=${rec}`);
  }
}
const total = staleVerified + staleQuarantined;
console.log(`[substrate-agreement] checkable items: ${checkable.length} | STALE-VERIFIED: ${staleVerified} | STALE-QUARANTINED: ${staleQuarantined}`);
for (const s of sample) console.log(`  DISAGREE ${s}`);
if (total) {
  console.log(`\nFAIL: ${total} item(s) whose stored provenance_status disagrees with validate(). A gate/slot change must ship a corpus revalidation (status-is-a-cache rule).`);
  process.exit(1);
}
console.log("PASS: stored provenance_status agrees with validate() in both directions (substrate is not stale).");
process.exit(0);
