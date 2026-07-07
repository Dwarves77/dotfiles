import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { getListingsOnly } from "@/lib/data";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { SystemErrorBanner } from "@/components/ui/SystemErrorBanner";
import {
  CommunityRooms,
  type RoomVM,
  type ThreadVM,
  type RosterMemberVM,
} from "@/components/community/CommunityRooms";
import {
  ROOMS,
  CANONICAL_ROOM_SLUGS,
  roomForJurisdiction,
  homeJurisdictionsInRoom,
  type RoomKey,
} from "@/lib/community/rooms";
import type { Resource } from "@/types/resource";
import { VERTICALS } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * Community — redesign TEMPLATE 11.
 *
 * Binds to "Pages - 11 Community" + community-schema-mapping.md §5. Builds on
 * the newer conversation layer only (community_groups / community_posts /
 * community_group_members / profiles). The "room" is a canonical public
 * community_groups row per region (seeded by scripts/seed-community-regional-
 * rooms.mjs); until that seed runs, the rooms grid renders honest-empty.
 *
 * Everything data-bearing is fail-soft and computed — no mock snapshot numbers
 * are hard-coded. Non-verified intelligence items never reach this surface
 * (getListingsOnly is verified-gated + org-scoped).
 */

const PRIO_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };

/** ISO timestamp 30 days ago — module scope so the render body stays pure. */
function thirtyDaysAgoIso(): string {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

function toneForPriority(p: string | undefined): "critical" | "high" | "moderate" | "low" {
  if (p === "CRITICAL") return "critical";
  if (p === "HIGH") return "high";
  if (p === "MODERATE") return "moderate";
  return "low";
}

/** Route a ledger item to its canonical surface (domains.ts mapping). */
function itemHref(r: Resource): string {
  switch (r.domain) {
    case 1:
      return `/regulations/${encodeURIComponent(r.id)}`;
    case 2:
    case 4:
      return "/market";
    case 3:
    case 6:
      return "/operations";
    case 7:
      return "/research";
    default:
      return "/regulations";
  }
}

const SURFACE_LABEL: Record<number, string> = {
  1: "Regulation",
  2: "Market Intel",
  3: "Operations",
  4: "Market Intel",
  6: "Operations",
  7: "Research",
};

/** Classify a resource to a room via its jurisdiction, then its ISO codes. */
function roomForResource(r: Resource): RoomKey | null {
  const direct = roomForJurisdiction(r.jurisdiction);
  if (direct) return direct;
  for (const iso of r.jurisdictionIso ?? []) {
    const k = roomForJurisdiction(iso);
    if (k) return k;
  }
  return null;
}

function titleCase(s: string): string {
  return s
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Display-name chain: full_name ?? display_name ?? email ?? uuid slice. */
function memberDisplayName(p: {
  full_name?: string | null;
  display_name?: string | null;
  email?: string | null;
  id: string;
}): string {
  return (
    (p.full_name && p.full_name.trim()) ||
    (p.display_name && p.display_name.trim()) ||
    (p.email && p.email.trim()) ||
    p.id.slice(0, 8)
  );
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  jurisdiction_overrides: string[] | null;
  workspace_role: string | null;
  verifier_status: string | null;
  org_id: string | null;
}

export default async function CommunityPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/community");

  // ── Current user profile ──
  const { data: meProfile, error: meErr } = await supabase
    .from("profiles")
    .select(
      "id, full_name, display_name, email, jurisdiction_overrides, workspace_role, verifier_status, org_id"
    )
    .eq("id", user.id)
    .maybeSingle();
  if (meErr) console.warn("community: profile read failed", meErr.message);

  const me = (meProfile as ProfileRow | null) ?? {
    id: user.id,
    full_name: null,
    display_name: null,
    email: user.email ?? null,
    jurisdiction_overrides: null,
    workspace_role: null,
    verifier_status: "none",
    org_id: null,
  };
  const myHome = me.jurisdiction_overrides ?? [];
  const myName = memberDisplayName({ ...me, email: me.email ?? user.email ?? null });

  // ── Canonical regional rooms (seeded public groups) ──
  const { data: roomGroupsRaw, error: roomErr } = await supabase
    .from("community_groups")
    .select("id, name, slug, region, privacy, member_count")
    .in("slug", CANONICAL_ROOM_SLUGS as string[]);
  if (roomErr) console.warn("community: room groups read failed", roomErr.message);

  const groupBySlug = new Map<string, { id: string; name: string; member_count: number }>();
  for (const g of (roomGroupsRaw ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    member_count: number | null;
  }>) {
    groupBySlug.set(g.slug, { id: g.id, name: g.name, member_count: g.member_count ?? 0 });
  }
  const roomGroupIds = Array.from(groupBySlug.values()).map((g) => g.id);
  const seeded = roomGroupIds.length > 0;

  // ── Member-created vertical groups (cross-regional; vertical IS NOT NULL) ──
  const { data: verticalGroupsRaw, error: vgErr } = await supabase
    .from("community_groups")
    .select("id, name, slug, vertical, description, member_count, owner_user_id")
    .not("vertical", "is", null)
    .order("last_active_at", { ascending: false })
    .limit(60);
  if (vgErr) console.warn("community: vertical groups read failed", vgErr.message);
  const verticalLabelById = new Map(VERTICALS.map((v) => [v.id, v.label]));
  const verticalGroups = ((verticalGroupsRaw ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    vertical: string | null;
    description: string | null;
    member_count: number | null;
    owner_user_id: string | null;
  }>).map((g) => ({
    id: g.id,
    slug: g.slug,
    name: g.name,
    vertical: g.vertical ?? "",
    verticalLabel: verticalLabelById.get(g.vertical ?? "") ?? (g.vertical ?? ""),
    description: g.description,
    memberCount: g.member_count ?? 0,
    youOwn: g.owner_user_id === user.id,
  }));
  const verticalOptions = VERTICALS.map((v) => ({ id: v.id, label: v.label }));

  // ── Parallel reads: verified ledger, memberships, room threads, roster, pickups ──
  const [
    listings,
    membershipsRes,
    postsRes,
    rosterRes,
    pickupsRes,
  ] = await Promise.all([
    getListingsOnly(),
    supabase
      .from("community_group_members")
      .select("group_id")
      .eq("user_id", user.id),
    seeded
      ? supabase
          .from("community_posts")
          .select(
            "id, group_id, title, body, reply_count, created_at, last_reply_at, author_user_id, referenced_intelligence_item_ids, signed_off_at, signed_off_by"
          )
          .in("group_id", roomGroupIds)
          .is("parent_post_id", null)
          .order("last_reply_at", { ascending: false, nullsFirst: false })
          .limit(60)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    me.org_id
      ? supabase
          .from("profiles")
          .select(
            "id, full_name, display_name, email, jurisdiction_overrides, workspace_role, verifier_status, org_id"
          )
          .eq("org_id", me.org_id)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    // Admin-pickups pending count — mirrors CommunityPickupsQueueView heuristic
    // (top-level, unpromoted, reply_count>=3, within 30 days).
    supabase
      .from("community_posts")
      .select("id", { count: "exact", head: true })
      .is("parent_post_id", null)
      .is("promoted_at", null)
      .gte("reply_count", 3)
      .gte("created_at", thirtyDaysAgoIso()),
  ]);

  const resources = (listings.resources ?? []) as Resource[];

  const joinedGroupIds = new Set(
    ((membershipsRes.data ?? []) as Array<{ group_id: string }>).map((m) => m.group_id)
  );

  // ── Threads per room group ──
  const postRows = (postsRes.data ?? []) as Array<{
    id: string;
    group_id: string;
    title: string | null;
    body: string;
    reply_count: number;
    created_at: string;
    last_reply_at: string | null;
    author_user_id: string | null;
    referenced_intelligence_item_ids: string[] | null;
    signed_off_at: string | null;
    signed_off_by: string | null;
  }>;

  // ── Sign-off requests for these posts (migration 153) ──
  // RLS (signoff_select) returns the caller's OWN requests plus, for an active
  // verifier / platform admin, ALL requests — exactly what the thread badges
  // and the rail decide-queue need. signed_off_at on the post itself is
  // group-readable, so the citable/verified chip renders for everyone; the
  // request rows drive the pending/declined markers and the verifier queue.
  const postIds = postRows.map((p) => p.id);
  const signoffRows =
    seeded && postIds.length > 0
      ? (((
          await supabase
            .from("community_post_signoff_requests")
            .select(
              "id, post_id, requested_by, status, verifier_id, primary_doc_url, created_at, decided_at"
            )
            .in("post_id", postIds)
        ).data ?? []) as Array<{
          id: string;
          post_id: string;
          requested_by: string;
          status: string;
          verifier_id: string | null;
          primary_doc_url: string | null;
          created_at: string;
          decided_at: string | null;
        }>)
      : [];

  // Choose the most relevant request per post: a still-open (pending) request
  // wins; otherwise the most recently created decided one.
  const signoffByPost = new Map<string, (typeof signoffRows)[number]>();
  for (const s of signoffRows) {
    const cur = signoffByPost.get(s.post_id);
    if (!cur) {
      signoffByPost.set(s.post_id, s);
      continue;
    }
    const sPending = s.status === "pending";
    const curPending = cur.status === "pending";
    let better = false;
    if (sPending && !curPending) better = true;
    else if (sPending === curPending && s.created_at > cur.created_at) better = true;
    if (better) signoffByPost.set(s.post_id, s);
  }

  const requesterIds = signoffRows.map((s) => s.requested_by).filter(Boolean);
  const authorIds = Array.from(
    new Set(
      [
        ...postRows.map((p) => p.author_user_id),
        ...requesterIds,
      ].filter((id): id is string => Boolean(id))
    )
  );
  const authorMap = new Map<string, ProfileRow>();
  if (authorIds.length > 0) {
    const { data: authorRows } = await supabase
      .from("profiles")
      .select(
        "id, full_name, display_name, email, jurisdiction_overrides, workspace_role, verifier_status, org_id"
      )
      .in("id", authorIds);
    for (const row of (authorRows ?? []) as ProfileRow[]) authorMap.set(row.id, row);
  }

  const threadsByGroup = new Map<string, ThreadVM[]>();
  for (const p of postRows) {
    const author = p.author_user_id ? authorMap.get(p.author_user_id) ?? null : null;
    const isYou = p.author_user_id === user.id;
    const authorName = isYou
      ? myName
      : author
        ? memberDisplayName(author)
        : "Former member";
    const isOwner = (isYou ? me.workspace_role : author?.workspace_role) === "owner";
    const req = signoffByPost.get(p.id) ?? null;
    const signoff = req
      ? {
          requestId: req.id,
          status: req.status as "pending" | "signed_off" | "declined" | "withdrawn",
          isMine: req.requested_by === user.id,
          requesterName:
            req.requested_by === user.id
              ? myName
              : (() => {
                  const rp = authorMap.get(req.requested_by);
                  return rp ? memberDisplayName(rp) : "A member";
                })(),
        }
      : null;
    const vm: ThreadVM = {
      id: p.id,
      groupId: p.group_id,
      title: p.title ?? p.body.slice(0, 120),
      body: p.body,
      replyCount: p.reply_count ?? 0,
      createdAt: p.created_at,
      referencedItemIds: p.referenced_intelligence_item_ids ?? [],
      authorName,
      isYou,
      isOwner,
      signedOff: Boolean(p.signed_off_at),
      signedOffAt: p.signed_off_at,
      signoff,
    };
    const list = threadsByGroup.get(p.group_id) ?? [];
    list.push(vm);
    threadsByGroup.set(p.group_id, list);
  }

  // ── Roster (workspace network, for "Who's here" presence) ──
  const rosterRows = (rosterRes.data ?? []) as ProfileRow[];
  const rosterPool: ProfileRow[] =
    rosterRows.length > 0 ? rosterRows : [{ ...me, email: me.email ?? user.email ?? null }];
  // Ensure self is present exactly once.
  if (!rosterPool.some((r) => r.id === user.id)) {
    rosterPool.push({ ...me, email: me.email ?? user.email ?? null });
  }
  const networkMemberCount = new Set(rosterPool.map((r) => r.id)).size;

  // ── Assemble per-room view models ──
  const rooms: RoomVM[] = [];
  for (const def of ROOMS) {
    const group = groupBySlug.get(def.slug);
    // Classify verified ledger items into this room.
    const inRoom = resources.filter((r) => roomForResource(r) === def.key);
    inRoom.sort(
      (a, b) => (PRIO_RANK[a.priority] ?? 3) - (PRIO_RANK[b.priority] ?? 3)
    );
    const liveItems = inRoom.slice(0, 2).map((r) => {
      const label = r.domain ? SURFACE_LABEL[r.domain] ?? "Ledger" : "Ledger";
      const juris = r.jurisdiction ? titleCase(r.jurisdiction) : def.short;
      const sev = (r.severity || r.priority || "").toString().toLowerCase();
      return {
        id: r.id,
        title: r.title,
        meta: `${label} · ${juris}${sev ? ` · ${sev}` : ""}`,
        href: itemHref(r),
      };
    });
    // Themes derived from real topic tags (no invented data; omit when none).
    const themeCounts = new Map<string, number>();
    for (const r of inRoom) {
      const t = (r.topic || r.theme || "").toString().trim();
      if (t) themeCounts.set(t, (themeCounts.get(t) ?? 0) + 1);
    }
    const themes = Array.from(themeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => titleCase(t));

    const tone = toneForPriority(inRoom[0]?.priority);
    const threads = group ? threadsByGroup.get(group.id) ?? [] : [];

    // Presence roster for this room (home jurisdictions ∩ room).
    const present: RosterMemberVM[] = rosterPool
      .filter((p) => homeJurisdictionsInRoom(p.jurisdiction_overrides, def.key))
      .map((p) => ({
        name: p.id === user.id ? myName : memberDisplayName(p),
        isYou: p.id === user.id,
        isOwner: p.workspace_role === "owner",
      }));

    rooms.push({
      key: def.key,
      name: def.name,
      short: def.short,
      groupId: group?.id ?? null,
      joined: group ? joinedGroupIds.has(group.id) : false,
      youHere: homeJurisdictionsInRoom(myHome, def.key),
      itemCount: inRoom.length,
      itemCountKnown: resources.length > 0 || !listings._error,
      hue: tone,
      themes,
      liveItems,
      threads,
      roster: present,
    });
  }

  const totalItems = rooms.reduce((sum, r) => sum + r.itemCount, 0);

  const boldInk = { fontWeight: 800, color: "var(--color-text-primary)" } as const;
  const meta = (
    <span>
      Regional rooms — what&rsquo;s live in each region, who&rsquo;s there, and the discussions
      that explain what the ledger can&rsquo;t print yet.{" "}
      {seeded ? (
        <>
          <span style={boldInk}>{totalItems}</span> active items across{" "}
          <span style={boldInk}>{rooms.length}</span> rooms
        </>
      ) : (
        <>Peer posts are unverified by design; a verifier&rsquo;s sign-off makes them citable.</>
      )}
    </span>
  );

  return (
    <>
      <SystemErrorBanner message={listings._error} />
      <EditorialMasthead title="Community" meta={meta} />
      <CommunityRooms
        rooms={rooms}
        seeded={seeded}
        currentUserId={user.id}
        currentUserName={myName}
        currentUserIsOwner={me.workspace_role === "owner"}
        currentUserIsVerifier={me.verifier_status === "active"}
        verifierStatus={me.verifier_status ?? "none"}
        networkMemberCount={networkMemberCount}
        pendingPickups={pickupsRes.count ?? 0}
        verticalGroups={verticalGroups}
        verticalOptions={verticalOptions}
      />
    </>
  );
}
