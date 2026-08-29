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
import { fetchAllRows } from "@/lib/db/paginate.mjs";

export const dynamic = "force-dynamic";

// Monthly spend figure (USD) for the gauge's INFORMATIONAL pct/frozen fields only — it NEVER gates the verdict
// (operator-priced model: actuals are information, not a limit). Kept in step with spend-client.ts for display
// continuity. 2026-07-15 reconciliation: the spend gate is TRACEABILITY to an operator-priced line, not the
// acquire lock and not a %-of-ceiling.
const MONTHLY_CEILING_USD = 130;

// ACQUISITION-FREEZE BASELINE. The probe's health verdict is "no UNTRACED paid row since the freeze took hold",
// NOT "spend under X% of the ceiling" — the latter is permanently red while the ceiling is frozen/exceeded and
// trains everyone to ignore red. Any post-baseline paid agent_runs row that does not trace to an operator-priced
// line is the anomaly. When the operator resumes spend under the priced model, move this forward (the designed
// escape) via SPEND_FREEZE_SINCE_ISO or the default.
// MOVED FORWARD 2026-07-15 (operator DIAGNOSE — spend-watch RED): the 2026-07-13 baseline predated the operator-
// priced era, so it red-flagged every legitimate priced run (all lacking priced-line markers — the retired
// frozen-state posture). Every post-07-13 paid row was verified traceable to this session's operator
// authorizations (priced run $20-bound + Step-2 $12-bound + Segment-0 A/B + retries; grounding crons frozen),
// i.e. NO leak. The baseline advances past that verified-authorized spend (latest paid row 07-15 02:00Z); paid
// rows from here forward carry funded-pass priced-line markers and are traced per row.
// MOVED FORWARD 2026-08-28 (operator ruling: "There is no spending. NO spend during build"). Spend-watch had
// been RED for ~16 consecutive days on THREE rows, and a probe that is permanently red is a probe nobody reads —
// the exact alert-fatigue failure the 2026-07-15 move above was made to prevent, recurring one cause later.
//
// THE THREE ROWS, identified not assumed (agent_runs, queried 2026-08-28):
//   2026-08-12 21:28Z  $0.022881   purpose "ask-assistant (/api/ask user question)"
//   2026-08-13 14:53Z  $0.023556   same
//   2026-08-13 16:38Z  $0.022401   same
// $0.0688 total, model claude-sonnet-4-6, all status=success, all authorizationRef=null. These are PRODUCT
// RUNTIME — real signed-in users asking the Assistant questions on the deployed app — not build spend. The
// $0-on-the-build doctrine was never violated.
//
// WHY THEY WERE UNTRACEABLE, and why advancing is honest rather than a whitewash: unlike the 07-15 move (where
// every row traced to a real operator authorization), these rows carried NO authorization at all. The ask route
// set a ticket with no priced line and no budgetCapUsd, so under BUILD-PHASE — where "the sole dollar gate is
// the operator-priced line" (spend-regime.mjs) — it spent outside the authorization model entirely. That is a
// genuine defect, and the baseline is NOT advancing because the rows turned out fine. It advances because the
// CAUSE IS CLOSED: `api/ask` now refuses unless ASSISTANT_ENABLED === "true" (fail-closed, default OFF), the
// refusal precedes every paid call, and .discipline/assistant-spend-gate.test.mjs pins the gate AND its ordering
// (attack-proven: deleting the gate or weakening the comparison both go RED). No further ask-assistant row can
// be minted while the Assistant is off.
//
// DEBT NAMED AT THE POINT IT BITES: if the Assistant is ever deliberately enabled, its spend will again lack an
// authorization marker and will again red this probe. Enabling it therefore OWES a batch-marker or priced-line
// write on the ask path (see spend-health.mjs isBatchMarkerRow / isPricedLineRow) BEFORE the flag is flipped.
// Building that plumbing now, for a feature that is off, would be speculative work for a state that does not
// exist — so it is recorded here, where whoever flips the flag will read it, rather than built on spec.
const FREEZE_SINCE_ISO = process.env.SPEND_FREEZE_SINCE_ISO ?? "2026-08-13T17:00:00Z";

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
    intelligence_item_id: string | null; source_id: string | null; model: string | null; errors: unknown;
  }> = [];
  try {
    // Select cost + started_at + attribution + fetch_method + errors for the month. The pure verdict sums
    // MTD, finds paid rows after the freeze baseline, and matches each to a pre-logged priced-line marker.
    // PAGINATED (case-file 9): a month of census/classify rows is tens of thousands, far past PostgREST's
    // 1000-row default — a range-less select silently truncated the verdict to a 1000-row slice ("207 of
    // 207" was a slice of 19,898). `.order` gives stable paging across pages.
    rows = (await fetchAllRows((from, to) =>
      supabase
        .from("agent_runs")
        .select("cost_usd_estimated, started_at, fetch_method, intelligence_item_id, source_id, model, errors")
        .gte("created_at", monthStart.toISOString())
        .order("id", { ascending: true }) // UNIQUE order key — non-unique (created_at) makes offset paging lossy
        .range(from, to)
    )) as typeof rows;
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
