/**
 * api-client.ts — typed fetch wrappers for COMMUNITY-A's guard-enforced Community API contract
 * (docs/plans/wave3-lanes-2026-09-03.md, "Interface contract with COMMUNITY-B"). COMMUNITY-A owns
 * `src/lib/community/**` and `src/app/api/community/**`; this lane (COMMUNITY-B, "the surface")
 * consumes that contract only through the shapes below, never by importing A's server modules.
 *
 * Every function is a pure fetch wrapper: no module-scope side effects (F34 — no filesystem/network
 * call at module scope under src/**), safe to import from a client OR server component. Each accepts
 * an optional `fetchImpl` so tests can inject a stub instead of touching the network — the `fixtures`
 * export below is the canned data those stubs return, and it doubles as the shape reference for the
 * REAL-component UX smoke spec `.discipline/rendering/smoke/community-smoke.mjs` (mounts PostList
 * and Post against fixture data shaped from this same contract).
 *
 * A's routes did not exist in this worktree at write time (sibling lane, separate worktree) — these
 * wrappers are built strictly from the contract text in the wave3 plan, never from reading A's code.
 * Where the contract was silent, the gap is named at the call site with [INFERRED].
 */

import { validateEntityIds } from "../../lib/community/entity-binding.mjs";

// ── POST /api/community/posts ────────────────────────────────────────────────────────────────

interface CreatePostInput {
  group_id: string;
  title?: string;
  body: string;
  /** Every thread binds to at least one spine entity (spec 05 §5 component 2, acceptance 6). */
  entity_ids: string[];
  /** Named commercially-sensitive field this post asserts a value for, if any (k-anonymity /
   * dominance / lag guard target — spec 05 §1). Omitted for posts that carry no sensitive figure. */
  sensitivity_field?: string;
  /** R8.7 (spec 07 Community, 2026-09-25, migration 336): per-post anonymity override. Omitted lets
   * the route fall back to the author's own community_member_profiles.default_anonymous. */
  anonymous?: boolean;
}

interface CreatePostSuccess {
  ok: true;
  post: Record<string, unknown>;
}

interface CreatePostFailure {
  ok: false;
  /** 0 when the request never reached the network (local validation failure, e.g. no entity bound,
   * or a network error) — real HTTP status otherwise. */
  status: number;
  error: string;
}

type CreatePostResult = CreatePostSuccess | CreatePostFailure;

/**
 * POST /api/community/posts. Refuses client-side (status 0) before the network round-trip when no
 * entity is bound — acceptance criterion 6 ("every thread binds to at least one spine entity") is
 * enforced at the UI boundary too, not only server-side, so the composer never sends a request the
 * guard is certain to reject on that ground.
 */
export async function createCommunityPost(
  input: CreatePostInput,
  fetchImpl: typeof fetch = fetch
): Promise<CreatePostResult> {
  const entityCheck = validateEntityIds(input.entity_ids);
  if (!entityCheck.ok) {
    return { ok: false, status: 0, error: entityCheck.error };
  }

  let res: Response;
  try {
    res = await fetchImpl("/api/community/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "Network error",
    };
  }

  const json = await safeJson<{
    post?: Record<string, unknown>;
    error?: string;
  }>(res);

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: json?.error || `Could not post (${res.status})`,
    };
  }

  return { ok: true, post: json?.post ?? {} };
}

// ── GET /api/community/entities/[entityId]/threads ───────────────────────────────────────────

/** Author identity projection (spec 05 section 2, section 5 component 1/11; amended by R8.7, 2026-09-25, migration
 * 336): org type + role + sector + region + verified, PLUS name/company shown by default and withheld
 * only when `anonymous` is true (see identity.mjs projectAuthorIdentity's own header). The wave3
 * contract's entity-threads response shape (as written) carries `author_user_id` rather than this
 * projection, [INFERRED] this field is optional here so a caller degrades gracefully (renders
 * nothing identity-shaped) until the projection is threaded through, rather than ever rendering the
 * raw user id as a stand-in identity. See AuthorIdentityChip.tsx. */
export interface AuthorIdentityProjection {
  orgType?: string | null;
  role?: string | null;
  sector?: string | null;
  region?: string | null;
  verified?: boolean;
  name?: string | null;
  company?: string | null;
  anonymous?: boolean;
}

export interface EntityThread {
  id: string;
  group_id: string;
  title: string | null;
  body: string;
  author_user_id: string | null;
  created_at: string;
  last_reply_at: string | null;
  reply_count: number;
  entity_id: string;
  entity_kind: string;
  author_identity?: AuthorIdentityProjection | null;
}

interface EntityThreadsResult {
  entity_id: string;
  threads: EntityThread[];
  next_cursor: string | null;
}

export async function getEntityThreads(
  entityId: string,
  opts: { limit?: number; before?: string } = {},
  fetchImpl: typeof fetch = fetch
): Promise<EntityThreadsResult | null> {
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.before) params.set("before", opts.before);
  const qs = params.toString();
  try {
    const res = await fetchImpl(
      `/api/community/entities/${encodeURIComponent(entityId)}/threads${qs ? `?${qs}` : ""}`
    );
    if (!res.ok) return null;
    return (await res.json()) as EntityThreadsResult;
  } catch {
    return null;
  }
}

// ── GET/PUT /api/community/profile, POST /api/community/profile/verify ──────────────────────────
// Self-service verified-pseudonymous identity (spec 05 §2, §5 component 1; lane COMMUNITY-C).

export interface CommunityProfile {
  orgType: string | null;
  role: string | null;
  sector: string | null;
  region: string | null;
  verified: boolean;
  verifiedAt: string | null;
  verificationMethod: string | null;
  /** R8.7 (spec 07 Community, 2026-09-25, migration 336): the member's account-wide default for a new
   * post's anonymity, self-service via PUT (below). Defaults to false (identity shown). */
  defaultAnonymous: boolean;
}

interface ProfileFetchResult {
  ok: true;
  profile: CommunityProfile;
}
interface ProfileFetchFailure {
  ok: false;
  status: number;
  error: string;
}
type ProfileResult = ProfileFetchResult | ProfileFetchFailure;

export async function getOwnProfile(fetchImpl: typeof fetch = fetch): Promise<ProfileResult> {
  let res: Response;
  try {
    res = await fetchImpl("/api/community/profile");
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : "Network error" };
  }
  const json = await safeJson<{ profile?: CommunityProfile; error?: string }>(res);
  if (!res.ok || !json?.profile) {
    return { ok: false, status: res.status, error: json?.error || `Could not load profile (${res.status})` };
  }
  return { ok: true, profile: json.profile };
}

interface UpdateProfileInput {
  org_type: string;
  role?: string | null;
  sector?: string | null;
  region?: string | null;
  /** R8.7 (migration 336): the caller's new account-wide anonymity default. Omitted collapses to
   * false server-side (sanitizeMemberWrite), matching the PUT route's full-replace semantics for
   * every other self-service field. */
  default_anonymous?: boolean;
}

export async function updateOwnProfile(
  input: UpdateProfileInput,
  fetchImpl: typeof fetch = fetch
): Promise<ProfileResult> {
  let res: Response;
  try {
    res = await fetchImpl("/api/community/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : "Network error" };
  }
  const json = await safeJson<{ profile?: CommunityProfile; error?: string }>(res);
  if (!res.ok || !json?.profile) {
    return { ok: false, status: res.status, error: json?.error || `Could not save profile (${res.status})` };
  }
  return { ok: true, profile: json.profile };
}

export async function verifyOwnProfile(fetchImpl: typeof fetch = fetch): Promise<ProfileResult> {
  let res: Response;
  try {
    res = await fetchImpl("/api/community/profile/verify", { method: "POST" });
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : "Network error" };
  }
  const json = await safeJson<{ profile?: CommunityProfile; error?: string }>(res);
  if (!res.ok || !json?.profile) {
    return { ok: false, status: res.status, error: json?.error || `Could not verify (${res.status})` };
  }
  return { ok: true, profile: json.profile };
}

// ── shared ─────────────────────────────────────────────────────────────────────────────────────

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── fixtures ───────────────────────────────────────────────────────────────────────────────────
// Canned data for this lane's own tests and rendering-guard fixtures. NOT live data from A — built
// strictly from the contract shapes above so a fixture-driven render/test never silently drifts
// from what this file believes the contract to be.

export const fixtures = {
  guardRefusal: {
    // The antitrust WRITE-TIME posting guard (evaluateAntitrustGuard, antitrust.mjs). It carries only an
    // error string: ADR-042 removed the benchmark route it used to point at.
    error:
      "This field is commercially sensitive. A single member's individual disclosure of it is never permitted in a post.",
  } satisfies { error: string },

  entityThreads: {
    entity_id: "cl:corridor:7f3a9c21b1044d6e",
    threads: [
      {
        id: "thread-1",
        group_id: "group-1",
        title: "SAF premium creeping up on this lane",
        body: "Seeing a step change on bunker pass-through this quarter.",
        author_user_id: "user-1",
        created_at: "2026-08-01T00:00:00.000Z",
        last_reply_at: "2026-08-20T00:00:00.000Z",
        reply_count: 4,
        entity_id: "cl:corridor:7f3a9c21b1044d6e",
        entity_kind: "corridor",
        author_identity: {
          orgType: "Freight forwarder",
          role: "Trade lane manager",
          sector: "Apparel",
          region: "EU",
          verified: true,
        },
      },
    ] as EntityThread[],
    next_cursor: null,
  } satisfies EntityThreadsResult,

  // ── lane COMMUNITY-C additions (2026-09-03): profile fixtures ────────────────────
  ownProfileUnverified: {
    orgType: null, role: null, sector: null, region: null,
    verified: false, verifiedAt: null, verificationMethod: null, defaultAnonymous: false,
  } satisfies CommunityProfile,

  ownProfileVerified: {
    orgType: "forwarder", role: "Trade lane manager", sector: "cold-chain", region: "EU",
    verified: true, verifiedAt: "2026-08-01T00:00:00.000Z", verificationMethod: "corporate-email",
    defaultAnonymous: false,
  } satisfies CommunityProfile,
};
