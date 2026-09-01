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
import { readSnapshotBody } from "./snapshot-store.mjs";
import { diffDocuments } from "./amendment-diff.mjs";

/**
 * Sweep one changed source: run the snapshot-first verification over its verified items.
 * @param {import("@supabase/supabase-js").SupabaseClient} svc
 * @param {{
 *   getSnapshot: any, probeFreshness: any, cheapVerifyClaims: any,
 *   loadItem: any, loadClaims: any, env?: Record<string,string|undefined>,
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
  /** @type {Record<string, number>} */
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

// ── THE STAGED_UPDATES BRIDGE (Task 2, lane CD, 2026-09-01) ─────────────────────────────────────────────
// The other half of "closing Step 1 F2": sweepChangedSource above is the VERIFICATION side (verify-item
// routing, VERIFIED items only, integrity_flags queue). This is the ANALYSIS-review side — the reconcile
// worker's own consumer (src/lib/sources/reconcile.ts, runReconcilePass) calls this once per changed
// source for its LIVE items (not restricted to provenance_status='verified' — a live but not-yet-verified
// item grounded on a changed source is exactly as worth a review flag). It stages ONE update_item
// staged_updates row per live item, carrying a human-readable amendment-diff summary in `reason`, so the
// existing apply-staged-update.ts update_item review/apply path can re-verify the item's content and (on
// apply) rule 16 (contract v2.2) re-runs the flywheel (connection discovery + forward-event extraction).
//
// NO AUTONOMOUS REWRITE (operator constraint): `proposed_changes` is always `{}` — this bridge NEVER
// proposes actual replacement content. It only makes the "this item's source changed, here is what the
// diff shows" signal real, queryable, and reviewable, exactly the same non-autonomous posture
// content-change.mjs's header documents for the detection half ("Downstream auto-action on a change is
// deliberately NOT wired here").

/**
 * PURE: human-readable summary from a diffDocuments() result.
 * @param {ReturnType<typeof diffDocuments>} diff
 */
export function summarizeAmendmentDiff(diff) {
  const { added, changed, removed } = diff.counts;
  if (!added && !changed && !removed) {
    return `amendment diff: no provision-level change detected (shape=${diff.shape})`;
  }
  return `amendment diff: ${added} provision(s) added, ${changed} changed, ${removed} removed (shape=${diff.shape})`;
}

/**
 * PURE: fallback note when fewer than two stored captures exist to diff against (the common case —
 * raw_fetches is written only by the locked paid-acquire path, not by every check-sources tick).
 * @param {string|null|undefined} sourceUrl
 */
export function fingerprintChangedNote(sourceUrl) {
  return (
    `source content fingerprint changed (${sourceUrl ?? "unknown source"}) — fewer than two stored ` +
    `captures to diff; provision-level detail unavailable until the next capture`
  );
}

/**
 * Bridge one changed source's LIVE items into the staged_updates review queue. Computes ONE amendment-diff
 * summary for the source (the two most recent raw_fetches captures when both exist; else
 * fingerprintChangedNote) and stages one update_item row per live item. Bounded, with the drop REPORTED
 * (never silent) — the same posture sweepChangedSource uses above.
 * @param {import("@supabase/supabase-js").SupabaseClient} svc
 * @param {{ sourceId: string, items: Array<{ id: string }>, limit?: number }} opts
 */
export async function bridgeChangedSourceToStagedUpdates(svc, { sourceId, items, limit = 50 }) {
  const live = (items ?? []).slice(0, limit);
  const notBridged = (items ?? []).length > limit ? items.length - limit : 0;
  if (!live.length) return { sourceId, summary: null, confidence: null, staged: 0, notBridged, errors: [] };

  const { data: srcRow } = await svc.from("sources").select("url").eq("id", sourceId).maybeSingle();
  const sourceUrl = srcRow?.url ?? null;

  const { data: snaps, error: snapErr } = await svc
    .from("raw_fetches")
    .select("file_path, fetched_at")
    .eq("source_id", sourceId)
    .order("fetched_at", { ascending: false })
    .limit(2);
  if (snapErr) throw new Error(`[change-sweep] snapshot read failed: ${snapErr.message}`);

  let summary = fingerprintChangedNote(sourceUrl);
  let confidence = "LOW";
  if (snaps && snaps.length === 2) {
    try {
      const [next, prev] = snaps; // desc order: newest first
      const [nextBody, prevBody] = await Promise.all([
        readSnapshotBody(svc, next.file_path),
        readSnapshotBody(svc, prev.file_path),
      ]);
      const diff = diffDocuments(prevBody, nextBody, { url: sourceUrl ?? undefined });
      summary = summarizeAmendmentDiff(diff);
      confidence = "MEDIUM";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      summary = `${fingerprintChangedNote(sourceUrl)} (diff attempt failed: ${msg})`;
    }
  }

  const errors = [];
  let stagedCount = 0;
  for (const item of live) {
    const { error } = await svc.from("staged_updates").insert({
      item_id: item.id,
      source_id: sourceId,
      update_type: "update_item",
      proposed_changes: {},
      reason: `[change-sweep] ${summary}`,
      source_url: sourceUrl,
      confidence,
    });
    if (error) errors.push(`item ${item.id}: ${error.message}`);
    else stagedCount++;
  }
  return { sourceId, summary, confidence, staged: stagedCount, notBridged, errors };
}
