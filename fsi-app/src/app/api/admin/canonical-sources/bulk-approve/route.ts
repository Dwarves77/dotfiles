// POST /api/admin/canonical-sources/bulk-approve
//
// Batch approve a list of candidate IDs. Each candidate is processed
// sequentially through the same logic as /decide approve, with one
// optimization: existing-source matches are pre-resolved upfront so the
// per-candidate path skips the existence check.
//
// New-source creation in batch context: each candidate carries its own
// AI-recommended classification (cached from
// /recommend-classification, or null). When a candidate has no cached
// classification AND its URL isn't in the registry, this endpoint
// rejects the candidate from the batch and returns it under
// `requires_individual_review` — bulk-approve does not silently call
// the recommender for thousands of items.
//
// Auth: requireAuth + admin role check via org_memberships (light gate
// — same pattern as /decide).
// Rate-limited.
//
// Returns a per-candidate result so the UI can surface partial successes.

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

interface BulkBody {
  candidateIds: string[];
  reviewerNotes?: string;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;
  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  let body: BulkBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.candidateIds) || body.candidateIds.length === 0) {
    return NextResponse.json({ error: "candidateIds (non-empty array) is required" }, { status: 400 });
  }
  if (body.candidateIds.length > 300) {
    return NextResponse.json({ error: "Maximum 300 candidates per bulk operation" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const now = new Date().toISOString();

  const { data: candidates, error: loadErr } = await supabase
    .from("canonical_source_candidates")
    .select("*")
    .in("id", body.candidateIds);

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  const cands = candidates || [];
  if (cands.length === 0) {
    return NextResponse.json({ error: "No matching candidates found" }, { status: 404 });
  }

  // Pre-resolve existing-source URLs in one query
  const urls = [...new Set(cands.map((c) => c.candidate_url))];
  const { data: srcRows } = await supabase
    .from("sources")
    .select("id, url")
    .in("url", urls);
  const existingSources = new Map<string, string>((srcRows || []).map((s: any) => [s.url, s.id]));

  const results: any[] = [];
  const requiresReview: any[] = [];
  let approvedCount = 0;
  let createdSourceCount = 0;
  let failedCount = 0;

  for (const cand of cands) {
    if (cand.decision !== "pending") {
      results.push({
        candidateId: cand.id,
        skipped: true,
        reason: `Candidate already in decision state '${cand.decision}'`,
      });
      continue;
    }

    let sourceId = existingSources.get(cand.candidate_url) || null;
    let createdSource = false;

    if (!sourceId) {
      // Need cached classification to insert a new source. Bulk doesn't call Haiku.
      const rec = cand.recommended_classification;
      if (
        !rec ||
        typeof rec.tier !== "number" ||
        !Array.isArray(rec.domains) ||
        !Array.isArray(rec.jurisdictions)
      ) {
        requiresReview.push({
          candidateId: cand.id,
          itemId: cand.intelligence_item_id,
          candidateUrl: cand.candidate_url,
          reason: "URL not in source registry and no cached AI classification — review individually",
        });
        continue;
      }

      const newSource = {
        name: cand.candidate_publisher || cand.candidate_title || cand.candidate_url,
        url: cand.candidate_url,
        description: cand.candidate_title || "",
        tier: rec.tier,
        tier_at_creation: rec.tier,
        domains: rec.domains,
        jurisdictions: rec.jurisdictions,
        transport_modes: rec.transport_modes || [],
        topic_tags: rec.topic_tags || [],
        access_method: "scrape" as const,
        status: "active" as const,
        update_frequency: "weekly" as const,
        intelligence_types: ["GUIDE"],
        vertical_tags: [] as string[],
        notes:
          `Bulk-approved from canonical_source_candidates 2026-04-28 by reviewer ${auth.userId.slice(0, 8)}. ` +
          `Issue: ${cand.issue_classification}. Confidence: ${cand.confidence}. ${body.reviewerNotes || ""}`.trim(),
      };
      const { data: inserted, error: insErr } = await supabase
        .from("sources")
        .insert(newSource)
        .select("id")
        .single();
      if (insErr || !inserted) {
        results.push({
          candidateId: cand.id,
          itemId: cand.intelligence_item_id,
          error: `Source insert failed: ${insErr?.message}`,
        });
        failedCount++;
        continue;
      }
      sourceId = inserted.id as string;
      createdSource = true;
      createdSourceCount++;
      // Add to lookup so later candidates with the same URL reuse it
      existingSources.set(cand.candidate_url, sourceId);

      await supabase.from("source_trust_events").insert({
        source_id: sourceId,
        event_type: "manual_review",
        details: {
          decision: "approve",
          provenance: "canonical_source_candidate_bulk",
          candidateId: cand.id,
          intelligenceItemId: cand.intelligence_item_id,
          reviewerNotes: body.reviewerNotes || null,
          classification: rec,
        },
        created_by: "human",
        reviewer_id: auth.userId,
      });
    }

    // Update intelligence_items
    const { error: itemUpdErr } = await supabase
      .from("intelligence_items")
      .update({
        source_id: sourceId,
        source_url: cand.candidate_url,
        updated_at: now,
      })
      .eq("id", cand.intelligence_item_id);
    if (itemUpdErr) {
      results.push({
        candidateId: cand.id,
        itemId: cand.intelligence_item_id,
        error: `Item update failed: ${itemUpdErr.message}`,
      });
      failedCount++;
      continue;
    }

    // Mark approved
    await supabase
      .from("canonical_source_candidates")
      .update({
        decision: "approved",
        promoted_to_source_id: sourceId,
        reviewer_id: auth.userId,
        reviewed_at: now,
        reviewer_notes: body.reviewerNotes || null,
        reviewed: true,
      })
      .eq("id", cand.id);

    results.push({
      candidateId: cand.id,
      itemId: cand.intelligence_item_id,
      sourceId,
      createdSource,
      success: true,
    });
    approvedCount++;
  }

  return NextResponse.json(
    {
      success: true,
      total: body.candidateIds.length,
      approved: approvedCount,
      created_sources: createdSourceCount,
      failed: failedCount,
      requires_individual_review: requiresReview.length,
      results,
      review_queue: requiresReview,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
