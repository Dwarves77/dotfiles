// data-audit: label=layer-c-insert-gate-proof hard=true
/** VERIFIER (red-then-green, 0 Browserless): the LAYER C INSERT GATE (migration 240).
 *  GOVERNING SKILLS: remediation-discipline (class-over-instance -- the app-layer preflight gate the
 *  fleet never invoked moves into the DB, where every writer passes through it) + the doctrine
 *  block-next-run / deliberate-acts-clear-blocks-never-time.
 *
 *  PROVES the guard_data_audit_block trigger WITHOUT EVER TOUCHING LIVE ROWS DURABLY: everything runs
 *  inside ONE transaction that ALWAYS ROLLS BACK. The probe target is a SYNTHETIC temp table carrying
 *  the applied guard function (mirrors pause-flag-guard-proof.mjs -- "never the live flag, use a
 *  synthetic table or rollback"); the block-state reads hit the REAL integrity_flags table, which is
 *  first neutralized (open lane rows resolved) and then seeded with a synthetic block -- all rolled back.
 *    GREEN-1 -- no open block: insert proceeds untouched.
 *    RED-1  -- open block, no waiver: insert bounces (layer-c-insert-gate).
 *    RED-2  -- open block, EXPIRED waiver (until = yesterday): bounces -- time never clears red.
 *    RED-3  -- open block, non-waiver action (investigate, future-dated): bounces.
 *    GREEN-2 -- open block, VALID dated waiver (until = tomorrow): insert proceeds.
 *    GREEN-3 -- open unwaived block + transaction-local app.data_audit_override marker: insert
 *              proceeds (the deliberate-act exemption, mig-201 marker precedent).
 *
 *  Exit 0 = gate proven (all legs). Exit 1 = a leg failed. Exit 2 = cannot verify (no direct-Postgres
 *  connection by any pg-conn.mjs route). Runs in the live-smoke data-audit step (post-apply).
 *
 *  DATA-1 (2026-10-11): the connection used to be built here from SUPABASE_DB_URL/DATABASE_URL alone, which
 *  the CI lane never injects, so the proof exited 2 on every run (the class pg-conn.mjs records). The client
 *  is now injected into runProof(); the CLI guard resolves it through the shared connectPg, exactly as
 *  pause-flag-guard-proof.mjs does. */
import { connectPg } from "../lib/pg-conn.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { isMainModule } from "../lib/is-main.mjs";

const GATE_RE = /layer-c-insert-gate/i;
const iso = (d) => d.toISOString().slice(0, 10);

/** Runs the six legs against `client` (a connected pg client or a test double exposing `.query`). Everything
 *  happens inside ONE transaction that is always rolled back. Returns { legs, pass }. */
export async function runProof(client, { log = console.log } = {}) {
  const legs = { green1: false, red1: false, red2: false, red3: false, green2: false, green3: false };
  const TOMORROW = iso(new Date(Date.now() + 2 * 86400e3)); // +2d: immune to a midnight-UTC boundary mid-run
  const YESTERDAY = iso(new Date(Date.now() - 86400e3));

  async function expectBounce(name) {
    await client.query("SAVEPOINT leg");
    try {
      await client.query("INSERT INTO _lcig_probe DEFAULT VALUES");
      log(`${name} FAIL insert SUCCEEDED -- the gate did not bounce it.`);
      return false;
    } catch (e) {
      const ok = GATE_RE.test(String(e.message || e));
      log(`${name} ${ok ? "ok" : "FAIL"} insert bounced: ${String(e.message || e).slice(0, 110)}`);
      await client.query("ROLLBACK TO SAVEPOINT leg");
      return ok;
    }
  }

  async function expectPass(name) {
    await client.query("SAVEPOINT leg");
    try {
      await client.query("INSERT INTO _lcig_probe DEFAULT VALUES");
      log(`${name} ok insert proceeded.`);
      return true;
    } catch (e) {
      log(`${name} FAIL insert FAILED: ${String(e.message || e).slice(0, 110)}`);
      await client.query("ROLLBACK TO SAVEPOINT leg");
      return false;
    }
  }

  try {
    await client.query("BEGIN");

    // Neutralize live lane state INSIDE the rolled-back transaction so the proof is deterministic
    // whatever the live lane verdict is right now (an open block may genuinely exist, e.g. cfb1799a).
    await client.query(`
      UPDATE public.integrity_flags SET status = 'resolved'
      WHERE category = 'data_integrity' AND subject_ref = 'data-audit-lane' AND status = 'open'`);

    // Synthetic probe table carrying the REAL applied guard function.
    await client.query("CREATE TEMP TABLE _lcig_probe (id bigserial PRIMARY KEY) ON COMMIT DROP");
    await client.query(`
      CREATE TRIGGER _lcig_probe_trg BEFORE INSERT ON _lcig_probe
      FOR EACH ROW EXECUTE FUNCTION public.guard_data_audit_block()`);

    // GREEN-1 -- no open block: untouched insert.
    legs.green1 = await expectPass("GREEN-1 (no open block)      ");

    // Seed the synthetic open block (rolled back with everything else).
    const { rows: [blk] } = await client.query(`
      INSERT INTO public.integrity_flags (category, subject_type, subject_ref, description, recommended_actions, status, created_by)
      VALUES ('data_integrity', 'system', 'data-audit-lane',
              'layer-c-insert-gate proof harness: synthetic open data-audit block (rolled back)',
              '[]'::jsonb, 'open', 'layer-c-proof-harness')
      RETURNING id`);
    log(`     seeded synthetic block ${blk.id}`);

    // RED-1 -- open block, no waiver.
    legs.red1 = await expectBounce("RED-1  (open, no waiver)     ");

    // RED-2 -- expired waiver: time never clears red.
    await client.query(
      `UPDATE public.integrity_flags SET recommended_actions = jsonb_build_array(jsonb_build_object('action','waiver','until',$1::text)) WHERE id = $2`,
      [YESTERDAY, blk.id]);
    legs.red2 = await expectBounce("RED-2  (expired waiver)      ");

    // RED-3 -- a non-waiver action does not dispose, even future-dated.
    await client.query(
      `UPDATE public.integrity_flags SET recommended_actions = jsonb_build_array(jsonb_build_object('action','investigate','until',$1::text)) WHERE id = $2`,
      [TOMORROW, blk.id]);
    legs.red3 = await expectBounce("RED-3  (non-waiver action)   ");

    // GREEN-2 -- a valid dated waiver disposes.
    await client.query(
      `UPDATE public.integrity_flags SET recommended_actions = jsonb_build_array(jsonb_build_object('action','waiver','until',$1::text)) WHERE id = $2`,
      [TOMORROW, blk.id]);
    legs.green2 = await expectPass("GREEN-2 (valid dated waiver) ");

    // GREEN-3 -- deliberate-act override marker (transaction-local; last leg since it persists to txn end).
    await client.query(`UPDATE public.integrity_flags SET recommended_actions = '[]'::jsonb WHERE id = $1`, [blk.id]);
    await client.query("SELECT set_config('app.data_audit_override', 'layer-c-proof-harness: rollback-only proof', true)");
    legs.green3 = await expectPass("GREEN-3 (override marker)    ");
  } finally {
    try { await client.query("ROLLBACK"); } catch { /* nothing to roll back */ }
  }
  return { legs, pass: Object.values(legs).every(Boolean) };
}

if (isMainModule(import.meta.url)) {
  loadLocalEnvFile();
  // Shared resolver (scripts/lib/pg-conn.mjs): SUPABASE_DB_URL/DATABASE_URL still work; the CI lane's
  // NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD also resolve.
  const client = await connectPg();
  if (!client) {
    console.error("layer-c-insert-gate-proof: no direct-Postgres connection (SUPABASE_DB_URL/DATABASE_URL, local supabase link + SUPABASE_DB_PASSWORD, or NEXT_PUBLIC_SUPABASE_URL-derived pooler), exit 2.");
    process.exit(2);
  }
  let outcome;
  try {
    outcome = await runProof(client);
  } catch (e) {
    console.error(`layer-c-insert-gate-proof: ${e.message}`);
    process.exit(2);
  } finally {
    await client.end();
  }
  console.log(`\nRESULT: ${outcome.pass ? "PASS -- gate proven (unwaived/expired/non-waiver bounce; green/waived/override proceed); no durable write" : "FAIL -- see legs above"}`);
  process.exit(outcome.pass ? 0 : 1);
}
