import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, isSupabaseConfigured } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/api-auth";

// POST /api/staged/:id/approve — approve a staged update and apply it
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req, "admin");
  if (!auth.ok) return auth.response;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { id } = await params;
  const db = getAdminClient();

  // Fetch the staged update
  const { data: staged, error: fetchError } = await db
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

  const proposed = staged.proposed_data;

  try {
    if (staged.action === "create") {
      // Insert new resource
      const { timelines, ...resourceData } = proposed;
      const { error: insertError } = await db.from("resources").insert(resourceData);
      if (insertError) throw insertError;

      // Insert timelines
      if (timelines?.length) {
        await db.from("timelines").insert(
          timelines.map((t: { date: string; label: string }, i: number) => ({
            resource_id: resourceData.id,
            date: t.date,
            label: t.label,
            sort_order: i,
          }))
        );
      }

      // Add changelog entry
      await db.from("changelog").insert({
        resource_id: resourceData.id,
        date: new Date().toISOString().slice(0, 10),
        type: "NEW",
      });

    } else if (staged.action === "update") {
      // Record changelog entries for each changed field
      if (proposed.changes?.length) {
        for (const change of proposed.changes) {
          await db.from("changelog").insert({
            resource_id: staged.resource_id,
            date: new Date().toISOString().slice(0, 10),
            type: "UPDATED",
            fields: [change.field],
            prev_value: change.prev,
            now_value: change.now,
            impact: change.impact,
            source: staged.source_url,
          });
        }
      }

      // Apply the resource updates
      if (proposed.resource_updates) {
        await db
          .from("resources")
          .update({
            ...proposed.resource_updates,
            modified_date: new Date().toISOString().slice(0, 10),
            updated_at: new Date().toISOString(),
          })
          .eq("id", staged.resource_id);
      }

    } else if (staged.action === "archive") {
      await db
        .from("resources")
        .update({
          is_archived: true,
          archived_date: new Date().toISOString().slice(0, 10),
          archive_reason: proposed.reason,
          archive_note: proposed.note,
          updated_at: new Date().toISOString(),
        })
        .eq("id", staged.resource_id);

    } else if (staged.action === "dispute") {
      await db.from("disputes").insert({
        resource_id: staged.resource_id,
        note: proposed.note,
        sources: proposed.sources || [],
        active: true,
      });

    } else if (staged.action === "new_source") {
      await db.from("source_registry").insert({
        name: proposed.name,
        url: proposed.url,
        region: proposed.region,
        type: proposed.type,
        notes: proposed.notes,
        is_active: true,
      });
    }

    // Mark as approved
    await db
      .from("staged_updates")
      .update({
        status: "approved",
        reviewed_by: auth.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ success: true, action: staged.action });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
