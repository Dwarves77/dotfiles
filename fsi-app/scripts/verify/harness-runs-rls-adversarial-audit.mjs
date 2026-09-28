// data-audit: label=harness-runs-rls-adversarial hard=true
// SHARED-WRITER: harness_runs
/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILL: remediation-discipline (rule 15, a guard is
 *  proven by attack, not presence).
 *
 *  Migration 331 creates `public.harness_runs` (lane HARNESS-LANDING, 2026-09-27) locked down at
 *  creation per the SEC-1 posture (migration 330, derivation_edges): RLS enabled, anon/authenticated
 *  grants revoked, no policies, service-role only. Per rule 15, "RLS enabled" and "grants revoked" are
 *  PRESENCE checks, the same class of check that let the mig-118 provenance guard ship defeatable. This
 *  file is the ATTACK: as anon and as authenticated, inside a transaction that is ALWAYS rolled back,
 *  attempt INSERT/UPDATE/DELETE/SELECT on `harness_runs` and assert every attempt is DENIED. The
 *  transactional probe primitives (`probe`/`classifyProbe`/`classifyServiceRoleRead`/the CLI bootstrap)
 *  are shared with `derivation-edges-rls-adversarial-audit.mjs` (the SEC-1 template) via
 *  `scripts/verify/lib/rls-adversarial-probe.mjs` -- extracted, not copied, after F45's duplicate-code
 *  ratchet caught a near-verbatim copy landing on this lane's branch.
 *
 *  WHAT IT PROVES, every case inside `BEGIN ... ROLLBACK` (zero writes persist):
 *    A. anon INSERT into harness_runs DENIED (SQLSTATE 42501, insufficient_privilege).
 *    B. anon UPDATE on an existing row DENIED.
 *    C. anon DELETE on an existing row DENIED.
 *    D. authenticated INSERT into harness_runs DENIED (no exemption for signed-in users; harness_runs
 *       has no anon/authenticated policy at all -- every consumer is the service-role client).
 *    E. authenticated SELECT sees ZERO rows (deny-all, not merely write-deny).
 *    F. service_role (BYPASSRLS) still sees the fixture row it created for probes B/C, at the top of
 *       the run, BEFORE the anon/authenticated probes attempt to touch it (the both-directions proof:
 *       the guard denies the unauthorized roles without bricking the legitimate service-role path
 *       record-harness-run.mjs depends on).
 *
 *  SELF-SKIP (exit 2, diagnosable, never a false green): no direct-Postgres connection available
 *  (SUPABASE_DB_URL/DATABASE_URL/local link/CI pooler, see scripts/lib/pg-conn.mjs), OR
 *  `public.harness_runs` does not exist yet.
 *
 *  Exit 0 = every unauthorized probe denied and the service-role fixture read succeeded; exit 1 = a
 *  probe behaved wrongly (a leak, or the legitimate path also broke); exit 2 = cannot verify (no creds,
 *  or table not migrated yet). */

import { isMainModule } from "../lib/is-main.mjs";
import { probe, classifyServiceRoleRead, runAdversarialCli } from "./lib/rls-adversarial-probe.mjs";

/** Runs the full adversarial proof against `client` (must expose `.query(sql, params)`). Returns
 *  { skip: true, reason } or { results: [...], allPass: boolean }. */
export async function runAudit(client) {
  const results = [];

  const exists = (
    await client.query(`SELECT to_regclass('public.harness_runs') IS NOT NULL AS ok`)
  ).rows[0]?.ok;
  if (!exists) {
    return { skip: true, reason: "public.harness_runs does not exist (migration 331 not applied yet)" };
  }

  let fixtureOk = false;
  await client.query("BEGIN");
  try {
    const runId = `harness-runs-rls-adversarial-fixture-${Date.now()}`;
    await client.query(
      `INSERT INTO public.harness_runs (run_id, harness_family, started_at)
       VALUES ($1, 'meta-harness', now())`,
      [runId],
    );
    const n = (
      await client.query(`SELECT count(*)::int AS n FROM public.harness_runs WHERE run_id = $1`, [runId])
    ).rows[0].n;
    const fRead = classifyServiceRoleRead(n);
    results.push({ label: "F service_role fixture read (BYPASSRLS) sees its own row", verdict: fRead.ok ? "PASS" : "FAIL", note: fRead.note });
    fixtureOk = fRead.ok;

    await probe(client, "A anon INSERT into harness_runs DENIED", "deny",
      `INSERT INTO public.harness_runs (run_id, harness_family, started_at)
       VALUES ($1, 'meta-harness', now())`, [`${runId}-a`],
      [`SET LOCAL ROLE anon`], results);

    await probe(client, "B anon UPDATE on harness_runs DENIED", "deny",
      `UPDATE public.harness_runs SET harness_version = 'tampered' WHERE run_id = $1`, [runId],
      [`SET LOCAL ROLE anon`], results);

    await probe(client, "C anon DELETE on harness_runs DENIED", "deny",
      `DELETE FROM public.harness_runs WHERE run_id = $1`, [runId],
      [`SET LOCAL ROLE anon`], results);

    await probe(client, "D authenticated INSERT into harness_runs DENIED", "deny",
      `INSERT INTO public.harness_runs (run_id, harness_family, started_at)
       VALUES ($1, 'meta-harness', now())`, [`${runId}-d`],
      [`SET LOCAL ROLE authenticated`, `SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000"}', true)`], results);

    await client.query("SAVEPOINT probe_e");
    try {
      await client.query("SET LOCAL ROLE authenticated");
      await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: "00000000-0000-0000-0000-000000000000" }),
      ]);
      const eN = (
        await client.query(`SELECT count(*)::int AS n FROM public.harness_runs WHERE run_id = $1`, [runId])
      ).rows[0].n;
      results.push({
        label: "E authenticated SELECT sees zero harness_runs rows",
        verdict: eN === 0 ? "PASS" : "FAIL",
        note: eN === 0 ? "" : `authenticated saw ${eN} row(s), SELECT should be denied entirely`,
      });
      await client.query("RESET ROLE");
      await client.query("RELEASE SAVEPOINT probe_e");
    } catch (e) {
      await client.query("ROLLBACK TO SAVEPOINT probe_e");
      results.push({
        label: "E authenticated SELECT sees zero harness_runs rows",
        verdict: e.code === "42501" ? "PASS" : "ERROR",
        note: e.code === "42501" ? "denied at the SELECT itself (also acceptable)" : `${e.code || "?"}: ${(e.message || "").split("\n")[0]}`,
      });
    }
  } finally {
    await client.query("ROLLBACK");
  }

  const allPass = fixtureOk && results.every((r) => r.verdict === "PASS");
  return { results, allPass };
}

// ── CLI invocation guard. Real `pg` connection lives ONLY behind this check. ───────────────────────────
if (isMainModule(import.meta.url)) {
  await runAdversarialCli({ title: "harness_runs RLS, adversarial proof", runAudit });
}
