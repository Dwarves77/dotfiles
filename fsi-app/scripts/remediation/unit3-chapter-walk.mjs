#!/usr/bin/env node
// unit3-chapter-walk.mjs — ADR-016 acceleration, chapter blind-spot walk (operator ruling). Enumerate the
// freight-plausible NON-enumerated EUR-Lex CDM chapters (17 company law, 13 internal-market/product, 10
// finance/taxonomy, 05 labour, 06 services — ch 08 competition DEFERRED), via the Cellar SPARQL in-force list,
// dedup each CELEX against the corpus + existing census, and write the residual as census_worklist rows (chapter
// recorded) for the SAME classifier. HAVE items (already in corpus) reconcile as dedup_hit, never double-counted
// as gaps. $0 (SPARQL index-walk + guarded census writes; classification is the separate cheap pass).
// Run: --dry-run (default) | --execute [--chapter=17] (default: all five in order 17,13,10,05,06)
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js"; import { guardedInsertMany } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); process.loadEnvFile(resolve(ROOT, ".env.local"));
const EXECUTE = process.argv.includes("--execute");
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--chapter=")); return a ? a.slice(10) : null; })();
const CHAPTERS = ONLY ? [ONLY] : ["17", "13", "10", "05", "06"];
const EURLEX_SOURCE = "e6956d6f-4c95-47b6-a72e-04cec98992f2";
const ENDPOINT = "https://publications.europa.eu/webapi/rdf/sparql";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function enumerateChapter(ch) {
  const q = `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT DISTINCT ?celex WHERE {
  ?work cdm:resource_legal_in-force "true"^^xsd:boolean .
  ?work cdm:resource_legal_is_about_concept_directory-code ?dc .
  FILTER(STRSTARTS(STRAFTER(STR(?dc),"dir-eu-legal-act/"),"${ch}"))
  ?work cdm:resource_legal_id_celex ?celex .
} ORDER BY ?celex`;
  const url = ENDPOINT + "?query=" + encodeURIComponent(q) + "&format=application/sparql-results+xml";
  const r = await fetch(url, { headers: { accept: "application/sparql-results+xml" }, signal: AbortSignal.timeout(120000) });
  const t = await r.text();
  return [...t.matchAll(/name="celex"><literal[^>]*>([^<]+)</g)].map((m) => m[1]);
}
async function pagedSet(table, col, filter) {
  const s = new Set();
  for (let from = 0; ; from += 1000) { let qq = sb.from(table).select(col).not(col, "is", null); if (filter) qq = filter(qq); const { data, error } = await qq.range(from, from + 999); if (error || !data?.length) break; for (const r of data) s.add(r[col]); if (data.length < 1000) break; }
  return s;
}
async function cikMap() { const m = new Map(); for (let from = 0; ; from += 1000) { const { data } = await sb.from("intelligence_items").select("id, canonical_instrument_key").not("canonical_instrument_key", "is", null).eq("is_archived", false).range(from, from + 999); if (!data?.length) break; for (const r of data) m.set(r.canonical_instrument_key, r.id); if (data.length < 1000) break; } return m; }

async function main() {
  const existingCensus = await pagedSet("census_worklist", "instrument_identifier");
  const corpus = await cikMap();
  console.log(`\n===== chapter blind-spot walk (${EXECUTE ? "EXECUTE" : "DRY-RUN"}) — chapters ${CHAPTERS.join(",")} =====`);
  console.log(`baseline: ${existingCensus.size} instrument_identifiers already in census; ${corpus.size} corpus canonical_instrument_keys\n`);
  const report = {};
  for (const ch of CHAPTERS) {
    const celex = await enumerateChapter(ch);
    const newRows = [], have = [], already = [];
    for (const c of celex) {
      if (existingCensus.has(c)) { already.push(c); continue; }
      if (corpus.has(c)) { have.push({ c, item: corpus.get(c) }); continue; }
      newRows.push({ source_id: EURLEX_SOURCE, document_url: `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${c}`, instrument_identifier: c, lane: "A", shape_class: "instrument_page", enumeration_status: "dry_run_complete", created_by: `chapter-walk-ch${ch}`, notes: `blind-spot chapter ${ch} in-force enumeration` });
    }
    const haveRows = have.map((h) => ({ source_id: EURLEX_SOURCE, document_url: `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${h.c}`, instrument_identifier: h.c, lane: "A", shape_class: "instrument_page", enumeration_status: "dry_run_complete", dryrun_disposition: "dedup_hit", created_by: `chapter-walk-ch${ch}`, notes: `blind-spot chapter ${ch}: HAVE — already in corpus item ${h.item}` }));
    if (EXECUTE) {
      if (newRows.length) await guardedInsertMany("census_worklist", newRows, { cite: { skill: "environmental-policy-and-innovation", reason: `chapter blind-spot walk ch${ch}: enumerate ${newRows.length} in-force EUR-Lex instruments not yet in corpus/census for classification` } });
      if (haveRows.length) await guardedInsertMany("census_worklist", haveRows, { cite: { skill: "environmental-policy-and-innovation", reason: `chapter blind-spot walk ch${ch}: record ${haveRows.length} HAVE (already-in-corpus) as dedup_hit, not gaps` } });
      newRows.forEach((r) => existingCensus.add(r.instrument_identifier));
      haveRows.forEach((r) => existingCensus.add(r.instrument_identifier));
    }
    report[ch] = { enumerated: celex.length, new_gap_candidates: newRows.length, have_in_corpus: have.length, already_in_census: already.length };
    console.log(`  ch ${ch}: enumerated ${celex.length} | NEW gap-candidates ${newRows.length} | HAVE (corpus) ${have.length} | already-in-census ${already.length}`);
    if (ch === "17") { console.log(`     CSRD 32022L2464: ${corpus.has("32022L2464") ? "HAVE (" + corpus.get("32022L2464").slice(0, 8) + ")" : existingCensus.has("32022L2464") ? "in-census" : "NEW"} | CSDDD 32024L1760: ${corpus.has("32024L1760") ? "HAVE" : existingCensus.has("32024L1760") ? "in-census" : "NEW gap"}`); }
  }
  writeFileSync(resolve(ROOT, "scripts/tmp/chapter-walk-result.json"), JSON.stringify(report, null, 2));
  const tot = Object.values(report).reduce((a, r) => ({ enumerated: a.enumerated + r.enumerated, newc: a.newc + r.new_gap_candidates, have: a.have + r.have_in_corpus }), { enumerated: 0, newc: 0, have: 0 });
  console.log(`\n  TOTAL: enumerated ${tot.enumerated} | new gap-candidates ${tot.newc} (to classify) | HAVE ${tot.have}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
