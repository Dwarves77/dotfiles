#!/usr/bin/env node

import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
// canonical-pipeline.ts uses "@/..." path aliases (tsconfig paths) — map "@" -> src for jiti resolution.
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });

const itemId = process.argv[2];
const ledgerPath = process.argv[3];
if (!itemId || !ledgerPath) { console.error("usage: executor-ground.mjs <itemId> <ledger.json>"); process.exit(1); }
const ledger = JSON.parse(readFileSync(resolve(process.cwd(), ledgerPath), "utf8"));
console.log(`executor-ground ${itemId}: injecting ${ledger.length} claims (FREE, no metered spend)`);

const { groundBrief } = await jiti.import("../../src/lib/agent/canonical-pipeline.ts");
const { readClient } = await jiti.import("../lib/db.mjs");

const r = await groundBrief(itemId, "cc-grounding-executor", { injectedLedger: ledger });
console.log("groundBrief result:", JSON.stringify(r));

const sb = readClient();
const { data: fin } = await sb.from("intelligence_items").select("provenance_status").eq("id", itemId).single();
const { data: v } = await sb.rpc("validate_item_provenance", { p_item_id: itemId });
const byC = {}; for (const f of (v?.failures || [])) byC[f.criterion] = (byC[f.criterion] || 0) + 1;
console.log(`\nprovenance_status: ${fin?.provenance_status} | valid: ${v?.valid} | failures by criterion: ${JSON.stringify(byC)}`);
if (v && !v.valid) for (const f of v.failures.slice(0, 6)) console.log(`  crit ${f.criterion} ${f.reason}: ${String(f.claim || "").slice(0, 70)}`);
process.exit(0);
