// STAGE 0 (read-only, FREE — no fetch, no LLM): firm the backward scope. Refined URL classifier sorts every
// reg-family item into enacted / re-point (portal+announce) / borderline; cross-references truncation (max
// stored excerpt length) and the legal-vs-non-legal host split (legal = free direct-HTTP; non-legal =
// Browserless units, the only real fetch cost). Emits firm per-stage item lists for the quote.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(ROOT + "/.env.local");
const sb = readClient();

const REG_FAMILY = ["regulation", "directive", "standard", "guidance", "framework"];
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
// legal hosts that the pipeline fetches DIRECT + free (canonical-pipeline DIRECT_FETCH_HOSTS).
const LEGAL_HOST = /(^|\.)(eur-lex\.europa\.eu|europa\.eu|federalregister\.gov|ecfr\.gov|govinfo\.gov|legislation\.gov\.uk|gov\.uk)$/i;

const ENACTED_HOST = /(^|\.)(eur-lex\.europa\.eu|federalregister\.gov|ecfr\.gov|govinfo\.gov|legislation\.gov\.uk)$/i;
// a SPECIFIC legal document (the law's own text), refined for the ambiguous bucket.
const ENACTED_DOC = /celex|\/eli\/|legal-content|\/txt\b|billtextclient|billnavclient|\/ccivil|\/lei\/l?\d|\/leyes?\/|normasoficiales|\/rule\/[a-z0-9-]{6,}|selectdoc|\/standard\/\d|t\d{8}|\/act[s]?\/\d|\.pdf($|\?)|\/l\d{4,}\b/i;
// landing / program / org / announcement = NOT the enacted text → re-point candidate.
const REPOINT_PATH = /\/topics?\/|\/eu-action\/|\/policies?\b|\/programs?\b|\/our-work\/|\/divisions?\/|\/about\b|\/organisations?\/|\/web\/|\/press|\/media-?cent|\/news\/|\/whats-new\/|\/goals\b|\/groups?\/|\/who-we-are\/|\/sector\/|\/areas?\/|_en$|\/home\b|\/index|default\.aspx|\/pages\/default|\/air$|\/aqd\b|\/regulatory\/?$|\/environment\/?$|\/sustainability\/?$|\/freight|\/planning|\/rules\/?(current)?(\.html)?$|\/register(\.html)?$|\/publicaciones\/|\/publications?\/?$|\/initiatives|\/strategies|\/services\/|\/assuntos\/|\/norm:|\/spotlight/i;

function classify(url) {
  if (!url || !/^https?:\/\//i.test(url)) return "no_source";
  let path = ""; try { const u = new URL(url); path = u.pathname + (u.search || ""); } catch {}
  const host = hostOf(url);
  if (ENACTED_HOST.test(host) || ENACTED_DOC.test(url)) return "enacted";
  if (REPOINT_PATH.test(path) || /^\/?(en\/?|index\.html?)?$/i.test(path)) return "repoint";
  return "borderline";
}

const FLAGSHIP = /CBAM|CSRD|EUDR|Deforestation|Fit for 55|Fit-for-55|Taxonomy|Aviation ETS|ETS for Shipping|ETS Shipping|Heavy-Duty Vehicle CO2|HDV|EU MRV|MRV Regulation|Euro 7|IMO GHG|Net-Zero Framework|MARPOL Annex VI|\bCII\b|EEXI|ICS2/i;

// items
const items = [];
for (let from = 0; ; from += 1000) {
  const { data } = await sb.from("intelligence_items").select("id,legacy_id,title,item_type,source_url,provenance_status,is_archived").order("id").range(from, from + 999);
  if (!data?.length) break; items.push(...data); if (data.length < 1000) break;
}
const reg = items.filter((r) => REG_FAMILY.includes(r.item_type) && !r.is_archived);
const byId = new Map(reg.map((r) => [r.id, r]));

// truncation: max stored excerpt length per item
const maxLen = new Map();
for (let from = 0; ; from += 1000) {
  const { data } = await sb.from("agent_run_searches").select("intelligence_item_id,result_content_excerpt").order("id").range(from, from + 999);
  if (!data?.length) break;
  for (const r of data) {
    if (!byId.has(r.intelligence_item_id)) continue;
    const len = (r.result_content_excerpt || "").length; if (len <= 200) continue;
    const cur = maxLen.get(r.intelligence_item_id) || 0; if (len > cur) maxLen.set(r.intelligence_item_id, len);
  }
  if (data.length < 1000) break;
}
const truncated = (id) => (maxLen.get(id) || 0) > 12000; // synthesis-cap line

for (const r of reg) { r._cls = classify(r.source_url); r._trunc = truncated(r.id); r._flag = FLAGSHIP.test(r.title || ""); r._legal = LEGAL_HOST.test(hostOf(r.source_url)); }

const repoint = reg.filter((r) => r._cls === "repoint");
const borderline = reg.filter((r) => r._cls === "borderline");
const enacted = reg.filter((r) => r._cls === "enacted");
const s1 = repoint.filter((r) => r._flag);
const s2 = repoint.filter((r) => !r._flag);
const s3 = enacted.filter((r) => r._trunc);            // enacted but truncated → re-ground
const noaction = enacted.filter((r) => !r._trunc);

console.log(`REG-FAMILY active: ${reg.length}`);
console.log(`  classify: enacted ${enacted.length} | repoint ${repoint.length} | borderline ${borderline.length}`);
console.log(`  truncated (stored >12KB) among reg: ${reg.filter((r) => r._trunc).length}`);
console.log(`\n=== STAGE 1 — FLAGSHIP re-point (re-point→re-ground), ${s1.length} ===`);
for (const r of s1) console.log(`  ${r.id.slice(0,8)} [${r.provenance_status}] trunc=${r._trunc?"Y":"n"} legal=${r._legal?"Y":"n"} | ${(r.title||"").slice(0,42)} | ${r.source_url}`);
console.log(`\n=== STAGE 2 — rest re-point (re-point→re-ground), ${s2.length} ===`);
for (const r of s2) console.log(`  ${r.id.slice(0,8)} [${r.provenance_status}] trunc=${r._trunc?"Y":"n"} legal=${r._legal?"Y":"n"} | ${hostOf(r.source_url)} | ${(r.title||"").slice(0,34)}`);
console.log(`\n=== STAGE 3 — enacted-but-truncated (re-ground/re-fetch), ${s3.length} ===`);
for (const r of s3) console.log(`  ${r.id.slice(0,8)} [${r.provenance_status}] legal=${r._legal?"Y":"n"} | ${hostOf(r.source_url)} | ${(r.title||"").slice(0,34)}`);
console.log(`\n=== BORDERLINE (manual eyeball — ${borderline.length}) ===`);
for (const r of borderline) console.log(`  ${r.id.slice(0,8)} legal=${r._legal?"Y":"n"} | ${r.source_url}`);
console.log(`\n=== NO ACTION (enacted + not truncated): ${noaction.length} ===`);

// host split for the re-fetch population (S1+S2+S3): non-legal = the only real fetch cost (Browserless units)
const refetch = [...s1, ...s2, ...s3];
const nonLegal = refetch.filter((r) => !r._legal);
console.log(`\n=== FETCH COST SPLIT (re-fetch population S1+S2+S3 = ${refetch.length}) ===`);
console.log(`  legal host (FREE direct-HTTP): ${refetch.length - nonLegal.length}`);
console.log(`  non-legal host (Browserless units): ${nonLegal.length}`);
const nlHosts = {}; for (const r of nonLegal) nlHosts[hostOf(r.source_url)] = (nlHosts[hostOf(r.source_url)]||0)+1;
console.log(`  non-legal host distribution: ${Object.entries(nlHosts).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([h,n])=>`${h}:${n}`).join(", ")}`);
process.exit(0);
