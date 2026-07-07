// PROVE-ON-ONE harness for the BACKWARD promote-from-pool operation, on the live CBAM item
// (51b2c91e, type=regulation). Mirrors _ppwr-prove.mjs but with CBAM's gold-standard qualifications
// and the CBAM legal-line negative check (the brief must NOT assert the workspace IS the "importer"
// or "authorised CBAM declarant" — defined roles, a legal determination routed to counsel).
// Modes (cheapest first):
//   node scripts/_diag/_cbam-prove.mjs fetch <enacted-url>   # FREE: download-full + back-of-doc presence (no Sonnet, no mutation)
//   node scripts/_diag/_cbam-prove.mjs full                  # SPENDS ~$1-1.5; mutates 51b2c91e (generate->section->ground + density scan)
//   node scripts/_diag/_cbam-prove.mjs show                  # FREE: semantic spot-check of the actual prose
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const P = await jiti.import("../../src/lib/agent/canonical-pipeline.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const mode = process.argv[2] || "fetch";
const { data: rows } = await sb.from("intelligence_items").select("id,title,item_type,source_url,provenance_status")
  .or("title.ilike.%CBAM%,title.ilike.%carbon border%");
const it = (rows || []).find((r) => r.id.startsWith("51b2c91e")) || (rows || []).find((r) => r.item_type === "regulation");
if (!it) { console.error("CBAM item 51b2c91e not found"); process.exit(1); }
console.log(`CBAM ${it.id.slice(0, 8)} type=${it.item_type} status=${it.provenance_status}\n  source=${it.source_url}\n  PRIMARY_MAX_CHARS=${process.env.PRIMARY_MAX_CHARS || "600000(default)"}  mode=${mode}\n`);

// back-of-document strings that only appear if the FULL enacted CELEX:32023R0956 text was read
// (Annexes + late articles: Annex I covered goods, the free-allowance phase-out, the review clause).
const BACK_OF_DOC = ["hydrogen", "31 December 2025", "Annex III", "default values", "review"];

if (mode === "fetch") {
  const url = process.argv[3] || it.source_url;
  console.log(`  fetch url=${url}${process.argv[3] ? " (OVERRIDE — enacted text, pre-promote proof)" : ""}\n`);
  const pf = await P.fetchPrimaryDeep({ title: it.title, primaryUrl: url, itemType: it.item_type });
  console.log(`FETCH: collected=${pf.text.length}  fullLength=${pf.fullLength}  truncated=${pf.truncated}  cap=${pf.cap}  fellBack=${pf.fellBack}  reason=${pf.primaryReason}`);
  console.log(`  back-of-document presence in the FETCHED text:`);
  for (const probe of BACK_OF_DOC) console.log(`    ${pf.text.includes(probe) ? "PRESENT" : "absent "}  "${probe}"  (idx ${pf.text.indexOf(probe)})`);
}

if (mode === "full") {
  const g = await P.generateBrief(it.id); console.log(`generate: ${g.ok ? "OK" : "FAIL"} — ${g.detail}`);
  if (g.ok) {
    const s = await P.sectionBrief(it.id); console.log(`section : ${s.ok ? "OK" : "FAIL"} — ${s.detail}`);
    if (s.ok) { const r = await P.groundBrief(it.id); console.log(`ground  : ${r.ok ? "OK" : "FAIL"} — ${r.detail}`); }
  }
  const { data: fin } = await sb.from("intelligence_items").select("provenance_status, full_brief").eq("id", it.id).single();
  const b = fin.full_brief || "";
  const { count: cc } = await sb.from("section_claim_provenance").select("id", { count: "exact", head: true }).eq("intelligence_item_id", it.id);
  console.log(`\nFINAL: status=${fin.provenance_status}  brief=${b.length}ch  claims=${cc}`);
  console.log(`\nQUALIFICATION-DENSITY SCAN (CBAM gold standard — Reg (EU) 2023/956):`);
  const probes = [
    ["transitional period 2023-2025 (reporting only)", /transitional period|1 october 2023|reporting only|reporting obligation/gi],
    ["definitive regime from 2026", /\b2026\b/gi],
    ["covered goods (cement/steel/aluminium/fertiliser/electricity/hydrogen)", /cement|alumini|fertilis|hydrogen|iron and steel/gi],
    ["embedded emissions + default values", /embedded emissions|default value/gi],
    ["de minimis / low-value carve-out", /de minimis|negligible value|150\b|EUR ?150/gi],
    ["free-allowance phase-out trajectory (2026-2034)", /free allowance|phase[- ]?out|2034/gi],
    ["carbon price already paid deduction", /carbon price|price (already )?paid|paid in the country of origin/gi],
    ["defined-term anchoring (Article 3)", /article 3|art\.? ?3\b/gi],
    ["legal-line routed to counsel", /Legal Confirmation Required/gi],
    ["exception / carve-out clauses", /\bexcept\b|shall not apply|does not apply/gi],
  ];
  for (const [label, re] of probes) {
    const n = (b.match(re) || []).length;
    console.log(`  ${n > 0 ? "✓" : "✗"} ${label}  (${n} hits)`);
  }
  // legal-line NEGATIVE check: the brief must NOT assert the workspace IS the importer / authorised CBAM declarant.
  const overstep = /workspace (is|as) (the |an |a )?(importer|authorised cbam declarant|cbam declarant|declarant)|the workspace is (a|an|the) (importer|declarant)/gi;
  const ov = (b.match(overstep) || []);
  console.log(`  ${ov.length === 0 ? "✓" : "✗"} legal line held: no "workspace IS the importer/declarant" assertion  (${ov.length} overstep hits${ov.length ? ": " + ov.slice(0, 3).join(" | ") : ""})`);
}

if (mode === "show") {
  const { data: fin } = await sb.from("intelligence_items").select("full_brief").eq("id", it.id).single();
  const b = fin.full_brief || "";
  const ctx = (needle, win = 340) => {
    const i = b.toLowerCase().indexOf(needle.toLowerCase());
    return i < 0 ? `(not found: "${needle}")` : "…" + b.slice(Math.max(0, i - 60), i + win).replace(/\s+/g, " ").trim() + "…";
  };
  console.log("\n=== SEMANTIC SPOT-CHECK (actual prose, not token counts) ===");
  for (const probe of ["transitional period", "free allowance", "default values", "authorised CBAM declarant", "importer", "Legal Confirmation Required", "de minimis"]) {
    console.log(`\n[${probe}]\n  ${ctx(probe)}`);
  }
}
process.exit(0);
