// THE canonical service-role Supabase client (one home; C1 consolidation target). FAIL-CLOSED by construction
// (SF-1, 2026-05-27): a missing SUPABASE_SERVICE_ROLE_KEY THROWS — it NEVER silently downgrades to the anon key.
// The prior downgrade masked service-role misconfiguration in production as RLS-blocked reads (empty payloads
// downstream), and the same anon-fallback pattern re-appeared ad-hoc in coverage-gaps.ts (Ruling 2 C1, the live
// defect). Every service-role client construction routes through here; F19 forbids the `SERVICE_ROLE || ANON`
// downgrade anywhere in src.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// MEMOIZED (diagnosis 2026-07-13): the client is stateless (persistSession:false, service-role) so it is safe
// to reuse across requests. The detail-route prefetch fan-out built a fresh client per render (per round-trip
// site) — pure churn under burst. One instance per server process; the fail-closed key check still runs on the
// first call (a later env change requires a redeploy anyway, so caching the constructed client is sound).
let cached: SupabaseClient | null = null;

export function getServiceSupabase() {
  if (cached) return cached;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. Service-role reads are unavailable (fail-closed — " +
        "never downgrade to the anon key). Set the env var in Vercel project settings."
    );
  }
  cached = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
  return cached;
}
