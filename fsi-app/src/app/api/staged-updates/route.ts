import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { revalidateTag } from "next/cache";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { APP_DATA_TAG } from "@/lib/data";

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
//
// W1.B materialization-pipeline contract (see migration 034 +
// docs/W1B-approval-handler-analysis.md):
//
//  Approving a staged_update MUST result in EITHER:
//    (a) a new/updated row in the target table (intelligence_items, sources, …)
//        AND staged_updates.status='approved' AND materialized_at=NOW()
//        AND (for new_item) materialized_item_id=<new intel id>
//        AND materialization_error IS NULL, OR
//    (b) staged_updates.status='approved'  (intent recorded — review decision is durable)
//        AND materialized_at IS NULL
//        AND materialization_error=<non-null reason string>
//        AND a 500 response so the caller knows the apply step failed.
//
//  Idempotency: if a row is already 'approved', we re-attempt materialization
//  iff materialized_at IS NULL. If it is already materialized we return the
//  prior materialized_item_id without inserting a duplicate.
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

    // Idempotency for re-approval of orphaned approved rows:
    // - status='pending'  → normal flow
    // - status='approved' AND materialized_at IS NULL → retry materialization
    // - status='approved' AND materialized_at IS NOT NULL → return prior result
    // - status='rejected' → 409
    if (update.status === "rejected") {
      return NextResponse.json(
        { error: "Update already rejected" },
        { status: 409 }
      );
    }

    if (update.status === "approved" && update.materialized_at) {
      return NextResponse.json(
        {
          success: true,
          action: "approve",
          id,
          materialized_item_id: update.materialized_item_id ?? null,
          idempotent: true,
        },
        { headers: rateLimitHeaders(auth.userId) }
      );
    }

    if (action === "reject") {
      if (update.status !== "pending") {
        return NextResponse.json(
          { error: `Update already ${update.status}` },
          { status: 409 }
        );
      }
      const { error: rejectError } = await supabase
        .from("staged_updates")
        .update({
          status: "rejected",
          reviewed_by: auth.userId,
          reviewed_at: new Date().toISOString(),
          ...(reviewer_notes ? { reviewer_notes } : {}),
        })
        .eq("id", id);

      if (rejectError) {
        return NextResponse.json({ error: rejectError.message }, { status: 500 });
      }

      // Invalidate the workspace data cache so admins see the rejected
      // row removed from the queue immediately, not after the 60s TTL.
      revalidateTag(APP_DATA_TAG, "max");

      return NextResponse.json(
        { success: true, action, id },
        { headers: rateLimitHeaders(auth.userId) }
      );
    }

    // ── action === "approve" ─────────────────────────────────────────────
    //
    // Order matters. We FIRST attempt to materialize the row. Only on
    // success do we mark status='approved' with materialized_at. On
    // failure we still mark status='approved' (the human reviewer's
    // intent is durable and visible) but record materialization_error
    // so the audit script + W4 backfill pipeline can pick it up.
    //
    // Previously we flipped status='approved' first, then ran apply.
    // When apply failed the row was orphaned: status='approved' with no
    // intel item, no error column, no recovery path. That bug produced
    // the 24 orphans this migration is unblocking.

    const materializeResult = await applyUpdate(supabase, update);

    const reviewedAt = new Date().toISOString();
    const baseFields: Record<string, unknown> = {
      status: "approved",
      reviewed_by: auth.userId,
      reviewed_at: reviewedAt,
      ...(reviewer_notes ? { reviewer_notes } : {}),
    };

    if (materializeResult.success) {
      const { error: persistError } = await supabase
        .from("staged_updates")
        .update({
          ...baseFields,
          materialized_at: reviewedAt,
          materialized_item_id: materializeResult.itemId ?? null,
          materialization_error: null,
        })
        .eq("id", id);

      if (persistError) {
        // The intel item exists but we couldn't record success on the
        // staged_update. Surface the failure so the caller can investigate.
        // Do NOT swallow this — the staged_update is now in an inconsistent
        // state (materialization happened, status flag missing).
        return NextResponse.json(
          {
            error: `Materialization succeeded but staged_updates row failed to update: ${persistError.message}`,
            materialized_item_id: materializeResult.itemId ?? null,
          },
          { status: 500 }
        );
      }

      // Invalidate the workspace data cache — the new/updated
      // intelligence_item should appear on /, /regulations, /map etc.
      // immediately, not after the 60s TTL.
      revalidateTag(APP_DATA_TAG, "max");

      return NextResponse.json(
        {
          success: true,
          action,
          id,
          materialized_item_id: materializeResult.itemId ?? null,
        },
        { headers: rateLimitHeaders(auth.userId) }
      );
    }

    // Materialization failed. Record the failure on the staged_update so
    // the audit script + W4 retry tooling can find it. Caller gets a 500.
    const failureReason = materializeResult.error || "unknown materialization error";
    const { error: failurePersistError } = await supabase
      .from("staged_updates")
      .update({
        ...baseFields,
        materialized_at: null,
        materialized_item_id: null,
        materialization_error: failureReason,
      })
      .eq("id", id);

    if (failurePersistError) {
      // Record-the-failure write itself failed. This is rare (DB-level
      // problem) but we must not pretend success.
      return NextResponse.json(
        {
          error: `Materialization failed (${failureReason}); also failed to record error on staged_updates: ${failurePersistError.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: `Approved but failed to apply: ${failureReason}`,
        materialization_error: failureReason,
      },
      { status: 500 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * applyUpdate — perform the side-effect implied by an approved staged_update.
 *
 * Returns { success: true, itemId? } on success. itemId is populated only for
 * `new_item` (the new intelligence_items.id). On failure returns
 * { success: false, error } with a string reason.
 *
 * IMPORTANT: this must NEVER throw. All error paths return structured failure
 * so the caller can record materialization_error.
 */
async function applyUpdate(
  supabase: any,
  update: any
): Promise<{ success: boolean; error?: string; itemId?: string }> {
  try {
    switch (update.update_type) {
      case "new_item": {
        // Strip fields that don't exist on intelligence_items table.
        // (key_deadlines, source_name lived on legacy resources — they
        // are noise on intel items and would error the insert.)
        const proposed = update.proposed_changes ?? {};
        if (typeof proposed !== "object") {
          return { success: false, error: "proposed_changes is not an object" };
        }
        const {
          key_deadlines: _kd,
          source_name: _sn,
          ...insertData
        } = proposed;

        // Idempotency: if a prior approval attempt for THIS staged_update
        // already produced an intel item (legacy_id matches), return it
        // instead of inserting a duplicate.
        if (insertData.legacy_id) {
          const { data: existing } = await supabase
            .from("intelligence_items")
            .select("id")
            .eq("legacy_id", insertData.legacy_id)
            .maybeSingle();
          if (existing?.id) {
            return { success: true, itemId: existing.id };
          }
        }

        const { data: inserted, error } = await supabase
          .from("intelligence_items")
          .insert(insertData)
          .select("id")
          .single();
        if (error) return { success: false, error: error.message };
        return { success: true, itemId: inserted?.id };
      }
      case "update_item": {
        if (!update.item_id)
          return { success: false, error: "No item_id for update" };
        const { error } = await supabase
          .from("intelligence_items")
          .update(update.proposed_changes ?? {})
          .eq("id", update.item_id);
        if (error) return { success: false, error: error.message };
        return { success: true, itemId: update.item_id };
      }
      case "status_change": {
        if (!update.item_id)
          return { success: false, error: "No item_id for status change" };
        const newStatus = update.proposed_changes?.status;
        if (!newStatus)
          return { success: false, error: "proposed_changes.status missing" };
        const { error } = await supabase
          .from("intelligence_items")
          .update({ status: newStatus })
          .eq("id", update.item_id);
        if (error) return { success: false, error: error.message };
        return { success: true, itemId: update.item_id };
      }
      case "new_source": {
        const { error } = await supabase
          .from("sources")
          .insert(update.proposed_changes ?? {});
        if (error) return { success: false, error: error.message };
        return { success: true };
      }
      case "archive_item": {
        if (!update.item_id)
          return { success: false, error: "No item_id for archive" };
        const proposed = update.proposed_changes ?? {};
        const { error } = await supabase
          .from("intelligence_items")
          .update({
            is_archived: true,
            archive_reason: proposed.archive_reason || "Manual",
            archive_note: proposed.archive_note || "",
            archived_date: new Date().toISOString().slice(0, 10),
          })
          .eq("id", update.item_id);
        if (error) return { success: false, error: error.message };
        return { success: true, itemId: update.item_id };
      }
      default:
        return {
          success: false,
          error: `Unknown update type: ${update.update_type}`,
        };
    }
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}
