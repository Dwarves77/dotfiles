// mintIntelligenceItem — THE shared mint chokepoint (phase-intake-gate, contract v2.2).
//
// Both mint paths call this and NEITHER performs its own INSERT:
//   Path A — drain-first-fetch worker  (seedStubIntelligenceItem)   — the source-monitoring intake
//   Path B — staged_updates materialize (applyUpdate:new_item)      — scan + community-promote
//
// The prior build placed congruence + dedup on Path B only; Path A minted directly and had neither
// (it produced all 38 pre-gate polluters). Placement constraint (dispatch §1, binding): gate DECISIONS
// run HERE, not in first-fetch-classify — congruence there would mirror the defect onto Path B, which
// never touches that file. Classify layers only PRECOMPUTE the inputs (verdict, item_type, source-role,
// relevance).
//
// MOAT BOUNDARY: this writes intelligence_items (the mint — the ONE sanctioned INSERT site, enforced by
// the single-mint-chokepoint fitness function), item_cross_references (link edges), and integrity_flags
// (surfacing). It NEVER writes section_claim_provenance — extraction/links never ground reg facts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { congruence, sourceRole } from "@/lib/entities/source-role.mjs";
import { matchExistingSubject } from "@/lib/entities/entity-resolve.mjs";
import { domainForItemType, type Domain } from "@/lib/domains";

// UNCONDITIONAL item types — their surface domain is fully determined by item_type alone
// (domainForItemType returns the same value regardless of source.category). For these the
// chokepoint DERIVES the domain so a wrong seed.domain can never mint an item onto the wrong
// surface — the class fix for "a verified regulation is invisible on /regulations because its
// domain drifted" (the PPWR-adjacent misroute class). CONDITIONAL types (framework/tool/
// initiative) depend on source.category, which mint does not load, so their caller-computed
// seed.domain is left intact.
const UNCONDITIONAL_DOMAIN_TYPES = new Set([
  "regulation", "directive", "standard", "guidance", "law",
  "research_finding", "regional_data", "market_signal", "technology", "innovation",
]);

/** Pure surface-routing guard (testable in isolation). For an UNCONDITIONAL item type, returns the
 *  canonical domain when the current one disagrees (or is absent); otherwise null (leave as-is).
 *  Conditional types (framework/tool/initiative) return null — their domain needs source.category. */
export function canonicalDomainOverride(
  itemType: string | null | undefined,
  currentDomain: unknown
): Domain | null {
  if (!itemType || !UNCONDITIONAL_DOMAIN_TYPES.has(itemType)) return null;
  const canonical = domainForItemType(itemType, null) as Domain | null;
  if (canonical == null) return null;
  return currentDomain === canonical ? null : canonical;
}

// Fork-4 relevance floor (0-100). SURFACE-ONLY: below it we open a data_quality flag and mint ANYWAY.
// Enforcement (blocking) waits for proven precision against labeled data — this is the observability stub.
const RELEVANCE_FLOOR = 40;

export interface MintPlan {
  /** The row to INSERT into intelligence_items. Must carry source_url + item_type (+ domain, title, …). */
  seed: Record<string, unknown>;
  /** Path-B idempotency: the staged_update legacy_id, if any. */
  legacyId?: string | null;
  /** Fork-4 precomputed relevance (0-100) from the Haiku classify output, when available. Surface-only. */
  relevance?: number | null;
  /** Where the mint originates (audit only). */
  origin: "first_fetch" | "staged_materialization";
}

export type MintAction = "minted" | "retyped" | "linked" | "exists" | "duplicate";

export interface MintResult {
  ok: boolean;
  itemId?: string;
  action: MintAction;
  /** Gate decisions taken, e.g. ["congruence:1a"], ["seek-study:1b"], ["dedup:linked"], ["low-relevance"]. */
  flags: string[];
  error?: string;
}

interface SubjectMatch { id: string; how: string }

export async function mintIntelligenceItem(sb: SupabaseClient, plan: MintPlan): Promise<MintResult> {
  const flags: string[] = [];
  const seed: Record<string, unknown> = { ...plan.seed };
  const sourceUrl = String(seed.source_url ?? "");
  const itemType = (seed.item_type as string | undefined) ?? undefined;

  // ── Idempotency short-circuits: return an existing row, never an INSERT ──────────────────────────
  if (sourceUrl) {
    const { data: bySrc } = await sb.from("intelligence_items").select("id").eq("source_url", sourceUrl).maybeSingle();
    if (bySrc?.id) return { ok: true, itemId: bySrc.id as string, action: "exists", flags };
  }
  if (plan.legacyId) {
    const { data: byLegacy } = await sb.from("intelligence_items").select("id").eq("legacy_id", plan.legacyId).maybeSingle();
    if (byLegacy?.id) return { ok: true, itemId: byLegacy.id as string, action: "exists", flags };
  }

  // ── (1) CONGRUENCE — 1a retype / 1b surface-seek-study ───────────────────────────────────────────
  const cong = congruence(itemType, sourceUrl);
  let seekStudy = false;
  if (cong.changed) {
    seed.item_type = cong.itemType;              // 1a: primary-artifact-on-news → market_signal
    if (seed.domain === 1) seed.domain = 4;      // Regulations → Market routing follows the retype
    flags.push("congruence:1a");
  } else if (cong.incongruentSource) {
    seekStudy = true;                            // 1b: keep research_finding; flag the source after insert
    flags.push("seek-study:1b");
  }

  // ── (2) SUBJECT-EXISTENCE DEDUP — high-precision (instrument / normalized url / shared reg-#) ──────
  const { data: corpus } = await sb
    .from("intelligence_items")
    .select("id,title,instrument_identifier,source_url")
    .eq("is_archived", false);
  const dups = matchExistingSubject(seed, corpus ?? []) as SubjectMatch[];
  let linkTargetId: string | null = null;
  if (dups.length) {
    if (sourceRole(sourceUrl) === "news") {
      // news duplicating an existing (primary) subject → mint a market_signal + edge to the primary
      // (link, never drop — the signal about an existing instrument is legitimate intelligence).
      if (seed.item_type !== "market_signal") {
        seed.item_type = "market_signal";
        if (seed.domain === 1) seed.domain = 4;
      }
      linkTargetId = dups[0].id;
      flags.push("dedup:linked");
    } else {
      // a primary/other candidate duplicating an existing subject → do NOT mint a duplicate.
      return {
        ok: false,
        action: "duplicate",
        flags,
        error: `dedup: subject already exists as ${dups.slice(0, 3).map((d) => `${d.id}(${d.how})`).join(", ")} — not minting a duplicate (phase-intake-gate)`,
      };
    }
  }

  // ── (4) RELEVANCE — Fork-4, SURFACE-ONLY, never blocks ───────────────────────────────────────────
  const lowRelevance = plan.relevance != null && plan.relevance < RELEVANCE_FLOOR;
  if (lowRelevance) flags.push("low-relevance");

  // ── (5) DOMAIN CANONICALIZATION — the surface-routing guard (keyed on the FINAL item_type, so it
  //   runs after any 1a/dedup retype). Customer surfaces filter by `domain`; a domain that disagrees
  //   with the item's type hides it from the surface a reader expects (verified but invisible). For
  //   the UNCONDITIONAL types the correct domain is knowable here — derive it and correct a wrong or
  //   missing seed.domain so no mint can misroute. Conditional types keep their caller-computed domain.
  const canonicalDomain = canonicalDomainOverride(seed.item_type as string | undefined, seed.domain);
  if (canonicalDomain != null) {
    flags.push(`domain-canonicalized:${seed.domain ?? "null"}->${canonicalDomain}`);
    seed.domain = canonicalDomain;
  }

  // ── THE SINGLE INSERT (the only intelligence_items INSERT in src/ runtime) ────────────────────────
  const { data: inserted, error } = await sb
    .from("intelligence_items")
    .insert(seed)
    .select("id")
    .single();
  if (error || !inserted?.id) {
    return { ok: false, action: "minted", flags, error: error?.message || "insert returned no data" };
  }
  const itemId = inserted.id as string;

  // ── Post-insert surfacing (non-fatal). item_cross_references + integrity_flags ONLY. ─────────────
  if (linkTargetId && linkTargetId !== itemId) {
    await sb
      .from("item_cross_references")
      .upsert(
        { source_item_id: itemId, target_item_id: linkTargetId, relationship: "references", origin: "entity_extraction" },
        { onConflict: "source_item_id,target_item_id", ignoreDuplicates: true }
      )
      .then(() => {}, () => {});
  }
  if (seekStudy) {
    await sb
      .from("integrity_flags")
      .insert({
        category: "data_quality",
        subject_type: "item",
        subject_ref: itemId,
        description: `research_finding minted on a news/press source (${sourceUrl}). The press release is a lead/corroborator — seek the study/report as the primary source and re-ground. (phase-intake-gate 1b)`,
        recommended_actions: [{ action: "Find the underlying study/report and re-source as primary", rationale: "a research_finding's primary must be the study, not a press release" }],
        status: "open",
        created_by: "intake-seek-study",
      })
      .then(() => {}, () => {});
  }
  if (lowRelevance) {
    await sb
      .from("integrity_flags")
      .insert({
        category: "data_quality",
        subject_type: "item",
        subject_ref: itemId,
        description: `Low freight-sustainability relevance (${plan.relevance}) at intake for ${sourceUrl}. Minted anyway (surface-only gate, Fork-4). Review topical fit.`,
        recommended_actions: [{ action: "Confirm topical relevance or archive as off-vertical", rationale: "intake has no blocking relevance gate; this is the observability stub" }],
        status: "open",
        created_by: "intake-relevance",
      })
      .then(() => {}, () => {});
  }

  const action: MintAction = linkTargetId ? "linked" : cong.changed ? "retyped" : "minted";
  return { ok: true, itemId, action, flags };
}
