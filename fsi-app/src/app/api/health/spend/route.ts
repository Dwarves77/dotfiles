// GET /api/health/spend — month-to-date agent spend probe (R0.2).
//
// Sums agent_runs.cost_usd_estimated over the current UTC month and reports it
// against the monthly ceiling so the uptime workflow's daily spend-watch step
// can fail before the budget is blown. Same server-side aggregate the /admin
// MtdSpendTile shows, exposed on a secret-gated endpoint for external polling.
//
// Auth: WORKER_SECRET header (workerAuthGuard), same pattern as
// /api/health/surfaces and every worker/cron route.
//
// Output is numbers only (no row content) — safe for a public-repo workflow's
// logs.

import { NextRequest, NextResponse } from "next/server";
import { workerAuthGuard } from "@/lib/api/worker-auth";
import { getServiceSupabase } from "@/lib/supabase-server";
import { computeSpendHealth } from "@/lib/health/spend-health.mjs";

export const dynamic = "force-dynamic";

// Monthly spend ceiling (USD). Matches the R0.2 dispatch brief. If the operator
// moves the ceiling, change it here (single source for the pct math).
const MONTHLY_CEILING_USD = 75;

// ACQUISITION-FREEZE BASELINE. The probe's health verdict is "no paid row since the freeze took hold",
// NOT "spend under X% of the ceiling" — the latter is permanently red while the ceiling is frozen/exceeded
// and trains everyone to ignore red. The default is the last legitimate pre-freeze paid row + 1s
// (2026-07-13 02:05:25.909Z → 02:05:26Z); any paid agent_runs row AFTER this while the freeze holds is a
// leak / lock-OFF violation. When the operator lifts the freeze and resumes spend, move this forward via
// SPEND_FREEZE_SINCE_ISO (or update the default).
const FREEZE_SINCE_ISO = process.env.SPEND_FREEZE_SINCE_ISO ?? "2026-07-13T02:05:26Z";

export async function GET(request: NextRequest) {
  const denied = workerAuthGuard(request);
  if (denied) return denied;

  let supabase: ReturnType<typeof getServiceSupabase>;
  try {
    supabase = getServiceSupabase();
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "service client unavailable" },
      { status: 500 }
    );
  }

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  let rows: Array<{ cost_usd_estimated: number | null; started_at: string | null }> = [];
  try {
    // Select cost + started_at for the month; the pure verdict sums MTD and detects any paid row after the
    // freeze baseline. NUMERIC column, one month of rows — a bounded select is fine (no server-side SUM).
    const { data, error } = await supabase
      .from("agent_runs")
      .select("cost_usd_estimated, started_at")
      .gte("created_at", monthStart.toISOString());
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 503 }
      );
    }
    rows = (data ?? []) as typeof rows;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "spend aggregate threw" },
      { status: 503 }
    );
  }

  // HEALTH VERDICT (pure): frozen-and-quiet = healthy; any paid row after the freeze baseline = unhealthy.
  const v = computeSpendHealth(rows, {
    freezeSinceIso: FREEZE_SINCE_ISO,
    monthlyCeilingUsd: MONTHLY_CEILING_USD,
  });

  return NextResponse.json({
    ok: true,
    healthy: v.healthy,
    reason: v.reason,
    mtd_usd: v.mtdUsd,
    monthly_ceiling_usd: MONTHLY_CEILING_USD,
    pct: v.pct,
    frozen: v.frozen,
    freeze_since: FREEZE_SINCE_ISO,
    latest_paid_at: v.latestPaidAt,
    paid_after_freeze: v.paidAfterFreeze,
    month_start: monthStart.toISOString(),
    checked_at: new Date().toISOString(),
  });
}
