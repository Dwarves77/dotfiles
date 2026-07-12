// GET /api/admin/canonical-sources/pending
//
// Returns all canonical_source_candidates rows where decision='pending',
// joined with their parent intelligence_item, grouped by item, sorted by:
//   1. issue severity (stale_url > missing_link > missing_source)
//   2. confidence (high > medium > low) within an item's candidate list
//   3. item title alphabetical for stable display
//
// Read-only. Auth required. Rate-limited.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";

import { requireAuth, isAuthError } from "@/lib/api/auth";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { canonicalizeUrl } from "@/lib/sources/url-canonicalize";


const ISSUE_RANK: Record<string, number> = {
  stale_url: 0,
  missing_link: 1,
  missing_source: 2,
  thin_match: 3,
};
const CONFIDENCE_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;
  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const supabase = getServiceSupabase();

  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

  const { data: candidates, error } = await supabase
    .from("canonical_source_candidates")
    .select("*")
    .eq("decision", "pending");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const itemIds = [...new Set((candidates || []).map((c) => c.intelligence_item_id))];
  let items: any[] = [];
  if (itemIds.length > 0) {
    const { data: itemRows } = await supabase
      .from("intelligence_items")
      .select("id, legacy_id, title, item_type, domain, jurisdictions, topic_tags, source_id, source_url")
      .in("id", itemIds);
    items = itemRows || [];
  }

  // Look up which candidate URLs are already in the sources registry — saves
  // the UI a per-candidate query when deciding whether to show the approve
  // flow's new-source insert step.
  // Q10: canonicalize both sides of the comparison. The lookup map is
  // canonical-keyed so the per-candidate `existingSources.get(canonical(c.candidate_url))`
  // resolves to a hit even when the candidate URL differs in
  // trailing-slash / www-prefix / case from the registered sources.url.
  const candidateUrls = [...new Set((candidates || []).map((c) => canonicalizeUrl(c.candidate_url)))];
  let existingSources = new Map<string, string>(); // canonical-url → source.id
  if (candidateUrls.length > 0) {
    const { data: srcRows } = await supabase
      .from("sources")
      .select("id, url")
      .in("url", candidateUrls);
    existingSources = new Map((srcRows || []).map((s) => [canonicalizeUrl(s.url), s.id]));
  }

  // Group candidates by item
  const grouped: Record<string, any> = {};
  for (const c of candidates || []) {
    const groupKey = c.intelligence_item_id;
    if (!grouped[groupKey]) {
      const item = items.find((i) => i.id === groupKey);
      grouped[groupKey] = {
        item_id: groupKey,
        item: item || null,
        issue_classification: c.issue_classification,
        candidates: [] as any[],
      };
    }
    grouped[groupKey].candidates.push({
      ...c,
      existing_source_id: existingSources.get(canonicalizeUrl(c.candidate_url)) || null,
    });
  }

  // Sort candidates within each group by confidence then verified
  for (const g of Object.values(grouped)) {
    (g as any).candidates.sort((a: any, b: any) => {
      const cmp = (CONFIDENCE_RANK[a.confidence] ?? 9) - (CONFIDENCE_RANK[b.confidence] ?? 9);
      if (cmp !== 0) return cmp;
      // Verified first within same confidence
      return Number(b.verified) - Number(a.verified);
    });
  }

  // Sort groups by issue severity, then by parent item title
  const groups = Object.values(grouped).sort((a: any, b: any) => {
    const cmp = (ISSUE_RANK[a.issue_classification] ?? 9) - (ISSUE_RANK[b.issue_classification] ?? 9);
    if (cmp !== 0) return cmp;
    return (a.item?.title || "").localeCompare(b.item?.title || "");
  });

  // Stats banner
  const total = (candidates || []).length;
  const byConfidence: Record<string, number> = { high: 0, medium: 0, low: 0 };
  const byIssue: Record<string, number> = { stale_url: 0, missing_link: 0, missing_source: 0, thin_match: 0 };
  let highConfVerified = 0;
  let highConfUnverified = 0;
  let medConf = 0;
  let lowConf = 0;
  for (const c of candidates || []) {
    byConfidence[c.confidence] = (byConfidence[c.confidence] || 0) + 1;
    byIssue[c.issue_classification] = (byIssue[c.issue_classification] || 0) + 1;
    if (c.confidence === "high" && c.verified) highConfVerified++;
    else if (c.confidence === "high") highConfUnverified++;
    else if (c.confidence === "medium") medConf++;
    else if (c.confidence === "low") lowConf++;
  }

  return NextResponse.json(
    {
      groups,
      stats: {
        total,
        items: groups.length,
        by_confidence: byConfidence,
        by_issue: byIssue,
        high_conf_verified: highConfVerified,
        high_conf_unverified: highConfUnverified,
        medium: medConf,
        low: lowConf,
      },
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
