// Authoritative end-state from the DB (not run logs): KEEP-57 + flagships + the 2 regs.
import { readClient } from "../lib/db.mjs";
const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\//, "");
try { process.loadEnvFile(ROOT + ".env.local"); } catch {}
const sb = readClient();
const { data: items } = await sb.from("intelligence_items").select("id,legacy_id,item_type,provenance_status").eq("is_archived", false);
const byKey = new Map(); for (const it of items) { byKey.set(it.legacy_id, it); byKey.set(it.id.slice(0, 8), it); }

// open counsel/disposition flags per item
const { data: flags } = await sb.from("integrity_flags").select("subject_ref,created_by,status").eq("status", "open").in("created_by", ["phase2_priority_review", "phase2_analysis_relabel", "disposition_deferred"]);
const flaggedOpen = new Set((flags || []).map((f) => f.subject_ref));

function tally(keys, label) {
  const c = { verified: 0, quarantined: 0, other: 0, counsel_flagged: 0, missing: 0 };
  for (const k of keys) {
    const it = byKey.get(k);
    if (!it) { c.missing++; continue; }
    if (it.provenance_status === "verified") c.verified++;
    else if (it.provenance_status === "quarantined") { c.quarantined++; if (flaggedOpen.has(it.id)) c.counsel_flagged++; }
    else c.other++;
  }
  console.log(`\n${label} (${keys.length}): verified=${c.verified} quarantined=${c.quarantined} (counsel-flagged=${c.counsel_flagged}) other=${c.other} missing=${c.missing}`);
  return c;
}

// KEEP-57 keys (read from the runner's pinned set via the dry-run plan is overkill; use the run output keys file is unavailable here)
// Instead: report the whole non-archived corpus provenance distribution + the two target cohorts by querying.
const dist = {};
for (const it of items) dist[it.provenance_status] = (dist[it.provenance_status] || 0) + 1;
console.log("=== WHOLE non-archived corpus provenance distribution ===");
console.log(JSON.stringify(dist, null, 0));

// The 2 regs
tally(["india-s-national-logistics-policy-carbon-intensity-standards", "japan-green-transformation-gx-freight-transport-standards"], "2 REGS (india/japan)");
process.exit(0);
