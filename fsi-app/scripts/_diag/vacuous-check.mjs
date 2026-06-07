import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();
// 1. required slots per item_type
const slots = await readAll("item_type_required_slots", "item_type,slot_key");
const byType = {}; for (const s of slots) (byType[s.item_type] ||= []).push(s.slot_key);
console.log("required slots per item_type:");
for (const [t, ks] of Object.entries(byType)) console.log(`  ${t}: ${ks.length} [${ks.join(", ")}]`);
const typesWithSlots = new Set(Object.keys(byType));
// 2. verified items: how many have 0 claims (vacuous)?
const verified = await readAll("intelligence_items", "id,legacy_id,item_type", { match: (q) => q.eq("is_archived", false).eq("provenance_status", "verified") });
const claimRows = await readAll("section_claim_provenance", "intelligence_item_id");
const haveClaims = new Set(claimRows.map((c) => c.intelligence_item_id));
let vac = 0, real = 0; const vacByType = {};
for (const it of verified) { if (haveClaims.has(it.id)) real++; else { vac++; vacByType[it.item_type] = (vacByType[it.item_type] || 0) + 1; } }
console.log(`\nVERIFIED items: ${verified.length}  | with >=1 claim: ${real}  | ZERO claims (vacuous?): ${vac}`);
console.log(`vacuous-verified by item_type:`, JSON.stringify(vacByType));
console.log(`item_types with NO required slots (can verify vacuously):`, Object.keys(vacByType).filter((t) => !typesWithSlots.has(t)));
