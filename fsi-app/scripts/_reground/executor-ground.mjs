#!/usr/bin/env node
// executor-ground.mjs — CC-GROUNDING-EXECUTOR (operator ruling 2026-07-16). $0, no metered spend.
//
// The FREE grounding path: the Claude Code executor (subscription) reads the item's STAGED enacted primary
// (already in agent_run_searches) and produces the claim ledger BY HAND, then submits it through the built
// groundBrief via the injectedLedger seam. groundBrief runs the ENTIRE system judgment unchanged — the verbatim
// kept-filter (drops any span not literally in the staged primary), the canonical resolver tier-stamp, the floor
// pool, slot-forcing, ALL mint gates (S-CONFLATE hard / S-NUMERIC soft / authority-floor / no-generic-source),
// the non-destructive applyLedgerDiff (old claims preserved in claim_versions), and validate_item_provenance.
// So the SYSTEM judges the extraction; the executor only supplies it. No acquire lock (no spend), no fetch
// (pool is staged), no Sonnet.
//
// Usage: node scripts/_reground/executor-ground.mjs <itemId> <ledger.json>
//   ledger.json = array of { section, claim_text, claim_kind, source_span, slot_key } — source_span MUST be a
//   verbatim substring of the staged primary (the system drops it otherwise; that is the integrity check).

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
