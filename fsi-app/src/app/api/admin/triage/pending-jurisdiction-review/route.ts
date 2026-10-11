import { NextRequest, NextResponse } from "next/server";
import { isRefusal, requireAdminRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";


const VALID_ACTIONS = new Set(["confirm", "manually-classify", "dismiss"]);
const VALID_SOURCE_COLUMNS = new Set(["jurisdictions", "jurisdiction_iso"]);

export async function GET(request: NextRequest) {
  const auth = await requireAdminRoute(request);
  if (isRefusal(auth)) return auth;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("pending_jurisdiction_review")
    .select(
      "id, intelligence_item_id, current_value, flagged_reason, source_column, flagged_at, " +
        "item:intelligence_items(id, title, jurisdictions, jurisdiction_iso)"
    )
    .is("resolved_at", null)
    .order("flagged_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const { count: totalCount } = await supabase
    .from("pending_jurisdiction_review")
    .select("id", { count: "exact", head: true })
    .is("resolved_at", null);

  return NextResponse.json(
    {
      items: data || [],
      total_unresolved: totalCount ?? null,
      list_capped: typeof totalCount === "number" && totalCount > (data?.length ?? 0),
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}

interface TriageBody {
  id?: string;
  action?: string;
  resolution_value?: string | null;
  notes?: string | null;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminRoute(request);
  if (isRefusal(auth)) return auth;
  const { supabase } = auth;

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
  const resolutionValueRaw =
    typeof body.resolution_value === "string" ? body.resolution_value.trim() : null;

  if (!id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (!action || !VALID_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: "action must be one of: confirm, manually-classify, dismiss" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (action === "manually-classify" && !resolutionValueRaw) {
    return NextResponse.json(
      { error: "resolution_value is required for manually-classify" },
      { status: 400, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // Load the row so we know which intelligence_item + column to edit.
  const { data: row, error: readError } = await supabase
    .from("pending_jurisdiction_review")
    .select("id, intelligence_item_id, current_value, source_column, resolved_at")
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    return NextResponse.json(
      { error: readError.message },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (!row) {
    return NextResponse.json(
      { error: "row not found" },
      { status: 404, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (row.resolved_at) {
    return NextResponse.json(
      { error: "row already resolved" },
      { status: 409, headers: rateLimitHeaders(auth.userId) }
    );
  }
  if (!VALID_SOURCE_COLUMNS.has(row.source_column)) {
    return NextResponse.json(
      { error: `invalid source_column on row: ${row.source_column}` },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // Compute resolution_value the row will be written with.
  let resolutionValue: string | null;
  if (action === "confirm") {
    resolutionValue = row.current_value;
  } else if (action === "manually-classify") {
    resolutionValue = resolutionValueRaw;
  } else {
    resolutionValue = null;
  }

  // For manually-classify + dismiss, mutate the intelligence_items array.
  // (confirm leaves the array untouched.)
  if (action !== "confirm") {
    const { data: item, error: itemReadError } = await supabase
      .from("intelligence_items")
      .select(`id, ${row.source_column}`)
      .eq("id", row.intelligence_item_id)
      .maybeSingle();
    if (itemReadError) {
      return NextResponse.json(
        { error: `Failed to read item: ${itemReadError.message}` },
        { status: 500, headers: rateLimitHeaders(auth.userId) }
      );
    }
    if (item) {
      const itemRecord = item as unknown as Record<string, unknown>;
      const currentArr = (itemRecord[row.source_column] as string[] | null) || [];
      const filtered = currentArr.filter((v) => v !== row.current_value);
      const next =
        action === "manually-classify" && resolutionValue
          ? Array.from(new Set([...filtered, resolutionValue]))
          : filtered;
      const { error: itemUpdateError } = await supabase
        .from("intelligence_items")
        .update({ [row.source_column]: next })
        .eq("id", row.intelligence_item_id);
      if (itemUpdateError) {
        return NextResponse.json(
          { error: `Failed to update item: ${itemUpdateError.message}` },
          { status: 500, headers: rateLimitHeaders(auth.userId) }
        );
      }
    }
  }

  const nowIso = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("pending_jurisdiction_review")
    .update({
      resolved_at: nowIso,
      resolved_by: auth.userId,
      resolution_value: resolutionValue,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json(
      {
        error: `Item updated but PJR resolve failed: ${updateError.message}`,
      },
      { status: 500, headers: rateLimitHeaders(auth.userId) }
    );
  }

  return NextResponse.json(
    {
      success: true,
      id,
      action,
      resolution_value: resolutionValue,
      resolved_at: nowIso,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
