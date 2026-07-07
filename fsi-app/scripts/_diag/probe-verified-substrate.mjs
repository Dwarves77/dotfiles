/** READ-ONLY: is the corpus-wide 'verified' label backed by a real grounding ledger, or stale/vacuous?
 *  For every non-archived item: provenance_status, section count (non-empty), FACT/GAP claim counts,
 *  regeneration_skill_version. Answers the load-bearing question for the whole redo strategy:
 *  does provenance_status='verified' currently mean "genuinely grounded" or "stale pre-119 vacuous pass"? */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const sb = readClient();

const items = await readAll("intelligence_items", "id,provenance_status,item_type,regeneration_skill_version",
  { match: (q) => q.eq("is_archived", false) });
const ids = items.map((i) => i.id);

const sec = new Map(), fact = new Map(), gap = new Map();
for (let i = 0; i < ids.length; i += 100) {
  const slice = ids.slice(i, i + 100);
  const { data: s } = await sb.from("intelligence_item_sections").select("item_id,content_md").in("item_id", slice);
  for (const x of s || []) if ((x.content_md || "").trim()) sec.set(x.item_id, (sec.get(x.item_id) || 0) + 1);
  const { data: c } = await sb.from("section_claim_provenance").select("intelligence_item_id,claim_kind").in("intelligence_item_id", slice);
  for (const x of c || []) {
    const m = x.claim_kind === "FACT" ? fact : x.claim_kind === "GAP" ? gap : null;
    if (m) m.set(x.intelligence_item_id, (m.get(x.intelligence_item_id) || 0) + 1);
  }
}

const byStatus = {};
for (const it of items) {
  const claims = (fact.get(it.id) || 0) + (gap.get(it.id) || 0);
  const bucket = byStatus[it.provenance_status] ||= { total: 0, withClaims: 0, zeroClaims: 0, withSections: 0, zeroSections: 0 };
  bucket.total++;
  if (claims > 0) bucket.withClaims++; else bucket.zeroClaims++;
  if ((sec.get(it.id) || 0) > 0) bucket.withSections++; else bucket.zeroSections++;
}

console.log(`\n=== corpus-wide (non-archived: ${items.length}) — provenance vs ACTUAL grounding substrate ===`);
console.log(`status              total  withClaims  zeroClaims  withSections  zeroSections`);
for (const [st, b] of Object.entries(byStatus).sort((a, b2) => b2[1].total - a[1].total)) {
  console.log(`${String(st).padEnd(20)} ${String(b.total).padStart(4)}   ${String(b.withClaims).padStart(8)}    ${String(b.zeroClaims).padStart(8)}    ${String(b.withSections).padStart(8)}    ${String(b.zeroSections).padStart(8)}`);
}

// The decisive number: of items currently 'verified', how many have a real ledger?
const v = byStatus["verified"];
if (v) {
  console.log(`\nDECISIVE: of ${v.total} 'verified' items, ${v.withClaims} have a real FACT/GAP ledger; ${v.zeroClaims} have ZERO claims (stale/vacuous).`);
  console.log(v.withClaims === 0
    ? "  => EVERY 'verified' is currently vacuous (no claim ledger). The verified label is NOT backed by grounding."
    : `  => ${v.withClaims}/${v.total} 'verified' are genuinely grounded.`);
}
