// portal-harvest — B1 of the scrape-and-build plan (docs/plans/scrape-and-build-content-plan-2026-07-19.md):
// the CONSUME half of the P2-5 portal deep-link discovery slice, closing the half-slice the structure
// audit named (portal_link_candidates had a writer, no reader).
//
// Two halves, both REUSE-ONLY at the seams:
//
//   persistPortalCandidates  the ONE ledger write-site (extracted from the check-sources inline loop so
//                            the scheduled crawl and the manual harvest share identical upsert semantics:
//                            onConflict url refreshes last_seen_at/anchor_text ONLY — status, first_seen_at
//                            and dispositions are never overwritten by a re-crawl).
//
//   consumePortalCandidates  ledger rows (status='candidate') → fetch (injected; live = the transport
//                            escalation ladder, direct-HTTP first) → firstFetchClassify (the LIVE content
//                            gate: error-body pre-gate + entity_verdict portal/uncertain/specific_document)
//                            → the intake chokepoint via applyStagedUpdate/runIntakeCycle.
//
// GATE PLACEMENT (mint-item dispatch §1, binding): this module PRECOMPUTES inputs (verdict, item_type,
// severity mapping, source link) — every gate DECISION stays in the chokepoint. The consumer presets
// seed.source_id from the ledger row's parent portal (the caller-preset path the scan route uses),
// because a deep-link URL is deliberately NOT in the sources registry — its parent portal is.
//
// MODES (dryRun-first, ruled): 'plan' is READ-ONLY and free of grounding — every candidate runs the real
// chokepoint gates via dryRun and NOTHING is written (no ledger update, no staged row, no mint, no fetchless
// spend beyond the classify Haiku call). 'apply' runs plan's dry pre-pass first, then pushes ONLY the
// would-mint candidates through the full runIntakeCycle (stage → mint → ground → validate) and stamps the
// ledger disposition (mig 220: status + disposition_reason + item_id) — a disposition without a recorded
// reason is the RD-6 silent-backlog shape, so every status change carries its machine reason verbatim.
//
// SPEND: plan mode costs ~$0.001/candidate (Haiku classify) + free direct-HTTP fetches. apply mode enters
// the ONE grounding contract (generateBriefWorkflow) per minted item — the operator-priced path; the runner
// defaults to plan and requires an explicit flag for apply.
import type { SupabaseClient } from "@supabase/supabase-js";
import { firstFetchClassify, type FirstFetchClassifyOutput } from "@/lib/llm/first-fetch-classify";
import { toDbSeverity } from "@/lib/agent/metadata-vocab";
import { applyStagedUpdate } from "./apply-staged-update";
import { runIntakeCycle, type IntakeCandidate, type IntakeCycleResult } from "./run-intake-cycle";

// ── persistPortalCandidates — the ONE portal_link_candidates write-site ──────────────────────────────

export interface PortalLink {
  url: string;
  anchorText?: string | null;
}

export interface PersistResult {
  upserted: number;
  failed: number;
}

/** Upsert discovered portal deep links into the ledger. Verbatim semantics of the former check-sources
 *  inline loop: one row per URL ever (UNIQUE url); a re-crawl refreshes last_seen_at + anchor_text and
 *  NEVER touches status / first_seen_at / disposition columns. Non-fatal per link (a failed upsert is
 *  counted, never thrown) so a crawl failure cannot fail the caller's accessibility check. */
export async function persistPortalCandidates(
  sb: SupabaseClient,
  sourceId: string,
  links: PortalLink[]
): Promise<PersistResult> {
  let upserted = 0, failed = 0;
  for (const l of links) {
    const { error } = await sb.from("portal_link_candidates").upsert(
      { source_id: sourceId, url: l.url, anchor_text: l.anchorText ?? null, last_seen_at: new Date().toISOString() },
      { onConflict: "url" }
    );
    if (error) {
      console.warn(`[portal-crawl] candidate upsert failed for ${l.url}: ${error.message}`);
      failed++;
      continue;
    }
    upserted++;
  }
  return { upserted, failed };
}

// ── consumePortalCandidates — ledger → classify → intake ─────────────────────────────────────────────

/** A ledger row joined with its parent portal source (the classify context + the source-link preset). */
export interface LedgerCandidate {
  id: string;
  url: string;
  anchor_text: string | null;
  source_id: string;
  sources: {
    name: string | null;
    category: string | null;
    base_tier: number | null;
  } | null;
}

/** Injected fetch: returns cleaned text (the transport ladder's FetchResult shape, reduced). */
export type FetchDocFn = (url: string) => Promise<{ text: string; transport?: string }>;
export type ClassifyFn = typeof firstFetchClassify;

export type CandidateDisposition =
  | "would_mint"        // plan: every chokepoint gate passed (dry)
  | "would_reject"      // plan: a chokepoint gate rejected (dry)
  | "exists"            // subject already minted — ledger promotes to the existing item, no re-ground
  | "not_an_item"       // entity gate: portal / uncertain verdict — rejected as an ITEM candidate
  | "promoted"          // apply: minted (item_id stamped; grounding verdict in reason)
  | "rejected"          // apply: chokepoint rejected — ledger rejected with the machine reason
  | "skipped";          // inconclusive (fetch/classify failure) — row left untouched for retry

export interface CandidateOutcome {
  ledgerId: string;
  url: string;
  disposition: CandidateDisposition;
  /** Machine reason, verbatim from the gate that acted (classify rationale / chokepoint error / trail). */
  reason: string;
  itemId?: string | null;
  itemType?: string | null;
  title?: string | null;
}

export interface ConsumeResult {
  mode: "plan" | "apply";
  discovered: number;
  fetched: number;
  classified: number;
  outcomes: CandidateOutcome[];
  /** apply only: the full intake-cycle disposition trail for the would-mint set. */
  cycle?: IntakeCycleResult;
}

export interface ConsumeOpts {
  mode: "plan" | "apply";
  /** Cap on ledger rows consumed this run (ruled: bounded runs, no unbounded sweeps). */
  limit: number;
  /** Restrict to one portal source (proving-slice runs are per-source). */
  sourceId?: string;
  /** Consume newest-first (freshest walk results) instead of the oldest-backlog default. */
  newestFirst?: boolean;
  /** F16 signed caller threaded to fetch + grounding (manual runner passes manual-intake-run). */
  caller?: string | null;
  fetchDoc: FetchDocFn;
  classify?: ClassifyFn;
  anthropicKey: string;
  now?: () => string;
}

/** Build the intake candidate (staged proposed_changes) from a classified ledger row. PURE — the one
 *  place classifier output maps to the seed vocabulary: severity display→db (toDbSeverity), source_id
 *  preset from the parent portal, relevance carried for the chokepoint's surface-only floor (the seed
 *  strip in applyStagedUpdate keeps it out of the INSERT). */
export function buildCandidateSeed(row: LedgerCandidate, cls: FirstFetchClassifyOutput): IntakeCandidate {
  return {
    title: cls.title_candidate,
    source_url: row.url,
    item_type: cls.item_type as string,
    domain: cls.domain,
    severity: toDbSeverity(cls.severity),
    priority: cls.priority,
    urgency_tier: cls.urgency_tier,
    topic_tags: cls.topic_tags,
    jurisdictions: cls.jurisdictions,
    summary: cls.summary,
    relevance: cls.relevance,
    source_id: row.source_id,
  };
}

export async function consumePortalCandidates(sb: SupabaseClient, opts: ConsumeOpts): Promise<ConsumeResult> {
  const { mode, limit, sourceId, fetchDoc, anthropicKey } = opts;
  const classify = opts.classify ?? firstFetchClassify;
  const now = opts.now ?? (() => new Date().toISOString());
  const outcomes: CandidateOutcome[] = [];

  let q = sb
    .from("portal_link_candidates")
    .select("id,url,anchor_text,source_id,sources(name,category,base_tier)")
    .eq("status", "candidate")
    .order("first_seen_at", { ascending: !opts.newestFirst })
    .limit(limit);
  if (sourceId) q = q.eq("source_id", sourceId);
  const { data: rows, error: qErr } = await q;
  if (qErr) throw new Error(`[portal-harvest] ledger read failed: ${qErr.message}`);
  const candidates = (rows ?? []) as unknown as LedgerCandidate[];

  // Stamp a ledger disposition (apply mode only — plan is READ-ONLY by contract).
  const stamp = async (row: LedgerCandidate, status: "promoted" | "rejected", reason: string, itemId: string | null) => {
    if (mode !== "apply") return;
    const { error } = await sb
      .from("portal_link_candidates")
      .update({ status, disposition_reason: reason.slice(0, 900), dispositioned_at: now(), item_id: itemId })
      .eq("id", row.id);
    if (error) console.warn(`[portal-harvest] disposition stamp failed for ${row.url}: ${error.message}`);
  };

  let fetched = 0, classified = 0;
  const mintable: Array<{ row: LedgerCandidate; seed: IntakeCandidate }> = [];

  for (const row of candidates) {
    // 1 — FETCH (injected; inconclusive on failure — the fetchOk discipline: an unreadable fetch is
    //     NOT a reject, the row stays 'candidate' for a later retry).
    let text = "";
    try {
      const r = await fetchDoc(row.url);
      text = r?.text ?? "";
    } catch (e) {
      outcomes.push({ ledgerId: row.id, url: row.url, disposition: "skipped", reason: `fetch failed: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }
    if (text.trim().length < 200) {
      outcomes.push({ ledgerId: row.id, url: row.url, disposition: "skipped", reason: `fetch inconclusive: ${text.trim().length}ch (<200ch floor)` });
      continue;
    }
    fetched++;

    // 2 — CLASSIFY through the LIVE content gate (error-body pre-gate + entity verdict inside).
    const res = await classify(
      {
        source_id: row.source_id,
        source_url: row.url,
        source_name: row.anchor_text || row.sources?.name || null,
        source_tier: row.sources?.base_tier ?? null,
        source_category: (row.sources?.category ?? null) as never,
        text,
      },
      anthropicKey
    );
    if (!res.ok) {
      // Classify FAILURE is INCONCLUSIVE (Haiku 429/parse) — never a reject. Row untouched.
      outcomes.push({ ledgerId: row.id, url: row.url, disposition: "skipped", reason: `classify failed: ${res.error}` });
      continue;
    }
    classified++;
    const cls = res.result;

    // 3 — ENTITY GATE precompute: a portal/uncertain verdict is NOT an item — rejected AS AN ITEM
    //     candidate with the verdict recorded (a sub-portal stays minable from rejected rows later).
    if (cls.entity_verdict !== "specific_document" || !cls.item_type) {
      const reason = `entity-gate: ${cls.entity_verdict} — ${cls.rationale || "not a specific document"}`;
      await stamp(row, "rejected", reason, null);
      outcomes.push({ ledgerId: row.id, url: row.url, disposition: "not_an_item", reason, title: cls.title_candidate });
      continue;
    }

    // 4 — SEED (pure mapping; toDbSeverity throws on a vocabulary contract break → inconclusive, loud).
    let seed: IntakeCandidate;
    try {
      seed = buildCandidateSeed(row, cls);
    } catch (e) {
      outcomes.push({ ledgerId: row.id, url: row.url, disposition: "skipped", reason: `seed vocabulary: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }

    // 5 — DRY PRE-PASS through the REAL chokepoint (F6: apply minus the INSERT — cannot drift).
    const dry = await applyStagedUpdate(sb, { update_type: "new_item", proposed_changes: { ...seed } }, { dryRun: true });
    if (dry.success && dry.action === "exists" && dry.itemId) {
      // Subject already minted — promote the ledger row to the existing item; NEVER re-ground here.
      const reason = `exists: subject already minted as ${dry.itemId} (idempotent — no re-ground)`;
      await stamp(row, "promoted", reason, dry.itemId);
      outcomes.push({ ledgerId: row.id, url: row.url, disposition: "exists", reason, itemId: dry.itemId, itemType: seed.item_type, title: seed.title });
      continue;
    }
    if (!dry.success) {
      const reason = `${dry.action ? `chokepoint:${dry.action}` : "entity-gate"} — ${dry.error ?? "rejected"}`;
      await stamp(row, "rejected", reason, null);
      outcomes.push({ ledgerId: row.id, url: row.url, disposition: mode === "plan" ? "would_reject" : "rejected", reason, itemType: seed.item_type, title: seed.title });
      continue;
    }
    if (mode === "plan") {
      outcomes.push({
        ledgerId: row.id, url: row.url, disposition: "would_mint",
        reason: `dry: ${dry.action ?? "minted"}${dry.flags?.length ? ` [${dry.flags.join(",")}]` : ""}`,
        itemType: seed.item_type, title: seed.title,
      });
      continue;
    }
    mintable.push({ row, seed });
  }

  // 6 — APPLY: the would-mint set runs the FULL cycle (stage → mint → ground → validate), then the
  //     ledger stamps each outcome with the cycle's machine trail.
  let cycle: IntakeCycleResult | undefined;
  if (mode === "apply" && mintable.length) {
    cycle = (await runIntakeCycle(
      sb,
      mintable.map((m) => m.seed),
      { caller: opts.caller ?? undefined, mode: "apply" }
    )) as IntakeCycleResult;
    for (const m of mintable) {
      const item = cycle.items.find((i) => i.source_url === m.seed.source_url);
      if (!item) continue; // defensive: cycle returns one outcome per candidate
      if (item.itemId) {
        const reason = `minted (${item.disposition})${item.reason ? `: ${item.reason}` : ""}`;
        await stamp(m.row, "promoted", reason, item.itemId);
        outcomes.push({ ledgerId: m.row.id, url: m.row.url, disposition: "promoted", reason, itemId: item.itemId, itemType: m.seed.item_type, title: m.seed.title });
      } else if (item.disposition === "rejected") {
        const reason = `${item.gate ?? "chokepoint"} — ${item.reason ?? "rejected"}`;
        await stamp(m.row, "rejected", reason, null);
        outcomes.push({ ledgerId: m.row.id, url: m.row.url, disposition: "rejected", reason, itemType: m.seed.item_type, title: m.seed.title });
      } else {
        // stage_failed (transient) — row stays 'candidate' for retry, reported not stamped.
        outcomes.push({ ledgerId: m.row.id, url: m.row.url, disposition: "skipped", reason: `${item.disposition}: ${item.reason ?? ""}`, itemType: m.seed.item_type, title: m.seed.title });
      }
    }
  }

  return { mode, discovered: candidates.length, fetched, classified, outcomes, cycle };
}
