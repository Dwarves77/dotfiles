// @ts-check
// change-sweep — B4 of the scrape-and-build plan (docs/plans/scrape-and-build-content-plan-2026-07-19.md):
// the change-to-analysis consumer, closing Step 1 F2 ("change-detection terminates"). Everything upstream
// and downstream of this module already exists — this is ONLY the bridge:
//
//   detection   check-sources contentFingerprint/isContentChange + reconcile.ts recordItemChange (built)
//   THIS        a changed source → enumerate its VERIFIED items → verifyItem each (the ONE snapshot-first
//               entry, F21) → record the disposition split
//   routing     decideVerify (built, ruled): spans intact vs stored → verified_cheap (record only);
//               source changed → STALE_FLAG queue row; spans broken/no snapshot → needs_acquire (LOCKED
//               behind GROUNDING_ACQUIRE_ENABLED — paid re-ground stays operator-priced, unchanged)
//
// SCOPE: VERIFIED items only. A detected change threatens the VERIFIED status of items grounded on that
// source; quarantined items belong to research-or-erase, not this sweep. READ-ONLY by default (act:false
// — the verify-item contract: build/tests/dry-runs move $0); side effects only with an explicit act:true.
// BOUNDED: per-source, with a limit; the summary reports what was NOT swept (never silent).
import { verifyItem } from "./verify-item.mjs";

/**
 * Sweep one changed source: run the snapshot-first verification over its verified items.
 * @param {import("@supabase/supabase-js").SupabaseClient} svc
 * @param {{
 *   getSnapshot: Function, probeFreshness: Function, cheapVerifyClaims: Function,
 *   loadItem: Function, loadClaims: Function, env?: Record<string,string|undefined>,
 * }} deps  the verify-item dependency set (live bindings in the runner; fakes in tests)
 * @param {{ sourceId: string, act?: boolean, limit?: number }} opts
 */
export async function sweepChangedSource(svc, deps, { sourceId, act = false, limit = 50 }) {
  const { data: items, error } = await svc
    .from("intelligence_items")
    .select("id,title,provenance_status")
    .eq("source_id", sourceId)
    .eq("provenance_status", "verified")
    .eq("is_archived", false)
    .limit(limit + 1);
  if (error) throw new Error(`[change-sweep] verified-item read failed: ${error.message}`);
  const all = items ?? [];
  const swept = all.slice(0, limit);
  const notSwept = all.length > limit ? all.length - limit : 0; // bounded, reported — never silent

  const results = [];
  const counts = { verified_cheap: 0, stale_flag: 0, needs_acquire: 0 };
  for (const it of swept) {
    const r = await verifyItem(svc, it.id, { ...deps, act });
    counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
    results.push({ itemId: it.id, title: it.title, outcome: r.outcome, reason: r.reason, acted: r.acted ?? false });
  }
  return { sourceId, sweptCount: swept.length, notSwept, counts, act, results };
}

/**
 * Sweep every source flagged changed by the LAST check pass (sources.change_detected via monitored_sources
 * view is worker-internal; the durable signal this consumer reads is check-sources' last_result on the
 * monitoring queue — injected as a loader so the module stays pure of that schema).
 * @param {import("@supabase/supabase-js").SupabaseClient} svc
 * @param {{ loadChangedSourceIds: (svc:any)=>Promise<string[]> }} loaders
 * @param {Parameters<typeof sweepChangedSource>[1]} deps
 * @param {{ act?: boolean, limitPerSource?: number, maxSources?: number }} [opts]
 */
export async function sweepAllChangedSources(svc, loaders, deps, { act = false, limitPerSource = 50, maxSources = 10 } = {}) {
  const ids = await loaders.loadChangedSourceIds(svc);
  const taken = ids.slice(0, maxSources);
  const skippedSources = ids.length - taken.length; // bounded, reported
  const sweeps = [];
  for (const sourceId of taken) {
    sweeps.push(await sweepChangedSource(svc, deps, { sourceId, act, limit: limitPerSource }));
  }
  const totals = sweeps.reduce(
    (a, s) => ({
      verified_cheap: a.verified_cheap + (s.counts.verified_cheap ?? 0),
      stale_flag: a.stale_flag + (s.counts.stale_flag ?? 0),
      needs_acquire: a.needs_acquire + (s.counts.needs_acquire ?? 0),
    }),
    { verified_cheap: 0, stale_flag: 0, needs_acquire: 0 }
  );
  return { sources: taken.length, skippedSources, totals, sweeps, act };
}
