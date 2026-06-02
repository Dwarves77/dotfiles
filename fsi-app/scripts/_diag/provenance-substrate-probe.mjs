/**
 * provenance-substrate-probe.mjs  — READ-ONLY diagnostic.
 *
 * Answers the one question that decides whether "re-ground the 109" is a
 * cheap data-op or a pipeline-build: does the per-claim provenance SUBSTRATE
 * (section_claim_provenance rows with spans/slot_keys, agent_run_searches rows
 * linking cited URLs to items) exist for ANY item — or is the whole corpus
 * pre-substrate, so every "pass" today is the vacuous 0-section skip?
 *
 * Writes nothing.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..", "..");
const envText = readFileSync(resolve(APP_ROOT, ".env.local"), "utf8");
const env = (k) => envText.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const headCount = async (table, build = (q) => q) => {
  const { count, error } = await build(supabase.from(table).select("*", { count: "exact", head: true }));
  if (error) return `ERR(${error.message})`;
  return count;
};

console.log("=".repeat(70));
console.log("PROVENANCE SUBSTRATE PROBE (read-only)");
console.log("=".repeat(70));

// 1. Do the substrate tables have ANY rows?
console.log("\n── Substrate table population ──");
console.log(`section_claim_provenance total rows        : ${await headCount("section_claim_provenance")}`);
console.log(`  ... of kind FACT                          : ${await headCount("section_claim_provenance", (q) => q.eq("claim_kind", "FACT"))}`);
console.log(`agent_run_searches total rows              : ${await headCount("agent_run_searches")}`);
console.log(`agent_run_searches w/ intelligence_item_id : ${await headCount("agent_run_searches", (q) => q.not("intelligence_item_id", "is", null))}`);
console.log(`agent_run_searches w/ result_content_excerpt: ${await headCount("agent_run_searches", (q) => q.not("result_content_excerpt", "is", null))}`);
console.log(`intelligence_item_sections (non-empty)     : ${await headCount("intelligence_item_sections", (q) => q.not("content_md", "is", null))}`);
console.log(`item_type_required_slots rows              : ${await headCount("item_type_required_slots")}`);

// 2. How many DISTINCT items carry any claim-provenance row?
const { data: claimRows, error: claimErr } = await supabase
  .from("section_claim_provenance")
  .select("intelligence_item_id")
  .limit(100000);
if (claimErr) {
  console.log(`\n[claim distinct] ERR ${claimErr.message}`);
} else {
  const distinct = new Set((claimRows || []).map((r) => r.intelligence_item_id));
  console.log(`\nDISTINCT items with >=1 section_claim_provenance row: ${distinct.size}`);
}

// 3. Flagship deep-dive: CBAM, FuelEU, CSRD, ReFuelEU, EU ETS.
const FLAGSHIP_PATTERNS = ["CBAM", "FuelEU", "CSRD", "ReFuelEU", "Emissions Trading", "Carbon Border"];
console.log("\n── Flagship deep-dive ──");
for (const pat of FLAGSHIP_PATTERNS) {
  const { data: items } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, title, priority, provenance_status, item_type, source_id, source_url, is_archived")
    .ilike("title", `%${pat}%`)
    .eq("is_archived", false)
    .limit(3);
  for (const it of items || []) {
    const secCount = await headCount("intelligence_item_sections", (q) =>
      q.eq("item_id", it.id).not("content_md", "is", null)
    );
    const claimCount = await headCount("section_claim_provenance", (q) => q.eq("intelligence_item_id", it.id));
    const searchCount = await headCount("agent_run_searches", (q) => q.eq("intelligence_item_id", it.id));
    const { data: vr } = await supabase.rpc("validate_item_provenance", { p_item_id: it.id });
    const r = Array.isArray(vr) ? vr[0] : vr;
    const failures = Array.isArray(r?.failures) ? r.failures : [];
    const byReason = {};
    for (const f of failures) byReason[`c${f.criterion}:${f.reason}`] = (byReason[`c${f.criterion}:${f.reason}`] || 0) + 1;
    const sampleUrls = failures.filter((f) => f.reason === "ungrounded_url").slice(0, 3).map((f) => f.url);
    console.log(`\n[${it.legacy_id || it.id.slice(0, 8)}] "${(it.title || "").slice(0, 48)}"`);
    console.log(`   priority=${it.priority}  status=${it.provenance_status}  type=${it.item_type}  source_id=${it.source_id ? "set" : "NULL"}  source_url=${it.source_url ? "set" : "NULL"}`);
    console.log(`   sections(non-empty)=${secCount}  claim_provenance=${claimCount}  agent_searches=${searchCount}`);
    console.log(`   recommended=${r?.recommended_status}  failures=${failures.length}  byReason=${JSON.stringify(byReason)}`);
    if (sampleUrls.length) console.log(`   sample ungrounded URLs: ${sampleUrls.join("  |  ")}`);
  }
}

// 4. Confirm the 207 verified are 0-section; sample their section counts.
console.log("\n── Verified-status sample (expect 0-section shells) ──");
const { data: verified } = await supabase
  .from("intelligence_items")
  .select("id, legacy_id, title, priority")
  .eq("provenance_status", "verified")
  .eq("is_archived", false)
  .limit(10);
for (const it of verified || []) {
  const secCount = await headCount("intelligence_item_sections", (q) =>
    q.eq("item_id", it.id).not("content_md", "is", null)
  );
  console.log(`   [${it.legacy_id || it.id.slice(0, 8)}] pri=${it.priority} sections=${secCount}  "${(it.title || "").slice(0, 44)}"`);
}

console.log("\nDONE (read-only).");
