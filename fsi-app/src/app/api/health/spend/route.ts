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

export const dynamic = "force-dynamic";

// Monthly spend ceiling (USD). Matches the R0.2 dispatch brief. If the operator
// moves the ceiling, change it here (single source for the pct math).
const MONTHLY_CEILING_USD = 75;

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

  let mtdUsd = 0;
  try {
    // Paginate cost_usd_estimated for the month; sum in JS. The column is
    // NUMERIC; PostgREST has no server-side SUM without an RPC, and the row
    // count for one month is small, so a bounded select is fine.
    const { data, error } = await supabase
      .from("agent_runs")
      .select("cost_usd_estimated")
      .gte("created_at", monthStart.toISOString());
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 503 }
      );
    }
    for (const row of data ?? []) {
      mtdUsd += Number((row as { cost_usd_estimated: number | null }).cost_usd_estimated ?? 0);
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "spend aggregate threw" },
      { status: 503 }
    );
  }

  const mtd = Math.round(mtdUsd * 1e6) / 1e6;
  const pct = MONTHLY_CEILING_USD > 0
    ? Math.round((mtd / MONTHLY_CEILING_USD) * 1000) / 10 // one decimal place
    : 0;

  return NextResponse.json({
    ok: true,
    mtd_usd: mtd,
    monthly_ceiling_usd: MONTHLY_CEILING_USD,
    pct,
    month_start: monthStart.toISOString(),
    checked_at: new Date().toISOString(),
  });
}
