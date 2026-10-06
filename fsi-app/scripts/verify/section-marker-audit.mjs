// data-audit: label=section-markers hard=true
// section-marker-audit.mjs (lane GATES-2, 2026-10-05). GOVERNING SKILL: remediation-discipline (CLAUDE.md rule 15:
// a guard is proven by attack, and a write-path refusal does not clean what was stored before it existed).
//
// COUNT MECHANISM. Reads every non-archived intelligence_items.full_brief (the stored section bodies, one
// markdown document per item) and counts the rows whose body carries an internal marker, using the ONE
// shared pattern list in src/lib/agent/section-markers.mjs (the same list canonical-pipeline.ts
// writeSynthesizedBrief refuses to persist and the Live smoke gate fails on). Reports the count, the count by
// marker class and by item_type, and the first affected ids. READ-ONLY: it never repairs anything. The repair
// belongs to the population stage and to lane P3's finding.
//
// HARD: a stored marker is a customer-visible defect, so the lane fails while any exist. Layer C of the data-audit
// lane reflects a red hard audit into a block row that halts generation until it is fixed or waived (see
// docs/data-audit-dispositions.md). In build mode no generation runs, so a red audit halts nothing live; lane P3 is
// counting the affected rows and the repair belongs to the population stage.
//
// Exit 0 = no stored body carries a marker. Exit 1 = at least one does. Exit 2 = cannot verify (no
// credentials, read error), diagnosable and never a false green.
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { isMainModule } from "../lib/is-main.mjs";
import { findInternalMarkers } from "../../src/lib/agent/section-markers.mjs";

const REPORT_IDS = 40;

/**
 * Count marker-carrying bodies. PURE.
 * @param {{id: string, item_type?: string|null, full_brief?: string|null}[]} rows
 * @returns {{scanned: number, affected: number, byMarker: Record<string, number>, byItemType: Record<string, number>,
 *   sample: {id: string, item_type: string, markers: string[]}[]}}
 */
export function countMarkerBodies(rows) {
  const byMarker = {};
  const byItemType = {};
  const sample = [];
  let affected = 0;
  for (const r of rows ?? []) {
    const hits = findInternalMarkers(r?.full_brief);
    if (hits.length === 0) continue;
    affected += 1;
    const type = r.item_type ?? "unknown";
    byItemType[type] = (byItemType[type] ?? 0) + 1;
    for (const h of hits) byMarker[h.id] = (byMarker[h.id] ?? 0) + 1;
    if (sample.length < REPORT_IDS) sample.push({ id: r.id, item_type: type, markers: hits.map((h) => h.id) });
  }
  return { scanned: (rows ?? []).length, affected, byMarker, byItemType, sample };
}

/**
 * @param {{log?: Function, errorLog?: Function, loadEnv?: Function, readAllFn?: Function, hasCreds?: () => boolean}} [deps]
 * @returns {Promise<number>}
 */
export async function runAudit(deps = {}) {
  const {
    log = (m) => console.log(m),
    errorLog = (m) => console.error(m),
    loadEnv = loadLocalEnvFile,
    readAllFn = null,
    hasCreds = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  } = deps;
  loadEnv();
  if (!hasCreds()) {
    errorLog("section-marker-audit: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set, self-skip (rule 15).");
    return 2;
  }
  let rows;
  try {
    const read = readAllFn ?? (await import("../lib/db.mjs")).readAll;
    rows = await read("intelligence_items", "id,item_type,full_brief", { match: (q) => q.eq("is_archived", false) });
  } catch (e) {
    errorLog(`section-marker-audit: read failed: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
  const r = countMarkerBodies(rows);
  log(`section-marker-audit: ${r.scanned} stored section bod${r.scanned === 1 ? "y" : "ies"} scanned, ${r.affected} carry an internal marker.`);
  for (const [k, n] of Object.entries(r.byMarker).sort((a, b) => b[1] - a[1])) log(`  marker ${k}: ${n}`);
  for (const [k, n] of Object.entries(r.byItemType).sort((a, b) => b[1] - a[1])) log(`  item_type ${k}: ${n}`);
  for (const s of r.sample) log(`  [MARKER] item ${s.id} (${s.item_type}): ${s.markers.join(", ")}`);
  if (r.affected === 0) {
    log("section-marker-audit: PASS");
    return 0;
  }
  errorLog(`section-marker-audit: FAIL, ${r.affected} stored body(ies) carry an internal marker. Report only: repair belongs to the population stage.`);
  return 1;
}

if (isMainModule(import.meta.url)) {
  runAudit().then((code) => process.exit(code));
}
