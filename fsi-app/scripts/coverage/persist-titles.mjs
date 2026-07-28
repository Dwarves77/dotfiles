#!/usr/bin/env node
// B1/P1 title persistence. The prior enrichment pass (unit3-enrich-titles.mjs) captured real instrument
// titles via the FREE path (EUR-Lex Cellar SPARQL expression_title + legislation.gov.uk dc:title) but
// wrote them ONLY to scripts/tmp/census-titles.json (gitignored scratch) — the not-durably-persisted
// finding. This pass loads that free-path capture and writes it into the durable census_worklist.title
// column (mig: census_worklist_title), keyed by CELEX (instrument_identifier) or "UK:"+document_url. $0,
// no network (reads the already-captured map). Residual (no captured title) stays NULL and is REPORTED —
// the re-capture worklist. --execute to write; default DRY reports coverage.
//
// Write-guard note: writes ONLY the new nullable title/title_source columns (NULL pre-pass), idempotent,
// reversed by nulling them; per-row snapshot is inapplicable to a bulk enrichment. Audit = migration +
// this script + the reported counts.
import { resolve } from "node:path"; import { pathToFileURL } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
process.loadEnvFile(resolve(process.cwd(), ".env.local"));
const { fetchAllRows } = await import(pathToFileURL(resolve(process.cwd(), "src/lib/db/paginate.mjs")).href);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const EXECUTE = process.argv.includes("--execute");
const SCRATCH = resolve(process.cwd(), "scripts/tmp/census-titles.json");
if (!existsSync(SCRATCH)) { console.error(`FATAL: ${SCRATCH} not found — re-run the free-path capture (unit3-enrich-titles.mjs) first.`); process.exit(1); }
const titles = JSON.parse(readFileSync(SCRATCH, "utf8"));
console.log(`loaded ${Object.keys(titles).length} captured titles from scratch | mode ${EXECUTE ? "EXECUTE" : "DRY"}`);

// Scope to would_mint (the Coverage panel's set). Match: CELEX identifier direct, else "UK:"+url.
const rows = await fetchAllRows((f, t) => sb.from("census_worklist")
  .select("id,instrument_identifier,document_url,title").eq("dryrun_disposition", "would_mint").order("id").range(f, t));
console.log(`would_mint rows: ${rows.length}`);

let matched = 0, uk = 0, eurlex = 0, residual = 0, already = 0;
for (const r of rows) {
  const eurlexTitle = r.instrument_identifier ? titles[r.instrument_identifier] : null;
  const ukTitle = titles["UK:" + r.document_url];
  const title = eurlexTitle || ukTitle || null;
  const source = eurlexTitle ? "eurlex-cellar" : ukTitle ? "uk-legislation" : null;
  if (!title) { residual++; continue; }
  matched++; if (eurlexTitle) eurlex++; else uk++;
  if (r.title) { already++; }
  if (EXECUTE) {
    const { error } = await sb.from("census_worklist").update({ title, title_source: source }).eq("id", r.id);
    if (error) console.error("update-error", r.id, error.message);
  }
}
console.log(`\nTITLE PERSIST ${EXECUTE ? "EXECUTE" : "DRY"} complete:`);
console.log(`  matched=${matched} (eurlex=${eurlex} uk=${uk}) | residual(no captured title)=${residual} | already-had-title=${already}`);
console.log(`  coverage: ${((matched / rows.length) * 100).toFixed(1)}% of would_mint have a durable title after this pass.`);
if (residual > 0) console.log(`  RESIDUAL ${residual} title-less would_mint rows -> re-capture worklist (free path); panel falls back to notes descriptor meanwhile.`);
