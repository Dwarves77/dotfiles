// PROVE-ON-ONE harness for the truncation fix, on the live PPWR item (efdb3390, type=regulation).
// Modes (cheapest first):
//   node scripts/_diag/_ppwr-prove.mjs fetch     # download-full proof: collected vs full + back-of-doc presence (no Sonnet, no mutation)
//   STORAGE_MAX_CHARS=80000 node scripts/_diag/_ppwr-prove.mjs fetch   # truncated-signal proof: cap < doc → truncated:true (ADR-016 sanity ceiling)
//   node scripts/_diag/_ppwr-prove.mjs full      # full generate→section→ground + qualification-density scan (SPENDS ~$1-1.5; mutates efdb3390)
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
  .or("legacy_id.eq.g2,legacy_id.ilike.%ppwr%,title.ilike.%packaging%,title.ilike.%PPWR%");
const it = (rows || []).find((r) => r.id.startsWith("efdb3390")) || (rows || []).find((r) => r.item_type === "regulation");
if (!it) { console.error("PPWR item efdb3390 not found"); process.exit(1); }
console.log(`PPWR ${it.id.slice(0, 8)} type=${it.item_type} status=${it.provenance_status}\n  source=${it.source_url}\n  STORAGE_MAX_CHARS=${process.env.STORAGE_MAX_CHARS || "10000000(default)"}  mode=${mode}\n`);

const BACK_OF_DOC = ["2038", "average per manufacturing plant", "Grade C", "CANNOT BE PLACED ON THE MARKET", "placed on the market"];

const overrideUrl = process.argv[3]; // optional: test the ENACTED-TEXT url instead of the item's (portal) source_url

if (mode === "fetch") {
  const url = overrideUrl || it.source_url;
  console.log(`  fetch url=${url}${overrideUrl ? " (OVERRIDE — enacted text)" : ""}\n`);
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
  console.log(`\nQUALIFICATION-DENSITY SCAN (against the CORRECTED gold standard):`);
  const probes = [
    ["2038 Grade-C market ban", /2038/gi],
    ["per-plant-per-year averaging basis", /average per manufacturing plant/gi],
    ["Grade C / 70% threshold", /grade c/gi],
    ["per-year trajectory (2030/2035/2038)", /203[058]/gi],
    ["defined-term anchoring (Article 3)", /article 3|art\.? ?3\b/gi],
    ["legal-line routed to counsel", /Legal Confirmation Required/gi],
    ["exception / carve-out clauses", /\bexcept\b|shall not apply/gi],
  ];
  for (const [label, re] of probes) {
    const n = (b.match(re) || []).length;
    console.log(`  ${n > 0 ? "✓" : "✗"} ${label}  (${n} hits)`);
  }
  // legal-line NEGATIVE check: the brief must NOT assert the workspace IS the producer/manufacturer.
  const overstep = /workspace (is|as) the (producer|manufacturer)|the workspace is a (producer|importer|manufacturer)/gi;
  const ov = (b.match(overstep) || []);
  console.log(`  ${ov.length === 0 ? "✓" : "✗"} legal line held: no "workspace IS the producer/manufacturer" assertion  (${ov.length} overstep hits${ov.length ? ": " + ov.slice(0, 3).join(" | ") : ""})`);
}
if (mode === "show") {
  const { data: fin } = await sb.from("intelligence_items").select("full_brief").eq("id", it.id).single();
  const b = fin.full_brief || "";
  const ctx = (needle, win = 320) => {
    const i = b.toLowerCase().indexOf(needle.toLowerCase());
    return i < 0 ? `(not found: "${needle}")` : "…" + b.slice(Math.max(0, i - 60), i + win).replace(/\s+/g, " ").trim() + "…";
  };
  console.log("\n=== SEMANTIC SPOT-CHECK (actual prose, not token counts) ===");
  for (const probe of ["2038", "average per manufacturing plant", "manufacturing plant and year", "the producer", "is the producer", "manufacturer", "Grade C"]) {
    console.log(`\n[${probe}]\n  ${ctx(probe)}`);
  }
}
process.exit(0);
