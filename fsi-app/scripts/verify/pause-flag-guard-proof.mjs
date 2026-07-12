/** VERIFIER (red-then-green, 0 Browserless): the PAUSE-FLAG SESSION-VAR GUARD (migration 201, RD-23).
 *  GOVERNING SKILLS: remediation-discipline (§4 category 17 — the pause-flag one-writer: structural
 *  enforcement, no credential, no manual step; a stop flag has exactly one writer) + the doctrine
 *  pause-flag-has-one-writer / operator-stop-states-are-inviolable.
 *
 *  PROVES the guard_pause_flag_writer trigger WITHOUT EVER WRITING THE LIVE FLAG: it attaches the applied
 *  guard function to a SYNTHETIC temp table inside a transaction that ALWAYS ROLLS BACK.
 *    RED  — an UNMARKED update to the synthetic flag columns is REJECTED (no app.pause_flag_writer marker).
 *    GREEN — a MARKED update (set_config('app.pause_flag_writer',…,true) first, as admin_set_pause_state does)
 *           SUCCEEDS.
 *  The transaction ROLLS BACK, so the temp table + any audit rows vanish; system_state is never touched.
 *  This is the stop-condition-safe harness: "never the live flag, use a synthetic table or rollback."
 *
 *  Exit 0 = guard proven (red-then-green). Exit 1 = a leg failed. Env: a Postgres connection string in
 *  SUPABASE_DB_URL or DATABASE_URL. Runs in the CI-with-secrets / ops lane (post-apply); pre-push validates
 *  wiring via the meta-gate (RD-23 audit token). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* env may be pre-loaded in CI */ }

const CONN = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!CONN) { console.error("pause-flag-guard-proof: need SUPABASE_DB_URL or DATABASE_URL"); process.exit(2); }

const client = new pg.Client({ connectionString: CONN });
let red = false, green = false;
try {
  await client.connect();
  await client.query("BEGIN");
  // Synthetic table shaped like system_state's guarded columns; attach the REAL guard function to it.
  await client.query(`
    CREATE TEMP TABLE _pause_guard_probe (
      id boolean PRIMARY KEY DEFAULT true,
      global_processing_paused boolean,
      scrape_cadence text
    ) ON COMMIT DROP;`);
  await client.query("INSERT INTO _pause_guard_probe (id, global_processing_paused, scrape_cadence) VALUES (true, false, 'off')");
  await client.query(`
    CREATE TRIGGER _pause_guard_probe_trg BEFORE UPDATE ON _pause_guard_probe
    FOR EACH ROW EXECUTE FUNCTION public.guard_pause_flag_writer();`);

  // RED — unmarked write must bounce.
  try {
    await client.query("UPDATE _pause_guard_probe SET global_processing_paused = true WHERE id = true");
    console.log("RED  ✗ unmarked write SUCCEEDED — the guard did not bounce it.");
  } catch (e) {
    red = /pause-flag-has-one-writer|insufficient_privilege/i.test(String(e.message || e));
    console.log(`RED  ${red ? "✓" : "✗"} unmarked write bounced: ${String(e.message || e).slice(0, 110)}`);
  }

  // GREEN — a marked write (as admin_set_pause_state does) must succeed. Fresh savepoint after the caught error.
  await client.query("ROLLBACK");
  await client.query("BEGIN");
  await client.query(`CREATE TEMP TABLE _pause_guard_probe2 (id boolean PRIMARY KEY DEFAULT true, global_processing_paused boolean, scrape_cadence text) ON COMMIT DROP`);
  await client.query("INSERT INTO _pause_guard_probe2 (id, global_processing_paused, scrape_cadence) VALUES (true, false, 'off')");
  await client.query(`CREATE TRIGGER _pause_guard_probe2_trg BEFORE UPDATE ON _pause_guard_probe2 FOR EACH ROW EXECUTE FUNCTION public.guard_pause_flag_writer()`);
  try {
    await client.query("SELECT set_config('app.pause_flag_writer', 'proof-harness', true)");
    await client.query("UPDATE _pause_guard_probe2 SET global_processing_paused = true WHERE id = true");
    const { rows } = await client.query("SELECT global_processing_paused FROM _pause_guard_probe2 WHERE id = true");
    green = rows[0]?.global_processing_paused === true;
    console.log(`GREEN ${green ? "✓" : "✗"} marked write succeeded (now ${rows[0]?.global_processing_paused}).`);
  } catch (e) {
    console.log(`GREEN ✗ marked write FAILED: ${String(e.message || e).slice(0, 110)}`);
  }
} catch (e) {
  console.error(`pause-flag-guard-proof: ${e.message}`); process.exit(2);
} finally {
  try { await client.query("ROLLBACK"); } catch { /* nothing to roll back */ }
  await client.end();
}

console.log(`\nRESULT: ${red && green ? "PASS — guard proven (unmarked bounces, marked succeeds); live flag never written" : "FAIL — see legs above"}`);
process.exit(red && green ? 0 : 1);
