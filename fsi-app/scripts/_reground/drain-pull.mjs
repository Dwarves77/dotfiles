#!/usr/bin/env node
// drain-pull.mjs — READ-ONLY. Dump everything the executor needs to build a claim ledger for ONE item:
// its metadata + identifier fields, its required slots (with descriptions), and the FULL staged primary
// capture(s) from agent_run_searches. No writes, no spend, no fetch. Usage: node drain-pull.mjs <key>
// where <key> is a legacy_id or an id prefix. Writes the full capture to scripts/tmp/cap-<key>.txt.
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
delete process.env.BROWSERLESS_API_KEY;
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { readClient, readAll } = await jiti.import("../lib/db.mjs");
const { verifyPoolTargetMatch } = await jiti.import("../../src/lib/sources/target-match.mjs");
const sb = readClient();

const key = process.argv[2];
if (!key) { console.error("usage: drain-pull.mjs <legacy_id|id-prefix>"); process.exit(1); }

const items = await readAll("intelligence_items",
  "id,legacy_id,title,item_type,instrument_type,instrument_identifier,canonical_instrument_key,jurisdiction_iso,source_id,source_url,provenance_status,is_archived",
  { match: (q) => q.eq("is_archived", false) });
const it = items.find((x) => x.legacy_id === key || x.id === key || x.id.startsWith(key));
if (!it) { console.error(`no item matching "${key}"`); process.exit(2); }

console.log(`\n===== ITEM ${it.legacy_id || it.id.slice(0, 8)} =====`);
console.log(`id:                 ${it.id}`);
console.log(`title:              ${it.title}`);
console.log(`item_type:          ${it.item_type}   instrument_type: ${it.instrument_type ?? "(null)"}`);
console.log(`instrument_ident:   ${it.instrument_identifier ?? "(null)"}`);
console.log(`canonical_key:      ${it.canonical_instrument_key ?? "(null)"}`);
console.log(`jurisdiction:       ${JSON.stringify(it.jurisdiction_iso)}`);
console.log(`source_url:         ${it.source_url}`);
console.log(`provenance_status:  ${it.provenance_status}`);

const { data: slots } = await sb.from("item_type_required_slots").select("slot_key, description").eq("item_type", it.item_type);
console.log(`\n----- REQUIRED SLOTS (${(slots || []).length}) -----`);
for (const s of slots || []) console.log(`  [${s.slot_key}] ${s.description}`);

const { data: pool } = await sb.from("agent_run_searches")
  .select("id, result_url, result_title, result_content_excerpt, result_index")
  .eq("intelligence_item_id", it.id).order("result_index");
console.log(`\n----- STAGED POOL (${(pool || []).length} rows) -----`);
const blocks = [];
for (const r of pool || []) {
  const len = (r.result_content_excerpt || "").length;
  console.log(`  [${r.result_index}] ${len} ch  ${r.result_url}`);
  if (len > 200) blocks.push({ url: r.result_url, text: r.result_content_excerpt });
}

const tm = verifyPoolTargetMatch(
  { title: it.title, item_type: it.item_type, instrument_type: it.instrument_type, identifier: it.instrument_identifier, canonical_instrument_key: it.canonical_instrument_key, jurisdiction: it.jurisdiction_iso },
  blocks,
);
console.log(`\n----- TARGET-MATCH: ${tm.verdict.toUpperCase()} (via ${tm.best?.via}, score ${tm.best?.score}) -----`);
if (tm.best?.conflicting?.length) console.log(`  conflicting ids in capture: ${tm.best.conflicting.join(", ")}`);
if (tm.best?.expected?.length) console.log(`  item expected ids: ${tm.best.expected.join(", ")}`);

mkdirSync(resolve(ROOT, "scripts/tmp"), { recursive: true });
const capPath = resolve(ROOT, `scripts/tmp/cap-${it.legacy_id || it.id.slice(0, 8)}.txt`);
writeFileSync(capPath, blocks.map((b, i) => `\n===== BLOCK ${i} — ${b.url} =====\n${b.text}`).join("\n"), "utf8");
console.log(`\nfull capture written: ${capPath} (${blocks.reduce((a, b) => a + b.text.length, 0)} ch across ${blocks.length} blocks)`);
process.exit(0);
