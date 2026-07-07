/** READ-ONLY value triage for the 45 flip pilot (research-or-erase audit #1, value-first).
 *  Pre-sorts ONLY mechanical disqualifiers (duplicate / portal / source-not-item). Everything else
 *  is surfaced to Jason for the VALUE call (importance to the verticals is his judgment, not the
 *  model's). Biases toward SURFACE, never pre-erases on a value judgment. No spend; pure reads. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}

const flips = JSON.parse(readFileSync(resolve(ROOT, "scripts/_diag/_flip-ids.json"), "utf8"));
const flipIds = new Set(flips.map((f) => f.id));

const items = await readAll("intelligence_items",
  "id,legacy_id,title,item_type,source_url,source_id,summary,what_is_it,jurisdictions,verticals,topic_tags,domain,category,is_archived",
  { match: (q) => q.eq("is_archived", false) });
const byId = new Map(items.map((i) => [i.id, i]));
const sources = await readAll("sources", "id,name,url,status,base_tier");
const srcById = new Map(sources.map((s) => [s.id, s]));

// duplicate detection: other non-archived items sharing the same source_url
const urlCount = new Map();
for (const it of items) { const u = (it.source_url || "").trim(); if (u) urlCount.set(u, (urlCount.get(u) || 0) + 1); }

// portal / source-not-item title heuristics (mechanical — these are NOT groundable FSI items)
const PORTAL_RX = /(cookie policy|consent management|download portal|public service guide|central hub|\bdashboard\b|\bnewsletter\b|access and navigation|how to (access|use)|website|homepage|landing page|portal\b|programs and compliance|organizational overview|general rules|- resources$|navigation)/i;

const groups = { DUPLICATE: [], PORTAL_OR_SOURCE: [], SURFACE: [] };
for (const f of flips) {
  const it = byId.get(f.id);
  if (!it) { groups.SURFACE.push({ f, it: null, why: "LIVE ROW MISSING" }); continue; }
  const src = srcById.get(it.source_id);
  const dup = (it.source_url && urlCount.get(it.source_url.trim()) > 1);
  const portal = PORTAL_RX.test(it.title || "");
  const rec = { f, it, src, dupCount: it.source_url ? urlCount.get(it.source_url.trim()) : 0 };
  if (dup) groups.DUPLICATE.push(rec);
  else if (portal) groups.PORTAL_OR_SOURCE.push(rec);
  else groups.SURFACE.push(rec);
}

const line = (r) => {
  const it = r.it; if (!it) return `  ${r.f.key}  ${r.why}`;
  const juris = (it.jurisdictions || []).slice(0, 3).join(",");
  const topics = (it.topic_tags || []).slice(0, 3).join(",");
  return `  ${(it.legacy_id || it.id.slice(0, 8)).padEnd(16)} [${String(it.item_type).padEnd(13)}] ${it.title}\n` +
         `        src=${r.src ? `"${r.src.name}" t${r.src.base_tier}/${r.src.status}` : "NONE"}  juris=[${juris}] topics=[${topics}]${r.dupCount > 1 ? `  DUP×${r.dupCount}` : ""}`;
};

console.log(`\n45 flips — VALUE TRIAGE (mechanical pre-sort; SURFACE = your value call)\n${"=".repeat(72)}`);
console.log(`\n■ MECHANICAL — DUPLICATE source_url (propose: archive the redundant one)  [${groups.DUPLICATE.length}]`);
groups.DUPLICATE.forEach((r) => console.log(line(r)));
console.log(`\n■ MECHANICAL — PORTAL / SOURCE-NOT-ITEM (propose: register-as-source or archive portal_artifact; operator confirms)  [${groups.PORTAL_OR_SOURCE.length}]`);
groups.PORTAL_OR_SOURCE.forEach((r) => console.log(line(r)));
console.log(`\n■ SURFACE TO JASON — real, value call is yours (FSI lens: would this, grounded, give useful regulatory/competitive signal?)  [${groups.SURFACE.length}]`);
groups.SURFACE.sort((a, b) => String(a.it?.item_type).localeCompare(String(b.it?.item_type)));
groups.SURFACE.forEach((r) => console.log(line(r)));

console.log(`\n${"=".repeat(72)}`);
console.log(`TOTALS: duplicate=${groups.DUPLICATE.length}  portal/source=${groups.PORTAL_OR_SOURCE.length}  surface=${groups.SURFACE.length}  (of ${flips.length})`);
console.log(`Spend so far: 0. Active sourcing (Browserless) only AFTER you make value calls + approve the quote on the valuable subset.`);
