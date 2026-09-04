import { NextRequest, NextResponse } from "next/server";
import { fetchIntelligenceItem } from "@/lib/supabase-server";
import { getViewerRelevanceForItem } from "@/lib/workspace/viewer-relevance";
import { withErrorCapture } from "@/lib/telemetry/capture-error";

// GET /api/detail/relevance?itemId=<uuid-or-legacy_id> — PERF-10 (2026-09-04, root-cause fix,
// ADR-026 Follow-up).
//
// WHY THIS EXISTS [CONFIRMED, this lane, reading load-detail-core.ts]: loadDetailCore's
// runViewerScoped calls `deps.getRelevance(relevanceInput)` UNCONDITIONALLY for EVERY detail page
// render — regulations/market/operations/research/[slug], all four, even the two surfaces
// (operations, research) with no loadViewerScoped of their own. getRelevance (= getViewerRelevanceForItem,
// src/lib/workspace/viewer-relevance.ts) calls resolveOrgIdFromCookies() — a Dynamic API read — so
// EVERY detail route was forced `ƒ` by this ONE call alone, independent of every other cause this
// lane fixes. This is the single most universal blocker across all four detail routes.
//
// getViewerRelevanceForItem is genuinely per-viewer (a workspace-profile-scoped relevance lens —
// "does this item match YOUR tracked modes/jurisdictions" — not raw content with a per-org override
// overlay), so unlike the item listing itself it cannot become a shared public cache entry; it moves
// to a client fetch instead, same mechanism as /api/obligations/upcoming and /api/obligations/register
// (a Route Handler's own Dynamic-API dependency does not propagate to a page that merely fetch()s it
// client-side).
//
// `fetchIntelligenceItem` is reused UNCHANGED (already unstable_cache-wrapped, org-independent,
// provenance-gated) purely to obtain `relevanceInput` — the same item-level tag columns
// getViewerRelevanceForItem always needed, previously threaded through loadDetailCore's own
// `detail.relevanceInput` from the SAME cached fetchIntelligenceItem call the item-scoped bundle
// already made. This route does not duplicate a new read path; it re-derives the one input
// getViewerRelevanceForItem has always required, from the same cached source.
async function handleGET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("itemId");
  if (!itemId) {
    return NextResponse.json({ relevance: null }, { headers: { "Cache-Control": "private, no-store" } });
  }
  try {
    const detail = await fetchIntelligenceItem(itemId);
    if (!detail) {
      return NextResponse.json({ relevance: null }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const relevance = await getViewerRelevanceForItem(
      detail.relevanceInput as Parameters<typeof getViewerRelevanceForItem>[0]
    );
    return NextResponse.json({ relevance }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[api/detail/relevance] failed, returning null:", e);
    return NextResponse.json({ relevance: null }, { headers: { "Cache-Control": "private, no-store" } });
  }
}

export const GET = withErrorCapture("/api/detail/relevance", handleGET);
