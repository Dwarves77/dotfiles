export const NOTE_MAX_LENGTH = 4000;
export const MAX_ASSIGNEES_PER_REQUEST = 25;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const WRITE_ROLES = new Set(["owner", "admin", "member"]);
const ADMIN_ROLES = new Set(["owner", "admin"]);

/** A viewer reads; owner, admin and member also write. */
export function canWrite(role) {
  return WRITE_ROLES.has(role);
}

/** Owner or admin. */
export function isOrgAdmin(role) {
  return ADMIN_ROLES.has(role);
}

export function ok(status, body) {
  return { status, body };
}

export function fail(status, error) {
  return { status, body: { error } };
}

/** Same resolution order as /api/workspace/members: full name, display name, email, truncated id. */
export function displayNameOf(user, userId) {
  return user?.full_name ?? user?.display_name ?? user?.email ?? `${String(userId).slice(0, 8)}...`;
}

/**
 * The caller's org roster, one read. Used for author and assignee names and for the assignee picker, so a note
 * list or an assignment list is two reads in total. Org-scoped; bounded by PostgREST's own row cap.
 * @returns {Promise<{ members: Array<{user_id:string, role:string, display_name:string}>, error: string|null }>}
 */
export async function loadRoster(supabase, orgId) {
  const { data, error } = await supabase
    .from("org_memberships")
    .select("user_id, role, created_at, user:profiles!user_id(full_name, display_name, email)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) return { members: [], error: error.message };
  const members = (data || []).map((r) => ({
    user_id: r.user_id,
    role: r.role,
    display_name: displayNameOf(r.user, r.user_id),
  }));
  return { members, error: null };
}

/** user_id -> display name lookup over a roster. A user no longer in the org resolves to null. */
export function nameIndex(members) {
  const index = new Map();
  for (const m of members) index.set(m.user_id, m.display_name);
  return index;
}

const DETAIL_PATH_RE = /^\/(?:regulations|market|operations|research)\/([^/]+)\/?$/;

/**
 * The item id a detail page addresses, read from its own pathname (the four detail routes are
 * /<surface>/<legacy_id or uuid>, the same id the notes and assignments routes resolve). The shell mounts the
 * notes and assignment blocks from this, so the four surfaces pass nothing new. Returns null on any other path.
 */
export function itemIdFromDetailPath(pathname) {
  if (typeof pathname !== "string") return null;
  const m = DETAIL_PATH_RE.exec(pathname);
  if (!m) return null;
  try {
    const id = decodeURIComponent(m[1]);
    return id || null;
  } catch {
    return null;
  }
}
