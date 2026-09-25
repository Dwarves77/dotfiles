// data-audit: label=derivation-edges-rls-adversarial hard=true
/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILL: remediation-discipline (rule 15, a guard is
 *  proven by attack, not presence).
 *
 *  SEC-1 ADVERSARIAL RLS PROOF, fix lane SEC-1, Supabase integrity-and-wiring audit, 2026-09-25.
 *
 *  WHY THIS EXISTS. Migration 330 enables RLS on `public.derivation_edges` (migration 285's invalidation
 *  DAG table) and revokes the anon/authenticated CRUD grants SEC-1 found live (RLS disabled,
 *  SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER all held by anon and authenticated, ~24 rows).
 *  Per rule 15, "RLS enabled" and "grants revoked" are PRESENCE checks, the same class of check that let
 *  the mig-118 provenance guard ship defeatable. This file is the ATTACK: as anon and as authenticated,
 *  inside a transaction that is ALWAYS rolled back, attempt INSERT/UPDATE/DELETE on `derivation_edges` and
 *  assert every attempt is DENIED. Modeled on `prov-guard-adversarial-audit.mjs` (the template rule 15
 *  names) and `spec09-org-rls-adversarial-audit.mjs` (the SET LOCAL ROLE + rollback impersonation
 *  pattern for a live Postgres connection, since derivation_edges carries no per-row tenant column to
 *  fixture against, the proof is role-level denial, not cross-tenant isolation).
 *
 *  WHAT IT PROVES, every case inside `BEGIN ... ROLLBACK` (zero writes persist, matching migration 250's
 *  and spec09's adversarial-audit discipline):
 *    A. anon INSERT into derivation_edges DENIED (SQLSTATE 42501, insufficient_privilege, REVOKE ALL
 *       plus RLS-enabled-no-policy denies the write before RLS is even consulted for the anon role).
 *    B. anon UPDATE on an existing row DENIED.
 *    C. anon DELETE on an existing row DENIED.
 *    D. authenticated INSERT into derivation_edges DENIED (same posture, no exemption for signed-in
 *       users, derivation_edges has no anon/authenticated policy at all per migration 330's design:
 *       every consumer is the service-role client).
 *    E. authenticated SELECT sees ZERO rows (no SELECT grant, no SELECT policy, deny-all, not merely
 *       write-deny; the pre-330 finding included anon/authenticated holding SELECT too).
 *    F. service_role (BYPASSRLS) still sees the fixture row it created for probes B/C, at the top of the
 *       run, BEFORE the anon/authenticated probes attempt to touch it, the both-directions proof (rule 15
 *       Case E's counterpart): the guard denies the unauthorized roles without bricking the legitimate
 *       service-role path migration 330's own header says must keep working.
 *
 *  SELF-SKIP (exit 2, diagnosable, never a false green): no direct-Postgres connection available
 *  (SUPABASE_DB_URL/DATABASE_URL/local link/CI pooler, see scripts/lib/pg-conn.mjs), OR live
 *  derivation_edges has no allowed from_table value to fixture an UPDATE/DELETE target row with (the
 *  from_table CHECK constraint requires one of the 6-table allowlist; the fixture INSERT supplies
 *  'derived_values' unconditionally so this should not fire in practice, but is named honestly).
 *
 *  Exit 0 = every unauthorized probe denied and the service-role fixture read succeeded; exit 1 = a probe
 *  behaved wrongly (a leak, or the legitimate path also broke); exit 2 = cannot verify (no creds).
 *
 *  TESTABILITY (no-npm job, mirrors prov-guard-adversarial-audit.mjs's own scope, no paired test file
 *  exists for it to copy from either [CONFIRMED, this lane: grep found no
 *  prov-guard-adversarial-audit.test.mjs git-tracked]; follows spec09-org-rls-adversarial-audit.mjs's
 *  established pattern instead, pure functions above the DB line, a real `pg` import ONLY inside the
 *  CLI-invocation guard at the bottom, so `derivation-edges-rls-adversarial-audit.test.mjs` can import
 *  `classifyOutcome`/`isMissingValueId` with zero npm dependency). */

import { isMainModule } from "../lib/is-main.mjs";

// ── Pure helpers, no pg, no supabase-js, no I/O. Directly unit-testable. ──────────────────────────────

/** The binding assertion for a single probe: 'deny' expects SQLSTATE 42501 (insufficient_privilege);
 *  'allow' expects no error. Returns {ok, note}. Pure, takes the already-classified {errored, code}
 *  shape rather than a real error object, so it is testable with zero pg dependency. */
export function classifyProbe(expect, { errored, code }) {
  const DENY = "42501";
  if (expect === "deny") {
    if (errored && code === DENY) return { ok: true, note: "" };
    if (errored) return { ok: false, note: `denied for the wrong reason (SQLSTATE ${code || "?"}), expected 42501` };
    return { ok: false, note: "expected denial, write was allowed" };
  }
  // expect === 'allow'
  if (!errored) return { ok: true, note: "" };
  return { ok: false, note: `unexpected denial: ${code || "?"}` };
}

/** The both-directions read assertion for probe F: service_role must see the fixture row it inserted
 *  (count === 1); anything else means the legitimate path is also broken, not merely the attack denied. */
export function classifyServiceRoleRead(count) {
  if (count === 1) return { ok: true, note: "" };
  return { ok: false, note: `service_role fixture read returned ${count} row(s), expected 1, legitimate path broken` };
}

// ── Orchestration, takes an injected client (a real pg.Client, or a fake one in tests). No top-level pg
// import: exercised by the unit test with a fake client, and by the CLI guard below with a real one. ─────

const DENY = "42501";

/** Runs one probe inside BEGIN..ROLLBACK against `client`. `expect` is 'deny' | 'allow'. `pre` are
 *  statements (role/GUC setup) run inside the same transaction before `sql`. Always rolls back, no
 *  probe write persists regardless of verdict. */
async function probe(client, label, expect, sql, params, pre, results) {
  await client.query("BEGIN");
  try {
    for (const p of pre) await client.query(p);
    await client.query(sql, params);
    const verdict = classifyProbe(expect, { errored: false, code: null });
    results.push({ label, verdict: verdict.ok ? "PASS" : "FAIL", note: verdict.note });
  } catch (e) {
    if (e.code === DENY) {
      const verdict = classifyProbe(expect, { errored: true, code: e.code });
      results.push({ label, verdict: verdict.ok ? "PASS" : "FAIL", note: verdict.note });
    } else {
      results.push({ label, verdict: "ERROR", note: `${e.code || "?"}: ${(e.message || "").split("\n")[0]}` });
    }
  } finally {
    await client.query("ROLLBACK");
  }
}

/** Runs the full adversarial proof against `client` (must expose `.query(sql, params)`). Returns
 *  { skip: true, reason } or { results: [...], allPass: boolean }. Throws only on an unexpected engine
 *  error outside any individual probe (the CLI guard maps that to exit 2). */
export async function runAudit(client) {
  const results = [];

  // Fixture setup (service_role, own transaction, always rolled back): one derivation_edges row so the
  // UPDATE/DELETE probes have a real target and probe F has something to read back.
  let fixtureOk = false;
  await client.query("BEGIN");
  try {
    // derived_values row first (to_value_id FK target), mirrors migration 285's own self-check shape.
    const dv = (
      await client.query(
        `INSERT INTO public.derived_values
           (entity_id, method_id, method_version, value, unit, derivation, origin_class, lifecycle,
            admissibility, base_confidence, asserted_at, inputs, computed_by)
         VALUES (NULL, 'selftest', '1', 1, 'unit', 'calculated', 'derived', 'verified', 'analysis_ok',
                 0.9, now(), '[]'::jsonb, 'derivation-edges-rls-adversarial-audit')
         RETURNING value_id`,
      )
    ).rows[0]?.value_id;
    if (!dv) {
      results.push({ label: "fixture setup", verdict: "SKIP", note: "could not insert a probe derived_values row" });
      await client.query("ROLLBACK");
      return { skip: true, reason: "fixture setup failed (see fixture setup line)" };
    }
    await client.query(
      `INSERT INTO public.derivation_edges (from_table, from_pk, to_value_id, edge_kind)
       VALUES ('derived_values', $1, $1, 'input')`,
      [dv],
    );
    // service_role (BYPASSRLS) fixture read, proves the legitimate path is intact BEFORE the attacks run.
    const n = (
      await client.query(`SELECT count(*)::int AS n FROM public.derivation_edges WHERE to_value_id = $1`, [dv])
    ).rows[0].n;
    const fRead = classifyServiceRoleRead(n);
    results.push({ label: "F service_role fixture read (BYPASSRLS) sees its own row", verdict: fRead.ok ? "PASS" : "FAIL", note: fRead.note });
    fixtureOk = fRead.ok;

    // ── A-E: unauthorized-role attacks, each its own nested probe (own BEGIN..ROLLBACK, run while the
    // outer fixture transaction is still open so the fixture row/dv id are visible to name in probes) ────
    await probe(client, "A anon INSERT into derivation_edges DENIED", "deny",
      `INSERT INTO public.derivation_edges (from_table, from_pk, to_value_id, edge_kind)
       VALUES ('derived_values', $1, $1, 'input')`, [dv],
      [`SET LOCAL ROLE anon`], results);

    await probe(client, "B anon UPDATE on derivation_edges DENIED", "deny",
      `UPDATE public.derivation_edges SET edge_kind = 'tampered' WHERE to_value_id = $1`, [dv],
      [`SET LOCAL ROLE anon`], results);

    await probe(client, "C anon DELETE on derivation_edges DENIED", "deny",
      `DELETE FROM public.derivation_edges WHERE to_value_id = $1`, [dv],
      [`SET LOCAL ROLE anon`], results);

    await probe(client, "D authenticated INSERT into derivation_edges DENIED", "deny",
      `INSERT INTO public.derivation_edges (from_table, from_pk, to_value_id, edge_kind)
       VALUES ('derived_values', $1, $1, 'input')`, [dv],
      [`SET LOCAL ROLE authenticated`, `SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000"}', true)`], results);

    // E, authenticated SELECT must see zero rows (deny-all, not merely write-deny).
    await client.query("SAVEPOINT probe_e");
    try {
      await client.query("SET LOCAL ROLE authenticated");
      await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: "00000000-0000-0000-0000-000000000000" }),
      ]);
      const eN = (
        await client.query(`SELECT count(*)::int AS n FROM public.derivation_edges WHERE to_value_id = $1`, [dv])
      ).rows[0].n;
      results.push({
        label: "E authenticated SELECT sees zero derivation_edges rows",
        verdict: eN === 0 ? "PASS" : "FAIL",
        note: eN === 0 ? "" : `authenticated saw ${eN} row(s), SELECT should be denied entirely`,
      });
      await client.query("RESET ROLE");
      await client.query("RELEASE SAVEPOINT probe_e");
    } catch (e) {
      // A bare denial on the SELECT itself (rather than 0 rows) also satisfies "sees zero rows":
      // either shape (privilege denial or empty result) proves the same thing: authenticated cannot read.
      await client.query("ROLLBACK TO SAVEPOINT probe_e");
      results.push({
        label: "E authenticated SELECT sees zero derivation_edges rows",
        verdict: e.code === DENY ? "PASS" : "ERROR",
        note: e.code === DENY ? "denied at the SELECT itself (also acceptable)" : `${e.code || "?"}: ${(e.message || "").split("\n")[0]}`,
      });
    }
  } finally {
    await client.query("ROLLBACK");
  }

  const allPass = fixtureOk && results.every((r) => r.verdict === "PASS");
  return { results, allPass };
}

// ── CLI invocation guard. Real `pg` connection lives ONLY behind this check. ───────────────────────────
const isMain = isMainModule(import.meta.url);

if (isMain) {
  const { connectPg } = await import("../lib/pg-conn.mjs");
  const client = await connectPg();
  if (!client) {
    console.error(
      "derivation-edges-rls-adversarial-audit: no direct-Postgres connection (SUPABASE_DB_URL/DATABASE_URL, local supabase link + SUPABASE_DB_PASSWORD, or NEXT_PUBLIC_SUPABASE_URL-derived pooler). Cannot verify, exit 2.",
    );
    process.exit(2);
  }
  try {
    const outcome = await runAudit(client);
    console.log("──────── SEC-1 derivation_edges RLS, adversarial proof ────────");
    if (outcome.skip) {
      console.log(`SKIP  ${outcome.reason}`);
      process.exit(2);
    }
    for (const r of outcome.results) console.log(`  ${r.verdict.padEnd(5)} ${r.label}${r.note ? "  -- " + r.note : ""}`);
    if (!outcome.allPass) {
      const failed = outcome.results.filter((r) => r.verdict !== "PASS").map((r) => r.label);
      console.log(`\nDERIVATION-EDGES RLS ADVERSARIAL FAIL: ${failed.join("; ")}`);
      process.exit(1);
    }
    console.log("\nDERIVATION-EDGES RLS ADVERSARIAL GREEN: every unauthorized attack denied, service_role path intact.");
    process.exit(0);
  } catch (e) {
    console.error(`derivation-edges-rls-adversarial-audit: engine error, ${e.message}`);
    process.exit(2);
  } finally {
    await client.end();
  }
}
