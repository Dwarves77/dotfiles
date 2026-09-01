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
// the single-mint-chokepoint fitness function), item_cross_references (link edges), integrity_flags
// (surfacing), and — contract rule 16 (2026-09-01, "the forward-participation clause") —
// item_forward_events (dated obligations extracted from this item's already-grounded content, see the
// post-insert block below). It NEVER writes section_claim_provenance — extraction/links never ground reg
// facts; it only READS that table (and intelligence_item_sections) to feed the forward-events extractor.
import type { SupabaseClient } from "@supabase/supabase-js";
import { congruence, sourceRole } from "@/lib/entities/source-role.mjs";
import { matchExistingSubject } from "@/lib/entities/entity-resolve.mjs";
import { domainForItemType, type Domain } from "@/lib/domains";
import { canonicalizeUrl } from "@/lib/sources/url-canonicalize";
import { discoverConnections, computeTagFrequencies } from "@/lib/connections/discover.mjs";
import { writeDiscoveredEdges } from "@/lib/connections/write-edges.mjs";
import { surfaceOf } from "@/lib/surface-of.mjs";
import { FLYWHEEL_DEFECT_NAMESPACE, createdBy } from "@/lib/connections/flag-namespaces.mjs";
import { extractForwardEvents } from "@/lib/forward-events/extract-forward-events.mjs";

// Connection-signature column list — SAME set backfill-edges.mjs (Pillar A2) selects, so the mint-time
// scan and the cold-start/repair scan can never diverge on what counts as "provenance." One home for
// the column list would need a shared corpus-query module; duplicating this const (not the scoring
// logic — that already has one home in discover.mjs) is the accepted seam until a query-layer refactor
// gives corpus loads their own module.
const CONNECTION_SIGNATURE_COLUMNS =
  "id, item_type, canonical_instrument_key, source_id, operational_scenario_tags, compliance_object_tags, jurisdictions, jurisdiction_iso, topic_tags";

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

/**
 * Rule 16(d) (system-prompt.ts, "the forward-participation clause"): a failure of connection discovery
 * (16a) or forward-event extraction (16b) is a RECORDED integrity_flags defect, never a silent skip.
 * Shared by both post-insert blocks below so the two writers can never drift on category/created_by/
 * subject_type shape — same "one home for the shape" discipline flag-namespaces.mjs's createdBy already
 * enforces for the namespace prefix itself. Best-effort: the write itself must never throw back into a
 * mint that already succeeded — a failure to RECORD the defect is swallowed exactly like the other
 * post-insert flag writes in this file (seekStudy / lowRelevance's `.then(() => {}, () => {})`).
 * @param {SupabaseClient} sb
 * @param {string} itemId
 * @param {"discovery"|"forward-events"} subtype - which rule-16 step failed
 * @param {string} message - the caught error's message, verbatim
 */
export async function recordFlywheelDefect(
  sb: SupabaseClient,
  itemId: string,
  subtype: "discovery" | "forward-events",
  message: string
): Promise<void> {
  const step = subtype === "discovery" ? "(a) connection discovery" : "(b) forward-event extraction";
  await sb
    .from("integrity_flags")
    .insert({
      category: "data_quality",
      subject_type: "item",
      subject_ref: itemId,
      description: `rule 16 ${step} failed at mint for item ${itemId}: ${message}`,
      recommended_actions: [
        { action: "investigate", rationale: `${step} did not run for this item — the mint proceeded (non-fatal by design), but the flywheel step itself never completed and must be re-run or diagnosed` },
      ],
      status: "open",
      created_by: createdBy(FLYWHEEL_DEFECT_NAMESPACE, subtype),
    })
    .then(() => {}, () => {});
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
    // "references" was CHECK-illegal (item_cross_references_relationship_check, migration 004, allows
    // exactly {related, supersedes, implements, conflicts, amends, depends_on}) and the error below was
    // swallowed — every dedup:linked mint has silently failed to write this edge since the CHECK landed.
    // See ADR-021 / docs/plans/connection-redesign-and-build-scope-2026-08-29.md WO-28's latent-defect
    // note. Fixed to a CHECK-legal value; guarded against recurrence by
    // .discipline/relationship-check-literals.test.mjs.
    await sb
      .from("item_cross_references")
      .upsert(
        { source_item_id: itemId, target_item_id: linkTargetId, relationship: "related", origin: "entity_extraction" },
        { onConflict: "source_item_id,target_item_id", ignoreDuplicates: true }
      )
      .then(() => {}, () => {});
  }
  // ── U4 / rule 16(a): L1 incremental connection discovery at mint (flywheel, closes the growth loop) ──
  // Reuses discover.mjs's scoring (proven by the backfill, A2) and write-edges.mjs's origin-aware writer
  // (never clobbers an entity_extraction/agent_semantic edge) — no new logic, no new write path. Runs
  // ONCE per mint, bounded to 12 edges (discoverConnections' default limit); piggybacks this call's own
  // clock, so it adds no resident process and no new schedule (Execution model: operator-cadence,
  // default off). Non-fatal by construction (try/catch): a discovery failure must never fail a mint —
  // the standalone backfill remains the cold-start/repair path if this ever misses or errors. Rule 16(d):
  // a failure here is RECORDED as an integrity_flags defect (recordFlywheelDefect above) — never a
  // silent skip, which is the class fix for this block's pre-rule-16 posture (an empty catch).
  // MOAT BOUNDARY: writes ONLY item_cross_references, same table the dedup:linked edge above touches.
  try {
    const corpus: Array<Record<string, unknown>> = [];
    for (let from = 0; ; from += 1000) {
      const { data: sigRows, error: sigErr } = await sb
        .from("intelligence_items")
        .select(CONNECTION_SIGNATURE_COLUMNS)
        .eq("provenance_status", "verified")
        .eq("is_archived", false)
        .neq("id", itemId)
        .order("id", { ascending: true })
        .range(from, from + 999);
      if (sigErr) throw new Error(sigErr.message);
      corpus.push(...(sigRows ?? []));
      if (!sigRows || sigRows.length < 1000) break;
    }
    const newItemSignature = {
      id: itemId,
      item_type: seed.item_type,
      canonical_instrument_key: seed.canonical_instrument_key,
      source_id: seed.source_id,
      operational_scenario_tags: seed.operational_scenario_tags,
      compliance_object_tags: seed.compliance_object_tags,
      jurisdictions: seed.jurisdictions,
      jurisdiction_iso: seed.jurisdiction_iso,
      topic_tags: seed.topic_tags,
    };
    // ADR-019: frequency map from this same already-loaded corpus — no new query, same discipline as
    // backfill-edges.mjs (the two callers must never diverge on what "shared provenance" weighs).
    const freqMap = computeTagFrequencies(corpus);
    const conns = discoverConnections(newItemSignature, corpus, { surfaceOf: (t: string) => surfaceOf(t), freqMap });
    if (conns.length) {
      const edges = conns.map((c: { target: string; basis: unknown; score: number }) => ({
        source_item_id: itemId,
        target_item_id: c.target,
        relationship: "related",
        origin: "provenance_discovery",
        basis: c.basis,
        score: c.score,
      }));
      await writeDiscoveredEdges(sb, edges);
      flags.push(`discovery:${edges.length}`);
    }
  } catch (e: unknown) {
    // non-fatal — same swallow-and-continue posture as seekStudy/lowRelevance below (their
    // .then(() => {}, () => {})); a discovery-scan failure must never surface as a mint failure. Rule
    // 16(d): record it, do not just swallow it.
    await recordFlywheelDefect(sb, itemId, "discovery", e instanceof Error ? e.message : String(e));
    flags.push("discovery-failed");
  }

  // ── rule 16(b): forward-event extraction at mint time (flywheel, "the forward-participation clause") ─
  // Reads back this item's already-grounded content — section_claim_provenance (FACT/GAP claims) and
  // intelligence_item_sections (rendered section markdown) — and runs the SAME pure extractor the
  // forward-events harness family uses (src/lib/forward-events/extract-forward-events.mjs), so there is
  // exactly one extraction implementation, never a second copy grown here. A brand-new mint typically has
  // ZERO rows in either table yet (grounding/section-extraction is a later regeneration pass — this
  // file's own header: "NEVER writes section_claim_provenance"), so extraction usually runs over empty
  // input and emits nothing; that is a correct, honest zero, not a skip. Non-fatal by construction: an
  // extraction failure must never fail a mint. Rule 16(d): a failure here is a RECORDED integrity_flags
  // defect, same posture and same helper as the discovery block above.
  // MOAT BOUNDARY: writes ONLY item_forward_events, a table nothing else in this chokepoint touches. A
  // plain INSERT (no upsert/onConflict) is correct and safe here: itemId is a row this call itself just
  // minted, so no item_forward_events row for it can already exist — there is nothing to conflict with.
  try {
    const [{ data: claimRows, error: claimErr }, { data: sectionRows, error: sectionErr }] = await Promise.all([
      sb
        .from("section_claim_provenance")
        .select("id, claim_kind, claim_text, source_span")
        .eq("intelligence_item_id", itemId)
        .in("claim_kind", ["FACT", "GAP"]),
      sb.from("intelligence_item_sections").select("id, section_key, content_md").eq("item_id", itemId),
    ]);
    if (claimErr) throw new Error(`section_claim_provenance read failed: ${claimErr.message}`);
    if (sectionErr) throw new Error(`intelligence_item_sections read failed: ${sectionErr.message}`);

    const claims = (claimRows ?? []).map((r: Record<string, unknown>) => ({
      claim_id: r.id as string,
      kind: r.claim_kind as "FACT" | "GAP",
      text: r.claim_text as string,
      span: (r.source_span as string | null) ?? null,
    }));
    const sections = (sectionRows ?? []).map((r: Record<string, unknown>) => ({
      section_id: r.id as string,
      key: r.section_key as string,
      md: (r.content_md as string | null) ?? "",
    }));

    const { events } = extractForwardEvents({ claims, sections });
    if (events.length) {
      const rows = events.map((ev: object) => ({ intelligence_item_id: itemId, ...(ev as Record<string, unknown>) }));
      const { error: fwdErr } = await sb.from("item_forward_events").insert(rows);
      if (fwdErr) throw new Error(`item_forward_events insert failed: ${fwdErr.message}`);
      flags.push(`forward-events:${events.length}`);
    }
  } catch (e: unknown) {
    await recordFlywheelDefect(sb, itemId, "forward-events", e instanceof Error ? e.message : String(e));
    flags.push("forward-events-failed");
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
