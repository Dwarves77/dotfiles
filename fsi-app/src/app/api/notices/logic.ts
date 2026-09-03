// Pure helpers for GET /api/notices, split out of route.ts (BUILDGATE, 2026-09-02, F34's named
// residual / build-graph proof). Next 16's route-type validator rejects a route.ts that exports
// anything besides route handlers/config fields, so these move to this sibling module and
// route.ts imports them. Behaviour is unchanged; only the file they live in moved.
// route.npmtest.mjs now imports this module directly instead of route.ts.

import type { SupersededNotice } from "@/lib/propagation/methods/superseded-notices.ts";

const DEFAULT_WINDOW_DAYS = 30;

/**
 * Resolve the `?since=` query param to an ISO timestamp, defaulting to `DEFAULT_WINDOW_DAYS` days before
 * `now` when absent, empty, or unparseable — a malformed `since` degrades to the default window rather
 * than 400ing the caller (this is a notices feed, not a strict filter API; a wrong window is recoverable
 * by the caller simply re-requesting with a fixed value, whereas a hard 400 would break a naive integration
 * that forwards whatever it was last given). PURE — `now` is always injected.
 */
export function resolveSinceParam(sinceRaw: string | null, now: Date): string {
  if (!sinceRaw) return defaultSince(now);
  const parsed = new Date(sinceRaw);
  if (Number.isNaN(parsed.getTime())) return defaultSince(now);
  return parsed.toISOString();
}

function defaultSince(now: Date): string {
  return new Date(now.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** One SupersededNotice + its resolved entity label/href — the exact shape RecalculationNotice.tsx's
 *  `RecalculationNoticeItem` expects. PURE — takes the label map as a plain object, no I/O. */
export function attachEntityLabels(
  notices: SupersededNotice[],
  labelsByEntityId: Record<string, string>
): Array<SupersededNotice & { entityLabel: string | null; href: string | null }> {
  return notices.map((n) => ({
    ...n,
    entityLabel: (n.entityId && labelsByEntityId[n.entityId]) || n.entityId || null,
    href: n.entityId ? `/entities/${encodeURIComponent(n.entityId)}` : null,
  }));
}
