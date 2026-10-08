// census-audit-gate-30.mjs — phase 2 (operator ruling 2026-07-21): 30-row hand-verifiable audit gate glyph:verbatim
// spanning all three registries + known hard cases, BEFORE any full-scale classification spend.
// Classifies each sampled row's stored enumeration-time metadata (`notes`) via the real chokepoint
// classifier (firstFetchClassify), and prints everything needed for a human (this session, reading the
// output) to independently judge true relevance and compare against the model's verdict.
import { createClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
for (const v of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"]) {
  if (!process.env[v]) { console.error(`missing env ${v}`); process.exit(2); }
}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { firstFetchClassify } = await jiti.import("../src/lib/llm/first-fetch-classify.ts");

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const EURLEX_ID = "260089a9-e334-4104-843c-cdfc28a94dcc";

async function sourceIdByNameLike(pat) {
  const { data, error } = await sb.from("sources").select("id, name, category, url").ilike("name", pat);
  if (error) throw error;
  return data?.[0] ?? null;
}

async function sampleRows(sourceId, n, filterFn) {
  const { data, error } = await sb.from("census_worklist").select("id, document_url, notes, instrument_identifier")
    .eq("source_id", sourceId).eq("enumeration_status", "discovered").limit(2000);
  if (error) throw error;
  const pool = filterFn ? data.filter(filterFn) : data;
  // evenly spaced pick for spread, not just the first N
  const step = Math.max(1, Math.floor(pool.length / n));
  const picked = [];
  for (let i = 0; i < pool.length && picked.length < n; i += step) picked.push(pool[i]);
  return picked;
}

async function main() {
  const eurlex = await sourceIdByNameLike("%EUR-Lex%");
  const ecfr = await sourceIdByNameLike("%federal register%");
  const uk = await sourceIdByNameLike("%UK Legislation%");

  // 10 EUR-Lex spanning chapters (spread pick handles this), 10 eCFR incl. thin-title hard cases
  // (short numeric part titles like "Part 500 [Reserved]"-adjacent, already filtered but some parts
  // have terse titles e.g. NHTSA Part 509/510/511 admin parts), 10 UK spanning ukpga+uksi.
  const eurlexSample = await sampleRows(eurlex.id, 10);
  const ecfrSample = await sampleRows(ecfr.id, 10);
  const ukSample = await sampleRows(uk.id, 10);
  const all = [
    ...eurlexSample.map((r) => ({ ...r, registry: "EUR-Lex", src: eurlex })),
    ...ecfrSample.map((r) => ({ ...r, registry: "eCFR", src: ecfr })),
    ...ukSample.map((r) => ({ ...r, registry: "UK", src: uk })),
  ];

  console.log(`Audit gate sample: ${all.length} rows (${eurlexSample.length} EUR-Lex, ${ecfrSample.length} eCFR, ${ukSample.length} UK)\n`);

  let haikuCalls = 0, costTotal = 0;
  const results = [];
  const started = Date.now();
  for (const row of all) {
    const t0 = Date.now();
    const res = await firstFetchClassify({
      text: row.notes || "(no metadata captured)",
      source_url: row.document_url,
      source_id: row.src.id,
      source_tier: 1,
      source_category: row.src.category ?? "regulatory",
      source_name: row.src.name,
    }, process.env.ANTHROPIC_API_KEY);
    haikuCalls++;
    const ms = Date.now() - t0;
    if (!res.ok) { results.push({ row, ok: false, error: res.error, ms }); continue; }
    costTotal += res.result.cost_usd_estimated ?? 0;
    results.push({ row, ok: true, result: res.result, ms });
  }

  console.log("═".repeat(100));
  for (const r of results) {
    console.log(`\n[${r.row.registry}] ${r.row.instrument_identifier || r.row.document_url}`);
    console.log(`URL: ${r.row.document_url}`);
    console.log(`Stored metadata:\n  ${(r.row.notes || "").split("\n").join("\n  ")}`);
    if (!r.ok) { console.log(`CLASSIFY FAILED: ${r.error}`); continue; }
    const c = r.result;
    console.log(`--> Haiku verdict: entity=${c.entity_verdict} item_type=${c.item_type} relevance=${c.relevance} topic_tags=${JSON.stringify(c.topic_tags)} jurisdictions=${JSON.stringify(c.jurisdictions)}`);
    console.log(`--> rationale: ${c.rationale}`);
  }
  console.log("\n" + "═".repeat(100));
  console.log(`\nHaiku calls: ${haikuCalls} | total cost $${costTotal.toFixed(4)} | avg $/call $${(costTotal / haikuCalls).toFixed(5)} | wall ${((Date.now() - started) / 1000).toFixed(1)}s | avg ms/call ${(results.reduce((a, r) => a + r.ms, 0) / results.length).toFixed(0)}`);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
