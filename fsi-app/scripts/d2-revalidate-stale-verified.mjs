/** D2: revalidate the STALE 'verified' items (Jason 2026-06-08, option a — honest surface).
 *  A "stale verified" = provenance_status='verified' with ZERO FACT/GAP claims (sections present but
 *  the label was never recomputed since pre-119). validate_item_provenance would quarantine them
 *  (criterion 5, every required slot uncovered). We TOUCH each (guarded UPDATE of updated_at) so the
 *  set_provenance_status trigger (migration 115) re-derives + flips the status honestly. The guard
 *  snapshots prior rows (reversible). Read-back asserts the new status. --apply to run.
 *  Integrity rule: this does NOT change content — it corrects a stale LABEL to match the real substrate. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, readClient, guardedUpdate } from "./lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const sb = readClient();

// identify stale-verified = verified + 0 FACT/GAP claims
const items = await readAll("intelligence_items", "id,legacy_id,title,item_type,priority,provenance_status",
  { match: (q) => q.eq("is_archived", false).eq("provenance_status", "verified") });
// CLAIM COUNT via PAGINATED full-table read (readAll pages by 1000 ordered by id). A direct
// .in(<ids>) select silently truncates at PostgREST's 1000-row cap -> undercounts claims ->
// mis-sizes the stale set (the exact capped-read bug db.mjs warns about). Build the map from all rows.
const allClaims = await readAll("section_claim_provenance", "intelligence_item_id,claim_kind");
const claimCount = new Map();
for (const c of allClaims) if (c.claim_kind === "FACT" || c.claim_kind === "GAP") claimCount.set(c.intelligence_item_id, (claimCount.get(c.intelligence_item_id) || 0) + 1);
const stale = items.filter((it) => !(claimCount.get(it.id) > 0));
console.log(`verified total: ${items.length}; STALE (0 FACT/GAP claims): ${stale.length}`);
const genuine = items.length - stale.length;
console.log(`genuinely-grounded verified (untouched): ${genuine}`);

if (!APPLY) { console.log(`\nDRY-RUN. Pass --apply to revalidate the ${stale.length} stale items (trigger re-derives status).`); process.exit(0); }

const cite = { skill: "remediation-discipline", reason: "D2: revalidate stale 'verified' labels (0-claim, pre-119 vacuous) so the surface matches the real grounding substrate — label correction, not content change" };
const stamp = "2026-06-09T00:00:00.000Z";
let flipped = 0, held = 0;
for (const it of stale) {
  // touch updated_at to fire the AFTER UPDATE trigger -> validate_item_provenance re-derives status
  await guardedUpdate("intelligence_items", (qb) => qb.eq("id", it.id), { updated_at: new Date().toISOString() }, { cite, stampIso: stamp });
  const { data: after } = await sb.from("intelligence_items").select("provenance_status").eq("id", it.id).single();
  if (after?.provenance_status !== "verified") flipped++; else { held++; console.log(`  HELD verified (unexpected): ${it.legacy_id || it.id.slice(0,8)} ${it.title}`); }
}
console.log(`\nD2 complete: touched ${stale.length}; flipped off 'verified' = ${flipped}; still verified = ${held}.`);
// post read-back: corpus verified count now
const after = await readAll("intelligence_items", "id,provenance_status", { match: (q) => q.eq("is_archived", false) });
const dist = {}; for (const r of after) dist[r.provenance_status] = (dist[r.provenance_status] || 0) + 1;
console.log(`corpus provenance_status now: ${JSON.stringify(dist)}`);
