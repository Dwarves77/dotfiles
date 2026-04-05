import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service role credentials not configured");
  }
  return createClient(url, key);
}

// GET /api/staged-updates — list pending updates
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("staged_updates")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { updates: data },
      { headers: rateLimitHeaders(auth.userId) }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/staged-updates — approve or reject an update
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  try {
    const body = await request.json();
    const { id, action, reviewer_notes } = body;

    if (!id || !action) {
      return NextResponse.json(
        { error: "Missing required fields: id, action" },
        { status: 400 }
      );
    }

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Action must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    const { data: update, error: fetchError } = await supabase
      .from("staged_updates")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !update) {
      return NextResponse.json(
        { error: "Staged update not found" },
        { status: 404 }
      );
    }

    if (update.status !== "pending") {
      return NextResponse.json(
        { error: `Update already ${update.status}` },
        { status: 409 }
      );
    }

    const { error: updateError } = await supabase
      .from("staged_updates")
      .update({
        status: action === "approve" ? "approved" : "rejected",
        reviewed_by: auth.userId,
        reviewed_at: new Date().toISOString(),
        ...(reviewer_notes ? { reviewer_notes } : {}),
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (action === "approve") {
      const result = await applyUpdate(supabase, update);
      if (!result.success) {
        return NextResponse.json(
          { error: `Approved but failed to apply: ${result.error}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { success: true, action, id },
      { headers: rateLimitHeaders(auth.userId) }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function applyUpdate(
  supabase: any,
  update: any
): Promise<{ success: boolean; error?: string }> {
  try {
    switch (update.update_type) {
      case "new_item": {
        // Strip fields that don't exist on intelligence_items table
        const { key_deadlines, source_name, why_matters, ...insertData } = update.proposed_changes;
        // Map why_matters to the correct column name
        if (why_matters) insertData.why_matters = why_matters;
        const { error } = await supabase
          .from("intelligence_items")
          .insert(insertData);
        if (error) return { success: false, error: error.message };
        break;
      }
      case "update_item": {
        if (!update.item_id) return { success: false, error: "No item_id for update" };
        const { error } = await supabase
          .from("intelligence_items")
          .update(update.proposed_changes)
          .eq("id", update.item_id);
        if (error) return { success: false, error: error.message };
        break;
      }
      case "status_change": {
        if (!update.item_id) return { success: false, error: "No item_id for status change" };
        const { error } = await supabase
          .from("intelligence_items")
          .update({ status: update.proposed_changes.status })
          .eq("id", update.item_id);
        if (error) return { success: false, error: error.message };
        break;
      }
      case "new_source": {
        const { error } = await supabase
          .from("sources")
          .insert(update.proposed_changes);
        if (error) return { success: false, error: error.message };
        break;
      }
      case "archive_item": {
        if (!update.item_id) return { success: false, error: "No item_id for archive" };
        const { error } = await supabase
          .from("intelligence_items")
          .update({
            is_archived: true,
            archive_reason: update.proposed_changes.archive_reason || "Manual",
            archive_note: update.proposed_changes.archive_note || "",
            archived_date: new Date().toISOString().slice(0, 10),
          })
          .eq("id", update.item_id);
        if (error) return { success: false, error: error.message };
        break;
      }
      default:
        return { success: false, error: `Unknown update type: ${update.update_type}` };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
