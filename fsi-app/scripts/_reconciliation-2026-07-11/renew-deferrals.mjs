/** Phase 2.1 — drive UNDISPOSITIONED to 0: for every quarantined non-archived item lacking a VALID
 *  future deferral, resolve any stale disposition_deferred flags (clear-flags-when-satisfied: superseded)
 *  and insert a fresh valid RD-6 deferral with a class-appropriate reason. DRY-RUN default; --apply.
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidDeferral, assertValidDeferral } from "../lib/deferral.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");
const DEFER_UNTIL = "2026-10-31";
const OWNER = "operator (Jason)";
const EVENT = "scrape-hold lift / batch-1 re-collection go-line";

const REASONS = {
  floor: "fact_below_authority_floor: walling FACT spans absent verbatim from floor-qualifying stored-pool sources (4b re-home probe 2026-07-11 ~0; ground-only + resynth proofs did not release). Awaiting batch-1 re-fetch of the enacted primary source and re-ground at hold-lift.",
  slot: "missing_required_slot residual after stored-pool passes; awaiting batch-1 re-fetch + re-ground (or re-synthesis) of the primary source at hold-lift.",
  label_prose: "unlabeled_assertion/label-syntax residual baked into section prose; awaiting resynth-path label-contract fix (pipeline), then free re-ground from the stored pool.",
  institution: "institution-shaped item (agency/ministry/programme overview) — awaiting reclassify / register-as-source ruling; if kept, re-ground at hold-lift.",
  mixed: "mixed provenance failures (floor + slot/label); awaiting batch-1 re-fetch of the primary source + re-ground at hold-lift.",
};
const INSTITUTION_KEYS = new Set(["g19", "g27"]); // South Korea MOF (ministry), UN SDGs 9 & 13 (framework overview)

const { data: quar } = await db.from("intelligence_items")
  .select("id, legacy_id, title, item_type").eq("is_archived", false).eq("provenance_status", "quarantined");
const { data: flags } = await db.from("integrity_flags")
  .select("id, subject_ref, recommended_actions, status, created_by")
  .eq("subject_type", "item").eq("created_by", "disposition_deferred").eq("status", "open");
const byItem = new Map();
for (const f of flags || []) { (byItem.get(f.subject_ref) || byItem.set(f.subject_ref, []).get(f.subject_ref)).push(f); }

const now = new Date();
const work = [];
for (const it of quar || []) {
  const fs = byItem.get(it.id) || [];
  const hasValid = fs.some((f) => {
    const ra = f.recommended_actions;
    const payload = Array.isArray(ra) ? ra.find((e) => e?.deferral)?.deferral : (ra?.deferral || ra);
    return payload && isValidDeferral(payload, now).ok;
  });
  if (hasValid) continue;
  // classify by validator failures
  const { data: v } = await db.rpc("validate_item_provenance", { p_item_id: it.id });
  const r = Array.isArray(v) ? v[0] : v;
  const reasons = [...new Set((r?.failures || []).map((f) => f.reason))];
  let cls = "mixed";
  if (INSTITUTION_KEYS.has(it.legacy_id)) cls = "institution";
  else if (reasons.every((x) => x === "fact_below_authority_floor")) cls = "floor";
  else if (reasons.every((x) => x === "missing_required_slot" || x === "no_section_content")) cls = "slot";
  else if (reasons.every((x) => x.includes("label") || x === "unlabeled_assertion")) cls = "label_prose";
  work.push({ ...it, cls, staleFlagIds: fs.map((f) => f.id), failures: reasons });
}
console.log(`quarantined lacking valid deferral: ${work.length}`);
for (const w of work) console.log(`  ${(w.legacy_id || w.id.slice(0, 8)).padEnd(40)} ${w.cls.padEnd(12)} stale=${w.staleFlagIds.length} [${w.failures.join(",")}]`);
for (const w of work) assertValidDeferral({ reason: REASONS[w.cls], deferred_until: DEFER_UNTIL, owner: OWNER, resolution_event: EVENT });
console.log("payloads valid");
if (!APPLY) { console.log("DRY-RUN — pass --apply"); process.exit(0); }

mkdirSync(resolve(ROOT, "scripts/_snapshots"), { recursive: true });
const snap = resolve(ROOT, "scripts/_snapshots", `${new Date().toISOString().replace(/[:.]/g, "-")}_renew-deferrals.jsonl`);
writeFileSync(snap, work.map((w) => JSON.stringify(w)).join("\n") + "\n");

let resolved = 0, inserted = 0;
for (const w of work) {
  for (const fid of w.staleFlagIds) {
    const { error } = await db.from("integrity_flags").update({
      status: "resolved", resolved_at: new Date().toISOString(), resolved_by: "reconciliation-remediation-2026-07-10",
      resolution_note: "superseded: expired deferral renewed with fresh class-reason payload (clock re-set 2026-07-11)",
    }).eq("id", fid);
    if (error) console.error(`resolve FAIL ${fid}: ${error.message}`); else resolved++;
  }
  const payload = { reason: REASONS[w.cls], deferred_until: DEFER_UNTIL, owner: OWNER, resolution_event: EVENT };
  const { error } = await db.from("integrity_flags").insert({
    category: "data_quality", subject_type: "item", subject_ref: w.id,
    description: `Deferral (reconciliation remediation 2026-07-11, ${w.cls}): ${payload.reason.slice(0, 130)}`,
    recommended_actions: [{ deferral: payload }],
    status: "open", created_by: "disposition_deferred",
  });
  if (error) console.error(`insert FAIL ${w.id}: ${error.message}`); else inserted++;
}
console.log(`stale resolved=${resolved} fresh inserted=${inserted}`);
