/** PLAN-QUARANTINE-DISPOSITION -- the per-item disposition PLANNER the research-or-erase invariant was
 *  missing (lane QUARANTINE-DISPOSITION, 2026-09-28; docs/plans/data-machine-tool-gaps-2026-09-25.md
 *  build order step 5; audit finding RW-3: 66/78 live-quarantined items past DWELL_BOUND_DAYS with no
 *  recorded disposition).
 *
 *  GOVERNING SKILL: remediation-discipline Section 2.1 (Quarantine Is an Open Investigation --
 *  research-or-erase) + Section 2.2 (Deferred vs Undispositioned). Disposition vocabulary (verbatim from
 *  Section 2.1): "recovered / archived / registered / erased; each removes the item from the
 *  live-quarantined set" -- OR a valid time-bounded DEFERRAL, which is dispositioning-as-BLOCKED, never
 *  silencing (Section 2.2).
 *
 *  WHAT EXISTED BEFORE THIS LANE, REUSED HERE UNMODIFIED (no second copy of any of these, per the
 *  lane-common-contract "Prior art" rule):
 *    - scripts/regen-quarantined.mjs's `runResolver` -- the RECOVER half: $0 cheap-verify against the
 *      item's stored snapshot, decides verified_cheap / stale_flag / needs_acquire per item.
 *    - scripts/lib/quarantine-dwell.mjs's `computeQuarantineDwell` -- the DWELL/ENQUEUE classification
 *      (also new this lane, extracted from quarantine-disposition-audit.mjs so both tools agree).
 *    - scripts/maintenance/apply-deferrals.mjs -- the DEFER-write applier: takes a reviewed JSON array of
 *      {item_id, reason, deferred_until, owner, resolution_event} rows and writes one open integrity_flags
 *      row per valid row via the guarded db.mjs insert path.
 *
 *  WHAT WAS MISSING AND IS BUILT HERE: nothing produced that reviewed JSON array automatically. This
 *  planner is that missing piece -- it reads live-quarantined items + open flags, gets a RECOVER verdict
 *  per eligible item from the reused resolver, classifies every item's DWELL state via the reused
 *  computation, and for every item that is PAST-BOUND, NOT recovered this run, and carries no valid
 *  deferral, builds a deferral-candidate row with a reason NAMED by the specific blocking class (never a
 *  vague "needs review" -- scripts/lib/deferral.mjs's isValidDeferral rejects that shape mechanically).
 *
 *  DOWNSTREAM (rule 17 -- nothing in this build runs alone): the plan this tool writes is the direct input
 *  to `node scripts/maintenance/apply-deferrals.mjs --mode apply --arg <plan-file>`; --apply here builds
 *  that file and can dispatch the applier itself (still --mode dry against the applier, since the actual
 *  integrity_flags write is a live data write held under R14 -- see the CLI section below). The applier
 *  write is NOT reimplemented here.
 *
 *  HARNESS RECORD (rule 17's other half): every run, dry or apply, writes this family's own run artifact
 *  (scripts/harness-runs/quarantine-disposition/) and best-effort records it to the `harness_runs` table
 *  via scripts/lib/record-harness-run.mjs -- that insert is operational metadata, never customer data, so
 *  it is NOT held by R14 (same classification the tool-gaps register gives the dispatch ledger and the
 *  maintenance-family artifact convention).
 *
 *  DRY-RUN default; --apply writes plan.json and, if --dispatch-apply-deferrals is ALSO passed, calls
 *  scripts/maintenance/apply-deferrals.mjs's own main() in --mode dry (never apply, from this CLI, while
 *  R14 holds) against the plan file it just wrote, so the two tools' hand-off is exercised for real without
 *  ever writing a row.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { readClient, readAll } from "./lib/db.mjs";
import { computeQuarantineDwell, DWELL_BOUND_DAYS } from "./lib/quarantine-dwell.mjs";
import { isValidDeferral } from "./lib/deferral.mjs";
import { runResolver, HOLD_TYPES } from "./regen-quarantined.mjs";
import { verifyItem } from "../src/lib/sources/verify-item.mjs";
import { getSnapshot } from "../src/lib/sources/snapshot-store.mjs";
import { probeFreshness } from "../src/lib/sources/freshness-probe.mjs";
import { cheapVerifyClaims } from "../src/lib/sources/cheap-verify.mjs";
import { loadLocalEnvFile } from "./lib/env-file.mjs";
import { writeRunArtifact, buildRunArtifactEnvelope, claimRunId, hashHarnessVersion } from "./lib/run-artifact.mjs";
import { GOVERNING_FILES } from "./harness-runs/governing-files.mjs";
// nextRunNumberFromHarnessRuns / buildHarnessRunsClient: extracted (lane STATUTORY-WRITER, 2026-09-28) to
// scripts/lib/harness-run-number.mjs, shared with write-statutory.mjs's identical need -- F45
// (duplicate-code) flagged the two near-identical copies as a regression the moment a second
// harness-record-writing script copied this module's own shape. See that module's own header for the
// full "why a shared home, not a second copy" reasoning (originally written here 2026-09-28, run
// 36446625925, on the `readClient()` guard-proxy-vs-genuine-write-client distinction).
import { nextRunNumberFromHarnessRuns, buildHarnessRunsClient as buildHarnessRunsClientShared } from "./lib/harness-run-number.mjs";
export { nextRunNumberFromHarnessRuns };

export const FAMILY = "quarantine-disposition";

const buildHarnessRunsClient = () => buildHarnessRunsClientShared("plan-quarantine-disposition");

// Deferral policy (operator-tunable; see remediation-discipline Section 2.2 for the vocabulary this must
// satisfy -- scripts/lib/deferral.mjs's isValidDeferral is the mechanical gate every candidate below is
// built to pass, verified by this file's own test suite against that exact function).
const DEFERRAL_WINDOW_DAYS = 30;
const DEFAULT_OWNER = "coordinator";

/** Reason-class templates. Each MUST satisfy scripts/lib/deferral.mjs's isValidDeferral (>=30 chars,
 *  references a disposition-path keyword) -- checked by this module's own test suite, not asserted here. */
const REASON_CLASS = Object.freeze({
  needs_acquire: {
    reason: "Needs-acquire: cheap verification found no usable stored snapshot to re-ground the item's " +
      "FACT spans from; blocked pending the operator-gated paid re-ground (Phase-3, GROUNDING_ACQUIRE_ENABLED).",
    resolution_event: "GROUNDING_ACQUIRE_ENABLED flipped true and a Phase-3 paid re-ground run completes for this item",
  },
  stale_snapshot: {
    reason: "Stale-snapshot: the source appears to have changed since capture (freshness probe); blocked " +
      "pending the Phase-3 paid re-acquire path to re-ground against the current text.",
    resolution_event: "a Phase-3 re-acquire run captures the current source text for this item",
  },
  held_type_q2_gate: {
    reason: "Held item_type (research_finding/technology/tool/innovation) is excluded from automated " +
      "re-ground pending the Q2 calibration spec; blocked until the operator ratifies and register the " +
      "calibration criteria for this class.",
    resolution_event: "the Q2 calibration spec is ratified and this item_type is unblocked for automated re-ground",
  },
  provenance_gate_insufficient: {
    reason: "Cheap-verify confirms the item's grounded spans still hold, but it still fails the full " +
      "provenance gate (floors/slots); blocked pending a manual re-ground/regenerate pass to satisfy the " +
      "still-failing criterion.",
    resolution_event: "a manual regeneration pass re-runs validate_item_provenance and the item passes",
  },
  verify_error: {
    reason: "The cheap-verify step errored for this item; blocked pending investigation of the failure " +
      "before a re-ground attempt is retried.",
    resolution_event: "the verify-item error is diagnosed and a retried cheap-verify pass completes",
  },
});

/** Build one deferral-candidate row (apply-deferrals.mjs's reviewed-JSON contract) for a given reason
 *  class. Pure; `now` is injectable for deterministic tests. Throws if the built payload is somehow not a
 *  valid deferral (a programming error in REASON_CLASS, never an expected runtime path). */
export function buildDeferralCandidate(itemId, reasonClassKey, now = new Date()) {
  const cls = REASON_CLASS[reasonClassKey];
  if (!cls) throw new Error(`plan-quarantine-disposition: unknown reason class '${reasonClassKey}'`);
  const deferred_until = new Date(now.getTime() + DEFERRAL_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const payload = { item_id: itemId, reason: cls.reason, deferred_until, owner: DEFAULT_OWNER, resolution_event: cls.resolution_event };
  const verdict = isValidDeferral({ reason: payload.reason, deferred_until: payload.deferred_until, owner: payload.owner, resolution_event: payload.resolution_event }, now);
  if (!verdict.ok) throw new Error(`plan-quarantine-disposition: reason class '${reasonClassKey}' built an invalid deferral: ${verdict.error}`);
  return { ...payload, reason_class: reasonClassKey };
}

/**
 * Classify every live-quarantined item into a planned disposition. Pure function over pre-fetched data --
 * no I/O. `cheapDecisionByItemId` maps item id -> the regen-quarantined.mjs resolver's own per-item
 * decision object `{ outcome, error? }` (outcome one of "cheap-ok-still-quarantined" / "stale-snapshot" /
 * "needs-acquire" / "error"; absent for HELD_TYPES, which the resolver never attempts).
 * @param {{ items: object[], flags: object[], cheapDecisionByItemId: Map<string,{outcome:string,error?:string}>, now?: Date }} args
 * @returns {{ plan: object[], counts: Record<string,number>, deferralCandidates: object[] }}
 */
export function planDispositions({ items, flags, cheapDecisionByItemId, now = new Date() }) {
  const dwell = computeQuarantineDwell({ items, flags, now });
  const byId = new Map((items || []).map((it) => [it.id, it]));
  const plan = [];
  const deferralCandidates = [];
  const counts = {};
  const bump = (k) => { counts[k] = (counts[k] || 0) + 1; };

  for (const it of dwell.withinBound) {
    plan.push({ item_id: it.id, legacy_id: it.legacy_id || null, disposition: "within_bound", ageDays: it.ageDays });
    bump("within_bound");
  }
  for (const it of dwell.deferred) {
    plan.push({ item_id: it.id, legacy_id: it.legacy_id || null, disposition: "already_deferred", ageDays: it.ageDays, deferred_until: it.deferral.deferred_until });
    bump("already_deferred");
  }
  for (const it of dwell.enqueueMissing) {
    plan.push({ item_id: it.id, legacy_id: it.legacy_id || null, disposition: "enqueue_missing" });
    bump("enqueue_missing");
  }
  for (const it of dwell.undispositioned) {
    const full = byId.get(it.id) || it;
    const decision = cheapDecisionByItemId.get(it.id);
    let reasonClassKey;
    if (HOLD_TYPES.has(full.item_type)) {
      reasonClassKey = "held_type_q2_gate";
    } else if (!decision) {
      // eligible but no decision recorded (should not happen when the caller ran the resolver over every
      // eligible item; treated as needs-acquire-equivalent rather than silently planning nothing).
      reasonClassKey = "needs_acquire";
    } else if (decision.outcome === "error") {
      reasonClassKey = "verify_error";
    } else if (decision.outcome === "stale-snapshot") {
      reasonClassKey = "stale_snapshot";
    } else if (decision.outcome === "needs-acquire") {
      reasonClassKey = "needs_acquire";
    } else {
      // "cheap-ok-still-quarantined": spans verify but the item is still quarantined (a deeper gate
      // criterion, not a source problem).
      reasonClassKey = "provenance_gate_insufficient";
    }
    const candidate = buildDeferralCandidate(it.id, reasonClassKey, now);
    deferralCandidates.push(candidate);
    plan.push({
      item_id: it.id, legacy_id: it.legacy_id || null, disposition: "deferral_candidate",
      reason_class: reasonClassKey, ageDays: it.ageDays, resurrected: it.resurrected,
      cheap_verify_outcome: decision?.outcome ?? null,
    });
    bump(`deferral_candidate:${reasonClassKey}`);
  }

  return { plan, counts, deferralCandidates };
}

// ── Live-DB orchestration (dry: reads only + a harness-run write; apply: also writes plan.json and, with
//    --dispatch-apply-deferrals, exercises the hand-off to apply-deferrals.mjs in ITS OWN dry mode) ──────

async function runCheapVerifyPass({ sb, items, log }) {
  const targets = (items || []).filter((it) => !HOLD_TYPES.has(it.item_type));
  const cheapDecisionByItemId = new Map();
  if (targets.length === 0) return cheapDecisionByItemId;
  const r = await runResolver({ apply: false, limit: Infinity, only: null }, {
    sb, readAll: async () => targets, verifyItem, getSnapshot, probeFreshness, cheapVerifyClaims, log,
  });
  for (const d of r.decisions || []) {
    // decisions carry `key` (legacy_id or id-prefix), not the raw id -- recover the id by matching against
    // the target list the same way runResolver derives `key` itself.
    const match = targets.find((it) => (it.legacy_id || it.id.slice(0, 8)) === d.key);
    if (match) cheapDecisionByItemId.set(match.id, d);
  }
  return cheapDecisionByItemId;
}

/**
 * @param {{ mode: "dry"|"apply", out: string|null, dispatchApplyDeferrals: boolean }} opts
 * @param {{ sb: object, readAllFn: Function, log?: Function, now?: Date, trigger?: string,
 *   familyDir?: string, recordHarnessRunFn?: Function }} deps `familyDir` and `recordHarnessRunFn` are
 *   test-only overrides (default to the real scripts/harness-runs/quarantine-disposition directory and
 *   scripts/lib/record-harness-run.mjs's recordHarnessRun) so a fixture test never writes into the real
 *   family directory or attempts a real DB insert.
 */
export async function runPlanner({ mode = "dry", out = null, dispatchApplyDeferrals = false } = {}, deps) {
  const { sb, readAllFn, log = () => {}, now = new Date(), trigger = "manual", familyDir: familyDirOverride = null, recordHarnessRunFn = null } = deps;
  const startedAt = now.toISOString();

  const items = await readAllFn("intelligence_items", "id,legacy_id,title,item_type,provenance_status,updated_at", {
    match: (q) => q.eq("is_archived", false).eq("provenance_status", "quarantined"),
  });
  const flags = await readAllFn("integrity_flags", "subject_ref,created_at,status,created_by,category,recommended_actions", {
    match: (q) => q.eq("subject_type", "item").eq("status", "open"),
  });

  log(`\n===== PLAN-QUARANTINE-DISPOSITION (${mode === "apply" ? "APPLY -- writes plan.json + harness run" : "DRY-RUN"}) =====`);
  log(`live-quarantined: ${(items || []).length}  |  open item flags: ${(flags || []).length}  |  DWELL_BOUND_DAYS: ${DWELL_BOUND_DAYS}`);

  const cheapDecisionByItemId = await runCheapVerifyPass({ sb, items, log });
  const { plan, counts, deferralCandidates } = planDispositions({ items, flags, cheapDecisionByItemId, now });

  log(`disposition counts: ${JSON.stringify(counts)}`);
  log(`deferral candidates ready for apply-deferrals.mjs: ${deferralCandidates.length}`);

  // ── harness-run artifact (every run, dry or apply -- rule 17's harness-record half) ──────────────────
  const fsiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const familyDir = familyDirOverride || resolve(fsiRoot, "scripts/harness-runs", FAMILY);
  const harnessVersion = hashHarnessVersion(GOVERNING_FILES[FAMILY], fsiRoot);
  // Coordinator ruling, 2026-09-28 (after #813 made harness_runs the durable record of every run):
  // the run_id number comes from harness_runs, not from scanning maintenance-artifact/* branches (a
  // second, soon-retired source of truth this git-scan-only claimRunId can't see -- confirmed live,
  // runs 36446625925/36450334869/36452938188/36457240971 each re-claimed a stale number and collided
  // on harness_runs' own primary key until the branch got hydrated in). readAllFn already reads
  // harness_runs elsewhere in this repo's convention (a plain SELECT, not a write -- readClient()'s
  // guard only blocks .insert/.update/.delete/.upsert, never .select); startAt is claimRunId's own
  // documented override point, so no change to that shared primitive (scripts/lib/run-artifact.mjs,
  // used by every OTHER family) is needed.
  const nextNumber = await nextRunNumberFromHarnessRuns(readAllFn, FAMILY);
  const runId = claimRunId(familyDir, FAMILY, { startAt: nextNumber });

  const perItem = plan.map((p) => ({
    id: p.legacy_id || p.item_id,
    outcome: p.disposition,
    verdict: p.reason_class ? `reason_class=${p.reason_class}` : (p.deferred_until ? `deferred_until=${p.deferred_until}` : null),
    evidence_refs: [],
    error: null,
  }));

  const defectsFound = [];
  if (counts.enqueue_missing) {
    defectsFound.push({
      description: `${counts.enqueue_missing} live-quarantined item(s) carry no open investigation record (ENQUEUE-MISSING) -- the set_provenance_status trigger should have created one on quarantine.`,
      root_cause: "Not investigated by this run; the trigger that stamps the enqueue flag is outside this tool's write set.",
      fix_ref: null,
    });
  }
  const undispositionedTotal = Object.entries(counts).filter(([k]) => k.startsWith("deferral_candidate:")).reduce((s, [, v]) => s + v, 0);
  if (undispositionedTotal > 0) {
    defectsFound.push({
      description: `${undispositionedTotal} live-quarantined item(s) were past-bound (>${DWELL_BOUND_DAYS}d) with no recorded disposition at the start of this run -- the invariant scripts/verify/quarantine-disposition-audit.mjs enforces.`,
      root_cause: "No prior run had planned a disposition for these items (the planner tool this lane builds did not exist before).",
      fix_ref: dispatchApplyDeferrals && mode === "apply"
        ? "this run's own plan.json, handed to scripts/maintenance/apply-deferrals.mjs"
        : "scripts/plan-quarantine-disposition.mjs's own plan (see full_trace_refs) -- apply-deferrals.mjs dispatch is the next step, held under R14 for the actual write",
    });
  }

  const config = { mode, trigger, dwell_bound_days: DWELL_BOUND_DAYS, deferral_window_days: DEFERRAL_WINDOW_DAYS, r14_live_write_held: true };
  const metrics = { live_quarantined: (items || []).length, open_flags: (flags || []).length, ...counts, deferral_candidates: deferralCandidates.length };

  let outPlanPath = null;
  if (mode === "apply" && out) {
    mkdirSync(out, { recursive: true });
    outPlanPath = resolve(out, "plan.json");
    writeFileSync(outPlanPath, JSON.stringify(deferralCandidates.map(({ reason_class: _reason_class, ...row }) => row), null, 2) + "\n");
    log(`wrote ${outPlanPath} (${deferralCandidates.length} deferral candidate row(s) for apply-deferrals.mjs)`);
  }

  let applyDeferralsDryResult = null;
  if (mode === "apply" && dispatchApplyDeferrals && outPlanPath) {
    // Downstream hand-off, exercised for real -- but ALWAYS in the applier's own dry mode while R14 holds
    // (this CLI never passes --mode apply through to apply-deferrals.mjs; the real write is a separate,
    // explicitly-authorized dispatch once R14 lifts).
    const { readFileSync } = await import("node:fs");
    const { main: applyDeferralsMain } = await import("./maintenance/apply-deferrals.mjs");
    applyDeferralsDryResult = await applyDeferralsMain({ mode: "dry", arg: outPlanPath, out: null }, {
      readDeferralsFile: async (p) => JSON.parse(readFileSync(p, "utf8")),
    });
    log(`downstream hand-off (apply-deferrals.mjs --mode dry): ${JSON.stringify(applyDeferralsDryResult.counts)}`);
  }

  const proposerNotes = mode === "apply" && dispatchApplyDeferrals
    ? "Downstream hand-off to apply-deferrals.mjs exercised in ITS dry mode (see config for this run's own mode) -- " +
      "the actual integrity_flags write stays a live data write held under R14 until the operator lifts the build hold."
    : "R14 (2026-09-25/26): zero live data writes this build phase. This run reads live data (harness_runs metadata " +
      "write excepted) and plans; scripts/maintenance/apply-deferrals.mjs's own apply mode is the held write, dispatched " +
      "separately once R14 lifts.";

  const artifact = buildRunArtifactEnvelope({
    family: FAMILY, harnessVersion, runId, startedAt, config,
    inputsRef: ["scripts/lib/quarantine-dwell.mjs", "scripts/regen-quarantined.mjs"],
    perItem, metrics, defectsFound,
    fullTraceRefs: ["docs/audits/supabase-integrity-and-wiring-audit-2026-09-25.md", "docs/plans/data-machine-tool-gaps-2026-09-25.md"],
    proposerNotes,
  });

  const artifactPath = writeRunArtifact(familyDir, artifact);
  log(`wrote ${artifactPath}`);

  let harnessRunRow = null;
  try {
    const recordFn = recordHarnessRunFn || (await import("./lib/record-harness-run.mjs")).recordHarnessRun;
    // NEVER `sb` here: `sb` is (or wraps) scripts/lib/db.mjs's readClient() guard proxy, whose
    // .from(table).insert THROWS by design (rule 015). harness_runs is exempt from that rule (an
    // INSERT is additive, never a mutation -- record-harness-run.mjs's own header), so this call gets
    // its OWN genuine write-capable client, built fresh, matching that module's own CLI section exactly.
    // `recordHarnessRunFn` (test override) bypasses this entirely and is called with `sb` unchanged, so
    // fixture tests never need real credentials.
    const harnessRunsClient = recordHarnessRunFn ? sb : await buildHarnessRunsClient();
    harnessRunRow = await recordFn(harnessRunsClient, artifact, { log });
    if (!harnessRunRow?.ok) log(`record-harness-run: insert did not land (${harnessRunRow?.error ?? "unknown reason"}) -- see harnessRunRow in this run's own return value.`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`record-harness-run: not recorded this run (best-effort): ${msg}`);
    harnessRunRow = { ok: false, error: msg };
  }

  return { runId, artifactPath, plan, counts, deferralCandidates, harnessRunRow, applyDeferralsDryResult, outPlanPath };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────
const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  loadLocalEnvFile();
  const mode = process.argv.includes("--apply") ? "apply" : "dry";
  const outIdx = process.argv.indexOf("--out");
  const out = outIdx >= 0 ? process.argv[outIdx + 1] : null;
  const dispatchApplyDeferrals = process.argv.includes("--dispatch-apply-deferrals");
  const sb = readClient();
  const r = await runPlanner({ mode, out, dispatchApplyDeferrals }, { sb, readAllFn: readAll, log: console.log, trigger: "manual" });
  console.log(`\nplan-quarantine-disposition: run_id=${r.runId} disposition counts=${JSON.stringify(r.counts)}`);
  if (r.harnessRunRow) console.log(`harness_runs: ${JSON.stringify(r.harnessRunRow)}`);
  process.exit(0);
}
