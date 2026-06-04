/** READ-ONLY. Splits the duplicate problem into the SAFE auto-merge set (rows sharing the
 * SAME canonical URL = unambiguously the same resource) vs the ENTITY set (same normalized
 * name but DIFFERENT canonical URLs = defect (b), could be real dupes OR distinct documents —
 * needs institution-identity judgment, NOT a blind name-merge). Proposes a winner per safe
 * cluster from classification + item usage. */
import pg from "pg";import{readFileSync}from"node:fs";import{resolve,dirname}from"node:path";import{fileURLToPath}from"node:url";
import { canonicalizeUrl } from "../../src/lib/sources/url-canonicalize.ts";
const __d=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(__d,"..","..");process.loadEnvFile(resolve(ROOT,".env.local"));
const ref=readFileSync(resolve(ROOT,"supabase/.temp/project-ref"),"utf8").trim();const pooler=readFileSync(resolve(ROOT,"supabase/.temp/pooler-url"),"utf8").trim();
const CONN=pooler.replace(`postgres.${ref}@`,`postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const c=new pg.Client({connectionString:CONN});await c.connect();const q=(s,p)=>c.query(s,p).then(r=>r.rows);
const norm=(s)=>(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const confRank={HIGH:3,MEDIUM:2,LOW:1,null:0};
try{
  const rows=await q(`SELECT s.id, s.name, s.url, s.category, s.source_role, s.base_tier, s.classification_confidence conf,
     (SELECT count(*)::int FROM intelligence_items i WHERE i.source_id=s.id) items
     FROM sources s WHERE s.status='active'`);
  for(const r of rows) r.canon=canonicalizeUrl(r.url);

  // SAFE: same canonical URL
  const byCanon=new Map(); for(const r of rows){(byCanon.get(r.canon)||byCanon.set(r.canon,[]).get(r.canon)).push(r);}
  const safe=[...byCanon.values()].filter(v=>v.length>1);
  // winner pick: HIGH conf > non-null role > most items > lowest base_tier > lowest id
  const pickWinner=(v)=>[...v].sort((a,b)=>
    (confRank[b.conf]||0)-(confRank[a.conf]||0) ||
    ((b.source_role?1:0)-(a.source_role?1:0)) ||
    (b.items-a.items) || (a.base_tier-b.base_tier) || (a.id<b.id?-1:1))[0];

  console.log(`===== SAFE AUTO-MERGE: same canonical URL (${safe.length} clusters, ${safe.reduce((a,v)=>a+v.length-1,0)} losers) =====`);
  let safeItems=0;
  for(const v of safe){
    const w=pickWinner(v);
    console.log(`\n  canon: ${w.canon}`);
    for(const r of v){const tag=r.id===w.id?"WINNER":"loser ";console.log(`    ${tag} ${r.id.slice(0,8)} [${r.category}/${r.source_role||'NULL'} t${r.base_tier} conf=${r.conf}] items=${r.items} "${String(r.name).slice(0,34)}"`);}
    safeItems+=v.filter(r=>r.id!==w.id).reduce((a,r)=>a+r.items,0);
  }
  console.log(`\n  -> items to repoint off losers: ${safeItems}`);

  // ENTITY (defect b): same normalized name, but >1 DISTINCT canonical URL
  const byName=new Map(); for(const r of rows){const k=norm(r.name);(byName.get(k)||byName.set(k,[]).get(k)).push(r);}
  const entity=[...byName.entries()].filter(([,v])=>v.length>1 && new Set(v.map(r=>r.canon)).size>1);
  console.log(`\n===== ENTITY DUPES (defect b — same name, DIFFERENT URLs; NOT auto-merged): ${entity.length} clusters =====`);
  for(const [k,v] of entity.slice(0,10)) console.log(`  x${v.length} urls=${new Set(v.map(r=>r.canon)).size}  ${k.slice(0,40)}`);
  console.log(`  ... these need the institution-identity decision (portal-vs-document): is e.g. "eur-lex x16" ONE portal-source or 16 distinct document pages?`);
  await c.end();
}catch(e){console.error(e);await c.end();process.exit(1);}
