// GET /api/health/surfaces — honesty probe for the customer surfaces (R0.2).
//
// Customer surfaces are auth-walled, so an external uptime probe cannot read
// them directly. This dedicated endpoint runs server-side with the service
// client and reports, per surface, whether its BACKING DATA is present — a
// cheap real count of the rows the surface renders from. The uptime workflow
// (.github/workflows/uptime-probes.yml) curls this with the WORKER_SECRET
// header and asserts every must-have surface ok.
//
// Auth: WORKER_SECRET header (workerAuthGuard) — same pattern as every
// worker/cron route (src/lib/api/worker-auth.ts). Not customer-facing.
//
// The ok / zero-legal decision logic lives in the pure, unit-tested module
// src/lib/telemetry/surface-health.mjs; this route only GATHERS the counts.

import { NextRequest, NextResponse } from "next/server";
import { workerAuthGuard } from "@/lib/api/worker-auth";
import { getServiceSupabase } from "@/lib/supabase-server";
import { readGateAHealth } from "@/lib/health/gate-a-gauges.mjs";
import {
  ALL_SURFACES,
  evaluateSurface,
  overallOk,
  seedLeak,
} from "@/lib/telemetry/surface-health.mjs";

export const dynamic = "force-dynamic";

type Counts = Record<string, { rows: number | null; error: string | null }>;

// The minimal chainable shape every `build` callback below actually uses: a Postgrest count-head
// query that is itself awaitable ({ count, error }) and supports the three filter methods this
// route's builders chain (.eq / .not / .in). The real PostgrestFilterBuilder satisfies this
// structurally, so `supabase.from(table).select(...)` passes without a cast.
type CountQuery = PromiseLike<{ count: number | null; error: { message: string } | null }> & {
  eq(column: string, value: unknown): CountQuery;
  not(column: string, operator: string, value: unknown): CountQuery;
  in(column: string, values: unknown[]): CountQuery;
};

/** Cheap COUNT(*) with a filter, head-only (no rows transferred). */
async function countRows(
  supabase: ReturnType<typeof getServiceSupabase>,
  table: string,
  build: (q: CountQuery) => CountQuery
): Promise<{ rows: number | null; error: string | null }> {
  try {
    const { count, error } = await build(
      supabase.from(table).select("*", { count: "exact", head: true }) as unknown as CountQuery
    );
    if (error) return { rows: null, error: error.message };
    return { rows: count ?? 0, error: null };
  } catch (e) {
    return { rows: null, error: e instanceof Error ? e.message : "count threw" };
  }
}

export async function GET(request: NextRequest) {
  const denied = workerAuthGuard(request);
  if (denied) return denied;

  let supabase: ReturnType<typeof getServiceSupabase>;
  try {
    supabase = getServiceSupabase();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "service client unavailable", surfaces: {}, rpcs: {} },
      { status: 500 }
    );
  }

  // Resolve a real org for the org-scoped RPC probes (oldest org).
  let orgId: string | null = null;
  let orgError: string | null = null;
  try {
    const { data, error } = await supabase
      .from("organizations")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) orgError = error.message;
    orgId = data?.id ?? null;
  } catch (e) {
    orgError = e instanceof Error ? e.message : "org lookup threw";
  }

  // ── Per-surface backing counts ─────────────────────────────────────────
  // Must-have surfaces read verified, non-archived intelligence_items filtered
  // to their item_type family (the same gate customer reads use). Zero-legal
  // surfaces read their own backing tables; zero there is an honest empty
  // state, not an outage.
  const verified = (q: CountQuery): CountQuery =>
    q.eq("provenance_status", "verified").not("is_archived", "is", true);

  const REG_TYPES = ["regulation", "directive", "standard", "guidance", "framework"];
  const MARKET_TYPES = ["market_signal", "initiative"];
  const RESEARCH_TYPES = ["research_finding"];
  const OPS_TYPES = ["regional_data"];

  const counts: Counts = {};

  // dashboard: any verified, non-archived item backs the home rail/masthead.
  counts["dashboard"] = await countRows(supabase, "intelligence_items", verified);
  counts["regulations"] = await countRows(supabase, "intelligence_items", (q) =>
    verified(q).in("item_type", REG_TYPES)
  );
  counts["market"] = await countRows(supabase, "intelligence_items", (q) =>
    verified(q).in("item_type", MARKET_TYPES)
  );
  counts["research"] = await countRows(supabase, "intelligence_items", (q) =>
    verified(q).in("item_type", RESEARCH_TYPES)
  );
  counts["operations"] = await countRows(supabase, "intelligence_items", (q) =>
    verified(q).in("item_type", OPS_TYPES)
  );

  // Zero-legal surfaces.
  counts["community"] = await countRows(supabase, "community_posts", (q) => q);
  // map is a view of Regulations content (ADR-041: it carries no Community-derived backing).
  counts["map"] = counts["regulations"];
  // assistant-config backing = the Ask substrate (verified items it can cite).
  counts["assistant-config"] = await countRows(supabase, "intelligence_items", verified);
  // onboarding-config backing = workspace_settings rows (sector/notification
  // profiles). Zero is legal (no workspace has completed onboarding yet).
  counts["onboarding-config"] = await countRows(supabase, "workspace_settings", (q) => q);

  // ── Evaluate ───────────────────────────────────────────────────────────
  const surfaces: Record<string, { ok: boolean; backing_rows: number | null; error: string | null }> = {};
  for (const name of ALL_SURFACES) {
    const c = counts[name] ?? { rows: null, error: "not probed" };
    surfaces[name] = evaluateSurface(name, c.rows, c.error);
  }

  // ── Key RPC probes ───────────────────────────────────────────────────────
  const rpcs: Record<string, { ok: boolean; error: string | null }> = {};

  // get_market_intel_items with the real org.
  if (!orgId) {
    rpcs["market_intel"] = { ok: false, error: orgError ?? "no org resolved" };
  } else {
    try {
      const { error } = await supabase.rpc("get_market_intel_items", { p_org_id: orgId });
      rpcs["market_intel"] = { ok: !error, error: error?.message ?? null };
    } catch (e) {
      rpcs["market_intel"] = { ok: false, error: e instanceof Error ? e.message : "rpc threw" };
    }
  }

  // Item-detail probe. No dedicated single-item RPC exists (detail pages query
  // intelligence_items directly — see src/app/regulations/[slug]/page.tsx), so
  // the per-surface count RPC get_all_surface_counts stands in as the
  // org-scoped detail-path health signal (deviation-with-reason, R0.2).
  if (!orgId) {
    rpcs["surface_counts"] = { ok: false, error: orgError ?? "no org resolved" };
  } else {
    try {
      const { error } = await supabase.rpc("get_all_surface_counts", { p_org_id: orgId });
      rpcs["surface_counts"] = { ok: !error, error: error?.message ?? null };
    } catch (e) {
      rpcs["surface_counts"] = { ok: false, error: e instanceof Error ? e.message : "rpc threw" };
    }
  }

  // ── Gate-A honesty (migration 226 / 256) ────────────────────────────────────────────────────────────
  // Read-side backstop for the provenance gate. Five gauges, each { value, state, computed_at, reason }
  // and never a bare null (lane OPS-1, 2026-10-07): state is computed | not_computed | unreadable. The
  // cache behind gate_a_health() is refreshed only by the deliberately unscheduled gate_a_health_refresh(),
  // so not_computed (cache empty or past its 30 minute TTL) is the expected build-mode state; the uptime
  // probe warns on it and fails only on unreadable or a computed alarm above 0. Not computed on request:
  // see the decision record in src/lib/health/gate-a-gauges.mjs.
  const gate_a = await readGateAHealth(supabase);

  // ── Customer-visible forward obligations (lane SURF, 2026-09-01) ─────────────────────────────────
  // migration 274/275's item_forward_events now renders on the Regulations list/detail surfaces
  // (UpcomingObligationsStrip.tsx) via src/lib/forward-events/read-upcoming.mjs, gated the same way the
  // table's own RLS policy is: the parent intelligence_items row must be LIVE (is_archived = false — the
  // exact predicate migration 274's item_forward_events_read policy checks). This counts exactly that
  // join — a real, cheap regression signal: if this count ever drops to 0 (or errors) while
  // item_forward_events itself still holds rows, the customer-facing strip/section has silently gone
  // dark even though the admin panel (which reads the same table, unfiltered by this join, via the
  // service-role admin route) would still show data — the admin panel alone could never catch that
  // class of regression, which is the whole reason "what is due, when" needs its own probe now that it
  // has a customer render path. Reported alongside gate_a rather than folded into `ok`/`overallOk` (not
  // in this lane's write set) — same posture gate_a itself already takes: informational, not a gate on
  // HTTP status, but a regression a human or dashboard watching this endpoint over time will notice.
  const forward_events_visible_on_regulations: { count: number | null; error: string | null } = {
    count: null,
    error: null,
  };
  try {
    // `intelligence_items!inner(...)` forces an inner join (PostgREST embedded-resource filter), so a
    // row whose parent item is archived (or missing) is excluded from the count, not merely from the
    // returned columns — the same "never render a broken/leaked link" posture this table's own read
    // paths already take.
    const { count, error } = await supabase
      .from("item_forward_events")
      .select("id, intelligence_items!inner(is_archived)", { count: "exact", head: true })
      .eq("intelligence_items.is_archived", false);
    if (error) forward_events_visible_on_regulations.error = error.message;
    else forward_events_visible_on_regulations.count = count ?? 0;
  } catch (e) {
    forward_events_visible_on_regulations.error =
      e instanceof Error ? e.message : "forward_events_visible_on_regulations count threw";
  }

  const ok = overallOk(surfaces, rpcs);
  const body = {
    ok,
    // seed_leak: post Wave-α A1 the dashboard seed fallback is deleted; here we
    // assert the dashboard provably renders from real rows (backing_rows > 0).
    seed_leak: seedLeak(surfaces["dashboard"]?.backing_rows ?? null),
    surfaces,
    rpcs,
    gate_a,
    forward_events_visible_on_regulations,
    checked_at: new Date().toISOString(),
  };
  // 200 when healthy, 503 when not, so the workflow can gate on HTTP status
  // OR parse the body — both paths agree.
  return NextResponse.json(body, { status: ok ? 200 : 503 });
}
