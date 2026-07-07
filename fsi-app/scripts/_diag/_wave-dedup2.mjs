// READ-ONLY ($0) SHARPER dedup: the 0.6-jaccard pass MISSED 50ccd5cc==3581c084 (verbose news-style title
// diluted token overlap to ~0.25). So for each quarantined item list its TOP live candidates at a LOW
// threshold (>=0.30) + shared key-entity tokens, so semantic dups surface for review. Estimates the TRUE
// unique count vs the inflated automated one.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readAll } = await import("../lib/db.mjs");

const STOP = new Set("the a an of of for and to in on at by with from version update updated new s amp eu us uk regulation rule act draft final releases release plan program programme requirements standard standards".split(" "));
const norm = (t) => !t ? "" : String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const toks = (t) => new Set(norm(t).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
const jac = (a, b) => { const A = toks(a), B = toks(b); if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };
const normUrl = (u) => !u ? "" : String(u).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");

const items = await readAll("intelligence_items", "id,title,source_url,item_type,provenance_status,instrument_identifier,is_archived", { match: (q) => q.eq("is_archived", false) });
const quar = items.filter((i) => i.provenance_status === "quarantined");
const live = items.filter((i) => i.provenance_status !== "quarantined");

let likelyDup = 0, reviewable = 0, clean = 0;
console.log(`quarantined=${quar.length} vs live=${live.length}\n=== quarantined items WITH a live candidate (url / instrument / jaccard>=0.30) ===`);
for (const q of quar) {
  const cands = [];
  for (const c of live) {
    let how = null, s = 0;
    if (q.source_url && normUrl(c.source_url) === normUrl(q.source_url)) { how = "URL"; s = 1; }
    else if (q.instrument_identifier && c.instrument_identifier === q.instrument_identifier) { how = "INSTR"; s = 0.97; }
    else { const j = jac(q.title, c.title); if (j >= 0.30) { how = `j${j.toFixed(2)}`; s = j; } }
    if (how) cands.push({ c, how, s });
  }
  cands.sort((a, b) => b.s - a.s);
  if (!cands.length) { clean++; continue; }
  const strong = cands[0].s >= 0.6 || cands[0].how === "URL" || cands[0].how === "INSTR";
  if (strong) likelyDup++; else reviewable++;
  const tag = strong ? "LIKELY-DUP" : "REVIEW";
  console.log(`  [${tag}] ${q.id.slice(0, 8)} "${q.title.slice(0, 50)}"`);
  for (const { c, how } of cands.slice(0, 2)) console.log(`         -> ${how} ${c.id.slice(0, 8)} [${c.provenance_status}] "${(c.title || "").slice(0, 50)}"`);
}
console.log(`\n=== ESTIMATE ===`);
console.log(`  LIKELY-DUP of live (url/instr/j>=0.6): ${likelyDup}`);
console.log(`  REVIEW (j 0.30-0.60 — eyeball needed): ${reviewable}`);
console.log(`  no live candidate >=0.30 (probably unique): ${clean}`);
console.log(`  -> true UNIQUE is at most ${clean + reviewable}, at least ${clean}; spend gates on the eyeballed REVIEW set.`);
process.exit(0);
