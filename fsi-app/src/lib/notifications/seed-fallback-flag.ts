/**
 * Seed-fallback flag dispatch.
 *
 * Sprint 3 SF-2 Phase 1 (2026-05-27).
 *
 * Records a platform-level integrity_flag row (migration 048) when a
 * data fetcher hits the seed-fallback path. Admin sees the entry via:
 *   - `admin_attention_counts.integrity_flags_unresolved` (red-flag-dot)
 *   - PlatformIntegrityFlagsView at /admin → Platform flags
 *
 * Dedupe: skips insert when an open flag for the same surface_ref
 * already exists with created_at > now() - 1 hour. Protects against
 * thousands of inserts per minute during a sustained outage.
 *
 * Failures are swallowed. Notification is a side-effect of an already-
 * degraded fetch; if the flag insert ALSO fails (Supabase fully down,
 * service-role key missing post-SF-1), the originating fetcher should
 * still return its error sentinel. A failed flag write logs to
 * console.warn so Vercel function logs catch the double-failure case.
 */


import { getServiceSupabase } from "@/lib/supabase-service";

export type SeedFallbackTrigger =
  | "null_orgId"
  | "supabase_not_configured"
  | "service_role_missing"
  | "rpc_error"
  | "timeout"
  | "exception";

interface RecommendedAction {
  action: string;
  rationale?: string;
}

const RECOMMENDED_ACTIONS: RecommendedAction[] = [
  {
    action: "Check Supabase project status",
    rationale:
      "Sustained fallback usually means an upstream RPC is failing. Verify Supabase is reachable.",
  },
  {
    action: "Verify SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in Vercel env",
    rationale:
      "Missing or rotated env vars cause silent service-role failures post-SF-1.",
  },
  {
    action: "Inspect Vercel function logs for the affected route",
    rationale:
      "Exception-path triggers log console.error in data.ts catch blocks; null-orgId triggers do not log anywhere except this flag.",
  },
];


/**
 * Record a seed-fallback activation as a platform integrity_flag.
 * Idempotent within the 1-hour dedupe window: a second call with the
 * same `route` while an open flag exists returns silently without
 * writing a duplicate row.
 *
 * Never throws. Errors are logged but not propagated.
 */
export async function recordSeedFallbackFlag(
  trigger: SeedFallbackTrigger,
  route: string
): Promise<void> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    // SF-2 trigger cause #2 (env-var misconfig) — can't write the flag
    // because the env that the flag-write needs is itself missing.
    console.warn(
      "[seed-fallback-flag] cannot record (env missing):",
      route,
      trigger
    );
    return;
  }

  try {
    const supabase = getServiceSupabase();

    // Dedupe: skip if an open flag for this surface exists in the last hour.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: existing, error: lookupErr } = await supabase
      .from("integrity_flags")
      .select("id")
      .eq("subject_type", "surface")
      .eq("subject_ref", route)
      .eq("status", "open")
      .gte("created_at", oneHourAgo)
      .limit(1)
      .maybeSingle();

    if (lookupErr) {
      console.warn(
        "[seed-fallback-flag] dedupe lookup failed:",
        lookupErr.message
      );
      // Fall through and try to insert anyway — better a duplicate row
      // than no signal.
    }

    if (existing) {
      // Open flag already exists for this surface; skip insert.
      return;
    }

    const { error: insertErr } = await supabase
      .from("integrity_flags")
      .insert({
        category: "data_integrity",
        subject_type: "surface",
        subject_ref: route,
        description: `Seed-fallback activated on ${route}. Trigger: ${trigger}.`,
        recommended_actions: RECOMMENDED_ACTIONS,
        status: "open",
        created_by: "seed-fallback-trigger",
      });

    if (insertErr) {
      console.warn(
        "[seed-fallback-flag] insert failed:",
        insertErr.message,
        { route, trigger }
      );
    }
  } catch (e) {
    console.warn(
      "[seed-fallback-flag] exception:",
      e instanceof Error ? e.message : String(e),
      { route, trigger }
    );
  }
}
