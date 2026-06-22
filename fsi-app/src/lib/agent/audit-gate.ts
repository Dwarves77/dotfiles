// LAYER B — the cross-item / corpus AUDIT GATE in the generation write path (enforcement-gap fix,
// 2026-06-21). GOVERNING: remediation-discipline (class-over-instance) + source-credibility-model.
//
// WHY THIS EXISTS. The per-item provenance gate is already DB-enforced and bypass-proof: the mig-115
// set_provenance_status trigger calls validate_item_provenance on every write and only stamps 'verified'
// when the six per-item criteria pass (mig 118 binds the flip to the reconciler credential). What the
// trigger CANNOT see is the CROSS-item / corpus invariants the nightly data-audit lane checks — a write
// can be locally valid yet push the corpus into violation (the grow-batch misstep registered hosts at
// conflicting tiers; today's red is FACT claims grounded on unregistered hosts). Those invariants were
// enforced ONLY nightly, with no teeth — detected on 7 consecutive nights with no consequence, the human
// the only catch. This module moves the relevant cross-item checks INTO the write path so "write
// succeeded" is connected to "audits green": the runner runs them as a NON-OPTIONAL step and FAILS CLOSED.
//
// NO LOGIC DRIFT. Resolution goes through the SAME single module the nightly audits use
// (src/lib/sources/institution.ts). The scoring here mirrors one-tier-per-host-audit / claims-tier-audit /
// unregistered-span-host-audit exactly, scoped to ONE item (cheaper + more precise than re-scanning the
// whole corpus per write). The pure cores (scoreItemClaims, hostTierViolationCount, hasValidWaiver) are
// unit-tested.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildResolver, hostOf, hostInstitution, type SourceRow, type Resolver } from "../sources/institution";
// The pure cores live in a dependency-free .mjs so the no-npm-ci discipline test job can unit-test them
// without jiti/.ts loading; here we bind the real institution.ts host helpers + resolver to them.
import {
  scoreItemClaims as scoreItemClaimsCore,
  hostTierViolationCount as hostTierViolationCountCore,
  hasValidWaiver as hasValidWaiverCore,
} from "./audit-gate-core.mjs";

// ── Pure cores (unit-tested; no DB) ─────────────────────────────────────────

export interface ClaimRow {
  id: string;
  claim_kind: string | null;
  search_result_id: string | null;
  source_tier_at_grounding: number | null;
}

export interface ItemCrossItemMetrics {
  unregisteredSpanFacts: number; // item FACT claims whose span host is unregistered (resolver tier == null)
  claimsTierMismatches: number; // item claims violating claims-tier honesty (FACT stamp != resolved; non-FACT stamped)
  sample: string[];
}

/** Item-scoped mirror of unregistered-span-host-audit + claims-tier-audit. `searchUrlById` maps a claim's
 *  search_result_id -> agent_run_searches.result_url. Pure: caller supplies the rows + the resolver. */
export function scoreItemClaims(
  claims: ClaimRow[],
  searchUrlById: Map<string, string | null>,
  resolver: Resolver,
): ItemCrossItemMetrics {
  return scoreItemClaimsCore(claims, searchUrlById, resolver, { hostOf }) as ItemCrossItemMetrics;
}

/** Global one-tier-per-host violation count (mirror of one-tier-per-host-audit). tier_override rows are
 *  exempt (deliberate per-row flag). */
export function hostTierViolationCount(sources: SourceRow[]): number {
  return hostTierViolationCountCore(sources, { hostOf, hostInstitution }) as number;
}

// ── Layer C waiver logic (pure; shared by the preflight disposition gate) ────

export interface WaiverAction {
  action?: string;
  until?: string;
}
export interface BlockRow {
  id: string;
  description?: string | null;
  recommended_actions?: unknown;
}

/** A data-audit block is dispositioned (allowed to proceed) only by an explicit, non-expired dated waiver.
 *  Time alone never clears it. Returns true iff recommended_actions carries an {action:'waiver', until:DATE}
 *  whose DATE is today or later. */
export function hasValidWaiver(block: BlockRow | null | undefined, now: Date): boolean {
  return hasValidWaiverCore(block, now) as boolean;
}

// ── DB readers + the gate (used by the runner) ──────────────────────────────

/** Paginated full read of the sources registry (PostgREST caps a response at 1000 rows regardless of
 *  .limit — must page, per the db.mjs readAll note). Needed for both the resolver and the host-tier count. */
export async function readAllSources(sb: SupabaseClient): Promise<SourceRow[]> {
  const rows: SourceRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("sources")
      .select("id,url,base_tier,effective_tier,tier_override")
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`audit-gate: sources read failed: ${error.message}`);
    if (!data || !data.length) break;
    rows.push(...(data as SourceRow[]));
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function readItemClaims(sb: SupabaseClient, itemId: string): Promise<ClaimRow[]> {
  const { data, error } = await sb
    .from("section_claim_provenance")
    .select("id,claim_kind,search_result_id,source_tier_at_grounding")
    .eq("intelligence_item_id", itemId);
  if (error) throw new Error(`audit-gate: claims read failed: ${error.message}`);
  return (data ?? []) as ClaimRow[];
}

async function readSearchUrls(sb: SupabaseClient, ids: string[]): Promise<Map<string, string | null>> {
  const m = new Map<string, string | null>();
  if (!ids.length) return m;
  const { data, error } = await sb.from("agent_run_searches").select("id,result_url").in("id", ids);
  if (error) throw new Error(`audit-gate: searches read failed: ${error.message}`);
  for (const r of data ?? []) m.set(r.id as string, (r.result_url ?? null) as string | null);
  return m;
}

export interface CrossItemAuditResult {
  ok: boolean;
  detail: string;
  metrics: ItemCrossItemMetrics & { hostTierViolations: number; baselineHostTierViolations: number };
}

/** THE GATE (pure check — NO side effects; the runner owns the fail-closed action). An item's write is
 *  cross-item-clean iff it grounded ZERO FACT claims on unregistered hosts, has ZERO claims-tier
 *  mismatches, and introduced NO new one-tier-per-host conflict vs the pre-write baseline. The first two
 *  are absolute (register-before-ground is supposed to guarantee zero); the third is a delta vs baseline
 *  because the corpus carries pre-existing standing violations the nightly lane + Layer C disposition own. */
export async function crossItemAuditGate(
  sb: SupabaseClient,
  itemId: string,
  baselineHostTierViolations: number,
): Promise<CrossItemAuditResult> {
  const sources = await readAllSources(sb);
  const resolver = buildResolver(sources);
  const claims = await readItemClaims(sb, itemId);
  const srIds = [...new Set(claims.map((c) => c.search_result_id).filter((x): x is string => !!x))];
  const searchUrlById = await readSearchUrls(sb, srIds);
  const item = scoreItemClaims(claims, searchUrlById, resolver);
  const hostTierViolations = hostTierViolationCount(sources);

  const reasons: string[] = [];
  if (item.unregisteredSpanFacts > 0) reasons.push(`unregistered_span_host(${item.unregisteredSpanFacts})`);
  if (item.claimsTierMismatches > 0) reasons.push(`claims_tier_mismatch(${item.claimsTierMismatches})`);
  if (hostTierViolations > baselineHostTierViolations)
    reasons.push(`one_tier_per_host_regression(${baselineHostTierViolations}->${hostTierViolations})`);

  const ok = reasons.length === 0;
  const detail = ok
    ? `cross-item audit clean (unregistered-span=0, claims-tier=0, host-tier ${hostTierViolations}<=${baselineHostTierViolations})`
    : `cross-item audit FAILED [${reasons.join(",")}]: ${item.sample.join(" | ")}`.slice(0, 240);
  return { ok, detail, metrics: { ...item, hostTierViolations, baselineHostTierViolations } };
}

// ── Layer C — the data-audit BLOCK row convention (shared by preflight + the lane runner) ────────────────
// The nightly lane reflects its verdict into ONE OPEN integrity_flags row of this shape on RED, and
// resolves it on GREEN. Generation preflight HALTS on an OPEN block lacking a non-expired waiver.
export const DATA_AUDIT_BLOCK = Object.freeze({
  category: "data_integrity" as const,
  subject_type: "system" as const,
  subject_ref: "data-audit-lane" as const,
  created_by: "data-audit-lane" as const,
});

/** Read the single OPEN data-audit block row, if any. Throws on a read error (preflight fails CLOSED —
 *  a gate that cannot verify state must not let generation proceed). */
export async function readOpenDataAuditBlock(sb: SupabaseClient): Promise<BlockRow | null> {
  const { data, error } = await sb
    .from("integrity_flags")
    .select("id,description,recommended_actions,status")
    .eq("category", DATA_AUDIT_BLOCK.category)
    .eq("subject_ref", DATA_AUDIT_BLOCK.subject_ref)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`audit-gate: integrity_flags read failed: ${error.message}`);
  return (data ?? null) as BlockRow | null;
}
