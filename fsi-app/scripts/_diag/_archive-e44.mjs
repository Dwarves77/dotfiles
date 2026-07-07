import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { readClient, readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const sb = readClient();
const items = await readAll("intelligence_items","id,legacy_id,title,item_type,provenance_status,is_archived,archive_reason,archive_note,archived_date",{match:(q)=>q.eq("is_archived",false)});
const e44 = items.find((x)=>x.id.slice(0,8)==="e44a5408");
if (!e44) { console.log("e44a5408 not found / already archived"); process.exit(0); }
console.log("TARGET:", e44.id.slice(0,8), (e44.title||"").slice(0,60), `[${e44.item_type}/${e44.provenance_status}]`);
const snapDir = resolve(ROOT,"scripts/_snapshots"); mkdirSync(snapDir,{recursive:true});
const snap = resolve(snapDir,"e44a5408-prior-archive.json");
writeFileSync(snap, JSON.stringify({id:e44.id,prior:{is_archived:e44.is_archived,archive_reason:e44.archive_reason,archive_note:e44.archive_note,archived_date:e44.archived_date,provenance_status:e44.provenance_status}},null,2));
console.log("snapshot:", snap);
if (!APPLY) { console.log("DRY-RUN — pass --apply."); process.exit(0); }
const { error } = await sb.from("intelligence_items").update({ is_archived:true, archive_reason:"duplicate", archive_note:"E1 pull-out: duplicate of 576554b3 (UK Transport Decarbonisation Plan, guidance). This copy is mistyped market_signal with 0 claims (never grounded). Canonical copy 576554b3 retained. Reversible via scripts/_snapshots/e44a5408-prior-archive.json.", archived_date:new Date().toISOString().slice(0,10) }).eq("id", e44.id);
if (error) { console.error("FAILED:", error.message); process.exit(1); }
console.log("ARCHIVED e44a5408 as duplicate of 576554b3.");
process.exit(0);
