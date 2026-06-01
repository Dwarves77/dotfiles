// ── RE-RUN INTERLOCK for ALREADY-EXECUTED Sprint-4 data-op scripts ──
//
// dev and prod are ONE shared Supabase project. Every script that imports this guard
// ALREADY RAN ONCE against production (see docs/runbooks/sprint4-dataops-ledger.md).
// Re-running a corpus mutation therefore DOUBLE-APPLIES against prod — the CI-429
// double-fire hazard at the data layer. This interlock makes re-execution
// impossible-by-default: the script refuses to proceed and exits cleanly.
//
// It runs BEFORE any DB connection (imports hoist; this call is the first top-level
// statement to execute), so a refused run never opens a client or touches a row.
//
// To DELIBERATELY re-run (you have read the ledger and understand the effect):
//     CONFIRM_RERUN=<script-name> node scripts/<script>.mjs --execute
//
// The guard is the audit record's enforcement arm, not a substitute for it: the ledger
// is the source of truth for what ran, when, the commit, and reversibility.

const LEDGER = "docs/runbooks/sprint4-dataops-ledger.md";

export function assertExecutedDataOp(name, meta = {}) {
  if (process.env.CONFIRM_RERUN === name) {
    console.error(
      `[interlock] CONFIRM_RERUN=${name} — proceeding with a DELIBERATE re-run against the SHARED prod DB.`,
    );
    return;
  }
  const lines = [
    "",
    "  +-- RE-RUN INTERLOCK -------------------------------------------------",
    `  | '${name}' is an ALREADY-EXECUTED data operation. Refusing to run.`,
    meta.applied ? `  | Applied : ${meta.applied}${meta.commit ? `  (commit ${meta.commit})` : ""}` : null,
    meta.effect ? `  | Effect  : ${meta.effect}` : null,
    meta.idempotent != null
      ? `  | Re-run  : ${meta.idempotent ? "idempotent, but still a prod write" : "NOT idempotent — would corrupt prod"}`
      : null,
    "  | dev+prod are ONE Supabase. Re-running DOUBLE-APPLIES to production.",
    `  | Source of truth for what ran: ${LEDGER}`,
    `  | Deliberate re-run: CONFIRM_RERUN=${name} node scripts/${name}.mjs`,
    "  +--------------------------------------------------------------------",
    "",
  ].filter(Boolean);
  console.error(lines.join("\n"));
  process.exit(0);
}
