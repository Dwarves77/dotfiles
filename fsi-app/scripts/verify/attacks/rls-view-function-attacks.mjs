#!/usr/bin/env node
// rls-view-function-attacks.mjs -- the views and functions leg of the RLS attack (lane TESTS-2, 2026-10-10;
// docs/audits/aud-at1-rls-grants-attacked-2026-10-08.md section 4 item 6, CLAUDE.md rule 15).
//
// AUD-AT-1 enumerated tables, column privileges and policies. Its item 6 left the 6 views and the function EXECUTE grants
// outside the enumerator and named the census probes A, B and C (derived_values_admissible, research_assessments_current,
// admin_set_judgement_drain) as not run. Migration 369 (SEC-3a) closed them; this file attacks the result on the
// disposable local stack, in the attack engine's step shape (scripts/proof/attacks/attack-engine.mjs: "attack" steps are
// refused, "control" steps still work, every attack runs in a transaction that is always rolled back):
//
//   RLS-VF-VIEWS-INVOKER      every public view runs as its invoker (reloptions security_invoker=true). A view that runs as
//                             its owner skips the base table's RLS, which is how the deliberately read-only pollution
//                             barrier (RD-56) became a write door before migration 369.
//   RLS-VF-VIEWS-READ         anon and each signed-in persona read zero rows or are refused from derived_values_admissible
//                             and research_assessments_current (probes A and B); the service role still reads them.
//   RLS-VF-VIEWS-WRITE        no view accepts INSERT, UPDATE or DELETE from anon or authenticated.
//   RLS-VF-FUNCTIONS-EXECUTE  the system-only writers (probe C admin_set_judgement_drain, admin_set_pause_state,
//                             item_corrections_note, item_corrections_patch, publish_aggregate) hold no EXECUTE for anon or
//                             authenticated and still hold it for service_role; calling the two flag writers as anon and as
//                             an org member is refused 42501.
//   RLS-VF-CENSUS             not an invariant: counts of the SECURITY DEFINER functions anon can execute, and of those
//                             without a pinned search_path, so the next run's report shows the surface the next lane attacks.
//
// The persona fixtures are the matrix's (scripts/verify/fixtures/rls-personas.mjs). LOCAL ONLY: refuses (exit 2) unless the
// environment is the local stack's. Exit: 0 every attack held; 1 one did not; 2 cannot run.
//
// Usage: node scripts/verify/attacks/rls-view-function-attacks.mjs [--out-dir <dir>]   (default CP_OUT_DIR)

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { isMainModule } from "../../lib/is-main.mjs";
import { runSqlAttack } from "../../proof/attacks/attack-engine.mjs";
import { assertLocalOnly } from "../../proof/attacks/run-attacks.mjs";
import { personaContext, setupPersonaFixtures, teardownPersonaFixtures } from "../fixtures/rls-personas.mjs";

const firstLine = (s, max = 200) => String(s ?? "").split("\n")[0].slice(0, max);

export const GUARDED_VIEWS = Object.freeze(["derived_values_admissible", "research_assessments_current"]);
export const SYSTEM_ONLY_FUNCTIONS = Object.freeze([
  "admin_set_judgement_drain", "admin_set_pause_state", "item_corrections_note", "item_corrections_patch", "publish_aggregate",
]);
const PERSONA_ROLES = Object.freeze([["anon", "P1"], ["user:viewer_a", "P2"], ["user:member_b", "P3"], ["user:member_a", "P4"]]);
const FN_LIST = SYSTEM_ONLY_FUNCTIONS.map((f) => `'${f}'`).join(", ");
const FN_FROM = `FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace WHERE ns.nspname = 'public' AND p.proname = ANY(ARRAY[${FN_LIST}])`;

const GUARDED_LIST = GUARDED_VIEWS.map((v) => `'${v}'`).join(", ");
// Postgres stores the reloption in the spelling it was set with: migration 369 sets security_invoker = on (stored as
// security_invoker=on), earlier migrations set = true. Both mean the same; migration 369 checks the same regular expression.
const INVOKER_OPT = "EXISTS (SELECT 1 FROM unnest(coalesce(c.reloptions, ARRAY[]::text[])) o WHERE o ~ '^security_invoker=(on|true)$')";
/** Census, not an invariant: every public view other than the guarded ones that does NOT run as its invoker. Names are catalog
 *  metadata (a view name), printed so the next lane (SEC-10) decides per view; no row value is ever read. */
export const OWNER_RUN_VIEWS_SQL = `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname = 'public' AND c.relkind = 'v' AND NOT (c.relname = ANY(ARRAY[${GUARDED_LIST}])) AND NOT ${INVOKER_OPT} ORDER BY c.relname`;

export const VIEW_FUNCTION_ATTACKS = Object.freeze([
  {
    id: "rls-vf-views-run-as-invoker",
    persona: "P1",
    invariant: "The two guarded views (the pollution barriers) run as the caller (security_invoker on), so reading or writing through them never skips the base table's row level security. Every other public view is a census line (OWNER_RUN_VIEWS_SQL), not a pass condition, until lane SEC-10 decides per view.",
    expected: "Both guarded views exist and carry security_invoker (reloption security_invoker=on or =true, the two spellings Postgres stores); the count lacking it is 0.",
    steps: [
      { label: "control: the catalog lists the public views", kind: "control", sql: "SELECT (count(*) >= 3) AS ok FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname = 'public' AND c.relkind = 'v'", expect: { equals: { ok: "true" } } },
      { label: "control: both guarded views exist", kind: "control", sql: `SELECT (count(*) = ${GUARDED_VIEWS.length}) AS ok FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname = 'public' AND c.relkind = 'v' AND c.relname = ANY(ARRAY[${GUARDED_LIST}])`, expect: { equals: { ok: "true" } } },
      { label: "attack: a guarded view that runs as its owner", kind: "attack", sql: `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname = 'public' AND c.relkind = 'v' AND c.relname = ANY(ARRAY[${GUARDED_LIST}]) AND NOT ${INVOKER_OPT}`, expect: { equals: { n: "0" } } },
    ],
  },
  {
    id: "rls-vf-views-read-denied",
    persona: "P1",
    invariant: "derived_values_admissible and research_assessments_current return no row to anon or to any signed-in persona, and are readable by the service role.",
    expected: "Each persona read is refused 42501 or returns 0 rows; the service role read succeeds.",
    steps: [
      ...GUARDED_VIEWS.flatMap((v) => PERSONA_ROLES.map(([as, id]) => ({
        label: `attack: ${id} reads ${v}`, kind: "attack", as, sql: `SELECT * FROM public.${v}`, expect: { denied_or_rows: 0 },
      }))),
      ...GUARDED_VIEWS.map((v) => ({ label: `control: the service role reads ${v}`, kind: "control", as: "service", sql: `SELECT count(*)::int AS n FROM public.${v}`, expect: { ok: true } })),
    ],
  },
  {
    id: "rls-vf-views-write-denied",
    persona: "P1",
    invariant: "No public view accepts INSERT, UPDATE or DELETE from anon or authenticated.",
    expected: "Each write through the pollution-barrier views is refused (42501, or 55000 for a view that is not updatable).",
    steps: GUARDED_VIEWS.flatMap((v) => PERSONA_ROLES.flatMap(([as, id]) => [
      { label: `attack: ${id} deletes through ${v}`, kind: "attack", as, sql: `DELETE FROM public.${v} WHERE false`, expect: { error: ["42501", "55000"] } },
      { label: `attack: ${id} inserts through ${v}`, kind: "attack", as, sql: `INSERT INTO public.${v} DEFAULT VALUES`, expect: { error: ["42501", "55000"] } },
    ])),
  },
  {
    id: "rls-vf-system-writers-not-executable",
    persona: "P1",
    invariant: "The system-only SECURITY DEFINER writers (admin_set_judgement_drain, admin_set_pause_state, item_corrections_note, item_corrections_patch, publish_aggregate) hold no EXECUTE for anon or authenticated, and the service role keeps it.",
    expected: "No signed-in or anonymous role can execute any of the five; the flag writers refuse an anonymous and an org member caller with 42501; the service role holds EXECUTE on every one that exists.",
    steps: [
      { label: "control: at least four of the five writers exist on the stack", kind: "control", sql: `SELECT count(*)::int AS n ${FN_FROM}`, expect: { rows: 1 } },
      { label: "control: the service role holds EXECUTE on every one that exists", kind: "control", sql: `SELECT (count(*) >= 4 AND count(*) = count(*) FILTER (WHERE has_function_privilege('service_role', p.oid, 'EXECUTE'))) AS ok ${FN_FROM}`, expect: { equals: { ok: "true" } } },
      { label: "attack: a writer executable by anon", kind: "attack", sql: `SELECT count(*)::int AS n ${FN_FROM} AND has_function_privilege('anon', p.oid, 'EXECUTE')`, expect: { equals: { n: "0" } } },
      { label: "attack: a writer executable by authenticated", kind: "attack", sql: `SELECT count(*)::int AS n ${FN_FROM} AND has_function_privilege('authenticated', p.oid, 'EXECUTE')`, expect: { equals: { n: "0" } } },
      { label: "attack: anon calls admin_set_judgement_drain", kind: "attack", as: "anon", sql: "SELECT public.admin_set_judgement_drain('rls-vf-probe', 'off')", expect: { error: "42501" } },
      { label: "attack: an org member calls admin_set_judgement_drain", kind: "attack", as: "user:member_a", sql: "SELECT public.admin_set_judgement_drain('rls-vf-probe', 'off')", expect: { error: "42501" } },
      { label: "attack: anon calls admin_set_pause_state", kind: "attack", as: "anon", sql: "SELECT public.admin_set_pause_state('rls-vf-probe', false, 'rls-vf-probe', NULL, false)", expect: { error: "42501" } },
      { label: "attack: an org member calls admin_set_pause_state", kind: "attack", as: "user:member_a", sql: "SELECT public.admin_set_pause_state('rls-vf-probe', false, 'rls-vf-probe', NULL, false)", expect: { error: "42501" } },
    ],
  },
  {
    id: "rls-vf-census",
    persona: "P1",
    invariant: "Census only, no invariant: the SECURITY DEFINER functions in public that anon can execute, and how many of them have no pinned search_path. The counts land in the report so the next lane attacks a known surface.",
    expected: "Both counts are read without error (the observed text carries the numbers).",
    steps: [
      { label: "census: SECURITY DEFINER functions anon can execute", kind: "control", sql: "SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace WHERE ns.nspname = 'public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')", expect: { ok: true } },
      { label: "census: of those, without a pinned search_path", kind: "control", sql: "SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace WHERE ns.nspname = 'public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT coalesce(p.proconfig::text ILIKE '%search_path%', false)", expect: { ok: true } },
    ],
  },
]);

/** The whole run against a connected client. Always tears the fixtures down. Returns the report. */
export async function runAll({ client, attacks = VIEW_FUNCTION_ATTACKS, now = () => new Date() }) {
  const report = { suite: "rls-view-function-attacks", started_at: now().toISOString(), finished_at: null, attacks: [], violations: [], owner_run_views: [] };
  try {
    await setupPersonaFixtures(client);
  } catch (e) {
    report.violations.push(`FIXTURES: the persona fixtures were not created (${firstLine(e.message)}); nothing was attacked`);
    report.finished_at = now().toISOString();
    return report;
  }
  try {
    const ctx = personaContext();
    for (const a of attacks) {
      let outcome;
      try {
        outcome = await runSqlAttack(client, a, ctx);
      } catch (e) {
        try { await client.query("ROLLBACK"); } catch { /* no open transaction */ }
        outcome = { status: "fail", observed: `engine error: ${firstLine(e.message)}` };
      }
      report.attacks.push({ id: a.id, persona: a.persona, invariant: a.invariant, status: outcome.status, observed: outcome.observed });
      if (outcome.status !== "pass") report.violations.push(`ATTACK ${a.id} did not hold: ${firstLine(outcome.observed, 400)}`);
    }
    try {
      const res = await client.query(OWNER_RUN_VIEWS_SQL);
      report.owner_run_views = (res?.rows ?? []).map((r) => `public.${r.name}`);
    } catch (e) {
      report.owner_run_views = null;
      report.violations.push(`CENSUS: the owner-run view census could not be read (${firstLine(e.message)})`);
    }
  } finally {
    try { await teardownPersonaFixtures(client); } catch (e) { report.teardown_error = firstLine(e.message); }
  }
  report.finished_at = now().toISOString();
  return report;
}

function parseArgs(argv) {
  const out = { outDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out-dir") out.outDir = argv[++i];
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  return out;
}

/** The CLI body with every side effect injectable. Returns the exit code. */
export async function cliMain({
  argv = process.argv.slice(2), env = process.env,
  connect = async () => (await import("../../lib/pg-conn.mjs")).connectPg(),
  writeFile = writeFileSync, makeDir = mkdirSync, log = console.log,
}) {
  let args;
  try { args = parseArgs(argv); } catch (e) { log(`rls-view-function-attacks: ${e.message}`); return 2; }
  const local = assertLocalOnly(env);
  if (!local.ok) { log("rls-view-function-attacks: REFUSED, the environment is not the local stack:"); local.violations.forEach((v) => log(`  - ${v}`)); return 2; }
  const client = await connect();
  if (!client) { log("rls-view-function-attacks: no database connection to the local stack. Cannot verify, exit 2."); return 2; }
  try {
    const report = await runAll({ client });
    for (const a of report.attacks) log(`${a.status === "pass" ? "HELD  " : "BROKEN"} ${a.id}  ${firstLine(a.observed, 160)}`);
    for (const v of report.owner_run_views ?? []) log(`owner-run view: ${v}`);
    for (const v of report.violations) log(`VIOLATION ${v}`);
    const outDir = args.outDir ?? env.CP_OUT_DIR ?? env.MP_OUT_DIR ?? null;
    if (outDir) {
      makeDir(outDir, { recursive: true });
      writeFile(join(outDir, "rls-view-function-attacks-report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
    } else {
      log("rls-view-function-attacks: no output directory (--out-dir, CP_OUT_DIR or MP_OUT_DIR); the report was not written.");
    }
    return report.violations.length === 0 ? 0 : 1;
  } finally {
    await client.end?.();
  }
}

if (isMainModule(import.meta.url)) {
  process.exit(await cliMain({}));
}
