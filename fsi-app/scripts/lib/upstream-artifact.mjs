#!/usr/bin/env node

import { parseArgs as nodeParseArgs } from "node:util";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "./is-main.mjs";
import { FAMILY_BY_WORKFLOW_NAME } from "./loop-run-id.mjs";
import { writeRunArtifact, claimRunId, hashHarnessVersion, buildRunArtifactEnvelope, noopContractErrors } from "./run-artifact.mjs";
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
  // Object.hasOwn, never a bare lookup: "constructor" and "__proto__" are keys of every object and would
  // resolve to a truthy non-function "evidence" (AUD-AT-5 G-5).
  const evidence = Object.hasOwn(APPLY_EVIDENCE, consumer) && Object.hasOwn(APPLY_EVIDENCE[consumer], upstreamName)
    ? APPLY_EVIDENCE[consumer][upstreamName]
    : undefined;
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
  const contract = noopContractErrors(cfg, row.metrics);
  if (contract.length > 0) {
    return { skip: false, invalid: true, reason: `upstream ${row.run_id} breaks the no-op contract (${contract.join("; ")}); the chain stops here rather than guess whether it wrote` };
  }
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
  const family = upstreamName != null && Object.hasOwn(FAMILY_BY_WORKFLOW_NAME, upstreamName) ? FAMILY_BY_WORKFLOW_NAME[upstreamName] ?? null : null;
  if (!family || upstreamRunId === null || upstreamRunId === undefined || String(upstreamRunId).trim() === "") {
    return { family: family ?? null, row: null };
  }
  for (let i = 0; i < attempts; i++) {
    const wanted = String(upstreamRunId).trim();
    const rows = await readRows(family, wanted);
    // Only a row that IS the upstream resolves: its family and its github run id are the ones asked for. The
    // reader filters on both, so a real row always passes; a row that does not (an injected, forged or
    // mismatched one) is not the ledger's record of that run, and its config.loop_run_id is never trusted
    // (AUD-AT-5 G-7).
    const own = Array.isArray(rows)
      ? rows.filter((r) => r && r.harness_family === family && r.github_run_id != null && String(r.github_run_id).trim() === wanted)
      : [];
    if (own.length > 0) {
      const sorted = [...own].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
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
  // Lane CHAIN-4 (2026-10-08): the judgement workflows chained off Population turn, Propagation drain and Corpus
  // turn. Their families have no runbook of their own, so the trace is the family's own FAMILY.md.
  "question-answers": "scripts/harness-runs/question-answers/FAMILY.md",
  "theme-briefs": "scripts/harness-runs/theme-briefs/FAMILY.md",
});

/**
 * Pure. The NO-OP run artifact (CONVENTION.md shape). `config.noop` / `config.noop_reason` are what the
 * downstream gate and the loop evidence read.
 */
export function buildNoopArtifact({ family, runId, harnessVersion, startedAt, mode, reason, upstreamName = null, upstreamRunId = null, loopRunId = null }) {
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
      loop_run_id: loopRunId || null,
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
        "loop-run-id": { type: "string" },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const [sub] = parsed.positionals;
  if (sub !== "read" && sub !== "noop" && sub !== "loop-id") return { ok: false, error: `first argument must be "read", "loop-id" or "noop" (got ${JSON.stringify(sub ?? null)})` };
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
      loopRunId: v["loop-run-id"] ?? null,
    });
    const path = writeNoop(artifact, v.family);
    err(`upstream-artifact noop: wrote ${path}`);
    return 0;
  }

  // read, loop-id
  const loopIdOnly = p.sub === "loop-id";
  if (!loopIdOnly && !APPLY_EVIDENCE[v.consumer]) {
    err(`upstream-artifact read: --consumer must be one of ${Object.keys(APPLY_EVIDENCE).join(", ")} (got ${JSON.stringify(v.consumer ?? null)})`);
    return 1;
  }
  const runMode = v["run-mode"];
  if (!loopIdOnly && runMode !== "dry" && runMode !== "apply") {
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
  if (loopIdOnly) {
    err(`upstream-artifact: loop-id upstream=${v["upstream-name"]} run=${v["upstream-run-id"]} family=${result.family} row=${result.row?.run_id ?? "(none)"}`);
    out(`CHAIN_UPSTREAM_LOOP_RUN_ID=${oneLine(result.row?.config?.loop_run_id)}`);
    return 0;
  }
  const gate = decideChainGate({
    consumer: v.consumer,
    upstreamName: v["upstream-name"],
    row: result.row,
    runMode,
    upstreamRunId: v["upstream-run-id"] ?? "",
  });
  err(`upstream-artifact: consumer=${v.consumer} upstream=${v["upstream-name"]} run=${v["upstream-run-id"]} family=${result.family} row=${result.row?.run_id ?? "(none)"} run-mode=${runMode} skip=${gate.skip}${gate.invalid ? " INVALID" : ""}`);
  if (gate.invalid) {
    err(`upstream-artifact: ${oneLine(gate.reason)}`);
    return 1;
  }
  out(`CHAIN_SKIP=${gate.skip}`);
  out(`CHAIN_SKIP_REASON=${oneLine(gate.reason)}`);
  out(`CHAIN_UPSTREAM_ROW_ID=${result.row?.run_id ?? ""}`);
  out(`CHAIN_UPSTREAM_LOOP_RUN_ID=${oneLine(result.row?.config?.loop_run_id)}`);
  return 0;
}

if (isMainModule(import.meta.url)) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
