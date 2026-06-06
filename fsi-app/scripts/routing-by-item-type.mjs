/** routing-by-item-type.mjs — guarded RPC re-route (authorized 2026-06-04).
 * Routes the customer surfaces by item_type -> format -> surface, replacing the
 * source-attribute axes (get_market_intel_items routed by source_role; get_research_items
 * + get_operations_items by sources.category). Fetches each live function def
 * (pg_get_functiondef) and swaps ONLY its routing predicate, so the long RETURNS
 * signatures + provenance gate + ordering are reproduced VERBATIM. Reversible:
 * the prior defs live in migrations 084 + 117 (re-apply to revert).
 *
 * dry-run default: prints the swapped defs to eyeball. --execute --confirm applies +
 * registers migration 125 + verifies per-surface counts. Supply stays paused.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __d = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(__d, "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const EXECUTE = process.argv.includes("--execute") && process.argv.includes("--confirm");
const c = new pg.Client({ connectionString: CONN }); await c.connect();
const q = (s, p) => c.query(s, p).then((r) => r);

// per-function predicate swap: [fn name, regex to match the OLD predicate, NEW predicate]
const SWAPS = [
  ["get_market_intel_items", /AND s\.source_role IN \([\s\S]*?\)/, "AND ii.item_type IN ('market_signal', 'initiative')"],
  ["get_operations_items", /s\.category = 'operational_data'/, "ii.item_type IN ('regional_data')"],
  ["get_research_items", /s\.category = 'research'[\s\S]*?ii\.status = 'proposed'\)/, "ii.item_type IN ('research_finding')"],
];

async function surfaceCounts(label) {
  // verified active items grouped by the item_type->surface they would route to
  const r = await q(`SELECT item_type, count(*)::int n FROM intelligence_items
                     WHERE is_archived=false AND provenance_status='verified' GROUP BY item_type`);
  const FMT = { regulation:"Regulations",directive:"Regulations",standard:"Regulations",guidance:"Regulations",framework:"Regulations",market_signal:"Market",initiative:"Market",research_finding:"Research",regional_data:"Operations",technology:"Technology",innovation:"Technology",tool:"Technology" };
  const surf = {}; for (const row of r.rows) { const s = FMT[row.item_type] || "(none)"; surf[s] = (surf[s] || 0) + row.n; }
  console.log(`${label} verified-by-surface: ${JSON.stringify(surf)}`);
}

try {
  console.log(`===== ROUTE BY ITEM_TYPE — ${EXECUTE ? "EXECUTE" : "DRY-RUN"} =====\n`);
  const newDefs = [];
  for (const [fn, re, repl] of SWAPS) {
    const def = (await q(`SELECT pg_get_functiondef(oid) d FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace`, [fn])).rows[0]?.d;
    if (!def) { console.error(`HALT: ${fn} not found`); process.exit(1); }
    if (!re.test(def)) { console.error(`HALT: predicate pattern not found in ${fn} — refusing to guess`); process.exit(1); }
    const swapped = def.replace(re, repl);
    newDefs.push([fn, swapped]);
    // show just the WHERE region of the swap for eyeballing
    const m = swapped.match(/WHERE[\s\S]*?(ORDER BY|;)/);
    console.log(`-- ${fn}: new predicate region --\n${(m ? m[0] : swapped).slice(0, 400)}\n`);
  }
  if (!EXECUTE) { console.log("dry-run — re-run with --execute --confirm to apply"); await c.end(); process.exit(0); }

  await surfaceCounts("BEFORE");
  await q("BEGIN");
  for (const [fn, def] of newDefs) { await q(def); console.log(`  ✓ replaced ${fn}`); }
  // register migration 125
  await q(`INSERT INTO supabase_migrations.schema_migrations (version, name)
           VALUES ('125', 'routing_by_item_type') ON CONFLICT (version) DO NOTHING`).catch(() => {});
  await q("COMMIT");
  await surfaceCounts("AFTER ");
  console.log("\nEXECUTE complete — surfaces now route by item_type. Provenance gate still applies (non-reg surfaces fill as generation runs).");
} finally { await c.end(); }
