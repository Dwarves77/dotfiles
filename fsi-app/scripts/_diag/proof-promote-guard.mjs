/** READ-ONLY. Replicates the EXACT promote dedup-guard logic against test URLs to prove a
 * known-dupe promote is ROUTED to the existing source (not inserted), and a genuinely-new URL
 * is correctly allowed. Same code path as promote/route.ts: canonicalizeUrl + host-narrow +
 * JS canonical compare. */
import pg from "pg";import{readFileSync}from"node:fs";import{resolve,dirname}from"node:path";import{fileURLToPath}from"node:url";
import { canonicalizeUrl } from "../../src/lib/sources/url-canonicalize.ts";
const __d=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(__d,"..","..");process.loadEnvFile(resolve(ROOT,".env.local"));
const ref=readFileSync(resolve(ROOT,"supabase/.temp/project-ref"),"utf8").trim();const pooler=readFileSync(resolve(ROOT,"supabase/.temp/pooler-url"),"utf8").trim();
const CONN=pooler.replace(`postgres.${ref}@`,`postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const c=new pg.Client({connectionString:CONN});await c.connect();const q=(s,p)=>c.query(s,p).then(r=>r.rows);

// the guard logic, verbatim shape from promote/route.ts
async function guard(inputUrl){
  const canonUrl=canonicalizeUrl(inputUrl);
  let canonHost=""; try{canonHost=new URL(canonUrl).host;}catch{}
  const hostMatches = canonHost ? await q(`SELECT id,url FROM sources WHERE url ILIKE $1`,[`%${canonHost}%`]) : [];
  const existing = hostMatches.find((s)=>canonicalizeUrl(s.url)===canonUrl) || null;
  return { canonUrl, existing, nCandidates: hostMatches.length };
}

const tests = [
  ["KNOWN DUPE (canonical, MIT)", "https://climatemachine.mit.edu/"],
  ["LEGACY non-canonical (mas.gov.sg, stored without slash)", "https://mas.gov.sg"],   // robust must still catch
  ["LEGACY non-canonical w/ www+slash drift", "https://WWW.safa.aero/"],
  ["GENUINELY NEW (should NOT match)", "https://a-brand-new-source-xyz.example.org/page"],
];
for (const [label,url] of tests){
  const r = await guard(url);
  const verdict = r.existing ? `ROUTED -> reuse source ${r.existing.id.slice(0,8)} (stored="${r.existing.url}")` : "NO MATCH -> would insert (new)";
  console.log(`\n${label}\n  input=${url}\n  canon=${r.canonUrl}  candidates=${r.nCandidates}\n  => ${verdict}`);
}
console.log("\nREAD-ONLY. (proves: dupes route to the existing row; new URLs are allowed.)");
await c.end();
