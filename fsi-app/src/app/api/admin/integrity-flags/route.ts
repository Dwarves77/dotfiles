// GET /api/admin/integrity-flags
//
// List unresolved agent-integrity-flagged intelligence_items rows. Joined
// with the sources registry so the admin sub-tab can render a source name
// next to each flag without a second round-trip.
//
// Filters: only rows where agent_integrity_flag = TRUE AND
// agent_integrity_resolved_at IS NULL. Resolved flags stay in the table
// for audit but drop out of this list.
//
// Auth: requireAuth + admin role gate. The /admin page already redirects
// non-admins, but the API enforces independently so direct hits are
// rejected.
//
// Rate-limited.

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

async function requireAdminRole(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string
): Promise<NextResponse | null> {
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const role = membership?.role;
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json(
      { error: "Admin role required" },
      { status: 403 }
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceClient();
  const denied = await requireAdminRole(supabase, auth.userId);
  if (denied) return denied;

  // Pull every unresolved flagged item with a left-join on sources for the
  // human-readable source name. The Supabase JS client expresses this as
  // an embedded select; if source_id is null on the item the source object
  // comes back as null and the UI shows the raw URL.
  const { data: flagged, error } = await supabase
    .from("intelligence_items")
    .select(
      `
      id,
      legacy_id,
      title,
      source_url,
      source_id,
      agent_integrity_flag,
      agent_integrity_phrase,
      agent_integrity_flagged_at,
      agent_integrity_resolved_at,
      updated_at,
      source:sources(id, name, tier, url)
      `
    )
    .eq("agent_integrity_flag", true)
    .is("agent_integrity_resolved_at", null)
    .order("agent_integrity_flagged_at", { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json(
      { error: `Failed to load flagged items: ${error.message}` },
      { status: 500 }
    );
  }

  // Headline stats for the sub-tab strip. The total flagged count includes
  // resolved rows so the operator can see "all-time" as well as current
  // backlog. A second targeted count keeps the calculation off the client.
  const { count: totalFlagged } = await supabase
    .from("intelligence_items")
    .select("id", { count: "exact", head: true })
    .eq("agent_integrity_flag", true);

  const items = (flagged || []).map((row: any) => ({
    id: row.id,
    legacyId: row.legacy_id,
    title: row.title,
    sourceUrl: row.source_url,
    sourceId: row.source_id,
    sourceName: row.source?.name || null,
    sourceTier: row.source?.tier || null,
    phrase: row.agent_integrity_phrase,
    flaggedAt: row.agent_integrity_flagged_at,
    updatedAt: row.updated_at,
  }));

  // Oldest unresolved age in days — one round trip cheaper than scanning
  // client-side and matches how the admin shell renders other "oldest" stats.
  let oldestAgeDays: number | null = null;
  if (items.length > 0 && items[0].flaggedAt) {
    const ageMs = Date.now() - new Date(items[0].flaggedAt).getTime();
    oldestAgeDays = Math.max(0, Math.round(ageMs / 86_400_000));
  }

  return NextResponse.json(
    {
      items,
      stats: {
        totalUnresolved: items.length,
        totalFlagged: totalFlagged ?? items.length,
        oldestAgeDays,
      },
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
