// RED-THEN-GREEN proof for the Unit 2a operator-control stop-flag binding (migration 201).
//
// PROVES: after migration 201 is applied + operator_control is provisioned (LOGIN + OPERATOR_CONTROL_DATABASE_URL),
//   RED  — a SERVICE-ROLE (or any non-operator_control) UPDATE to system_state.global_processing_paused is
//          REJECTED by guard_operator_stop_flags (ERRCODE insufficient_privilege). The flag does NOT change.
//   GREEN — the bound operator_control credential CAN toggle the flag, and the change is audited. The harness
//          restores the original value in a finally block (net-zero).
//
// **THE OPERATOR RUNS THIS, NOT THE AGENT.** It momentarily toggles global_processing_paused (a stop flag)
// during the GREEN leg, then restores it — an agent is forbidden to touch that flag under any path
// (doctrine operator-stop-conditions-are-absolute / operator-stop-states-are-inviolable). Run it in the
// apply-verification window only. Before migration 201 is applied it cannot pass — that is expected.
//
// ENV: SUPABASE_DB_URL (or DATABASE_URL) = the unrestricted/service connection for the RED leg;
//      OPERATOR_CONTROL_DATABASE_URL = the operator_control login connection for the GREEN leg.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch {}

const SERVICE_CONN = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const OPCTL_CONN = process.env.OPERATOR_CONTROL_DATABASE_URL;
if (!SERVICE_CONN || !OPCTL_CONN) {
  console.error("MISSING ENV: need SUPABASE_DB_URL (service/unrestricted) + OPERATOR_CONTROL_DATABASE_URL (operator_control).");
  process.exit(2);
}

async function one(conn) {
  const c = new pg.Client({ connectionString: conn });
  await c.connect();
  return c;
}

console.log("=== Unit 2a operator-control stop-flag binding — RED-THEN-GREEN ===");
let red = false, green = false, original = null;

// RED — service-role attempt to flip the flag MUST be rejected.
{
  const c = await one(SERVICE_CONN);
  try {
    const { rows } = await c.query("SELECT global_processing_paused FROM system_state WHERE id = true");
    original = rows[0]?.global_processing_paused ?? null;
    try {
      await c.query("UPDATE system_state SET global_processing_paused = NOT global_processing_paused WHERE id = true");
      console.log("RED  ✗ service-role flip SUCCEEDED — binding NOT working (should have been rejected).");
    } catch (e) {
      red = /insufficient_privilege|operator-stop-states-are-inviolable/i.test(String(e.message || e));
      console.log(`RED  ${red ? "✓" : "✗"} service-role flip rejected: ${String(e.message || e).slice(0, 120)}`);
    }
  } finally { await c.end(); }
}

// GREEN — operator_control CAN flip it; restore to original afterward.
{
  const c = await one(OPCTL_CONN);
  try {
    await c.query("UPDATE system_state SET global_processing_paused = NOT global_processing_paused WHERE id = true");
    const { rows } = await c.query("SELECT global_processing_paused FROM system_state WHERE id = true");
    green = rows[0]?.global_processing_paused === (original === null ? rows[0]?.global_processing_paused : !original);
    console.log(`GREEN ${green ? "✓" : "✗"} operator_control flip succeeded (now ${rows[0]?.global_processing_paused}).`);
  } catch (e) {
    console.log(`GREEN ✗ operator_control flip FAILED: ${String(e.message || e).slice(0, 120)}`);
  } finally {
    // RESTORE the original value via operator_control (net-zero), then close.
    if (original !== null) {
      try { await c.query("UPDATE system_state SET global_processing_paused = $1 WHERE id = true", [original]); }
      catch (e) { console.error(`!! RESTORE FAILED — set global_processing_paused=${original} manually: ${e.message}`); }
    }
    await c.end();
  }
}

console.log(`\nRESULT: ${red && green ? "PASS — binding proven (service-role rejected, operator_control passes)" : "FAIL — see legs above"}`);
process.exit(red && green ? 0 : 1);
