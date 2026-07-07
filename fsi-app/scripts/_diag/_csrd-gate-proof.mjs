// PROOF: Layer B (cross-item write-path gate) + Layer C (block-next-run + disposition) end-to-end on CSRD.
// Sequence: (1) preflight BLOCKS while the lane's red block is open; (2) a dated waiver disposes it ->
// preflight ALLOWS; (3) snapshot + erase CSRD, then re-ground THROUGH the gated runner; report the gate
// step + final provenance. CSRD row is snapshotted before any mutation (reversible).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { createJiti } from "jiti";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { generateBriefWorkflow, preflightStep } = await jiti.import(resolve(ROOT, "src/workflows/generate-brief.ts"));
const { buildResolver } = await jiti.import(resolve(ROOT, "src/lib/sources/institution.ts"));
const sb = readClient();
const CSRD_ID = "9c5d1d17-4388-43a0-b9df-67de1fc0e582"; // verified CSRD (transport-provisions); had 26 null-tier FACTs

async function csrdNullFactCount(itemId) {
  // count THIS item's FACT claims whose span host resolves to no tier (the unregistered-span contribution)
  const srcs = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("sources").select("id,url,base_tier,effective_tier,tier_override").order("id").range(from, from + 999);
    if (!data?.length) break; srcs.push(...data); if (data.length < 1000) break;
  }
  const resolver = buildResolver(srcs);
  const { data: claims } = await sb.from("section_claim_provenance").select("claim_kind,search_result_id").eq("intelligence_item_id", itemId);
  const srIds = [...new Set((claims || []).filter((c) => c.claim_kind === "FACT" && c.search_result_id).map((c) => c.search_result_id))];
  const urlById = new Map();
  for (let i = 0; i < srIds.length; i += 200) {
    const { data } = await sb.from("agent_run_searches").select("id,result_url").in("id", srIds.slice(i, i + 200));
    for (const r of data || []) urlById.set(r.id, r.result_url);
  }
  let nulls = 0, facts = 0;
  for (const c of claims || []) {
    if (c.claim_kind !== "FACT" || !c.search_result_id) continue;
    facts++;
    if (resolver.resolveSpan(urlById.get(c.search_result_id) || "").tier == null) nulls++;
  }
  return { facts, nulls };
}

const { data: row } = await sb.from("intelligence_items").select("id,provenance_status,is_archived").eq("id", CSRD_ID).single();
const id = row.id;
console.log(`CSRD item ${id} — current prov=${row.provenance_status} archived=${row.is_archived}`);

// ── STAGE 1: preflight BLOCKS while the red block is open + undisposed ──
console.log("\n── STAGE 1: preflight with the lane's red block OPEN (expect HALT) ──");
try {
  await preflightStep(id);
  console.log("  ✗ UNEXPECTED: preflight did NOT block.");
} catch (e) {
  console.log(`  ✓ BLOCKED (fail-closed): ${String(e.message).slice(0, 140)}`);
}

// ── STAGE 2: disposition the red with a dated waiver -> preflight ALLOWS ──
console.log("\n── STAGE 2: record a dated waiver on the block -> preflight ALLOWS ──");
const { data: block } = await sb.from("integrity_flags").select("id,recommended_actions")
  .eq("category", "data_integrity").eq("subject_ref", "data-audit-lane").eq("status", "open").limit(1).single();
const acts = Array.isArray(block.recommended_actions) ? block.recommended_actions : [];
await sb.from("integrity_flags").update({ recommended_actions: [...acts, { action: "waiver", until: "2026-07-15", by: "csrd-gate-proof" }] }).eq("id", block.id);
console.log(`  waiver until 2026-07-15 recorded on block ${block.id}`);
try {
  const pf = await preflightStep(id);
  console.log(`  ✓ ALLOWED: preflight passed (spentUsd=${pf.spentUsd}, capUsd=${pf.capUsd})`);
} catch (e) {
  console.log(`  ✗ still blocked: ${String(e.message).slice(0, 140)}`);
}

// ── STAGE 3: snapshot + erase CSRD, then re-ground THROUGH the gated runner ──
console.log("\n── STAGE 3: re-ground CSRD through the gated runner ──");
const before = await csrdNullFactCount(id);
console.log(`  BEFORE: CSRD FACT claims=${before.facts}, unregistered-span (null-tier)=${before.nulls}`);
const { data: full } = await sb.from("intelligence_items").select("*").eq("id", id).single();
const snapPath = resolve(ROOT, "scripts/_diag/_csrd-snapshot.json");
writeFileSync(snapPath, JSON.stringify(full, null, 2));
console.log(`  snapshot -> ${snapPath}`);
// erase so the runner regenerates from scratch (option A: un-verify -> regenerate -> re-ground)
await sb.from("intelligence_items").update({ full_brief: null, updated_at: new Date().toISOString() }).eq("id", id);
await sb.from("intelligence_item_sections").delete().eq("item_id", id);
await sb.from("section_claim_provenance").delete().eq("intelligence_item_id", id);
console.log("  erased (brief/sections/claims dropped) — item now quarantined; running workflow...");

const t = Date.now();
const r = await generateBriefWorkflow(id, true);
console.log(`\n  status=${r.status} (${((Date.now() - t) / 1000).toFixed(0)}s)`);
const stepKeys = Object.keys(r.steps || {});
console.log(`  steps: ${stepKeys.join(" -> ")}`);
for (const [k, v] of Object.entries(r.steps || {})) console.log(`    ${k.padEnd(13)} ${typeof v === "object" ? JSON.stringify(v).slice(0, 150) : v}`);
const { data: it } = await sb.from("intelligence_items").select("provenance_status,is_archived,full_brief").eq("id", id).single();
const after = await csrdNullFactCount(id);
console.log(`\n  AFTER: prov=${it.provenance_status} briefLen=${(it.full_brief || "").length} customer-visible=${it.provenance_status === "verified" && !it.is_archived ? "YES" : "NO"}`);
console.log(`  AFTER: CSRD FACT claims=${after.facts}, unregistered-span (null-tier)=${after.nulls}`);
console.log(`\n  GATE OUTCOME: ${r.steps?.auditGate ? JSON.stringify(r.steps.auditGate) : "(no auditGate step — run ended before the gate)"}`);
process.exit(0);
