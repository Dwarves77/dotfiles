// READ-ONLY corpus diagnostic: how many regulation-family items have a PORTAL / LANDING-page primary
// instead of the ENACTED TEXT? Same defect class the PPWR prove-on-one surfaced (efdb3390 pointed at a
// DG-ENV topic page, not EUR-Lex). The count sizes the backward scope: the backward pass is re-grounding
// truncated items AND re-pointing reg items off portal pages onto enacted text. No writes, no spend.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(ROOT + "/.env.local");

const REG_FAMILY = ["regulation", "directive", "standard", "guidance", "framework"];
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

// REFINED classifier. The axis that matters for grounding: does the source CONTAIN the enacted
// regulatory text (groundable qualifications) or NOT (a portal/announcement that hollow-grounds)?
//   ENACTED   — the law's own text: CELEX/ELI/legal-content/TXT, a bill-text view, a gazette/official
//               document, a .pdf of the instrument, a date-stamped regulator document.
//   PORTAL    — a topic/overview/eu-action landing page OR a homepage/section root (no specific doc).
//   ANNOUNCE  — a press release / news item: NOT the enacted text → a re-point candidate like portal
//               (groups with portal for the backward pass; broken out so the count is honest).
//   ambiguous — genuinely unclear; listed for manual review (kept small).
const ENACTED_HOST = /(^|\.)(eur-lex\.europa\.eu|federalregister\.gov|ecfr\.gov|govinfo\.gov|legislation\.gov\.uk)$/i;
const ENACTED_PATHISH = /celex|\/eli\/|legal-content|\/txt\b|federalregister\.gov\/documents|billtextclient|billnavclient|\/bill(text|nav)?\b|\/wac\b|\/laws?\/|\/act(s)?\/|\/resolution|\/circulars?\/|\/legislation\/|t\d{8}|\/\d{6,}\b|\.pdf($|\?)/i;
const ANNOUNCE_PATHISH = /\/press(corner|-?release|-?room)?|\/media-?cent|\/news\/|\/whats-new\/|\/publicaciones\/|\/press\b|\/announce/i;
const PORTAL_PATHISH = /\/topics?\/|\/eu-action\/|\/policies?\b|\/areas?\/|\/sector\/|\/about\b|_en$|\/home\b|\/index\b|\/overview\b|\/who-we-are\/|\/goals\b|\/standards?\/?$|\/groups?\//i;

function classify(url) {
  if (!url || !/^https?:\/\//i.test(url)) return "no_source";
  const host = hostOf(url);
  let path = ""; try { path = new URL(url).pathname + (new URL(url).search || ""); } catch {}
  if (ENACTED_HOST.test(host) || ENACTED_PATHISH.test(url)) return "enacted";
  if (ANNOUNCE_PATHISH.test(path)) return "announce";       // re-point candidate (groups w/ portal)
  if (PORTAL_PATHISH.test(path)) return "portal_landing";   // re-point candidate
  // a bare host root (path "/" or "/en/" etc.) with no document = portal-ish
  if (/^\/?(en|index\.html?)?\/?$/i.test(path)) return "portal_landing";
  return "ambiguous"; // genuinely unclear — manual review
}

const items = (await readAll("intelligence_items", "id,legacy_id,title,item_type,source_url,provenance_status,is_archived"))
  .filter((r) => REG_FAMILY.includes(r.item_type) && !r.is_archived);

const buckets = { enacted: [], portal_landing: [], announce: [], ambiguous: [], no_source: [] };
for (const it of items) buckets[classify(it.source_url)].push(it);
const repoint = [...buckets.portal_landing, ...buckets.announce]; // both groups need re-point-then-re-ground

console.log(`REG-FAMILY active items: ${items.length}`);
for (const k of ["enacted", "portal_landing", "announce", "ambiguous", "no_source"]) console.log(`  ${String(buckets[k].length).padStart(4)}  ${k}`);
console.log(`  ${String(repoint.length).padStart(4)}  → RE-POINT total (portal_landing + announce)`);
console.log(`\nRE-POINT candidates (portal/announce primaries — id [status] host | item | url):`);
for (const it of repoint) console.log(`  ${it.id.slice(0, 8)} [${it.provenance_status}] ${hostOf(it.source_url)} | ${(it.title || it.legacy_id || "").slice(0, 38)} | ${it.source_url}`);
console.log(`\nAMBIGUOUS (manual review — neither clearly enacted nor clearly portal/announce):`);
for (const it of buckets.ambiguous) console.log(`  ${it.id.slice(0, 8)} ${hostOf(it.source_url)} | ${it.source_url}`);
process.exit(0);
