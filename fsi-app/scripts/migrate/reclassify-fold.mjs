/** KEYSTONE MIGRATION (guarded, snapshotted, dry-run default): item_type corrections.
 *  GOVERNING: caros-ledge-platform-intent (five-surface routing; Technology FOLDED per operator
 *  decision 2026-06-07 Option B) + env-policy Format Mapping + source-credibility-model (portals = sources).
 *
 *  THREE groups, all reversible (item_changelog rows for type changes; db.mjs snapshots for every write):
 *   A. RECLASSIFY (reg-family typed, brief is a non-reg format): item_type -> detected format's type.
 *   B. TECH FOLD (verified technology/innovation/tool, genuine tech briefs): item_type -> research/market/regional
 *      by substance (Technology surface is being removed; these re-home onto Research/Market/Operations).
 *   C. PORTAL->SOURCE (quarantined tool/portal items that are source-not-item): reclassifyToSource
 *      (register host + read-back verify + archive; protected by the live migration-135 trigger).
 *
 *  DRY-RUN default; --apply to write. Reads paginated (readAll). Zero Browserless. Per-step read-back. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, readAll, guardedUpdate, reclassifyToSource } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const sb = readClient();
const host = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

const REG = new Set(["regulation", "directive", "standard", "guidance", "framework", "law"]);
const FMT = { "Market Signal": "market_signal", "Research Summary": "research_finding", "Operations Profile": "regional_data" };
const detectFmt = (b) => { const h = (b || "").split(/\r?\n/).slice(0, 14).join("\n"); return Object.keys(FMT).find((f) => h.includes(f)) || null; };
// Title-anchored screens (verbatim from scripts/verify/source-vs-item.mjs) — a brief can carry a
// format token in its header while the ITEM is actually a portal/error page. Screen those out of the
// content-reclassify (Group A) so portals route to source (C) and error/stale titles are flagged, not retyped.
const ERR_TITLE_RE = /\b(403|forbidden|access (unavailable|restrict\w*|denied|verification|blocked)|accessibility verification|service (status|availability)|bot detection|cloudflare|cloudfront|temporarily (inaccessible|unavailable)|content unavailable|cookie (policy|consent)|captcha)\b/i;
const PORTAL_TITLE_RE = /\b(data (and statistics )?(explorer|portal|viewer|center)|explorer platform|open data|statistics (platform|database|explorer)|database\b|dashboard|statutes online|legislation register|legislative database|legal database|official website|landing page)\b/i;
const portalTier = (h, t) => /legislat|assembly|senate|congress|parliament|gazette|\.gov|\.gob|council/i.test(`${h} ${t}`) ? 2 : /\b(un|imo|icao|iea|irena|oecd|world bank|unctad|eclac|intergovernmental)\b/i.test(t) ? 3 : 4;

// Group B explicit folds (verified genuine-tech) — target by substance.
const FOLD = {
  "sustainable-aviation-fuel-saf-production-pricing": "market_signal",
  "autonomous-connected-freight-technology": "research_finding",
  "battery-electric-vehicle-technology": "research_finding",
  "ae628786": "research_finding",                       // IRENA renewable power costs (report)
  "marine-fuel-decarbonisation-pathways": "research_finding",
  "r27": "market_signal",                               // Yara Clean Ammonia (corporate initiative)
  "hydrogen-ammonia-as-maritime-fuel": "research_finding",
  "solar-battery-energy-storage-for-warehouses": "regional_data", // facility cost -> Operations
};
// Operator-confirmed: these portal-title MATCHES are real content, exempt from the portal screen.
// 595117e9 = Louisiana State Freight Plan (a real operations document → regional_data, not a portal).
const SCREEN_EXEMPT = new Set(["595117e9"]);
// Group C portal->source (the operator-confirmed 9). base_tier by institutional type.
const PORTAL = {
  "371d2218": 3, "3cac277d": 3, "a6": 3, "c9": 4, "cd392833": 4, "dde5a446": 3, "8c0e4e5f": 4, "7ff81425": 4, "o12": 4,
};

const items = await readAll("intelligence_items", "id,legacy_id,title,item_type,full_brief,source_url,provenance_status,is_archived", { match: (q) => q.eq("is_archived", false) });
const byKey = (k) => items.find((r) => r.legacy_id === k || r.id.startsWith(k));

// Build the plan.
const groupA = [], groupB = [], groupC = [], groupFlag = [];
for (const it of items) {
  const key = it.legacy_id || it.id.slice(0, 8);
  if (PORTAL[key] !== undefined) { groupC.push({ it, tier: PORTAL[key] }); continue; }
  if (FOLD[key] !== undefined) { groupB.push({ it, target: FOLD[key] }); continue; }
  if (REG.has(it.item_type) && it.provenance_status === "verified") {
    const det = detectFmt(it.full_brief);
    if (!(det && FMT[det])) continue;
    const title = it.title || "";
    // Screen: a portal-titled item is source-not-item (route to C, not content-reclassify);
    // an error/stale-titled item is NOT retyped (flag for separate re-title/archive review).
    if (PORTAL_TITLE_RE.test(title) && !SCREEN_EXEMPT.has(key)) { groupC.push({ it, tier: portalTier(host(it.source_url), title) }); continue; }
    if (ERR_TITLE_RE.test(title)) { groupFlag.push({ it, why: "error/stale title — re-title or archive separately" }); continue; }
    groupA.push({ it, target: FMT[det], det });
  }
}

const cite = { skill: "caros-ledge-platform-intent", reason: "item_type correction: route item to its true surface by generated-brief substance (Technology folded per operator Option B 2026-06-07)" };
const citeSrc = { skill: "source-credibility-model", reason: "portal/tool is source-not-item: register host + archive (Technology fold disposition C)" };

function show(label, rows, fmt) { console.log(`\n── ${label} (${rows.length}) ──`); for (const r of rows) console.log("   " + fmt(r)); }
console.log(`\n===== RECLASSIFY + FOLD (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
show("A. reg-family -> non-reg type (by detected brief format)", groupA, (r) => `${(r.it.legacy_id || r.it.id.slice(0, 8)).padEnd(12)} ${r.it.item_type} -> ${r.target.padEnd(15)} [${r.det}]  ${(r.it.title || "").slice(0, 40)}`);
show("B. tech fold -> Research/Market/Operations", groupB, (r) => `${(r.it.legacy_id || r.it.id.slice(0, 8)).padEnd(12)} ${r.it.item_type} -> ${r.target.padEnd(15)} ${(r.it.title || "").slice(0, 44)}`);
show("C. portal/tool -> SOURCE (register host + archive)", groupC, (r) => `T${r.tier} ${host(r.it.source_url).padEnd(26)} ${(r.it.title || "").slice(0, 44)}`);
show("FLAG (NOT acted on — error/stale title, separate review)", groupFlag, (r) => `${(r.it.legacy_id || r.it.id.slice(0, 8)).padEnd(12)} ${(r.it.title || "").slice(0, 56)}`);
console.log(`\nTOTAL changes: A=${groupA.length}  B=${groupB.length}  C=${groupC.length}  = ${groupA.length + groupB.length + groupC.length}  (flagged-not-acted: ${groupFlag.length})`);

if (!APPLY) { console.log(`\nDRY-RUN — pass --apply to execute (guarded: changelog reversal + snapshots + read-back).`); process.exit(0); }

// APPLY — per-item, with item_changelog reversal row + read-back.
let aOk = 0, bOk = 0, cOk = 0, fail = 0;
async function retype(it, target) {
  await sb.from("item_changelog").insert({ item_id: it.id, change_type: "RECLASSIFIED", field: "item_type", previous_value: it.item_type, new_value: target, detected_by: "reclassify-fold-2026-06-07" });
  await guardedUpdate("intelligence_items", (qb) => qb.eq("id", it.id), { item_type: target }, { cite });
  const { data } = await sb.from("intelligence_items").select("item_type").eq("id", it.id).single();
  if (data?.item_type !== target) throw new Error(`read-back mismatch ${it.id}: ${data?.item_type} != ${target}`);
}
for (const r of groupA) { try { await retype(r.it, r.target); aOk++; } catch (e) { fail++; console.log(`  A FAIL ${r.it.id.slice(0, 8)}: ${e.message}`); } }
for (const r of groupB) { try { await retype(r.it, r.target); bOk++; } catch (e) { fail++; console.log(`  B FAIL ${r.it.id.slice(0, 8)}: ${e.message}`); } }
for (const r of groupC) {
  try { await reclassifyToSource(r.it.id, { url: r.it.source_url, name: (r.it.title || host(r.it.source_url)).slice(0, 120), base_tier: r.tier, extra: { tier: r.tier, tier_at_creation: r.tier, source_role: "portal", category: "research", notes: "tech-fold disposition C: portal source-not-item 2026-06-07" } }, { cite: citeSrc }); cOk++; }
  catch (e) { fail++; console.log(`  C FAIL ${r.it.id.slice(0, 8)}: ${e.message}`); }
}
console.log(`\nAPPLIED: A=${aOk}/${groupA.length}  B=${bOk}/${groupB.length}  C=${cOk}/${groupC.length}  failures=${fail}`);
process.exit(fail ? 1 : 0);
