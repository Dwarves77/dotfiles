// CLOSEOUT (run at Step-2b ship): re-record 50ccd5cc's disposition. The item is now provenance_status=
// 'verified' (regenerated under the fixed labeling discipline; gate passed). Its stale PARKING flag —
// "Lane-#4 deferral (14d): blocked on the network-stable Phase 3 grounding lane" (disposition_deferred) —
// is now OBSOLETE: nothing is deferred, it was RESOLVED via the skill fix. Per no-quarantine-as-parking +
// clear-flags-when-satisfied, mark it resolved with the real disposition. Flag-resolution by direct update
// is precedented (scripts/audit-skill-conformance.mjs does the same). NOT a guarded content-table mutation.
// Idempotent: only touches OPEN disposition_deferred flags for this item. Pass --commit to write.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();
const COMMIT = process.argv.includes("--commit");

const id = (await readAll("intelligence_items", "id")).find((i) => String(i.id).startsWith("50ccd5cc"))?.id;
const { data: it } = await sb.from("intelligence_items").select("provenance_status").eq("id", id).single();
console.log(`50ccd5cc provenance_status=${it.provenance_status}`);
if (it.provenance_status !== "verified") { console.log("ABORT: item is not verified — do not clear the deferral on an unreleased item."); process.exit(1); }

const { data: open } = await sb.from("integrity_flags").select("id,category,created_by,description,status")
  .eq("subject_ref", id).eq("created_by", "disposition_deferred").eq("status", "open");
console.log(`open disposition_deferred flags: ${open?.length || 0}`);
for (const f of open || []) console.log(`  ${f.id} — ${(f.description || "").slice(0, 90)}`);

if (!COMMIT) { console.log("\nDRY RUN — pass --commit to resolve. (will set status=resolved + resolution_note + resolved_at/by)"); process.exit(0); }

for (const f of open || []) {
  const { error } = await sb.from("integrity_flags").update({
    status: "resolved",
    resolved_at: new Date().toISOString(),
    resolved_by: "step2b-skill-labeling-fix",
    resolution_note: "Resolved via the workspace-action labeling fix (system-prompt + env-policy skill): item regenerated under the fixed labeling discipline, provenance gate passed, status=verified. Not deferred/parked — resolved.",
  }).eq("id", f.id);
  console.log(error ? `  ERR ${f.id}: ${error.message}` : `  resolved ${f.id}`);
}
// verify
const { data: after } = await sb.from("integrity_flags").select("status").eq("subject_ref", id).eq("created_by", "disposition_deferred");
console.log("after — disposition_deferred statuses:", JSON.stringify((after || []).map((x) => x.status)));
process.exit(0);
