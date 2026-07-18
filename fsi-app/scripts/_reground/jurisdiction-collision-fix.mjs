#!/usr/bin/env node
// jurisdiction-collision-fix.mjs — SW-1 collision-class fixer (sweep-ledger SW-1, operator 2026-07-17).
// A jurisdiction_iso token `US-XX` where XX is ALSO an ISO country code silently mis-tags a country item to a
// US state (or, for CA, Canada→California). Session B surfaced 4 LIVE instances in its drain-queue findings; the
// underlying cause is a derivation bug (_derive_jurisdiction_iso_from_canonical maps country CA/IN → US-CA/US-IN).
// This tool fixes the per-item jurisdiction_iso (the collision-operative field) under a lease, guarded + snapshotted
// (reversible), and reads back to confirm the value stuck through the normalize trigger (which canonicalizes but
// only DERIVES when iso is empty, so a non-empty fix survives). The corpus-wide derivation-function fix is the
// deferred SW-1 sweep; this closes the confirmed live instances at their handling moment (the cheapest moment).
// Usage: node scripts/_reground/jurisdiction-collision-fix.mjs [--apply]
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const HOLDER = "session-A";

// Confirmed collision instances (Session B findings + read-back of jurisdictions vs jurisdiction_iso).
// Each: id, the CORRECT iso, and why. jurisdictions (text) is fixed only where it also carries the conflation.
const FIXES = [
  { id: "5b2c6655-b59f-4e8a-a813-466cd26cce5b", iso: ["CA"], why: "Canada Clean Fuel Regs: US-CA(California)→CA(Canada); jurisdictions already ['CA']" },
  { id: "3e9c3ebe-10f2-4502-b629-b746f7d3438a", iso: ["CO"], why: "Colombian Ministry of Transport: US-CO(Colorado)→CO(Colombia)" },
  { id: "beae0a7e-1088-4d35-b89f-362aade1d1a8", iso: ["IN"], why: "India National Logistics Policy: US-IN(Indiana)→IN(India)" },
  { id: "ad4cc6c6-6c72-44bf-8b54-79671ee1707c", iso: ["JP"], jurisdictions: ["JP"], why: "Japan Customs: drop AE+BD pool-conflation → [JP]" },
];

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { readClient, guardedUpdate } = await jiti.import("../lib/db.mjs");
const { acquireLease, releaseLease } = await jiti.import("../lib/mutation-lease.mjs");
const sb = readClient();

console.log(`\n===== JURISDICTION-COLLISION-FIX (${APPLY ? "APPLY" : "DRY-RUN"}) SW-1 =====`);
for (const f of FIXES) {
  const { data: before } = await sb.from("intelligence_items").select("title,jurisdictions,jurisdiction_iso").eq("id", f.id).single();
  console.log(`  ${f.id.slice(0, 8)} iso ${JSON.stringify(before?.jurisdiction_iso)} -> ${JSON.stringify(f.iso)}${f.jurisdictions ? ` jur ${JSON.stringify(before?.jurisdictions)}->${JSON.stringify(f.jurisdictions)}` : ""} | ${String(before?.title).slice(0, 40)} — ${f.why}`);
}
if (!APPLY) { console.log(`\n(dry-run — --apply to fix ${FIXES.length})`); process.exit(0); }

let done = 0;
for (const f of FIXES) {
  const lease = await acquireLease(sb, f.id, HOLDER, "A");
  if (!lease.acquired) { console.log(`  SKIP ${f.id.slice(0, 8)}: leased by ${lease.cur_holder}`); continue; }
  try {
    const patch = { jurisdiction_iso: f.iso };
    if (f.jurisdictions) patch.jurisdictions = f.jurisdictions;
    const cite = { skill: "remediation-discipline", reason: `SW-1 jurisdiction-collision fix (operator sweep 2026-07-17): ${f.why}` };
    await guardedUpdate("intelligence_items", (q) => q.eq("id", f.id), patch, { cite });
    const { data: after } = await sb.from("intelligence_items").select("jurisdiction_iso").eq("id", f.id).single();
    const ok = JSON.stringify(after?.jurisdiction_iso) === JSON.stringify(f.iso);
    console.log(`  ${ok ? "FIXED" : "MISMATCH!!"} ${f.id.slice(0, 8)} -> iso=${JSON.stringify(after?.jurisdiction_iso)}${ok ? "" : " (trigger altered the value — investigate)"}`);
    if (ok) done++;
  } catch (e) { console.log(`  FAILED ${f.id.slice(0, 8)}: ${e.message}`); }
  finally { await releaseLease(sb, f.id, HOLDER).catch(() => {}); }
}
console.log(`\nfixed ${done}/${FIXES.length}.`);
process.exit(0);
