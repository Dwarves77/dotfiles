/** READ-ONLY source relevance audit. Writes NOTHING to the DB.
 *
 * Sequence (per dispatch): relevance FIRST over all active sources, then categorize
 * only the survivors by reachability. Produces the kill / fix-www / keep-recheck sheet
 * for authorization. The kill criterion == the vertical-fit gate rule (src/lib/sources/
 * vertical-fit.ts): off-vertical by institutional identity (general legislature) AND no
 * coverage gap (the jurisdiction's vertical-relevant authority is already covered).
 *
 * Coverage-gap guard: a legislature is KILL only if another active source in the SAME
 * COUNTRY (or, for EU members, an EU-level source) is a statute/gazette DB, a sectoral
 * regulator/ministry, or an intergovernmental body. Otherwise -> REVIEW (possible gap),
 * never auto-kill. Supply stays paused; this is investigation, not mutation.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { classifyInstitutionalType, isOffVerticalByIdentity, coversVerticalAuthority, looksLikeStatuteCodeDb } from "../../src/lib/sources/vertical-fit.ts";
import { urlIsRoot } from "../../src/lib/sources/entity-gate.mjs";

const __d = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(__d, "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const EU27 = new Set("AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" "));
const CCTLD = { jp:"JP", au:"AU", si:"SI", sk:"SK", ca:"CA", us:"US", uk:"GB", de:"DE", fr:"FR", it:"IT", es:"ES", nl:"NL", se:"SE", no:"NO", fi:"FI", dk:"DK", pl:"PL", cz:"CZ", sg:"SG", kr:"KR", cn:"CN", in:"IN", br:"BR", cl:"CL", co:"CO", mx:"MX", za:"ZA", nz:"NZ", ie:"IE", pt:"PT", gr:"GR", at:"AT", be:"BE", ch:"CH", hk:"HK", ae:"AE", sa:"SA", tr:"TR", ru:"RU", id:"ID", my:"MY", th:"TH", ph:"PH", vn:"VN", tw:"TW" };

function isoToStr(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return (v[0] == null ? "" : String(v[0]));
  return String(v);
}
function countryOf(s) {
  // jurisdiction_iso first (most reliable): "US-AL" -> "US", "JP" -> "JP".
  const j = isoToStr(s.jurisdiction_iso).trim().toUpperCase();
  if (j) return j.split("-")[0];
  let host = ""; try { host = new URL(s.url).hostname.toLowerCase(); } catch { return null; }
  // gov.uk / gov.au style -> the label before the final cc
  const m = host.match(/\.(gov|gob|govt|go|gouv)\.([a-z]{2})$/);
  if (m) return (CCTLD[m[2]] || m[2].toUpperCase());
  if (/\.gov$|\.mil$|\.us$/.test(host)) return "US";
  const tld = host.split(".").pop();
  return CCTLD[tld] || null;
}

// ── load corpus ──────────────────────────────────────────────────────────────
const { data: sources, error } = await sb
  .from("sources")
  .select("id, name, url, source_role, category, jurisdiction_iso, jurisdictions, institution_id, base_tier, description, scope_verticals, transport_modes, intelligence_types, last_intelligence_item_at, created_at")
  .eq("status", "active");
if (error) { console.error("query error:", error.message); process.exit(1); }

// reachability artifact (from source-host-reachability.mjs)
const reachPath = resolve(__d, "source-host-reachability-result.json");
const deadByHost = new Map();
if (existsSync(reachPath)) {
  const reach = JSON.parse(readFileSync(reachPath, "utf8"));
  for (const d of reach.dead || []) deadByHost.set(d.host, d);
}
function hostOf(u){ try { return new URL(u).hostname.toLowerCase(); } catch { return null; } }

// classify everything up front
for (const s of sources) {
  s.itype = classifyInstitutionalType(s.name, s.url, s.source_role);
  s.country = countryOf(s);
}

// coverage index: country -> does a vertical-relevant authority cover it?
const coveringByCountry = new Map();   // country -> [covering sources]
let euLevelCoverers = [];
for (const s of sources) {
  if (coversVerticalAuthority(s.itype)) {
    if (s.country) { if (!coveringByCountry.has(s.country)) coveringByCountry.set(s.country, []); coveringByCountry.get(s.country).push(s); }
    // EU-level coverage backstop: EUR-Lex / EU institutions / jurisdiction EU
    const euSig = /eur-?lex|european (commission|union|parliament|council)|\beu\b/i.test(s.name || "") || s.country === "EU" || isoToStr(s.jurisdiction_iso).toUpperCase()==="EU";
    if (euSig && (s.itype === "statute_gazette_db" || s.itype === "intergovernmental")) euLevelCoverers.push(s);
  }
}
const COV_PRIORITY = { statute_gazette_db: 0, intergovernmental: 1, sectoral_regulator_ministry: 2 };
function coverageFor(cand) {
  let out = [];
  if (cand.country && coveringByCountry.has(cand.country))
    out.push(...coveringByCountry.get(cand.country).filter((x) => x.id !== cand.id));
  if (cand.country && EU27.has(cand.country) && euLevelCoverers.length)
    out.push(...euLevelCoverers);
  // dedupe by name, strongest coverage type first (gazette/IGO ahead of sectoral)
  const seen = new Set();
  out = out.filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)))
           .sort((a, b) => (COV_PRIORITY[a.itype] ?? 9) - (COV_PRIORITY[b.itype] ?? 9));
  return out;
}

// ── PASS 1: relevance (relevance FIRST, before any reachability categorization) ──
// Buckets, from clean-kill to most-conservative review:
//   kill              — off-vertical general-legislature ROOT PORTAL, jurisdiction covered
//   reviewStatuteDb   — legislature name but it is really the statute/code text DB (legal text)
//   reviewDeepPage    — legislature institution but a deep topical URL (may be curated content)
//   reviewGap         — legislature, but nothing else covers the jurisdiction (coverage gap)
const kill = [], reviewStatuteDb = [], reviewDeepPage = [], reviewGap = [];
for (const s of sources) {
  if (!isOffVerticalByIdentity(s.itype)) continue;       // only general_legislature are candidates
  const cov = coverageFor(s);
  const rec = {
    id: s.id, name: s.name, url: s.url, country: s.country,
    jurisdiction_iso: s.jurisdiction_iso, source_role: s.source_role, base_tier: s.base_tier,
    itype: s.itype, isRoot: urlIsRoot(s.url),
    coveredBy: cov.slice(0, 3).map((c) => ({ name: c.name, itype: c.itype })),
  };
  if (looksLikeStatuteCodeDb(s.name)) {
    rec.verdict = "REVIEW_STATUTE_DB";
    rec.reason = "named as a legislature but hosts the jurisdiction's statute/code text database — borderline legal-text source, NOT a pure political portal; your call";
    reviewStatuteDb.push(rec);
  } else if (!rec.isRoot) {
    rec.verdict = "REVIEW_DEEP_PAGE";
    rec.reason = "general-legislature institution but the URL is a deep topical page, not a root portal — may be curated relevant content (e.g. a transport-emissions tracker)";
    reviewDeepPage.push(rec);
  } else if (cov.length > 0) {
    rec.verdict = "KILL";
    rec.reason = "off-vertical general-legislature ROOT PORTAL; jurisdiction's vertical-relevant authority already covered (no coverage gap)";
    kill.push(rec);
  } else {
    rec.verdict = "REVIEW_COVERAGE_GAP";
    rec.reason = "off-vertical general legislature BUT no covered vertical-relevant authority found for its jurisdiction — do NOT kill until coverage exists";
    reviewGap.push(rec);
  }
}
const killIds = new Set([...kill, ...reviewStatuteDb, ...reviewDeepPage, ...reviewGap].map((r) => r.id));

// ── PASS 2: categorize survivors by reachability ──────────────────────────────
const fixWww = [], subdomainMoved = [], inconclusiveDns = [];
for (const s of sources) {
  if (killIds.has(s.id)) continue;                       // only survivors get reachability buckets
  const h = hostOf(s.url); if (!h) continue;
  const d = deadByHost.get(h); if (!d) continue;          // reachable -> clean, nothing to do
  if (d.wwwResolves) {
    // www-NORMALIZATION ONLY: rewrite the host's www prefix, touch nothing else.
    const proposed = s.url.replace(h, "www." + h);
    fixWww.push({ id: s.id, name: s.name, current: s.url, proposed, itype: s.itype });
  } else if (d.liveParent && d.liveParent !== h) {
    subdomainMoved.push({ id: s.id, name: s.name, url: s.url, liveParent: d.liveParent, code: d.code, itype: s.itype });
  } else {
    inconclusiveDns.push({ id: s.id, name: s.name, url: s.url, code: d.code, itype: s.itype });
  }
}

// ── report ────────────────────────────────────────────────────────────────────
const typeDist = {}; for (const s of sources) typeDist[s.itype] = (typeDist[s.itype]||0)+1;
console.log(`active sources: ${sources.length}`);
console.log(`institutional-type distribution:`); for (const [k,v] of Object.entries(typeDist).sort((a,b)=>b[1]-a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);

console.log(`\n══ KILL (off-vertical legislature ROOT PORTAL + covered) : ${kill.length} ══`);
for (const r of kill) {
  console.log(`✗ ${r.name}  [${r.country||"?"}]  ${r.url}`);
  console.log(`    covered by: ${r.coveredBy.map((c)=>`${c.name} (${c.itype})`).join(" | ") || "(none listed)"}`);
}
console.log(`\n══ REVIEW — statute/code DB named as legislature (legal-text, your call) : ${reviewStatuteDb.length} ══`);
for (const r of reviewStatuteDb) console.log(`? ${r.name}  [${r.country||"?"}]  ${r.url}`);
console.log(`\n══ REVIEW — deep topical page, not a root portal (maybe curated content) : ${reviewDeepPage.length} ══`);
for (const r of reviewDeepPage) console.log(`? ${r.name}  [${r.country||"?"}]  ${r.url}`);
console.log(`\n══ REVIEW — possible COVERAGE GAP (legislature, nothing else covers jurisdiction) : ${reviewGap.length} ══`);
for (const r of reviewGap) console.log(`? ${r.name}  [${r.country||"?"}]  ${r.url}`);

console.log(`\n══ FIX-WWW (alive; www-normalization only) : ${fixWww.length} ══`);
for (const r of fixWww) console.log(`~ ${r.name}\n    ${r.current}  ->  ${r.proposed}`);
console.log(`\n══ SUBDOMAIN MOVED (needs correct URL) : ${subdomainMoved.length} ══`);
for (const r of subdomainMoved) console.log(`> ${r.name}  ${r.url}  (parent alive: ${r.liveParent})`);
console.log(`\n══ INCONCLUSIVE DNS (recheck from clean network) : ${inconclusiveDns.length} ══`);
for (const r of inconclusiveDns) console.log(`. ${r.name}  ${r.url}  [${r.code}]`);

const out = resolve(__d, "source-relevance-audit-result.json");
writeFileSync(out, JSON.stringify({
  generated_for: "authorization (read-only; no DB mutation performed)",
  active: sources.length, typeDist,
  kill, reviewStatuteDb, reviewDeepPage, reviewGap, fixWww, subdomainMoved, inconclusiveDns,
}, null, 2));
console.log(`\ndurable artifact: ${out}`);
