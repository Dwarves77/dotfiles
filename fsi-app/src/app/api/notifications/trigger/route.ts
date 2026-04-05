import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/notifications/trigger
 *
 * Notification dispatcher. Called when intelligence items change,
 * new threads are posted, vendors are endorsed, or case studies are validated.
 *
 * This replaces the Edge Function approach — runs as a standard API route
 * that can be called by database webhooks or the monitoring worker.
 */

const WORKER_SECRET = process.env.WORKER_SECRET || "dev-worker-secret";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-worker-secret");
  if (secret !== WORKER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { event_type, source_table, source_id, payload } = await request.json();

    if (!event_type || !source_table || !source_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Create the notification event
    const { data: event, error: eventErr } = await supabase
      .from("notification_events")
      .insert({
        event_type,
        source_table,
        source_id,
        payload: payload || {},
      })
      .select("id")
      .single();

    if (eventErr) {
      return NextResponse.json({ error: eventErr.message }, { status: 500 });
    }

    // Find subscribers based on event type
    let subscribers: { user_id: string; channels: string[] }[] = [];

    if (event_type === "regulation_updated" && payload?.topic_tags) {
      // Find users subscribed to matching topics or the specific regulation
      const { data } = await supabase
        .from("notification_subscriptions")
        .select("user_id, channels")
        .or(`target_id.eq.${source_id},subscription_type.eq.topic`);
      subscribers = data || [];
    } else if (event_type === "new_thread") {
      // Find users subscribed to the forum section or topic
      const { data } = await supabase
        .from("notification_subscriptions")
        .select("user_id, channels")
        .eq("subscription_type", "thread");
      subscribers = data || [];
    } else if (event_type === "vendor_endorsed" || event_type === "case_study_validated") {
      // Notify the vendor/case study owner
      const { data } = await supabase
        .from("notification_subscriptions")
        .select("user_id, channels")
        .eq("target_id", source_id);
      subscribers = data || [];
    }

    // Create delivery records
    if (subscribers.length > 0) {
      const deliveries = subscribers.map((sub) => ({
        event_id: event.id,
        user_id: sub.user_id,
        channel: "in_app",
        status: "pending",
      }));

      await supabase.from("notification_deliveries").insert(deliveries);
    }

    return NextResponse.json({
      success: true,
      event_id: event.id,
      subscribers_notified: subscribers.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
