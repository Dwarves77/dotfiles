/** ERROR-BODY CLAIM REMEDIATION — APPLIER (PURE NODE). Dispatch item 1 (2026-07-06). Consumes the judge plan and
 *  does the guarded writes: 4b RE-POINT (guardedUpdate search_result_id + tier, read-back) or INVALIDATE
 *  (guardedDelete, read-back gone). Re-validates every touched item; a verified item that drops re-quarantines
 *  with an honest reason (status on EVIDENCE). Updates the completeness-exposure flag (resolved if remained-
 *  verified, else keeps it open with the dropped note). DRY-RUN default; --apply writes. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { readClient, readAll, guardedUpdate, guardedDelete } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const planPath = process.argv.find((a) => a.endsWith(".json"));
if (!planPath) { console.error("usage: node scripts/apply-errorbody-remediation.mjs <plan.json> [--apply]"); process.exit(2); }
const { plan, items: touched } = JSON.parse(readFileSync(resolve(planPath), "utf8"));
const sb = readClient();
const reval = async (id) => { const { data } = await sb.rpc("validate_item_provenance", { p_item_id: id }); const r = Array.isArray(data) ? data[0] : data; return { valid: !!r?.valid, reasons: [...new Set((r?.failures || []).map((f) => f.reason))] }; };

console.log(`\n=== ERROR-BODY REMEDIATION APPLIER (${APPLY ? "APPLY" : "DRY-RUN"}) === ${plan.length} claim(s), ${touched.length} item(s)`);
const invalidate = plan.filter((p) => p.action === "invalidate");
const repoint = plan.filter((p) => p.action === "repoint");
if (!APPLY) { console.log(`  would: INVALIDATE ${invalidate.length}, RE-POINT ${repoint.length}, then re-validate ${touched.length} items.`); process.exit(0); }

// 1. RE-POINT (guardedUpdate + read-back)
for (const p of repoint) {
  const upd = await guardedUpdate("section_claim_provenance", (qb) => qb.eq("id", p.claimId), { search_result_id: p.newSearchResultId, source_tier_at_grounding: p.newTier }, { cite: { skill: "source-credibility-model", reason: `error-body 4b re-point: ${p.itemKey} claim to genuine ${p.newHost} (T${p.newTier})` } });
  const fresh = readClient(); const { data: back } = await fresh.from("section_claim_provenance").select("search_result_id,source_tier_at_grounding").eq("id", p.claimId).single();
  if (upd.updated !== 1 || back?.search_result_id !== p.newSearchResultId) { console.log(`  RE-POINT ${p.claimId.slice(0,8)}: NOT PERSISTED — HALT`); process.exit(3); }
}
// 2. INVALIDATE (guardedDelete + read-back gone) — batch by ids
if (invalidate.length) {
  const ids = invalidate.map((p) => p.claimId);
  const del = await guardedDelete("section_claim_provenance", ids, { cite: { skill: "source-credibility-model", reason: `error-body remediation: invalidate ${ids.length} FACT(s) grounded to failed-fetch captures (fabricate-via-error-page)` } });
  const fresh = readClient(); const { data: still } = await fresh.from("section_claim_provenance").select("id").in("id", ids);
  if (del.deleted !== ids.length || (still || []).length !== 0) { console.log(`  INVALIDATE: NOT FULLY GONE (deleted=${del.deleted}, remaining=${(still||[]).length}) — HALT`); process.exit(3); }
  console.log(`  invalidated ${del.deleted} claim(s) [read-back: gone]`);
}
// 3. re-validate every touched item; status on evidence
let remained = 0, dropped = 0; const droppedItems = [];
for (const id of touched) {
  const { legacy_id, provenance_status } = (await readAll("intelligence_items", "id,legacy_id,provenance_status", { match: (q) => q.eq("id", id) }))[0] || {};
  const key = legacy_id || id.slice(0, 8);
  const after = await reval(id);
  if (after.valid) { remained++; }
  else if (provenance_status === "verified") {
    const upd = await guardedUpdate("intelligence_items", (qb) => qb.eq("id", id), { provenance_status: "quarantined" }, { cite: { skill: "source-credibility-model", reason: `error-body remediation: ${key} lost coverage after invalidating error-grounded FACT(s) — honest quarantine [${after.reasons.join(",")}]` } });
    const fresh = readClient(); const { data: back } = await fresh.from("intelligence_items").select("provenance_status").eq("id", id).single();
    if (upd.updated !== 1 || back?.provenance_status !== "quarantined") { console.log(`  ${key}: status write NOT persisted — HALT`); process.exit(3); }
    dropped++; droppedItems.push(`${key}[${after.reasons.join(",")}]`);
  } else { dropped++; droppedItems.push(`${key}[already ${provenance_status}]`); }
  // 4. update the completeness-exposure flag
  const flags = await readAll("integrity_flags", "id", { match: (q) => q.eq("subject_type", "item").eq("subject_ref", id).eq("status", "open").eq("created_by", "completeness-exposure") });
  for (const fl of flags) {
    await guardedUpdate("integrity_flags", (qb) => qb.eq("id", fl.id), after.valid ? { status: "resolved", description: `Error-body FACT(s) invalidated ${new Date().toISOString().slice(0,10)}; item REMAINS verified on real FACTs. Any residual cat-1/cat-2 tracked in the work order.`.slice(0,480) } : { description: `Error-body FACT(s) invalidated ${new Date().toISOString().slice(0,10)}; item DROPPED to quarantined — re-fetch + re-ground at hold-lift.`.slice(0,480) }, { cite: { skill: "remediation-discipline", reason: `error-body remediation outcome for ${key}` } });
  }
}
console.log(`\n=== DONE === remained-verified: ${remained} | dropped-to-quarantined: ${dropped} | re-pointed: ${repoint.length} | invalidated: ${invalidate.length}`);
if (droppedItems.length) console.log(`  dropped: ${droppedItems.join(", ")}`);
process.exit(0);
