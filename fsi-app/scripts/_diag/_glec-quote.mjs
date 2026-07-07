// READ-ONLY: (1) characterize 4939b133 "GLEC (Air Freight)" vs the cluster (distinct cut or 3rd dup);
// (2) enumerate the SFC GLEC document set via PLAIN HTTP (no Browserless) to QUOTE the rich-rebuild spend.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient } = await import("../lib/db.mjs");
const sb = readClient();

// ── 1. 4939b133 vs the GLEC cluster ──
const { data: items } = await sb.from("intelligence_items").select("id,title,source_url,item_type,provenance_status,jurisdiction_iso,full_brief,summary").or("id.eq.placeholder");
const { data: cluster } = await sb.from("intelligence_items").select("id,title,source_url,item_type,provenance_status,jurisdiction_iso,full_brief,summary").ilike("title", "%GLEC%");
console.log("══ GLEC-titled items ══");
for (const g of cluster || []) {
  console.log(`\n${g.id.slice(0, 8)} [${g.item_type}/${g.provenance_status}] "${g.title}"`);
  console.log(`   src: ${g.source_url}`);
  console.log(`   juris=${JSON.stringify(g.jurisdiction_iso)} brief=${(g.full_brief || "").length}ch  ${(g.summary || "").slice(0, 120)}`);
}

// ── 2. enumerate SFC GLEC documents via plain HTTP ──
const PAGES = [
  "https://www.smartfreightcentre.org/en/our-programs/emissions-accounting/global-logistics-emissions-council/",
  "https://www.smartfreightcentre.org/en/resources-overview/",
  "https://www.smartfreightcentre.org/en/skills/library/",
];
const docs = new Set();
console.log("\n══ SFC pages — plain HTTP fetch + link enumeration ══");
for (const url of PAGES) {
  try {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; CarosLedge/1.0)" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
    const html = await res.text();
    const hrefs = [...html.matchAll(/href="([^"]+)"/gi)].map((m) => m[1]);
    const docLinks = hrefs.filter((h) => /\.pdf($|\?)|s3[.-].*amazonaws|\/documents?\/|whitepaper|framework|glec|iso.?14083|emission/i.test(h));
    console.log(`\n• ${url}\n  status=${res.status} html=${html.length}ch  doc-ish links=${docLinks.length}`);
    for (const h of [...new Set(docLinks)].slice(0, 25)) { const abs = h.startsWith("http") ? h : new URL(h, url).href; if (/\.pdf|amazonaws|\/documents?\//i.test(abs)) docs.add(abs); console.log(`    ${abs.slice(0, 110)}`); }
  } catch (e) { console.log(`\n• ${url}\n  THREW: ${e.name} ${String(e.message).slice(0, 80)}`); }
}
console.log(`\n══ distinct DOCUMENT URLs (PDF/S3/documents) for the GLEC doc-set: ${docs.size} ══`);
for (const d of docs) console.log(`  ${d}`);
process.exit(0);
