/** Phase 1.4 disposition — honest quarantine + RD-6 deferral for the unrecovered floor-class.
 *  Mass-flip the still-verified-but-failing items via the sanctioned service trigger path
 *  (guard binds only unverified-origin flips), then write a VALID time-bounded deferral
 *  (disposition_deferred flag) for every quarantined-unreleased item of this program.
 *  No bare quarantine: each deferral names the blocker + disposition path + event + owner.
 *  DRY-RUN default; --apply writes. Snapshot of ids/status to scripts/_snapshots first.
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertValidDeferral } from "../lib/deferral.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");

const DEFER_UNTIL = "2026-10-31";
const OWNER = "operator (Jason)";
const EVENT = "scrape-hold lift / batch-1 re-collection go-line";
const FLOOR_REASON =
  "fact_below_authority_floor: walling FACT spans are absent verbatim from every floor-qualifying stored-pool source " +
  "(4b re-home probe 2026-07-11: ~0 re-homeable; paid ground-only + resynth proofs did not release). Awaiting batch-1 " +
  "re-fetch of the enacted primary source and re-ground at scrape-hold lift.";
const SPECIAL = {
  "8c186db2-ca7c-4b92-8960-3337a4d01b09":
    "resynth from stored pool CLEARED the authority floor; residual unlabeled_assertion + missing_required_slot = " +
    "resynth-path label/slot contract gap (pipeline REFERENCE fix). Awaiting resynth-prompt fix, then free re-ground " +
    "from the stored pool (no fetch needed).",
  "007f42b1-265a-4504-8bd1-ea1557d410ad":
    "planning-framework content grounds in sub-floor sources (campotexas RFP etc.); ground-only + resynth proofs did not " +
    "release. Awaiting batch-1 re-fetch of a floor primary source + re-ground at hold-lift, OR operator ruling on " +
    "item_type (reg-family floor armed unconditionally).",
};

// 1) live still-verified-but-failing set
const { data: verified } = await db.from("intelligence_items")
  .select("id, legacy_id, title, item_type, provenance_status").eq("is_archived", false).eq("provenance_status", "verified");
const flips = [];
for (const it of verified || []) {
  const { data: v } = await db.rpc("validate_item_provenance", { p_item_id: it.id });
  const r = Array.isArray(v) ? v[0] : v;
  if (!r?.valid && r?.recommended_status === "quarantined") flips.push(it);
}
console.log(`to flip (verified-but-failing): ${flips.length}`);

// 2) program's quarantined-unreleased items needing deferrals (the proofs + re-point flips)
const PRIOR = ["007f42b1-265a-4504-8bd1-ea1557d410ad", "8c186db2-ca7c-4b92-8960-3337a4d01b09"];
const { data: priorRows } = await db.from("intelligence_items").select("id, legacy_id, provenance_status").in("id", PRIOR);
const { data: o9g14 } = await db.from("intelligence_items").select("id, legacy_id, provenance_status").in("legacy_id", ["o9", "g14"]);
const deferTargets = [...flips.map((f) => f.id), ...PRIOR, ...(o9g14 || []).map((r) => r.id)];
console.log(`deferral targets: ${deferTargets.length}`);

// validate payloads up-front (fail loud before any write)
for (const id of deferTargets) {
  assertValidDeferral({ reason: SPECIAL[id] || FLOOR_REASON, deferred_until: DEFER_UNTIL, owner: OWNER, resolution_event: EVENT });
}
console.log("all deferral payloads VALID (assertValidDeferral)");

if (!APPLY) { console.log("DRY-RUN — pass --apply"); process.exit(0); }

mkdirSync(resolve(ROOT, "scripts/_snapshots"), { recursive: true });
const snap = resolve(ROOT, "scripts/_snapshots", `${new Date().toISOString().replace(/[:.]/g, "-")}_floor-class-flip-defer.jsonl`);
writeFileSync(snap, [...flips, ...(priorRows || []), ...(o9g14 || [])].map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(`snapshot: ${snap}`);

// 3) flip
let q = 0, bad = 0;
for (const it of flips) {
  const { error } = await db.from("intelligence_items").update({ updated_at: new Date().toISOString() }).eq("id", it.id);
  if (error) { console.error(`flip FAIL ${it.id}: ${error.message}`); bad++; continue; }
  const { data: after } = await db.from("intelligence_items").select("provenance_status").eq("id", it.id).single();
  if (after?.provenance_status === "quarantined") q++; else { console.error(`flip UNEXPECTED ${it.legacy_id || it.id}: ${after?.provenance_status}`); bad++; }
}
console.log(`flips: quarantined=${q} unexpected/fail=${bad}`);

// 4) deferrals (skip if an OPEN valid deferral already exists for the item)
let ins = 0, skip = 0;
for (const id of deferTargets) {
  const { data: existing } = await db.from("integrity_flags").select("id")
    .eq("subject_type", "item").eq("subject_ref", id).eq("status", "open").eq("created_by", "disposition_deferred");
  if ((existing || []).length) { skip++; continue; }
  const payload = { reason: SPECIAL[id] || FLOOR_REASON, deferred_until: DEFER_UNTIL, owner: OWNER, resolution_event: EVENT };
  const { error } = await db.from("integrity_flags").insert({
    category: "data_quality", subject_type: "item", subject_ref: id,
    description: `Deferral (reground program 2026-07-11): ${payload.reason.slice(0, 140)}`,
    recommended_actions: [{ deferral: payload }],
    status: "open", created_by: "disposition_deferred",
  });
  if (error) { console.error(`deferral FAIL ${id}: ${error.message}`); } else ins++;
}
console.log(`deferrals: inserted=${ins} already-present=${skip}`);
process.exit(bad ? 1 : 0);
