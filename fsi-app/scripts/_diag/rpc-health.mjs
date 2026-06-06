import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: org } = await sb.from("organizations").select("id").limit(1);
const oid = org?.[0]?.id;
for (const fn of ["get_research_items","get_technology_items","get_operations_items","get_market_intel_items"]) {
  const { data, error } = await sb.rpc(fn, { p_org_id: oid });
  console.log(`${fn.padEnd(24)} ${error ? "BROKEN: "+error.message.slice(0,55) : "OK rows="+(data?.length??0)}`);
}
process.exit(0);
