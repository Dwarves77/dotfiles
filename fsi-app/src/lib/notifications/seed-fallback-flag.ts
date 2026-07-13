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
 * Trigger routing (operator ruling 2026-07-13, flag-system item 1):
 *   - `null_orgId` is an anonymous / no-org render of a public page — NOT an
 *     integrity violation. Routed to console.info telemetry; never flagged.
 *   - `service_role_missing` / env-missing can't self-record (the write needs
 *     the missing key) — logged LOUD as [UNRECORDABLE]; structurally under-counted.
 *   - genuine degradations (rpc_error, timeout, exception, supabase_not_configured)
 *     still write a platform integrity_flag.
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
      "Exception-path triggers log console.error in data.ts catch blocks. (null_orgId is anonymous/no-org render — routed to console.info telemetry, no longer flagged, per the 2026-07-13 ruling.)",
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
  // ROUTE ANONYMOUS TELEMETRY OUT OF integrity_flags (operator ruling 2026-07-13, flag-system item 1).
  // `null_orgId` fires when a request reaches the SSR data fetcher with no active org — i.e. an ANONYMOUS
  // hit on a public page (the homepage `/` takes logged-out visitors, crawlers, and uptime monitors), OR
  // an authenticated user with no org_membership. Diagnosis (read-only, 2026-07-13): 119 of 127 open
  // seed-fallback flags were `null_orgId` on `/`, still firing, NOT probe-aligned — expected anonymous
  // traffic mis-filed as a data_integrity violation. An empty-org render of a public page is HANDLED
  // behaviour, not integrity corruption, so it does not belong in integrity_flags. Emit telemetry only.
  // NOTE — the drop point (`src/lib/api/org.ts::resolveOrgIdFromCookies`) returns null for BOTH the
  // anonymous case (`!user`, line 48) and the authed-with-no-membership case (line 56); this layer cannot
  // distinguish them. If authed-no-org monitoring is ever wanted, splitting the two is ITS OWN UNIT (the
  // ruling's "fix as its own unit") — not built here.
  if (trigger === "null_orgId") {
    console.info("[seed-fallback-flag] null_orgId (anonymous/no-org render — not an integrity flag):", route);
    return;
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    // UNDER-COUNT — structural (operator ruling 2026-07-13, flag-system item 1). SF-2 trigger cause #2
    // (env-var misconfig / service_role_missing) can NOT self-record: the flag-write needs the very
    // service-role key that is missing, and integrity_flags is service-role-gated, so there is no channel
    // to write it. The count of these events is therefore always low by construction. Make it LOUD in the
    // one channel that survives (Vercel function logs) so log-based alerting can catch the double-failure;
    // a durable out-of-band recorder would be its own unit if this class ever needs a real count.
    console.error(
      "[seed-fallback-flag][UNRECORDABLE] env missing — cannot write flag (this event is not counted):",
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
