/** HOLDINGS AUDIT — read-only classification of every stored capture (operator dispatch 2026-07-14).
 *  $0: no LLM, no Browserless, no paid fetch. Reads the corpus + snapshot bodies from Storage, classifies
 *  each capture against KNOWN DEFECT CLASSES (holdings-audit.mjs pure core), and — with --write — persists
 *  ONE guarded batch to holdings_quality (the single metadata write the dispatch authorizes).
 *
 *  Per capture:
 *    - snapshot (raw_fetches row): byte-size (STUB) + furniture-ratio + publisher-shape structural check
 *      (body downloaded + gunzipped from the raw_fetches bucket; body-read failures recorded, never faked).
 *    - pool aggregate (agent_run_searches): usable-row count (STUB when 0).
 *  Per item: sufficiency (covers_grounding / corroborators_only / insufficient) against the item authority
 *  floor; stale_verified = a VERIFIED item whose backing capture carries a known defect (re-collection flag).
 *
 *  Default = DRY (compute + print the corrected inventory + truncation-cause + stale count; no write).
 *  --write performs the guardedInsertMany. Refuses to write if holdings_quality already has rows (idempotent).
 *  Usage: node scripts/holdings-audit.mjs [--write]
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { readAll, readClient, guardedInsertMany } from "./lib/db.mjs";
import { readSnapshotBody } from "../src/lib/sources/snapshot-store.mjs";
import { classifyCompleteness, classifySufficiency, detectPublisherShape } from "../src/lib/sources/holdings-audit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));

const WRITE = process.argv.includes("--write");
const AUDIT_VERSION = "hq-v1-2026-07-14";
const POOL_USABLE_MIN = 200; // >200ch excerpt = usable content (holdings-gate criterion)
const BODY_CONCURRENCY = 8;

/** Grounding tier per the moat resolver: tier_override is the single sanctioned escape over base_tier. */
function groundingTier(src) {
  if (!src) return null;
  if (src.tier_override != null) return Number(src.tier_override);
  return src.base_tier == null ? null : Number(src.base_tier);
}

async function mapWithConcurrency(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

async function main() {
  const rc = readClient();

  console.log("[holdings-audit] reading corpus (read-only)…");
  const [items, snapshots, sources, pool, prov] = await Promise.all([
    readAll("intelligence_items", "id, legacy_id, title, item_type, provenance_status, source_id, source_url, is_archived"),
    readAll("raw_fetches", "id, source_id, file_path, html_bytes, fetched_at, http_status"),
    readAll("sources", "id, url, base_tier, tier_override"),
    readAll("agent_run_searches", "intelligence_item_id, result_content_excerpt"),
    readAll("section_claim_provenance", "intelligence_item_id, claim_kind, extracted_at"),
  ]);

  const existing = await rc.from("holdings_quality").select("id", { count: "exact", head: true });
  const existingCount = existing.count ?? 0;

  const srcById = new Map(sources.map((s) => [s.id, s]));
  const itemsBySource = new Map();
  for (const it of items) if (it.source_id) {
    if (!itemsBySource.has(it.source_id)) itemsBySource.set(it.source_id, []);
    itemsBySource.get(it.source_id).push(it);
  }

  // Pool aggregate per item: count usable (>200ch) rows.
  const poolByItem = new Map();
  for (const r of pool) {
    const id = r.intelligence_item_id;
    if (!id) continue;
    const len = (r.result_content_excerpt || "").length;
    const cur = poolByItem.get(id) || { usable: 0, rows: 0 };
    cur.rows++;
    if (len > POOL_USABLE_MIN) cur.usable++;
    poolByItem.set(id, cur);
  }

  // Grounding recency per item: latest extracted_at, has-FACT.
  const groundByItem = new Map();
  for (const p of prov) {
    const id = p.intelligence_item_id;
    if (!id) continue;
    const cur = groundByItem.get(id) || { latest: null, hasFact: false };
    if (p.claim_kind === "FACT") cur.hasFact = true;
    const t = p.extracted_at || null;
    if (t && (!cur.latest || t > cur.latest)) cur.latest = t;
    groundByItem.set(id, cur);
  }

  const rows = [];
  const skipped = { snapshot_no_item: 0, body_read_fail: 0 };

  // ---- SNAPSHOT rows (one per raw_fetches with a linkable item) ----
  // A snapshot links to an item via item.source_id = raw_fetches.source_id. If multiple items share a
  // source, the snapshot is attributed to each (a shared portal snapshot backs each item on it); the
  // common case is 1:1 (651 sources / 660 snapshots / 642 items with source_id).
  const snapWork = [];
  for (const snap of snapshots) {
    const linkedItems = itemsBySource.get(snap.source_id) || [];
    if (!linkedItems.length) { skipped.snapshot_no_item++; continue; }
    snapWork.push({ snap, linkedItems });
  }

  console.log(`[holdings-audit] downloading ${snapWork.filter((w) => Number(w.snap.html_bytes) > 1000).length} snapshot bodies (>1KB) from Storage…`);
  const bodies = await mapWithConcurrency(snapWork, BODY_CONCURRENCY, async ({ snap }) => {
    if (Number(snap.html_bytes || 0) <= 1000) return { body: null, reason: "stub-skip" }; // stub: no body needed
    if (!snap.file_path) return { body: null, reason: "no-file-path" };
    try { return { body: await readSnapshotBody(rc, snap.file_path), reason: null }; }
    catch (e) { return { body: null, reason: `download-fail: ${String(e.message).slice(0, 80)}` }; }
  });

  for (let k = 0; k < snapWork.length; k++) {
    const { snap, linkedItems } = snapWork[k];
    const bodyRes = bodies[k];
    if (bodyRes.reason && bodyRes.reason.startsWith("download-fail")) skipped.body_read_fail++;
    const src = srcById.get(snap.source_id);
    const shape = detectPublisherShape(src?.url || linkedItems[0]?.source_url);
    const comp = classifyCompleteness({ bytes: Number(snap.html_bytes || 0), body: bodyRes.body, shape, capture_kind: "snapshot" });
    const tier = groundingTier(src);
    for (const it of linkedItems) {
      const suff = classifySufficiency({ itemType: it.item_type, sourceTier: tier, completeness: comp.completeness, snapshotBytes: Number(snap.html_bytes || 0) });
      const verified = it.provenance_status === "verified" && it.is_archived !== true;
      const ground = groundByItem.get(it.id);
      const groundedBeforeCapture = !!(verified && ground?.latest && snap.fetched_at && snap.fetched_at > ground.latest);
      const stale = verified && (comp.completeness !== "NO-KNOWN-DEFECT" || groundedBeforeCapture);
      rows.push({
        intelligence_item_id: it.id,
        source_id: snap.source_id,
        capture_kind: "snapshot",
        capture_ref: snap.id,
        bytes_collected: Number(snap.html_bytes || 0),
        clean_content_chars: comp.cleanChars,
        declared_size: null,
        completeness: comp.completeness,
        defect_evidence: { ...comp.evidence, checks_fired: comp.checksFired, publisher_shape: shape, grounding_tier: tier, body_read: bodyRes.reason || "ok", grounded_before_capture: groundedBeforeCapture },
        sufficiency: suff,
        publisher_shape: shape,
        stale_verified: stale,
        audit_version: AUDIT_VERSION,
      });
    }
  }
  // dedup snapshot rows by capture_ref (unique index) — attribute a shared snapshot to its item with the
  // strongest sufficiency, so one holdings_quality snapshot row exists per raw_fetches.id.
  const bestByRef = new Map();
  const rank = { covers_grounding: 3, corroborators_only: 2, insufficient: 1 };
  const snapRows = [];
  for (const r of rows) {
    const prev = bestByRef.get(r.capture_ref);
    if (!prev || (rank[r.sufficiency] || 0) > (rank[prev.sufficiency] || 0)) bestByRef.set(r.capture_ref, r);
  }
  snapRows.push(...bestByRef.values());

  // ---- POOL aggregate rows (one per item with any pool rows) ----
  const poolRows = [];
  for (const it of items) {
    const agg = poolByItem.get(it.id);
    if (!agg) continue;
    const comp = classifyCompleteness({ capture_kind: "pool", usablePoolRows: agg.usable });
    const tier = groundingTier(srcById.get(it.source_id));
    const suff = classifySufficiency({ itemType: it.item_type, sourceTier: tier, completeness: comp.completeness, usablePoolRows: agg.usable });
    const verified = it.provenance_status === "verified" && it.is_archived !== true;
    const stale = verified && comp.completeness !== "NO-KNOWN-DEFECT";
    poolRows.push({
      intelligence_item_id: it.id,
      source_id: it.source_id,
      capture_kind: "pool",
      capture_ref: null,
      bytes_collected: 0,
      clean_content_chars: null,
      declared_size: null,
      completeness: comp.completeness,
      defect_evidence: { usable_rows: agg.usable, total_rows: agg.rows, checks_fired: comp.checksFired, grounding_tier: tier },
      sufficiency: suff,
      publisher_shape: null,
      stale_verified: stale,
      audit_version: AUDIT_VERSION,
    });
  }

  const allRows = [...snapRows, ...poolRows];

  // ---- REPORT: corrected inventory ----
  const tally = (arr, key) => arr.reduce((m, r) => (m[r[key]] = (m[r[key]] || 0) + 1, m), {});
  const snapComp = tally(snapRows, "completeness");
  const snapSuff = tally(snapRows, "sufficiency");
  const poolComp = tally(poolRows, "completeness");
  const staleCount = allRows.filter((r) => r.stale_verified).length;
  const staleItems = new Set(allRows.filter((r) => r.stale_verified).map((r) => r.intelligence_item_id));

  // Truncation-cause: items whose backing snapshot is >40K (grounding synthesis cap is 40000 chars) — the
  // held content exceeds what a single grounding read saw. Distinct from a DEFECTIVE capture.
  const largeSnapItems = new Set(snapRows.filter((r) => r.bytes_collected > 40000).map((r) => r.intelligence_item_id));
  const truncatedCaptures = snapRows.filter((r) => r.completeness === "TRUNCATED");

  console.log("\n===== HOLDINGS AUDIT — corrected inventory =====");
  console.log(`items total: ${items.length} | verified(live): ${items.filter((i) => i.provenance_status === "verified" && i.is_archived !== true).length}`);
  console.log(`snapshots classified: ${snapRows.length} (skipped no-item: ${skipped.snapshot_no_item}; body-read fails: ${skipped.body_read_fail})`);
  console.log(`  completeness: ${JSON.stringify(snapComp)}`);
  console.log(`  sufficiency:  ${JSON.stringify(snapSuff)}`);
  console.log(`pool aggregates classified: ${poolRows.length}`);
  console.log(`  completeness: ${JSON.stringify(poolComp)}`);
  console.log(`\nstale_verified captures: ${staleCount} across ${staleItems.size} verified items`);
  console.log(`TRUNCATED captures (structural cutoff): ${truncatedCaptures.length}`);
  console.log(`grounding-cap exposure: ${largeSnapItems.size} items hold a >40KB snapshot (exceeds the 40K-char single grounding read)`);
  console.log(`\ntotal holdings_quality rows to write: ${allRows.length}`);

  // durable artifact (machine evidence -> scripts/tmp, gitignored regenerable)
  const outDir = resolve(ROOT, "scripts/tmp");
  mkdirSync(outDir, { recursive: true });
  const artifact = {
    audited_at: new Date().toISOString(), audit_version: AUDIT_VERSION,
    inventory: { items: items.length, snapshots_classified: snapRows.length, pool_aggregates: poolRows.length,
      snap_completeness: snapComp, snap_sufficiency: snapSuff, pool_completeness: poolComp,
      stale_verified_captures: staleCount, stale_verified_items: staleItems.size,
      truncated_captures: truncatedCaptures.length, grounding_cap_exposed_items: largeSnapItems.size,
      skipped },
    truncated_captures: truncatedCaptures.map((r) => ({ item: r.intelligence_item_id, ref: r.capture_ref, bytes: r.bytes_collected, evidence: r.defect_evidence.structural })),
    stale_verified_items: [...staleItems],
  };
  writeFileSync(resolve(outDir, "holdings-audit-report.json"), JSON.stringify(artifact, null, 2));
  console.log(`\n[holdings-audit] report -> scripts/tmp/holdings-audit-report.json`);

  if (!WRITE) { console.log("\n[DRY] no write. Re-run with --write to persist to holdings_quality."); return; }
  if (existingCount > 0) { console.log(`\n[REFUSE] holdings_quality already has ${existingCount} rows — not double-writing. Truncate first to re-audit.`); return; }

  console.log(`\n[holdings-audit] writing ${allRows.length} rows to holdings_quality (guarded)…`);
  const res = await guardedInsertMany("holdings_quality", allRows, {
    cite: { skill: "source-credibility-model", reason: "holdings audit 2026-07-14: per-capture completeness/sufficiency classification (the one authorized metadata write)" },
    select: "id",
  });
  console.log(`[holdings-audit] inserted ${res.inserted} rows. snapshot: ${res.snapshot}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
