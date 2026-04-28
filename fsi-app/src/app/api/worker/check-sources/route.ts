import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isGloballyPaused } from "@/lib/api/pause";

/**
 * POST /api/worker/check-sources
 *
 * Monitoring queue worker. Checks sources that are due for scanning.
 * Called by an external cron job (e.g., Railway, Vercel Cron, or GitHub Actions).
 *
 * Authentication: requires WORKER_SECRET header to prevent unauthorized triggers.
 * This is NOT a user-facing API route — it's a system endpoint.
 */

const WORKER_SECRET = process.env.WORKER_SECRET || "dev-worker-secret";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  // Authenticate worker
  const secret = request.headers.get("x-worker-secret");
  if (secret !== WORKER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();

  // Global pause gate — short-circuits before any DB scan work.
  if (await isGloballyPaused(supabase)) {
    return NextResponse.json({ message: "Global processing pause is active; worker exiting", checked: 0 });
  }

  try {
    // Step 1: Find sources due for checking. Filter out per-source pause.
    const { data: dueSources, error: queueError } = await supabase
      .from("sources")
      .select("id, name, url, tier, update_frequency, last_checked, access_method")
      .eq("status", "active")
      .eq("processing_paused", false)
      .or(`next_scheduled_check.is.null,next_scheduled_check.lte.${new Date().toISOString()}`)
      .order("tier", { ascending: true })
      .limit(10); // Process 10 sources per run

    if (queueError) {
      return NextResponse.json({ error: queueError.message }, { status: 500 });
    }

    if (!dueSources?.length) {
      return NextResponse.json({ message: "No sources due for checking", checked: 0 });
    }

    const results: { source: string; status: string; error?: string }[] = [];

    // Step 2: Check each source
    for (const source of dueSources) {
      try {
        // Accessibility check: can we reach the URL?
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(source.url, {
          method: "HEAD",
          signal: controller.signal,
          headers: { "User-Agent": "CarosLedge-Monitor/1.0" },
        }).catch((e: any) => ({ ok: false, status: 0, statusText: e.message }));

        clearTimeout(timeout);

        const isAccessible = "ok" in response && response.ok;
        const httpStatus = "status" in response ? response.status : 0;

        // Step 3: Update source metrics
        const updates: Record<string, any> = {
          last_checked: new Date().toISOString(),
          next_scheduled_check: getNextCheck(source.update_frequency),
        };

        if (isAccessible) {
          updates.last_accessible = new Date().toISOString();
          updates.consecutive_accessible = (source as any).consecutive_accessible + 1 || 1;
          updates.successful_checks = (source as any).successful_checks + 1 || 1;
          updates.total_checks = (source as any).total_checks + 1 || 1;
          if ((source as any).status === "inaccessible") {
            updates.status = "active";
          }
        } else {
          updates.last_inaccessible = new Date().toISOString();
          updates.total_checks = (source as any).total_checks + 1 || 1;
          updates.consecutive_accessible = 0;
          // Flag as inaccessible if repeated failures
          if ((source as any).consecutive_accessible === 0) {
            updates.status = "inaccessible";
          }
        }

        await supabase.from("sources").update(updates).eq("id", source.id);

        // Step 4: Log trust event
        await supabase.from("source_trust_events").insert({
          source_id: source.id,
          event_type: "accessibility_check",
          details: {
            type: "accessibility_check",
            success: isAccessible,
            http_status: httpStatus,
          },
          created_by: "worker",
        });

        // Step 5: Log to monitoring queue
        await supabase.from("monitoring_queue").insert({
          source_id: source.id,
          scheduled_check: new Date().toISOString(),
          priority: "normal",
          last_result: isAccessible ? "no_change" : "inaccessible",
          change_detected: false,
          checked_at: new Date().toISOString(),
          error_message: isAccessible ? null : `HTTP ${httpStatus}`,
        });

        results.push({
          source: source.name,
          status: isAccessible ? "accessible" : "inaccessible",
        });
      } catch (e: any) {
        results.push({
          source: source.name,
          status: "error",
          error: e.message,
        });
      }
    }

    return NextResponse.json({
      message: `Checked ${results.length} sources`,
      checked: results.length,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function getNextCheck(frequency: string): string {
  const now = Date.now();
  const intervals: Record<string, number> = {
    continuous: 3600000,      // 1 hour
    daily: 86400000,          // 24 hours
    "business-daily": 86400000,
    weekly: 604800000,        // 7 days
    biweekly: 1209600000,     // 14 days
    monthly: 2592000000,      // 30 days
    quarterly: 7776000000,    // 90 days
    annual: 31536000000,      // 365 days
    "ad-hoc": 604800000,      // Default to weekly for ad-hoc
  };
  const interval = intervals[frequency] || 604800000;
  return new Date(now + interval).toISOString();
}
