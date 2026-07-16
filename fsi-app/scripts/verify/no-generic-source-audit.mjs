/** no-generic-source-audit.mjs — hardening A1 seam 3 (no-generic-source, read-only detection).
 *  GOVERNING SKILLS: remediation-discipline (Section 4 category 24 — generic/dead source unselectable at
 *  ground / nothing-generic sourcing). Invariant RD-40.
 *  The nothing-generic sourcing rule, live-data half: NO FACT may ground to a SUSPENDED (generic/dead/
 *  junk-drawer) source. Seam 1 made suspended sources unselectable by the resolver (so NEW grounds cannot
 *  add to this); this audit is the standing TREND guard that the count never RISES — a rising count means a
 *  new FACT grounded to a suspended source (the resolver filter regressed or a raw write bypassed it).
 *
 *  TREND MONITOR with a baseline (scripts/verify/_baselines/facts-on-suspended.json), same shape as
 *  unregistered-span-host-audit: exit 1 only if the count INCREASES vs the recorded floor; it never fails on
 *  the standing backlog. The current backlog (205: 189 on the Task-3-suspended EUR-Lex 404 = the held-to-find
 *  residual whose real instrument source was not in the pool, those 11 items are quarantined; + 16 on a
 *  montreal.ca generic portal row) is dispositioned (held-to-find, priced re-ground queue), not a live defect.
 *  Pass --rebaseline to record the current count as the new floor (operator action after a deliberate
 *  reduction). Read-only otherwise. Invariant RD-40; golden no-generic-source-audit.golden.mjs.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const BASE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "_baselines");
const BASE_FILE = resolve(BASE_DIR, "facts-on-suspended.json");

/** PURE core (goldened, no DB): given FACT rows [{id, source_id}] and the set of suspended source ids,
 *  return the FACT rows that ground to a suspended source (the violations). */
export function factsOnSuspended(facts, suspendedSourceIds) {
  const susp = suspendedSourceIds instanceof Set ? suspendedSourceIds : new Set(suspendedSourceIds || []);
  return (facts || []).filter((f) => f && f.source_id != null && susp.has(f.source_id));
}

async function main() {
  const REBASELINE = process.argv.includes("--rebaseline");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  // suspended source ids (small set)
  const { data: susp } = await sb.from("sources").select("id, url").eq("status", "suspended");
  const suspendedIds = new Set((susp || []).map((s) => s.id));
  // count FACTs grounding to a suspended source
  let count = 0; const perSource = new Map();
  for (const sid of suspendedIds) {
    const { count: n } = await sb.from("section_claim_provenance").select("id", { count: "exact", head: true }).eq("claim_kind", "FACT").eq("source_id", sid);
    if (n) { count += n; perSource.set(sid, n); }
  }
  const baseline = existsSync(BASE_FILE) ? JSON.parse(readFileSync(BASE_FILE, "utf8")).count : null;
  console.log(`\n=== no-generic-source audit === FACTs grounding to a suspended source: ${count} (baseline ${baseline ?? "unset"})`);
  for (const [sid, n] of [...perSource.entries()].sort((a, b) => b[1] - a[1])) {
    const u = (susp || []).find((s) => s.id === sid)?.url || sid;
    console.log(`  ${n} facts -> suspended ${String(u).slice(0, 62)}`);
  }
  if (REBASELINE) {
    mkdirSync(BASE_DIR, { recursive: true });
    writeFileSync(BASE_FILE, JSON.stringify({ count, recorded_at: process.env.AUDIT_STAMP || "manual", note: "facts grounding to a suspended source; fail on INCREASE" }, null, 2));
    console.log(`rebaselined to ${count}.`);
    process.exit(0);
  }
  if (baseline == null) { console.log("no baseline recorded; run --rebaseline once. (not failing)"); process.exit(0); }
  if (count > baseline) { console.error(`REGRESSION: facts-on-suspended ROSE ${baseline} -> ${count} — a NEW FACT grounded to a suspended source (resolver filter bypassed?).`); process.exit(1); }
  console.log(`OK: no increase (${count} <= ${baseline}).`);
  process.exit(0);
}

// run only when invoked directly, not when imported by the golden
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("no-generic-source-audit.mjs")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
