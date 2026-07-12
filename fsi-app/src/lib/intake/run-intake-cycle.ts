// runIntakeCycle — the run-ONE-cycle-and-STOP intake orchestration (Disposition Unit 0c-2).
//
// no-human-finish-of-intake (RD-20 / ADR-012 rider): the machine gates ARE the approval. One invocation
// runs a full cycle over a SMALL candidate set and STOPS — no loop, no re-arm, no schedule side-effect:
//
//   per candidate:
//     STAGE   → insert a staged_updates row (transit-only, RD-20 'pending')
//     MINT    → applyStagedUpdate (entity-gate triage → mint chokepoint: congruence 1a/1b + subject dedup
//               + the ONE INSERT). NO human approve. A machine REJECT marks the staged row rejected-with-
//               reason (transit → terminal); a mint marks it materialized (status=approved + materialized_at).
//     GROUND  → the ONE grounding contract: generateBriefWorkflow(itemId, false, "manual-intake-run") —
//               the SAME workflow /api/agent/run runs (D4 ruling). Awaited DIRECTLY (not via start()), the
//               established off-DevKit synchronous pattern (_happy-path-proof / _loop-proof / _ground-flagships
//               all `await generateBriefWorkflow(...)`), so the cycle inherits the FULL contract — PREFLIGHT
//               (daily-cap, global-pause, data-audit-block), tiered re-ground, research-or-erase, and the
//               fail-closed cross-item AUDIT GATE — and returns the real verdict synchronously, no raw-lib
//               chain that would skip those gates. The F16 "manual-intake-run" SIGNED caller threads through
//               so the fetch passes an engaged hold while the scheduled worker stays blocked.
//     VALIDATE→ the workflow's ground step runs validate_item_provenance (per-type authority FLOORS + required
//               SLOTS + LABELS); the set_provenance_status trigger flips a valid item to 'verified' — no human
//               tick. The workflow returns status='verified' only after the audit gate passes.
//
// Returns the full disposition trail (discovered / staged / minted / rejected+reason / verified). The admin
// surface renders it as VISIBILITY — there are no approve affordances anywhere in the flow.
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyStagedUpdate } from "./apply-staged-update";
import { generateBriefWorkflow } from "@/workflows/generate-brief";
import { planIntakeCycle, type CycleMode, type PlanResult } from "./plan-intake";
export type { CycleMode, PlanResult, PlanVerdict } from "./plan-intake";

/** The exactly-one F16 signed caller this cycle enters the hold through (see fetch-hold.mjs AUTHORIZED_HOLD_CALLERS). */
export const MANUAL_INTAKE_CALLER = "manual-intake-run";

/** A candidate = the staged_updates.proposed_changes shape for a new_item (title + source_url + item_type + …). */
export interface IntakeCandidate {
  title: string;
  source_url: string;
  item_type: string;
  [k: string]: unknown;
}

export type Disposition = "verified" | "rejected" | "ground_failed" | "stage_failed" | "would_mint" | "would_reject";

export interface CycleItemOutcome {
  title: string;
  source_url: string;
  stagedId: string | null;
  disposition: Disposition;
  /** For a reject: which gate acted (entity-gate / the chokepoint action verb). */
  gate?: string;
  /** For a reject / failure: the machine's reason string, verbatim. */
  reason?: string;
  itemId?: string | null;
  provenance?: string | null;
  /** Per-gate evidence chain for the trail (generate/section/ground step details). */
  evidence?: Record<string, string>;
}

export interface IntakeCycleResult {
  discovered: number;
  staged: number;
  minted: number;
  rejected: number;
  verified: number;
  groundFailed: number;
  items: CycleItemOutcome[];
}

export async function runIntakeCycle(
  sb: SupabaseClient,
  candidates: IntakeCandidate[],
  opts: { caller?: string; mode?: CycleMode } = {}
): Promise<IntakeCycleResult | PlanResult> {
  // PLAN is read-only + free (Step 5): evaluate the gates and STOP, no stage/mint/fetch/spend. APPLY fires.
  if ((opts.mode ?? "apply") === "plan") return planIntakeCycle(sb, candidates);
  const caller = opts.caller ?? MANUAL_INTAKE_CALLER;
  const items: CycleItemOutcome[] = [];
  let staged = 0, minted = 0, rejected = 0, verified = 0, groundFailed = 0;

  for (const c of candidates) {
    const now = new Date().toISOString();
    const base: CycleItemOutcome = { title: c.title, source_url: c.source_url, stagedId: null, disposition: "stage_failed" };

    // 1 — STAGE (transit-only, RD-20 'pending')
    const { data: stagedRow, error: stageErr } = await sb
      .from("staged_updates")
      .insert({
        update_type: "new_item",
        proposed_changes: { ...c },
        reason: "manual-intake-run cycle (no-human-finish-of-intake)",
        source_url: c.source_url ?? "",
        status: "pending",
        confidence: "MEDIUM",
      })
      .select("*")
      .single();
    if (stageErr || !stagedRow) {
      items.push({ ...base, disposition: "stage_failed", reason: stageErr?.message ?? "staged insert returned no row" });
      continue;
    }
    staged++;
    base.stagedId = stagedRow.id;

    // 2 — MINT (machine triage → chokepoint). NO human approve.
    const mat = await applyStagedUpdate(sb, stagedRow);
    if (!mat.success) {
      // machine REJECT with reason → the staged row goes transit → REJECTED-with-reason (RD-20 terminal).
      await sb.from("staged_updates").update({
        status: "rejected", reviewed_by: MANUAL_INTAKE_CALLER, reviewed_at: now,
        reviewer_notes: (mat.error ?? "machine-rejected").slice(0, 480),
      }).eq("id", stagedRow.id);
      rejected++;
      items.push({
        ...base,
        disposition: "rejected",
        gate: mat.action ? `chokepoint:${mat.action}` : "entity-gate",
        reason: mat.error,
      });
      continue;
    }
    // materialized (RD-20 resolved state — status=approved + materialized_at, the mint chokepoint's ticket).
    await sb.from("staged_updates").update({
      status: "approved", reviewed_by: MANUAL_INTAKE_CALLER, reviewed_at: now,
      materialized_at: now, materialized_item_id: mat.itemId ?? null, materialization_error: null,
    }).eq("id", stagedRow.id);
    minted++;
    const itemId = mat.itemId as string;

    // 3 — GROUND + 4 — VALIDATE via the ONE grounding contract (D4): generateBriefWorkflow, awaited directly
    // (F16 caller threaded), so the cycle inherits preflight + tiered-retry + research-or-erase + the
    // fail-closed cross-item audit gate. status='verified' only when the audit gate passed.
    const wf = await generateBriefWorkflow(itemId, false, caller);
    const step = (k: keyof typeof wf.steps) => (wf.steps[k] as { detail?: string } | undefined)?.detail ?? "";
    const { data: fin } = await sb.from("intelligence_items").select("provenance_status").eq("id", itemId).single();
    const provenance = (fin as { provenance_status?: string } | null)?.provenance_status ?? null;
    const evidence = {
      mint: `chokepoint:${mat.action ?? "minted"}${mat.flags?.length ? " [" + mat.flags.join(",") + "]" : ""}`,
      workflow: wf.status,
      generate: step("generate"), section: step("section"), ground: step("ground"),
      grow: step("grow"), auditGate: step("auditGate"),
    };

    if (wf.status === "verified" && provenance === "verified") {
      verified++;
      items.push({ ...base, disposition: "verified", itemId, provenance, evidence });
    } else {
      // research-or-erase: a non-verified item stays quarantined with the workflow's terminal status
      // (generate_failed / section_failed / reresearch_failed_erased / audit_gate_failed_quarantined), NOT parked.
      groundFailed++;
      items.push({ ...base, disposition: "ground_failed", itemId, provenance, reason: `${wf.status}: ${step("ground") || step("section") || step("generate")}`, evidence });
    }
  }

  return { discovered: candidates.length, staged, minted, rejected, verified, groundFailed, items };
}
