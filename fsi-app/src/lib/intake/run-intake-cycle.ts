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
import { verifyItem } from "@/lib/sources/verify-item.mjs";
import { getSnapshot } from "@/lib/sources/snapshot-store.mjs";
import { probeFreshness } from "@/lib/sources/freshness-probe.mjs";
import { cheapVerifyClaims } from "@/lib/sources/cheap-verify.mjs";
import { CHANGE_SWEEP_STAGED_MARKER } from "@/lib/sources/change-sweep.mjs";

// F6 (plan-intake retired): PLAN mode is the real apply path in dryRun — there is no parallel planIntakeCycle.
// The verdict shape lives here now (the module that owns the cycle), built from the chokepoint's OWN dry verdict.
export type CycleMode = "plan" | "apply";
export interface PlanVerdict {
  title: string;
  source_url: string;
  verdict: "would_mint" | "would_reject";
  /** the mint chokepoint's action verb (minted/retyped/linked/duplicate/unsourced/exists). */
  action?: string;
  /** the chokepoint's own gate flags (congruence:1a, dedup:linked, source-linked, low-relevance, …). */
  flags: string[];
  /** reject reason, verbatim from the chokepoint (entity-gate / dedup / source-link invariant). */
  reason?: string;
}
export interface PlanResult {
  mode: "plan";
  discovered: number;
  wouldMint: number;
  wouldReject: number;
  verdicts: PlanVerdict[];
}

/** The exactly-one F16 signed caller this cycle enters the hold through (see fetch-hold.mjs AUTHORIZED_HOLD_CALLERS). */
export const MANUAL_INTAKE_CALLER = "manual-intake-run";

/** A candidate = the staged_updates.proposed_changes shape for a new_item (title + source_url + item_type + …). */
export interface IntakeCandidate {
  title: string;
  source_url: string;
  item_type: string;
  [k: string]: unknown;
}

export type Disposition =
  | "verified" | "rejected" | "ground_failed" | "stage_failed" | "would_mint" | "would_reject"
  // update_item drain outcomes (see drainChangeSweepUpdates below) — a re-verify, never a mint/ground.
  | "update_applied" | "update_rejected";

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
  /** "new_item" (default — the mint→ground→validate candidates above) or "update_item" (a drained
   *  change-sweep staged row — apply + re-verify only, no mint, no grounding workflow). Lets the one
   *  disposition trail tell the two halves of an invocation apart without a second result array. */
  kind?: "new_item" | "update_item";
}

export interface IntakeCycleResult {
  discovered: number;
  staged: number;
  minted: number;
  rejected: number;
  verified: number;
  groundFailed: number;
  /** change-sweep-originated update_item staged rows this invocation drained (see drainChangeSweepUpdates). */
  updatesDrained: number;
  updatesApproved: number;
  updatesRejected: number;
  /** bounded, like `notSwept`/`notBridged` elsewhere in this chain — rows left pending past UPDATE_DRAIN_LIMIT
   *  this invocation; reported, never silent. */
  updatesNotDrained: number;
  items: CycleItemOutcome[];
}

/**
 * Bound on how many pending change-sweep `update_item` staged rows one invocation drains — the same
 * "small candidate set, one invocation, stop" discipline (RD-20 / the header doctrine above) applied to
 * the update-item side of the chain. Deliberately NOT derived from `candidates.length`: an invocation
 * called with zero new candidates (a drain-only pass) must still bound and still run its own work.
 * Matches the magnitude of the admin route's own new_item cap (MAX_CANDIDATES=5,
 * src/app/api/admin/run-intake/route.ts) without importing across that layer.
 */
export const UPDATE_DRAIN_LIMIT = 5;

/**
 * Drain up to `limit` pending change-sweep-originated `update_item` staged_updates rows — the OTHER half
 * of "closing Step 1 F2" (see change-sweep.mjs's header): change detection now stages these rows, but
 * nothing in production consumed them (human approve/reject is retired — "the machine gates ARE the
 * approval", src/components/admin/AdminDashboard.tsx). This is that consumer, run from inside the SAME
 * one-invocation-and-STOP cycle the new_item candidates above use — no separate loop, no schedule.
 *
 * Identified by CHANGE_SWEEP_STAGED_MARKER (the `reason` prefix `bridgeChangedSourceToStagedUpdates`
 * stamps, change-sweep.mjs) — a hand-staged or other-origin `update_item` row (no marker) is left
 * strictly untouched; this drain exists only to unblock the change-detection chain, not to become a
 * general update_item auto-applier.
 *
 * Per row:
 *   1. APPLY  — applyStagedUpdate, the SAME chokepoint the new_item loop above calls (one write
 *      chokepoint for every staged_updates disposition in this file). `proposed_changes` is always `{}`
 *      here (change-sweep.mjs's own NO-AUTONOMOUS-REWRITE operator constraint — this bridge never
 *      proposes replacement content), so `isSubstantiveUpdate` is false and apply-staged-update.ts's
 *      rule-16 flywheel participation correctly does not fire from an empty, content-free change.
 *   2. RE-VERIFY — the $0 snapshot-first entry, `verifyItem` (src/lib/sources/verify-item.mjs), called
 *      EXPLICITLY here rather than from inside apply-staged-update.ts. This is a deliberate choice
 *      between the two options the task allowed, and the operator constraint decides it: teaching
 *      apply-staged-update.ts's substantive-update boundary to treat an empty `proposed_changes` as
 *      substantive would mean smuggling the change-sweep signal INTO `proposed_changes` so the boundary
 *      trips on it — but that boundary (`NON_SUBSTANTIVE_UPDATE_FIELDS`) is a deny-list over
 *      intelligence_items COLUMNS, and the change-sweep signal ("this item's source changed") is never
 *      itself a column value; forcing it into that shape would also violate the very
 *      NO-AUTONOMOUS-REWRITE constraint the empty object exists to enforce, and it would mean
 *      apply-staged-update.ts (forbidden to edit here anyway) now has a SECOND notion of what makes an
 *      update "real" — one content-shaped, one source-driven — for one function to keep straight. Calling
 *      verifyItem explicitly from here instead keeps exactly ONE write chokepoint (applyStagedUpdate, for
 *      every staged_updates disposition) and exactly ONE well-known $0 re-verify entry (verifyItem),
 *      composed in the one place (run-intake-cycle.ts) that already orchestrates a whole-cycle contract
 *      per candidate — the same shape the new_item loop above already uses for its own second step
 *      (generateBriefWorkflow), not a new pattern.
 *      act:true — so a genuinely stale source still gets its CP2 integrity_flags queue row written
 *      (verify-item's own "never silently pass" contract for a demonstrable content change) — but NO
 *      `inventoryMiss` is ever supplied, so verify-item's PAID acquire branch always self-refuses before
 *      any spend (its own refuse-by-default gate, verify-item.mjs). Never the paid path.
 *   3. On a `verified_cheap` outcome, the $0 `validate_item_provenance` RPC is invoked — the same
 *      re-validate call `scripts/regen-quarantined.mjs`'s sanctioned snapshot-first resolver uses — so the
 *      `set_provenance_status` trigger can flip the item if it now passes the full gate (cheap-verify
 *      alone never flips a status; it only confirms the stored spans are still present).
 *
 * Idempotent: every row this drains is stamped status='approved' or 'rejected' before the next row
 * starts, so a later invocation's `status='pending'` filter never re-selects it — the same mechanism the
 * new_item loop's own staged_updates self-update already relies on.
 */
async function drainChangeSweepUpdates(
  sb: SupabaseClient,
  caller: string,
  limit: number
): Promise<{ items: CycleItemOutcome[]; drained: number; approved: number; rejected: number; notDrained: number }> {
  const { data: rows, error: qErr } = await sb
    .from("staged_updates")
    .select("*")
    .eq("update_type", "update_item")
    .eq("status", "pending")
    .like("reason", `${CHANGE_SWEEP_STAGED_MARKER}%`)
    .order("created_at", { ascending: true })
    .limit(limit + 1);
  if (qErr || !rows) {
    // A read failure here must never crash the cycle (the new_item half may still have real work to
    // report) — drain nothing this pass; a later invocation retries the same pending rows.
    return { items: [], drained: 0, approved: 0, rejected: 0, notDrained: 0 };
  }
  const take = rows.slice(0, limit);
  const notDrained = rows.length > limit ? rows.length - limit : 0; // bounded, reported — never silent

  const items: CycleItemOutcome[] = [];
  let approved = 0, rejected = 0;

  for (const row of take as Array<Record<string, unknown>>) {
    const now = new Date().toISOString();
    const rowId = row.id as string | number;
    const itemId = (row.item_id as string | null) ?? null;
    const base: CycleItemOutcome = {
      title: itemId ? `update_item:${itemId}` : `update_item:${rowId}`,
      source_url: (row.source_url as string | null) ?? "",
      stagedId: String(rowId),
      disposition: "update_rejected",
      itemId,
      kind: "update_item",
    };

    if (!itemId) {
      const note = "change-sweep drain: staged row has no item_id — cannot apply or re-verify";
      await sb.from("staged_updates").update({
        status: "rejected", reviewed_by: caller, reviewed_at: now, reviewer_notes: note.slice(0, 480),
      }).eq("id", rowId);
      rejected++;
      items.push({ ...base, reason: note });
      continue;
    }

    // Pre-fetch the item once — feeds both the trail's display title AND verifyItem's own loadItem
    // shape (source_id/source_url), so verifyItem never has to re-query it.
    const { data: itemMeta } = await sb
      .from("intelligence_items")
      .select("title, source_id, source_url, provenance_status")
      .eq("id", itemId)
      .maybeSingle();
    const meta = itemMeta as { title?: string; source_id?: string | null; source_url?: string | null; provenance_status?: string | null } | null;
    if (meta?.title) base.title = meta.title;

    // 1 — APPLY, the SAME chokepoint the new_item loop above uses. proposed_changes is always {} here.
    const applied = await applyStagedUpdate(sb, row);
    if (!applied.success) {
      await sb.from("staged_updates").update({
        status: "rejected", reviewed_by: caller, reviewed_at: now,
        reviewer_notes: (applied.error ?? "machine-rejected").slice(0, 480),
      }).eq("id", rowId);
      rejected++;
      items.push({ ...base, disposition: "update_rejected", reason: applied.error });
      continue;
    }

    // 2 — RE-VERIFY, the $0 snapshot-first entry (see the doc comment above this function for why it is
    // called explicitly here, and why act:true + no inventoryMiss keeps this strictly $0).
    const verifyDeps = {
      getSnapshot, probeFreshness, cheapVerifyClaims,
      loadItem: async () => (meta ? { source_id: meta.source_id ?? null, source_url: meta.source_url ?? null } : null),
      loadClaims: async (client: SupabaseClient, id: string) => {
        const { data } = await client
          .from("section_claim_provenance")
          .select("claim_text, claim_kind, source_span")
          .eq("intelligence_item_id", id);
        return data ?? [];
      },
      env: process.env as Record<string, string | undefined>,
      act: true,
    };
    let verify: Awaited<ReturnType<typeof verifyItem>>;
    try {
      verify = await verifyItem(sb, itemId, verifyDeps);
    } catch (e) {
      // verifyItem's contract is "never throws" except the (unreachable here — no inventoryMiss is ever
      // passed) paid-acquire lock throw; guarded anyway so a re-verify surprise never crashes the cycle.
      verify = {
        itemId, sourceId: meta?.source_id ?? null, outcome: "needs_acquire",
        reason: `re-verify threw: ${e instanceof Error ? e.message : String(e)}`,
        flip: false, flag: null, acted: false, refused: true,
      } as Awaited<ReturnType<typeof verifyItem>>;
    }

    let note: string;
    if (verify.outcome === "verified_cheap") {
      const { error: rpcErr } = await sb.rpc("validate_item_provenance", { p_item_id: itemId });
      const { data: fin } = await sb.from("intelligence_items").select("provenance_status").eq("id", itemId).maybeSingle();
      const nowProvenance = (fin as { provenance_status?: string } | null)?.provenance_status ?? null;
      note = rpcErr
        ? `verified_cheap ($0) — validate_item_provenance RPC failed: ${rpcErr.message}`
        : `verified_cheap ($0) — validate_item_provenance re-run; provenance now '${nowProvenance ?? "unknown"}'`;
    } else if (verify.outcome === "stale_flag") {
      note = `stale_flag — ${verify.reason}; queued (CP2 integrity_flags) for operator-ruled paid re-acquire, never fetched`;
    } else {
      const refused = "refused" in verify && verify.refused;
      note = `needs_acquire — ${verify.reason}${refused ? " (paid path refused: no data-existence citation; never armed)" : ""}`;
    }

    await sb.from("staged_updates").update({
      status: "approved", reviewed_by: caller, reviewed_at: now, materialized_at: now,
      materialization_error: null,
      reviewer_notes: `change-sweep re-verify: ${note}`.slice(0, 480),
    }).eq("id", rowId);
    approved++;
    items.push({
      ...base,
      disposition: "update_applied",
      reason: note,
      provenance: meta?.provenance_status ?? null,
      evidence: {
        apply: applied.flags?.length ? `applied [${applied.flags.join(",")}]` : "applied",
        verify: verify.outcome,
        verifyReason: verify.reason ?? "",
      },
    });
  }

  return { items, drained: take.length, approved, rejected, notDrained };
}

export async function runIntakeCycle(
  sb: SupabaseClient,
  candidates: IntakeCandidate[],
  opts: { caller?: string; mode?: CycleMode } = {}
): Promise<IntakeCycleResult | PlanResult> {
  // PLAN is read-only + free (F6): run the SAME apply path in dryRun (entity-gate → the mint chokepoint's
  // congruence / dedup / relevance / domain / SOURCE-LINK gates) and STOP before any write. No parallel
  // planner — the dry verdict IS apply minus the INSERT, so it cannot drift. (The retired planIntakeCycle
  // re-derived a SUBSET of these gates, never modeled the source-link invariant, and failed OPEN on a corpus
  // read error where the real mint fails CLOSED.)
  if ((opts.mode ?? "apply") === "plan") {
    const verdicts: PlanVerdict[] = [];
    let wouldMint = 0, wouldReject = 0;
    for (const c of candidates) {
      const dry = await applyStagedUpdate(sb, { update_type: "new_item", proposed_changes: { ...c } }, { dryRun: true });
      const flags = dry.flags ?? [];
      if (dry.success) { wouldMint++; verdicts.push({ title: c.title, source_url: c.source_url, verdict: "would_mint", action: dry.action, flags }); }
      else { wouldReject++; verdicts.push({ title: c.title, source_url: c.source_url, verdict: "would_reject", action: dry.action, flags, reason: dry.error }); }
    }
    return { mode: "plan", discovered: candidates.length, wouldMint, wouldReject, verdicts };
  }
  const caller = opts.caller ?? MANUAL_INTAKE_CALLER;
  const items: CycleItemOutcome[] = [];
  let staged = 0, minted = 0, rejected = 0, verified = 0, groundFailed = 0;

  for (const c of candidates) {
    const now = new Date().toISOString();
    const base: CycleItemOutcome = { title: c.title, source_url: c.source_url, stagedId: null, disposition: "stage_failed", kind: "new_item" };

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
    // A workflow FatalError (global-pause / data-audit-block / daily-cap) is a HALT, not a cycle crash: catch
    // it and record ground_failed with the halt reason, so the disposition trail stays complete and the item
    // stays quarantined (research-or-erase), rather than the whole cycle throwing on one halted item.
    let wf: Awaited<ReturnType<typeof generateBriefWorkflow>>;
    try {
      wf = await generateBriefWorkflow(itemId, false, caller);
    } catch (e) {
      groundFailed++;
      const reason = `workflow halted: ${e instanceof Error ? e.message : String(e)}`;
      items.push({ ...base, disposition: "ground_failed", itemId, provenance: "quarantined", reason, evidence: { mint: `chokepoint:${mat.action ?? "minted"}`, workflow: "halted" } });
      continue;
    }
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
      // (generate_failed / section_failed / reresearch_failed_held / structural_held_for_resource /
      // audit_gate_failed_quarantined), NOT parked.
      groundFailed++;
      items.push({ ...base, disposition: "ground_failed", itemId, provenance, reason: `${wf.status}: ${step("ground") || step("section") || step("generate")}`, evidence });
    }
  }

  // The OTHER half of one invocation: drain pending change-sweep update_item rows (see
  // drainChangeSweepUpdates above). Same caller identity, same bounded/reported/idempotent posture, run
  // whether or not this invocation carried any new_item candidates.
  const drain = await drainChangeSweepUpdates(sb, caller, UPDATE_DRAIN_LIMIT);
  items.push(...drain.items);

  return {
    discovered: candidates.length, staged, minted, rejected, verified, groundFailed,
    updatesDrained: drain.drained, updatesApproved: drain.approved, updatesRejected: drain.rejected,
    updatesNotDrained: drain.notDrained,
    items,
  };
}
