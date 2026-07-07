// READ-ONLY: the exact provenance verdict for 50ccd5cc + the claim-kind/derived-tier distribution + the
// source tiers behind its claims. Tells us WHY it is quarantined (floor failure vs other) before any write.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();

const allItems = await readAll("intelligence_items", "id");
const id = (allItems || []).find((i) => String(i.id).startsWith("50ccd5cc"))?.id;

const { data: verdict, error: vErr } = await sb.rpc("validate_item_provenance", { p_item_id: id });
console.log("=== validate_item_provenance ===");
console.log(vErr ? `ERR ${vErr.message}` : JSON.stringify(verdict, null, 1));

const { data: claims } = await sb.from("section_claim_provenance")
  .select("claim_kind, source_id, source_tier_at_grounding, claim_text").eq("intelligence_item_id", id);
console.log(`\n=== ${claims?.length || 0} claims ===`);
const srcIds = [...new Set((claims || []).map((c) => c.source_id).filter(Boolean))];
const { data: srcs } = await sb.from("sources").select("id, base_tier, tier_override, effective_tier, url, name").in("id", srcIds.length ? srcIds : ["00000000-0000-0000-0000-000000000000"]);
const tierOf = Object.fromEntries((srcs || []).map((s) => [s.id, s.tier_override ?? s.base_tier]));
const byKind = {};
let factAboveFloor = 0;
for (const c of claims || []) {
  const k = c.claim_kind || "?";
  byKind[k] = (byKind[k] || 0) + 1;
  const dt = c.source_id ? tierOf[c.source_id] : null;
  if ((k || "").toUpperCase() === "FACT" && (dt == null || dt > 2)) factAboveFloor++;
}
console.log("by claim_kind:", JSON.stringify(byKind));
console.log(`FACT claims with derived tier NULL or > T2 (would fail the framework floor): ${factAboveFloor}`);
console.log("\n=== sources behind claims (derived tier = override ?? base_tier) ===");
for (const s of srcs || []) console.log(`  T${s.tier_override ?? s.base_tier ?? "?"} (base ${s.base_tier}, eff ${s.effective_tier}) — ${s.name || s.url}`);
process.exit(0);
