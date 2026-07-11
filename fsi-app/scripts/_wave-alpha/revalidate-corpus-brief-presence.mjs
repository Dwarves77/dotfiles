/**
 * Wave-α Track B9 / plan A8 — corpus revalidation for the new brief-presence criterion (6).
 *
 * RD-5 ("status is a cache"): migration 171 adds criterion 6 to validate_item_provenance. Stored
 * `provenance_status` is a CACHE of the gate result, recomputed only on write — so the 5 verified-live
 * items with NULL full_brief stay 'verified' until a write re-runs the gate. This script IS that write:
 * it re-validates every verified+non-archived item and honest-quarantines the ones the NEW gate now fails
 * for `missing_full_brief`, each with a VALID RD-6 deferral (never a bare quarantine).
 *
 * The orchestrator runs it AFTER migration 171 is applied. DRY-RUN by default; --apply writes.
 *
 * Mechanism (mirrors scripts/_reconciliation-2026-07-11/flip-and-defer-floor-class.mjs, the proven path):
 *   - flip = touch updated_at via the service client; the set_provenance_status trigger recomputes status
 *     (guard_provenance_flip binds only unverified-origin flips — this population is verified-origin, so
 *     the service trigger path is sanctioned).
 *   - deferral = an integrity_flags row (created_by='disposition_deferred', recommended_actions=[{deferral}])
 *     whose payload passes assertValidDeferral (RD-6): reason names the missing-brief blocker + the C7
 *     regeneration / batch-1 disposition path; deferred_until 2026-10-31; owner operator; named resolution event.
 *
 * Rule-012: import.meta.url-relative env load, no hardcoded absolute paths.
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
const EVENT = "C7 brief regeneration / batch-1 re-collection go-line (scrape-hold lift)";
const BRIEF_REASON =
  "missing_full_brief: item is verified but full_brief is NULL/empty, so the customer detail surface " +
  "renders an empty page. Awaiting C7 brief re-synthesis (re-generate the brief through the canonical " +
  "pipeline) or batch-1 re-collection at scrape-hold lift.";

function failures(v) {
  const r = Array.isArray(v) ? v[0] : v;
  let f = r?.failures ?? [];
  if (typeof f === "string") { try { f = JSON.parse(f); } catch { f = []; } }
  return { valid: !!r?.valid, recommended: r?.recommended_status, failures: Array.isArray(f) ? f : [] };
}

async function main() {
  console.log(`[b9-revalidate] mode = ${APPLY ? "APPLY" : "DRY-RUN"}`);

  const { data: verified, error } = await db
    .from("intelligence_items")
    .select("id, legacy_id, title")
    .eq("is_archived", false)
    .eq("provenance_status", "verified");
  if (error) { console.error("[b9-revalidate] load failed:", error.message); process.exit(1); }
  console.log(`[b9-revalidate] verified+non-archived: ${(verified || []).length}`);

  const missingBrief = [];   // criterion-6 failers (the target class)
  const otherNewInvalid = []; // any OTHER now-invalid (should be none post-reconciliation) — surfaced, NOT flipped
  for (const it of verified || []) {
    const { data: v } = await db.rpc("validate_item_provenance", { p_item_id: it.id });
    const res = failures(v);
    if (res.valid) continue;
    const hasBriefFail = res.failures.some((x) => x?.reason === "missing_full_brief");
    const onlyBriefFail = res.failures.every((x) => x?.reason === "missing_full_brief");
    if (hasBriefFail && onlyBriefFail) missingBrief.push(it);
    else otherNewInvalid.push({ ...it, failures: res.failures });
  }
  console.log(`[b9-revalidate] missing_full_brief (target): ${missingBrief.length}`);
  missingBrief.forEach((m) => console.log(`   - ${m.legacy_id || m.id} :: ${m.title}`));
  if (otherNewInvalid.length) {
    console.warn(`[b9-revalidate] SURFACED — ${otherNewInvalid.length} item(s) now-invalid for reasons OTHER than / in addition to missing_full_brief (NOT flipped here — investigate):`);
    otherNewInvalid.forEach((o) => console.warn(`   ! ${o.legacy_id || o.id}: ${JSON.stringify(o.failures)}`));
  }

  // Validate all deferral payloads up-front (fail loud before any write).
  for (const it of missingBrief) {
    assertValidDeferral({ reason: BRIEF_REASON, deferred_until: DEFER_UNTIL, owner: OWNER, resolution_event: EVENT });
  }
  console.log("[b9-revalidate] deferral payload VALID (assertValidDeferral)");

  if (!APPLY) { console.log("[b9-revalidate] DRY-RUN — pass --apply to flip + defer"); return; }

  mkdirSync(resolve(ROOT, "scripts/_snapshots"), { recursive: true });
  const snap = resolve(ROOT, "scripts/_snapshots", `${new Date().toISOString().replace(/[:.]/g, "-")}_b9-brief-presence.jsonl`);
  writeFileSync(snap, missingBrief.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`[b9-revalidate] snapshot: ${snap}`);

  let q = 0, bad = 0, ins = 0, skip = 0;
  for (const it of missingBrief) {
    const { error: fe } = await db.from("intelligence_items").update({ updated_at: new Date().toISOString() }).eq("id", it.id);
    if (fe) { console.error(`[b9-revalidate] flip FAIL ${it.id}: ${fe.message}`); bad++; continue; }
    const { data: after } = await db.from("intelligence_items").select("provenance_status").eq("id", it.id).single();
    if (after?.provenance_status === "quarantined") q++;
    else { console.error(`[b9-revalidate] flip UNEXPECTED ${it.legacy_id || it.id}: ${after?.provenance_status}`); bad++; }

    const { data: existing } = await db.from("integrity_flags").select("id")
      .eq("subject_type", "item").eq("subject_ref", it.id).eq("status", "open").eq("created_by", "disposition_deferred");
    if ((existing || []).length) { skip++; continue; }
    const payload = { reason: BRIEF_REASON, deferred_until: DEFER_UNTIL, owner: OWNER, resolution_event: EVENT };
    const { error: de } = await db.from("integrity_flags").insert({
      category: "data_quality", subject_type: "item", subject_ref: it.id,
      description: `Deferral (Wave-a B9 brief-presence 2026-07-11): ${payload.reason.slice(0, 140)}`,
      recommended_actions: [{ deferral: payload }],
      status: "open", created_by: "disposition_deferred",
    });
    if (de) console.error(`[b9-revalidate] deferral FAIL ${it.id}: ${de.message}`); else ins++;
  }
  console.log(`[b9-revalidate] flips: quarantined=${q} unexpected/fail=${bad} | deferrals: inserted=${ins} already-present=${skip}`);
  process.exit(bad ? 1 : 0);
}

main().catch((e) => { console.error("[b9-revalidate] fatal:", e); process.exit(1); });
