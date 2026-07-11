// Wave-α C7.3 — FuelEU Maritime 2023/1805 twin merge (OPERATOR RULING 2026-07-11).
// KEEPER = 7a0ead55 (49 claims/20 timelines, richer graph). LOSE = e4d84c60.
// Re-point e4d84c60's 3 item_cross_references to the keeper (drop a dup edge on collision),
// then archive e4d84c60 (duplicate_instrument). The keeper rides disposition-engine Unit 3.
// Guarded (snapshot + cite via db.mjs). Dry-run default; --apply to write.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { guardedUpdate, guardedDelete, archiveRows, readClient } = await import("../lib/db.mjs");

const APPLY = process.argv.includes("--apply");
const KEEP = "7a0ead55-7a7b-403b-8ba3-33862cb296e2";
const LOSE = "e4d84c60-0264-4d87-81d3-49a37863eefb";
const CITE = { skill: "source-credibility-model", reason: "Wave-α C7.3 FuelEU 2023/1805 twin merge (operator ruling): keeper 7a0ead55, re-point xrefs + archive loser duplicate_instrument" };
const sb = readClient();

const xrefs = (await sb.from("item_cross_references").select("id, source_item_id, target_item_id")
  .or(`source_item_id.eq.${LOSE},target_item_id.eq.${LOSE}`)).data || [];
console.log(`[fueleu-merge] mode=${APPLY ? "APPLY" : "DRY-RUN"} · ${xrefs.length} xref(s) on e4d84c60`);

for (const x of xrefs) {
  const isSrc = x.source_item_id === LOSE;
  const otherId = isSrc ? x.target_item_id : x.source_item_id;
  const newSrc = isSrc ? KEEP : x.source_item_id;
  const newTgt = isSrc ? x.target_item_id : KEEP;
  // self-edge after repoint (keeper<->keeper) or a dup the keeper already has → drop the loser edge
  const collision = newSrc === newTgt ||
    ((await sb.from("item_cross_references").select("id")
      .eq("source_item_id", newSrc).eq("target_item_id", newTgt)).data || []).some((r) => r.id !== x.id);
  if (collision) {
    console.log(`   xref ${x.id.slice(0, 8)}: keeper already has ${newSrc.slice(0, 8)}->${newTgt.slice(0, 8)} (or self-edge) → ${APPLY ? "DROP loser edge" : "would DROP"}`);
    if (APPLY) await guardedDelete("item_cross_references", [x.id], { cite: CITE });
  } else {
    console.log(`   xref ${x.id.slice(0, 8)}: ${APPLY ? "re-point" : "would re-point"} → ${newSrc.slice(0, 8)}->${newTgt.slice(0, 8)}`);
    if (APPLY) await guardedUpdate("item_cross_references", (qb) => qb.eq("id", x.id), { source_item_id: newSrc, target_item_id: newTgt }, { cite: CITE });
  }
}

if (APPLY) {
  await archiveRows("intelligence_items", [LOSE], { cite: CITE, archive_reason: "duplicate_instrument" });
  const after = (await sb.from("intelligence_items").select("is_archived, archive_reason").eq("id", LOSE)).data?.[0];
  console.log(`[fueleu-merge] archived e4d84c60:`, after);
} else {
  console.log(`[fueleu-merge] DRY-RUN — would archive e4d84c60 (duplicate_instrument). Pass --apply.`);
}
