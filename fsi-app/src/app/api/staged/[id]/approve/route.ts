import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "../../../_lib/supabase-admin";
import { requireAdmin } from "../../../_lib/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/staged/:id/approve
 * Approve a staged update and apply it to production tables.
 * Handles: create, update, archive, new_source, dispute actions.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  const adminId = auth.userId;
  const supabase = getAdminClient();

  // Fetch the staged update
  const { data: staged, error: fetchError } = await supabase
    .from("staged_updates")
    .select("*")
    .eq("id", id)
    .eq("status", "pending")
    .single();

  if (fetchError || !staged) {
    return NextResponse.json(
      { error: "Staged update not found or already processed" },
      { status: 404 }
    );
  }

  const proposed = staged.proposed_data as Record<string, unknown>;

  try {
    switch (staged.action) {
      case "create": {
        // Insert new resource
        const { timelines, ...resourceData } = proposed;
        const { error: insertError } = await supabase
          .from("resources")
          .insert(resourceData);

        if (insertError) throw insertError;

        // Insert timelines if present
        if (Array.isArray(timelines) && timelines.length > 0) {
          const timelineRows = (timelines as { date: string; label: string }[]).map((t, i) => ({
            resource_id: (resourceData as Record<string, unknown>).id,
            date: t.date,
            label: t.label,
            sort_order: i,
          }));
          await supabase.from("timelines").insert(timelineRows);
        }

        // Record changelog
        await supabase.from("changelog").insert({
          resource_id: (resourceData as Record<string, unknown>).id,
          type: "NEW",
          date: new Date().toISOString().slice(0, 10),
        });
        break;
      }

      case "update": {
        const changes = (proposed.changes || []) as {
          field: string;
          prev: string;
          now: string;
          impact?: string;
        }[];
        const resourceUpdates = proposed.resource_updates as Record<string, unknown> | undefined;

        // Record changelog entries
        for (const change of changes) {
          await supabase.from("changelog").insert({
            resource_id: staged.resource_id,
            type: "UPDATED",
            fields: [change.field],
            prev_value: change.prev,
            now_value: change.now,
            impact: change.impact || null,
            date: new Date().toISOString().slice(0, 10),
          });
        }

        // Apply resource updates
        if (resourceUpdates && staged.resource_id) {
          await supabase
            .from("resources")
            .update({
              ...resourceUpdates,
              modified_date: new Date().toISOString().slice(0, 10),
              updated_at: new Date().toISOString(),
            })
            .eq("id", staged.resource_id);
        }
        break;
      }

      case "archive": {
        if (!staged.resource_id) throw new Error("resource_id required for archive");

        await supabase
          .from("resources")
          .update({
            is_archived: true,
            archived_date: new Date().toISOString().slice(0, 10),
            archive_reason: (proposed.reason as string) || "Manual",
            archive_note: (proposed.note as string) || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", staged.resource_id);
        break;
      }

      case "new_source": {
        const { error: sourceError } = await supabase
          .from("source_registry")
          .insert(proposed);

        if (sourceError) throw sourceError;
        break;
      }

      case "dispute": {
        if (!staged.resource_id) throw new Error("resource_id required for dispute");

        const { error: disputeError } = await supabase
          .from("disputes")
          .insert({
            resource_id: staged.resource_id,
            note: proposed.note,
            sources: proposed.sources || [],
            active: true,
          });

        if (disputeError) throw disputeError;
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${staged.action}` },
          { status: 400 }
        );
    }

    // Mark as approved
    await supabase
      .from("staged_updates")
      .update({
        status: "approved",
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({
      data: { id, action: staged.action, status: "approved" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to apply update: ${message}` },
      { status: 500 }
    );
  }
}
