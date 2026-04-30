// Verifies the detect_intersections RPC against the live DB.
// Re-runnable validation (not a one-shot per Rule 11): can be invoked
// any time after B.2 regeneration completes to spot-check that the
// intersection detection function is producing meaningful results.
//
// Usage:
//   node supabase/seed/verify-intersections.mjs            # default min_strength=5
//   node supabase/seed/verify-intersections.mjs --min=10   # strong only
//   node supabase/seed/verify-intersections.mjs --max=200  # raise output cap

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, "..", ".."));
process.loadEnvFile(".env.local");

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const args = process.argv.slice(2);
const minStrength = parseInt(args.find((a) => a.startsWith("--min="))?.split("=")[1] || "5", 10);
const maxResults = parseInt(args.find((a) => a.startsWith("--max="))?.split("=")[1] || "100", 10);

const t0 = Date.now();
const { data, error } = await supabase.rpc("detect_intersections", {
  min_strength: minStrength,
  max_results: maxResults,
});
const elapsed = Date.now() - t0;

if (error) {
  console.error("RPC error:", error.message);
  process.exit(1);
}

console.log(`detect_intersections(min_strength=${minStrength}, max_results=${maxResults})`);
console.log(`returned ${data.length} pair(s) in ${elapsed}ms\n`);

if (data.length === 0) {
  console.log("No intersections detected. Possible causes:");
  console.log("  - No intelligence_items have populated operational_scenario_tags AND compliance_object_tags");
  console.log("  - min_strength threshold too high; try --min=1 to see all candidate pairs");
  console.log("  - B.2 regeneration hasn't run on enough items yet");
  process.exit(0);
}

// Group by strength bucket
const strong = data.filter((d) => d.strength >= 12);
const medium = data.filter((d) => d.strength >= 8 && d.strength < 12);
const weak = data.filter((d) => d.strength < 8);

console.log(`STRONG (≥12): ${strong.length}    MEDIUM (8-11): ${medium.length}    WEAK (<8): ${weak.length}\n`);

console.log("=".repeat(72));
console.log("TOP RESULTS");
console.log("=".repeat(72));

for (const r of data.slice(0, 15)) {
  const a = r.item_a_legacy_id || r.item_a_id.slice(0, 8);
  const b = r.item_b_legacy_id || r.item_b_id.slice(0, 8);
  const explicit = r.explicitly_linked ? " [explicit-linked]" : "";
  console.log(`\n[strength ${r.strength}]${explicit}`);
  console.log(`  [${a}] ${(r.item_a_title || "").slice(0, 50)} (${r.item_a_priority})`);
  console.log(`  ↔ [${b}] ${(r.item_b_title || "").slice(0, 50)} (${r.item_b_priority})`);
  console.log(`  shared scenarios: ${(r.shared_scenarios || []).join(", ")}`);
  console.log(`  shared compliance: ${(r.shared_compliance_objects || []).join(", ")}`);
}

if (data.length > 15) console.log(`\n  ... and ${data.length - 15} more pair(s)`);

// Sanity checks
let warnings = 0;
const seenPairs = new Set();
for (const r of data) {
  const key = `${r.item_a_id}|${r.item_b_id}`;
  if (seenPairs.has(key)) {
    console.log(`\n⚠ DUPLICATE: pair ${key} appears twice — canonicalization broken`);
    warnings++;
  }
  seenPairs.add(key);
  if (r.item_a_id === r.item_b_id) {
    console.log(`\n⚠ SELF-PAIR: item paired with itself: ${r.item_a_id}`);
    warnings++;
  }
  if (r.item_a_id > r.item_b_id) {
    console.log(`\n⚠ ORDER VIOLATION: A.id > B.id — A=${r.item_a_id} B=${r.item_b_id}`);
    warnings++;
  }
}

if (warnings === 0) {
  console.log("\n✓ All sanity checks passed (no duplicates, no self-pairs, ordering canonical)");
} else {
  console.log(`\n✗ ${warnings} sanity warning(s) — investigate detect_intersections RPC`);
  process.exit(1);
}
