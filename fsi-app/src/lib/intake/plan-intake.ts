// PLAN mode (Step 5 of the intake-correctness dispatch): full gate evaluation per candidate against the LIVE
// corpus — READ-ONLY. No stage, no mint, no fetch, no spend. Emits the verdict table (entity-gate / congruence
// / dedup / relevance → would-mint or would-reject+reason) so a run is REVIEWED before apply fires. It uses the
// SAME pure gate primitives the mint chokepoint uses (urlIsRoot, congruence, sourceRole, matchExistingSubject),
// so a plan verdict cannot drift from what apply would decide. Kept in its own module (relative imports, no
// workflow/grounding graph) so it is depless-testable in isolation.
import type { SupabaseClient } from "@supabase/supabase-js";
import { urlIsRoot } from "../sources/entity-gate.mjs";
import { congruence, sourceRole } from "../entities/source-role.mjs";
import { matchExistingSubject } from "../entities/entity-resolve.mjs";

export type CycleMode = "plan" | "apply";

/** One candidate's read-only PLAN verdict — full gate evaluation against the live corpus, NO write/fetch/spend. */
export interface PlanVerdict {
  title: string;
  source_url: string;
  entity_gate: string;   // "pass (document)" | "reject (portal root)"
  congruence: string;    // "congruent" | "1a → market_signal" | "1b seek-study"
  dedup: string;         // "none" | "linked→<id>(source_url)" | "duplicate of <id>(how),…"
  relevance: string;     // "n/a" | "ok (NN)" | "low (NN) → flag"
  verdict: "would_mint" | "would_reject";
  reason?: string;       // for would_reject / notes
}

export interface PlanResult {
  mode: "plan";
  discovered: number;
  wouldMint: number;
  wouldReject: number;
  verdicts: PlanVerdict[];
}

/** A candidate = the staged_updates.proposed_changes shape for a new_item (title + source_url + item_type + …). */
export interface PlanCandidate {
  title: string;
  source_url: string;
  item_type: string;
  [k: string]: unknown;
}

/** The live-corpus shape the dedup matcher needs. */
interface CorpusRow { id: string; title: string | null; instrument_identifier: string | null; source_url: string | null }

export async function planIntakeCycle(sb: SupabaseClient, candidates: PlanCandidate[]): Promise<PlanResult> {
  const { data: corpus } = await sb
    .from("intelligence_items")
    .select("id,title,instrument_identifier,source_url")
    .eq("is_archived", false);
  const live = (corpus ?? []) as CorpusRow[];
  const verdicts: PlanVerdict[] = [];
  let wouldMint = 0, wouldReject = 0;

  for (const c of candidates) {
    const sourceUrl = String(c.source_url ?? "");
    // 1 — ENTITY GATE (source != item): a portal-root URL is a SOURCE, not an item → would NOT mint.
    if (urlIsRoot(sourceUrl)) {
      verdicts.push({ title: c.title, source_url: sourceUrl, entity_gate: "reject (portal root)", congruence: "—", dedup: "—", relevance: "—", verdict: "would_reject", reason: `entity-gate: ${sourceUrl} is a portal root URL — a source, not an item` });
      wouldReject++; continue;
    }
    // 2 — CONGRUENCE (1a retype / 1b seek-study)
    const cong = congruence(c.item_type, sourceUrl);
    const congStr = cong.changed ? `1a → ${cong.itemType}` : cong.incongruentSource ? "1b seek-study" : "congruent";
    // 3 — SUBJECT DEDUP (the fixed canonicalizeUrl matcher) against the live corpus
    const dups = matchExistingSubject({ ...c, item_type: cong.itemType }, live);
    let dedup = "none";
    let verdict: "would_mint" | "would_reject" = "would_mint";
    let reason: string | undefined;
    if (dups.length) {
      if (sourceRole(sourceUrl) === "news") {
        // news duplicating an existing subject → mint a market_signal + edge (link, never drop) — still mints.
        dedup = `linked→${dups[0].id.slice(0, 8)}(${dups[0].how})`;
      } else {
        dedup = `duplicate of ${dups.slice(0, 3).map((d) => `${d.id.slice(0, 8)}(${d.how})`).join(", ")}`;
        verdict = "would_reject";
        reason = `dedup: subject already exists (${dedup}) — would not mint a duplicate`;
      }
    }
    // 4 — RELEVANCE (surface-only, never blocks; floor 40 mirrors the mint chokepoint)
    const rel = (c as { relevance?: number | null }).relevance;
    const relevance = rel == null ? "n/a" : rel < 40 ? `low (${rel}) → flag` : `ok (${rel})`;
    verdicts.push({ title: c.title, source_url: sourceUrl, entity_gate: "pass (document)", congruence: congStr, dedup, relevance, verdict, reason });
    if (verdict === "would_mint") wouldMint++; else wouldReject++;
  }
  return { mode: "plan", discovered: candidates.length, wouldMint, wouldReject, verdicts };
}
