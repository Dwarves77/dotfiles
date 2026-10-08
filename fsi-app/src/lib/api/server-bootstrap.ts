import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { readOwnPlatformAdmin } from "@/lib/auth/platform-admin-gate";
import { ensureProfile } from "@/lib/auth/provision-personal-workspace";

/**
 * Server-side auth + workspace bootstrap.
 *
 * Resolves the current user, their org membership (orgId, orgName, role),
 * and their per-user sector overrides in ONE pass, request-scoped via
 * React's cache(). Used by the root layout to seed AuthProvider with
 * initial state — eliminates the 2 client-side queries AuthProvider
 * was firing on every page mount (auth.getUser + org_memberships +
 * profiles.sector_overrides).
 *
 * Why cache(): React's cache() is request-scoped — the same call from
 * multiple server components within one request shares the result. So
 * the root layout, /admin role gate, /settings auth check, and any
 * future caller all hit GoTrue once per request instead of N times.
 *
 * Returns a stable empty shape for anonymous users so callers don't
 * need to null-guard every field. The AuthProvider treats orgId=null
 * as "no workspace" — same as the prior anonymous fallback.
 *
 * Migrated 2026-05-15 (migration 075 Phase 2): reads sector overrides
 * from `profiles.sector_overrides` instead of `user_profiles.sectors`.
 * Also surfaces the workspace-level sector_profile from workspace_settings
 * so callers can compose the two layers (per Section 6.8). Dual-write
 * triggers in the DB keep user_profiles in sync until Phase 3 drops it.
 *
 * PERF-7 (2026-09-04, docs/audits/perf-load-times-2026-09-03.md §13, same defect class as PERF-2's
 * proxy.ts / PERF-6's org.ts+auth.ts): this used to call `supabase.auth.getUser()`, a network round
 * trip to Supabase Auth's server on every resolution — the cold document-load cost PERF-6 identified
 * this file as paying (docs/audits/perf-load-times-2026-09-03.md §10, evidence item 1).
 * `getClaims()` verifies the session JWT locally against the project's cached JWKS instead (see
 * proxy.ts's header for the JSDoc citation and the symmetric-secret-fallback caveat, which applies
 * identically here). `user` narrowed from the full Supabase `User` to `{ id, email }`: grepped every
 * consumer of `resolveServerBootstrap().user` across fsi-app/src (bootstrap-seed.ts's independent
 * `BootstrapLike.user: { id: string } | null` structural echo, onboarding/page.tsx, workspace/new/
 * page.tsx, and the userId-only reads in market/operations/regulations/research `[slug]/page.tsx`) —
 * `.id` and `.email` are the only fields ever read off it, both required/optional exactly as before
 * (`id` was always required on `User`; `email` was always optional). Both are carried directly on
 * `claims` — `sub` is a required, non-optional string claim and `email` is present on the standard
 * claim set (verified against node_modules/@supabase/auth-js's installed JwtPayload type) — so no
 * caller needed a getUser() fallback for a field getClaims() doesn't carry.
 */
export interface ServerBootstrapUser {
  id: string;
  email: string | null;
}

export interface ServerBootstrap {
  user: ServerBootstrapUser | null;
  orgId: string | null;
  orgName: string;
  role: "owner" | "admin" | "member" | "viewer" | null;
  /**
   * Per-user sector overrides (from profiles.sector_overrides). Empty
   * means "use workspace defaults."
   */
  sectors: string[];
  /**
   * Workspace-level sector profile (from workspace_settings.sector_profile).
   * The composition layer (per-user override > workspace default) is
   * downstream Section 6.8 work; this field is provided so the consumer
   * can produce that composition without an additional query.
   */
  workspaceSectors: string[];
  /**
   * `profiles.is_platform_admin` for THIS user, read through the same rpc `/admin`'s gate uses
   * (src/lib/auth/platform-admin-gate.ts readOwnPlatformAdmin; the column itself is revoked, migration 375). The nav shows Admin on this bit, never on the workspace role
   * (lane AUTH-IDENTITY, 2026-09-24).
   */
  isPlatformAdmin: boolean;
}

const EMPTY: ServerBootstrap = {
  user: null,
  orgId: null,
  orgName: "",
  role: null,
  sectors: [],
  workspaceSectors: [],
  isPlatformAdmin: false,
};

/**
 * The lookup could not produce an answer (lane AUTH-IDENTITY, 2026-09-24). Thrown instead of returning a
 * shape, because every shape this module returns is a FACT a consumer acts on: `orgId: null` means "this
 * user has no workspace" to AppShell's banner and to /onboarding's redirect. Before this, a failed
 * org_memberships read returned `orgId: null` (data was simply `null`, the error was never read), which is
 * the same false "no workspace" the client-side defect produced. The identity route answers 503 for it and
 * the client retries; `resolveServerBootstrap()` rethrows it so a server page renders its error boundary
 * instead of redirecting a real member into "create a workspace".
 */
export class IdentityLookupError extends Error {
  constructor(step: string, cause: unknown) {
    const detail =
      cause && typeof cause === "object" && "message" in cause
        ? String((cause as { message: unknown }).message)
        : String(cause);
    super(`identity lookup failed at ${step}: ${detail}`);
    this.name = "IdentityLookupError";
  }
}

/** auth-js marks network and 5xx failures with this name (errors.js, isAuthRetryableFetchError). */
function isTransientAuthError(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { name?: unknown }).name === "AuthRetryableFetchError";
}

/**
 * Pure core of resolveServerBootstrap: given an already-authenticated Supabase client, resolve the
 * bootstrap. Split out (same shape as org.ts's resolveOrgIdFromAuthenticatedClient) so it can be unit
 * tested with a mocked client — the wrapper below value-imports next/headers (via
 * createSupabaseServerClient) and so cannot be loaded outside Next's bundler; this function has no such
 * dependency. Exported for server-bootstrap.npmtest.mjs.
 */
export async function resolveServerBootstrapFromClient(
  supabase: SupabaseClient,
  /**
   * Lane AUTH-2 self-heal, opt-in so a test or caller without service credentials never writes: when
   * given, it is called once for a signed-in user whose profiles row is missing (confirmation completed
   * in another browser, so /auth/callback never ran). It creates the profile only, never an
   * organisation. Production callers pass it through resolveServerBootstrapWithHeal.
   */
  healProfile?: (userId: string, email: string | null) => Promise<{ exists: boolean }>
): Promise<ServerBootstrap> {
  const { data, error } = await supabase.auth.getClaims();
  // A transient auth failure (network, 5xx) is NOT "signed out": answering anonymous here let the
  // browser's own session (onAuthStateChange) pair a signed-in user with a no-org answer. Every other
  // auth error (no session, expired or invalid JWT) is a real anonymous answer, unchanged.
  if (error && isTransientAuthError(error)) throw new IdentityLookupError("getClaims", error);
  if (error || !data?.claims?.sub) return EMPTY;
  const user: ServerBootstrapUser = { id: data.claims.sub, email: data.claims.email ?? null };

  // Auth-bootstrap fix (2026-09-06, docs/audits/perf-load-times-2026-09-03.md §10: operator-measured
  // ~1.9s auth/session bootstrap, the primary shell-load bottleneck). ROOT CAUSE [CONFIRMED] by
  // reading: this used to be THREE round trips to Postgres in strict sequence — getClaims (local JWT
  // verify, not a network round trip per PERF-7's own note above), then `Promise.all([org_memberships,
  // profiles])`, then a THIRD, separately-awaited `workspace_settings` query gated on `orgId` from the
  // second step. That third hop cannot be started until the second resolves, so the client-visible
  // path was a chain of 2 sequential network round trips after getClaims, each one paying full
  // request/response latency on top of the browser's own outer fetch to this Route Handler (PERF-10)
  // — exactly the shape a ~1.9s "auth bootstrap" bottleneck takes.
  // FIX AT THE CAUSE: `workspace_settings` is pulled into the SAME `org_memberships` query via
  // PostgREST's nested-embed syntax (workspace_settings.org_id -> organizations.id is a real FK,
  // migration 006) — one round trip resolves org, role, org name, AND the workspace's sector profile
  // together, run in parallel with the (unrelated) `profiles` lookup. Down from 3 sequential DB
  // round trips to 1 parallel batch of 2. `workspace_settings` has no UNIQUE(org_id) constraint, so
  // PostgREST treats the embed as to-many and returns an array — this org has always resolved at most
  // one settings row in practice (one row inserted per org, migration 006), so `[0]` is taken exactly
  // as `.maybeSingle()` did for the old direct query, with no behavior change for a caller.
  // SEC-6 (migration 375): profiles.is_platform_admin is revoked from authenticated, so the nav's platform-admin
  // bit is the answer of rpc("is_platform_admin"), a third parallel read, never a column of the profiles select.
  const [membershipRes, profileRes, adminRes] = await Promise.all([
    supabase
      .from("org_memberships")
      .select("org_id, role, organizations(id, name, workspace_settings(sector_profile))")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("sector_overrides")
      .eq("id", user.id)
      .maybeSingle(),
    readOwnPlatformAdmin(supabase),
  ]);

  // Lane AUTH-IDENTITY: read the errors. A failed read is not an empty row (CLAUDE.md, agent/run
  // error-swallow post-mortem: a `data` destructure without `error` is the bug shape).
  if (membershipRes.error) throw new IdentityLookupError("org_memberships", membershipRes.error);
  if (profileRes.error) throw new IdentityLookupError("profiles", profileRes.error);
  if (adminRes.error) throw new IdentityLookupError("is_platform_admin", adminRes.error);

  const membership = membershipRes.data;
  const org =
    (membership?.organizations as
      | { id?: string; name?: string; workspace_settings?: { sector_profile: string[] | null }[] | null }
      | null) || null;
  let profile = profileRes.data as { sector_overrides: string[] | null } | null;
  if (!profile && healProfile) {
    // A heal failure is already logged and counted inside ensureProfile; it must not turn a page load
    // into an error, so it never throws here and the answer below stays the pre-heal shape.
    try {
      const healed = await healProfile(user.id, user.email);
      if (healed.exists) profile = { sector_overrides: [] };
    } catch (e) {
      console.warn("[server-bootstrap] profile heal threw:", e instanceof Error ? e.message : String(e));
    }
  }
  const sectors = profile?.sector_overrides ?? [];

  const orgId = org?.id || membership?.org_id || null;
  const workspaceSectors = org?.workspace_settings?.[0]?.sector_profile ?? [];

  return {
    user,
    orgId,
    orgName: org?.name || "",
    role: (membership?.role as ServerBootstrap["role"]) || null,
    sectors,
    workspaceSectors,
    isPlatformAdmin: adminRes.admin,
  };
}

/** The production resolution: the pure core plus the AUTH-2 profile self-heal (service-role insert). */
export function resolveServerBootstrapWithHeal(supabase: SupabaseClient): Promise<ServerBootstrap> {
  return resolveServerBootstrapFromClient(supabase, (userId, email) => ensureProfile(userId, email));
}

export const resolveServerBootstrap = cache(
  async (): Promise<ServerBootstrap> => {
    try {
      const supabase = await createSupabaseServerClient();
      return await resolveServerBootstrapWithHeal(supabase);
    } catch (e) {
      // A failed lookup must reach the page's error boundary, never read as anonymous/no-org (see
      // IdentityLookupError). Anything else (e.g. no request scope) keeps the soft EMPTY fallback.
      if (e instanceof IdentityLookupError) throw e;
      return EMPTY;
    }
  }
);
