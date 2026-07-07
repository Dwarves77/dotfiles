// READ-ONLY ($0) DEFINITIVE entity-level dedup. Matches on REGULATION/ENTITY IDENTITY, not title strings
// (title-Jaccard missed 50ccd5cc==GLEC-v3). Signals: normalized source_url, EU/CELEX reg-numbers,
// instrument_identifier, and a curated set of ENTITY-DISTINCTIVE acronyms (CBAM/GLEC/AFIR/... — each names
// ONE specific instrument, unlike issuer codes EPA/IMO/CARB which only name a body). High-precision auto
// buckets + a medium-confidence REVIEW list to eyeball.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readAll } = await import("../lib/db.mjs");

// ENTITY-DISTINCTIVE acronyms/names: each identifies ONE specific instrument → a shared one = same entity.
const ENTITY = ["CBAM", "GLEC", "CORSIA", "AFIR", "REFUELEU", "REFUEL EU", "EUDR", "CSRD", "EEXI", "MEES",
  "ISSB", "IFRS S2", "NZIA", "JOLT", "FUELEU", "FUEL EU", "TOP RUNNER", "ROADCHECK", "FIT FOR 55",
  "ADVANCED CLEAN TRUCKS", "ADVANCED CLEAN FLEETS", "CLEAN FUEL", "GHG PROTOCOL", "ISO 14083", "ISO14083",
  "LOCAL LAW 97", "LL97", "SECR", "CORSIA", "NET-ZERO INDUSTRY ACT", "NET ZERO INDUSTRY ACT",
  "COUNTEMISSIONS", "GREEN PLAN 2030", "CII", "MARPOL", "SB 253", "SB 261", "AB 1305", "AB 1305"];
const norm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const normUrl = (u) => !u ? "" : String(u).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
const STOP = new Set("the a an of for and to in on at by with from version update updated new releases release plan program programme requirements standard standards regulation rule act directive".split(" "));
const toks = (t) => new Set(norm(t).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
const jac = (a, b) => { const A = toks(a), B = toks(b); if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };
const regNums = (s) => new Set((String(s || "").match(/\b(?:19|20)\d{2}\/\d{1,4}\b/g) || []).concat(String(s || "").match(/CELEX[:\s]*\w+/gi) || []));
const entitiesIn = (t) => { const U = ` ${norm(t).toUpperCase().replace(/[^A-Z0-9 ]/g, " ")} `; return new Set(ENTITY.filter((e) => U.includes(` ${e} `))); };

function sig(it) {
  return {
    url: normUrl(it.source_url),
    regs: regNums(`${it.title} ${it.instrument_identifier || ""} ${it.source_url || ""}`),
    instr: (it.instrument_identifier || "").trim(),
    ents: entitiesIn(it.title),
    juris: String(Array.isArray(it.jurisdiction_iso) ? it.jurisdiction_iso.join(",") : (it.jurisdiction_iso || "")).toLowerCase(),
    title: it.title,
  };
}
const inter = (a, b) => { for (const x of a) if (b.has(x)) return true; return false; };

// returns {how, score} or null — high precision for auto-dup
function match(qs, cs, qj, cj) {
  if (qs.url && qs.url === cs.url) return { how: "URL", score: 1 };
  if (qs.instr && cs.instr && qs.instr === cs.instr) return { how: "INSTR", score: 0.98 };
  if (inter(qs.regs, cs.regs)) return { how: "REG#", score: 0.95 };
  if (inter(qs.ents, cs.ents)) { const j = jac(qs.title, cs.title); if (qj === cj || j >= 0.3) return { how: `ENTITY+j${j.toFixed(2)}`, score: 0.9 }; return { how: `ENTITY?(juris ${qj}!=${cj})`, score: 0.5 }; }
  const j = jac(qs.title, cs.title); if (j >= 0.6) return { how: `j${j.toFixed(2)}`, score: j };
  if (j >= 0.4) return { how: `j${j.toFixed(2)}?`, score: j };
  return null;
}

const items = await readAll("intelligence_items", "id,title,source_url,item_type,provenance_status,instrument_identifier,jurisdiction_iso,is_archived", { match: (q) => q.eq("is_archived", false) });
const quar = items.filter((i) => i.provenance_status === "quarantined");
const live = items.filter((i) => i.provenance_status !== "quarantined");
const S = new Map(items.map((i) => [i.id, sig(i)]));

const dupLive = [], peer = [], review = [], unique = [];
const claimedPeer = new Set();
for (const q of quar) {
  const qs = S.get(q.id);
  // best live match
  let bL = null;
  for (const c of live) { const m = match(qs, S.get(c.id), qs.juris, S.get(c.id).juris); if (m && m.score > (bL?.m.score || 0)) bL = { c, m }; }
  if (bL && bL.m.score >= 0.9) { dupLive.push({ q, ...bL }); continue; }
  // best peer match
  let bP = null;
  for (const c of quar) { if (c.id === q.id) continue; const m = match(qs, S.get(c.id), qs.juris, S.get(c.id).juris); if (m && m.score > (bP?.m.score || 0)) bP = { c, m }; }
  if (bP && bP.m.score >= 0.9) { peer.push({ q, ...bP }); continue; }
  const weak = bL && bL.m.score >= 0.4 ? bL : (bP && bP.m.score >= 0.4 ? bP : null);
  if (weak) review.push({ q, ...weak }); else unique.push({ q });
}

console.log(`quar=${quar.length} live=${live.length}\n`);
console.log(`(a) DUP-OF-LIVE  (delete free, info already live): ${dupLive.length}`);
for (const { q, c, m } of dupLive) console.log(`    ${q.id.slice(0, 8)} "${q.title.slice(0, 46)}"  ==[${m.how}]  ${c.id.slice(0, 8)} [${c.provenance_status}] "${(c.title || "").slice(0, 42)}"`);
console.log(`\n(b) PEER-DUP  (keep one of the quarantined cluster): ${peer.length}`);
for (const { q, c, m } of peer) console.log(`    ${q.id.slice(0, 8)} "${q.title.slice(0, 46)}"  ~[${m.how}]  ${c.id.slice(0, 8)} "${(c.title || "").slice(0, 42)}"`);
console.log(`\n(REVIEW) medium-confidence — eyeball: ${review.length}`);
for (const { q, c, m } of review) console.log(`    ${q.id.slice(0, 8)} "${q.title.slice(0, 46)}"  ?[${m.how}]  ${c.id.slice(0, 8)} [${c.provenance_status}] "${(c.title || "").slice(0, 42)}"`);
console.log(`\n(c) UNIQUE  (no corpus match — only re-ground candidates): ${unique.length}`);
for (const { q } of unique) console.log(`    ${q.id.slice(0, 8)} [${q.item_type}] "${q.title.slice(0, 60)}"`);
console.log(`\n=== ${quar.length} = ${dupLive.length} dup-of-live + ${peer.length} peer-dup + ${review.length} review + ${unique.length} unique ===`);
process.exit(0);
