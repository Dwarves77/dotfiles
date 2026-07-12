// The bound operator-control DB client (Unit 2a). The admin pause-button route writes the system_state
// STOP FLAGS (global_processing_paused / scrape_cadence) ONLY through this credential — a dedicated,
// scoped Postgres role `operator_control` (migration 201), NOT the service-role JWT.
//
// WHY: migration 201's guard_operator_stop_flags trigger keys on current_user and REJECTS a service_role
// flip of those columns, so an agent holding only the service-role key mechanically cannot alter an
// operator stop flag (doctrine operator-stop-states-are-inviolable). The admin route carries the
// operator_control connection string; agents do not.
//
// FAIL-CLOSED: throws if OPERATOR_CONTROL_DATABASE_URL is unset — it never silently downgrades a stop-flag
// write to service-role (that downgrade is the exact capability this Unit removes). The route checks
// operatorControlConfigured() first and only falls back to service-role BEFORE migration 201 is applied
// (pre-apply compatibility, when a service-role write to the flags still succeeds).
import { Client } from "pg";

/** True when the bound operator-control credential is configured (i.e. Unit 2a is applied + provisioned). */
export function operatorControlConfigured(): boolean {
  return !!process.env.OPERATOR_CONTROL_DATABASE_URL;
}

/**
 * Run one stop-flag write as `operator_control`. Opens a short-lived pg connection (the pause button is a
 * rare admin action), runs `fn`, and always closes. Throws fail-closed if the credential is not configured.
 */
export async function withOperatorControl<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const conn = process.env.OPERATOR_CONTROL_DATABASE_URL;
  if (!conn) {
    throw new Error(
      "OPERATOR_CONTROL_DATABASE_URL is not configured. The operator-control credential (migration 201) is " +
        "required to write system_state stop flags — after 201 is applied a service-role write to those " +
        "columns is trigger-rejected. Provision it (ALTER ROLE operator_control LOGIN PASSWORD …) and set the env var."
    );
  }
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
