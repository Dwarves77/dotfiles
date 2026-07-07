/** CORRECTED substrate + 45-flip probe. Counts claims/sections via PAGINATED full-table reads
 *  (readAll), NOT .in(<ids>) which truncates at PostgREST's 1000-row cap and corrupted the earlier
 *  "56 stale / all-45-empty" numbers. Re-establishes ground truth. Pure reads. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}

const items = await readAll("intelligence_items", "id,legacy_id,item_type,provenance_status", { match: (q) => q.eq("is_archived", false) });
const allClaims = await readAll("section_claim_provenance", "intelligence_item_id,claim_kind");
const allSecs = await readAll("intelligence_item_sections", "item_id,content_md");

const fact = new Map(), gap = new Map(), sec = new Map();
for (const c of allClaims) { if (c.claim_kind === "FACT") fact.set(c.intelligence_item_id, (fact.get(c.intelligence_item_id) || 0) + 1); else if (c.claim_kind === "GAP") gap.set(c.intelligence_item_id, (gap.get(c.intelligence_item_id) || 0) + 1); }
for (const s of allSecs) if ((s.content_md || "").trim()) sec.set(s.item_id, (sec.get(s.item_id) || 0) + 1);
const claims = (id) => (fact.get(id) || 0) + (gap.get(id) || 0);
console.log(`rows: items=${items.length} claim_rows=${allClaims.length} section_rows=${allSecs.length}`);

const byStatus = {};
for (const it of items) {
  const b = byStatus[it.provenance_status] ||= { total: 0, withClaims: 0, zeroClaims: 0 };
  b.total++; if (claims(it.id) > 0) b.withClaims++; else b.zeroClaims++;
}
console.log(`\n=== CORPUS (corrected, paginated) ===`);
console.log(`status              total  withClaims  zeroClaims`);
for (const [st, b] of Object.entries(byStatus).sort((a, b2) => b2[1].total - a[1].total))
  console.log(`${String(st).padEnd(20)} ${String(b.total).padStart(4)}   ${String(b.withClaims).padStart(8)}   ${String(b.zeroClaims).padStart(8)}`);

// the 45 flips
const flips = JSON.parse(readFileSync(resolve(ROOT, "scripts/_diag/_flip-ids.json"), "utf8"));
const byId = new Map(items.map((i) => [i.id, i]));
let zero = 0, withC = 0;
const detail = [];
for (const f of flips) {
  const it = byId.get(f.id);
  const fc = fact.get(f.id) || 0, gc = gap.get(f.id) || 0, sc = sec.get(f.id) || 0;
  if (fc + gc > 0) withC++; else zero++;
  detail.push({ key: f.key, type: f.type, prov: it?.provenance_status, fact: fc, gap: gc, sec: sc });
}
console.log(`\n=== THE 45 FLIPS (corrected) ===`);
console.log(`with claims: ${withC}; zero claims: ${zero}`);
console.log(`key              type            prov          fact gap sec`);
for (const d of detail.sort((a, b) => String(a.type).localeCompare(b.type)))
  console.log(`${d.key.padEnd(16)} ${String(d.type).padEnd(15)} ${String(d.prov).padEnd(13)} ${String(d.fact).padStart(4)} ${String(d.gap).padStart(3)} ${String(d.sec).padStart(3)}`);
