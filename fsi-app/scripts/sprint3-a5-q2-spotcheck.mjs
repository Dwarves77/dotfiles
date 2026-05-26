/**
 * sprint3-a5-q2-spotcheck.mjs — A5 Q2 read-only spot-check
 *
 * Purpose: sample 10 active regulations-domain intelligence_items and
 * dump their `reasoning` + `why_matters` columns so the auditor can
 * evaluate whether those columns carry the 2-paragraph editorial-rationale
 * quality that the regulations-detail.html mockup's "Why It Matters" UI
 * primitive requires (vs. single-sentence machine-generated text).
 *
 * SAFETY PROPERTIES:
 *   - READ-ONLY. No INSERT/UPDATE/DELETE.
 *   - No Claude/Haiku invocation.
 *   - Uses service role only to bypass RLS for the read.
 *
 * Run: node scripts/sprint3-a5-q2-spotcheck.mjs
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));

const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const sb = createClient(
  get("NEXT_PUBLIC_SUPABASE_URL"),
  get("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } }
);

const { data, error } = await sb
  .from("intelligence_items")
  .select("id, title, reasoning, why_matters, added_date, item_type, domain")
  .eq("is_archived", false)
  .eq("domain", 1)
  .not("reasoning", "is", null)
  .order("added_date", { ascending: false })
  .limit(10);

if (error) {
  console.error("QUERY ERROR:", error);
  process.exit(1);
}

console.log(`\n=== A5 Q2 SPOT-CHECK — ${data.length} rows ===\n`);

for (const [i, row] of data.entries()) {
  const reasoning = row.reasoning ?? "";
  const whyMatters = row.why_matters ?? "";
  console.log(`--- Row ${i + 1} ---`);
  console.log(`id: ${row.id}`);
  console.log(`title: ${row.title}`);
  console.log(`item_type: ${row.item_type}`);
  console.log(`domain: ${row.domain}`);
  console.log(`added_date: ${row.added_date}`);
  console.log(`reasoning.length: ${reasoning.length}`);
  console.log(`why_matters.length: ${whyMatters.length}`);
  console.log(`reasoning:`);
  console.log(reasoning);
  console.log(`why_matters:`);
  console.log(whyMatters);
  console.log("");
}

console.log("=== END ===");
