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
import { getServiceSupabase } from "@/lib/supabase-service";

import { requireAuth, isAuthError } from "@/lib/api/auth";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { canonicalizeUrl } from "@/lib/sources/url-canonicalize";
import { classifySourceRole } from "@/lib/sources/classify-source-role";
import { checkVerticalFitGate } from "@/lib/sources/vertical-fit-gate";


interface PromoteBody {
  provisionalSourceId: string;
  decision: "approve" | "reject" | "defer";
  // F8 (Sprint Architecture): clients send assignedTier; legacy tier accepted
  // as fallback during F8 rollout window. Both map to base_tier + effective_tier
  // dual-write on the new sources row per the Day 1 invariant.
  assignedTier?: number;
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

  const supabase = getServiceSupabase();

  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

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
    // F8 (Sprint Architecture): client sends tier via body.assignedTier (semantically-named,
    // not schema-shaped). Legacy body.tier fallback during F8 rollout window.
    const assignedTier = body.assignedTier ?? body.tier;
    if (!assignedTier || assignedTier < 1 || assignedTier > 7) {
      return NextResponse.json(
        { error: "assignedTier (1-7) is required for approve" },
        { status: 400 }
      );
    }

    // Q10 DEDUP GUARD — seals the promote bypass (defect (a) of the source-layer fix).
    // promote previously canonicalized the URL then inserted BLINDLY, with no existence
    // check, so promoting the same provisional twice (or a URL another path already
    // registered) minted a DUPLICATE source (e.g. MIT Climate Machine x2, identical URL).
    // Robust resolve (bulk-approve philosophy): stored URLs may be legacy-non-canonical, so
    // compare CANONICALLY in JS rather than a raw .eq that would miss them. Narrow candidates
    // to the host, then canonicalize-compare. If a row matches, reuse it and mark the
    // provisional promoted-to it — never create a second row.
    const canonUrl = canonicalizeUrl(prov.url);
    let canonHost = "";
    try { canonHost = new URL(canonUrl).host; } catch { /* non-URL provisional URL */ }
    const { data: hostMatches } = canonHost
      ? await supabase.from("sources").select("id, url").ilike("url", `%${canonHost}%`)
      : { data: [] };
    const existingSource = (hostMatches || []).find((s) => canonicalizeUrl(s.url) === canonUrl) || null;
    if (existingSource) {
      await supabase
        .from("provisional_sources")
        .update({
          status: "promoted",
          promoted_to_source_id: existingSource.id,
          reviewed_at: now,
          reviewer_notes:
            `${body.reviewerNotes || ""} [reused existing source ${existingSource.id.slice(0, 8)} — canonical URL already in registry; no duplicate created]`.trim(),
        })
        .eq("id", body.provisionalSourceId);
      return NextResponse.json(
        {
          ok: true,
          sourceId: existingSource.id,
          reused: true,
          message: "Canonical URL already in registry — reused existing source; no duplicate created.",
        },
        { headers: rateLimitHeaders(auth.userId) }
      );
    }

    // Vertical-fit GATE: block re-adding a source whose host was deliberately retired as
    // off-vertical (the negative list). Legislatures are otherwise kept by default.
    const gate = await checkVerticalFitGate(supabase, { name: prov.name, url: canonUrl });
    if (!gate.allow) {
      return NextResponse.json(
        { ok: false, error: `vertical-fit gate: ${gate.reason}`, requiresReauthorization: true },
        { status: 422, headers: rateLimitHeaders(auth.userId) }
      );
    }

    // Build the new source row from the provisional record + reviewer fields.
    // source_role = WHAT the entity is (classified from name+url). category +
    // intelligence_types DERIVE from it via the migration-123 trigger, so they are NOT set here
    // (the old hardcoded intelligence_types:['GUIDE'] placeholder is gone — the trigger overrides).
    const newSource = {
      name: prov.name,
      url: canonUrl,
      source_role: classifySourceRole(prov.name, canonUrl),
      description: prov.description || "",
      // Phase 1.5: Q2 split. base_tier = operator promotion choice;
      // effective_tier initialized equal per Day 1 invariant.
      base_tier: assignedTier,
      effective_tier: assignedTier,
      tier_at_creation: assignedTier,
      domains: body.domains || [],
      jurisdictions: body.jurisdictions || [],
      transport_modes: body.transport_modes || [],
      topic_tags: body.topic_tags || [],
      access_method: "scrape", // sane default; route handler decides per source later
      status: "active",
      update_frequency: "weekly",
      intelligence_types: [] as string[], // derived by the migration-123 trigger from category; never hardcoded
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
          tier: body.assignedTier ?? body.tier,
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
