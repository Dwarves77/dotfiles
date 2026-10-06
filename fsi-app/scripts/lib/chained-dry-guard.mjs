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
//     [--chained <true|false>] [--ref <github.ref>]
// Prints ONLY `KEY=VALUE` lines to stdout (redirect straight into $GITHUB_ENV: `>> "$GITHUB_ENV"`),
// diagnostics to stderr:
//   CHAINED_MODE=<the mode this gate resolved to: requested-mode, unchanged, or "dry">
//   CHAINED_FORCED_DRY=<true|false>
//   CHAINED_TRIGGER_LABEL=<eventName, "workflow_run", or a "(forced dry: build mode)" variant>
// Exit 0 always (a read failure fails CLOSED to forced-dry, never fails the step; the workflow's own
// later steps still need SOMETHING to consume; a hard exit here would just make every chained hop red
// for a reason unrelated to its own logic).
//
// --chained (lane CHAINED-DRY-GUARD-2, 2026-09-29, coordinator-directed after the live proof run found
// the gap): a `workflow_run` event is not the ONLY shape a machine-driven, non-operator firing takes.
// downstream-chain.yml's own F60 explicit-dispatch fallback (loop-b-firing, the depth-limit workaround)
// calls `gh workflow run propagation-drain.yml` directly, which delivers a genuine `workflow_dispatch`
// event to propagation-drain.yml, NOT `workflow_run` -- so the original (event === "workflow_run") test
// alone let a machine-chained dispatch slip past the force-dry branch entirely, relying SOLELY on
// downstream-chain passing `-f mode=dry` correctly, with no defense-in-depth on the receiving side.
// [CONFIRMED live, 2026-09-29, runs 36612225468/36612325034]: the guard logged
// `event=workflow_dispatch resolved mode=apply forcedDry=false` on both propagation-drain runs
// downstream-chain dispatched -- they ran dry ONLY because the passed input said so, not because this
// gate caught it. `--chained` closes that gap: the caller passes `true` when the workflow_dispatch
// carries proof it was fired BY another workflow rather than typed by an operator (here,
// `inputs.chain_upstream_run_id` being non-empty); this gate then treats that firing exactly like a
// raw `workflow_run` event for the force-dry decision, independent of whatever mode the chained caller
// requested.
//
// --ref (lane G6-DRAIN, 2026-10-06, coordinator ruling): a `push` to master is the merge of a session-
// authored batch PR (the judgement drain commits batch files to a branch, a PR lands them, and each apply
// workflow has a push trigger on its own batch directory). Nobody typed the inputs, so a push whose --ref is
// master or main is treated exactly like a workflow_run hop: forced dry while scrape_cadence='off'. A push
// with another ref (corpus-turn's operator-pushed `turn/**` request) or no --ref is unchanged.

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
