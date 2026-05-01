// POST /api/admin/sources/promote
//
// Decision flow for a row in provisional_sources. Three decisions:
//   approve → INSERT into sources copying name/url/description, applying
//             reviewer-provided tier/domains/jurisdictions/transport_modes/
//             topic_tags. UPDATE provisional row to status='promoted',
//             populate promoted_to_source_id, reviewed_at, reviewer_notes.
//             Write a source_trust_events audit row.
//   reject  → UPDATE provisional row to status='rejected', reviewed_at,
//             reviewer_notes. Write a source_trust_events audit row
//             (source_id null since no source was created).
//   defer   → UPDATE provisional row reviewer_notes + reviewed_at; status
//             stays 'pending_review'. No audit event (deferral is a
//             non-decision and doesn't affect trust history).

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

interface PromoteBody {
  provisionalSourceId: string;
  decision: "approve" | "reject" | "defer";
  tier?: number;
  domains?: number[];
  jurisdictions?: string[];
  transport_modes?: string[];
  topic_tags?: string[];
  reviewerNotes?: string;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  let body: PromoteBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.provisionalSourceId || !body.decision) {
    return NextResponse.json(
      { error: "provisionalSourceId and decision are required" },
      { status: 400 }
    );
  }
  if (!["approve", "reject", "defer"].includes(body.decision)) {
    return NextResponse.json(
      { error: "decision must be one of: approve, reject, defer" },
      { status: 400 }
    );
  }

  const supabase = getServiceClient();

  // Load the provisional row
  const { data: prov, error: loadErr } = await supabase
    .from("provisional_sources")
    .select("*")
    .eq("id", body.provisionalSourceId)
    .single();

  if (loadErr || !prov) {
    return NextResponse.json(
      { error: "Provisional source not found" },
      { status: 404 }
    );
  }

  const now = new Date().toISOString();

  if (body.decision === "approve") {
    if (!body.tier || body.tier < 1 || body.tier > 7) {
      return NextResponse.json(
        { error: "tier (1-7) is required for approve" },
        { status: 400 }
      );
    }

    // Build the new source row from the provisional record + reviewer fields.
    const newSource = {
      name: prov.name,
      url: prov.url,
      description: prov.description || "",
      tier: body.tier,
      tier_at_creation: body.tier,
      domains: body.domains || [],
      jurisdictions: body.jurisdictions || [],
      transport_modes: body.transport_modes || [],
      topic_tags: body.topic_tags || [],
      access_method: "scrape", // sane default; route handler decides per source later
      status: "active",
      update_frequency: "weekly",
      intelligence_types: ["GUIDE"],
      vertical_tags: [],
      notes:
        `Promoted from provisional 2026-04-28 by reviewer ${auth.userId.slice(0, 8)}. ` +
        `Discovered via ${prov.discovered_via}. ${body.reviewerNotes || ""}`.trim(),
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("sources")
      .insert(newSource)
      .select("id")
      .single();

    if (insertErr || !inserted) {
      return NextResponse.json(
        { error: `Failed to insert source: ${insertErr?.message}` },
        { status: 500 }
      );
    }

    // Mark provisional as promoted
    const { error: updateErr } = await supabase
      .from("provisional_sources")
      .update({
        status: "promoted",
        promoted_to_source_id: inserted.id,
        reviewed_at: now,
        reviewer_notes: body.reviewerNotes || "",
      })
      .eq("id", body.provisionalSourceId);

    if (updateErr) {
      // Source was inserted; best-effort log but return success since the
      // promotion did happen.
      console.warn("Provisional update failed after source insert:", updateErr.message);
    }

    // Audit trail
    await supabase.from("source_trust_events").insert({
      source_id: inserted.id,
      event_type: "manual_review",
      details: {
        decision: "approve",
        reviewerNotes: body.reviewerNotes || null,
        classification: {
          tier: body.tier,
          domains: body.domains,
          jurisdictions: body.jurisdictions,
          transport_modes: body.transport_modes,
          topic_tags: body.topic_tags,
        },
        provisionalSourceId: body.provisionalSourceId,
      },
      created_by: "human",
      reviewer_id: auth.userId,
    });

    return NextResponse.json(
      {
        success: true,
        decision: "approve",
        sourceId: inserted.id,
      },
      { headers: rateLimitHeaders(auth.userId) }
    );
  }

  if (body.decision === "reject") {
    const { error: updateErr } = await supabase
      .from("provisional_sources")
      .update({
        status: "rejected",
        reviewed_at: now,
        reviewer_notes: body.reviewerNotes || "",
      })
      .eq("id", body.provisionalSourceId);

    if (updateErr) {
      return NextResponse.json(
        { error: `Failed to mark rejected: ${updateErr.message}` },
        { status: 500 }
      );
    }

    await supabase.from("source_trust_events").insert({
      source_id: null,
      event_type: "manual_review",
      details: {
        decision: "reject",
        reviewerNotes: body.reviewerNotes || null,
        provisionalSourceId: body.provisionalSourceId,
        provisionalName: prov.name,
        provisionalUrl: prov.url,
      },
      created_by: "human",
      reviewer_id: auth.userId,
    });

    return NextResponse.json(
      { success: true, decision: "reject" },
      { headers: rateLimitHeaders(auth.userId) }
    );
  }

  // defer
  const { error: deferErr } = await supabase
    .from("provisional_sources")
    .update({
      reviewed_at: now,
      reviewer_notes: body.reviewerNotes || "",
    })
    .eq("id", body.provisionalSourceId);

  if (deferErr) {
    return NextResponse.json(
      { error: `Failed to defer: ${deferErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { success: true, decision: "defer" },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
