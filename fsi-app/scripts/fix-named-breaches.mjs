/** IMMEDIATE GUARDED FIX for the two named fabricate-via-error-page breaches (dispatch item 2, 2026-07-06).
 *  355af9e8 + 6f1e6615 are VERIFIED with a tier-1 FACT whose source_span is literally "Page Not Found …",
 *  grounded to a EUR-Lex 404 capture. INVALIDATE those claims (the span is error text — not 4b-re-pointable,
 *  no genuine source contains "Page Not Found" as a binding fact), re-validate, and QUARANTINE if that is the
 *  honest outcome (a required slot was covered by the fake FACT). Pure-node guarded: guardedDelete snapshots
 *  the claim rows + read-back confirms gone; guardedUpdate sets status with read-back; a breach integrity_flag
 *  is emitted. DRY-RUN default; --apply writes. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, readAll, guardedDelete, guardedUpdate, guardedInsert } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const sb = readClient();
const NAMED = ["355af9e8", "6f1e6615"];
const IS_404 = (t) => /Page Not Found|page you are looking for was moved or doesn't exist/i.test(t || "");

const items = await readAll("intelligence_items", "id,legacy_id,provenance_status");
const reval = async (id) => { const { data } = await sb.rpc("validate_item_provenance", { p_item_id: id }); const r = Array.isArray(data) ? data[0] : data; return { valid: !!r?.valid, reasons: [...new Set((r?.failures || []).map((f) => f.reason))] }; };

for (const k of NAMED) {
  const it = items.find((x) => x.id.slice(0, 8) === k);
  if (!it) { console.log(`${k}: NOT FOUND`); continue; }
  // FACT claims whose grounded capture is a 404 page (the fabrications)
  const facts = await readAll("section_claim_provenance", "id,source_span,search_result_id,source_tier_at_grounding", { match: (q) => q.eq("intelligence_item_id", it.id).eq("claim_kind", "FACT") });
  const badIds = [];
  for (const f of facts) {
    if (!f.search_result_id) continue;
    const { data: cap } = await sb.from("agent_run_searches").select("result_content_excerpt").eq("id", f.search_result_id).maybeSingle();
    if (cap && IS_404(cap.result_content_excerpt)) badIds.push({ id: f.id, tier: f.source_tier_at_grounding, span: String(f.source_span || "").slice(0, 60) });
  }
  const before = await reval(it.id);
  console.log(`\n=== ${k} (${it.legacy_id || ""}) status=${it.provenance_status} valid=${before.valid} ===`);
  console.log(`  fabricated FACT claims (grounded to a 404): ${badIds.length}`);
  for (const b of badIds) console.log(`    claim ${b.id.slice(0, 8)} tier=${b.tier} span="${b.span}"`);
  if (!badIds.length) { console.log(`  nothing to invalidate.`); continue; }
  if (!APPLY) { console.log(`  DRY-RUN — would delete ${badIds.length} claim(s), re-validate, quarantine-if-invalid.`); continue; }

  // 1. guarded-delete the fabricated claims + read-back gone
  const del = await guardedDelete("section_claim_provenance", badIds.map((b) => b.id), { cite: { skill: "source-credibility-model", reason: `item-2 breach fix: invalidate FACT(s) grounded to a EUR-Lex 404 ("Page Not Found") on ${k} — fabricate-via-error-page` } });
  const fresh = readClient();
  const { data: still } = await fresh.from("section_claim_provenance").select("id").in("id", badIds.map((b) => b.id));
  if (del.deleted !== badIds.length || (still || []).length !== 0) { console.log(`  HALT: delete not fully persisted (deleted=${del.deleted}, remaining=${(still || []).length})`); process.exit(3); }
  console.log(`  invalidated ${del.deleted} claim(s) [read-back: gone] (snapshot ${del.snapshot})`);

  // 2. re-validate → quarantine if now invalid
  const after = await reval(it.id);
  console.log(`  re-validate: valid=${after.valid} remaining=[${after.reasons.join(",") || "CLEAR"}]`);
  if (!after.valid && it.provenance_status === "verified") {
    const upd = await guardedUpdate("intelligence_items", (qb) => qb.eq("id", it.id), { provenance_status: "quarantined" }, { cite: { skill: "source-credibility-model", reason: `item-2 breach fix: ${k} no longer validly grounded after invalidating error-page FACT(s) — honest quarantine` } });
    const { data: back } = await fresh.from("intelligence_items").select("provenance_status").eq("id", it.id).single();
    if (upd.updated !== 1 || back?.provenance_status !== "quarantined") { console.log(`  HALT: status write not persisted`); process.exit(3); }
    console.log(`  QUARANTINED [read-back OK]`);
    await guardedInsert("integrity_flags", {
      category: "data_integrity", subject_type: "item", subject_ref: it.id, status: "open", created_by: "error-page-breach",
      description: `Fabricate-via-error-page breach: ${badIds.length} tier-1 FACT(s) were grounded to a EUR-Lex 404 ("Page Not Found"). Invalidated + re-quarantined ${new Date().toISOString().slice(0, 10)}. Re-fetch the correct instrument URL at hold-lift, re-ground, re-validate.`,
      recommended_actions: [{ action: "refetch_correct_url", rationale: "the stored capture is a 404; seek the correct EUR-Lex/CELEX URL, re-ground" }],
    }, { cite: { skill: "source-credibility-model", reason: `item-2 breach: flag ${k} error-page breach for re-fetch` } });
    console.log(`  breach flag emitted.`);
  } else if (after.valid) {
    console.log(`  item REMAINS verified (other FACTs cover the required slots) — breach claim removed, no re-quarantine.`);
  }
}
console.log(`\n${APPLY ? "APPLIED" : "DRY-RUN"} — done.`);
process.exit(0);
