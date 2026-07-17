#!/usr/bin/env node
// ground-staged.mjs — feed the STAGED content to the BUILT groundBrief (the existing system does the
// extraction + judgment). Acquire switch armed RUN-SCOPED (off at rest after), emergencyPaused polled,
// spend on the $100 standing bound via the ticket-gated client. groundBrief uses the item's staged pool
// (no fetch, no Browserless) and extracts via the metered model — this is the "needed" grounding spend.
// Usage: node scripts/_reground/ground-staged.mjs [--bound=USD] [--limit=N] [--only=key,key]
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const BOUND = (() => { const a = process.argv.find((x) => x.startsWith("--bound=")); return a ? Number(a.slice(8)) : 20; })();
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--only=")); return a ? a.slice(7).split(",").filter(Boolean) : null; })();

// ARM the acquire path run-scoped (off at rest — never persisted).
process.env.GROUNDING_ACQUIRE_ENABLED = "1";
delete process.env.BROWSERLESS_API_KEY; // no paid fetch — content is staged; groundBrief uses the pool

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { groundBrief } = await jiti.import("../../src/lib/agent/canonical-pipeline.ts");
const { readClient, readAll } = await jiti.import("../lib/db.mjs");
const { spentUsd } = await jiti.import("../../src/lib/llm/spend-client.ts");
const sb = readClient();

// emergencyPaused HARD poll
const { data: ss } = await sb.from("system_state").select("global_processing_paused").limit(1).maybeSingle();
if (ss?.global_processing_paused) { console.error("HALT: global_processing_paused is set — emergency stop."); process.exit(3); }

// staged targets = non-verified live items that HOLD a snapshot on their source (acquired primaries)
let items = await readAll("intelligence_items", "id,legacy_id,title,item_type,provenance_status,source_id",
  { match: (q) => q.eq("is_archived", false).neq("provenance_status", "verified") });
if (ONLY) items = items.filter((it) => ONLY.includes(it.legacy_id) || ONLY.some((k) => it.id.startsWith(k)));
const { getSnapshot } = await jiti.import("../../src/lib/sources/snapshot-store.mjs");
const staged = [];
for (const it of items) { try { const s = await getSnapshot(sb, { sourceId: it.source_id }); if (s.found) staged.push(it); } catch { /* no snap */ } }
const targets = staged.slice(0, LIMIT === Infinity ? staged.length : LIMIT);

console.log(`\n===== GROUND STAGED (built groundBrief, acquire armed run-scoped) =====`);
console.log(`staged items with a captured primary: ${staged.length} | grounding ${targets.length} | bound $${BOUND}\n`);

let drained = 0, held = 0, failed = 0;
for (const it of targets) {
  const key = it.legacy_id || it.id.slice(0, 8);
  if (spentUsd() >= BOUND) { console.log(`\nHALT: spend $${spentUsd().toFixed(2)} reached bound $${BOUND}. Remaining parked.`); break; }
  let r;
  try { r = await groundBrief(it.id, "corpus-integrity-drain"); }
  catch (e) { failed++; console.log(`  ${key.padEnd(24)} ERROR: ${String(e?.message || e).slice(0, 80)}`); continue; }
  const { data: fin } = await sb.from("intelligence_items").select("provenance_status").eq("id", it.id).single();
  const prov = fin?.provenance_status;
  if (prov === "verified") { drained++; console.log(`  ${key.padEnd(24)} VERIFIED  (ground ok=${r?.ok})  [spend $${spentUsd().toFixed(2)}]`); }
  else { held++; console.log(`  ${key.padEnd(24)} ${prov}  (ok=${r?.ok}: ${String(r?.detail || "").slice(0, 60)})  [spend $${spentUsd().toFixed(2)}]`); }
}

// disarm at rest (belt-and-suspenders; env is process-scoped anyway)
delete process.env.GROUNDING_ACQUIRE_ENABLED;
console.log(`\n===== SUMMARY =====`);
console.log(`  VERIFIED (drained): ${drained} | still-held: ${held} | errors: ${failed} | total spend: $${spentUsd().toFixed(2)}`);
process.exit(0);
