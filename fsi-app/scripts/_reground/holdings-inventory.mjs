/** HOLDINGS INVENTORY — economy-of-information doctrine (operator ruling 2026-07-13).
 *  READ-ONLY, $0, NO NETWORK FETCH. Answers "what do we already hold?" for every non-verified live item,
 *  BEFORE any acquisition is even considered. data-existence-before-acquisition: a fetch is only ever the
 *  named DELTA (the specific missing span/document), never a re-fetch of what a pool/snapshot already carries.
 *
 *  Per item, the union of STORED content is: the latest raw_fetches snapshot body (Storage read, $0) ∪ the
 *  item's agent_run_searches pool excerpts. Each FACT span is tested for verbatim presence in that union via
 *  the pure cheapVerifyClaims (no model, no fetch). Classification:
 *    HAVE-ALL     — every FACT span present in stored content → free re-ground candidate (no lock, no spend).
 *    HAVE-PARTIAL — some FACT spans present, some absent → the DELTA is the named absent span(s) + their source.
 *    HAVE-NONE    — no FACT span present and no usable stored content → name the single document (source_url)
 *                   + best-known size (a prior agent_runs.fetch_html_bytes, a stored read).
 *    NO-FACTS     — the item has no FACT claim at all (never span-grounded): reported separately (re-synth class,
 *                   not an acquisition question — cheap-verify cannot speak to it).
 *
 *  Output: a per-item manifest to stdout + a JSON manifest to scripts/tmp/holdings-manifest.json (regenerable
 *  scratch). No writes to the DB, no fetch. readClient() blocks writes (rule-015); only .select + storage.download.
 *  Usage: node scripts/_reground/holdings-inventory.mjs [--limit=N]
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { readClient, readAll } from "../lib/db.mjs";
import { cheapVerifyClaims } from "../../src/lib/sources/cheap-verify.mjs";
import { getSnapshot } from "../../src/lib/sources/snapshot-store.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();
const sb = readClient();

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; } };

// POPULATION: every non-verified live item (the operator's scope — "every remaining non-verified live item").
const items = await readAll(
  "intelligence_items",
  "id,legacy_id,title,item_type,provenance_status,source_id,source_url",
  { match: (q) => q.eq("is_archived", false).neq("provenance_status", "verified") },
);
const targets = items.slice(0, LIMIT === Infinity ? items.length : LIMIT);

console.log(`\n===== HOLDINGS INVENTORY (read-only, $0, no fetch) =====`);
console.log(`non-verified live items: ${items.length}${LIMIT < Infinity ? ` (limit ${LIMIT})` : ""}`);

const manifest = [];
const buckets = { "HAVE-ALL": 0, "HAVE-PARTIAL": 0, "HAVE-NONE": 0, "NO-FACTS": 0 };

for (const it of targets) {
  const key = it.legacy_id || it.id.slice(0, 8);

  // FACT claims (the grounding NEED).
  const { data: claims } = await sb
    .from("section_claim_provenance")
    .select("claim_text,claim_kind,source_span,source_tier_at_grounding,search_result_id")
    .eq("intelligence_item_id", it.id);
  const facts = (claims ?? []).filter((c) => String(c.claim_kind ?? "").toLowerCase() === "fact");

  // Pool excerpts (agent_run_searches) — partial stored content.
  const { data: pool } = await sb
    .from("agent_run_searches")
    .select("result_url,result_content_excerpt")
    .eq("intelligence_item_id", it.id);
  const poolText = (pool ?? []).map((p) => p.result_content_excerpt || "").join("\n");
  const poolHosts = [...new Set((pool ?? []).map((p) => hostOf(p.result_url)).filter(Boolean))];

  // Snapshot body (raw_fetches / Storage) — the richest stored content. $0 stored read, no network.
  let snapText = "", snapBytes = 0, snapPresent = false;
  if (it.source_id) {
    try {
      const snap = await getSnapshot(sb, { sourceId: it.source_id });
      if (snap.found) { snapText = snap.content; snapBytes = snap.content.length; snapPresent = true; }
    } catch { /* no snapshot / download issue → treated as not held */ }
  }

  // Best-known document size from a PRIOR fetch (stored read, no network) — for the acquisition estimate.
  const { data: priorFetch } = await sb
    .from("agent_runs")
    .select("fetch_html_bytes,fetch_text_bytes,started_at")
    .eq("intelligence_item_id", it.id)
    .not("fetch_html_bytes", "is", null)
    .order("started_at", { ascending: false })
    .limit(1);
  const priorBytes = priorFetch?.[0]?.fetch_html_bytes ?? priorFetch?.[0]?.fetch_text_bytes ?? null;

  const union = `${snapText}\n${poolText}`;
  const holdBytes = union.trim().length;
  const cv = cheapVerifyClaims(facts, union);

  let bucket;
  if (facts.length === 0) bucket = "NO-FACTS";
  else if (cv.allFactsMatched) bucket = "HAVE-ALL";
  else if (cv.factMatched > 0 || holdBytes > 0) bucket = "HAVE-PARTIAL";
  else bucket = "HAVE-NONE";
  buckets[bucket] += 1;

  // The DELTA: the FACT spans NOT present in stored content (what an acquisition would actually need to add).
  const missingSpans = (cv.unmatched ?? [])
    .filter((u) => String(u.claim_kind ?? "").toLowerCase() === "fact")
    .map((u) => (u.source_span || "").slice(0, 160));

  const rec = {
    key,
    id: it.id,
    item_type: it.item_type,
    provenance_status: it.provenance_status,
    source_url: it.source_url,
    bucket,
    factTotal: cv.factTotal,
    factMatched: cv.factMatched,
    snapshot: snapPresent ? { bytes: snapBytes } : null,
    poolRows: (pool ?? []).length,
    poolHosts,
    priorFetchBytes: priorBytes,
    // acquisition guidance (only meaningful for PARTIAL/NONE):
    deltaDocument: bucket === "HAVE-ALL" || bucket === "NO-FACTS" ? null : it.source_url,
    deltaEstBytes: bucket === "HAVE-ALL" || bucket === "NO-FACTS" ? null : priorBytes,
    missingFactSpans: bucket === "HAVE-PARTIAL" || bucket === "HAVE-NONE" ? missingSpans.slice(0, 5) : [],
  };
  manifest.push(rec);

  const sizeStr = snapPresent ? `snap ${(snapBytes / 1024).toFixed(0)}KB` : "no-snap";
  const poolStr = `${(pool ?? []).length} pool`;
  console.log(
    `  ${bucket.padEnd(12)} ${key.padEnd(14)} ${String(it.item_type).padEnd(15)} ` +
    `FACT ${cv.factMatched}/${cv.factTotal}  [${sizeStr}, ${poolStr}]  ${(it.title || "").slice(0, 40)}`,
  );
}

console.log(`\n===== SUMMARY =====`);
for (const [b, n] of Object.entries(buckets)) console.log(`  ${b.padEnd(12)} ${n}`);
console.log(`  TOTAL        ${targets.length}`);

// Write the regenerable manifest for the free pass + the operator's acquisition list.
const outDir = resolve(ROOT, "scripts/tmp");
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, "holdings-manifest.json");
writeFileSync(outPath, JSON.stringify({ generatedFrom: "holdings-inventory.mjs", population: items.length, buckets, manifest }, null, 2));
console.log(`\nmanifest → ${outPath}`);
console.log(`(read-only — no DB writes, no network fetch)`);
process.exit(0);
