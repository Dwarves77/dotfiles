// Phase 4.1 DATA fix: NULL source_tier_at_grounding on the errant non-FACT claims (SC-7). Guarded
// (snapshot prior rows -> reversible). Selects the errant set BY PREDICATE (non-FACT + non-null stamp)
// so it can only touch errant rows; FACT stamps are untouched. Proves 0 errant after.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { guardedUpdate, readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = readClient();
const CITE = { skill: "remediation-discipline", reason: "Phase 4.1: NULL the 41 errant non-FACT source_tier_at_grounding stamps (SC-7; edit-1 cure). reversible via snapshot" };

const countErrant = async () => (await sb.from("section_claim_provenance").select("id", { count: "exact", head: true }).neq("claim_kind", "FACT").not("source_tier_at_grounding", "is", null)).count;
const countFactStamped = async () => (await sb.from("section_claim_provenance").select("id", { count: "exact", head: true }).eq("claim_kind", "FACT").not("source_tier_at_grounding", "is", null)).count;

const errantBefore = await countErrant();
const factBefore = await countFactStamped();
console.log(`BEFORE: errant non-FACT stamps=${errantBefore}, FACT stamps=${factBefore}`);

const r = await guardedUpdate(
  "section_claim_provenance",
  (qb) => qb.neq("claim_kind", "FACT").not("source_tier_at_grounding", "is", null),
  { source_tier_at_grounding: null },
  { cite: CITE }
);
console.log(`NULLed: updated=${r.updated} | snapshot=${r.snapshot}`);

const errantAfter = await countErrant();
const factAfter = await countFactStamped();
console.log(`AFTER:  errant non-FACT stamps=${errantAfter}, FACT stamps=${factAfter}`);

const ok = errantAfter === 0 && factAfter === factBefore;
console.log(`\n  errant non-FACT now 0:            ${errantAfter === 0 ? "PASS" : "FAIL"} (${errantAfter})`);
console.log(`  FACT stamps untouched (${factBefore}): ${factAfter === factBefore ? "PASS" : "FAIL"} (${factAfter})`);
console.log(`\n${ok ? "PHASE 4.1 DATA FIX VERIFIED — non-FACT holds NULL; FACT stamps intact." : "!!! VERIFY FAILED"}`);
process.exit(ok ? 0 : 1);
