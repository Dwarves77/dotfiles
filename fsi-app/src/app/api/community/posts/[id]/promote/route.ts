// POST /api/community/posts/[id]/promote
//
// Promote a community post to platform intelligence.
//
// Two promotion kinds:
//   * kind='staged' — write to staged_updates (status='pending'), wait for
//     admin review and approval. Any member of the post's group may stage.
//   * kind='direct' — insert directly into intelligence_items. Platform
//     admin only (user_profiles.is_platform_admin = true).
//
// Auth model rationale:
//   - Anyone in a group already has visibility into its posts (per
//     migration 030 RLS), so any group member can flag a post as "worth
//     elevating" by staging it. The platform admin reviews the staged
//     update before it becomes an intelligence_item.
//   - 'direct' bypasses staged_updates and writes straight to the
//     intelligence_items table. This is reserved for platform admins
//     because it skips the human-review gate that the rest of the
//     intelligence pipeline relies on (worker proposes → admin approves).
//
// Idempotency:
//   - One promotion per post. If community_posts.promoted_at IS NOT NULL,
//     return 409 Conflict with the existing promotion id (and the
//     staged_update_id / intelligence_item_id from the prior promotion).
//   - The post_promotions table also has a unique index on (post_id) as
//     defence-in-depth against concurrent requests.
//
// Service-role escape rationale:
//   - intelligence_items.INSERT is service-role only per migration 005
//     (RLS policy `intelligence_items_admin_insert`). For kind='direct'
//     we validate platform-admin status first, then use the service-role
//     client to perform the insert. The validation is done with the
//     caller's RLS-aware client so user_profiles RLS is enforced.
//   - staged_updates.INSERT is also service-role only per migration 005
//     (`staged_updates_admin_write`). Same pattern: validate membership
//     with the caller's client, write with the service client.
//   - post_promotions.INSERT is service-role only per migration 041. The
//     row is the audit trail; it must be written by the same path that
//     performed the upstream insert so the two stay consistent.
//
// Auth: cookie session via requireCommunityAuth.
// Rate limit: standard 60/min/user.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

// ──────────────────────────────────────────────────────────────
// Constants and validators
// ──────────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Closed enum from intelligence_items.item_type CHECK constraint
// (migration 004) plus open vocabulary additions live as project-level
// types; this list is the spec contract for the promote endpoint.
const ITEM_TYPES = [
  "regulation",
  "directive",
  "standard",
  "guidance",
  "framework",
  "technology",
  "innovation",
  "tool",
  "regional_data",
  "market_signal",
  "initiative",
  "research_finding",
] as const;
type ItemType = (typeof ITEM_TYPES)[number];

const PRIORITIES = ["CRITICAL", "HIGH", "MODERATE", "LOW"] as const;
type Priority = (typeof PRIORITIES)[number];

interface IntelligenceItemPayload {
  title: string;
  source_url: string;
  item_type: ItemType;
  jurisdiction_iso?: string[];
  priority?: Priority;
  summary?: string;
}

interface PromoteBody {
  kind: "staged" | "direct";
  intelligence_item: IntelligenceItemPayload;
  notes?: string;
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function validateBody(raw: unknown): PromoteBody | string {
  if (!raw || typeof raw !== "object") return "Invalid JSON body";
  const b = raw as Record<string, unknown>;

  if (b.kind !== "staged" && b.kind !== "direct") {
    return "kind must be 'staged' or 'direct'";
  }

  if (!b.intelligence_item || typeof b.intelligence_item !== "object") {
    return "intelligence_item is required";
  }
  const ii = b.intelligence_item as Record<string, unknown>;

  if (typeof ii.title !== "string" || ii.title.trim().length === 0) {
    return "intelligence_item.title is required";
  }
  if (typeof ii.source_url !== "string" || !isHttpUrl(ii.source_url)) {
    return "intelligence_item.source_url must be an http(s) URL";
  }
  if (
    typeof ii.item_type !== "string" ||
    !ITEM_TYPES.includes(ii.item_type as ItemType)
  ) {
    return `intelligence_item.item_type must be one of: ${ITEM_TYPES.join(", ")}`;
  }
  if (
    ii.priority !== undefined &&
    (typeof ii.priority !== "string" ||
      !PRIORITIES.includes(ii.priority as Priority))
  ) {
    return `intelligence_item.priority must be one of: ${PRIORITIES.join(", ")}`;
  }
  if (
    ii.jurisdiction_iso !== undefined &&
    (!Array.isArray(ii.jurisdiction_iso) ||
      ii.jurisdiction_iso.some((j) => typeof j !== "string"))
  ) {
    return "intelligence_item.jurisdiction_iso must be a string[]";
  }
  if (ii.summary !== undefined && typeof ii.summary !== "string") {
    return "intelligence_item.summary must be a string";
  }
  if (b.notes !== undefined && typeof b.notes !== "string") {
    return "notes must be a string";
  }

  return {
    kind: b.kind,
    intelligence_item: {
      title: ii.title.trim(),
      source_url: ii.source_url,
      item_type: ii.item_type as ItemType,
      jurisdiction_iso: ii.jurisdiction_iso as string[] | undefined,
      priority: ii.priority as Priority | undefined,
      summary: typeof ii.summary === "string" ? ii.summary : undefined,
    },
    notes: typeof b.notes === "string" ? b.notes : undefined,
  };
}

// ──────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── 1. Auth + rate limit ───────────────────────────────────────
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  // ── 2. Validate post id ───────────────────────────────────────
  const { id: postId } = await params;
  if (!postId || !UUID_RE.test(postId)) {
    return NextResponse.json(
      { error: "Valid post id required" },
      { status: 400 }
    );
  }

  // ── 3. Validate body ──────────────────────────────────────────
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const validated = validateBody(raw);
  if (typeof validated === "string") {
    return NextResponse.json({ error: validated }, { status: 400 });
  }
  const body = validated;

  // ── 4. Fetch post (RLS-aware so non-members of private groups get
  //       the same shape as a missing post — 404). Pull group_id and
  //       current promotion state in one round-trip.
  const { data: post, error: postErr } = await auth.supabase
    .from("community_posts")
    .select("id, group_id, body, parent_post_id, promoted_at")
    .eq("id", postId)
    .maybeSingle();

  if (postErr) {
    return NextResponse.json({ error: postErr.message }, { status: 500 });
  }
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  // ── 5. Idempotency — return 409 with the existing promotion's IDs.
  if (post.promoted_at) {
    const service = getServiceClient();
    const { data: existing } = await service
      .from("post_promotions")
      .select("id, promotion_kind, staged_update_id, intelligence_item_id, created_at")
      .eq("post_id", postId)
      .maybeSingle();
    return NextResponse.json(
      {
        error: "Post already promoted",
        promotion: existing ?? null,
      },
      { status: 409, headers: rateLimitHeaders(auth.userId) }
    );
  }

  // ── 6. Authorize promotion kind ────────────────────────────────
  // For 'staged': caller must be a member of the post's group.
  // For 'direct': caller must be a platform admin.
  if (body.kind === "staged") {
    const { data: membership, error: memErr } = await auth.supabase
      .from("community_group_members")
      .select("group_id")
      .eq("group_id", post.group_id)
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (memErr) {
      return NextResponse.json({ error: memErr.message }, { status: 500 });
    }
    if (!membership) {
      return NextResponse.json(
        { error: "Group membership required to stage a promotion" },
        { status: 403 }
      );
    }
  } else {
    // body.kind === 'direct'
    // Migrated 2026-05-15 (075 Phase 2): user_profiles -> profiles.
    const { data: profile, error: profErr } = await auth.supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", auth.userId)
      .maybeSingle();
    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }
    if (!profile?.is_platform_admin) {
      return NextResponse.json(
        { error: "Platform admin required for direct promotion" },
        { status: 403 }
      );
    }
  }

  // ── 7. Build the canonical intelligence_item shape. The body of the
  //       community post becomes `summary` when no separate summary was
  //       provided (per spec). source_url is required and validated above.
  const ii = body.intelligence_item;
  const summary =
    ii.summary && ii.summary.trim().length > 0
      ? ii.summary.trim()
      : (post.body ?? "").toString().trim();

  const itemPayload: Record<string, unknown> = {
    title: ii.title,
    summary,
    item_type: ii.item_type,
    source_url: ii.source_url,
    priority: ii.priority ?? "MODERATE",
  };
  if (ii.jurisdiction_iso && ii.jurisdiction_iso.length > 0) {
    // Dual-write during the legacy/ISO transition. Migration 033 added
    // intelligence_items.jurisdiction_iso TEXT[] as the canonical column,
    // but several read paths (FilterBar, scoring, coverage-gaps,
    // briefing/systemPrompt, the dashboard RPCs) still consume the
    // legacy `jurisdictions` column. Write to both until those readers
    // switch and the legacy column can be dropped. Migration 072
    // installs a normalizer trigger so values land in canonical shape
    // regardless of which column the writer targets.
    itemPayload.jurisdiction_iso = ii.jurisdiction_iso;
    itemPayload.jurisdictions = ii.jurisdiction_iso;
  }

  // ── 8. Perform the promotion using the service client (writes to
  //       staged_updates / intelligence_items / post_promotions are all
  //       service-role-only per RLS).
  const service = getServiceClient();

  let stagedUpdateId: string | null = null;
  let intelligenceItemId: string | null = null;

  if (body.kind === "staged") {
    // staged_updates.update_type='new_item' is the canonical marker for
    // a proposed new intelligence_item. proposed_changes carries the
    // payload; the admin queue (Phase D) materializes it on approval.
    const { data: staged, error: stagedErr } = await service
      .from("staged_updates")
      .insert({
        update_type: "new_item",
        proposed_changes: {
          ...itemPayload,
          // Provenance — surfaces in admin review UI and lets the
          // approval handler set community_posts.promoted_to_item_id
          // when the staged row is materialized.
          provenance: {
            kind: "community_post",
            post_id: postId,
            group_id: post.group_id,
            promoted_by: auth.userId,
          },
        },
        reason: body.notes ?? `Promoted from community post ${postId}`,
        source_url: ii.source_url,
        confidence: "MEDIUM",
        status: "pending",
      })
      .select("id")
      .single();
    if (stagedErr) {
      return NextResponse.json(
        { error: `staged_updates insert failed: ${stagedErr.message}` },
        { status: 500 }
      );
    }
    stagedUpdateId = staged.id;
  } else {
    // body.kind === 'direct' — insert into intelligence_items. domain=1
    // (Regulatory & Legislative) is the safe default for community-sourced
    // promotions; the admin can re-classify after the fact via the admin
    // surface. Other required NOT NULL columns get their schema defaults.
    const { data: item, error: itemErr } = await service
      .from("intelligence_items")
      .insert({
        title: itemPayload.title,
        summary: itemPayload.summary,
        item_type: itemPayload.item_type,
        source_url: itemPayload.source_url,
        priority: itemPayload.priority,
        jurisdictions: itemPayload.jurisdictions ?? [],
        domain: 1,
      })
      .select("id")
      .single();
    if (itemErr) {
      return NextResponse.json(
        { error: `intelligence_items insert failed: ${itemErr.message}` },
        { status: 500 }
      );
    }
    intelligenceItemId = item.id;
  }

  // ── 9. Audit row. Same service-role client so a failed insert here
  //       does not leave behind an orphan staged_update / intelligence_item
  //       — the unique index on post_promotions(post_id) guarantees that
  //       at most one of these can ever land. If this insert fails, the
  //       upstream row is orphaned and surfaced via the admin orphan-staged
  //       audit (W1B-orphan-staged-updates.json pipeline).
  const { data: promo, error: promoErr } = await service
    .from("post_promotions")
    .insert({
      post_id: postId,
      promoted_by: auth.userId,
      promotion_kind: body.kind,
      staged_update_id: stagedUpdateId,
      intelligence_item_id: intelligenceItemId,
      notes: body.notes ?? null,
    })
    .select("id")
    .single();

  if (promoErr) {
    return NextResponse.json(
      {
        error: `post_promotions insert failed: ${promoErr.message}`,
        // Surface the upstream id so an admin can reconcile manually.
        staged_update_id: stagedUpdateId,
        intelligence_item_id: intelligenceItemId,
      },
      { status: 500 }
    );
  }

  // ── 10. Stamp the post so the 409 idempotency check fires next time.
  //         For kind='direct' we also link promoted_to_item_id straight
  //         to the new intelligence_item; for kind='staged' the link is
  //         deferred until the staged_update is approved.
  await service
    .from("community_posts")
    .update({
      promoted_at: new Date().toISOString(),
      promoted_to_item_id: intelligenceItemId,
    })
    .eq("id", postId);

  return NextResponse.json(
    {
      promotion_id: promo.id,
      staged_update_id: stagedUpdateId,
      intelligence_item_id: intelligenceItemId,
    },
    { status: 201, headers: rateLimitHeaders(auth.userId) }
  );
}
