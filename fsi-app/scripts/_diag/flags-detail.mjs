import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();
const flags = await readAll("integrity_flags", "category,subject_type,subject_ref,description,status,created_by");
console.log("TOTAL flags:", flags.length);
const byCreator = {}; for (const f of flags) byCreator[f.created_by]=(byCreator[f.created_by]||0)+1;
console.log("by created_by:", JSON.stringify(byCreator, null, 0));
// any conformance/skill-version related?
const conf = flags.filter(f => /conform|skill.version|regenerat|legacy|format_type|contract/i.test(f.description||""));
console.log("\nconformance-related existing flags:", conf.length);
console.log("\nsample data_quality descriptions (first 6):");
for (const f of flags.filter(f=>f.category==="data_quality").slice(0,6)) console.log(`  [${f.status}] ${f.subject_type}:${(f.subject_ref||"").slice(0,12)} ${(f.description||"").slice(0,90)}`);
