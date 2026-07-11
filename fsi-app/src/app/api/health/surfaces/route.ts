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
import {
  ALL_SURFACES,
  evaluateSurface,
  overallOk,
  seedLeak,
} from "@/lib/telemetry/surface-health.mjs";

export const dynamic = "force-dynamic";

type Counts = Record<string, { rows: number | null; error: string | null }>;

/** Cheap COUNT(*) with a filter, head-only (no rows transferred). */
async function countRows(
  supabase: ReturnType<typeof getServiceSupabase>,
  table: string,
  build: (q: any) => any
): Promise<{ rows: number | null; error: string | null }> {
  try {
    const { count, error } = await build(
      supabase.from(table).select("*", { count: "exact", head: true })
    );
    if (error) return { rows: null, error: error.message };
    return { rows: count ?? 0, error: null };
  } catch (e: any) {
    return { rows: null, error: e?.message ?? "count threw" };
  }
}

export async function GET(request: NextRequest) {
  const denied = workerAuthGuard(request);
  if (denied) return denied;

  let supabase: ReturnType<typeof getServiceSupabase>;
  try {
    supabase = getServiceSupabase();
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "service client unavailable", surfaces: {}, rpcs: {} },
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
  } catch (e: any) {
    orgError = e?.message ?? "org lookup threw";
  }

  // ── Per-surface backing counts ─────────────────────────────────────────
  // Must-have surfaces read verified, non-archived intelligence_items filtered
  // to their item_type family (the same gate customer reads use). Zero-legal
  // surfaces read their own backing tables; zero there is an honest empty
  // state, not an outage.
  const verified = (q: any) =>
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
  counts["map"] = await countRows(supabase, "community_posts", (q) => q);
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
    } catch (e: any) {
      rpcs["market_intel"] = { ok: false, error: e?.message ?? "rpc threw" };
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
    } catch (e: any) {
      rpcs["surface_counts"] = { ok: false, error: e?.message ?? "rpc threw" };
    }
  }

  const ok = overallOk(surfaces, rpcs);
  const body = {
    ok,
    // seed_leak: post Wave-α A1 the dashboard seed fallback is deleted; here we
    // assert the dashboard provably renders from real rows (backing_rows > 0).
    seed_leak: seedLeak(surfaces["dashboard"]?.backing_rows ?? null),
    surfaces,
    rpcs,
    checked_at: new Date().toISOString(),
  };
  // 200 when healthy, 503 when not, so the workflow can gate on HTTP status
  // OR parse the body — both paths agree.
  return NextResponse.json(body, { status: ok ? 200 : 503 });
}
