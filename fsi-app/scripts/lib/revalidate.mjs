// revalidate.mjs — tell the deployed app to drop specific detail-cache tags after a population run
// applies changes (perf lane, 2026-09-03, docs/audits/perf-load-times-2026-09-03.md §6).
//
// WHY THIS EXISTS. src/lib/detail/load-detail.ts now caches each detail page's item-scoped read bundle
// (unstable_cache, 300s revalidate backstop, tagged item:<id> + <surface>-detail — see that file's header
// and src/lib/cache/revalidate-item.ts). The mint/apply runtimes that CHANGE item-scoped data
// (scripts/mint/**, scripts/maintenance/**) run as plain node scripts outside Next — they cannot call
// next/cache's revalidateTag directly (it needs Next's request/work-unit async context, which a bare node
// process never has). This helper is the bridge: it POSTs the tags to flush to the deployed app's
// POST /api/revalidate route (src/app/api/revalidate/route.ts), which runs revalidateTag for real, inside
// a route handler's request scope.
//
// DRY BY DEFAULT, matching every other script in this tree (lane-common-contract.md): revalidateTags()
// only POSTs when `apply: true` (or the CLI's --apply). Without it, it logs what WOULD be sent and
// returns { applied: false, reason: "dry" } — safe to call from a dry population run without side effects.
// Best-effort, never throws, never gates the caller's own outcome: the 300s revalidate backstop on every
// detail cache entry bounds staleness even when this call fails (network error, APP_URL/WORKER_SECRET
// unset, non-2xx) — exactly the same posture generate-brief.ts's revalidateItemStep already documents for
// /api/cache/revalidate-item.
//
// TAG VOCABULARY: item:<id> and <surface>-detail mirror src/lib/cache/revalidate-item.ts's itemTag() /
// surfaceDetailTag() EXACTLY (string format only — this file cannot import that .ts module, which itself
// value-imports next/cache and cannot load outside Next's bundler; see load-detail-core.ts's header for
// why). If that format ever changes, this file's itemTag/surfaceDetailTag must change with it — there is
// no shared runtime import possible across the Next-app/plain-script boundary, so the two definitions are
// named identically and kept next to each other in each file's header comment as the drift guard.
//
// USAGE (as a library — the population runtimes import this, they don't invoke the CLI):
//   import { revalidateTags, itemTag, surfaceDetailTag } from "../lib/revalidate.mjs";
//   const result = await revalidateTags([itemTag(item.id), surfaceDetailTag("regulations")], { apply });
//
// USAGE (CLI, for manual/ops use):
//   node scripts/lib/revalidate.mjs item:some-legacy-id regulations-detail            # dry (prints only)
//   node scripts/lib/revalidate.mjs --apply item:some-legacy-id regulations-detail    # live POST
// Needs APP_URL + WORKER_SECRET in the environment for --apply (same two env vars every other worker-route
// caller in this tree already uses — run-change-detection.mjs's postCheckSources is the precedent).

/** The index-ledger cache tag — mirrors src/lib/data.ts's APP_DATA_TAG (every override/watchlist/list-order
 *  mutation route flushes it; a mint apply must too, or a minted item waits 60 s to reach the ledger). */
export const APP_DATA_TAG = "app-data";

/** PERF-10 (2026-09-04, ADR-026 Follow-up / migration 306): mirrors src/lib/data.ts's
 *  PUBLIC_ITEMS_TAG — the org-independent public read (getPublicResourcesOnly/getPublicListingsOnly,
 *  which back /regulations, /market, /operations, /research's now-static-capable index render).
 *  Deliberately separate from APP_DATA_TAG (see that constant's header for why); a population/
 *  maintenance/corpus-turn apply that mints, re-prioritizes, (un)archives, or flips provenance_status
 *  on a PLATFORM item must flush this or the public ledgers show stale content for up to 60s. */
export const PUBLIC_ITEMS_TAG = "public-items";

/** Precise per-item tag — mirrors src/lib/cache/revalidate-item.ts's itemTag(). */
export function itemTag(id) {
  return `item:${id}`;
}

/** Coarse per-surface tag — mirrors src/lib/cache/revalidate-item.ts's surfaceDetailTag(). */
export function surfaceDetailTag(surface) {
  return `${surface}-detail`;
}

/**
 * POST `tags` to the deployed app's /api/revalidate route. Dry by default —
 * pass `apply: true` to actually send the request.
 *
 * @param {string[]} tags
 * @param {{ apply?: boolean, appUrl?: string, workerSecret?: string, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<{ applied: boolean, tags: string[], reason?: string, status?: number }>}
 */
export async function revalidateTags(tags, opts = {}) {
  const list = Array.from(new Set((tags ?? []).filter((t) => typeof t === "string" && t.length > 0)));
  const {
    apply = false,
    appUrl = process.env.APP_URL,
    workerSecret = process.env.WORKER_SECRET,
    fetchImpl = fetch,
  } = opts;

  if (list.length === 0) {
    return { applied: false, tags: list, reason: "no tags given" };
  }
  if (!apply) {
    console.log(`[revalidate] dry — would flush: ${list.join(", ")} (pass apply:true / --apply to send)`);
    return { applied: false, tags: list, reason: "dry" };
  }
  if (!appUrl || !workerSecret) {
    console.warn(
      `[revalidate] --apply given but APP_URL/WORKER_SECRET is unset — skipped (best-effort; the ` +
        `300s revalidate backstop on every detail cache entry still bounds staleness)`
    );
    return { applied: false, tags: list, reason: "no APP_URL/WORKER_SECRET" };
  }

  const base = String(appUrl).replace(/\/+$/, "");
  try {
    const res = await fetchImpl(`${base}/api/revalidate`, {
      method: "POST",
      headers: { "x-worker-secret": workerSecret, "content-type": "application/json" },
      body: JSON.stringify({ tags: list }),
    });
    if (!res.ok) {
      console.warn(`[revalidate] POST /api/revalidate got HTTP ${res.status} for: ${list.join(", ")}`);
      return { applied: false, tags: list, reason: `HTTP ${res.status}`, status: res.status };
    }
    return { applied: true, tags: list, status: res.status };
  } catch (e) {
    console.warn(`[revalidate] POST /api/revalidate failed for ${list.join(", ")}: ${e instanceof Error ? e.message : String(e)}`);
    return { applied: false, tags: list, reason: e instanceof Error ? e.message : String(e) };
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const tags = argv.filter((a) => a !== "--apply");
  if (tags.length === 0) {
    console.error("usage: node scripts/lib/revalidate.mjs [--apply] <tag> [<tag> ...]");
    process.exit(1);
  }
  const result = await revalidateTags(tags, { apply });
  console.log(JSON.stringify(result));
  process.exit(result.applied || !apply ? 0 : 2);
}

// Only run the CLI when this file is the entrypoint, matching the pattern already used elsewhere in
// scripts/lib (run-artifact.mjs, fetch-negative-probe.mjs, inconclusive-probe.mjs) — importing this module
// as a library must never trigger the CLI's process.exit().
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
