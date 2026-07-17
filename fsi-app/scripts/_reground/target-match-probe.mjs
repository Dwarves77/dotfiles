#!/usr/bin/env node
// target-match-probe.mjs — READ-ONLY. Run verifyTargetMatch over every non-verified item that holds a staged
// snapshot, print the verdict. Validates the gate on REAL captures (prove-on-real-data before wiring) and
// gives the current drain worklist with target-match verdicts. No writes, no spend, no fetch.
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
delete process.env.BROWSERLESS_API_KEY;
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { readClient, readAll } = await jiti.import("../lib/db.mjs");
const { getSnapshot } = await jiti.import("../../src/lib/sources/snapshot-store.mjs");
const { verifyTargetMatch } = await jiti.import("../../src/lib/sources/target-match.mjs");
const sb = readClient();

const items = await readAll("intelligence_items",
  "id,legacy_id,title,item_type,instrument_type,instrument_identifier,canonical_instrument_key,jurisdiction_iso,source_id,provenance_status",
  { match: (q) => q.eq("is_archived", false).neq("provenance_status", "verified") });

let match = 0, mismatch = 0, unverified = 0, nosnap = 0;
const rows = [];
for (const it of items) {
  let snap;
  try { snap = await getSnapshot(sb, { sourceId: it.source_id }); } catch { snap = { found: false }; }
  if (!snap?.found || !snap?.content) { nosnap++; continue; }
  const v = verifyTargetMatch({
    title: it.title, item_type: it.item_type, instrument_type: it.instrument_type,
    identifier: it.instrument_identifier, canonical_instrument_key: it.canonical_instrument_key,
    jurisdiction: it.jurisdiction_iso,
  }, snap.content);
  if (v.verdict === "match") match++; else if (v.verdict === "mismatch") mismatch++; else unverified++;
  rows.push({ key: it.legacy_id || it.id.slice(0, 8), verdict: v.verdict, via: v.via, score: v.score,
    conflicting: v.conflicting.slice(0, 3).join(",") });
}

rows.sort((a, b) => (a.verdict > b.verdict ? 1 : a.verdict < b.verdict ? -1 : 0));
console.log(`\n===== TARGET-MATCH PROBE (read-only) — ${rows.length} staged captures =====`);
for (const r of rows) {
  console.log(`  ${String(r.key).padEnd(26)} ${r.verdict.toUpperCase().padEnd(11)} via=${String(r.via).padEnd(24)} score=${r.score}${r.conflicting ? `  conflicting=${r.conflicting}` : ""}`);
}
console.log(`\n  MATCH=${match}  MISMATCH=${mismatch}  UNVERIFIED=${unverified}  (no-snapshot items skipped: ${nosnap})`);
process.exit(0);
