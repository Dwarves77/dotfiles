import { readClient } from "../lib/db.mjs";
import { readFileSync } from "node:fs";
const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\//, "");
try { process.loadEnvFile(ROOT + ".env.local"); } catch {}
const sb = readClient();
const F = process.argv[2];
const keys = [...new Set(readFileSync(F, "utf8").split(/\r?\n/).filter((l) => /still-quarantined \(/.test(l)).map((l) => l.trim().split(/\s+/)[0]))];
const { data: items } = await sb.from("intelligence_items").select("id,legacy_id,item_type,provenance_status").eq("is_archived", false);
const byKey = new Map(); for (const it of items) { byKey.set(it.legacy_id, it); byKey.set(it.id.slice(0, 8), it); }
const classCount = {}, byType = {};
let stillQ = 0, flipped = 0;
for (const k of keys) {
  const it = byKey.get(k); if (!it) continue;
  if (it.provenance_status === "verified") { flipped++; continue; }
  stillQ++;
  const { data: vr } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
  const row = Array.isArray(vr) ? vr[0] : vr;
  const failures = row?.failures ?? [];
  const reasons = new Set(failures.map((f) => f.reason));
  for (const r of reasons) classCount[r] = (classCount[r] || 0) + 1;
  byType[it.item_type] = (byType[it.item_type] || 0) + 1;
}
console.log(`quarantined keys checked: ${keys.length}  | still-quarantined: ${stillQ}  | since-flipped: ${flipped}`);
console.log("FAILURE CLASS (count of items exhibiting it; an item can have >1):");
for (const [r, c] of Object.entries(classCount).sort((a, b) => b[1] - a[1])) console.log(`   ${c.toString().padStart(3)}  ${r}`);
console.log("BY ITEM TYPE:");
for (const [t, c] of Object.entries(byType).sort((a, b) => b[1] - a[1])) console.log(`   ${c.toString().padStart(3)}  ${t}`);
process.exit(0);
