import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();
const flags = await readAll("integrity_flags", "subject_ref,description,recommended_actions,status,created_by", { match:(q)=>q.eq("created_by","skill-conformance-audit") });
console.log(`skill-conformance-audit flags in Supabase: ${flags.length} (open: ${flags.filter(f=>f.status==="open").length})`);
console.log(`\nsample row (proves it's queryable + carries redo instructions):`);
const s = flags[0];
console.log(`  subject_ref: ${s.subject_ref}`);
console.log(`  status: ${s.status}`);
console.log(`  description: ${s.description}`);
console.log(`  recommended_actions: ${JSON.stringify(s.recommended_actions)}`);
// prove the redo can be DRIVEN from this: count distinct items needing redo
const ids = new Set(flags.filter(f=>f.status==="open").map(f=>f.subject_ref));
console.log(`\nredo queue (distinct items with open conformance flag): ${ids.size}`);
