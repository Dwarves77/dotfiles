/** Grounded keep/cut sheet — applies the PER-JURISDICTION freight-sustainability-lawmaking
 * basis (the criterion chosen 2026-06-04) on top of the read-only relevance audit. READ-ONLY.
 *
 * The earlier "general_legislature = off-vertical" rule is SUPERSEDED: legislatures enact
 * binding industry law, so they are KEEP unless the jurisdiction genuinely produces no
 * freight-sustainability lawmaking AND coverage exists. Grounding (web-researched 2026-06-04):
 *   - US CARB/CFS adopters (ACT clean-trucks + Clean Fuel Standard + Section-177 ACC):
 *     CA CO MD MA NJ NM NY OR RI VT WA CT DE ME MN VA (+DC) — documented freight-sustainability law.
 *   - Other US states: kept — a state legislature enacts binding law (trucking, ports, idling,
 *     infrastructure); "genuinely none" is not provable, so default KEEP per the chosen criterion.
 *   - EU member parliaments: KEEP — transpose EU freight-sustainability law (ETS-maritime, FuelEU,
 *     CBAM, ReFuelEU) into national law.
 *   - Major freight nations (JP KR CN SG GB incl. Scotland/Wales): KEEP.
 *   - AU states / CA provinces: KEEP (state EPA / provincial carbon pricing — QC cap-and-trade, BC LCFS).
 *   - Port / major cities (LA & Long Beach Clean Truck Program, NYC LL97, Seattle/Boston/Phila ports): KEEP.
 *   - Puerto Rico: KEEP (Law 33-2019 Climate Act; Act 17-2019 renewable+EV).
 * LOWEST-ACTIVITY (your-call): Pacific micro-territory legislatures (Guam, American Samoa Fono,
 *   CNMI) — climate is federal-plan/EPA-driven, not legislative; tiny import-only economies — plus
 *   Tokyo Metropolitan Assembly (covered by the Tokyo Bureau of Environment, dead host, 0 items).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __d = dirname(fileURLToPath(import.meta.url));
const audit = JSON.parse(readFileSync(resolve(__d, "source-relevance-audit-result.json"), "utf8"));
const flagged = [...audit.kill, ...audit.reviewStatuteDb, ...audit.reviewDeepPage]; // the legislatures

const CARB_CFS = ["california","colorado","maryland","massachusetts","new jersey","new mexico","new york","oregon","rhode island","vermont","washington","connecticut","delaware","maine","minnesota","virginia"];
const MAJOR_NATION = new Set(["JP","KR","CN","SG","GB"]);
const EU27 = new Set("AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" "));
const lc = (s) => (s || "").toLowerCase();

function assess(r) {
  const n = lc(r.name);
  if (/tokyo metropolitan assembly/.test(n)) return { verdict: "LOW_ACTIVITY", reason: "metro legislature; Tokyo cap-and-trade is published by the Tokyo Bureau of Environment (already covered); dead host, 0 items" };
  if (/\bguam\b|american samoa|northern mariana|mariana islands|virgin islands/.test(n)) return { verdict: "LOW_ACTIVITY", reason: "Pacific/Caribbean micro-territory legislature; freight-sustainability action is federal-plan/EPA-driven, not legislative (EPA PCAP); tiny import-only economy" };
  if (/puerto rico/.test(n)) return { verdict: "KEEP", reason: "Law 33-2019 Climate Change Act + Act 17-2019 (100% renewable, EV transition) — independent freight-sustainability legislation" };
  if (r.country === "US") {
    const st = CARB_CFS.find((s) => n.includes(s));
    if (st) return { verdict: "KEEP", reason: `US CARB/CFS adopter (${st}) — documented clean-truck/clean-fuel freight legislation` };
    if (/city council/.test(n)) return { verdict: "KEEP", reason: "US city legislature — local freight law (port clean-truck programs / building-performance / last-mile rules)" };
    return { verdict: "KEEP", reason: "US state legislature — enacts binding transport/trucking/port law; no-activity not provable" };
  }
  if (EU27.has(r.country)) return { verdict: "KEEP", reason: "EU member parliament — transposes EU freight-sustainability law (ETS-maritime, FuelEU, CBAM, ReFuelEU)" };
  if (r.country === "EU") return { verdict: "KEEP", reason: "EU institution — EU-level freight-sustainability legislation/tracking" };
  if (MAJOR_NATION.has(r.country)) return { verdict: "KEEP", reason: "major freight nation — national binding freight-sustainability law" };
  if (r.country === "AU") return { verdict: "KEEP", reason: "Australian legislature — state/federal EPA + transport-emissions law" };
  if (r.country === "CA") return { verdict: "KEEP", reason: "Canadian legislature — provincial carbon pricing / federal freight law (QC cap-and-trade, BC LCFS, Transport Canada)" };
  return { verdict: "KEEP", reason: "national legislature — enacts binding freight-sustainability law" };
}

const keep = [], lowActivity = [];
for (const r of flagged) {
  const a = assess(r);
  const rec = { name: r.name, url: r.url, country: r.country, reason: a.reason };
  (a.verdict === "LOW_ACTIVITY" ? lowActivity : keep).push(rec);
}

// KEEP reason rollup
const roll = {};
for (const k of keep) { const key = k.reason.split(" —")[0].split(" (")[0]; roll[key] = (roll[key] || 0) + 1; }

console.log(`GROUNDED RELEVANCE SHEET (per-jurisdiction lawmaking basis)\n`);
console.log(`legislatures assessed: ${flagged.length}`);
console.log(`  KEEP: ${keep.length}`);
console.log(`  LOWEST-ACTIVITY (your call): ${lowActivity.length}\n`);
console.log(`KEEP by reason:`);
for (const [k, v] of Object.entries(roll).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
console.log(`\nLOWEST-ACTIVITY — your call (grounded, marginal):`);
for (const r of lowActivity) console.log(`  ? ${r.name}  [${r.country}]\n      ${r.reason}`);

console.log(`\nCLEANUP (relevance-independent, valid regardless):`);
console.log(`  fix-www (www-normalization only): ${audit.fixWww.length}`);
console.log(`  subdomain moved (needs correct URL): ${audit.subdomainMoved.length}`);
console.log(`  inconclusive DNS (recheck): ${audit.inconclusiveDns.length}`);

const out = resolve(__d, "source-relevance-grounded-result.json");
writeFileSync(out, JSON.stringify({ basis: "per-jurisdiction freight-sustainability lawmaking (2026-06-04)", assessed: flagged.length, keep, lowActivity, cleanup: { fixWww: audit.fixWww, subdomainMoved: audit.subdomainMoved, inconclusiveDns: audit.inconclusiveDns } }, null, 2));
console.log(`\ndurable artifact: ${out}`);
