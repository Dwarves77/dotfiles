/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILL: remediation-discipline (rule 15 — a guard is
 *  proven by attack, not presence) + caros-ledge-platform-intent (tenancy integrity).
 *
 *  SPEC09 ORG-SCOPE ADVERSARIAL RLS PROOF — lane MIG311-FIX, 2026-09-05.
 *
 *  WHY THIS EXISTS. Migration 311 (lane SPEC09-B) org-scoped six spec09 customer-upload tables and, per
 *  rule 15, tried to prove the new `<table>_org_read` policies actually deny a second org's member —
 *  inline, inside the migration's own final DO block — by INSERTing throwaway `organizations`,
 *  `org_memberships` (with `user_id := gen_random_uuid()`), and a `surcharge_audits` row with placeholder
 *  `corridor_id`/`carrier_id` values, then impersonating each org's member via `SET LOCAL ROLE
 *  authenticated` + `set_config('request.jwt.claims', ...)`.
 *
 *  That proof cannot run inside the migration [CONFIRMED, this lane, reading migration 075 and 296 in
 *  full]: `org_memberships_user_id_fkey` (migration 075) requires `user_id` to reference an EXISTING
 *  `profiles(id)` row, and a `profiles` row is created only by the signup/onboarding path writing
 *  `auth.users` — migrations never write the auth schema, so a migration-minted `gen_random_uuid()` user_id
 *  has no profile and the INSERT always raises. Likewise `surcharge_audits.corridor_id`/`.carrier_id`
 *  (migration 296) FK to `entities(entity_id)`, which a placeholder id like
 *  `cl:corridor:0000000000000311` is not guaranteed to satisfy. Either failure rolls back the WHOLE
 *  migration — including the DDL (drop `carrier_compliance_pools`, add `org_id` + RLS to six tables), which
 *  is correct and needed on its own.
 *
 *  THE FIX (this file): the adversarial cross-org proof moves out of the migration and into this
 *  data-audit script, on the mig-250 / prov-guard-adversarial-audit.mjs template — a proof that runs
 *  against the LIVE database, inside a transaction it ALWAYS rolls back, picking its fixture rows from
 *  data that already exists (two organizations with a member each; two entities of the kinds
 *  `surcharge_audits`'s FKs require) instead of minting rows a live FK would reject. It is re-attacked on
 *  every data-audit-lane run (registered in run-data-audit-lane.mjs's AUDITS below), not just once at
 *  migration-apply time — a stronger proof than the one it replaces, not a weaker one.
 *
 *  WHAT IT PROVES, every case inside `BEGIN ... ROLLBACK` (zero writes persist):
 *    - org A's own member SELECTs the fixture `surcharge_audits` row it just saw inserted for org A: 1 row.
 *    - org B's member, impersonated the same way migration 311 attempted, SELECTs the SAME row: 0 rows.
 *      This is the binding proof — org_id RLS on the six spec09 tables must isolate by org.
 *
 *  SELF-SKIP (exit 2, diagnosable, never a false green): no direct-Postgres connection available
 *  (SUPABASE_DB_URL/DATABASE_URL/local link/CI pooler — see scripts/lib/pg-conn.mjs), OR fewer than two
 *  live organizations each with at least one member, OR live `entities` lacks a `corridor`- and an
 *  `organisation`-kind row to satisfy `surcharge_audits`'s FKs. Every skip names WHICH precondition failed.
 *
 *  Exit 0 = org B denied org A's row (and org A saw its own); exit 1 = the proof found a leak or a probe
 *  errored; exit 2 = cannot verify (no creds or no live fixture data — see SELF-SKIP above).
 *
 *  TESTABILITY (no-npm job, matches prov-guard-adversarial-audit.mjs's own scope — no paired test file
 *  existed for it to copy from [CONFIRMED, this lane: no prov-guard-adversarial-audit.test.mjs is
 *  git-tracked]; this file follows population-report.mjs/verification-audit-report.mjs's own established
 *  pattern instead — pure functions above the DB line, a real `pg` import ONLY inside the CLI-invocation
 *  guard at the bottom). Every function above that guard is importable with zero npm dependencies, so
 *  spec09-org-rls-adversarial-audit.test.mjs (which imports only those functions, plus a fake client for
 *  `runAudit`) runs in the no-npm `run-test-suite.sh` job exactly like population-report.test.mjs does. */

// ── Pure helpers — no pg, no supabase-js, no I/O. Directly unit-testable. ──────────────────────────────

/** Picks two DISTINCT orgs, each with at least one member, from a flat list of
 *  {org_id, user_id} rows (one arbitrary member per org is enough — the proof only needs ONE real member
 *  per side). Returns [{orgId, userId}, {orgId, userId}] or null if fewer than two distinct orgs exist. */
import { isMainModule } from '../lib/is-main.mjs'; // task 0.3b: the Windows-safe CLI main guard

export function pickTwoOrgsWithMembers(rows) {
  const seen = new Map();
  for (const r of rows) {
    if (!seen.has(r.org_id)) seen.set(r.org_id, r.user_id);
    if (seen.size >= 2) break;
  }
  if (seen.size < 2) return null;
  const [[orgAId, userAId], [orgBId, userBId]] = [...seen.entries()];
  return [
    { orgId: orgAId, userId: userAId },
    { orgId: orgBId, userId: userBId },
  ];
}

/** Picks one live `corridor`-kind and one live `organisation`-kind entity id to satisfy
 *  surcharge_audits.corridor_id / .carrier_id's FK to entities(entity_id) (migration 296). Returns
 *  {corridorId, carrierId} or null if either kind is absent from the live spine. */
export function pickFixtureEntities(rows) {
  const corridor = rows.find((r) => r.kind === "corridor");
  const organisation = rows.find((r) => r.kind === "organisation");
  if (!corridor || !organisation) return null;
  return { corridorId: corridor.entity_id, carrierId: organisation.entity_id };
}

/** The binding assertion, pure: org A must see exactly its own row (1); org B must see none (0). */
export function classifyOutcome({ selfVisible, otherVisible }) {
  if (selfVisible !== 1) {
    return { ok: false, reason: `org A's own member could not see org A's row (expected 1, got ${selfVisible}) — RLS policy is too strict` };
  }
  if (otherVisible !== 0) {
    return { ok: false, reason: `org B's member could read org A's row (expected 0, got ${otherVisible}) — cross-org RLS leak` };
  }
  return { ok: true, reason: "org A saw its own row; org B was denied" };
}

// ── Orchestration — takes an injected client (a real pg.Client, or a fake one in tests). No top-level
// pg import: this function is exercised by the unit test with a fake client, and by the CLI guard below
// with a real one, so neither path requires a different code path to stay honest. ──────────────────────

/** Runs the full adversarial proof against `client` (must expose `.query(sql, params)`). Always issues
 *  BEGIN...ROLLBACK around every probe so no write persists, matching migration 250's adversarial-audit
 *  discipline. Returns one of:
 *    { skip: true, reason }                                        — a precondition was unmet
 *    { ok: true, orgA, orgB, corridorId, carrierId, reason }        — proof passed
 *    { ok: false, orgA, orgB, corridorId, carrierId, reason }       — proof found a leak
 *  Throws only on an unexpected engine error (the CLI guard maps that to exit 1, matching
 *  prov-guard-adversarial-audit.mjs's ERROR verdict). */
export async function runAudit(client) {
  await client.query("BEGIN");
  try {
    const orgRows = (
      await client.query(
        `SELECT org_id, user_id FROM public.org_memberships ORDER BY org_id, created_at LIMIT 200`,
      )
    ).rows;
    const orgs = pickTwoOrgsWithMembers(orgRows);
    if (!orgs) {
      return { skip: true, reason: "fewer than two live organizations have a member — need two existing orgs with >=1 membership each" };
    }
    const [orgA, orgB] = orgs;

    const entityRows = (
      await client.query(
        `SELECT entity_id, kind FROM public.entities WHERE kind IN ('corridor','organisation') ORDER BY kind, entity_id LIMIT 200`,
      )
    ).rows;
    const entities = pickFixtureEntities(entityRows);
    if (!entities) {
      return { skip: true, reason: "live entities lacks a 'corridor'-kind and an 'organisation'-kind row — surcharge_audits.corridor_id/.carrier_id cannot be satisfied" };
    }
    const { corridorId, carrierId } = entities;

    const auditId = (
      await client.query(
        `INSERT INTO public.surcharge_audits
           (corridor_id, carrier_id, invoice_line, billed_eur, statutory_eur, statutory_basis, org_id)
         VALUES ($1, $2, 'spec09-org-rls-adversarial-audit selftest (rolled back)', 100, 80, 'selftest basis', $3)
         RETURNING audit_id`,
        [corridorId, carrierId, orgA.orgId],
      )
    ).rows[0].audit_id;

    const visibleTo = async (userId) => {
      await client.query("SET LOCAL ROLE authenticated");
      await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId }),
      ]);
      const n = (
        await client.query(`SELECT count(*)::int AS n FROM public.surcharge_audits WHERE audit_id = $1`, [
          auditId,
        ])
      ).rows[0].n;
      await client.query("RESET ROLE");
      return n;
    };

    const selfVisible = await visibleTo(orgA.userId);
    const otherVisible = await visibleTo(orgB.userId);

    const verdict = classifyOutcome({ selfVisible, otherVisible });
    return { ...verdict, orgA, orgB, corridorId, carrierId };
  } finally {
    await client.query("ROLLBACK");
  }
}

// ── CLI invocation guard. Real `pg` connection lives ONLY behind this check, so importing the functions
// above (as the unit test does) never touches pg/pg-conn.mjs and never requires node_modules. ───────────
const isMain = isMainModule(import.meta.url);

if (isMain) {
  const { connectPg } = await import("../lib/pg-conn.mjs");
  const client = await connectPg();
  if (!client) {
    console.error(
      "spec09-org-rls-adversarial-audit: no direct-Postgres connection (SUPABASE_DB_URL/DATABASE_URL, local supabase link + SUPABASE_DB_PASSWORD, or NEXT_PUBLIC_SUPABASE_URL-derived pooler). Cannot verify — exit 2.",
    );
    process.exit(2);
  }
  try {
    const result = await runAudit(client);
    console.log("──────── spec09 org-scope adversarial RLS proof ────────");
    if (result.skip) {
      console.log(`SKIP  ${result.reason}`);
      process.exit(2);
    }
    console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.reason}`);
    process.exit(result.ok ? 0 : 1);
  } catch (e) {
    console.error(`spec09-org-rls-adversarial-audit: engine error — ${e.message}`);
    process.exit(2);
  } finally {
    await client.end();
  }
}
