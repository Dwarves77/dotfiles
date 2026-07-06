/** FUNDED-PASS RELEASE/DELETION APPLIER (PURE NODE — standing dispatch item 1, binding 3b, 2026-07-06).
 *  Consumes a plan emitted by funded-pass.mjs (loader context) and performs the guarded writes: RELEASE each
 *  flipped item's disposition_deferred flag, and DELETE each identifier-exact held dup-loser. Pure node (no
 *  jiti / spend-client / model calls) — the standing write architecture: loader proposes, this applier writes.
 *
 *  DESTRUCTIVE-OP DISCIPLINE (binding 1a — the byte-compare analog for deletes): eligibility is evaluated LIVE
 *  AT APPLY TIME from FRESH reads, NEVER from the plan/snapshot. Every deletion proposal re-runs the item-1
 *  gate (isDeletableLoser) against fresh survivor + loser rows + the loser's live hold flags + the survivor's
 *  live primary-grounding. identifier-exact+all-gates → guardedDelete (snapshot) → read-back the row is GONE →
 *  HALT on mismatch. ambiguous → surface to integrity_flags, NO delete. topical / gate-fail → skip + named reason.
 *
 *  Usage: node scripts/apply-funded-releases.mjs <plan.json> [--apply]. DRY-RUN default; --apply writes. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { readClient, readAll, guardedUpdate, guardedDelete, guardedInsert } from "./lib/db.mjs";
import { isDeletableLoser, validateReleaseDeletionPlan } from "./lib/funded-release-plan.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const planPath = process.argv.find((a) => a.endsWith(".json"));
if (!planPath) { console.error("usage: node scripts/apply-funded-releases.mjs <plan.json> [--apply]"); process.exit(2); }
const plan = JSON.parse(readFileSync(resolve(planPath), "utf8"));
const sb = readClient();

// ── schema validation: a malformed plan never touches the DB ──
const sv = validateReleaseDeletionPlan(plan);
if (!sv.ok) { console.log(`\n=== PLAN VALIDATION FAILED — refusing to apply (${sv.violations.length}) ===`); for (const v of sv.violations.slice(0, 20)) console.log(`  ${v}`); process.exit(4); }
console.log(`\n=== FUNDED RELEASE/DELETION APPLIER (${APPLY ? "APPLY" : "DRY-RUN"}) === ${plan.releases.length} release(s), ${(plan.deletionProposals || []).length} deletion proposal(s), ${(plan.ambiguous || []).length} ambiguous [schema valid]`);

// live helpers (fresh reads — the binding gate, not the plan's advisory classification)
const isVerified = async (id) => { const { data } = await sb.rpc("validate_item_provenance", { p_item_id: id }); const r = Array.isArray(data) ? data[0] : data; return !!r?.valid; };
const hasFactClaim = async (id) => {
  const secs = await readAll("intelligence_item_sections", "id", { match: (q) => q.eq("item_id", id) });
  if (!secs.length) return false;
  const { data } = await sb.from("section_claim_provenance").select("id").eq("claim_kind", "FACT").in("section_row_id", secs.map((s) => s.id)).limit(1);
  return (data || []).length > 0;
};
const liveHold = async (id) => ((await readAll("integrity_flags", "id", { match: (q) => q.eq("subject_type", "item").eq("subject_ref", id).eq("status", "open").eq("created_by", "phase2_priority_review") })).length > 0);
const rowOf = async (id) => { const { data } = await sb.from("intelligence_items").select("id,legacy_id,title,provenance_status,is_archived,source_url,instrument_identifier").eq("id", id).single(); return data; };

// ── RELEASES: resolve disposition_deferred flags for items that are CURRENTLY verified (live re-check) ──
let released = 0, releaseSkipped = 0;
for (const r of plan.releases) {
  if (!(await isVerified(r.itemId))) { console.log(`  RELEASE ${r.itemKey}: item NOT currently verified — skip (release only on a verified item)`); releaseSkipped++; continue; }
  if (!APPLY) { console.log(`  RELEASE ${r.itemKey}: WOULD resolve deferred flag ${r.flagId.slice(0, 8)}`); continue; }
  const upd = await guardedUpdate("integrity_flags", (qb) => qb.eq("id", r.flagId), { status: "resolved" }, { cite: { skill: "remediation-discipline", reason: `funded-pass RELEASE: ${r.itemKey} flipped to verified — resolve blocked-on-re-ground deferral` } });
  const fresh = readClient();
  const { data: back } = await fresh.from("integrity_flags").select("status").eq("id", r.flagId).single();
  if (upd.updated !== 1 || back?.status !== "resolved") { console.log(`  RELEASE ${r.itemKey}: WRITE DID NOT PERSIST (updated=${upd.updated}, status=${back?.status}) — HALT`); process.exit(3); }
  released++; console.log(`  RELEASE ${r.itemKey}: deferred flag resolved [read-back OK]`);
}

// ── DELETIONS: re-verify LIVE, then guarded-delete the identifier-exact held dup-loser ──
let deleted = 0, surfaced = 0, delSkipped = 0;
const proposals = [...(plan.deletionProposals || []), ...(plan.ambiguous || [])]; // re-evaluate BOTH live
const seen = new Set();
for (const d of proposals) {
  if (seen.has(d.loserId)) continue; seen.add(d.loserId);
  const [survivor, loser] = [await rowOf(d.survivorId), await rowOf(d.loserId)];
  if (!survivor || !loser) { console.log(`  DELETE ${d.loserKey}: survivor/loser row missing live — skip`); delSkipped++; continue; }
  const survivorHasPrimaryGrounding = (await isVerified(survivor.id)) && (await hasFactClaim(survivor.id));
  const loserHasHold = await liveHold(loser.id);
  const gate = isDeletableLoser({ survivor, loser, survivorHasPrimaryGrounding, loserHasHold });
  if (!gate.ok) {
    if (gate.bucket === "ambiguous") {
      // surface to integrity_flags (idempotent by created_by+subject_ref), never delete
      const existing = await readAll("integrity_flags", "id", { match: (q) => q.eq("subject_type", "item").eq("subject_ref", loser.id).eq("status", "open").eq("created_by", "funded-pass-dedup-ambiguous") });
      if (!existing.length && APPLY) {
        await guardedInsert("integrity_flags", {
          category: "data_integrity", subject_type: "item", subject_ref: loser.id, status: "open", created_by: "funded-pass-dedup-ambiguous",
          description: `Ambiguous dedup pairing with survivor ${d.survivorKey}: conflicting declared instrument identity. NOT auto-deleted — needs operator review of instrument identity before any deletion.`,
          recommended_actions: [{ action: "review_instrument_identity", rationale: gate.reason, survivor: d.survivorId }],
        }, { cite: { skill: "remediation-discipline", reason: `funded-pass: surface ambiguous dedup pairing ${d.loserKey}/${d.survivorKey} (no delete)` } });
      }
      surfaced++; console.log(`  DELETE ${d.loserKey}: AMBIGUOUS → surfaced to integrity_flags, NOT deleted — ${gate.reason}`);
    } else { delSkipped++; console.log(`  DELETE ${d.loserKey}: REFUSED (${gate.bucket}) — ${gate.reason}`); }
    continue;
  }
  if (!APPLY) { console.log(`  DELETE ${d.loserKey}: WOULD delete (survivor ${d.survivorKey} verified+grounded; ${gate.reason})`); continue; }
  const del = await guardedDelete("intelligence_items", [loser.id], { cite: { skill: "remediation-discipline", reason: `funded-pass survivor-deletion: identifier-exact held dup-loser ${d.loserKey} of verified survivor ${d.survivorKey} (${gate.bucket})` } });
  const fresh = readClient();
  const { data: back } = await fresh.from("intelligence_items").select("id").eq("id", loser.id);
  if (del.deleted !== 1 || (back || []).length !== 0) { console.log(`  DELETE ${d.loserKey}: ROW NOT GONE (deleted=${del.deleted}, back=${(back || []).length}) — HALT`); process.exit(3); }
  deleted++; console.log(`  DELETE ${d.loserKey}: held dup-loser deleted [read-back: row gone] (snapshot ${del.snapshot})`);
}

console.log(`\n=== DONE === releases: ${released} applied / ${releaseSkipped} skipped | deletions: ${deleted} applied / ${surfaced} surfaced / ${delSkipped} skipped`);
if (!APPLY) console.log(`DRY-RUN — pass --apply to write the plan.`);
process.exit(0);
