// census-uk-stock-enumerate.mjs — UK legislation.gov.uk STOCK enumeration (operator ruling 2026-07-21, glyph:verbatim
// phase 1). No SPARQL/structure-tree equivalent for UK legislation exists, so enumeration is KEYWORD
// SEARCH across the two live-law registries (ukpga = Public General Acts, uksi = Statutory Instruments),
// via the free legislation.gov.uk Atom/CSV search API (no LLM). Results are deduped by legislation ID
// across all keyword queries. Classification is a SEPARATE later phase.
//
// SCOPE (flagged — a keyword-search enumeration is inherently a judgment call on query terms; report to glyph:verbatim
// operator). Keyword set chosen to mirror the freight-sustainability core: emissions/climate/air-quality
// regulation, packaging EPR, transport fuel, vessel pollution, carbon pricing.
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"));
for (const v of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[v]) { console.error(`missing env ${v}`); process.exit(2); }
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CREATED_BY = "session-classify-stock-full";
const REGISTRIES = ["ukpga", "uksi"];
const KEYWORDS = [
  "greenhouse gas emissions",
  "climate change",
  "air quality",
  "packaging waste",
  "extended producer responsibility",
  "renewable transport fuel",
  "emissions trading scheme",
  "carbon budget",
  "prevention of air pollution from ships",
  "clean air zone",
  "vehicle emissions",
  "alternative fuels infrastructure",
];

function parseCsvLine(line) {
  // simple CSV parser sufficient for this feed's quoting (fields wrapped in "..." with "" escapes)
  const out = []; let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function searchAll(registry, keyword) {
  const results = [];
  let page = 1;
  while (true) {
    const url = `https://www.legislation.gov.uk/${registry}/data.csv?text=${encodeURIComponent(keyword)}&page=${page}`;
    const r = await fetch(url, { headers: { accept: "text/csv" } });
    if (!r.ok) { console.warn(`  [${registry}/"${keyword}" page ${page}] HTTP ${r.status}`); break; }
    const text = await r.text();
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length <= 1) break; // header only, no results this page
    const header = parseCsvLine(lines[0]);
    const idIdx = header.indexOf("ID"), titleIdx = header.indexOf("TITLE"), yearIdx = header.indexOf("YEAR"), numIdx = header.indexOf("NUMBER"), subjIdx = header.indexOf("SUBJECT");
    for (const line of lines.slice(1)) {
      const cols = parseCsvLine(line);
      if (!cols[idIdx]) continue;
      results.push({ id: cols[idIdx], title: cols[titleIdx], year: cols[yearIdx], number: cols[numIdx], subject: cols[subjIdx] });
    }
    if (lines.length - 1 < 20) break; // fewer than a full page => last page
    page++;
    if (page > 60) { console.warn(`  [${registry}/"${keyword}"] stopped at page cap 60 (${results.length} so far) — flagged, re-walkable`); break; } // glyph:verbatim
  }
  return results;
}

async function findSource() {
  const { data, error } = await sb.from("sources").select("id, name").ilike("name", "%UK Legislation%");
  if (error) throw error;
  if (!data?.length) throw new Error("No existing 'UK Legislation' source row found — register the source first."); // glyph:verbatim
  return data[0].id;
}

function docUrl(id) {
  // id looks like "http://www.legislation.gov.uk/id/uksi/2012/3038" -> normalize to the canonical /uksi/2012/3038 page
  return id.replace("http://www.legislation.gov.uk/id/", "https://www.legislation.gov.uk/");
}

async function main() {
  const started = Date.now();
  const sourceId = await findSource();
  console.log(`UK STOCK enumeration — source_id ${sourceId}\n`); // glyph:verbatim

  const existing = new Set();
  {
    let from = 0; const page = 1000;
    while (true) {
      const { data, error } = await sb.from("census_worklist").select("document_url").eq("source_id", sourceId).range(from, from + page - 1);
      if (error) throw error;
      data.forEach((r) => existing.add(r.document_url));
      if (data.length < page) break;
      from += page;
    }
  }
  console.log(`existing census_worklist rows for this source: ${existing.size}\n`);

  const byId = new Map(); // dedup across keyword queries within this run
  for (const registry of REGISTRIES) {
    for (const kw of KEYWORDS) {
      const rows = await searchAll(registry, kw);
      let newHits = 0;
      for (const row of rows) {
        if (!byId.has(row.id)) { newHits++; byId.set(row.id, { ...row, registry }); }
      }
      console.log(`${registry} / "${kw}": ${rows.length} hits, ${newHits} new-to-this-run`);
    }
  }

  console.log(`\nDistinct instruments across all queries: ${byId.size}`);

  const toInsert = [];
  for (const row of byId.values()) {
    const url = docUrl(row.id);
    if (existing.has(url)) continue;
    existing.add(url);
    toInsert.push({
      source_id: sourceId,
      document_url: url,
      lane: "A",
      created_by: CREATED_BY,
      shape_class: "instrument_page",
      enumeration_status: "discovered",
      instrument_identifier: `UK ${row.registry} ${row.year}/${row.number}`,
      notes: [
        `Title: ${row.title || "(untitled)"}`,
        `Instrument: UK ${row.registry === "ukpga" ? "Public General Act" : "Statutory Instrument"} ${row.year}/${row.number}`,
        row.subject ? `Subject: ${row.subject}` : null,
        `Source: legislation.gov.uk`,
      ].filter(Boolean).join("\n").slice(0, 1800),
    });
  }

  console.log(`Already-present: ${byId.size - toInsert.length}, new to insert: ${toInsert.length}`);
  let totalInserted = 0;
  for (let i = 0; i < toInsert.length; i += 300) {
    const batch = toInsert.slice(i, i + 300);
    const { data, error } = await sb.from("census_worklist").insert(batch).select("id");
    if (error) { console.error(`  [insert error, batch @${i}] ${error.message}`); continue; }
    totalInserted += data.length;
  }

  console.log("\n════ UK STOCK ENUMERATION SUMMARY ════");
  console.log(`Distinct instruments found: ${byId.size}`);
  console.log(`TOTAL inserted: ${totalInserted} / attempted ${toInsert.length}`);
  console.log(`Wall: ${((Date.now() - started) / 1000).toFixed(0)}s`);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
