import { isMainModule } from './is-main.mjs'; // task 0.3b: the Windows-safe CLI main guard

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
if (isMainModule(import.meta.url)) {
  main();
}
