#!/usr/bin/env node
// tier-opinions.mjs — MAINT dispatch step (Lane ATTACH-SOURCES, 2026-09-05, W3.3 per
// docs/plans/complete-system-build-plan-2026-09-04.md).
//
// HISTORY: this step previously reported "NOT RUNNABLE" (Lane MAINT, 2026-09-02) because the ONLY
// upstream that fed `source_tier_opinions` (migration 091) was the LLM brief-generation agent's own
// "New Sources Identified" table (`registerCitedSources` in source-growth.ts, stamped
// `opinion_source: 'haiku_brief_classifier'`) — out of scope for a $0, no-LLM MAINT runtime. That
// finding is still true of THAT upstream; it has not changed. What changed: a genuinely deterministic,
// $0, no-LLM SECOND upstream already exists elsewhere in this repo and simply had no writer wired to
// it — the SC-13 class table (`classTierForHost` in src/lib/sources/host-authority.ts) that
// `heal-provenance.mjs`'s STEP SOURCE and `institution-canonicalize.mjs`'s Part C already use to
// classify a host's tier with zero guessing. This step IS that writer, scoped to the whole `sources`
// table (Part C above only ever looked at `source_role='standards_body'` rows en route to an
// AUTO-APPLIED base_tier override — a credibility ruling, gated by ADR-002 and ITS OWN "operator
// ruling" ceremony). This step never touches `sources.base_tier` — it only RECORDS an OPINION
// (migration 091's own table, built for exactly this: a repeatable, non-authoritative tier estimate
// from a process OTHER than brief generation, aggregated by `get_tier_opinion_disagreements` toward the
// admin review surface at /api/admin/sources/tier-opinions, migration 099).
//
// THE PLAN. For every `sources` row with a non-null `url`: resolve `host = hostOf(url)`, then
// `classTier = classTierForHost(host)`. A host the class table does not recognize (`classTier === null`)
// is skipped — SC-13's own no-guess posture, applied here unchanged. A host the class table DOES
// recognize, whose class tier DISAGREES with the row's current `base_tier`, is a disagreement: record
// one opinion (`opinion_source: 'host_class_table'`, migration 309) with `opined_tier = classTier`
// against `target_source_id = source.id`. A row where the class table AGREES with `base_tier` records
// nothing (there is no disagreement to preserve).
//
// WHY REPEAT RUNS ARE NOT SUPPRESSED (no dedup-before-insert here, matching
// `recordTierOpinion`'s own no-dedup contract — see tier-opinion-writer.ts and
// docs/inventories/shared-dataset-ownership.md's `source_tier_opinions` section). Migration 091's Q3
// design counts REPEAT opinions across a 90-day window (`get_tier_opinion_disagreements`) — a
// disagreement this step still finds on a LATER dispatch is real, additional evidence that the
// mismatch persists, never a duplicate to collapse. Re-dispatching this step is still safe to repeat
// (nothing is EVER written twice for the "same" reason in a way that corrupts state — every row is an
// honest, independent observation, and the table is INSERT-only/append-only by design), it just is not
// idempotent in the "produces zero new rows the second time" sense `attach-found-sources` is. This
// step has no live schedule (operator ruling: no crons) — its dispatch cadence is whatever the operator
// or coordinator chooses by hand.
//
// migration 309 extends the `opinion_source` CHECK constraint (091) to add the `'host_class_table'`
// literal this step's writes use — `recordTierOpinion`'s `opinionSource` parameter (this lane) is the
// only caller of that new literal.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hostOf } from "../lib/institution-key.mjs";
import { classTierForHost } from "../../src/lib/sources/host-authority.ts";
import { recordTierOpinion } from "../../src/lib/sources/tier-opinion-writer.ts";
import { runCli } from "./lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "tier-opinions-2026-09-05",
  reason:
    "MAINT tier-opinions dispatch (Lane ATTACH-SOURCES, W3.3): records a source_tier_opinions row " +
    "(opinion_source='host_class_table', migration 309) for every source whose host the SC-13 class " +
    "table (classTierForHost) recognizes and whose class tier disagrees with the source's current " +
    "base_tier — a deterministic, $0, no-LLM second upstream for migration 091's aggregator, never a " +
    "base_tier write itself (that stays institution-canonicalize.mjs Part C's gated, operator-ruled path).",
});

/**
 * PURE planner. `sources`: [{ id, url, base_tier }]. Returns one entry per DISAGREEING source:
 *   { source_id, url, host, current_tier, class_tier }
 * A source with no url, an unresolvable host, or a host the class table does not recognize
 * (`classTierForHost` returns null) is excluded — never guessed. A source whose class tier already
 * MATCHES its base_tier is excluded — nothing to opine.
 */
export function planTierOpinions(sources) {
  const plan = [];
  for (const s of sources ?? []) {
    if (!s?.url) continue;
    const host = hostOf(s.url);
    if (!host) continue;
    const classTier = classTierForHost(host);
    if (classTier == null) continue;
    if (classTier === s.base_tier) continue;
    plan.push({ source_id: s.id, url: s.url, host, current_tier: s.base_tier, class_tier: classTier });
  }
  return plan;
}

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ readSources: () => Promise<Array<{id:string,url:string,base_tier:number}>>,
 *            supabase: import("../../src/lib/sources/tier-opinion-writer.ts").MinimalSupabaseClient }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const sources = await deps.readSources();
  const plan = planTierOpinions(sources);

  const summary = {
    step: "tier-opinions",
    mode,
    counts: {
      sources_scanned: sources.length,
      disagreements: plan.length,
      plan,
    },
    applied: 0,
    read_back: {},
    exitCode: 0,
  };

  if (!apply) return summary;

  const results = [];
  let written = 0;
  for (const p of plan) {
    const res = await recordTierOpinion(deps.supabase, {
      targetSourceId: p.source_id,
      opinedTier: p.class_tier,
      opinionSource: "host_class_table",
    });
    results.push({ source_id: p.source_id, host: p.host, class_tier: p.class_tier, ok: res.ok, error: res.error ?? null });
    if (res.ok) written += 1;
  }
  summary.applied = written;
  summary.read_back = { opinions_written: written, opinions_attempted: plan.length, results };
  if (written < plan.length) summary.exitCode = 1; // at least one insert failed — surfaced, never swallowed at this layer
  return summary;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "tier-opinions",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll } = await import("../lib/db.mjs");
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      return {
        readSources: () => readAll("sources", "id, url, base_tier"),
        supabase: sb,
      };
    },
  });
}
