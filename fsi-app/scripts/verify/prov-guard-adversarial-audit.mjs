/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILL: remediation-discipline.
 *  ADVERSARIAL PROOF — the #43 provenance-verified binding (migration 250).
 *
 *  WHY THIS EXISTS (the class-4 gap, operator-directed 2026-08-09). Migration 118's binding was
 *  "verified" by a build script that checked the guard triggers EXISTED and were ENABLED
 *  (scripts/phase2-build-binding.mjs). They existed, they were enabled, and the guard was defeatable
 *  with a single `SELECT set_config('app.prov_flip_origin','INSERT',true)` — plus it never fired on
 *  the dominant quarantined->verified escalation at all. A presence check cannot catch a logic hole.
 *  The standing lesson: a security-critical invariant is not proven by asserting its enforcement
 *  object is present; it is proven by ATTACKING it and showing the attack fails. This file is that
 *  attack, wired into the hard data-audit lane so the binding is re-attacked on every run — a
 *  regression that reopens the hole turns the lane RED.
 *
 *  WHAT IT PROVES (every case runs inside a transaction that is ALWAYS rolled back — zero writes
 *  persist; the audit never mutates the live corpus):
 *    A. forged-GUC escalation DENIED   — set_config(origin) + direct quarantined->verified must RAISE
 *    B. direct unverified->verified DENIED
 *    C. INSERT..ON CONFLICT DO UPDATE escalation DENIED (the mig-118 BEFORE-INSERT-stamp bypass)
 *    D. restrictive flip unverified->quarantined ALLOWED (the reconciler-wedge is dissolved)
 *    E. the legitimate derivation path still reaches 'verified' at depth>=2 (guard is not a brick wall)
 *
 *  Case E is the both-directions proof the operator asked for: the guard must DENY forgery AND
 *  PERMIT the real validation path, or it has broken generation. E drives a real item through the
 *  set_provenance_status derivation (touch-and-derive) and asserts the depth>=2 write is allowed;
 *  it is SKIP (not FAIL) only if no corpus item currently validates clean, which is a corpus state,
 *  not a guard defect.
 *
 *  Three states (0/1/2, the sibling-audit convention): exit 0 = every case behaved correctly;
 *  exit 1 = at least one case behaved wrongly (REPORTED, fails the hard lane); exit 2 = no DB creds /
 *  engine error (cannot verify). Read-only in EFFECT (all probes roll back). pg-direct via the pooler. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { connectPg } from "../lib/pg-conn.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env from secrets */ }

// Shared resolver (scripts/lib/pg-conn.mjs): env URL -> local .temp link -> CI-derived pooler candidates.
const client = await connectPg();
if (!client) {
  console.error("prov-guard-adversarial-audit: no direct-Postgres connection (SUPABASE_DB_URL/DATABASE_URL, local supabase link + SUPABASE_DB_PASSWORD, or NEXT_PUBLIC_SUPABASE_URL-derived pooler). Cannot verify — exit 2.");
  process.exit(2);
}

// SQLSTATE the guard raises. Node-postgres reports error.code as the five-character SQLSTATE ('42501'),
// NEVER the condition name ('insufficient_privilege') — comparing against the name classified every
// correct denial as ERROR on the lane's first real run (#66, 2026-08-11: probe C's log line showed the
// guard denying exactly as designed while the harness scored it ERROR). Lane-diagnosis fix.
const DENY = "42501";
const results = [];

/** Run one probe inside BEGIN..ROLLBACK. `expect` is 'deny' | 'allow'.
 *  For 'deny': PASS iff the probe raises SQLSTATE 42501. For 'allow': PASS iff it does NOT raise. */
async function probe(label, expect, sql, params = [], pre = []) {
  await client.query("BEGIN");
  try {
    // pre-statements run INSIDE the probe transaction, each as its own query — a multi-statement string
    // with bind params is rejected by the extended protocol (42601 'cannot insert multiple commands into
    // a prepared statement'), which is exactly how probe A crashed on the lane's first real run (#66).
    for (const p of pre) await client.query(p);
    await client.query(sql, params);
    // no error
    results.push({ label, verdict: expect === "allow" ? "PASS" : "FAIL", note: expect === "allow" ? "" : "expected denial, write was allowed" });
  } catch (e) {
    if (e.code === DENY) {
      results.push({ label, verdict: expect === "deny" ? "PASS" : "FAIL", note: expect === "deny" ? "" : `unexpected denial: ${e.message.split("\n")[0]}` });
    } else {
      results.push({ label, verdict: "ERROR", note: `${e.code || "?"}: ${(e.message || "").split("\n")[0]}` });
    }
  } finally {
    await client.query("ROLLBACK");
  }
}

try {
  const pick = async (status) =>
    (await client.query(
      `SELECT id FROM public.intelligence_items WHERE provenance_status=$1 AND NOT is_archived ORDER BY id LIMIT 1`,
      [status],
    )).rows[0]?.id ?? null;

  const qId = await pick("quarantined");
  const uId = await pick("unverified");

  // A — forged GUC + direct escalation (the exact mig-118 exploit). Needs a quarantined row.
  if (qId) {
    await probe("A forged-GUC quarantined->verified DENIED", "deny",
      `UPDATE public.intelligence_items SET provenance_status='verified' WHERE id=$1`, [qId],
      [`SELECT set_config('app.prov_flip_origin','INSERT',true)`]);

    // C — ON CONFLICT DO UPDATE escalation. Build the column list dynamically (skip generated cols).
    const cols = (await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='intelligence_items' AND is_generated='NEVER'
        ORDER BY ordinal_position`)).rows.map((r) => `"${r.column_name}"`).join(",");
    await probe("C on-conflict-do-update escalation DENIED", "deny",
      `INSERT INTO public.intelligence_items (${cols})
       SELECT ${cols} FROM public.intelligence_items WHERE id=$1
       ON CONFLICT (id) DO UPDATE SET provenance_status='verified'`, [qId]);
  } else {
    results.push({ label: "A forged-GUC quarantined->verified DENIED", verdict: "SKIP", note: "no quarantined rows" });
    results.push({ label: "C on-conflict-do-update escalation DENIED", verdict: "SKIP", note: "no quarantined rows" });
  }

  // B — direct unverified->verified. D — restrictive unverified->quarantined (must be allowed).
  if (uId) {
    await probe("B direct unverified->verified DENIED", "deny",
      `UPDATE public.intelligence_items SET provenance_status='verified' WHERE id=$1`, [uId]);
    await probe("D restrictive unverified->quarantined ALLOWED", "allow",
      `UPDATE public.intelligence_items SET provenance_status='quarantined' WHERE id=$1`, [uId]);
  } else {
    results.push({ label: "B direct unverified->verified DENIED", verdict: "SKIP", note: "no unverified rows" });
    results.push({ label: "D restrictive unverified->quarantined ALLOWED", verdict: "SKIP", note: "no unverified rows" });
  }

  // E — the legitimate derivation path must still reach 'verified' at depth>=2. Find an item that
  // validate_item_provenance currently recommends 'verified' for, force a re-derive by touching
  // updated_at, and assert it lands verified (the guard permitted the depth>=2 write).
  const eId = (await client.query(
    `SELECT id FROM public.intelligence_items i
      WHERE NOT is_archived
        AND (public.validate_item_provenance(i.id)).recommended_status = 'verified'
      ORDER BY id LIMIT 1`)).rows[0]?.id ?? null;
  if (eId) {
    await client.query("BEGIN");
    try {
      // Move it OFF verified (downgrade is open), then touch to re-derive; the derivation must
      // re-stamp it 'verified' at depth>=2 despite the guard.
      await client.query(`UPDATE public.intelligence_items SET provenance_status='unverified' WHERE id=$1`, [eId]);
      await client.query(`UPDATE public.intelligence_items SET updated_at=now() WHERE id=$1`, [eId]);
      const back = (await client.query(`SELECT provenance_status FROM public.intelligence_items WHERE id=$1`, [eId])).rows[0]?.provenance_status;
      results.push({ label: "E derivation path reaches verified (depth>=2) ALLOWED", verdict: back === "verified" ? "PASS" : "FAIL", note: back === "verified" ? "" : `re-derived to '${back}', expected 'verified'` });
    } catch (e) {
      results.push({ label: "E derivation path reaches verified (depth>=2) ALLOWED", verdict: "FAIL", note: `${e.code || "?"}: ${(e.message || "").split("\n")[0]}` });
    } finally {
      await client.query("ROLLBACK");
    }
  } else {
    results.push({ label: "E derivation path reaches verified (depth>=2) ALLOWED", verdict: "SKIP", note: "no item currently validates clean" });
  }
} catch (e) {
  console.error(`prov-guard-adversarial-audit: engine error — ${e.message}`);
  process.exit(2);
} finally {
  await client.end();
}

console.log("──────── #43 provenance-verified binding — adversarial proof ────────");
for (const r of results) console.log(`  ${r.verdict.padEnd(5)} ${r.label}${r.note ? "  — " + r.note : ""}`);

const failed = results.filter((r) => r.verdict === "FAIL" || r.verdict === "ERROR");
if (failed.length) {
  console.log(`\nPROV-GUARD ADVERSARIAL FAIL: ${failed.map((r) => r.label).join("; ")}`);
  process.exit(1);
}
console.log("\nPROV-GUARD ADVERSARIAL GREEN: every attack denied, every legitimate path allowed.");
process.exit(0);
