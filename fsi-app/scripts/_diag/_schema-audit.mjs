// READ-ONLY SCHEMA AUDIT: enumerate the actual columns (+ a sample value's type) of every table this
// session reads or writes, so queries/writes name real cells instead of guessing. Service-role so RLS
// does not hide rows. Run before touching any table.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(ROOT + "/.env.local");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TABLES = [
  "intelligence_items",
  "section_claim_provenance",
  "intelligence_item_sections",
  "sources",
  "provisional_sources",
  "agent_run_searches",
  "integrity_flags",
];

const typ = (v) => v === null ? "null" : Array.isArray(v) ? "array" : typeof v;

for (const t of TABLES) {
  const { data, error, count } = await sb.from(t).select("*", { count: "exact" }).limit(1);
  if (error) { console.log(`\n### ${t}\n  ERROR: ${error.message}`); continue; }
  const row = data?.[0];
  console.log(`\n### ${t}   (rows=${count})`);
  if (!row) { console.log("  (no rows to introspect columns)"); continue; }
  const cols = Object.keys(row).sort();
  for (const c of cols) console.log(`  ${c.padEnd(34)} ${typ(row[c])}${row[c] !== null && typeof row[c] !== "object" ? `  e.g. ${JSON.stringify(String(row[c]).slice(0, 48))}` : ""}`);
}
process.exit(0);
