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
import { acquireEnabled } from "@/lib/sources/acquire-lock.mjs";

export const dynamic = "force-dynamic";

// Monthly spend ceiling (USD) for the gauge's pct/frozen math. Kept in step with the ENFORCEMENT
// ceiling MONTHLY_SPEND_CEILING_USD in spend-client.ts (the hard gate). Operator ruling 2026-07-13
// (flag-system item 0): July extension $75 -> $130 — the $75.25 freeze was reporting against a
// superseded ceiling. This is display/verdict-framing only; the acquire lock remains the spend gate.
const MONTHLY_CEILING_USD = 130;

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

  let rows: Array<{
    cost_usd_estimated: number | null; started_at: string | null; fetch_method: string | null;
    intelligence_item_id: string | null; source_id: string | null; errors: unknown;
  }> = [];
  try {
    // Select cost + started_at + attribution + fetch_method + errors for the month. The pure verdict sums
    // MTD, finds paid rows after the freeze baseline, and matches each to a pre-logged I2 justification row
    // (fetch_method='acquire-justification'). NUMERIC column, one month of rows — a bounded select is fine.
    const { data, error } = await supabase
      .from("agent_runs")
      .select("cost_usd_estimated, started_at, fetch_method, intelligence_item_id, source_id, errors")
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

  // HEALTH VERDICT (pure). frozen-and-quiet OR sanctioned-window (lock ON + every post-freeze paid row
  // pre-justified) = healthy; any paid row after the freeze while the lock is OFF, or an unjustified paid
  // row while the lock is ON, = leak. The lock is the master gate (justified-but-lock-OFF is still a leak).
  const lockOn = acquireEnabled(process.env as Record<string, string | undefined>);
  const v = computeSpendHealth(rows, {
    freezeSinceIso: FREEZE_SINCE_ISO,
    monthlyCeilingUsd: MONTHLY_CEILING_USD,
    acquireEnabled: lockOn,
  });

  return NextResponse.json({
    ok: true,
    healthy: v.healthy,
    reason: v.reason,
    mtd_usd: v.mtdUsd,
    monthly_ceiling_usd: MONTHLY_CEILING_USD,
    pct: v.pct,
    frozen: v.frozen,
    acquire_lock_on: v.acquireEnabled,
    freeze_since: FREEZE_SINCE_ISO,
    latest_paid_at: v.latestPaidAt,
    paid_after_freeze: v.paidAfterFreeze,
    all_justified: v.allJustified,
    // Enumerate the post-freeze paid rows (operational metadata only — UUIDs, $ figures, and the I2
    // justification enum; never brief content). Empty in the frozen-and-quiet state.
    paid_after_rows: v.paidAfterRows.map((r) => ({
      item_id: r.itemId, source_id: r.sourceId, cost_usd: r.costUsd, started_at: r.startedAt, justification: r.justification,
    })),
    month_start: monthStart.toISOString(),
    checked_at: new Date().toISOString(),
  });
}
