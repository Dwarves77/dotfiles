import pg from "pg"; import { readFileSync, writeFileSync } from "node:fs"; import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
const __d=dirname(fileURLToPath(import.meta.url)); const R=resolve(__d,"..",".."); process.loadEnvFile(resolve(R,".env.local"));
const ref=readFileSync(resolve(R,"supabase/.temp/project-ref"),"utf8").trim(); const pl=readFileSync(resolve(R,"supabase/.temp/pooler-url"),"utf8").trim();
const c=new pg.Client({connectionString:pl.replace(`postgres.${ref}@`,`postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`)}); await c.connect();
const q=(s)=>c.query(s).then(r=>r.rows);
try{
  const trg=await q(`SELECT tgrelid::regclass::text tbl, tgname, p.proname fn, pg_get_triggerdef(t.oid) def FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE NOT tgisinternal ORDER BY 1,2`);
  console.log(`=== TRIGGERS (${trg.length}) ===`);
  for(const r of trg){ const m=r.def.match(/(BEFORE|AFTER|INSTEAD OF)\s+([A-Z ORUPDATEINSERTDELETE]+?)\s+ON/i); console.log(`  ${r.tbl} | ${r.tgname} | ${m?m[1]+' '+m[2].trim():'?'} -> ${r.fn}`); }
  const fns=await q(`SELECT proname, prorettype::regtype::text ret FROM pg_proc WHERE pronamespace='public'::regnamespace AND prokind='f' ORDER BY proname`);
  console.log(`\n=== FUNCTIONS/RPCs (${fns.length}) ===`);
  console.log(fns.map(r=>`${r.proname}->${r.ret}`).join("  |  "));
  writeFileSync(resolve(R,"docs/audits/_census-triggers-functions.txt"), `TRIGGERS (${trg.length})\n${trg.map(r=>`${r.tbl}|${r.tgname}|${r.fn}`).join("\n")}\n\nFUNCTIONS (${fns.length})\n${fns.map(r=>r.proname).join("\n")}`);
  console.log(`\n[wrote docs/audits/_census-triggers-functions.txt]`);
}finally{await c.end();}
