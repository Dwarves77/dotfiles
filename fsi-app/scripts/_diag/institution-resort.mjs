/** READ-ONLY. Re-sorts multi-source institutions into (i) DISTINCT documents (keep, tagged) vs
 * (ii) TRUE DUPES (same document at different URLs -> merge). Signals (all existing/reused):
 *   - urlIsRoot (entity-gate): >1 root/landing URL for one institution = portal registered twice.
 *   - parseInstrumentIdentity (eur-lex ELI/CELEX -> reg number): same reg # at different URL
 *     forms = the same document = true dupe.
 * NEVER flags two DISTINCT documents (different reg #s / different deep URLs) as dupes. */
import pg from "pg";import{readFileSync}from"node:fs";import{resolve,dirname}from"node:path";import{fileURLToPath}from"node:url";
import { urlIsRoot } from "../../src/lib/sources/entity-gate.mjs";
import { canonicalizeUrl } from "../../src/lib/sources/url-canonicalize.ts";
import { parseInstrumentIdentity } from "../../src/lib/sources/instrument-identity.ts";
const __d=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(__d,"..","..");process.loadEnvFile(resolve(ROOT,".env.local"));
const ref=readFileSync(resolve(ROOT,"supabase/.temp/project-ref"),"utf8").trim();const pooler=readFileSync(resolve(ROOT,"supabase/.temp/pooler-url"),"utf8").trim();
const CONN=pooler.replace(`postgres.${ref}@`,`postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const c=new pg.Client({connectionString:CONN});await c.connect();const q=(s,p)=>c.query(s,p).then(r=>r.rows);
try{
  const insts=await q(`SELECT i.id, i.name, i.registrable_domain rd,
     (SELECT count(*)::int FROM sources s WHERE s.institution_id=i.id AND s.status='active') n
     FROM institutions i ORDER BY n DESC`);
  const multi=insts.filter(i=>i.n>1);
  let totalTrueDupe=0, totalKeep=0; const trueDupeClusters=[];
  for(const inst of multi){
    const rows=await q(`SELECT id, name, url FROM sources WHERE institution_id=$1 AND status='active'`,[inst.id]);
    const portals=rows.filter(r=>urlIsRoot(r.url));
    const docs=rows.filter(r=>!urlIsRoot(r.url));
    // (ii-a) portal dupes: >1 root URL for the institution = same landing registered twice
    let portalDupe=portals.length>1?portals.length-1:0;
    // (ii-b) document dupes: same parsed instrument identity (eur-lex) = same document, diff URL
    const byIdent=new Map();
    for(const d of docs){const p=parseInstrumentIdentity(d.url); if(p){const k=`${p.instrumentType}|${p.instrumentIdentifier}`;(byIdent.get(k)||byIdent.set(k,[]).get(k)).push(d);}}
    let docIdentDupe=[...byIdent.values()].filter(v=>v.length>1).reduce((a,v)=>a+v.length-1,0);
    const trueDupe=portalDupe+docIdentDupe;
    const distinctDocs=docs.length - [...byIdent.values()].filter(v=>v.length>1).reduce((a,v)=>a+v.length,0) + [...byIdent.values()].filter(v=>v.length>1).length; // unique docs + 1 per ident-group
    totalTrueDupe+=trueDupe; totalKeep+=(rows.length-trueDupe);
    if(trueDupe>0) trueDupeClusters.push({inst:inst.name, rd:inst.rd, portalDupe, docIdentDupe, portals:portals.length, docs:docs.length});
  }
  console.log(`===== INSTITUTION RE-SORT (${multi.length} multi-source institutions) =====`);
  console.log(`  TRUE DUPES (same document, different URLs -> merge): ${totalTrueDupe}`);
  console.log(`  KEEP DISTINCT (distinct documents, tagged to institution): ${totalKeep}`);
  console.log(`\n  true-dupe clusters (basis per call):`);
  for(const t of trueDupeClusters.sort((a,b)=>(b.portalDupe+b.docIdentDupe)-(a.portalDupe+a.docIdentDupe)))
    console.log(`    ${t.rd.padEnd(24)} portalDupe=${t.portalDupe} docIdentDupe=${t.docIdentDupe}  (${t.portals} portals, ${t.docs} docs)  "${String(t.inst).slice(0,28)}"`);

  // NON-COLLAPSE PROOF: eur-lex distinct regulations stay separate
  console.log(`\n===== NON-COLLAPSE PROOF: europa.eu distinct documents stay separate =====`);
  const eu=await q(`SELECT s.url FROM sources s JOIN institutions i ON i.id=s.institution_id WHERE i.registrable_domain='europa.eu' AND s.status='active'`);
  const euIdents=new Map();
  for(const r of eu){const p=parseInstrumentIdentity(r.url); if(p) euIdents.set(`${p.instrumentType} ${p.instrumentIdentifier}`,(euIdents.get(`${p.instrumentType} ${p.instrumentIdentifier}`)||0)+1);}
  console.log(`  europa.eu active sources: ${eu.length}; distinct parsed regulation identities: ${euIdents.size}`);
  for(const [k,n] of [...euIdents].slice(0,10)) console.log(`    ${k}  (${n} row${n>1?'s — would merge':' — distinct, kept'})`);
  console.log(`  => distinct reg #s remain distinct sources; only same-reg-#-different-URL would merge.`);
  await c.end();
}catch(e){console.error(e);await c.end();process.exit(1);}
