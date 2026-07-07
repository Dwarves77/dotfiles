import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
import { createJiti } from "jiti"; import { readClient, readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { groundBrief } = await jiti.import("../../src/lib/agent/canonical-pipeline.ts");
const items = await readAll("intelligence_items","id,legacy_id");
const it = items.find(x=>x.legacy_id==="japan-green-transformation-gx-freight-transport-standards");
try { const r = await groundBrief(it.id); console.log("ok=",r.ok,"detail=",r.detail); }
catch(e){ console.log("THREW (fatal re-thrown):", e.message, "| fatal=", e.fatal); }
