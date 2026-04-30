// GET /api/admin/b2-progress
//
// Read-only stats endpoint for the Phase B.2 regeneration. Surfaces how
// many intelligence_items are at the current SKILL.md contract version
// vs older versions vs never regenerated, broken down by format_type
// and priority. Lets the admin UI show real-time progress without
// custom queries.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const CURRENT_SKILL_VERSION = "2026-04-29";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;
  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceClient();

  const { data: rows, error } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, item_type, priority, regeneration_skill_version, source_url, is_archived, last_regenerated_at, operational_scenario_tags, compliance_object_tags, intersection_summary, related_items")
    .eq("is_archived", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const all = rows || [];
  const withSource = all.filter((r) => r.source_url);
  const eligible = withSource.filter((r) => r.legacy_id ? !r.legacy_id.startsWith("ss") && !r.legacy_id.startsWith("arc") : true);

  const atCurrent = eligible.filter((r) => r.regeneration_skill_version === CURRENT_SKILL_VERSION);
  const atOlder = eligible.filter((r) => r.regeneration_skill_version && r.regeneration_skill_version !== CURRENT_SKILL_VERSION);
  const neverRegenerated = eligible.filter((r) => !r.regeneration_skill_version);

  // Format breakdown of items at current contract
  const byFormat: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  for (const r of atCurrent) {
    const ft = (r as any).item_type || "(unknown)";
    byFormat[ft] = (byFormat[ft] || 0) + 1;
    const p = r.priority || "(none)";
    byPriority[p] = (byPriority[p] || 0) + 1;
  }

  // Intersection-readiness coverage
  const tagCoverage = {
    has_op_scenario_tags: atCurrent.filter((r) => (r.operational_scenario_tags || []).length > 0).length,
    has_compliance_object_tags: atCurrent.filter((r) => (r.compliance_object_tags || []).length > 0).length,
    has_intersection_summary: atCurrent.filter((r) => r.intersection_summary).length,
    has_related_items: atCurrent.filter((r) => (r.related_items || []).length > 0).length,
  };

  // Most recently regenerated
  const recent = atCurrent
    .filter((r) => r.last_regenerated_at)
    .sort((a, b) => (b.last_regenerated_at || "").localeCompare(a.last_regenerated_at || ""))
    .slice(0, 10)
    .map((r) => ({
      legacy_id: r.legacy_id,
      item_type: (r as any).item_type,
      priority: r.priority,
      last_regenerated_at: r.last_regenerated_at,
    }));

  return NextResponse.json(
    {
      contract_version: CURRENT_SKILL_VERSION,
      total_eligible: eligible.length,
      at_current: atCurrent.length,
      at_older_version: atOlder.length,
      never_regenerated: neverRegenerated.length,
      pct_complete: eligible.length === 0 ? 0 : Math.round((atCurrent.length / eligible.length) * 100),
      by_format: byFormat,
      by_priority: byPriority,
      tag_coverage: tagCoverage,
      recent_regenerations: recent,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
