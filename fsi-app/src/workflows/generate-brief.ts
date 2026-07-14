// THE canonical generation path (Sprint 4 — step 2b). ONE path, real bodies.
//
// The four named steps wrap the canonical-pipeline lib fns
// (src/lib/agent/canonical-pipeline.ts), each PROVEN by direct execution before
// being wrapped here (scripts/canonical-pipeline-proof.mjs: generate -> section ->
// ground -> VERIFIED -> grow on a fresh item). The workflow function only
// ORCHESTRATES; every Node / fetch / Supabase / Anthropic call happens inside a
// "use step" body (full Node access — the "use workflow" sandbox has none).
//
//   budgetGuard -> generate -> section -> ground -> grow
//
// /api/agent/run starts THIS workflow, so it is now the real generation path. The
// prior Block-1 stub step-skeleton and the scripts-as-path are retired (see git
// history): canonical-pipeline.groundBrief already does active sourcing (fetch the
// item + cited URLs, keep only FACT claims whose span is a verbatim substring of
// fetched content) + validate_item_provenance + the manual cleanup-on-invalid
// rollback; growSources runs the proven growSourcesFromBrief.
//
// HC3 spend cap (decision-log row 38): the start() refactor orphaned the old inline
// b2-runner cap. It is reconstituted HERE, in the substrate, reading the existing
// agent_runs.cost_usd_estimated ledger. The cap exists to halt a runaway SCALED
// pass (step 4); a single pull is ~$0.15, far under any sane cap.
import { RetryableError, FatalError, getStepMetadata } from "workflow";

// getStepMetadata() throws OUTSIDE the Workflow DevKit runtime (direct/script/test invocation). The two
// callers already fall back to attempt=1 when metadata is absent — they just need the CALL not to throw,
// so the workflow is runnable in a script/test harness, not only inside Vercel. Inside the DevKit it
// returns the real attempt metadata unchanged. (Hoisted function decl → usable at both call sites.)
function safeStepMetadata(): { attempt?: number } | null {
  try { return getStepMetadata() as { attempt?: number }; } catch { return null; }
}
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { spanCheckFetch, type SpanCheckResult } from "../lib/agent/span-check";
import { getScrapeState, evaluateGenerationPause } from "../lib/api/pause";
import { groundRetryPlan } from "../lib/agent/ground-failure-class.mjs";
// SNAPSHOT-FIRST grounding (RD-24 / F21): groundStep routes through the ONE verify-item entry, which
// cheap-verifies against the stored snapshot ($0, no fetch, no model) BEFORE any paid acquire, and gates
// the paid acquire behind the GROUNDING_ACQUIRE_ENABLED master switch (AcquireLockError while OFF).
import { verifyItem } from "../lib/sources/verify-item.mjs";
import { AcquireLockError } from "../lib/sources/acquire-lock.mjs";
import { getSnapshot } from "../lib/sources/snapshot-store.mjs";
import { probeFreshness } from "../lib/sources/freshness-probe.mjs";
import { cheapVerifyClaims } from "../lib/sources/cheap-verify.mjs";
import {
  generateBrief,
  generateBriefFromStored,
  registerBriefSources,
  sectionBrief,
  groundBrief,
  growSources,
  NO_STORED_POOL,
  type StepResult,
} from "../lib/agent/canonical-pipeline";
import {
  crossItemAuditGate,
  hostTierViolationCount,
  readAllSources,
  readOpenDataAuditBlock,
  hasValidWaiver,
} from "../lib/agent/audit-gate";
import { linkItems } from "../lib/entities/link-items";

// PER-STEP COST ESTIMATES RETIRED (Phase-3a double-count fix, DEEP-AUDIT S3 §3 C4). Since the
// 2026-07-06 per-call telemetry, every model call writes its REAL cost as a fetch_method='spend-call'
// row inside the spend client — so the flat per-step estimates these rows used to carry made the
// daily cap (budgetGuard) and the MTD tile count the same spend twice. Step rows remain as the
// status/audit trail; their cost is 0. The spend-call rows are the single cost ledger.
const EST_GENERATE_USD = 0;
const EST_GROUND_USD = 0;
// Daily estimated-spend ceiling. Override with GENERATION_DAILY_CAP_USD. Raised $5→$25 (operator ruling
// 2026-07-12, Unit 3): the $5 default sat below unit budgets and false-halted remediation; unit ceilings +
// per-item breakers are the operative controls, this is the platform-wide daily backstop.
const DAILY_CAP_USD = Number(process.env.GENERATION_DAILY_CAP_USD ?? 25);

function svc(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

// Best-effort cost telemetry — a failed telemetry write must never block generation.
async function recordRun(sb: SupabaseClient, itemId: string, label: string, costUsd: number, ok: boolean, detail: string) {
  const { data: it, error: itErr } = await sb.from("intelligence_items").select("source_id, source_url").eq("id", itemId).single();
  if (itErr) {
    // SURFACE (B3): recordRun is end-of-run telemetry; a transient read error must NOT fail an
    // otherwise-complete run. Log so the null source attribution on this agent_runs row is explained
    // rather than silent (was: error dropped -> silent null source_id/url with no trace).
    console.warn(`[generate-brief] recordRun: item ${itemId} read failed; recording run with null source attribution: ${itErr.message}`);
  }
  await sb.from("agent_runs").insert({
    intelligence_item_id: itemId,
    source_id: it?.source_id ?? null,
    source_url: it?.source_url ?? null,
    fetch_method: `canonical:${label}`,
    status: ok ? "success" : "error",
    cost_usd_estimated: costUsd,
    ended_at: new Date().toISOString(),
    errors: ok ? [] : [{ step: label, detail }],
  });
}

// ── Canonical steps (durable checkpoints) — real bodies wrapping the proven lib fns ──

// PREFLIGHT GUARD — restores the two cost controls the inline route honored before
// the stub workflow dropped them, REUSING existing infra (no new mechanism):
//   1. Global pause — isGloballyPaused (src/lib/api/pause.ts), the same flag the
//      admin GlobalPauseToggle writes. A paused platform must not spend.
//   2. HC3 spend cap (decision-log row 38) — sum today's estimated Claude spend from
//      the existing agent_runs.cost_usd_estimated ledger (the same ledger MtdSpendTile
//      reads); if at/over the daily cap, HALT before any new Sonnet call.
// FatalError (not Retryable): paused/over-budget is a permanent stop for this run.
export async function preflightStep(itemId: string, caller: string | null = null): Promise<{ spentUsd: number; capUsd: number }> {
  "use step";
  void itemId;
  const sb = svc();
  // PAUSE — pause-is-prohibition / dormancy-is-schedule (RULED 2026-07-12). The split lives in the pure,
  // unit-tested evaluateGenerationPause (pause.ts): emergencyPaused = a HARD stop for ALL callers (the
  // operator's inviolable stop, no caller identity overrides it); cadence==='off' = dormant, halts only
  // AUTONOMOUS generation — an F16-signed manual caller (manual-intake-run) proceeds, since an operator-fired
  // run IS the bidding. This is why the manual-intake path can now GROUND (not just MINT) in the pre-launch
  // state it was built for. The real integrity gates below (data-audit-block, daily-cap) bind everyone.
  const gate = evaluateGenerationPause(await getScrapeState(sb), caller);
  if (gate.halt) {
    throw new FatalError(`generation halted: ${gate.reason}`);
  }
  // LAYER C — BLOCK-NEXT-RUN (enforcement-gap fix, 2026-06-21). The nightly data-audit lane reflects a RED
  // verdict into ONE open integrity_flags block row (DATA_AUDIT_BLOCK) and resolves it on GREEN. Generation
  // HALTS here whenever that block is open and carries no current dated waiver — corpus red is cleared ONLY
  // by a fix (lane goes green -> row resolved) or an explicit, expiring waiver disposition, NEVER by waiting
  // (the seven-red-nights failure was red sitting un-actioned). There is NO skip flag (no escape hatch): the
  // only way past is to record a disposition, so a human is no longer the catch and bad state cannot compound
  // under batch pressure. Fails CLOSED — if the block state cannot be read, generation does not proceed.
  const block = await readOpenDataAuditBlock(sb);
  if (block && !hasValidWaiver(block, new Date())) {
    throw new FatalError(
      `generation blocked: data-audit lane is RED with no current disposition (integrity_flags ${block.id}). ` +
        `Clear it by fixing to green, or record a dated waiver in docs/data-audit-dispositions.md and on the flag ` +
        `(recommended_actions += {action:"waiver", until:"YYYY-MM-DD"}). ${(block.description ?? "").slice(0, 160)}`
    );
  }
  const midnightUtc = new Date(new Date().toISOString().slice(0, 10)).toISOString();
  // B1 FAIL-CLOSED (Phase 0.2): capture the error. If today's spend ledger cannot be read, the daily
  // cost cap cannot be enforced — HALT rather than proceed as if spend were $0 (the prior dropped-error
  // silently DISABLED the cap on any query failure). Mirrors the block-state fail-closed above.
  const { data, error } = await sb.from("agent_runs").select("cost_usd_estimated").gte("started_at", midnightUtc);
  if (error) {
    throw new FatalError(
      `generation halted: cannot read today's spend ledger to enforce the daily cost cap (${error.message}); failing closed`
    );
  }
  const spent = (data ?? []).reduce((s, r) => s + Number(r.cost_usd_estimated || 0), 0);
  if (spent >= DAILY_CAP_USD) {
    throw new FatalError(
      `generation halted: today's estimated spend $${spent.toFixed(2)} >= cap $${DAILY_CAP_USD.toFixed(2)} (raise GENERATION_DAILY_CAP_USD to proceed)`
    );
  }
  return { spentUsd: spent, capUsd: DAILY_CAP_USD };
}

// Generate the format-selected brief (Sonnet). Records est. spend to the ledger.
// GUARD 4 — REUSE-DEFAULT: regeneration reuses stored content unless `refresh` is set or no usable pool
// exists. When not refreshing, try generateBriefFromStored first — it reads the pool persisted BEFORE
// synthesis (Edit A) and re-synthesises with zero Browserless + zero web_search, so a retry or a resumed
// run after a mid-batch network death costs one item's Sonnet compute, not a re-scrape of every prior
// item. The stored-first path NEVER deletes (GUARD 2). Fall back to a fresh fetch ONLY on the explicit
// no-pool sentinel — a synthesis failure on the cached path stays retryable FROM CACHE (re-scraping it
// would defeat the protection).
export async function generateStep(itemId: string, refresh = false, caller: string | null = null): Promise<StepResult> {
  "use step";
  const sb = svc();
  if (!refresh) {
    const stored = await generateBriefFromStored(itemId);
    if (stored.ok) {
      await recordRun(sb, itemId, "generate", EST_GENERATE_USD, true, `${stored.detail} [reused stored pool]`).catch(() => {});
      return stored;
    }
    if (stored.detail !== NO_STORED_POOL) {
      await recordRun(sb, itemId, "generate", 0, false, `stored-path: ${stored.detail}`).catch(() => {});
      return stored; // real failure on the cached path — surface it, do NOT re-scrape
    }
    // else: no usable stored pool → fall through to a fresh fetch + persist.
  }
  // forceRefresh: refresh — reached either via the explicit --refresh lever (deliberate freshness, GUARD 4) or
  // after the stored path returned NO_STORED_POOL (genuine holdings-absence). Either way the fetch is admitted;
  // the holdings guard inside generateBrief only refuses a NON-forced fetch when holdings are actually present.
  const r = await generateBrief(itemId, caller, { forceRefresh: refresh }); // fresh fetch (GUARD 2/4); F16 caller thread (Unit 0c)
  await recordRun(sb, itemId, "generate", r.ok ? EST_GENERATE_USD : 0, r.ok, r.detail).catch(() => {});
  return r;
}

// Register the brief's corroborator sources BEFORE grounding (canonical order: generate -> register ->
// section -> ground -> credit). Best-effort + idempotent; no Sonnet call; never gates the run.
export async function registerStep(itemId: string): Promise<StepResult> {
  "use step";
  return registerBriefSources(itemId);
}

// Format-selected section extraction (no Sonnet call).
export async function sectionStep(itemId: string): Promise<StepResult> {
  "use step";
  return sectionBrief(itemId);
}

// Active-sourcing claim ledger + verbatim span-check + validate_item_provenance
// (Sonnet). The set_provenance_status trigger flips a valid item to verified.
//
// SNAPSHOT-FIRST (RD-24, snapshot-first rebuild PR-2): grounding routes through the ONE verify-item entry.
// verify-item reads the stored snapshot + the item's existing claims and cheap-verifies ($0, no fetch, no
// model). Outcomes:
//   verified_cheap  — existing FACT spans still present in the stored snapshot → NO paid re-ground ($0).
//   stale_flag      — the source demonstrably changed since capture → verify-item queues the
//                     stale_snapshot_content_changed flag; we NEVER fetch and NEVER flip (CP2). Held.
//   needs_acquire   — no usable snapshot / cheap-verify can't confirm → PAID acquire, which is master-switched:
//                     verify-item logs the justification ($0, I2) then asserts GROUNDING_ACQUIRE_ENABLED. OFF →
//                     AcquireLockError → the brief is HELD intact (never erased). ON → we run the real paid
//                     groundBrief extraction (the operator has sanctioned spend for this run).
// A fresh brief has no claims + usually no snapshot → needs_acquire, so live grounding is frozen while the lock
// is OFF and resumes (unchanged) the moment the operator turns it ON. "grounding_frozen"-prefixed details route
// to a hold-without-erase in the workflow below.
export async function groundStep(itemId: string, caller: string | null = null): Promise<StepResult> {
  "use step";
  const sb = svc();
  const deps = {
    getSnapshot,
    probeFreshness,
    cheapVerifyClaims,
    loadItem: async (client: SupabaseClient, id: string) => {
      const { data } = await client.from("intelligence_items").select("source_id, source_url").eq("id", id).single();
      return data ?? null;
    },
    loadClaims: async (client: SupabaseClient, id: string) => {
      const { data } = await client.from("section_claim_provenance").select("claim_text, claim_kind, source_span").eq("intelligence_item_id", id);
      return data ?? [];
    },
    env: process.env as Record<string, string | undefined>,
    // DATA-EXISTENCE citation (operator ruling 2026-07-14): the item is a needs_acquire because holdings
    // (stored snapshot + claim pool) lack a floor-qualifying primary; that IS the inventory miss. Honest,
    // derived from the verify decision — the caller must cite it for the paid path to proceed.
    inventoryMiss: `holdings checked (snapshot-store + section_claim_provenance); no floor-qualifying primary present for item ${itemId} — paid re-ground required`,
    act: true,
  };
  let decision: Awaited<ReturnType<typeof verifyItem>>;
  try {
    decision = await verifyItem(sb, itemId, deps);
  } catch (e) {
    if (e instanceof AcquireLockError) {
      // Grounding administratively FROZEN (GROUNDING_ACQUIRE_ENABLED off). The justification was logged ($0)
      // before the lock threw; the brief is held intact. A re-run grounds it once the operator flips the lock.
      const detail = `grounding_frozen: ${e.message.slice(0, 220)}`;
      await recordRun(sb, itemId, "ground", 0, false, detail).catch(() => {});
      return { ok: false, detail };
    }
    throw e;
  }

  if (decision.outcome === "verified_cheap") {
    const detail = `verified via snapshot cheap-verify ($0, no paid re-ground): ${decision.reason}`;
    await recordRun(sb, itemId, "ground", 0, true, detail).catch(() => {});
    return { ok: true, detail };
  }
  if (decision.outcome === "stale_flag") {
    // CP2: source changed since snapshot; verify-item queued the stale flag. NEVER fetched, NEVER flipped. Held.
    const detail = `grounding_frozen: stale_snapshot_content_changed queued (${decision.reason}); no fetch, no flip`;
    await recordRun(sb, itemId, "ground", 0, false, detail).catch(() => {});
    return { ok: false, detail };
  }
  // needs_acquire: run the paid grounding ONLY if verify-item UNLOCKED it (acted:true — data-existence cited
  // AND the lock is ON). A refused decision (missing citation) or a lock-OFF throw (caught above → frozen) never
  // reaches groundBrief — the acquire lock is the single clean master gate.
  if (!decision.acted) {
    const detail = `grounding_frozen: ${decision.reason}`;
    await recordRun(sb, itemId, "ground", 0, false, detail).catch(() => {});
    return { ok: false, detail };
  }
  // acquire unlocked: NOW run the real paid grounding through the canonical extractor. Sanctioned spend.
  const r = await groundBrief(itemId, caller); // F16 caller thread (Unit 0c)
  await recordRun(sb, itemId, "ground", r.ok ? EST_GROUND_USD : 0, r.ok, r.detail).catch(() => {});
  return r;
}

// Source growth: register surfaced sources, record citations, compound credibility
// (the proven growSourcesFromBrief — no Sonnet call). Non-gating.
export async function growStep(itemId: string): Promise<StepResult> {
  "use step";
  return growSources(itemId);
}

// Entity cross-reference linking (phase-intake-gate piece 3): deterministically wire the entities this
// item's content NAMES (reg#/CELEX/named standards) into item_cross_references (origin=entity_extraction)
// and surface ambiguous/unknown-standard mentions to integrity_flags. No LLM. Non-gating — a link failure
// never invalidates a grounded brief. Moat boundary: writes edges/flags, NEVER grounding citations.
export async function linkStep(itemId: string): Promise<{ edges: number; surfaced: number }> {
  "use step";
  try {
    const r = await linkItems(svc(), itemId);
    return { edges: r.edges, surfaced: r.surfaced };
  } catch (e) {
    console.warn(`[linkStep] non-gating failure for ${itemId}: ${e instanceof Error ? e.message : String(e)}`);
    return { edges: 0, surfaced: 0 };
  }
}

// LAYER B baseline — captures the GLOBAL one-tier-per-host violation count BEFORE this run registers any
// source, so the gate (after grow) can tell a conflict THIS write introduced from the corpus's standing
// violations (which the nightly lane + Layer C disposition own). Read-only.
export async function auditBaselineStep(itemId: string): Promise<{ hostTierViolations: number }> {
  "use step";
  void itemId;
  const sb = svc();
  const sources = await readAllSources(sb);
  return { hostTierViolations: hostTierViolationCount(sources) };
}

// LAYER B gate — the cross-item / corpus audit in the WRITE PATH. The mig-115 trigger has already verified
// the item against the per-item criteria; this step enforces the cross-item invariants the trigger cannot
// see (unregistered-span-host, claims-tier, one-tier-per-host) by re-running them, item-scoped, on the
// just-written state. Pure check here; the workflow owns the fail-closed action. Non-bypassable: it is an
// unconditional step on the success path, with no skip flag.
export async function auditGateStep(itemId: string, baselineHostTierViolations: number): Promise<StepResult> {
  "use step";
  const sb = svc();
  const res = await crossItemAuditGate(sb, itemId, baselineHostTierViolations);
  return { ok: res.ok, detail: res.detail };
}

// LAYER B fail-closed record — on a gate failure the brief is erased (-> mig-115 trigger quarantines the
// item, which sticks because validate_item_provenance now fails) and this records the SPECIFIC cross-item
// reason as a data_integrity flag, so the quarantine carries the real cause (not the generic erase note).
export async function recordAuditGateFailureStep(itemId: string, detail: string): Promise<{ recorded: boolean }> {
  "use step";
  const sb = svc();
  try {
    await sb.from("integrity_flags").insert({
      category: "data_integrity",
      subject_type: "item",
      subject_ref: itemId,
      description: `Cross-item audit gate failed on the generation write; brief erased and item quarantined. ${detail}`.slice(0, 480),
      recommended_actions: [{ action: "investigate_cross_item_failure", rationale: detail }],
      status: "open",
      created_by: "audit-gate",
    });
    return { recorded: true };
  } catch (e) {
    console.warn(`[generate-brief] recordAuditGateFailureStep insert failed for item ${itemId}: ${(e as Error).message}`);
    return { recorded: false };
  }
}

// research-or-erase: ONE re-research retry on ground failure. Regenerate (discoverCorroborators
// widens the source pool via web_search) -> re-section -> re-ground, as a DISTINCT step so it is not
// memoized against the first generate/ground. Spends ~one generate + ground (Browserless + Sonnet).
export async function reresearchStep(itemId: string, caller: string | null = null): Promise<StepResult> {
  "use step";
  const sb = svc();
  // research-or-erase WIDENS the pool via a fresh web_search, so the FIRST attempt MUST re-fetch —
  // reusing the stored (narrower) pool would neuter the widen and erase items a wider pool could ground.
  // On a RETRY of THIS step (attempt > 1, i.e. a network death threw and the WDK re-ran it) the widened
  // pool was already persisted BEFORE the death (Edit A), so resume from it (stored-first, GUARD 2 — no
  // delete) rather than paying to re-widen the same item.
  const meta = safeStepMetadata();
  const attempt = typeof meta?.attempt === "number" ? meta.attempt : 1;
  let g: StepResult;
  if (attempt > 1) {
    g = await generateBriefFromStored(itemId);
    // deliberate widen (forceRefresh): research-or-erase MUST re-fetch to widen — the holdings guard's freshness
    // escape, not the blind-refetch class the guard refuses.
    if (!g.ok && g.detail === NO_STORED_POOL) g = await generateBrief(itemId, caller, { forceRefresh: true });
  } else {
    g = await generateBrief(itemId, caller, { forceRefresh: true }); // fresh widen (deliberate); F16 caller thread (Unit 0c)
  }
  if (!g.ok) { await recordRun(sb, itemId, "reresearch", EST_GENERATE_USD, false, `regen: ${g.detail}`).catch(() => {}); return g; }
  const s = await sectionBrief(itemId);
  if (!s.ok) { await recordRun(sb, itemId, "reresearch", EST_GENERATE_USD, false, `re-section: ${s.detail}`).catch(() => {}); return s; }
  const r = await groundBrief(itemId, caller);
  await recordRun(sb, itemId, "reresearch", r.ok ? EST_GENERATE_USD + EST_GROUND_USD : EST_GENERATE_USD, r.ok, `re-ground: ${r.detail}`).catch(() => {});
  return r;
}

// BRIEF-NULLED-HELD (Fix B erase-honesty relabel, 2026-07-12). The prior name "erase" LIED: this step
// nulls the ungroundable brief body (+ drops its sections/claims/timelines) and HOLDS the item quarantined
// for re-source — it NEVER archives or removes the row (no is_archived / provenance_status / archive_reason
// write). "success" here means "the brief was nulled and the item held", not "the item was erased". It runs in
// two cases, distinguished by `kind`: a generic re-research-failed grounding, or a STRUCTURAL wall (no source
// link) that skipped the retries. The kind selects the honest integrity flag. Returns the ACTUAL disposition
// so no caller can infer removal from a success status.
export async function eraseStep(
  itemId: string,
  kind: "reresearch_failed" | "structural_no_source" = "reresearch_failed"
): Promise<{ briefNulled: boolean; held: true; kind: string }> {
  "use step";
  const sb = svc();
  await sb.from("intelligence_items").update({ full_brief: null, updated_at: new Date().toISOString() }).eq("id", itemId);
  await sb.from("intelligence_item_sections").delete().eq("item_id", itemId);
  // Also drop the item's claim-provenance rows. The cross-item audits (unregistered-span-host, claims-tier)
  // count EVERY section_claim_provenance row regardless of item status — so leaving an erased item's claims
  // behind would keep its bad-host FACT spans in the corpus tally, defeating "the write does not stand."
  // Orphan claims after a brief erase are wrong on their own (they reference deleted sections); deleting them
  // serves both callers (research-or-erase AND the cross-item audit gate).
  await sb.from("section_claim_provenance").delete().eq("intelligence_item_id", itemId);
  // C6 (F-07): sectionBrief harvests §14 into item_timelines; erasing the brief must ALSO drop those
  // harvested milestones, else an erased ("ungroundable/fabricated") item leaves customer-facing structured
  // timeline rows with no backing brief. Best-effort (a timeline-delete failure must not fail the erase).
  await sb.from("item_timelines").delete().eq("item_id", itemId).then(() => {}, (e: unknown) => console.warn(`[eraseStep] item_timelines delete failed for ${itemId}: ${e instanceof Error ? e.message : String(e)}`));
  // C6 (F-08): DO NOT clobber recommended_actions on ALL of the item's open flags — the prior blanket UPDATE
  // overwrote the re-fetch/register action payloads written by cited-host-gate / error-body-gate / null-tier /
  // truncation-guard flags (destroying the operator queue's real next-actions). Instead INSERT ONE distinct
  // erase-owned flag; the other producers' flags keep their payloads intact.
  const flag = kind === "structural_no_source"
    ? {
        category: "source_issue", created_by: "source-link-repair",
        description: `Brief nulled, item HELD quarantined for re-source: grounding hit a STRUCTURAL wall (no linked source — the item cannot ground until a source is registered/linked). Not re-researched (widening the pool cannot conjure a source link).`,
        recommended_actions: [{ action: "register_and_link_source", rationale: "the item has no source_id; register the source_url in the sources registry and link it, then re-ground (source-link repair)" }],
      }
    : {
        category: "data_quality", created_by: "research-or-erase",
        description: `Brief nulled, item HELD quarantined for re-source: re-research failed grounding twice; ungroundable/fabricated content removed. Item stays quarantined pending re-source at hold-lift.`,
        recommended_actions: [{ action: "brief_nulled_held", rationale: "re-research failed grounding twice; ungroundable/fabricated content removed; item held for re-source" }],
      };
  try {
    await sb.from("integrity_flags").insert({ subject_type: "item", subject_ref: itemId, status: "open", ...flag });
  } catch { /* best-effort note; the brief-null + hold is the hard effect */ }
  await recordRun(sb, itemId, "brief-nulled-held", 0, true, `brief-nulled-held (${kind}): nulled ungroundable brief, item held quarantined for re-source`).catch(() => {});
  return { briefNulled: true, held: true, kind };
}

// Task 1.14: span-check fetch step (Component 7) — RESERVED tested utility, not in
// the canonical orchestration (groundBrief does its own verbatim span-check). Kept
// because the retry contract is decision-log rows 22 + 45 and is runtime-verified:
//   - maxRetries PINNED to 3 (4 total attempts). A WDK default change must not be
//     able to silently alter the retry contract (same invisible-drift lesson as the
//     jq fail-open hook: pin it, don't depend on a default).
//   - EXPONENTIAL backoff: retryAfter = attempt^2 seconds, from
//     getStepMetadata().attempt. A constant retryAfter would not be exponential.
//   - On retry EXHAUSTION the step throws and the run ends FAILED — the claim is NOT
//     returned as validated (fail SAFE).
// The timeout/network -> RetryableError throw is unit-verified
// (scripts/sprint4-114-spancheck-test.mjs); the retry loop + exponential backoff +
// fail-safe-on-exhaustion are runtime-verified via the worker probe (2026-05-30).
export async function spanCheckClaim(url: string): Promise<SpanCheckResult> {
  "use step";
  const meta = safeStepMetadata();
  try {
    return await spanCheckFetch(url);
  } catch (e) {
    if (e instanceof RetryableError) {
      const attempt = typeof meta?.attempt === "number" ? meta.attempt : 1;
      // Exponential backoff per the operator ruling (attempt^2 seconds).
      throw new RetryableError(`span-check unverified for ${url} (attempt ${attempt})`, {
        retryAfter: attempt ** 2 * 1000,
      });
    }
    throw e;
  }
}
// Pinned: 4 total attempts (1 + 3 retries). Do NOT rely on the WDK default.
spanCheckClaim.maxRetries = 3;

// DETAIL-CACHE FLUSH (perf/isr-detail-cache) — best-effort, NON-GATING. The
// /regulations/[slug] detail data (fetchIntelligenceItem / *Sections) is cached
// via unstable_cache (tags `item:{id}` + `intel-items`, 300s revalidate) to
// remove the Supabase-saturation ceiling behind the detail-route 503. When this
// workflow (re)builds an item, its cached detail must flush so the new brief is
// visible without waiting out the 300s backstop. revalidateTag needs a request
// scope — a raw workflow step has none — so we ping the request-scoped
// /api/cache/revalidate-item route (worker-secret auth) rather than call
// revalidateTag here. The coarse `intel-items` tag is the correctness-bearing
// flush: this workflow holds only the item UUID, but the detail cache is keyed
// by legacy_id for most items, and the coarse tag is id-independent. Any failure
// (no base URL in dev, network, auth) is logged and swallowed; the 300s
// revalidate backstop bounds staleness regardless, so a missed flush never
// leaves the corpus stale for long and never affects the generation run.
export async function revalidateItemStep(itemId: string): Promise<{ flushed: boolean }> {
  "use step";
  try {
    const base =
      process.env.REVALIDATE_BASE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
    const secret = process.env.WORKER_SECRET;
    if (!base || !secret) {
      console.warn(
        `[generate-brief] revalidateItemStep skipped for ${itemId}: ${!base ? "no base URL (VERCEL_URL/REVALIDATE_BASE_URL unset)" : "no WORKER_SECRET"}`
      );
      return { flushed: false };
    }
    const res = await fetch(`${base}/api/cache/revalidate-item`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-worker-secret": secret },
      body: JSON.stringify({ itemId }),
    });
    if (!res.ok) {
      console.warn(`[generate-brief] revalidateItemStep for ${itemId} got HTTP ${res.status}`);
      return { flushed: false };
    }
    return { flushed: true };
  } catch (e) {
    console.warn(
      `[generate-brief] revalidateItemStep failed for ${itemId}: ${e instanceof Error ? e.message : String(e)}`
    );
    return { flushed: false };
  }
}

// ── Workflow orchestration (durable) ──
export interface GenerateBriefResult {
  itemId: string;
  status: string;
  steps: Partial<Record<"budget" | "auditBaseline" | "generate" | "register" | "section" | "ground" | "reground" | "grow" | "auditGate" | "reresearch" | "erase", unknown>>;
}

// Ground-failure classification (deterministic / structural) + the retry plan live in the PURE, depless
// module ground-failure-class.mjs (Fix B, RD-22) so the golden proves them without the WDK import chain.
// The ladder below consumes groundRetryPlan: "structural_hold" (skip re-ground AND re-research — a source-less
// wall) | "reresearch_only" (deterministic brief-content flaw) | "reground" (transient — try the cheap re-roll).

export async function generateBriefWorkflow(itemId: string, refresh = false, caller: string | null = null): Promise<GenerateBriefResult> {
  "use workflow";
  // F16 CALLER THREAD (Unit 0c): `caller` (default null = fail-closed) is the SIGNED intake caller
  // (manual-intake-run) that lets the fetch steps pass an engaged scrape hold. /api/agent/run passes no
  // caller → null → the pipeline stays blocked under the hold exactly as before; only runIntakeCycle
  // deliberately passes "manual-intake-run". It flows to generate/ground/reresearch (the fetch steps).

  // Preflight first — halts (FatalError) before any Sonnet spend if paused, over budget, or if the
  // data-audit lane is RED with no current disposition (Layer C block-next-run).
  const budget = await preflightStep(itemId, caller);

  // LAYER B baseline — snapshot the global one-tier-per-host violation count BEFORE any registering write,
  // so the post-write gate can attribute a NEW conflict to this run vs the corpus's standing violations.
  const auditBaseline = await auditBaselineStep(itemId);

  // refresh=true is the deliberate force-rescrape lever (GUARD 4): freshness-over-cost. Default false =
  // reuse stored content when a usable pool exists (resumable, cheap). Change-detection is NOT built here.
  const generate = await generateStep(itemId, refresh, caller);
  if (!generate.ok) return { itemId, status: "generate_failed", steps: { budget, auditBaseline, generate } };

  // Register corroborator sources BEFORE grounding so their hosts resolve to a real institutional tier
  // at stamp time (not NULL). Non-gating: a registration failure never blocks the run.
  const register = await registerStep(itemId);

  const section = await sectionStep(itemId);
  if (!section.ok) return { itemId, status: "section_failed", steps: { budget, auditBaseline, generate, register, section } };

  let ground = await groundStep(itemId, caller);
  if (!ground.ok && ground.detail.startsWith("grounding_frozen")) {
    // Grounding is administratively frozen (acquire lock OFF) or the source changed since snapshot (stale flag
    // queued). The freshly-generated brief is HELD intact — NOT routed into research-or-erase (which would null
    // it) and NOT flipped to verified. No spend occurred. A re-run grounds it once the operator flips
    // GROUNDING_ACQUIRE_ENABLED on (or rules on the stale flag). This is the master-switch resting state.
    return { itemId, status: "grounding_frozen_held", steps: { budget, auditBaseline, generate, register, section, ground } };
  }
  if (!ground.ok) {
    const plan = groundRetryPlan(ground.detail);
    if (plan === "structural_hold") {
      // STRUCTURAL wall (Fix B) — e.g. `no source_id`: re-ground AND re-research are guaranteed waste (they
      // cannot conjure a source link). Route STRAIGHT to held-for-re-source — null the ungroundable brief,
      // hold the item quarantined, raise a source-link repair flag. ZERO re-research calls, honest disposition.
      const erase = await eraseStep(itemId, "structural_no_source");
      return { itemId, status: "structural_held_for_resource", steps: { budget, auditBaseline, generate, register, section, ground, erase } };
    }
    // B3 TIERED RETRY, REASON-AWARE (cost fix 2026-06-21). The cheap re-ground re-rolls the stochastic ledger
    // extraction and recovers an item whose FIRST roll slipped a label or cited an off-pool URL (proven: g7
    // verified on its 2nd ground). A DETERMINISTIC brief-content failure re-fails IDENTICALLY, so skip straight
    // to reresearch. groundRetryPlan encodes both (structural handled above); groundBrief clears the prior
    // non-verified ledger at its start, so a re-roll still starts clean.
    const reground = plan === "reground" ? await groundStep(itemId, caller) : null;
    if (reground?.ok) {
      ground = reground;
    } else {
      // research-or-erase: one re-research retry (widen the pool via web_search, re-section, re-ground).
      const reresearch = await reresearchStep(itemId, caller);
      if (!reresearch.ok) {
        const erase = await eraseStep(itemId, "reresearch_failed");
        return { itemId, status: "reresearch_failed_held", steps: { budget, auditBaseline, generate, register, section, ground, ...(reground ? { reground } : {}), reresearch, erase } };
      }
      ground = reresearch; // re-research grounded successfully
    }
  }

  // Grow is non-gating: source credibility compounds, but a failed grow does not
  // invalidate an already-verified brief. The set_provenance_status trigger (migration
  // 121) flipped the item to 'verified' on the grounding writes — no human tick.
  const grow = await growStep(itemId);

  // RECONNECT (phase-intake-gate): feed the cross-reference graph from this item's content. Deterministic,
  // non-gating — turns the built-but-unfed item_cross_references layer into a fed one.
  const link = await linkStep(itemId);
  void link;

  // LAYER B GATE — NON-OPTIONAL, FAIL-CLOSED. The item is per-item-verified by the mig-115 trigger; this
  // enforces the CROSS-item / corpus invariants the trigger cannot see. "Write succeeded" is connected to
  // "audits green" HERE: on a cross-item failure the write does NOT stand — erase the brief (the mig-115
  // trigger then quarantines the item, and it sticks because validate_item_provenance now fails) and record
  // the specific cross-item reason. There is no skip flag; a failed/erroring gate ends the run NOT-verified.
  const auditGate = await auditGateStep(itemId, auditBaseline.hostTierViolations);
  if (!auditGate.ok) {
    const erase = await eraseStep(itemId);
    const recorded = await recordAuditGateFailureStep(itemId, String((auditGate as { detail?: string }).detail ?? "cross-item audit failed"));
    if (!recorded.recorded) {
      console.warn(`[generate-brief] audit-gate quarantine reason FAILED to persist for item ${itemId}; quarantine carries no recorded cross-item cause`);
    }
    return { itemId, status: "audit_gate_failed_quarantined", steps: { budget, auditBaseline, generate, register, section, ground, grow, auditGate, erase } };
  }

  // The item is verified and now customer-visible; flush its detail cache so the
  // new brief renders without waiting out the 300s revalidate backstop.
  // Best-effort + non-gating (see revalidateItemStep).
  await revalidateItemStep(itemId);

  return { itemId, status: "verified", steps: { budget, auditBaseline, generate, register, section, ground, grow, auditGate } };
}
