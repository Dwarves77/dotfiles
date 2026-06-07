/** READ-ONLY source-vs-item screen (source-credibility-model). Flags quarantined intelligence_items
 *  whose TITLE/NATURE reads like a SOURCE (publisher / portal / series / database / dashboard / hub /
 *  standing org or coalition) rather than a specific intelligence ITEM (a regulation / finding / signal
 *  / event). Per source-credibility-model Section 9, reclassify-to-source is an OPERATOR decision —
 *  this only SURFACES candidates with a PROPOSED base_tier per Section 3 type taxonomy. No writes. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const { readAll } = await import("../lib/db.mjs");

// Title markers that indicate a SOURCE/portal/publisher (not a specific item).
const SOURCE_MARKERS = /\b(publication|publications|series|portal|database|dashboard|hub|registry|tracker|repository|bulletin|journal|newsletter|press|observatory|platform|index|programme office|secretariat|alliance|coalition|association|council|institute|centre|center|forum|partnership|initiative office)\b/i;
// Section 3 type-taxonomy hint for a proposed base_tier (by institutional nature; operator confirms).
function proposeTier(title) {
  const t = title.toLowerCase();
  if (/\b(un |united nations|oecd|imo|icao|unfccc|world bank|wto|iso|intergovernmental)\b/.test(t)) return "3 (intergovernmental body)";
  if (/\b(ministry|department|agency|commission|epa|carb|regulator|authority|gov\b)/.test(t)) return "2 (regulator guidance)";
  if (/\b(alliance|coalition|association|council|federation|consortium|industry)\b/.test(t)) return "4 (industry body)";
  if (/\b(reuters|bloomberg|ft |financial times|lloyd|freightwaves|journal of commerce|press)\b/.test(t)) return "5 (news reporting)";
  if (/\b(greenbiz|edie|environmental finance|analyst|analysis|think tank|institute|centre|center)\b/.test(t)) return "6 (analysis/opinion)";
  return "7 (overflow — needs operator classification)";
}

const q = await readAll("intelligence_items", "id,legacy_id,title,item_type,source_url,provenance_status",
  { match: (x) => x.eq("is_archived", false).eq("provenance_status", "quarantined") });

const candidates = q.filter((it) => SOURCE_MARKERS.test(it.title || ""));
console.log(`\n===== SOURCE-vs-ITEM SCREEN (read-only, ${q.length} quarantined) =====`);
console.log(`source-not-item CANDIDATES (title reads like a source/portal/org): ${candidates.length}`);
console.log(`(per source-credibility-model S9: SURFACE for operator decision — do NOT auto-reclassify)\n`);
console.log(`key          item_type        proposed base_tier               title`);
for (const it of candidates) {
  console.log(`${(it.legacy_id || it.id.slice(0, 8)).padEnd(12)} ${String(it.item_type).padEnd(15)} ${proposeTier(it.title).padEnd(32)} ${(it.title || "").slice(0, 50)}`);
}
console.log(`\n(remaining ${q.length - candidates.length} quarantined read as genuine intelligence items — keep + generate/calibrate.)`);
