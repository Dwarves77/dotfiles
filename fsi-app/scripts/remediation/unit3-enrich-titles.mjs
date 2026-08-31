#!/usr/bin/env node
// unit3-enrich-titles.mjs — ADR-016 acceleration, fabrication remediation step 3. Fetch REAL titles for every
// title-less census_worklist row (capture, not analysis — $0, plain HTTP): EUR-Lex CELEX via the Cellar SPARQL
// expression_title (batched with VALUES), UK via legislation.gov.uk /data.xml <dc:title>. Writes a
// identifier->title map to scripts/tmp/census-titles.json for the fail-closed re-classifier. Reports the
// enriched count + the residual title-less (unenrichable) count by registry — the fail-closed rubric turns those
// into unclassifiable_pending_enrichment, never a fabricated verdict.
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OUT = resolve(ROOT, "scripts/tmp/census-titles.json");
const ENDPOINT = "https://publications.europa.eu/webapi/rdf/sparql";
const titles = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {}; // resumable

async function mapLimit(items, n, fn) { const out = []; let i = 0; async function w() { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch { out[k] = null; } } } await Promise.all(Array.from({ length: n }, w)); return out; }

async function eurlexBatch(celexes) {
  const values = celexes.map((c) => `"${c.replace(/"/g, "")}"^^xsd:string`).join(" ");
  const q = `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?celex ?title WHERE { VALUES ?celex { ${values} }
  ?w cdm:resource_legal_id_celex ?celex .
  ?e cdm:expression_belongs_to_work ?w .
  ?e cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
  ?e cdm:expression_title ?title . }`;
  const r = await fetch(ENDPOINT + "?query=" + encodeURIComponent(q) + "&format=application/sparql-results+xml", { headers: { accept: "application/sparql-results+xml" }, signal: AbortSignal.timeout(90000) });
  const t = await r.text();
  for (const [, body] of t.matchAll(/<result>([\s\S]*?)<\/result>/g)) {
    const celex = (body.match(/name="celex"><literal[^>]*>([^<]+)</) || [])[1];
    const title = (body.match(/name="title"><literal[^>]*>([^<]+)</) || [])[1];
    if (celex && title) titles[celex] = title.slice(0, 300);
  }
}
async function ukTitle(url) {
  const r = await fetch(url.replace(/\/$/, "") + "/data.xml", { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) return null;
  const t = await r.text();
  return (t.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/) || t.match(/<Title[^>]*>([^<]+)<\/Title>/) || [])[1] || null;
}

async function main() {
  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("census_worklist").select("instrument_identifier, document_url, sources(url)").range(from, from + 999);
    if (!data?.length) break; rows.push(...data); if (data.length < 1000) break;
  }
  const eurlex = rows.filter((r) => (r.sources?.url || "").includes("eur-lex") && r.instrument_identifier).map((r) => r.instrument_identifier);
  const uk = rows.filter((r) => /legislation\.gov\.uk/.test(r.document_url || ""));
  const eurlexTodo = [...new Set(eurlex)].filter((c) => !titles[c]);
  console.log(`\n===== title enrichment — EUR-Lex ${eurlexTodo.length} to fetch, UK ${uk.length} =====`);
  // EUR-Lex: batch SPARQL, 120/batch, 4 concurrent
  const B = 120; const batches = []; for (let i = 0; i < eurlexTodo.length; i += B) batches.push(eurlexTodo.slice(i, i + B));
  let done = 0;
  await mapLimit(batches, 4, async (b) => { await eurlexBatch(b); done += b.length; if (done % 600 < B) { console.log(`  eur-lex ${done}/${eurlexTodo.length} | titles ${Object.keys(titles).length}`); writeFileSync(OUT, JSON.stringify(titles)); } });
  writeFileSync(OUT, JSON.stringify(titles));
  console.log(`  EUR-Lex titles resolved: ${eurlex.filter((c) => titles[c]).length}/${new Set(eurlex).size}`);
  // UK: concurrent /data.xml
  let ukDone = 0;
  await mapLimit(uk.filter((r) => !titles["UK:" + r.document_url]), 10, async (r) => { const t = await ukTitle(r.document_url); if (t) titles["UK:" + r.document_url] = t.slice(0, 300); ukDone++; if (ukDone % 300 === 0) { console.log(`  uk ${ukDone}/${uk.length}`); writeFileSync(OUT, JSON.stringify(titles)); } });
  writeFileSync(OUT, JSON.stringify(titles));
  const ukResolved = uk.filter((r) => titles["UK:" + r.document_url]).length;
  console.log(`  UK titles resolved: ${ukResolved}/${uk.length}`);
  console.log(`\n  TOTAL titles in map: ${Object.keys(titles).length} -> ${OUT}`);
  console.log(`  residual title-less (fail-closed -> unclassifiable_pending_enrichment): EUR-Lex ${new Set(eurlex).size - eurlex.filter((c) => titles[c]).length}, UK ${uk.length - ukResolved}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
