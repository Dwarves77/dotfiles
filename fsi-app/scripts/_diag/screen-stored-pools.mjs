/** READ-ONLY stored-pool quality screen over the redo queue (skill-conformance-audit flagged items).
 *  Answers the Browserless-exposure question WITHOUT any Sonnet/Browserless call: classifies each item's
 *  SAVED agent_run_searches pool as stored-viable vs needs-fresh-fallback, so we can quote the fresh-scrape
 *  (Browserless) fraction BEFORE the batch instead of carrying "~0 Browserless" forward from a 2-of-3
 *  spot-check. Also surfaces good-pool NON-research candidates for the test-one multi-word-severity proof.
 *  Heuristic mirrors the pipeline: rows with result_content_excerpt > 200ch are "content"; failure-artifact
 *  markers approximate the brief_failure_gate that rejected the stored brief. ZERO writes. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const { readAll } = await import("../lib/db.mjs");

const FAIL_MARKERS = [/\b403\b/i, /\b404\b/i, /forbidden/i, /access denied/i, /captcha/i, /enable javascript/i, /just a moment/i, /are you a robot/i, /cloudflare/i, /page not found/i, /request blocked/i];

const flags = await readAll("integrity_flags", "subject_ref", { match: (q) => q.eq("created_by", "skill-conformance-audit").eq("status", "open") });
const flagged = new Set(flags.map((f) => f.subject_ref));
const items = await readAll("intelligence_items", "id,legacy_id,title,item_type", { match: (q) => q.eq("is_archived", false) });
const queue = items.filter((it) => flagged.has(it.id));
const pool = await readAll("agent_run_searches", "intelligence_item_id,result_content_excerpt");
const byItem = new Map();
for (const p of pool) {
  const arr = byItem.get(p.intelligence_item_id) || [];
  arr.push(p.result_content_excerpt || "");
  byItem.set(p.intelligence_item_id, arr);
}

function classify(id) {
  const rows = byItem.get(id) || [];
  const content = rows.filter((t) => t.length > 200);
  const totalCh = content.reduce((s, t) => s + t.length, 0);
  const maxCh = content.reduce((m, t) => Math.max(m, t.length), 0);
  const failHits = content.filter((t) => FAIL_MARKERS.some((re) => re.test(t.slice(0, 600)))).length;
  let cls;
  if (content.length === 0) cls = "no-pool";
  else if (failHits >= content.length || (failHits > 0 && totalCh < 3000)) cls = "suspect";
  else if (totalCh < 2000) cls = "thin";
  else if (totalCh >= 8000 && content.length >= 2) cls = "rich";
  else cls = "moderate";
  return { cls, contentRows: content.length, totalCh, maxCh, failHits };
}

const dist = {}; const perItem = [];
for (const it of queue) {
  const c = classify(it.id);
  dist[c.cls] = (dist[c.cls] || 0) + 1;
  perItem.push({ key: it.legacy_id || it.id.slice(0, 8), id: it.id, type: it.item_type, ...c });
}
const viable = (perItem.filter((p) => p.cls === "rich" || p.cls === "moderate")).length;
const needsFresh = perItem.filter((p) => ["thin", "suspect", "no-pool"].includes(p.cls)).length;

console.log(`\n===== STORED-POOL SCREEN over redo queue (${queue.length} flagged items) =====`);
console.log(`distribution:`); for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log(`\nstored-viable (rich+moderate): ${viable}`);
console.log(`needs fresh-fallback (thin+suspect+no-pool): ${needsFresh}  <= Browserless exposure (fetches ≈ this x ~5-7 urls/item)`);

// good-pool NON-research candidates for the test-one multi-word-severity proof
const goodNonResearch = perItem.filter((p) => p.cls === "rich" && p.type !== "research_finding").sort((a, b) => b.totalCh - a.totalCh).slice(0, 8);
console.log(`\ntop rich NON-research candidates (good stored pool) for test-one:`);
for (const p of goodNonResearch) console.log(`  ${p.key.padEnd(14)} ${p.type.padEnd(16)} rows=${p.contentRows} totalCh=${p.totalCh}`);
writeFileSync(resolve(ROOT, "scripts/_diag/_pool-screen.json"), JSON.stringify(perItem, null, 1));
console.log(`\nper-item -> scripts/_diag/_pool-screen.json`);
