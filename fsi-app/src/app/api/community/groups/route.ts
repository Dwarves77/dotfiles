// POST /api/community/groups
//
// Create a member-owned VERTICAL group — a community space that cuts across
// regions by cargo vertical (fine art, live events, automotive…), the §7
// "vertical groups … form when members create them" backend. Body:
//   { name, vertical, description? }
//
// Vertical groups are created cross-regional (region = 'GLOBAL') and public
// (the platform exists to break freight information-isolation — caros-ledge-
// platform-intent §COMMUNITY). `vertical` must be a canonical sector id from
// ALL_SECTORS (constants.ts) — validated here at the application layer, matching
// the free-text posture of the vertical column (migration 155, no CHECK).
//
// RLS + auth boundary:
//   * The group row is inserted through the caller's RLS-aware client, so the
//     migration-028 policy (owner_user_id = auth.uid()) is the auth boundary —
//     a caller can only create a group they own.
//   * The owner's bootstrap membership row (role 'admin') is inserted with a
//     service-role client AFTER the group insert succeeds, because the members
//     INSERT policy is admin-only by design (migration 029) and no admin exists
//     at creation time. This is the same validate-then-materialize shape the
//     signoff-decide and post-promote routes use — a downstream effect of an
//     already-authorized action, not a second authorization path. If the
//     membership bootstrap fails, the orphan group is deleted (best-effort).
//
// Auth: cookie session via requireCommunityAuth. Rate limit: standard 60/min.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireCommunityAuth,
  isCommunityAuthError,
} from "@/lib/api/community-auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { ALL_SECTORS } from "@/lib/constants";

const MAX_NAME_LEN = 120;
const MAX_DESC_LEN = 1000;

const SECTOR_IDS = new Set(ALL_SECTORS.map((s) => s.id));

const SELECT_COLS =
  "id, name, slug, region, privacy, owner_user_id, description, vertical, member_count, weekly_post_count, last_active_at, created_at";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** kebab-case a display name into a slug fragment (ascii, hyphen-joined). */
function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function POST(request: NextRequest) {
  const auth = await requireCommunityAuth(request);
  if (isCommunityAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  let body: { name?: string; vertical?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body?.name ?? "").trim();
  const vertical = (body?.vertical ?? "").trim();
  const description = (body?.description ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (name.length > MAX_NAME_LEN) {
    return NextResponse.json(
      { error: `name must be ${MAX_NAME_LEN} characters or fewer` },
      { status: 400 }
    );
  }
  if (!vertical || !SECTOR_IDS.has(vertical)) {
    return NextResponse.json(
      { error: "vertical must be a known cargo-vertical sector id" },
      { status: 400 }
    );
  }
  if (description.length > MAX_DESC_LEN) {
    return NextResponse.json(
      { error: `description must be ${MAX_DESC_LEN} characters or fewer` },
      { status: 400 }
    );
  }

  const nameFrag = slugifyName(name) || "group";

  // Insert the group through the caller's RLS client (policy validates
  // owner_user_id = auth.uid()). Slug collisions retry with a fresh suffix.
  let group: Record<string, unknown> | null = null;
  let lastErr: { code?: string; message?: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const suffix = Math.random().toString(36).slice(2, 7);
    const slug = `grp-${vertical}-${nameFrag}-${suffix}`.slice(0, 80);
    const { data, error } = await auth.supabase
      .from("community_groups")
      .insert({
        name,
        slug,
        region: "GLOBAL",
        privacy: "public",
        owner_user_id: auth.userId,
        vertical,
        description: description || null,
      })
      .select(SELECT_COLS)
      .maybeSingle();

    if (!error && data) {
      group = data as Record<string, unknown>;
      break;
    }
    lastErr = error ?? null;
    // 23505 = unique_violation (slug clash) — retry with a new suffix.
    if (error && error.code !== "23505") break;
  }

  if (!group) {
    if (lastErr?.code === "42501" || lastErr?.code === "PGRST301") {
      return NextResponse.json(
        { error: "Not authorized to create a group" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: lastErr?.message ?? "Could not create the group" },
      { status: 500 }
    );
  }

  // Bootstrap the owner's admin membership row via service-role (members INSERT
  // is admin-only; no admin exists yet). On failure, remove the orphan group.
  const service = getServiceClient();
  const { error: memberErr } = await service
    .from("community_group_members")
    .insert({
      group_id: group.id as string,
      user_id: auth.userId,
      role: "admin",
    });

  if (memberErr) {
    await service.from("community_groups").delete().eq("id", group.id as string);
    return NextResponse.json(
      { error: "Could not attach you to the new group; creation rolled back" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { group },
    { status: 201, headers: rateLimitHeaders(auth.userId) }
  );
}
