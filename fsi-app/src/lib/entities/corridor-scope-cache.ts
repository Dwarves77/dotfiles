// corridor-scope-cache.ts — the thin, Next-bound wrapper around corridor-scope.ts's pure core (ADR-026
// detail-page cache model: cached, tagged, revalidated; see docs/decisions/ADR-026-detail-cache-and-
// viewer-state-split.md). Split from corridor-scope.ts for the SAME reason load-detail.ts is split from
// load-detail-core.ts (that file's own header): this file imports `next/cache` and
// `@/lib/supabase-service` at RUNTIME, so it cannot be loaded by a plain `node --test` process — every
// function it exports is a thin composition over an already-tested pure core, nothing here needs its own
// unit test beyond "does this call the right function."
//
// entity_scope/entities/entity_refs/obligations are all corpus-wide, org-independent facts (no viewer,
// no org, no RLS narrowing beyond "verified" — entities/entity_scope/entity_refs are world-readable per
// migration 282/283's own RLS posture) — exactly the item-scoped, cacheable half of ADR-026's split, so
// every wrapper below is a single cached bundle, never a per-viewer read.
//
// TAGGED "corridor-scope" (one coarse tag, not per-corridor): the population this reads is small (4
// corridors, 8 scope rows at authoring time) and changes only when seed-corridors.mjs/write-entity-
// scope.mjs runs (a maintenance step, not a per-request event) — a coarse tag plus the 1-hour revalidate
// backstop below is proportionate; a per-corridor tag would add bookkeeping with no real payoff at this
// scale. A future lane growing the corridor population materially can split this without changing either
// caller.

import { unstable_cache } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase-service";
import {
  listCorridorScopes,
  listCorridorsTouchingJurisdictions,
  getCorridorScopeSummary,
  type CorridorScope,
  type CorridorScopeSummary,
} from "./corridor-scope";

const CORRIDOR_SCOPE_TAG = "corridor-scope";
const REVALIDATE_SECONDS = 60 * 60; // 1 hour — mirrors DETAIL_CACHE_REVALIDATE_SECONDS (load-detail-core.ts)

function client() {
  // getServiceSupabase() is fail-closed (throws when SUPABASE_SERVICE_ROLE_KEY is unset) — every
  // caller below treats "no service client" as a soft-fail (render the honest empty state), matching
  // load-detail.ts's own defaultCreateServiceClient() contract.
  try {
    return getServiceSupabase();
  } catch {
    return null;
  }
}

/** All live corridors, jurisdictions, and their labels — cached. Used by the Market Intel carbon-cost
 *  overlay's corridor selector. Returns [] (never throws) when the service client is unavailable. */
export async function getCachedCorridorScopes(): Promise<CorridorScope[]> {
  const supabase = client();
  if (!supabase) return [];
  return unstable_cache(async () => listCorridorScopes(supabase), ["corridor-scope:list"], {
    tags: [CORRIDOR_SCOPE_TAG],
    revalidate: REVALIDATE_SECONDS,
  })();
}

/** Corridors whose scope touches any of the given ISO codes — cached per code set. Used by the
 *  regulation detail "Corridors this applies on" block. */
export async function getCachedCorridorsTouchingJurisdictions(isoCodes: string[]): Promise<CorridorScope[]> {
  const supabase = client();
  const codes = Array.from(new Set((isoCodes ?? []).map((c) => String(c).trim().toUpperCase()).filter(Boolean))).sort();
  if (!supabase || codes.length === 0) return [];
  return unstable_cache(
    async () => listCorridorsTouchingJurisdictions(supabase, codes),
    ["corridor-scope:by-jurisdiction", codes.join(",")],
    { tags: [CORRIDOR_SCOPE_TAG], revalidate: REVALIDATE_SECONDS },
  )();
}

/** One corridor's full scope summary (jurisdictions + instruments + obligation count) — cached. */
export async function getCachedCorridorScopeSummary(corridorEntityId: string): Promise<CorridorScopeSummary | null> {
  const supabase = client();
  if (!supabase) return null;
  return unstable_cache(
    async () => getCorridorScopeSummary(supabase, corridorEntityId),
    ["corridor-scope:summary", corridorEntityId],
    { tags: [CORRIDOR_SCOPE_TAG], revalidate: REVALIDATE_SECONDS },
  )();
}
