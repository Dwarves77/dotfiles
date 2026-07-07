// READ-ONLY: tally the validate_item_provenance failure classes across all live quarantined items, to
// size the grounding fix's impact (how many fail on the now-fixed ungrounded_url vs other classes). No
// LLM/Browserless spend — just validator RPC reads.
import { readClient, readAll } from "../lib/db.mjs";
const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\//, "");
try { process.loadEnvFile(ROOT + ".env.local"); } catch {}
const sb = readClient();
const items = (await readAll("intelligence_items", "id,legacy_id,item_type,provenance_status,is_archived"))
  .filter((i) => !i.is_archived && i.provenance_status === "quarantined");
console.log(`quarantined (live): ${items.length}`);
const classCount = {};      // items exhibiting each reason
const onlyClass = {};       // items whose ONLY reason is this class
let noFailures = 0;
for (const it of items) {
  const { data: vr } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
  const row = Array.isArray(vr) ? vr[0] : vr;
  const reasons = [...new Set((row?.failures || []).map((f) => f.reason).filter(Boolean))];
  if (!reasons.length) { noFailures++; continue; }
  for (const r of reasons) classCount[r] = (classCount[r] || 0) + 1;
  if (reasons.length === 1) onlyClass[reasons[0]] = (onlyClass[reasons[0]] || 0) + 1;
}
console.log(`\nFAILURE CLASS (count of items exhibiting it; an item can have >1):`);
for (const [r, c] of Object.entries(classCount).sort((a, b) => b[1] - a[1])) console.log(`   ${String(c).padStart(3)}  ${r}`);
console.log(`\nItems whose ONLY blocker is one class (these flip with that single class fixed):`);
for (const [r, c] of Object.entries(onlyClass).sort((a, b) => b[1] - a[1])) console.log(`   ${String(c).padStart(3)}  ${r}`);
console.log(`\nItems with NO validator failures (would verify on a clean re-ground): ${noFailures}`);
console.log(`ungrounded_url-exhibiting items (directly helped by the criterion-2 fix): ${classCount["ungrounded_url"] || 0}`);
process.exit(0);
