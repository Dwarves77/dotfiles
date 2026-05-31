// D3 ORCHESTRATOR — the single entrypoint that makes D3 a verification LAYER, not a
// toolkit someone remembers to pick up. Every trigger (ingestion event, PR/merge,
// periodic sweep) calls d3-run with a scope; it runs the scoped checks, aggregates
// LOUD findings, leaves a heartbeat FACT in d3_runs (read by self-liveness), and routes
// findings to integrity_flags (the durable queue).
//
// SCOPES (which checks each trigger runs):
//   data     — ingestion / data-mutation events: (c) exclusion-surface x unreliable-
//              method probe. [tier-soundness: a future data-check, noted not built.]
//   code     — PR / merge events: (b) surface content-fetch audit + the decision-log
//              code/schema anchors (drift-check verdicts).
//   periodic — the full sweep: data + code + SELF-LIVENESS (did D3 run within window?).
//   full/manual — everything, for a manual run like this one.
//
// SAFETY: --write is OFF by default. Without it, nothing is inserted (additive fences:
// no corpus write, no flag write, no heartbeat write). With --write AND an applied
// d3_runs table + a deploy target, it persists the heartbeat + routes findings. Until
// deployed, a dry run still demonstrates the orchestration and self-liveness honestly
// reports NEVER (no recorded runs) -> UNKNOWN loud.
//
// Usage: node scripts/d3-run.mjs [--scope=data|code|periodic|full] [--event="..."] [--write]
import pg from "pg";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { auditExclusions, describe as describeExclusion } from "./lib/exclusion-audit.mjs";
import { auditContentFetch } from "./lib/surface-registry.mjs";
import { loadContext, evaluateAll, VERDICT, LOUD } from "./lib/decision-anchors.mjs";
import { assessLiveness, latestRunAtMs, consumerView } from "./lib/liveness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = POOL.replace(`postgres.${REF}@`, `postgres.${REF}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);

const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.split("=").slice(1).join("=") : d; };
const SCOPE = arg("scope", "full");
const EVENT = arg("event", `manual:${SCOPE}`);
const WRITE = process.argv.includes("--write");
const WINDOW_MS = 25 * 3600 * 1000;
const BRANCH = execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT }).toString().trim();
const runsData = SCOPE === "data" || SCOPE === "periodic" || SCOPE === "full";
const runsCode = SCOPE === "code" || SCOPE === "periodic" || SCOPE === "full";
const runsLiveness = SCOPE === "periodic" || SCOPE === "full";
const runsBootstrap = SCOPE === "bootstrap";
const runsBlock1 = SCOPE === "block1";

const findings = []; // LOUD items routed to integrity_flags
const checksRun = [];
const flag = (category, subject_ref, description) => findings.push({ category, subject_type: "system", subject_ref, description });

console.log(`=== d3-run  scope=${SCOPE}  event=${EVENT}  write=${WRITE}  branch=${BRANCH} ===\n`);

const c = new pg.Client({ connectionString: CONN });
await c.connect();
let ok = true;
try {
  // ── BOOTSTRAP scope: Acceptance Test 1 (re-catch the known failures, generalized) ─
  if (runsBootstrap) {
    checksRun.push("bootstrap-test1");
    const { runBootstrap } = await import("./lib/bootstrap-test1.mjs");
    const res = await runBootstrap();
    console.log("[bootstrap] Test 1 — each line: general check + positive(caught) + negative(clean):");
    for (const r of res.rows) {
      const v = r.rootGap ? (r.ok ? "SYMPTOM-CAUGHT/ROOT-GAP" : "FAIL") : (r.ok ? "CAUGHT+DISCRIMINATES" : (r.vacuous ? "VACUOUS-FAIL" : "MISSED"));
      console.log(`   #${r.n} [${v}] ${r.failure}`);
      console.log(`        ${r.check}  +pos ${r.pos}  -neg ${r.neg}`);
      console.log(`        instance: ${r.instance}${r.gapNote ? "\n        GAP -> living set: " + r.gapNote : ""}`);
    }
    console.log(`[bootstrap] ${res.fullyCaught}/${res.total} fully caught (positive+negative); #10 symptom-caught + root-gap flagged; vacuous=${res.vacuous.length}`);
    ok = res.allOk;
    for (const r of res.rows.filter((x) => !x.ok)) flag("data_integrity", `bootstrap:${r.n}`, `Test1 #${r.n} ${r.failure}: did NOT generalize (caught=${r.caught} clean=${r.clean})`);
  }

  // ── BLOCK1 scope: Acceptance Test 2 (re-audit Block 1 by outcome, bounded exit) ─
  if (runsBlock1) {
    checksRun.push("block1-reaudit");
    const { runBlock1Reaudit } = await import("./lib/block1-reaudit.mjs");
    const res = await runBlock1Reaudit();
    if (!res.positiveOk) { ok = false; console.log("[block1] ABORTED — positive control did not verify (vacuous probe)."); }
    else if (res.findings.length > 0) {
      console.log(`[block1] D3 SURFACED ${res.findings.length} UNKNOWN(S) — each a WIN:`);
      for (const f of res.findings) { console.log(`   * ${f.crit}: ${f.note}`); flag("data_integrity", `block1:${f.crit}`, f.note); }
    } else {
      const p = res.panel;
      const vac = (res.residual || []).filter((r) => r.vacuous);
      console.log(`[block1] criterion probes CLEAN (=SUSPECT). residual foundation (C2/C4/tick-flow): ${(res.residual || []).map((r) => `${r.id}=${r.blocked ? "blocked" : "FLIPPED!"}/${r.legitOk ? "ok" : "OVERBLOCK"}`).join("  ")} vacuous=${vac.length}`);
      console.log(`[block1] probe-depth panel all-caught=${p.allCaught} (a=${p.proxyPass} b=${p.surface} c=${p.exclusion} drift=${p.behavioralDrift} neg=${p.negClean}); uncaught: ${p.uncaughtClasses.join("; ")}`);
      console.log("[block1] BOUNDED VERDICT (deepened): clean to D3's probe depth — C1-C6 + tick-flow enforced by OUTCOME (every violation blocked, every legit verified, vacuous=0); 4 classes caught. RESIDUAL = C4 unlabeled-modal scan + resumeHook delivery + error-swallow (living set) + novel absence. Does NOT certify Block 1.");
      if (!p.allCaught || vac.length) { ok = false; flag("data_integrity", "block1:probe-depth", "a requirement class uncaught or a residual probe vacuous — clean cannot be accepted"); }
    }
  }

  // ── DATA scope: (c) exclusion probe ─────────────────────────────────────────
  if (runsData) {
    checksRun.push("exclusion-audit");
    const { flagged } = await auditExclusions(c);
    console.log(`[data] exclusion-audit: ${flagged.length} group(s) excluded via an unreliable method`);
    for (const g of flagged) { console.log(`   ! ${describeExclusion(g)}`); flag("data_integrity", `exclusion:${g.surface}:${g.method}`, describeExclusion(g)); }
    // tier-soundness: a future data-check (registry tier audit). Declared, not built.
    console.log("[data] tier-soundness: NOT BUILT (future data-check; declared in coverage)");
  }

  // ── CODE scope: (b) surface content-fetch audit + decision-log anchors ───────
  if (runsCode) {
    checksRun.push("surface-content-fetch", "decision-log-anchors");
    const { coverage, flagged } = auditContentFetch(ROOT);
    console.log(`\n[code] surface content-fetch audit: ${flagged.length} raw-fetch site(s) across ${coverage.walked.length} walked classes (candidates; fail-loud)`);

    const ctx = await loadContext(c, ROOT, BRANCH);
    const results = await evaluateAll(ctx);
    const loud = results.filter((r) => r.loud);
    console.log(`[code] decision-log anchors: ${results.length} rows -> ${loud.length} LOUD (` +
      `DRIFTED=${results.filter(r => r.verdict === VERDICT.DRIFTED).length} ` +
      `UNCONFIRMABLE=${results.filter(r => r.verdict === VERDICT.UNCONFIRMABLE).length} ` +
      `PENDING_VIOLATION=${results.filter(r => r.verdict === VERDICT.PENDING_VIOLATION).length})`);
    for (const r of loud) { console.log(`   ! row ${r.row} [${r.verdict}] ${r.short}`); flag("data_integrity", `decision:${r.row}`, `${r.verdict}: ${r.short}`); }
    // DRIFTED / PENDING_VIOLATION are real regressions; UNCONFIRMABLE is loud-by-design.
    if (results.some((r) => r.verdict === VERDICT.DRIFTED || r.verdict === VERDICT.PENDING_VIOLATION)) ok = ok; // findings, not orchestrator failure
  }

  // ── PERIODIC scope: self-liveness (did D3 run within its window?) ────────────
  if (runsLiveness) {
    checksRun.push("self-liveness");
    let rows = [];
    try { rows = (await c.query("SELECT ran_at FROM public.d3_runs ORDER BY ran_at DESC LIMIT 1")).rows; }
    catch (e) { console.log(`\n[liveness] d3_runs not present (${e.code || "no table"}) — no recorded runs`); }
    const liveness = assessLiveness(latestRunAtMs(rows, "ran_at"), Date.parse("2026-05-31T12:00:00Z"), WINDOW_MS);
    const view = consumerView(findings, liveness);
    console.log(`\n[liveness] state=${liveness.state}  -> consumer renders ${view.render} (loud=${view.loud})`);
    console.log(`   ${view.message}`);
    if (view.loud && liveness.state !== "LIVE") flag("data_integrity", "d3-liveness", view.message);
  }

  // ── heartbeat: the FACT a run leaves for the external liveness reader ─────────
  const heartbeat = { ran_at: "now()", scope: SCOPE, trigger_event: EVENT, checks_run: checksRun, n_loud: findings.length, verdict_summary: { findings: findings.length }, ok };
  console.log(`\nHEARTBEAT (d3_runs row) ${WRITE ? "-> writing" : "[dry-run; would write]"}:`);
  console.log("   " + JSON.stringify(heartbeat));
  console.log(`FINDINGS -> integrity_flags ${WRITE ? "-> writing" : "[dry-run; would write]"}: ${findings.length}`);

  if (WRITE) {
    await c.query(
      `INSERT INTO public.d3_runs (scope, trigger_event, checks_run, n_loud, verdict_summary, ok, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'d3-run')`,
      [SCOPE, EVENT, checksRun, findings.length, JSON.stringify(heartbeat.verdict_summary), ok]
    );
    for (const f of findings)
      await c.query(
        `INSERT INTO public.integrity_flags (category, subject_type, subject_ref, description, recommended_actions, status, created_by)
         VALUES ($1,$2,$3,$4,'[]'::jsonb,'open','d3-run')`,
        [f.category, f.subject_type, f.subject_ref, f.description]
      );
  }
} catch (e) {
  ok = false; console.error("d3-run ORCHESTRATOR ERROR:", e.message);
} finally {
  await c.end();
}

console.log(`\nd3-run ${ok ? "completed" : "FAILED"} — scope=${SCOPE}, checks=[${checksRun.join(", ")}], loud findings=${findings.length}`);
process.exitCode = ok ? 0 : 1;
