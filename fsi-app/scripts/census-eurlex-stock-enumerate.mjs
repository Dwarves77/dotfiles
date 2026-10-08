// census-eurlex-stock-enumerate.mjs — EUR-Lex STOCK full enumeration (operator ruling 2026-07-21, phase 1 glyph:verbatim
// of the classify-full-enum mandate). Enumerates the COMPLETE in-force universe across the five freight
// chapters (Customs 02, Transport 07, Taxation 09, Energy 12, Environment 15) via the SPARQL metadata
// endpoint (free, no LLM), and writes each NEW document as a bare 'discovered' row to census_worklist — glyph:verbatim
// classification is a SEPARATE later phase (this script does NOT call firstFetchClassify or the mint
// chokepoint). Existing rows (the 149 Task-4 stock-sample rows already classified) are left untouched:
// identity columns are immutable-after-insert and enumeration_status is forward-only-guarded, so a blind
// upsert that re-asserts 'discovered' on an already-classified row would trip the guard trigger. This
// script INSERTS ONLY rows whose (source_id, document_url) do not already exist.
//
// R2 no-cap rule: every chapter walks to full exhaustion (the complete SPARQL result set), never capped.
// Metadata (title/subjects/EuroVoc) is captured into `notes` at enumeration time so the later classification
// phase does not need to re-hit SPARQL per item (retrieval-before-generation / RD-8).
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"));

for (const v of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[v]) { console.error(`missing env ${v} (source fsi-app/.env.local)`); process.exit(2); }
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const EURLEX_ID = "260089a9-e334-4104-843c-cdfc28a94dcc";
const CREATED_BY = "session-classify-stock-full";
const ENDPOINT = "https://publications.europa.eu/webapi/rdf/sparql";
const DIR_BASE = "http://publications.europa.eu/resource/authority/dir-eu-legal-act/";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const CHAPTERS = { "02 Customs": "02", "07 Transport": "07", "09 Taxation": "09", "12 Energy": "12", "15 Environment": "15" };
const P = `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#> PREFIX skos: <http://www.w3.org/2004/02/skos/core#>`;
const celexUrl = (celex) => `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celex}`;

async function sparql(q) {
  // POST (not GET) so large VALUES clauses (100+ CELEX ids) never hit a query-string length limit — glyph:verbatim
  // the GET form truncated silently mid-query at batch size 150 (Virtuoso SP030 syntax error).
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; CarosLedge/1.0)",
      accept: "application/sparql-results+json, application/json, */*;q=0.5",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ query: q, format: "application/sparql-results+json" }),
    redirect: "follow",
    signal: AbortSignal.timeout(280_000),
  });
  if (!r.ok) throw new Error(`SPARQL HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function enumerateChapter(code) {
  const q = `${P}
SELECT ?celex ?rt WHERE {
  ?work cdm:resource_legal_in-force "true"^^<${XSD}boolean> .
  ?work cdm:resource_legal_is_about_concept_directory-code ?dc .
  FILTER(STRSTARTS(STR(?dc), "${DIR_BASE}${code}"))
  ?work cdm:resource_legal_id_celex ?celex .
  ?work cdm:work_has_resource-type ?rt .
}`;
  const j = await sparql(q);
  const byCelex = new Map();
  for (const b of j.results.bindings) {
    const celex = b.celex.value;
    const rt = b.rt.value.split("/").pop();
    if (!byCelex.has(celex)) byCelex.set(celex, rt);
  }
  return byCelex;
}

async function fetchMetadataBatch(celexList) {
  const values = celexList.map((c) => `"${c}"^^<${XSD}string>`).join(" ");
  const q = `${P}
SELECT ?celex (SAMPLE(?title) AS ?title) (GROUP_CONCAT(DISTINCT ?sm; separator="; ") AS ?subjects) (GROUP_CONCAT(DISTINCT ?ev; separator="; ") AS ?eurovoc) WHERE {
  VALUES ?celex { ${values} }
  ?work cdm:resource_legal_id_celex ?celex .
  OPTIONAL { ?expr cdm:expression_belongs_to_work ?work . ?expr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> . ?expr cdm:expression_title ?title . }
  OPTIONAL { ?work cdm:resource_legal_is_about_subject-matter ?smc . ?smc skos:prefLabel ?sm . FILTER(LANG(?sm)="en") }
  OPTIONAL { ?work cdm:work_is_about_concept_eurovoc ?evc . ?evc skos:prefLabel ?ev . FILTER(LANG(?ev)="en") }
} GROUP BY ?celex`;
  const j = await sparql(q);
  const md = new Map();
  for (const b of j.results.bindings) {
    md.set(b.celex.value, { title: b.title?.value ?? "", subjects: b.subjects?.value ?? "", eurovoc: b.eurovoc?.value ?? "" });
  }
  return md;
}

function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

function metadataBlob({ celex, rt, title, subjects, eurovoc, chapterLabel }) {
  return [
    `Title: ${title || "(title unavailable in EN)"}`,
    `Instrument: EU ${rt} (CELEX ${celex})`,
    `Directory chapter: ${chapterLabel}`,
    subjects ? `Subject matter: ${subjects}` : null,
    eurovoc ? `EuroVoc concepts: ${eurovoc}` : null,
  ].filter(Boolean).join("\n").slice(0, 1800);
}

async function main() {
  const started = Date.now();
  console.log("EUR-Lex STOCK full enumeration — R2 no-cap, all 5 chapters, discovered-only writes.\n"); // glyph:verbatim

  // existing document_urls for this source (paginate; PostgREST default page cap)
  const existing = new Set();
  {
    let from = 0; const page = 1000;
    while (true) {
      const { data, error } = await sb.from("census_worklist").select("document_url").eq("source_id", EURLEX_ID).range(from, from + page - 1);
      if (error) throw error;
      data.forEach((r) => existing.add(r.document_url));
      if (data.length < page) break;
      from += page;
    }
  }
  console.log(`existing EUR-Lex census_worklist rows: ${existing.size}\n`);

  const summary = [];
  let totalInserted = 0, totalUniverse = 0, totalAlreadyPresent = 0;

  for (const [label, code] of Object.entries(CHAPTERS)) {
    const byCelex = await enumerateChapter(code);
    totalUniverse += byCelex.size;
    const celexList = [...byCelex.keys()];
    const newCelex = celexList.filter((c) => !existing.has(celexUrl(c)));
    const alreadyPresent = celexList.length - newCelex.length;
    totalAlreadyPresent += alreadyPresent;

    console.log(`${label}: universe ${byCelex.size}, already-present ${alreadyPresent}, new ${newCelex.length}`);

    let chapterInserted = 0;
    for (const batch of chunk(newCelex, 150)) {
      const md = await fetchMetadataBatch(batch);
      const rows = batch.map((celex) => {
        const rt = byCelex.get(celex);
        const m = md.get(celex) ?? { title: "", subjects: "", eurovoc: "" };
        return {
          source_id: EURLEX_ID,
          document_url: celexUrl(celex),
          lane: "A",
          created_by: CREATED_BY,
          shape_class: "instrument_page",
          enumeration_status: "discovered",
          instrument_identifier: celex,
          notes: metadataBlob({ celex, rt, ...m, chapterLabel: label }),
        };
      });
      const { error, data } = await sb.from("census_worklist").insert(rows).select("id");
      if (error) { console.error(`  [insert error, batch of ${rows.length}] ${error.message}`); continue; }
      chapterInserted += data.length;
      rows.forEach((r) => existing.add(r.document_url)); // cross-chapter overlap guard: an instrument tagged
      // in two chapters (e.g. Transport + Environment) must not be inserted twice in the same run.
    }
    totalInserted += chapterInserted;
    summary.push({ label, universe: byCelex.size, alreadyPresent, new: newCelex.length, inserted: chapterInserted });
    console.log(`  -> inserted ${chapterInserted}/${newCelex.length}`);
  }

  console.log("\n════ EUR-Lex STOCK ENUMERATION SUMMARY ════");
  for (const s of summary) console.log(`${s.label}: universe ${s.universe}, already-present ${s.alreadyPresent}, new ${s.new}, inserted ${s.inserted}`);
  console.log(`\nTOTAL universe (5 chapters, distinct-per-chapter sum): ${totalUniverse}`);
  console.log(`TOTAL already-present: ${totalAlreadyPresent}, TOTAL newly inserted: ${totalInserted}`);
  console.log(`Wall: ${((Date.now() - started) / 1000).toFixed(0)}s`);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
