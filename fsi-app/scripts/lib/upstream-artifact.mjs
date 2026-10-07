#!/usr/bin/env node
// upstream-artifact.mjs -- the chain's ONE artifact hand-off (lane CHAIN-1, 2026-10-07, CLAUDE.md rule 17).
//
// WHY. A workflow_run consumer (Population turn off Ledger consume; Downstream chain off Population turn or
// Corpus turn) used to find its upstream's artifact by looking for a git branch (`ledger-consume/<run id>`,
// `population/<run id>`, `turn/<run id>`) or a new committed file on master. Nothing pushes those any more:
// deliver-artifact-branch.sh lands every artifact straight into the `harness_runs` table (migration 331,
// operator ruling 2026-09-26, "not once that I need a pull request from GitHub"). So both consumers found
// nothing on every firing and ended as a NO-OP (chain-fire-2026-10-06, finding F2). This module is the
// replacement: given the upstream workflow's NAME and its github run id (both on the workflow_run event) it
// reads the matching `harness_runs` row and decides, by one pure function, whether the consumer proceeds.
//
// TWO SUBCOMMANDS (both print ONLY KEY=VALUE lines on stdout, for `>> "$GITHUB_ENV"` or a `$(...)` read;
// diagnostics go to stderr):
//   read  --consumer <population-turn|downstream-chain> --upstream-name <workflow name>
//         --upstream-run-id <id> --run-mode <dry|apply>
//     CHAIN_SKIP=<true|false>   CHAIN_SKIP_REASON=<one line>   CHAIN_UPSTREAM_ROW_ID=<run_id|empty>
//   noop  --family <mint|propagation> --mode <dry|apply> --reason <text> [--upstream-name n --upstream-run-id i
//         --started-at iso]
//     Writes a schema-valid NO-OP run artifact (config.noop=true, config.noop_reason) under
//     scripts/harness-runs/<family>/ so deliver-artifact-branch.sh lands it. A legitimate NO-OP is still a
//     run: the trigger is stamped honestly by writeRunArtifact (workflow_run, or workflow_run_forced_dry when
//     the chained dry-run guard forced dry), upstream_run_id by GITHUB_EVENT_WORKFLOW_RUN_ID, so the loop
//     firing evidence can place the hop on a run that decided there was nothing to do.
//
// THE GATE (decideChainGate), per ADR-023 / rule 16 posture:
//   - the upstream row must exist (a successful upstream that landed nothing is reported, never invented);
//   - an upstream that was itself a NO-OP produces nothing to consume;
//   - run mode dry: the consumer runs its REAL steps dry on whatever the upstream recorded (a plan or dry
//     upstream legitimately feeds a dry downstream; that is what proves the wiring in build mode);
//   - run mode apply: the upstream must show REAL work (the same evidence tests the branch readers applied:
//     ledger-consume armed apply with promoted > 0; population mint execute with minted > 0; corpus turn
//     apply with tickets_selected > 0), so an apply never chains off a run that wrote nothing.
//
// The reader is a raw Supabase REST call (built-in fetch, no npm import) so it can run before `npm ci`, the
// same posture scripts/lib/chained-dry-guard.mjs holds. It fails LOUD (exit 1) on a read error and, inside
// GitHub Actions, on missing credentials (rule 15, record-harness-run.mjs's own contract); outside Actions a
// missing credential self-skips with exit 2.

import { parseArgs as nodeParseArgs } from "node:util";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "./is-main.mjs";
import { FAMILY_BY_WORKFLOW_NAME } from "./loop-run-id.mjs";
import { writeRunArtifact, claimRunId, hashHarnessVersion, buildRunArtifactEnvelope } from "./run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");

export const HARNESS_RUN_READ_COLUMNS = "run_id,harness_family,trigger,github_run_id,started_at,config,metrics";

/** Per consumer, per upstream workflow NAME: what an APPLY-mode run must see on the upstream row before it
 *  chains. Pure data, one home. */
export const APPLY_EVIDENCE = Object.freeze({
  "population-turn": Object.freeze({
    "Ledger consume": (row) => {
      const mode = row.config?.mode ?? "plan";
      const disarmed = row.config?.apply_disarmed ?? true;
      const promoted = Number(row.metrics?.promoted ?? 0) || 0;
      if (mode !== "apply" || disarmed !== false) {
        return `ledger-consume run ${row.run_id} ran with effective mode=${mode} (apply_disarmed=${disarmed}), so no real writes happened and nothing new reached census_worklist`;
      }
      if (promoted <= 0) return `ledger-consume run ${row.run_id} applied for real but metrics.promoted=${promoted}, nothing new reached census_worklist`;
      return null;
    },
  }),
  "downstream-chain": Object.freeze({
    "Population turn": (row) => {
      const mode = row.config?.mode ?? "";
      const minted = Number(row.metrics?.minted ?? 0) || 0;
      if (mode !== "execute") return `population mint run ${row.run_id} ran with effective mode=${mode} (wanted execute), a dry run wrote nothing`;
      if (minted <= 0) return `population mint run ${row.run_id} executed but metrics.minted=${minted}, nothing new to derive from`;
      return null;
    },
    "Corpus turn": (row) => {
      const mode = row.config?.mode ?? "";
      const selected = Number(row.metrics?.tickets_selected ?? 0) || 0;
      if (mode !== "apply") return `corpus-turn run ${row.run_id} ran with effective mode=${mode} (wanted apply), a dry run wrote nothing`;
      if (selected <= 0) return `corpus-turn run ${row.run_id} applied but metrics.tickets_selected=${selected}, nothing new to derive from`;
      return null;
    },
  }),
});

const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/**
 * Pure. Decide whether a chained consumer proceeds, given the upstream's harness_runs row (or null).
 * @param {{consumer: string, upstreamName: string, row: object|null, runMode: string, upstreamRunId?: string}} args
 * @returns {{skip: boolean, reason: string}}
 */
export function decideChainGate({ consumer, upstreamName, row, runMode, upstreamRunId = "" }) {
  const evidence = APPLY_EVIDENCE[consumer]?.[upstreamName];
  if (!evidence) {
    return { skip: true, reason: `no hand-off is defined from "${upstreamName}" into ${consumer}, so there is nothing to chain from` };
  }
  if (!row) {
    return {
      skip: true,
      reason: `no harness_runs row exists for "${upstreamName}" run ${upstreamRunId || "(unknown)"} (the upstream concluded but landed no artifact), so there is nothing to chain from`,
    };
  }
  const cfg = row.config ?? {};
  if (cfg.noop === true || cfg.skip === true) {
    return { skip: true, reason: `upstream ${row.run_id} was itself a no-op (${oneLine(cfg.noop_reason ?? cfg.skip_reason) || "no reason recorded"}), so it produced nothing to consume` };
  }
  if (runMode !== "apply") return { skip: false, reason: "" };
  const refusal = evidence(row);
  return refusal ? { skip: true, reason: `${refusal}; an apply run needs real upstream work` } : { skip: false, reason: "" };
}

/**
 * Read the one harness_runs row of `upstreamName`'s family whose github_run_id is `upstreamRunId`.
 * `readRows(family, githubRunId)` is injected (tests pass fixtures; the CLI passes the REST reader) and may
 * return an empty array until the upstream's landing is visible, so a few short retries run before "missing".
 * @returns {Promise<{family: string|null, row: object|null}>}
 */
export async function readUpstreamArtifact({ upstreamName, upstreamRunId, readRows, attempts = 3, delayMs = 3000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const family = upstreamName != null ? FAMILY_BY_WORKFLOW_NAME[upstreamName] ?? null : null;
  if (!family || upstreamRunId === null || upstreamRunId === undefined || String(upstreamRunId).trim() === "") {
    return { family: family ?? null, row: null };
  }
  for (let i = 0; i < attempts; i++) {
    const rows = await readRows(family, String(upstreamRunId).trim());
    if (Array.isArray(rows) && rows.length > 0) {
      const sorted = [...rows].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
      return { family, row: sorted[0] };
    }
    if (i < attempts - 1) await sleep(delayMs);
  }
  return { family, row: null };
}

/**
 * The REST reader the CLI injects: harness_runs rows for one family and one github run id. Zero npm
 * dependency. Throws on any non-2xx so a read failure is loud, never read as "no upstream".
 * @param {string} supabaseUrl @param {string} serviceRoleKey @param {typeof fetch} [fetchImpl]
 */
export function makeRestRowReader(supabaseUrl, serviceRoleKey, fetchImpl = fetch) {
  return async (family, githubRunId) => {
    const qs = `select=${HARNESS_RUN_READ_COLUMNS}&harness_family=eq.${encodeURIComponent(family)}&github_run_id=eq.${encodeURIComponent(githubRunId)}&order=started_at.desc&limit=5`;
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/harness_runs?${qs}`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    if (!res.ok) throw new Error(`harness_runs read failed: HTTP ${res.status}`);
    return await res.json();
  };
}

// Families that may record a NO-OP through this module, with the doc their artifact points at as its trace
// (writeRunArtifact refuses an artifact with no full_trace_refs).
export const NOOP_FAMILIES = Object.freeze({
  mint: "docs/runbooks/POPULATION-TURN-RUNBOOK.md",
  propagation: "docs/runbooks/PROPAGATION-DRAIN-RUNBOOK.md",
});

/**
 * Pure. The NO-OP run artifact (CONVENTION.md shape). `config.noop` / `config.noop_reason` are what the
 * downstream gate and the loop evidence read.
 */
export function buildNoopArtifact({ family, runId, harnessVersion, startedAt, mode, reason, upstreamName = null, upstreamRunId = null }) {
  const trace = NOOP_FAMILIES[family];
  if (!trace) throw new Error(`buildNoopArtifact: family "${family}" is not one of ${Object.keys(NOOP_FAMILIES).join(", ")}`);
  const why = oneLine(reason) || "no reason recorded";
  return buildRunArtifactEnvelope({
    family,
    harnessVersion,
    runId,
    startedAt,
    config: {
      mode,
      noop: true,
      noop_reason: why,
      upstream_name: upstreamName || null,
      upstream_run_id: upstreamRunId || null,
    },
    inputsRef: ["noop"],
    perItem: [{ id: "noop", outcome: "noop", verdict: why, evidence_refs: [] }],
    metrics: { noop: 1 },
    defectsFound: [],
    fullTraceRefs: [trace],
    proposerNotes: `This firing was a no-op: ${why}. Recorded anyway so the family's history, and the loop firing evidence, show every firing and not only the ones with real work (rule 17).`,
  });
}

function parse(argv) {
  let parsed;
  try {
    parsed = nodeParseArgs({
      args: Array.isArray(argv) ? argv : [],
      options: {
        consumer: { type: "string" },
        "upstream-name": { type: "string" },
        "upstream-run-id": { type: "string" },
        "run-mode": { type: "string" },
        family: { type: "string" },
        mode: { type: "string" },
        reason: { type: "string" },
        "started-at": { type: "string" },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const [sub] = parsed.positionals;
  if (sub !== "read" && sub !== "noop") return { ok: false, error: `first argument must be "read" or "noop" (got ${JSON.stringify(sub ?? null)})` };
  return { ok: true, sub, values: parsed.values };
}

/**
 * CLI body, deps-injected so the exit-code contract is testable without a process or a network.
 * @returns {Promise<number>}
 */
export async function runCli(argv, deps = {}) {
  const {
    out = (line) => console.log(line),
    err = (m) => console.error(m),
    envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
    envKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
    isGitHubActions = process.env.GITHUB_ACTIONS === "true",
    readRowsFactory = makeRestRowReader,
    sleep,
    writeNoop = (artifact, family) => writeRunArtifact(resolve(FSI_ROOT, "scripts", "harness-runs", family), artifact),
    claimId = (family) => claimRunId(resolve(FSI_ROOT, "scripts", "harness-runs", family), family),
    versionOf = (family) => hashHarnessVersion(GOVERNING_FILES[family], FSI_ROOT),
  } = deps;

  const p = parse(argv);
  if (!p.ok) {
    err(`upstream-artifact: ${p.error}`);
    return 1;
  }
  const v = p.values;

  if (p.sub === "noop") {
    if (!NOOP_FAMILIES[v.family]) {
      err(`upstream-artifact noop: --family must be one of ${Object.keys(NOOP_FAMILIES).join(", ")} (got ${JSON.stringify(v.family ?? null)})`);
      return 1;
    }
    if (v.mode !== "dry" && v.mode !== "apply") {
      err(`upstream-artifact noop: --mode must be "dry" or "apply" (got ${JSON.stringify(v.mode ?? null)})`);
      return 1;
    }
    const artifact = buildNoopArtifact({
      family: v.family,
      runId: claimId(v.family),
      harnessVersion: versionOf(v.family),
      startedAt: v["started-at"] || new Date().toISOString(),
      mode: v.mode,
      reason: v.reason ?? "",
      upstreamName: v["upstream-name"] ?? null,
      upstreamRunId: v["upstream-run-id"] ?? null,
    });
    const path = writeNoop(artifact, v.family);
    err(`upstream-artifact noop: wrote ${path}`);
    return 0;
  }

  // read
  if (!APPLY_EVIDENCE[v.consumer]) {
    err(`upstream-artifact read: --consumer must be one of ${Object.keys(APPLY_EVIDENCE).join(", ")} (got ${JSON.stringify(v.consumer ?? null)})`);
    return 1;
  }
  const runMode = v["run-mode"];
  if (runMode !== "dry" && runMode !== "apply") {
    err(`upstream-artifact read: --run-mode must be "dry" or "apply" (got ${JSON.stringify(runMode ?? null)})`);
    return 1;
  }
  if (!envUrl || !envKey) {
    if (isGitHubActions) {
      err("upstream-artifact: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set in GitHub Actions; the chain cannot read its upstream artifact, which is a FAILURE, not a no-op (rule 17).");
      return 1;
    }
    err("upstream-artifact: credentials not set, self-skip (rule 15).");
    return 2;
  }
  let result;
  try {
    result = await readUpstreamArtifact({
      upstreamName: v["upstream-name"],
      upstreamRunId: v["upstream-run-id"],
      readRows: readRowsFactory(envUrl, envKey),
      ...(sleep ? { sleep } : {}),
    });
  } catch (e) {
    err(`upstream-artifact: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  const gate = decideChainGate({
    consumer: v.consumer,
    upstreamName: v["upstream-name"],
    row: result.row,
    runMode,
    upstreamRunId: v["upstream-run-id"] ?? "",
  });
  err(`upstream-artifact: consumer=${v.consumer} upstream=${v["upstream-name"]} run=${v["upstream-run-id"]} family=${result.family} row=${result.row?.run_id ?? "(none)"} run-mode=${runMode} skip=${gate.skip}`);
  out(`CHAIN_SKIP=${gate.skip}`);
  out(`CHAIN_SKIP_REASON=${oneLine(gate.reason)}`);
  out(`CHAIN_UPSTREAM_ROW_ID=${result.row?.run_id ?? ""}`);
  return 0;
}

if (isMainModule(import.meta.url)) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
