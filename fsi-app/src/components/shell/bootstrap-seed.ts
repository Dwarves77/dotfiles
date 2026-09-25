// Pure composition + once-only-apply logic behind BootstrapBoundary.tsx / AuthProvider.tsx
// (PERF-4, 2026-09-03, docs/audits/perf-load-times-2026-09-03.md dispatch item (1): "DOCUMENT loads
// still block first paint on `await resolveServerBootstrap()`"). Kept import-free — no react, no
// next/*, no @supabase/* — so it is plain `node --test`-able, the same "pure core, real wiring in the
// .tsx/.ts sibling" split this repo already uses for load-detail-core.ts and
// regulation-obligations-core.ts (see each module's own header for the rationale: `node --test` cannot
// resolve a bare `next/*` value import outside Next's bundler).
//
// WHY THIS EXISTS: src/app/layout.tsx used to `await resolveServerBootstrap()` (a real Supabase round
// trip: auth.getUser + org_memberships + profiles + workspace_settings) BEFORE returning any JSX — a
// plain synchronous block on RootLayout's own render that blocked the RSC stream and every route's own
// `loading.tsx` on every DOCUMENT (cold/hard-reload/first-visit) load. PERF-3 (2026-09-03) already
// stopped AWAITING it on client-side (RSC) navigations; this lane stops awaiting it on document loads
// too: the layout now creates the promise and returns the shell immediately, and BootstrapBoundary.tsx
// (a small client component sitting OUTSIDE the shell's own render path — see its own header) is the
// only thing that actually blocks on it, via React's `use()`, inside its own `<Suspense fallback={null}>`.
// Once the promise resolves, BootstrapBoundary calls AuthProvider's seed callback exactly once — this
// module is that "exactly once, compose the right shape" logic, extracted so it's provable without a
// browser.

/** Structural echo of ServerBootstrap (src/lib/api/server-bootstrap.ts) — restated here, not imported,
 *  so this file has zero runtime dependency on that module (which itself value-imports
 *  supabase-server-client.ts → @supabase/ssr → eventually next/headers). Only the fields this module's
 *  logic actually touches. */
export interface BootstrapLike {
  user: { id: string; email?: string | null } | null;
  orgId: string | null;
  orgName: string;
  role: "owner" | "admin" | "member" | "viewer" | null;
  sectors: string[];
  workspaceSectors: string[];
  /**
   * `profiles.is_platform_admin` for THIS user (lane AUTH-IDENTITY, 2026-09-24). The same column, read
   * by the same predicate (src/lib/auth/platform-admin-gate.ts), that `requirePlatformAdmin()` admits
   * `/admin` on, so the nav's Admin row and the route gate cannot disagree. Optional only so an older
   * cached response shape degrades to "not an admin", never to a thrown read.
   */
  isPlatformAdmin?: boolean;
}

/**
 * Where the identity lookup stands (lane AUTH-IDENTITY, 2026-09-24).
 *   - `pending`  : no answer yet (first fetch in flight, or a retry in flight after a failure).
 *   - `resolved` : the identity route answered 200 with a bootstrap. `orgId` is then a real fact.
 *   - `error`    : every attempt of the current round failed. `orgId` is UNKNOWN, not "none".
 *
 * THE DEFECT THIS CLOSES [CONFIRMED by SELECT + code read, 2026-09-24]: a failed fetch used to call
 * `resolveAuthSeed(null)`, which returned `orgId: null`, the RESOLVED-no-org value of the three-valued
 * orgId from the 2026-09-04 PERF-MERGE fix. So "the lookup failed" and "this user has no workspace"
 * were one state; the "No workspace yet" banner rendered and the Admin row hid for an owner whose rows
 * were correct throughout, and the state stuck for the tab's life (one fetch, no retry).
 */
export type IdentityStatus = "pending" | "resolved" | "error";

/** What AuthProvider's seed() applies to its context + the workspace store. */
export interface AuthSeed {
  /** Never `pending`: a seed is an ANSWER (a bootstrap, or the failure of a whole attempt round). */
  status: Exclude<IdentityStatus, "pending">;
  user: BootstrapLike["user"];
  /**
   * Three-valued exactly as AuthProvider's context documents: `string` = resolved org, `null` =
   * resolved AND the viewer is a known user with no org, `undefined` = unknown. A failed lookup is
   * `undefined` (unknown), and so is an anonymous answer: "has no workspace" is a statement about a
   * known user, so it is never made about nobody.
   */
  orgId: string | null | undefined;
  orgName: string;
  role: BootstrapLike["role"];
  sectors: string[];
  isPlatformAdmin: boolean;
}

/**
 * The seed for a lookup that produced NO bootstrap (network failure, non-200, unparseable body). It
 * carries `status: "error"` and `orgId: undefined`; it can never be mistaken for a resolved answer.
 */
export const IDENTITY_ERROR_SEED: AuthSeed = Object.freeze({
  status: "error",
  user: null,
  orgId: undefined,
  orgName: "",
  role: null,
  sectors: [],
  isPlatformAdmin: false,
}) as AuthSeed;

/**
 * Composes the identity route's answer into the shape AuthProvider's context needs.
 *
 * `null` means NO bootstrap was obtained (the fetch failed): it returns IDENTITY_ERROR_SEED, never the
 * resolved-no-org shape (lane AUTH-IDENTITY; see IdentityStatus for the defect). A signed-out viewer is
 * NOT `null`: the route answers 200 with `{ user: null, ... }`, which resolves to `status: "resolved"`.
 *
 * Sector composition rule UNCHANGED from the pre-PERF-4 layout.tsx (Section 6.8, lane HYG-2 fix,
 * 2026-09-02): a per-user override (`bootstrap.sectors`, from `profiles.sector_overrides`) wins when
 * non-empty; otherwise the workspace default (`bootstrap.workspaceSectors`, from
 * `workspace_settings.sector_profile`). Moving where this composition runs (from layout.tsx's JSX
 * expression into this pure function) must not change its result — see this module's test file for the
 * HYG-2 regression case this guards.
 */
export function resolveAuthSeed(bootstrap: BootstrapLike | null): AuthSeed {
  if (!bootstrap) return IDENTITY_ERROR_SEED;
  return {
    status: "resolved",
    user: bootstrap.user,
    orgId: bootstrap.user ? bootstrap.orgId : undefined,
    orgName: bootstrap.orgName,
    role: bootstrap.role,
    sectors: bootstrap.sectors.length > 0 ? bootstrap.sectors : bootstrap.workspaceSectors,
    isPlatformAdmin: !!bootstrap.user && bootstrap.isPlatformAdmin === true,
  };
}

/**
 * Seed guard, keyed on where the lookup stands rather than a once-only boolean (lane AUTH-IDENTITY).
 * A RESOLVED seed is final for the tab: nothing later (a stray retry result, an error from a re-armed
 * round) may overwrite a real answer. Before that, any answer applies: a first answer over `pending`,
 * and a later SUCCESS over an earlier `error` (that is what makes a retry able to recover the tab,
 * which the old once-only guard would have refused).
 */
export function shouldApplySeed(current: IdentityStatus, _incoming: AuthSeed["status"]): boolean {
  return current !== "resolved";
}

/**
 * What a surface may SAY when it has no workspace name to show (lane AUTH-IDENTITY). Only a resolved
 * lookup may assert absence; a failed one says the workspace is unavailable, a pending one says it is
 * loading. `resolvedNoOrg` is the caller's own wording for the true "no workspace" case.
 */
export function noWorkspaceLabel(status: IdentityStatus, resolvedNoOrg: string): string {
  if (status === "resolved") return resolvedNoOrg;
  if (status === "error") return "Workspace unavailable";
  return "Loading workspace";
}

/** The nav's Admin row: shown exactly when `/admin`'s gate (requirePlatformAdmin) would admit. */
export function shouldShowAdminNav(params: { status: IdentityStatus; isPlatformAdmin: boolean }): boolean {
  return params.status === "resolved" && params.isPlatformAdmin === true;
}

/**
 * Bounded retry schedule (lane AUTH-IDENTITY): 3 attempts per round, the first immediate, then after
 * these delays. After the round is exhausted the provider re-arms ONE new round on window focus or on
 * the tab becoming visible. No other timer and no polling.
 */
export const IDENTITY_RETRY_DELAYS_MS: readonly number[] = Object.freeze([600, 1800]);
export const IDENTITY_ATTEMPTS_PER_ROUND = IDENTITY_RETRY_DELAYS_MS.length + 1;

/** Delay before the next attempt after `attemptsMade` failures in this round, or null when exhausted. */
export function nextIdentityRetryDelay(attemptsMade: number): number | null {
  if (attemptsMade < 1 || attemptsMade >= IDENTITY_ATTEMPTS_PER_ROUND) return null;
  return IDENTITY_RETRY_DELAYS_MS[attemptsMade - 1];
}
