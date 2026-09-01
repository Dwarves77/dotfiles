// GET /api/admin/forward-events
//
// Read surface for item_forward_events (migration 274/275, the forward-events harness — see
// scripts/forward-events/extract-forward-events.mjs). Lists dated, obligation-bound events
// DATE-ASCENDING (soonest first — "what is due next", the table's own indexing comment) with an
// intelligence_items JOIN so each row carries enough context to render without a second round trip.
// No compute happens here — this route only ASSEMBLES what extract-forward-events.mjs already wrote,
// same posture as admin/themes and admin/intersections (their own file headers name this pattern).
//
// Query params:
//   from       (ISO date, default: TODAY) — event_date >= from. This is an "upcoming obligations"
//              surface by default; pass from=1900-01-01 (or any date before the corpus) to see history.
//   kind       comma-separated event_kind filter (entry_into_force,compliance_deadline,review_or_report,
//              phase_step,consultation_close,other). Omit for all kinds.
//   precision  comma-separated date_precision filter (day,month,year). Omit for all precisions.
//   limit      (default 100, max 500) — cap returned rows after the date-ascending sort.
//
// Auth: requireAuth + rate limit + platform-admin gate (house pattern, mirrors admin/themes,
// admin/intersections). Cache-Control: no-store — this is an operator queue read, not a
// candidate-for-staleness cached surface (unlike admin/attention's 30s positive cache), and the
// underlying table only ever grows/updates via an operator-run extraction pass, not a request-rate
// workload that would benefit from caching.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";

import { requireAuth, isAuthError } from "@/lib/api/auth";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const NO_STORE = "no-store";

const VALID_KINDS = new Set([
  "entry_into_force", "compliance_deadline", "review_or_report",
  "phase_step", "consultation_close", "other",
]);
const VALID_PRECISIONS = new Set(["day", "month", "year"]);

function parseCsvFilter(raw: string | null, allowed: Set<string>): string[] | null {
  if (!raw) return null;
  const values = raw.split(",").map((s) => s.trim()).filter((s) => allowed.has(s));
  return values.length ? values : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return withNoStore(auth);
  const limited = checkRateLimit(auth.userId);
  if (limited) return withNoStore(limited);

  const { searchParams } = new URL(request.url);
  const fromRaw = searchParams.get("from");
  const from = fromRaw && !Number.isNaN(Date.parse(fromRaw)) ? fromRaw : new Date().toISOString().slice(0, 10);
  const kindFilter = parseCsvFilter(searchParams.get("kind"), VALID_KINDS);
  const precisionFilter = parseCsvFilter(searchParams.get("precision"), VALID_PRECISIONS);
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Math.min(500, Math.max(1, parseInt(limitRaw, 10) || 100)) : 100;

  const supabase = getServiceSupabase();

  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403, headers: { ...rateLimitHeaders(auth.userId), "Cache-Control": NO_STORE } }
    );
  }

  let q = supabase
    .from("item_forward_events")
    .select("id, intelligence_item_id, event_date, date_precision, event_kind, obligation_text, source_kind, source_span, confidence, extractor_version, created_at")
    .gte("event_date", from)
    .order("event_date", { ascending: true })
    .limit(limit);
  if (kindFilter) q = q.in("event_kind", kindFilter);
  if (precisionFilter) q = q.in("date_precision", precisionFilter);

  const { data: events, error } = await q;
  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { ...rateLimitHeaders(auth.userId), "Cache-Control": NO_STORE } }
    );
  }

  const rows = events || [];

  // Item join — only the items these events actually touch, chunked (mirrors admin/intersections'
  // own chunked .in() pattern for the same reason: the id list can exceed a safe single-call size).
  const itemIds = [...new Set(rows.map((r) => r.intelligence_item_id))];
  const itemsById = new Map<string, { id: string; title: string; legacy_id: string | null; jurisdiction_iso: string | null }>();
  for (let i = 0; i < itemIds.length; i += 200) {
    const { data: itemRows, error: itemError } = await supabase
      .from("intelligence_items")
      .select("id, title, legacy_id, jurisdiction_iso")
      .eq("is_archived", false)
      .in("id", itemIds.slice(i, i + 200));
    if (itemError) {
      return NextResponse.json(
        { error: itemError.message },
        { status: 500, headers: { ...rateLimitHeaders(auth.userId), "Cache-Control": NO_STORE } }
      );
    }
    for (const row of itemRows ?? []) itemsById.set(row.id, row);
  }

  // A row whose item is archived (or otherwise missing from the join) is DROPPED, not surfaced with a
  // null item — same "never render a broken link" posture PlatformIntegrityFlagsView documents for its
  // own theme-id subject_ref case.
  const eventsWithItem = rows
    .filter((r) => itemsById.has(r.intelligence_item_id))
    .map((r) => ({ ...r, item: itemsById.get(r.intelligence_item_id) }));

  return NextResponse.json(
    {
      events: eventsWithItem,
      stats: {
        total: eventsWithItem.length,
        by_kind: countBy(eventsWithItem, (e) => e.event_kind),
        by_precision: countBy(eventsWithItem, (e) => e.date_precision),
      },
      params: { from, kind: kindFilter, precision: precisionFilter, limit },
    },
    { headers: { ...rateLimitHeaders(auth.userId), "Cache-Control": NO_STORE } }
  );
}

function countBy<T>(rows: T[], key: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = key(r);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function withNoStore(resp: NextResponse): NextResponse {
  resp.headers.set("Cache-Control", NO_STORE);
  return resp;
}
