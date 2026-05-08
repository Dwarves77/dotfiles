// /api/admin/integrity-flags
//
// This route serves TWO surfaces, distinguished by the ?platform=1 query:
//
//   1. (default, no platform flag) — Per-brief integrity flags from
//      migration 035: intelligence_items.agent_integrity_flag rows.
//      Powers the existing IntegrityFlagsView component.
//
//   2. (?platform=1)               — Platform-level integrity_flags
//      table from migration 048: design_drift, data_quality,
//      source_issue, coverage_gap, data_integrity, surface_concern.
//      Powers PlatformIntegrityFlagsView.
//
// Methods:
//   GET   — list rows (both surfaces)
//   PATCH — update status (platform surface only)
//
// Auth: requireAuth + admin role gate. Rate-limited.

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

// ─────────────────────────────────────────────────────────────────────────
// Per-brief surface (migration 035)
// ─────────────────────────────────────────────────────────────────────────

async function getPerBriefFlags(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string
): Promise<NextResponse> {
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
    { headers: rateLimitHeaders(userId) }
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Platform surface (migration 048)
// ─────────────────────────────────────────────────────────────────────────

const PLATFORM_CATEGORIES = [
  "design_drift",
  "data_quality",
  "source_issue",
  "coverage_gap",
  "data_integrity",
  "surface_concern",
] as const;
type PlatformCategory = (typeof PLATFORM_CATEGORIES)[number];

const PLATFORM_STATUSES = [
  "open",
  "in_review",
  "resolved",
  "archived",
] as const;
type PlatformStatus = (typeof PLATFORM_STATUSES)[number];

async function getPlatformFlags(
  supabase: ReturnType<typeof getServiceClient>,
  url: URL,
  userId: string
): Promise<NextResponse> {
  // Parse filters
  const categoryParam = url.searchParams.get("category");
  const statusParam = url.searchParams.get("status");

  const category =
    categoryParam &&
    (PLATFORM_CATEGORIES as readonly string[]).includes(categoryParam)
      ? (categoryParam as PlatformCategory)
      : null;

  // status filter has a special "open_or_review" pseudo-value (default in UI)
  // — the absence of a status param means "show open + in_review".
  const status =
    statusParam &&
    (PLATFORM_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as PlatformStatus)
      : null;

  let query = supabase
    .from("integrity_flags")
    .select("*")
    .order("created_at", { ascending: false });

  if (category) query = query.eq("category", category);
  if (status) {
    query = query.eq("status", status);
  } else {
    query = query.in("status", ["open", "in_review"]);
  }

  const { data: rows, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: `Failed to load platform flags: ${error.message}` },
      { status: 500 }
    );
  }

  // Counts strip — total per category, total per status. Issued as a
  // separate aggregate query so the chip badges stay accurate even when
  // the active filter narrows the visible list.
  const { data: countRows, error: countErr } = await supabase
    .from("integrity_flags")
    .select("category, status");

  if (countErr) {
    return NextResponse.json(
      { error: `Failed to load flag counts: ${countErr.message}` },
      { status: 500 }
    );
  }

  const byCategory = Object.fromEntries(
    PLATFORM_CATEGORIES.map((c) => [c, 0])
  ) as Record<PlatformCategory, number>;
  const byStatus = Object.fromEntries(
    PLATFORM_STATUSES.map((s) => [s, 0])
  ) as Record<PlatformStatus, number>;

  for (const row of countRows || []) {
    const c = row.category as PlatformCategory;
    const s = row.status as PlatformStatus;
    if (c in byCategory) byCategory[c]++;
    if (s in byStatus) byStatus[s]++;
  }

  return NextResponse.json(
    {
      items: rows || [],
      counts: {
        byCategory,
        byStatus,
        total: countRows?.length ?? 0,
      },
    },
    { headers: rateLimitHeaders(userId) }
  );
}

async function patchPlatformFlag(
  request: NextRequest,
  supabase: ReturnType<typeof getServiceClient>,
  userId: string
): Promise<NextResponse> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, status, resolution_note } = body || {};

  if (typeof id !== "string" || id.length === 0) {
    return NextResponse.json(
      { error: "Missing or invalid `id`" },
      { status: 400 }
    );
  }

  if (
    typeof status !== "string" ||
    !(PLATFORM_STATUSES as readonly string[]).includes(status)
  ) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${PLATFORM_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  // Resolve or archive — set resolved_at + resolved_by. Reverting back to
  // open or in_review clears the resolution columns so the row reads as
  // "still active." resolution_note is preserved across status changes if
  // the caller doesn't explicitly clear it.
  const isTerminal = status === "resolved" || status === "archived";
  const update: Record<string, any> = { status };
  if (isTerminal) {
    update.resolved_at = new Date().toISOString();
    update.resolved_by = userId;
    if (typeof resolution_note === "string" && resolution_note.length > 0) {
      update.resolution_note = resolution_note;
    }
  } else {
    // Going back to open / in_review — drop resolution markers so the row
    // looks fresh again. Note stays unless caller clears it.
    update.resolved_at = null;
    update.resolved_by = null;
    if (typeof resolution_note === "string") {
      update.resolution_note = resolution_note.length > 0 ? resolution_note : null;
    }
  }

  const { data: updated, error } = await supabase
    .from("integrity_flags")
    .update(update)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to update flag: ${error.message}` },
      { status: 500 }
    );
  }

  if (!updated) {
    return NextResponse.json(
      { error: "Flag not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(
    { item: updated },
    { headers: rateLimitHeaders(userId) }
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceClient();
  const denied = await requireAdminRole(supabase, auth.userId);
  if (denied) return denied;

  const url = new URL(request.url);
  const isPlatform = url.searchParams.get("platform") === "1";

  if (isPlatform) {
    return getPlatformFlags(supabase, url, auth.userId);
  }
  return getPerBriefFlags(supabase, auth.userId);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceClient();
  const denied = await requireAdminRole(supabase, auth.userId);
  if (denied) return denied;

  const url = new URL(request.url);
  const isPlatform = url.searchParams.get("platform") === "1";

  if (!isPlatform) {
    return NextResponse.json(
      { error: "PATCH is only supported on the platform surface (?platform=1)" },
      { status: 405 }
    );
  }

  return patchPlatformFlag(request, supabase, auth.userId);
}
