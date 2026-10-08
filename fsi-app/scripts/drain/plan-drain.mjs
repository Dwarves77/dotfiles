#!/usr/bin/env node
// plan-drain.mjs: the judgement drain planner (lane G6-DRAIN, 2026-10-06, plan Stage 6, third bullet:
// "The scheduled drain session is built with its kill switch, off").
//
// WHAT THE DRAIN IS. The plan's "How model judgement runs": a workflow EXPORTS items, a Claude session WRITES a
// committed batch file, the next workflow APPLIES it by rule. A workflow cannot start a session, so after build
// a scheduled session is the runtime. This planner is the session's first step and its only reader: it decides
// whether the drain may run at all, reads each judgement queue through the EXISTING exporters, and writes a plan
// the session executes (.claude/commands/drain.md). It authors nothing and writes no database row; the only
// writes are the mutation leases it takes for the items it hands out (scripts/lib/mutation-lease.mjs, migration
// 211) and its own local plan file. Free only: no metered model call exists anywhere in this directory.
//
// STEP 0 (CLAUDE.md rule 11: every recurring worker checks a kill switch before work). Before ANY other read,
// the planner reads the switches (switch.mjs): system_state.judgement_drain (migration 354), the emergency stop
// global_processing_paused, and an open fleet-budget-halt flag. Any one of them halts the drain: the planner
// prints `drain: off` and exits 0 having read nothing else (proven in plan-drain.test.mjs by asserting the only
// dependency touched is the switch read). The switch ships OFF and stays off until build is complete (rule 16,
// the population ruling); turning it on is a runbook act (docs/runbooks/maintenance.d/, judgement-drain step).
//
// ORDERING RULE (stated, not implied):
//   1. Kinds run oldest pending first: a kind is ranked by the earliest timestamp any of its pending items
//      carries (created_at, first_seen_at, discovered_at or pending_since); kinds whose items carry no
//      timestamp rank after the dated ones, in KIND_ORDER (kinds.mjs: upstream of the flywheel first).
//   2. One kind per batch file. A batch holds at most the kind's batchSize items (rule 11: fewer firings with
//      larger batches) and a session writes at most maxBatchesPerRun files per kind.
//   3. Within a kind the exporter's own order is kept: each exporter already orders its queue, and re-sorting
//      here would be a second opinion on a query this file does not own.
//
// LEASES. Every item the plan hands out is leased first (acquire_mutation_lease, a stale window long enough for
// a whole session). An item another session holds is left out of the plan and recorded as residue with the
// holder named; it never blocks the rest. `--finish <plan>` releases every lease the plan holds and writes the
// run's harness artifact (family judgement-drain) recording switch state, kinds, counts, leases held and
// released. A crashed session's leases go stale and are claimable, so a lost `--finish` never wedges an item.
//
// SELECTION MODES (lane VERD-1, 2026-10-08). A kind is planned in its default mode "pending" unless it registers
// another (kinds.mjs `modes`). The ledger kind registers "stale": candidates whose committed verdicts are all
// under an older prompt_version, so a stale verdict is re-authored as a NEW verdict under the live prompt (never
// edited in place). `--kind <id or prefix> --mode stale` plans that kind alone in that mode: same exporter (one
// more flag), same lease key (candidate_id), same batch path rule, candidates oldest first. A mode never mixes
// with the default plan, so two modes of one kind cannot be handed the same next batch path in one run.
// `--dry` reads the switch (STEP 0 still applies), exports, and prints the plan, but takes no lease and writes no
// plan file: a read-only look at what a run would hand out.
//
// USAGE
//   node scripts/drain/plan-drain.mjs [--out <plan.json>] [--run-id <id>] [--limit <n>] [--kind <id>] [--mode <mode>] [--dry]
//   node scripts/drain/plan-drain.mjs --finish <plan.json> [--prs <kind=url,kind=url>]
// Exit 0 always for a normal outcome (off, empty, planned, finished): a halted drain is not an error. Exit 1 for
// bad arguments or an unreadable plan. Exit 2 when the credentials are absent AND the drain is on (cannot happen:
// no credentials reads as off, exit 0).

import { parseArgs as nodeParseArgs } from "node:util";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, mkdtempSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { isMainModule } from "../lib/is-main.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { acquireLease, releaseLease } from "../lib/mutation-lease.mjs";
import { KINDS, KIND_ORDER, DEFAULT_MODE, nextBatchPath, exportArgvFor, kindModes, resolveKind } from "./kinds.mjs";
import { readDrainSwitch } from "./switch.mjs";
import { emitJudgementDrainArtifact } from "./artifact.mjs";

export const PLAN_SCHEMA = "judgement-drain-plan-1";
export const LEASE_LANE = "judgement-drain";
/** A lease must outlive a whole session; a crashed session's lease still goes stale and is claimable. */
export const LEASE_STALE_SECONDS = 3 * 60 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_KEYS = ["created_at", "first_seen_at", "discovered_at", "pending_since"];

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");

/** Pure. The earliest timestamp any item carries, as an ISO string, or null when none carries one. */
export function earliestPending(items) {
  let best = null;
  for (const it of items ?? []) {
    for (const k of DATE_KEYS) {
      const v = it?.[k];
      if (typeof v === "string" && !Number.isNaN(Date.parse(v)) && (best === null || Date.parse(v) < Date.parse(best))) best = v;
    }
  }
  return best;
}

/** Pure. Rank kinds: dated kinds oldest first, then undated kinds in KIND_ORDER. @param {{id:string, earliest:string|null}[]} rows */
export function orderKinds(rows) {
  const rank = (id) => { const i = KIND_ORDER.indexOf(id); return i === -1 ? KIND_ORDER.length : i; };
  return [...rows].sort((a, b) => {
    if (a.earliest && b.earliest && a.earliest !== b.earliest) return Date.parse(a.earliest) - Date.parse(b.earliest);
    if (a.earliest && !b.earliest) return -1;
    if (!a.earliest && b.earliest) return 1;
    return rank(a.id) - rank(b.id);
  });
}

/**
 * Pure. The stale selection: keep an exported item only if it carries a verdict under a prompt_version other than
 * the live one, oldest candidate (first_seen_at) first, ties by candidate id. An item with no verdict_prompt_version
 * is not stale and is dropped; the exporter already selects, this is the plan-level guard that a stale plan never
 * lists a row whose verdict is current. @param {object[]} items @param {string} currentVersion
 */
export function selectStaleItems(items, currentVersion) {
  const t = (v) => { const n = Date.parse(v); return Number.isNaN(n) ? Infinity : n; };
  return (items ?? [])
    .filter((it) => typeof it?.verdict_prompt_version === "string" && it.verdict_prompt_version !== currentVersion)
    .sort((a, b) => t(a.first_seen_at) - t(b.first_seen_at) || String(a.candidate_id ?? a.id ?? "").localeCompare(String(b.candidate_id ?? b.id ?? "")));
}

/**
 * Plan one drain run. Pure over injected deps; writes nothing itself.
 * @param {object} deps
 * @param {() => Promise<import("./switch.mjs").DrainSwitchState>} deps.readSwitch
 * @param {(kind: object, o: {limit: number, mode: string}) => Promise<{ok: boolean, items: object[], source?: object, error?: string, current_prompt_version?: string|null}>} deps.exportQueue
 * @param {(kind: object) => string[]} deps.listBatchDir
 * @param {(itemId: string, holder: string, lane: string, staleSeconds: number) => Promise<{acquired: boolean, cur_holder?: string}>} deps.acquire
 * @param {() => string} deps.now
 * @param {object} o
 * @param {string} o.runId
 * @param {number} [o.limit]  per-kind export limit (default: maxBatchesPerRun * batchSize)
 * @param {string|null} [o.kindId]  plan only this kind (required for a mode other than "pending")
 * @param {string} [o.mode]  selection mode, "pending" by default; a kind must register any other (kinds.mjs)
 * @param {boolean} [o.dry]  take no lease: the plan lists what a run would lease (entry.would_lease)
 */
export async function planDrain(deps, { runId, limit = null, kindId = null, mode = DEFAULT_MODE, dry = false }) {
  const holder = `drain-${runId}`;
  const only = kindId ? KINDS.find((k) => k.id === kindId) : null;
  if (kindId && !only) throw new Error(`planDrain: unknown kind "${kindId}"`);
  if (mode !== DEFAULT_MODE) {
    if (!only) throw new Error(`planDrain: mode "${mode}" requires a kind`);
    if (!kindModes(only).includes(mode)) throw new Error(`kind ${only.id} has no mode "${mode}" (modes: ${kindModes(only).join(", ")})`);
  }
  const sw = await deps.readSwitch(); // STEP 0: the first and, when off, the only read.
  if (!sw.on) {
    return { schema: PLAN_SCHEMA, run_id: runId, generated_at: deps.now(), drain: "off", switch: sw, holder, kinds: [], leases: [], totals: { kinds_planned: 0, batches: 0, items: 0, leases_held: 0 } };
  }

  /** @type {object[]} */ const raw = [];
  for (const kind of only ? [only] : KINDS) {
    const want = limit ?? kind.batchSize * kind.maxBatchesPerRun;
    const res = await deps.exportQueue(kind, { limit: want, mode });
    let items = res.ok && Array.isArray(res.items) ? res.items : [];
    let error = res.ok ? null : (res.error ?? "export failed");
    let notStale = 0;
    if (mode === "stale" && res.ok) {
      if (typeof res.current_prompt_version !== "string" || !res.current_prompt_version) {
        error = "stale export did not report the live prompt_version, so staleness cannot be decided";
        items = [];
      } else {
        const kept = selectStaleItems(items, res.current_prompt_version);
        notStale = items.length - kept.length;
        items = kept;
      }
    }
    raw.push({ kind, items, source: res.source ?? null, error, notStale, earliest: earliestPending(items), id: kind.id });
  }

  /** @type {object[]} */ const leases = [];
  const kinds = [];
  for (const r of orderKinds(raw)) {
    const { kind } = r;
    const entry = { kind: kind.id, mode, label: kind.label, pending_exported: r.items.length + r.notStale, export_error: r.error, source: r.source, earliest_pending: r.earliest,
      apply_workflow: kind.applyWorkflow, apply_trigger: `push to master touching ${kind.batchDir}/${kind.batchPrefix}-*.json`, authoring_guide: kind.authoringGuide,
      batch_size: kind.batchSize, batches: [], residue: { lease_held: [], over_cap: 0, ...(mode === "stale" ? { not_stale: r.notStale } : {}) } };
    const cap = kind.batchSize * kind.maxBatchesPerRun;
    const take = r.items.slice(0, cap);
    entry.residue.over_cap = Math.max(0, r.items.length - take.length);
    const existing = deps.listBatchDir(kind);
    const wouldLease = new Set();
    /** @type {string[]} */ let current = [];
    const batches = [];
    const flush = () => { if (current.length) { batches.push(current); current = []; } };
    for (const item of take) {
      const id = String(item?.[kind.idKey] ?? "");
      if (!id) continue;
      const leaseId = kind.leaseKey ? String(item?.[kind.leaseKey] ?? "") : "";
      if (leaseId) {
        if (!UUID_RE.test(leaseId)) { entry.residue.lease_held.push({ id, holder: null, reason: "lease key is not a uuid" }); continue; }
        if (dry) {
          // A dry plan takes no lease: it counts the distinct keys a real run would lease.
          wouldLease.add(leaseId);
        } else if (!leases.some((l) => l.lease_id === leaseId)) {
          const got = await deps.acquire(leaseId, holder, LEASE_LANE, LEASE_STALE_SECONDS);
          if (!got.acquired && got.cur_holder !== holder) { entry.residue.lease_held.push({ id, holder: got.cur_holder ?? null, reason: "leased by another session" }); continue; }
          if (got.acquired) leases.push({ kind: kind.id, id, lease_id: leaseId, holder, released: false });
        }
      }
      current.push(id);
      if (current.length >= kind.batchSize) flush();
    }
    flush();
    entry.batches = batches.map((ids, i) => ({ batch_path: nextBatchPath(kind, existing, i), item_ids: ids, count: ids.length }));
    if (dry) entry.would_lease = wouldLease.size;
    kinds.push(entry);
  }

  const planned = kinds.filter((k) => k.batches.length > 0);
  return {
    schema: PLAN_SCHEMA, run_id: runId, generated_at: deps.now(), drain: "on", ...(dry ? { dry: true } : {}), switch: sw, holder, kinds, leases,
    totals: { kinds_planned: planned.length, batches: planned.reduce((a, k) => a + k.batches.length, 0), items: planned.reduce((a, k) => a + k.batches.reduce((b, x) => b + x.count, 0), 0), leases_held: leases.length },
  };
}

/**
 * Release every lease a plan holds. Pure over injected deps; returns the plan with `released` set per lease.
 * A release failure is recorded, never thrown (a stale lease is claimable anyway).
 * @param {object} plan
 * @param {(itemId: string, holder: string) => Promise<boolean>} release
 */
export async function releasePlanLeases(plan, release) {
  const leases = [];
  for (const l of plan.leases ?? []) {
    let released = false; let error = null;
    try { released = await release(l.lease_id, l.holder); } catch (e) { error = e instanceof Error ? e.message : String(e); }
    leases.push({ ...l, released, release_error: error });
  }
  return { ...plan, leases };
}

/** Pure CLI parse. @param {string[]} argv */
export function parseArgs(argv) {
  let values;
  try {
    ({ values } = nodeParseArgs({
      args: Array.isArray(argv) ? argv : [],
      options: { out: { type: "string" }, "run-id": { type: "string" }, limit: { type: "string" }, finish: { type: "string" }, prs: { type: "string" }, kind: { type: "string" }, mode: { type: "string" }, dry: { type: "boolean", default: false } },
      allowPositionals: false, strict: true,
    }));
  } catch (err) { return { ok: false, error: err.message }; }
  const limit = values.limit === undefined ? null : Number(values.limit);
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) return { ok: false, error: "--limit must be a positive integer" };
  if (values.finish && (values.kind !== undefined || values.mode !== undefined || values.dry)) return { ok: false, error: "--finish cannot be combined with --kind, --mode or --dry" };
  let kind = null;
  if (values.kind !== undefined) {
    kind = resolveKind(values.kind);
    if (!kind) return { ok: false, error: `--kind must be a drain kind id or a prefix naming exactly one (got ${JSON.stringify(values.kind)}; kinds: ${KINDS.map((k) => k.id).join(", ")})` };
  }
  const mode = values.mode ?? DEFAULT_MODE;
  if (mode !== DEFAULT_MODE) {
    if (!kind) return { ok: false, error: `--mode ${mode} requires --kind (a mode belongs to one kind)` };
    if (!kindModes(kind).includes(mode)) {
      return { ok: false, error: values.mode !== undefined && !KINDS.some((k) => kindModes(k).includes(mode)) ? `--mode must be one of ${[...new Set(KINDS.flatMap(kindModes))].join(", ")} (got ${JSON.stringify(mode)})` : `kind ${kind.id} has no mode "${mode}" (modes: ${kindModes(kind).join(", ")})` };
    }
  }
  return { ok: true, out: values.out ?? null, runId: values["run-id"] ?? null, limit, finish: values.finish ?? null, prs: values.prs ?? null, kind: kind ? kind.id : null, mode, dry: values.dry === true };
}

/** Pure. A run id when none is given: UTC timestamp to the second. @param {string} iso */
export function defaultRunId(iso) { return iso.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").replace("T", "t"); }

// ── production deps (only built when the drain is on; db.mjs and the exporters need npm) ─────────────────────

/** Run one existing exporter CLI and read what it wrote. Never rewrites an export query. */
export function runExporter(kind, { limit, mode = DEFAULT_MODE }, { spawn = spawnSync, readdir = readdirSync, readFile = readFileSync, mkdtemp = mkdtempSync, cwd = FSI_ROOT } = {}) {
  const out = mkdtemp(join(tmpdir(), `drain-${kind.id}-`));
  const exportArgv = exportArgvFor(kind, mode);
  const argv = exportArgv.map((a) => a.replace("{out}", out).replace("{limit}", String(limit)));
  const res = spawn(process.execPath, argv, { cwd, encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024 });
  if (res.error || res.status !== 0) return { ok: false, items: [], error: `${exportArgv[0]} exited ${res.status ?? "?"}: ${String(res.stderr || res.error?.message || "").split("\n").slice(-3).join(" ").slice(0, 300)}` };
  if (kind.id === "record-briefs") return readBriefQueue(res.stdout, { spawn, cwd });
  const file = readdir(out).filter((n) => n.startsWith(kind.bundleGlobPrefix) && n.endsWith(".json")).sort().pop()
    ?? (kind.id === "ledger-verdicts" ? "ledger-candidates.json" : null);
  if (!file) return { ok: true, items: [], source: { type: "file", path: null } };
  const path = join(out, file);
  const json = JSON.parse(readFile(path, "utf8"));
  // current_prompt_version: the exporter reports the live prompt_version it exported under (the ledger exporter
  // does, as `prompt_version`); a stale-mode plan needs it to decide staleness and refuses to guess without it.
  return { ok: true, items: Array.isArray(json?.[kind.itemsKey]) ? json[kind.itemsKey] : [], source: { type: "file", path }, current_prompt_version: typeof json?.prompt_version === "string" ? json.prompt_version : null };
}

/** The brief queue is harness_runs rows read through its one consumer: `--list`, then `--run-id` per row. */
function readBriefQueue(listStdout, { spawn, cwd }) {
  const runIds = [...String(listStdout).matchAll(/^\s+(brief-export-run-\d+)\s/gm)].map((m) => m[1]);
  const items = [];
  for (const runId of runIds) {
    const res = spawn(process.execPath, ["scripts/turns/read-brief-export-queue.mjs", "--run-id", runId], { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    if (res.status !== 0) return { ok: false, items, error: `read-brief-export-queue --run-id ${runId} exited ${res.status}` };
    const content = JSON.parse(res.stdout);
    for (const it of content.per_item ?? []) items.push({ id: it.id, queue_run_id: runId });
  }
  return { ok: true, items, source: { type: "queue", command: "node scripts/turns/read-brief-export-queue.mjs --run-id <queue_run_id>", run_ids: runIds } };
}

/**
 * The planning half of the CLI over injected I/O (so a dry run is provable on fixtures): plan, then print, and
 * write the plan file only when not dry. Returns the exit code (0 for every normal outcome).
 * @param {{kind: string|null, mode: string, dry: boolean, limit: number|null, runId: string|null}} parsed parseArgs result
 * @param {{deps: object, now: () => string, runId?: string, planPath: (runId: string) => string, writePlan: (path: string, text: string) => void, log: (line: string) => void}} io
 */
export async function runPlanCli(parsed, { deps, now, runId, planPath, writePlan, log }) {
  const id = runId ?? parsed.runId ?? defaultRunId(now());
  const plan = await planDrain(deps, { runId: id, limit: parsed.limit, kindId: parsed.kind, mode: parsed.mode, dry: parsed.dry });
  if (plan.drain === "off") {
    log(`drain: off (${plan.switch.reason})`);
    return 0;
  }
  const t = plan.totals;
  const counts = `${t.items} item(s) in ${t.batches} batch(es) across ${t.kinds_planned} kind(s)`;
  if (plan.dry) {
    log(`drain: on (dry run: nothing written, no lease taken). ${counts}`);
  } else {
    const out = planPath(id);
    writePlan(out, JSON.stringify(plan, null, 2));
    log(`drain: on. ${counts}; ${t.leases_held} lease(s) held; plan ${out}`);
  }
  for (const k of plan.kinds) {
    const planned = k.batches.reduce((a, b) => a + b.count, 0);
    const tag = k.mode === DEFAULT_MODE ? "" : ` [${k.mode}]`;
    log(`  ${k.kind}${tag}: exported ${k.pending_exported}, planned ${planned} in ${k.batches.length} batch(es)${k.export_error ? `, export error: ${k.export_error}` : ""}${k.residue.lease_held.length ? `, ${k.residue.lease_held.length} lease-held` : ""}${k.residue.not_stale ? `, ${k.residue.not_stale} not stale` : ""}${plan.dry ? `, would lease ${k.would_lease ?? 0}` : ""}`);
    if (plan.dry) for (const b of k.batches) log(`    ${b.batch_path}: ${b.item_ids.join(", ")}`);
  }
  return 0;
}

async function main() {
  loadLocalEnvFile();
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) { console.error(`plan-drain: ${parsed.error}`); process.exit(1); }
  const now = () => new Date().toISOString();

  if (parsed.finish) {
    let plan;
    try { plan = JSON.parse(readFileSync(resolve(parsed.finish), "utf8")); } catch (e) { console.error(`plan-drain: cannot read plan ${parsed.finish}: ${e.message}`); process.exit(1); }
    let released = plan;
    if (plan.drain === "on" && (plan.leases ?? []).length > 0) {
      const { readClient } = await import("../lib/db.mjs");
      const sb = readClient();
      released = await releasePlanLeases(plan, (id, holder) => releaseLease(sb, id, holder));
    }
    const prs = Object.fromEntries(String(parsed.prs ?? "").split(",").filter(Boolean).map((p) => p.split("=")));
    const path = emitJudgementDrainArtifact({ plan: released, prs, finishedAt: now() });
    console.log(`plan-drain: leases held ${released.leases.length}, released ${released.leases.filter((l) => l.released).length}; artifact ${path}`);
    process.exit(0);
  }

  const runId = parsed.runId ?? defaultRunId(now());
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // The production deps are lazy: STEP 0 builds none of them, so an off drain imports nothing that needs npm.
  let sb = null;
  const deps = {
    readSwitch: () => readDrainSwitch(url, key),
    exportQueue: async (kind, o) => runExporter(kind, o),
    listBatchDir: (kind) => { const d = resolve(FSI_ROOT, kind.batchDir); return existsSync(d) ? readdirSync(d) : []; },
    acquire: async (id, holder, lane, stale) => {
      if (!sb) { const { readClient } = await import("../lib/db.mjs"); sb = readClient(); }
      return acquireLease(sb, id, holder, lane, stale);
    },
    now,
  };
  const code = await runPlanCli(parsed, {
    deps, now, runId,
    planPath: (id) => resolve(parsed.out ?? join(FSI_ROOT, "scripts", "tmp", "drain", `plan-${id}.json`)),
    writePlan: (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); },
    log: (line) => console.log(line),
  });
  process.exit(code);
}

if (isMainModule(import.meta.url)) await main();
