/** VERIFIER (read-only, 0 Browserless): source != item.
 *  GOVERNING: environmental-policy-and-innovation integrity rule ("source is a portal where legislation
 *  lives; an item is a specific finding/regulation") + CLAUDE.md "Source = portal, not regulation".
 *  Detection is TITLE-ANCHORED (lesson re-applied from the reconciliation: body-text scanning over-fires
 *  on normal regulatory vocabulary — isErrorBody on a 30k brief false-flagged real regs). urlIsRoot from
 *  the live entity-gate.mjs is reused for the portal signal.
 *  Buckets: ERROR-ARTIFACT (title names an error/blocked page AND brief is a shell) ; STALE-TITLE
 *  (error title but rich brief -> re-title, KEEP) ; SOURCE-NOT-ITEM (portal/registry mis-ingested). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { urlIsRoot } from "../../src/lib/sources/entity-gate.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const host = (u) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return ""; } };
const ERR_TITLE_RE = /\b(403|forbidden|access (unavailable|restrict\w*|denied|verification|blocked)|accessibility verification|service (status|availability)|bot detection|cloudflare|cloudfront|temporarily (inaccessible|unavailable)|content unavailable|cookie (policy|consent)|captcha)\b/i;
const PORTAL_TITLE_RE = /\b(data (and statistics )?(explorer|portal|viewer|center)|explorer platform|open data|statistics (platform|database|explorer)|database\b|dashboard|statutes online|legislation register|legislative database|legal database|official website|landing page)\b/i;
const SHELL = 1500;

const { data: srcs } = await sb.from("sources").select("url");
const regHosts = new Set((srcs || []).map((s) => host(s.url)).filter(Boolean));

// fire-test (the cases that broke v1)
const FT = [
  ["EU CBAM Carbon Border Adjustment Mechanism Regulation 2023/956", "eur-lex.europa.eu", 24000, "PASS"],
  ["New York City Local Law 97 of 2019 - Building Emissions", "nyc.gov", 22000, "PASS"],
  ["ACT Environment Website - Access Verification Issue", "act.gov.au", 0, "ERROR-ARTIFACT"],
  ["IRENA Power Generation Costs - Access Unavailable", "irena.org", 24000, "STALE-TITLE"],
  ["IEA Data and Statistics Explorer Platform", "iea.org", 21000, "SOURCE-NOT-ITEM"],
];
function classify(title, h, len, sourceUrl) {
  const err = ERR_TITLE_RE.test(title || "");
  const portal = PORTAL_TITLE_RE.test(title || "");
  if (portal && (regHosts.has(h) || urlIsRoot(sourceUrl || ""))) return "SOURCE-NOT-ITEM";
  if (err) return len < SHELL ? "ERROR-ARTIFACT" : "STALE-TITLE";
  return "PASS";
}
let ok = 0;
for (const [t, h, len, want] of FT) { const got = classify(t, regHosts.has(h) ? h : h, len, "https://" + h + "/x"); if (got === want) ok++; else console.log(`  FIRE-TEST FAIL: "${t.slice(0,34)}" got=${got} want=${want}`); }
console.log(`fire-test: ${ok}/${FT.length} ok (registry hosts: ${regHosts.size})\n`);

const { data: items } = await sb.from("intelligence_items")
  .select("id,legacy_id,title,item_type,source_url,full_brief").eq("provenance_status", "verified").eq("is_archived", false).limit(2000);
const buckets = { PASS: 0, "ERROR-ARTIFACT": [], "STALE-TITLE": [], "SOURCE-NOT-ITEM": [] };
for (const it of items || []) {
  const v = classify(it.title, host(it.source_url), (it.full_brief || "").length, it.source_url);
  if (v === "PASS") buckets.PASS++; else buckets[v].push(it);
}
console.log(`===== VERIFIER: source-vs-item (title-anchored) =====`);
console.log(`verified briefs: ${(items || []).length}  |  PASS ${buckets.PASS}  ERROR-ARTIFACT ${buckets["ERROR-ARTIFACT"].length}  STALE-TITLE ${buckets["STALE-TITLE"].length}  SOURCE-NOT-ITEM ${buckets["SOURCE-NOT-ITEM"].length}\n`);
for (const k of ["ERROR-ARTIFACT", "STALE-TITLE", "SOURCE-NOT-ITEM"]) {
  if (!buckets[k].length) continue;
  console.log(`── ${k} (${buckets[k].length}) ──`);
  for (const it of buckets[k]) console.log(`  [${it.item_type}] ${(it.legacy_id || it.id.slice(0, 8))} len=${(it.full_brief||'').length}  ${(it.title || "").slice(0, 48)}`);
  console.log("");
}
console.log(`=== source-vs-item done (0 Browserless) ===`);
