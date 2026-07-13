/** DATA-AUDIT (CI-with-secrets / ops lane). GOVERNING SKILL: remediation-discipline (§2.1/§2.2 — quarantine
 *  is an open investigation; a flag must not dwell open forever). FLAG-AGE dwell gap closer (item 5, 2026-07-13):
 *  quarantine-disposition-audit enforces dwell on quarantined ITEMS; this enforces open-integrity_flags AGE
 *  across ALL subject_types, with the RD-28-held exemption. Read-only, report-only (never blind-writes).
 *  Exit 0 = clean; 1 = non-exempt past-bound flags found; 2 = read error. Env: NEXT_PUBLIC_SUPABASE_URL +
 *  SUPABASE_SERVICE_ROLE_KEY. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";
import { summarizeFlagAges, DWELL_BOUND_DAYS } from "../lib/flag-age.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}

let flags;
try {
  flags = await readAll("integrity_flags", "id,created_by,subject_type,subject_ref,recommended_actions,created_at",
    { match: (q) => q.eq("status", "open") });
} catch (e) {
  console.error(`flag-age-audit: read failed — ${e.message}`);
  process.exit(2);
}

const s = summarizeFlagAges(flags, Date.now(), DWELL_BOUND_DAYS);
console.log(`flag-age-audit: ${s.total} open flag(s); bound ${DWELL_BOUND_DAYS}d.`);
console.log(`  RD-28-held (exempt, valid long-dwell): ${s.exemptHeldCount}`);
console.log(`  past-bound (non-exempt, >${DWELL_BOUND_DAYS}d): ${s.pastBoundCount}`);
const mech = Object.entries(s.byMechanism).sort((a, b) => b[1] - a[1]);
for (const [m, n] of mech) console.log(`    ${m}: ${n}`);
for (const r of s.pastBound.slice(0, 40)) console.error(`  [PAST-BOUND] flag ${r.id} created_by=${r.created_by} subject=${r.subject_type}:${r.subject_ref} age=${r.ageDays}d`);

if (s.pastBoundCount === 0) { console.log("flag-age-audit: OK — no non-exempt past-bound open flags."); process.exit(0); }
console.error(`\nflag-age-audit: ${s.pastBoundCount} non-exempt open flag(s) past the ${DWELL_BOUND_DAYS}d dwell bound — enqueue a disposition (never a blind write). RD-28-held flags are exempt (valid long-dwell).`);
process.exit(1);
