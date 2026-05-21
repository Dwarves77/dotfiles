// Phase 7 admin chrome — ingest rejections triage queue.
//
// GET  /api/admin/triage/ingest-rejections
//   Returns untriaged ingest_rejections rows (raw_value, rejection_reason,
//   source URL/id, timestamp). Most-recent first; capped at 200 rows so
//   the UI stays responsive even when the queue is backlogged. Operator
//   acts on rows one at a time via the POST handler.
//
// POST /api/admin/triage/ingest-rejections
//   Body: { id: string, action: 'discarded'|'reclassified'|'escalated', notes?: string }
//   Marks the row triaged. The CHECK constraint
//   ingest_rejections_triage_consistency requires all three triage columns
//   to be set together; this handler sets triaged_at + triaged_by + the
//   action atomically.
//
// Auth: requireAuth + isPlatformAdmin. Both are platform-admin-only
// surfaces (migration 082 RLS).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { isPlatformAdmin } from "@/lib/auth/admin";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const VALID_ACTIONS = new Set(["discarded", "reclassified", "escalated"]);

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceClient();

  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const { data, error } = await supabase
    .from("ingest_rejections")
    .select(
      "id, raw_value, rejection_reason, source_url, source_id, ingest_attempted_at, " +
        "source:sources(id, name, url)"
    )
    .is("triaged_at", null)
    .order("ingest_attempted_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // Total counts (untriaged) for the stat strip. Cheap header-only count
  // so the UI can show "200 of 743" when the list is capped.
  const { count: totalCount } = await supabase
    .from("ingest_rejections")
    .select("id", { count: "exact", head: true })
    .is("triaged_at", null);

  return NextResponse.json(
    {
      items: data || [],
      total_untriaged: totalCount ?? null,
      list_capped: typeof totalCount === "number" && totalCount > (data?.length ?? 0),
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

interface TriageBody {
  id?: string;
  action?: string;
  notes?: string | null;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceClient();

  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  let body: TriageBody;
  try {
    body = (await request.json()) as TriageBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const id = typeof body.id === "string" ? body.id : null;
  const action = typeof body.action === "string" ? body.action : null;
  const notes = typeof body.notes === "string" ? body.notes.trim() : null;

  if (!id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (!action || !VALID_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: "action must be one of: discarded, reclassified, escalated" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("ingest_rejections")
    .update({
      triage_action: action,
      triaged_by: auth.userId,
      triaged_at: nowIso,
      triage_notes: notes,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }

  return NextResponse.json(
    {
      success: true,
      id,
      triage_action: action,
      triaged_at: nowIso,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
