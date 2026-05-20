// POST /api/admin/canonical-sources/decide
//
// Decision flow for a canonical_source_candidates row. Three decisions:
//
//   approve →
//     a. If candidate URL not already in sources registry, INSERT a new
//        sources row using reviewer-supplied tier/domains/jurisdictions/
//        transport_modes/topic_tags (typically pre-filled by Haiku
//        classification but editable). The new source is created with
//        status='active', admin_only=false, access_method='scrape'.
//        A source_trust_events audit row records the promotion.
//     b. If candidate URL already in sources registry, skip creation —
//        existingSourceId is supplied in the body and reused.
//     c. UPDATE intelligence_items.source_id to the resolved source UUID
//        AND intelligence_items.source_url to the candidate URL (keep
//        the column denormalized for legacy display paths).
//     d. UPDATE canonical_source_candidates SET decision='approved',
//        promoted_to_source_id, reviewer_id, reviewed_at, reviewer_notes.
//
//   reject →
//     UPDATE the candidate row SET decision='rejected', reviewer fields.
//     The intelligence_items row is not touched. Other candidates for the
//     same item remain pending.
//
//   defer →
//     UPDATE reviewer_notes + reviewed_at. decision stays 'pending'. Used
//     when reviewer wants to flag for re-review later.
//
// Auth: requireAuth (any authenticated user — admin gating is via the
// /admin route's middleware and the AuthProvider's role check). Rate
// limited.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { canonicalizeUrl } from "@/lib/sources/url-canonicalize";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface DecideBody {
  candidateId: string;
  decision: "approve" | "reject" | "defer";
  // Approve-only fields. existingSourceId, when present, skips new-source
  // insert and reuses the pre-existing sources row matching the URL.
  existingSourceId?: string | null;
  // Editable candidate fields (allows reviewer to fix typos in URL/title
  // before approving). When present, overwrite candidate columns first
  // before the approve flow continues.
  editedFields?: {
    candidate_url?: string;
    candidate_title?: string;
    candidate_publisher?: string;
  };
  // Classification (used only when creating a new source)
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

  let body: DecideBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.candidateId || !body.decision) {
    return NextResponse.json(
      { error: "candidateId and decision are required" },
      { status: 400 }
    );
  }
  if (!["approve", "reject", "defer"].includes(body.decision)) {
    return NextResponse.json(
      { error: "decision must be approve, reject, or defer" },
      { status: 400 }
    );
  }

  const supabase = getServiceClient();

  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const now = new Date().toISOString();

  const { data: cand, error: loadErr } = await supabase
    .from("canonical_source_candidates")
    .select("*")
    .eq("id", body.candidateId)
    .single();

  if (loadErr || !cand) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  // Apply edited fields to the candidate row before any other action.
  if (body.editedFields && Object.keys(body.editedFields).length > 0) {
    const editPayload: Record<string, any> = {};
    for (const k of ["candidate_url", "candidate_title", "candidate_publisher"] as const) {
      if (body.editedFields[k] !== undefined) {
        // Q10: canonicalize the edited URL so the candidate row stores the
        // canonical form, matching the convention used by the sources
        // registry after migration 087.
        editPayload[k] = k === "candidate_url"
          ? canonicalizeUrl(body.editedFields[k] as string)
          : body.editedFields[k];
      }
    }
    if (Object.keys(editPayload).length > 0) {
      const { error: editErr } = await supabase
        .from("canonical_source_candidates")
        .update(editPayload)
        .eq("id", body.candidateId);
      if (editErr) {
        return NextResponse.json(
          { error: `Failed to save edits: ${editErr.message}` },
          { status: 500 }
        );
      }
      // Reflect edits locally for the rest of this handler
      Object.assign(cand, editPayload);
    }
  }

  // ─── REJECT ───
  if (body.decision === "reject") {
    const { error: updErr } = await supabase
      .from("canonical_source_candidates")
      .update({
        decision: "rejected",
        reviewer_id: auth.userId,
        reviewed_at: now,
        reviewer_notes: body.reviewerNotes || null,
        reviewed: true,
      })
      .eq("id", body.candidateId);
    if (updErr) {
      return NextResponse.json(
        { error: `Failed to mark rejected: ${updErr.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { success: true, action: "reject", itemId: cand.intelligence_item_id, candidateId: body.candidateId },
      { headers: rateLimitHeaders(auth.userId) }
    );
  }

  // ─── DEFER ───
  if (body.decision === "defer") {
    const { error: updErr } = await supabase
      .from("canonical_source_candidates")
      .update({
        reviewer_id: auth.userId,
        reviewed_at: now,
        reviewer_notes: body.reviewerNotes || null,
        // decision stays 'pending'; reviewed flag false to keep it surfacing
      })
      .eq("id", body.candidateId);
    if (updErr) {
      return NextResponse.json(
        { error: `Failed to defer: ${updErr.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { success: true, action: "defer", itemId: cand.intelligence_item_id, candidateId: body.candidateId },
      { headers: rateLimitHeaders(auth.userId) }
    );
  }

  // ─── APPROVE ───
  // Resolve target sourceId: either an existing one or a new insert.
  let sourceId: string | null = body.existingSourceId || null;
  let createdSource = false;

  if (!sourceId) {
    // No existing source for this URL — create one.
    // F8 (Sprint Architecture): client sends operator-chosen tier value via
    // body.assignedTier (semantically-named, not schema-shaped). Fallback to
    // legacy body.tier for any client that hasn't migrated yet (deprecation
    // window during F8 rollout; remove the fallback once F8 catches all callers).
    const assignedTier = body.assignedTier ?? body.tier;
    if (!assignedTier || assignedTier < 1 || assignedTier > 7) {
      return NextResponse.json(
        { error: "assignedTier (1-7) is required when creating a new source" },
        { status: 400 }
      );
    }
    const newSource = {
      name: cand.candidate_publisher || cand.candidate_title || cand.candidate_url,
      url: canonicalizeUrl(cand.candidate_url),
      description: cand.candidate_title || "",
      // Phase 1.5: Q2 split. base_tier = operator-selected classifier value;
      // effective_tier initialized equal per Day 1 invariant (Q7 batch
      // converges effective_tier over time). tier_at_creation preserved.
      base_tier: assignedTier,
      effective_tier: assignedTier,
      tier_at_creation: assignedTier,
      domains: body.domains || [],
      jurisdictions: body.jurisdictions || [],
      transport_modes: body.transport_modes || [],
      topic_tags: body.topic_tags || [],
      access_method: "scrape" as const,
      status: "active" as const,
      update_frequency: "weekly" as const,
      intelligence_types: ["GUIDE"],
      vertical_tags: [] as string[],
      notes:
        `Promoted from canonical_source_candidates 2026-04-28 by reviewer ${auth.userId.slice(0, 8)}. ` +
        `Issue: ${cand.issue_classification}. Confidence: ${cand.confidence}. ${body.reviewerNotes || ""}`.trim(),
    };
    const { data: inserted, error: insErr } = await supabase
      .from("sources")
      .insert(newSource)
      .select("id")
      .single();
    if (insErr || !inserted) {
      return NextResponse.json(
        { error: `Failed to insert source: ${insErr?.message}` },
        { status: 500 }
      );
    }
    sourceId = inserted.id;
    createdSource = true;

    await supabase.from("source_trust_events").insert({
      source_id: sourceId,
      event_type: "manual_review",
      details: {
        decision: "approve",
        reviewerNotes: body.reviewerNotes || null,
        provenance: "canonical_source_candidate",
        candidateId: body.candidateId,
        intelligenceItemId: cand.intelligence_item_id,
        classification: {
          tier: body.assignedTier ?? body.tier,
          domains: body.domains,
          jurisdictions: body.jurisdictions,
          transport_modes: body.transport_modes,
          topic_tags: body.topic_tags,
        },
      },
      created_by: "human",
      reviewer_id: auth.userId,
    });
  }

  // Update intelligence_items to point at the resolved source. Q10:
  // canonicalize source_url so the denormalised cache stays in sync with
  // the canonicalized sources.url (otherwise `.eq("source_url", source.url)`
  // queries in other routes would silently miss this row).
  const { error: itemUpdErr } = await supabase
    .from("intelligence_items")
    .update({
      source_id: sourceId,
      source_url: canonicalizeUrl(cand.candidate_url),
      updated_at: now,
    })
    .eq("id", cand.intelligence_item_id);
  if (itemUpdErr) {
    return NextResponse.json(
      { error: `Failed to update intelligence_items.source_id: ${itemUpdErr.message}` },
      { status: 500 }
    );
  }

  // Mark candidate approved
  const { error: candUpdErr } = await supabase
    .from("canonical_source_candidates")
    .update({
      decision: "approved",
      promoted_to_source_id: sourceId,
      reviewer_id: auth.userId,
      reviewed_at: now,
      reviewer_notes: body.reviewerNotes || null,
      reviewed: true,
    })
    .eq("id", body.candidateId);
  if (candUpdErr) {
    console.warn("Candidate approve update failed after source/item writes:", candUpdErr.message);
  }

  return NextResponse.json(
    {
      success: true,
      action: "approve",
      itemId: cand.intelligence_item_id,
      candidateId: body.candidateId,
      sourceId,
      createdSource,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
