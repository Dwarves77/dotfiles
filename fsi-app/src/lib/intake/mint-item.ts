// mintIntelligenceItem — THE shared mint chokepoint (phase-intake-gate, contract v2.2).
//
// The mint callers go through applyStagedUpdate (new_item) and NEITHER performs its own INSERT:
//   staged_updates materialize (human/legacy approve → applyStagedUpdate)  — scan + community-promote
//   runIntakeCycle             (machine cycle → applyStagedUpdate)          — no-human-finish-of-intake
//
// SEED-PARITY (D5) DISSOLVED 2026-07-12: the old Path A (the drain-first-fetch worker +
// seedStubIntelligenceItem — the source-monitoring intake that minted directly and had neither congruence
// nor dedup, producing all 38 pre-gate polluters) was RETIRED (Option-A-with-migration ruling). Its
// pending_first_fetch population is re-homed to the cadence-flip wiring unit (check-sources → runIntakeCycle),
// so ONE seed constructor remains — the seed assembled at applyStagedUpdate → mint. Placement constraint
// (dispatch §1, binding): gate DECISIONS run HERE, not in first-fetch-classify; classify layers only
// PRECOMPUTE the inputs (verdict, item_type, source-role, relevance).
//
// MOAT BOUNDARY: this writes intelligence_items (the mint — the ONE sanctioned INSERT site, enforced by
// the single-mint-chokepoint fitness function), item_cross_references (link edges), and integrity_flags
// (surfacing). It NEVER writes section_claim_provenance — extraction/links never ground reg facts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { congruence, sourceRole } from "@/lib/entities/source-role.mjs";
import { matchExistingSubject } from "@/lib/entities/entity-resolve.mjs";
import { domainForItemType, type Domain } from "@/lib/domains";
import { canonicalizeUrl } from "@/lib/sources/url-canonicalize";

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

export type MintAction = "minted" | "retyped" | "linked" | "exists" | "duplicate" | "unsourced";

/** Result of the source-link decision (Fix A). PURE + golden-tested — the DB lookup feeds `matchedSourceId`. */
export type SourceLinkOutcome =
  | { kind: "preset" }                    // caller already set source_id (scan / community-promote) — trust it
  | { kind: "link"; sourceId: string }    // resolved a registered source for the candidate url
  | { kind: "reject"; error: string };    // no registered source, or no url at all — a live item cannot mint

/**
 * SOURCE-LINK INVARIANT decision (Fix A, ruled 2026-07-12 — doctrine no-source-less-live-mint).
 * A mint cannot produce a source-less LIVE item: grounding grounds a brief against the item's source, so a
 * source_id = NULL item can never verify (the eFTI/waste T9 wall). Given the seed and the registry-lookup
 * result, decide: trust a caller-preset source_id, LINK a resolved registered source, or REJECT-with-reason
 * (register the source first) — never a silent orphan, never auto-registration.
 */
export function sourceLinkDecision(
  seed: { source_id?: unknown; source_url?: unknown },
  matchedSourceId: string | null
): SourceLinkOutcome {
  if (seed.source_id != null) return { kind: "preset" };
  const url = String(seed.source_url ?? "");
  if (!url) return { kind: "reject", error: "no source_url and no source_id — a live item cannot mint without a source (source-link invariant)" };
  if (!matchedSourceId) {
    return { kind: "reject", error: `no registered source for ${url} — register the source first (source-link invariant: a live item cannot mint without a source)` };
  }
  return { kind: "link", sourceId: matchedSourceId };
}

export interface MintResult {
  ok: boolean;
  itemId?: string;
  action: MintAction;
  /** Gate decisions taken, e.g. ["congruence:1a"], ["seek-study:1b"], ["dedup:linked"], ["low-relevance"]. */
  flags: string[];
  error?: string;
  /** F6: set when this result came from a dryRun (every gate ran, no INSERT). ok:true => would_mint. */
  dryRun?: boolean;
}

interface SubjectMatch { id: string; how: string }

/**
 * F6 (plan-intake retired): `opts.dryRun` runs EVERY gate this chokepoint runs — the idempotency probes,
 * congruence 1a/1b, subject-existence dedup, relevance floor, domain canonicalization, and the SOURCE-LINK
 * INVARIANT — against live state, then returns the disposition it WOULD take WITHOUT the single INSERT or the
 * post-insert surfacing. There is ONE source of truth: a dry verdict cannot drift from apply because it IS
 * apply minus the final write. This replaces the parallel planIntakeCycle, which re-derived a SUBSET of these
 * gates (it never modeled the source-link invariant, so it reported would_mint where the real mint rejects an
 * unsourced candidate) and failed OPEN on a corpus read error (the real mint fails CLOSED).
 */
export async function mintIntelligenceItem(sb: SupabaseClient, plan: MintPlan, opts: { dryRun?: boolean } = {}): Promise<MintResult> {
  const flags: string[] = [];
  const seed: Record<string, unknown> = { ...plan.seed };
  const sourceUrl = String(seed.source_url ?? "");
  const itemType = (seed.item_type as string | undefined) ?? undefined;

  // ── Idempotency short-circuits: return an existing row, never an INSERT ──────────────────────────
  // FAIL-CLOSED (C4, 2026-07-11): a READ ERROR during a duplicate-probe must NEVER proceed to mint —
  // a transient read failure returns null-ish `data`, and the prior dropped-`error` code then took the
  // null as "no existing row" and ran the single INSERT, minting a DUPLICATE on a DB hiccup (CODE-1
  // F-09). The probe now captures `error` and REFUSES the mint (ok:false) rather than gambling.
  if (sourceUrl) {
    const { data: bySrc, error: bySrcErr } = await sb.from("intelligence_items").select("id").eq("source_url", sourceUrl).maybeSingle();
    if (bySrcErr) return { ok: false, action: "duplicate", flags, error: `mint refused (fail-closed): source_url idempotency probe read failed — ${bySrcErr.message}` };
    if (bySrc?.id) return { ok: true, itemId: bySrc.id as string, action: "exists", flags };
  }
  if (plan.legacyId) {
    const { data: byLegacy, error: byLegacyErr } = await sb.from("intelligence_items").select("id").eq("legacy_id", plan.legacyId).maybeSingle();
    if (byLegacyErr) return { ok: false, action: "duplicate", flags, error: `mint refused (fail-closed): legacy_id idempotency probe read failed — ${byLegacyErr.message}` };
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
  // FAIL-CLOSED (C4): a read error on the dedup corpus scan means an empty `corpus`, so matchExistingSubject
  // would find NO duplicate and the INSERT would run — the same duplicate-on-hiccup class as the probes above.
  const { data: corpus, error: corpusErr } = await sb
    .from("intelligence_items")
    .select("id,title,instrument_identifier,source_url")
    .eq("is_archived", false);
  if (corpusErr) return { ok: false, action: "duplicate", flags, error: `mint refused (fail-closed): dedup corpus read failed — ${corpusErr.message}` };
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

  // ── (6) SOURCE-LINK INVARIANT (Fix A) — the LAST gate before the INSERT: a mint cannot produce a
  //   source-less LIVE item. The scan path pre-resolves source_id at stage time (scan/route.ts); the
  //   manual-intake path did not, minting source-orphaned items that can never ground (grounding grounds
  //   against the item's source — the eFTI/waste T9 wall). Resolve the source_url against the registry HERE
  //   (the ONE mint home, so ALL callers are gated); an UNREGISTERED url REJECTS with reason (register the
  //   source first). No silent orphan, no auto-registration under this unit. A caller-preset source_id (scan
  //   / community-promote) is trusted. FAIL-CLOSED (C4 class): a registry read error REFUSES the mint. Runs
  //   AFTER dedup so a duplicate is caught first and the dedup fail-closed ordering is preserved.
  let matchedSourceId: string | null = null;
  if (seed.source_id == null && sourceUrl) {
    const canon = canonicalizeUrl(sourceUrl);
    const urls = canon === sourceUrl ? [canon] : [canon, sourceUrl];
    const { data: srcRows, error: srcErr } = await sb.from("sources").select("id").in("url", urls).limit(1);
    if (srcErr) return { ok: false, action: "unsourced", flags, error: `mint refused (fail-closed): source registry probe read failed — ${srcErr.message}` };
    matchedSourceId = (srcRows?.[0]?.id as string | undefined) ?? null;
  }
  const link = sourceLinkDecision(seed, matchedSourceId);
  if (link.kind === "reject") return { ok: false, action: "unsourced", flags, error: link.error };
  if (link.kind === "link") { seed.source_id = link.sourceId; flags.push("source-linked"); }

  // ── F6 DRY-RUN BOUNDARY — every gate above has run (idempotency, congruence, dedup, relevance, domain,
  //   SOURCE-LINK). A dryRun returns the disposition it WOULD take here WITHOUT the INSERT or the post-insert
  //   surfacing. ok:true == would_mint; the would-reject cases already returned above on the identical
  //   read-only gate logic, so the dry verdict is apply minus the write. (The retired planIntakeCycle stopped
  //   BEFORE this gate and never saw the source-link reject — the drift F6 closes.)
  if (opts.dryRun) {
    const action: MintAction = linkTargetId ? "linked" : cong.changed ? "retyped" : "minted";
    return { ok: true, action, flags, dryRun: true };
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
    // D3 (ruling 2026-07-12): relevance is FAIL-OPEN by design — blocking a legitimate item on a fallible
    // score is worse than minting + flagging. The flag is machine-routable to the disposition FLAG RESOLVER
    // (Unit 2) under the off-domain decision rule (casino precedent: a CONFIRMED off-vertical item archives
    // with archive_reason='off_domain' via the eligibility gate; an on-vertical item keeps). It cannot rest:
    // the open-flag dwell invariant forbids it parking past its max-age.
    await sb
      .from("integrity_flags")
      .insert({
        category: "data_quality",
        subject_type: "item",
        subject_ref: itemId,
        description: `Low freight-sustainability relevance (${plan.relevance}) at intake for ${sourceUrl}. Minted anyway (surface-only gate, Fork-4). Resolver (Unit 2): confirm on-vertical → keep; confirm off-vertical → archive off_domain via gate.`,
        recommended_actions: [
          { action: "keep", rationale: "confirmed on-vertical despite low score — relevance is fail-open by design" },
          { action: "archive_off_domain", archive_reason: "off_domain", rationale: "confirmed off-vertical — archive via the eligibility gate (reversible, snapshot + cite), the casino precedent" },
        ],
        status: "open",
        created_by: "intake-relevance",
      })
      .then(() => {}, () => {});
  }

  const action: MintAction = linkTargetId ? "linked" : cong.changed ? "retyped" : "minted";
  return { ok: true, itemId, action, flags };
}
