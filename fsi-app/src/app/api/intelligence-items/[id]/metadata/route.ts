// GET /api/intelligence-items/[id]/metadata
//
// Read-only — returns the intersection-readiness metadata for one item:
// topic_tags, operational_scenario_tags, compliance_object_tags,
// related_items (resolved to title + legacy_id), intersection_summary,
// severity, urgency_tier, format_type, last_regenerated_at,
// regeneration_skill_version, sources_used count.
//
// Lightweight surface for the per-item display strip (used in
// IntelligenceBrief context). One query plus an in-list lookup for
// related_items resolution. ~50ms.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;
  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = getServiceClient();

  const { data: item, error } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, title, item_type, severity, priority, urgency_tier, format_type, topic_tags, operational_scenario_tags, compliance_object_tags, related_items, intersection_summary, sources_used, last_regenerated_at, regeneration_skill_version")
    .eq("id", id)
    .single();

  if (error || !item) {
    return NextResponse.json({ error: error?.message || "Not found" }, { status: 404 });
  }

  // Resolve related_items UUIDs into title + legacy_id for display
  const relatedIds: string[] = item.related_items || [];
  let relatedResolved: Array<{ id: string; title: string; legacy_id: string | null }> = [];
  if (relatedIds.length > 0) {
    const { data: rels } = await supabase
      .from("intelligence_items")
      .select("id, title, legacy_id")
      .in("id", relatedIds);
    relatedResolved = rels || [];
  }

  return NextResponse.json(
    {
      item: {
        id: item.id,
        legacy_id: item.legacy_id,
        title: item.title,
        item_type: item.item_type,
        severity: item.severity,
        priority: item.priority,
        urgency_tier: item.urgency_tier,
        format_type: item.format_type,
        topic_tags: item.topic_tags || [],
        operational_scenario_tags: item.operational_scenario_tags || [],
        compliance_object_tags: item.compliance_object_tags || [],
        related_items: relatedResolved,
        intersection_summary: item.intersection_summary,
        sources_used_count: (item.sources_used || []).length,
        last_regenerated_at: item.last_regenerated_at,
        regeneration_skill_version: item.regeneration_skill_version,
      },
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
