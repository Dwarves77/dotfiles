#!/usr/bin/env node
// chained-dry-guard.mjs, the ONE shared gate every workflow_run-chained hop evaluates before it can
// reach an apply path (rule 16, lane CHAINED-DRY-GUARD, 2026-09-29, coordinator-directed). Build mode
// (system_state.scrape_cadence='off') means "no standing schedules, every runtime by explicit
// dispatch" (CLAUDE.md rule 16); a workflow_run-chained firing is NOT an explicit dispatch (nobody
// typed the inputs; it fired because an upstream workflow completed), so in build mode it MUST run
// dry, regardless of whatever hardcoded apply/plan default a chained resolve step would otherwise
// pick (every workflow_run branch across ledger-consume/population-turn/corpus-turn/downstream-chain/
// propagation-drain/gate-a-rescan/brief-export/fetch-drain hardcodes an apply-equivalent today).
//
// Two pieces:
//   1. resolveChainedRunMode (PURE): the decision. Given the real github.event_name and the mode a
//      chained resolve step would otherwise pick, decide whether build mode forces dry.
//   2. readScrapeCadence (impure, zero npm dependency): a raw Supabase REST call (fetch, no
//      @supabase/supabase-js import) so this gate can run as the FIRST step after checkout, before
//      `npm ci`, on every caller workflow, no ordering dependency on Install. Fails CLOSED to "off"
//      on any network/parse error, matching src/lib/api/pause.ts's own FAIL_CLOSED_SCRAPE_STATE
//      posture: better to force dry than to apply uncontrolled when the read itself is broken. (A raw
//      fetch, not an import of pause.ts, because pause.ts imports `next/server`, unavailable outside
//      the Next.js runtime, the same "two contexts, two readers" shape run-propagation-drain.mjs's own
//      header already documents for constructing its own raw Supabase client instead of routing
//      through db.mjs's guarded path.)
//
// CLI (what the workflow yml actually calls):
//   node scripts/lib/chained-dry-guard.mjs --event <github.event_name> --requested-mode <mode>
// Prints ONLY `KEY=VALUE` lines to stdout (redirect straight into $GITHUB_ENV: `>> "$GITHUB_ENV"`),
// diagnostics to stderr:
//   CHAINED_MODE=<the mode this gate resolved to: requested-mode, unchanged, or "dry">
//   CHAINED_FORCED_DRY=<true|false>
//   CHAINED_TRIGGER_LABEL=<eventName, "workflow_run", or "workflow_run (forced dry: build mode)">
// Exit 0 always (a read failure fails CLOSED to forced-dry, never fails the step; the workflow's own
// later steps still need SOMETHING to consume; a hard exit here would just make every chained hop red
// for a reason unrelated to its own logic).

import { parseArgs as nodeParseArgs } from "node:util";
import { isMainModule } from "./is-main.mjs";

/**
 * Pure. The ONE decision this whole file exists to make.
 * @param {{eventName: string, requestedMode: string, cadence: string}} args
 * @returns {{mode: string, forcedDry: boolean, triggerLabel: string}}
 */
export function resolveChainedRunMode({ eventName, requestedMode, cadence }) {
  if (eventName !== "workflow_run") {
    return { mode: requestedMode, forcedDry: false, triggerLabel: eventName };
  }
  if (cadence === "off") {
    return { mode: "dry", forcedDry: true, triggerLabel: "workflow_run (forced dry: build mode)" };
  }
  return { mode: requestedMode, forcedDry: false, triggerLabel: "workflow_run" };
}

/**
 * Impure, zero npm dependency (built-in fetch only). Reads system_state.scrape_cadence via a raw
 * Supabase REST call. Fails CLOSED to "off" on any network/parse error or missing creds.
 * `fetchImpl` is dependency-injected for tests (never a real network call in a unit test).
 * @param {string} supabaseUrl
 * @param {string} serviceRoleKey
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<string>}
 */
export async function readScrapeCadence(supabaseUrl, serviceRoleKey, fetchImpl = fetch) {
  if (!supabaseUrl || !serviceRoleKey) return "off";
  try {
    const res = await fetchImpl(
      `${supabaseUrl}/rest/v1/system_state?select=scrape_cadence&id=eq.true`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
    );
    if (!res.ok) return "off";
    const rows = await res.json();
    return rows?.[0]?.scrape_cadence ?? "off";
  } catch {
    return "off";
  }
}

function usage() {
  return "Usage: node scripts/lib/chained-dry-guard.mjs --event <name> --requested-mode <mode>";
}

/** Pure CLI arg parse/validate. @param {string[]} argv */
export function parseArgs(argv) {
  let values;
  try {
    ({ values } = nodeParseArgs({
      args: Array.isArray(argv) ? argv : [],
      options: {
        event: { type: "string" },
        "requested-mode": { type: "string" },
      },
      allowPositionals: false,
      strict: true,
    }));
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (!values.event) return { ok: false, error: "--event is required." };
  if (!values["requested-mode"]) return { ok: false, error: "--requested-mode is required." };
  return { ok: true, eventName: values.event, requestedMode: values["requested-mode"] };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`chained-dry-guard: ${parsed.error}\n${usage()}`);
    process.exit(1);
  }
  const cadence = await readScrapeCadence(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  console.error(`chained-dry-guard: event=${parsed.eventName} requested-mode=${parsed.requestedMode} scrape_cadence=${cadence}`);
  const { mode, forcedDry, triggerLabel } = resolveChainedRunMode({
    eventName: parsed.eventName,
    requestedMode: parsed.requestedMode,
    cadence,
  });
  console.error(`chained-dry-guard: resolved mode=${mode} forcedDry=${forcedDry}`);
  console.log(`CHAINED_MODE=${mode}`);
  console.log(`CHAINED_FORCED_DRY=${forcedDry}`);
  console.log(`CHAINED_TRIGGER_LABEL=${triggerLabel}`);
  process.exit(0);
}

if (isMainModule(import.meta.url)) await main();
