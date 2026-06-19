/** PHASE 2 PRE-FLIGHT — read-only lane readiness check (NO writes, NO --apply, NO secret values echoed).
 *  Run this FIRST on the network-stable lane before spending on the large grounding call. It verifies the
 *  lane is wired + reachable and gives the GO/NO-GO verdict for the big batches.
 *
 *  Checks: [1] required env vars present/absent BY NAME (never value) · [2] a moderate Anthropic call
 *  completes · [3] a Browserless fetch completes · [4] the 2 target items resolve + their ledger prints ·
 *  [5] ONE grounding-sized Anthropic call (max_tokens 4000, ~50KB payload, 120s bound) — THE lane-stability
 *  verdict. Exit 0 = lane CLEAR for --apply; exit 1 = NO-GO (missing env or the large call timed out).
 *  GOVERNING: remediation-discipline (network-stable-lane discipline). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readClient, readAll } from "./lib/db.mjs";
import { canonicalGenerate } from "./lib/anthropic.mjs"; // rule 016: the sanctioned script-side Anthropic path
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* env may be pre-set on the lane */ }

const TARGET_KEYS = ["india-s-national-logistics-policy-carbon-intensity-standards", "japan-green-transformation-gx-freight-transport-standards"];
const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "BROWSERLESS_API_KEY"];
const LARGE_BOUND_MS = 120000; // mirror phase2-reground's per-call ground timeout — a faithful proxy
const t0 = () => Date.now();
const race = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${label} (${ms}ms)`)), ms))]);

let nogo = false;
console.log(`\n===== PHASE 2 PRE-FLIGHT (read-only, no writes, no --apply) =====`);

// [1] ENV — presence by NAME ONLY (never the value).
console.log(`\n[1/5] ENV VARS (presence by name; values never printed):`);
for (const k of REQUIRED) { const present = !!process.env[k]; if (!present) nogo = true; console.log(`  ${k.padEnd(28)} ${present ? "present" : "ABSENT ✗"}`); }
console.log(`  ${"SUPABASE_DB_PASSWORD".padEnd(28)} ${process.env.SUPABASE_DB_PASSWORD ? "present" : "absent"}  (needed only for the (b) relabel step, not reground)`);

// [2] moderate Anthropic call (~the 6.4s probe) — proves Anthropic creds + reachability.
console.log(`\n[2/5] Moderate Anthropic call:`);
if (process.env.ANTHROPIC_API_KEY) {
  const s = t0();
  try {
    await race(canonicalGenerate({ messages: [{ role: "user", content: "Reply with the single word OK." }], maxTokens: 64 }), 60000, "anthropic-moderate");
    console.log(`  ${((t0() - s) / 1000).toFixed(1)}s OK (HTTP 200)`); // canonicalGenerate throws on non-200, so reaching here = 200
  } catch (e) { console.log(`  ✗ ${e.message.slice(0, 40)}`); nogo = true; }
} else console.log("  skipped (ANTHROPIC_API_KEY absent)");

// [3] Browserless fetch of a reliable URL — proves Browserless creds + reachability.
console.log(`\n[3/5] Browserless fetch:`);
if (process.env.BROWSERLESS_API_KEY) {
  try {
    const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
    const { browserlessFetch } = await jiti.import("../src/lib/sources/canonical-fetch.mjs");
    const s = t0();
    const r = await race(browserlessFetch("https://example.com", { maxTextLength: 4000 }), 30000, "browserless");
    console.log(`  ${((t0() - s) / 1000).toFixed(1)}s ${(r.text || "").length}ch  ${(r.text || "").length > 50 ? "" : "✗ (suspiciously empty)"}`);
  } catch (e) { console.log(`  ✗ ${e.message.slice(0, 40)}`); nogo = true; }
} else console.log("  skipped (BROWSERLESS_API_KEY absent)");

// [4] target items resolve + ledger state.
console.log(`\n[4/5] Target items (resolve + current ledger):`);
try {
  const items = await readAll("intelligence_items", "id,legacy_id,title,provenance_status");
  const claims = await readAll("section_claim_provenance", "intelligence_item_id,claim_kind,source_tier_at_grounding");
  for (const k of TARGET_KEYS) {
    const it = items.find((x) => x.legacy_id === k);
    if (!it) { console.log(`  ${k}  NOT FOUND ✗`); nogo = true; continue; }
    const fl = claims.filter((c) => c.intelligence_item_id === it.id && c.claim_kind === "FACT");
    const tiers = {}; for (const c of fl) tiers[c.source_tier_at_grounding ?? "null"] = (tiers[c.source_tier_at_grounding ?? "null"] || 0) + 1;
    console.log(`  ${k}\n      status=${it.provenance_status}  FACTtiers=${JSON.stringify(tiers)}`);
  }
} catch (e) { console.log(`  ✗ DB read failed: ${e.message.slice(0, 50)}`); nogo = true; }

// [5] LARGE grounding-sized Anthropic call — THE lane-stability verdict (go/no-go gate).
console.log(`\n[5/5] LARGE grounding-sized Anthropic call (max_tokens 4000, ~50KB payload, ${LARGE_BOUND_MS / 1000}s bound):`);
let largeOk = false;
if (process.env.ANTHROPIC_API_KEY) {
  const payload = "The regulation requires covered entities to submit annual emissions reports by January 31 of the following year. ".repeat(450).slice(0, 50000);
  const s = t0();
  try {
    await race(canonicalGenerate({ messages: [{ role: "user", content: `Extract up to 5 factual claims as a JSON list from this source text:\n\n${payload}` }], maxTokens: 4000 }), LARGE_BOUND_MS, "anthropic-large");
    largeOk = true; console.log(`  ${((t0() - s) / 1000).toFixed(1)}s HTTP 200  →  LANE CLEAR (large grounding call completes)`);
  } catch (e) { console.log(`  ${((t0() - s) / 1000).toFixed(1)}s ${e.message.slice(0, 40)}  →  LANE NOT STABLE (same window problem)`); }
} else console.log("  skipped (ANTHROPIC_API_KEY absent)");
if (!largeOk) nogo = true;

// ── verdict + run order ──────────────────────────────────────────────────────────────────────────────
console.log(`\n===== VERDICT =====`);
if (nogo) {
  console.log(`NO-GO — fix the ✗ above (missing env, unreachable service, or the large call timed out).`);
  console.log(`If only [5] failed: the lane has the same large-grounding-call instability — do NOT run the`);
  console.log(`big batches (E2 59 deferrals / Phase 2 30 flagships) here; retry preflight when stable.`);
} else {
  console.log(`GO — lane wired, reachable, and the large grounding call completed clean. Cleared for --apply.`);
}
console.log(`\nRUN ORDER:`);
console.log(`  1. node scripts/phase2-preflight.mjs            ← you are here (read-only)`);
console.log(`  2. if GO: node scripts/phase2-reground.mjs --only=${TARGET_KEYS.join(",")} --apply`);
console.log(`  3. read the stability + reg outcomes (VERIFIED / COUNSEL split + FALLBACK FIRED line)`);
console.log(`  4. then: node scripts/phase2-analysis-relabel.mjs --only=${TARGET_KEYS.join(",")} --apply   (pg-direct; relabels analyst-line residue only)`);
process.exit(nogo ? 1 : 0);
