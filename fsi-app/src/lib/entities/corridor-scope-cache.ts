import { unstable_cache } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase-service";
import {
  listCorridorScopes,
  listCorridorsTouchingJurisdictions,
  type CorridorScope,
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
