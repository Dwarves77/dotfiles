/** mistitle-verified-probe.mjs — READ-ONLY deep-dive on the 4 verified flags + the 2025/40 source. */
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const c = new pg.Client({ connectionString: CONN }); await c.connect();
try {
  const ids = ["b7736a1a","859faf76","f0833999","9c5d1d17"];
  console.log("=== 4 verified flags: title vs source vs body ===\n");
  for (const id8 of ids) {
    const { rows } = await c.query(`
      SELECT i.id,i.legacy_id,i.title,i.item_type,i.created_at,i.updated_at,i.regeneration_skill_version,
             i.source_id,i.source_url,s.name AS src_name,s.url AS src_url,
             length(i.full_brief) AS blen, left(i.full_brief,500) AS bhead
      FROM intelligence_items i LEFT JOIN sources s ON s.id=i.source_id
      WHERE substring(i.id::text,1,8)=$1`, [id8]);
    const r = rows[0];
    const { rows: secs } = await c.query(`SELECT section_key,left(content_md,140) AS h FROM intelligence_item_sections WHERE item_id=$1 ORDER BY section_order LIMIT 3`,[r.id]);
    console.log(`[${id8}] ${r.legacy_id}`);
    console.log(`  title: ${r.title}`);
    console.log(`  item_type=${r.item_type}  skill=${r.regeneration_skill_version}  created=${(r.created_at||"").toString().slice(0,10)}`);
    console.log(`  source_id=${r.source_id}`);
    console.log(`  source name: "${r.src_name}"`);
    console.log(`  source url:  ${r.src_url}`);
    console.log(`  item.source_url: ${r.source_url}`);
    console.log(`  brief(${r.blen}ch) head: ${(r.bhead||"").replace(/\s+/g," ")}`);
    console.log(`  sections: ${secs.map(x=>x.section_key).join(",")||"(none)"}`);
    if (secs[0]) console.log(`    s[${secs[0].section_key}]: ${(secs[0].h||"").replace(/\s+/g," ")}`);
    console.log("");
  }
  // The 2025/40 source(s): identity + how many active items link to them
  console.log("=== sources whose url ELI = 2025/40 ===\n");
  const { rows: src } = await c.query(`SELECT id,name,url,base_tier,status FROM sources WHERE url ILIKE '%2025/40%' OR url ILIKE '%2025R0040%' OR url ILIKE '%2025/0040%'`);
  for (const s of src) {
    const { rows: cnt } = await c.query(`SELECT count(*)::int n, count(*) FILTER (WHERE provenance_status='verified')::int v FROM intelligence_items WHERE source_id=$1 AND is_archived=false`,[s.id]);
    console.log(`  ${s.id} [T${s.base_tier} ${s.status}] "${s.name}"`);
    console.log(`     ${s.url}`);
    console.log(`     active items linked: ${cnt[0].n} (verified ${cnt[0].v})`);
  }
  console.log("\nREAD-ONLY.");
} finally { await c.end(); }
