#!/usr/bin/env node

import { parseArgs as nodeParseArgs } from "node:util";
import { isMainModule } from "./is-main.mjs";

/**
 * Pure. The ONE decision this whole file exists to make. `chained` (default false) marks a
 * workflow_dispatch event that was fired BY another workflow (a machine, not an operator) rather than
 * hand-typed -- see this module's own header, "--chained", for why a raw `eventName === "workflow_run"`
 * check alone is not sufficient.
 * @param {{eventName: string, requestedMode: string, cadence: string, chained?: boolean}} args
 * @returns {{mode: string, forcedDry: boolean, triggerLabel: string}}
 */
export function resolveChainedRunMode({ eventName, requestedMode, cadence, chained = false, ref = "" }) {
  const isMasterPush = eventName === "push" && isMergeRef(ref);
  const isChainFired = eventName === "workflow_run" || (eventName === "workflow_dispatch" && chained === true) || isMasterPush;
  if (!isChainFired) {
    return { mode: requestedMode, forcedDry: false, triggerLabel: eventName };
  }
  const base = eventName === "workflow_run" ? "workflow_run" : isMasterPush ? "push (merge to master)" : "workflow_dispatch (chained)";
  if (cadence === "off") {
    const label = eventName === "workflow_run"
      ? "workflow_run (forced dry: build mode)"
      : isMasterPush
        ? "push (forced dry: build mode, merge to master)"
        : "workflow_dispatch (forced dry: build mode, chained)";
    return { mode: "dry", forcedDry: true, triggerLabel: label };
  }
  return { mode: requestedMode, forcedDry: false, triggerLabel: base };
}

/**
 * Pure. True for a ref that is the merge target (master or main, bare or refs/heads/ qualified). A push to
 * this ref is a MERGE, fired by the drain's batch PR landing, not typed by an operator, so it is
 * machine-triggered exactly like a workflow_run hop (coordinator ruling 2026-10-06, lane G6-DRAIN: the guard,
 * not the trigger, holds the population ruling). A push to any other ref (a `turn/**` request branch an
 * operator pushes on purpose) and a push whose ref was not passed stay unchanged.
 * @param {string} ref
 */
export function isMergeRef(ref) {
  return /^(refs\/heads\/)?(master|main)$/.test(String(ref ?? ""));
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
  return "Usage: node scripts/lib/chained-dry-guard.mjs --event <name> --requested-mode <mode> [--chained <true|false>] [--ref <github.ref>]";
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
        chained: { type: "string" },
        ref: { type: "string" },
      },
      allowPositionals: false,
      strict: true,
    }));
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (!values.event) return { ok: false, error: "--event is required." };
  if (!values["requested-mode"]) return { ok: false, error: "--requested-mode is required." };
  // --chained is a loose boolean (GitHub Actions expressions render as the literal strings "true"/
  // "false"; an empty string, e.g. inputs.chain_upstream_run_id evaluating falsy on a plain workflow_run
  // event, is treated the same as absent/false).
  const chained = values.chained === "true";
  return { ok: true, eventName: values.event, requestedMode: values["requested-mode"], chained, ref: values.ref ?? "" };
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
  console.error(`chained-dry-guard: event=${parsed.eventName} requested-mode=${parsed.requestedMode} chained=${parsed.chained} scrape_cadence=${cadence}`);
  const { mode, forcedDry, triggerLabel } = resolveChainedRunMode({
    eventName: parsed.eventName,
    requestedMode: parsed.requestedMode,
    cadence,
    chained: parsed.chained,
    ref: parsed.ref,
  });
  console.error(`chained-dry-guard: resolved mode=${mode} forcedDry=${forcedDry}`);
  console.log(`CHAINED_MODE=${mode}`);
  console.log(`CHAINED_FORCED_DRY=${forcedDry}`);
  console.log(`CHAINED_TRIGGER_LABEL=${triggerLabel}`);
  process.exit(0);
}

if (isMainModule(import.meta.url)) await main();
