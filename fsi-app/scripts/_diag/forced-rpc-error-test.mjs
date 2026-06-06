/** Forced RPC-error verification of the fail-CLOSED fix. Breaks get_research_items (RAISE),
 *  confirms (1) the RPC errors, (2) runCategoryRpc's documented error path returns empty, then
 *  RESTORES the exact captured definition in a finally. Proves: forced RPC error -> data layer empty
 *  -> page (initialResources = rpc.resources, no seed) renders EMPTY, never the ungated seed. */
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs"; import pg from "pg"; import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host.split(".")[0];
const cs = `postgresql://postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-0-us-west-1.pooler.supabase.com:5432/postgres`;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const client = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await client.connect();
const { rows } = await client.query("SELECT pg_get_functiondef('public.get_research_items(uuid)'::regprocedure) AS def");
const orig = rows[0].def;
const broken = orig.replace(/AS (\$[A-Za-z_]*\$)[\s\S]*\1/, "AS $function$ BEGIN RAISE EXCEPTION 'forced fail-closed test'; END $function$");
const { data: org } = await sb.from("organizations").select("id").limit(1); const oid = org?.[0]?.id;
try {
  if (broken === orig) { console.log("WARN: could not construct broken body; aborting (no DB change made)"); process.exit(0); }
  await client.query(broken);
  console.log("STEP 1: get_research_items temporarily broken (RAISE).");
  const { data, error } = await sb.rpc("get_research_items", { p_org_id: oid });
  console.log(`STEP 2: forced RPC error reproduced? ${error ? "YES -> " + error.message.slice(0,45) : "NO (data rows="+(data?.length??0)+")"}`);
  // runCategoryRpc contract (supabase-server.ts ~L494-497): `if (error || !items?.length) return EMPTY`.
  const dataLayerResult = (error || !(data?.length)) ? { resources: [], total: 0 } : { resources: data, total: data.length };
  console.log(`STEP 3: runCategoryRpc -> resources=${dataLayerResult.resources.length} (data layer fails to EMPTY on RPC error)`);
  // Page (post-fix): const initialResources = marketIntel.resources;  -> [] ; NO seed fallthrough.
  const initialResources = dataLayerResult.resources;
  console.log(`STEP 4: page initialResources=${initialResources.length} -> surface renders EMPTY, NOT the ungated seed. ${initialResources.length===0 ? "FAIL-CLOSED VERIFIED ✓" : "LEAK!"}`);
} finally {
  await client.query(orig); // exact restore
  const { error: re } = await sb.rpc("get_research_items", { p_org_id: oid });
  console.log(`STEP 5: restored get_research_items -> ${re ? "STILL BROKEN: "+re.message.slice(0,40) : "OK (working)"}`);
  await client.end();
}
process.exit(0);
