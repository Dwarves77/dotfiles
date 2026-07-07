// READ-ONLY ($0) wave dedup analysis. Before spending ANYTHING on re-grounding the quarantined set,
// answer: how much of it is information the LIVE corpus ALREADY HAS? Three outputs:
//   A. The 50ccd5cc question — was the GLEC item we just re-grounded a duplicate of an already-live item?
//   B. For every quarantined item: best match among LIVE (verified) items + among quarantined PEERS.
//      Buckets: DUP-OF-LIVE (delete free) / PEER-CLUSTER (keep one) / UNIQUE (the only re-ground candidates).
//   C. For UNIQUE items: is the fetched content already STORED (agent_run_searches pool)? -> re-ground
//      from stored, no --refresh-primary spend.
// Matching signals: normalized source_url, normalized title (exact + token Jaccard), instrument_identifier.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();

const STOP = new Set("the a an of for and to in on at by with from version update updated new s amp eu us uk regulation rule act draft final".split(" "));
const normUrl = (u) => !u ? "" : String(u).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "").trim();
const normTitle = (t) => !t ? "" : String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const tokens = (t) => new Set(normTitle(t).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
const jaccard = (a, b) => { const A = tokens(a), B = tokens(b); if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };

const items = await readAll("intelligence_items",
  "id,title,source_url,item_type,provenance_status,instrument_identifier,is_archived,created_at",
  { match: (q) => q.eq("is_archived", false) });
const byStatus = {};
for (const it of items) byStatus[it.provenance_status || "null"] = (byStatus[it.provenance_status || "null"] || 0) + 1;
console.log("non-archived items by provenance_status:", JSON.stringify(byStatus));

const quar = items.filter((i) => i.provenance_status === "quarantined");
const live = items.filter((i) => i.provenance_status !== "quarantined"); // verified/pending/null = already in corpus
console.log(`quarantined (wave set): ${quar.length} | live/non-quarantined: ${live.length}\n`);

// strongest match of `it` within candidate pool (excluding self)
function bestMatch(it, pool) {
  let best = null;
  for (const c of pool) {
    if (c.id === it.id) continue;
    let how = null, score = 0;
    if (it.source_url && normUrl(c.source_url) === normUrl(it.source_url)) { how = "url"; score = 1; }
    else if (it.instrument_identifier && c.instrument_identifier && it.instrument_identifier === c.instrument_identifier) { how = "instrument"; score = 0.95; }
    else if (normTitle(c.title) && normTitle(c.title) === normTitle(it.title)) { how = "title="; score = 0.9; }
    else { const j = jaccard(it.title, c.title); if (j >= 0.6) { how = `title~${j.toFixed(2)}`; score = j; } }
    if (how && score > (best?.score || 0)) best = { id: c.id, title: c.title, status: c.provenance_status, how, score, created_at: c.created_at };
  }
  return best;
}

// ── A. The 50ccd5cc / GLEC question ──
console.log("════ A. 50ccd5cc / GLEC / Smart Freight Centre / ISO 14083 cluster ════");
const glec = items.filter((i) => /glec|smart freight|smartfreight|iso[ -]?14083/i.test(`${i.title} ${i.source_url}`));
for (const g of glec.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))))
  console.log(`  ${g.id.slice(0, 8)} [${g.provenance_status}] ${String(g.created_at).slice(0, 10)} ${g.item_type} — ${g.title.slice(0, 70)}`);
const c50 = glec.find((g) => g.id.startsWith("50ccd5cc"));
if (c50) {
  const dupOfLive = glec.filter((g) => g.id !== c50.id && g.provenance_status !== "quarantined" && (normUrl(g.source_url) === normUrl(c50.source_url) || jaccard(g.title, c50.title) >= 0.5));
  console.log(`  -> 50ccd5cc duplicate-of-already-live? ${dupOfLive.length ? "POSSIBLE: " + dupOfLive.map((d) => d.id.slice(0, 8) + "(" + d.provenance_status + "," + String(d.created_at).slice(0, 10) + ")").join(", ") : "none found (GLEC was unique in corpus)"}`);
}

// ── B. Whole quarantined set ──
const buckets = { dupOfLive: [], peerCluster: [], unique: [] };
const peerSeen = new Set();
for (const q of quar) {
  const mLive = bestMatch(q, live);
  if (mLive) { buckets.dupOfLive.push({ q, m: mLive }); continue; }
  const mPeer = bestMatch(q, quar);
  if (mPeer) { buckets.peerCluster.push({ q, m: mPeer }); continue; }
  buckets.unique.push({ q });
}
console.log(`\n════ B. Quarantined set breakdown (n=${quar.length}) ════`);
console.log(`  (a) DUP-OF-LIVE (already in corpus -> delete free): ${buckets.dupOfLive.length}`);
console.log(`  (b) PEER-CLUSTER (dup of another quarantined -> keep one): ${buckets.peerCluster.length}`);
console.log(`  (c) UNIQUE (real re-ground candidates): ${buckets.unique.length}`);
console.log(`\n  --- (a) DUP-OF-LIVE detail ---`);
for (const { q, m } of buckets.dupOfLive) console.log(`    ${q.id.slice(0, 8)} "${q.title.slice(0, 48)}" == ${m.id.slice(0, 8)} [${m.status}] "${(m.title || "").slice(0, 40)}" (${m.how})`);
console.log(`\n  --- (b) PEER-CLUSTER detail ---`);
for (const { q, m } of buckets.peerCluster) console.log(`    ${q.id.slice(0, 8)} "${q.title.slice(0, 48)}" ~ ${m.id.slice(0, 8)} "${(m.title || "").slice(0, 40)}" (${m.how})`);

// ── C. stored-pool presence for UNIQUE items ──
console.log(`\n════ C. UNIQUE items — stored content already in pool? (re-ground from stored, no fetch) ════`);
let withPool = 0;
for (const { q } of buckets.unique) {
  const { count } = await sb.from("agent_run_searches").select("*", { count: "exact", head: true }).eq("intelligence_item_id", q.id);
  if (count > 0) withPool++;
  console.log(`    ${q.id.slice(0, 8)} [${q.item_type}] pool=${count} — ${q.title.slice(0, 52)}`);
}
console.log(`\n  UNIQUE with stored pool (no fetch needed): ${withPool}/${buckets.unique.length}`);
console.log(`\n════ SUMMARY ════`);
console.log(`  wave=${quar.length} -> delete-free(dup-of-live)=${buckets.dupOfLive.length}, peer-dups=${buckets.peerCluster.length}, UNIQUE=${buckets.unique.length} (of which ${withPool} re-ground from STORED, ${buckets.unique.length - withPool} would need fetch)`);
process.exit(0);
